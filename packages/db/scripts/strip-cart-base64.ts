/**
 * One-shot migration: extract inline base64 images from cart_items.customization
 * and replace them with /api/files/... URLs.
 *
 * The Fabric customizer historically embedded user-uploaded photos as
 * `data:image/...;base64,...` inside the canvas JSON, ballooning some rows to
 * several MB. /cart fetches on phones started timing out as a result.
 *
 * What this script does for every customised cart row:
 *   1. Parse `customization` (jsonb) and each `designs[i].canvasJSON` (string).
 *   2. Walk the Fabric `objects[]` array (and the simple-zone `fills` shape)
 *      finding any `src` / image-zone value that is a `data:image/...` URI.
 *   3. Decode the base64, write it to the same UPLOAD_DIR the API uses, insert
 *      a matching `files` row, and sign a 10-year URL.
 *   4. Replace every occurrence of that data URI (in objects, fills, the
 *      top-level `imagesUsed` array, anywhere in the customization tree)
 *      with the new URL.
 *   5. UPDATE cart_items SET customization = $new WHERE id = $id.
 *
 * Idempotent — rows that have no `data:image/...` after the first run are
 * skipped on the second run.
 *
 * Run:  pnpm --filter @gifteeng/db strip:cart-base64
 *
 * Required env:
 *   DATABASE_URL          (same one Prisma uses)
 *   UPLOAD_DIR            (defaults to /var/gifteeng/uploads — match API)
 *   FILES_SIGNING_SECRET  (defaults to 'dev-files' — match API)
 */

import { Client } from "pg";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/var/gifteeng/uploads";
const FILES_SIGNING_SECRET = process.env.FILES_SIGNING_SECRET ?? "dev-files";

const SIGNED_TTL_SECONDS = 315_360_000; // 10 years — matches FilesService.upload()
const SIZE_TARGET_BYTES = 50 * 1024;    // log rows still over 50 KB after rewrite
const DATA_URI_RE = /^data:image\/([a-zA-Z0-9+.\-]+);base64,(.+)$/;

type FileRow = { id: string; relPath: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function signUrl(relPath: string, ttlSeconds = SIGNED_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const mac = crypto
    .createHmac("sha256", FILES_SIGNING_SECRET)
    .update(`${relPath}|${expires}`)
    .digest("hex");
  return `/api/files/${mac}.${expires}/${relPath}`;
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png"))  return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("gif"))  return ".gif";
  if (m.includes("svg"))  return ".svg";
  return "";
}

async function persistDataUri(
  pg: Client,
  dataUri: string,
  cartItemId: string,
): Promise<string | null> {
  const m = DATA_URI_RE.exec(dataUri);
  if (!m) return null;
  const subtype = m[1];
  const b64 = m[2];
  const buffer = Buffer.from(b64, "base64");
  if (buffer.length === 0) return null;

  const mime = `image/${subtype.replace(/^x-/, "")}`;
  const ext = extFromMime(mime) || ".bin";
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  // Keep old rows + new uploads from the API in the same `customer/` bucket.
  const rel = `customer/${Date.now()}-cart-${cartItemId.slice(0, 8)}-${checksum.slice(0, 10)}${ext}`;
  const abs = path.join(UPLOAD_DIR, rel);

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);

  // ownerType `customer` is the closest match in the FileOwnerType enum;
  // ownerId stays NULL because we don't link cart items to customers
  // (guest carts have none).
  const id = crypto.randomUUID();
  await pg.query(
    `INSERT INTO files (id, "ownerType", path, "mimeType", "sizeBytes", checksum, "createdAt")
     VALUES ($1, 'customer'::"FileOwnerType", $2, $3, $4, $5, NOW())`,
    [id, rel, mime, buffer.length, checksum],
  );

  return signUrl(rel);
}

// ── Cache so identical base64 across designs share one upload ────────────────
type Cache = Map<string, string>; // dataUri → signed URL

async function rewriteValue(
  value: unknown,
  pg: Client,
  cartItemId: string,
  cache: Cache,
  stats: { uploaded: number; reused: number; failed: number },
): Promise<unknown> {
  if (typeof value === "string") {
    if (!value.startsWith("data:image/")) return value;
    const cached = cache.get(value);
    if (cached) {
      stats.reused += 1;
      return cached;
    }
    try {
      const url = await persistDataUri(pg, value, cartItemId);
      if (!url) {
        stats.failed += 1;
        return value;
      }
      cache.set(value, url);
      stats.uploaded += 1;
      return url;
    } catch (err) {
      stats.failed += 1;
      console.warn(`  [warn] failed to persist data URI for ${cartItemId}:`, (err as Error).message);
      return value;
    }
  }
  if (Array.isArray(value)) {
    const next = await Promise.all(value.map((v) => rewriteValue(v, pg, cartItemId, cache, stats)));
    return next;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = await rewriteValue(v, pg, cartItemId, cache, stats);
    }
    return out;
  }
  return value;
}

/**
 * canvasJSON in the customization payload is a *stringified* Fabric JSON.
 * Parse → rewrite → stringify so the rewritten URLs land back as a string.
 * Returns the rewritten JSON string (or the original if it isn't valid JSON).
 */
async function rewriteCanvasJsonString(
  raw: unknown,
  pg: Client,
  cartItemId: string,
  cache: Cache,
  stats: { uploaded: number; reused: number; failed: number },
): Promise<unknown> {
  if (typeof raw !== "string" || raw.length === 0) return raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  const rewritten = await rewriteValue(parsed, pg, cartItemId, cache, stats);
  return JSON.stringify(rewritten);
}

async function rewriteCustomization(
  customization: unknown,
  pg: Client,
  cartItemId: string,
  cache: Cache,
  stats: { uploaded: number; reused: number; failed: number },
): Promise<unknown> {
  if (!customization || typeof customization !== "object") return customization;
  const src = customization as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };

  if (typeof src.canvasJSON === "string") {
    out.canvasJSON = await rewriteCanvasJsonString(src.canvasJSON, pg, cartItemId, cache, stats);
  }

  if (Array.isArray(src.designs)) {
    out.designs = await Promise.all(
      src.designs.map(async (d) => {
        if (!d || typeof d !== "object") return d;
        const dd = { ...(d as Record<string, unknown>) };
        if (typeof dd.canvasJSON === "string") {
          dd.canvasJSON = await rewriteCanvasJsonString(dd.canvasJSON, pg, cartItemId, cache, stats);
        }
        return dd;
      }),
    );
  }

  if (Array.isArray(src.imagesUsed)) {
    out.imagesUsed = await Promise.all(
      src.imagesUsed.map(async (u) => {
        if (typeof u !== "string" || !u.startsWith("data:image/")) return u;
        const cached = cache.get(u);
        if (cached) return cached;
        // imagesUsed strings should have been hit while walking canvasJSON,
        // but cover the case where canvasJSON wasn't walkable.
        const url = await persistDataUri(pg, u, cartItemId);
        if (!url) return u;
        cache.set(u, url);
        stats.uploaded += 1;
        return url;
      }),
    );
  }

  return out;
}

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();
  console.log("[strip-cart-base64] connected");
  console.log(`  UPLOAD_DIR = ${UPLOAD_DIR}`);
  if (!fs.existsSync(UPLOAD_DIR)) {
    throw new Error(`UPLOAD_DIR does not exist: ${UPLOAD_DIR} (run on the API host or mount the volume)`);
  }

  // Only inspect rows that actually have data: payloads. pg_column_size on a
  // jsonb column is the toast-aware on-disk size, so it catches base64 bloat
  // even when the JSON tree itself looks small.
  const { rows } = await pg.query<{
    id: string;
    customization: unknown;
    sizeBytes: number;
  }>(`
    SELECT
      id,
      customization,
      pg_column_size(customization) AS "sizeBytes"
    FROM cart_items
    WHERE customization IS NOT NULL
      AND pg_column_size(customization) > $1
      AND customization::text LIKE '%data:image/%'
    ORDER BY pg_column_size(customization) DESC;
  `, [SIZE_TARGET_BYTES]);

  console.log(`[strip-cart-base64] ${rows.length} candidate rows over ${SIZE_TARGET_BYTES} bytes`);

  const totals = { uploaded: 0, reused: 0, failed: 0, rowsRewritten: 0, bytesBefore: 0, bytesAfter: 0 };
  const stillLarge: { id: string; bytes: number }[] = [];

  for (const row of rows) {
    const cache: Cache = new Map();
    const stats = { uploaded: 0, reused: 0, failed: 0 };
    const before = Number(row.sizeBytes ?? jsonByteLength(row.customization));

    const rewritten = await rewriteCustomization(row.customization, pg, row.id, cache, stats);

    if (stats.uploaded === 0 && stats.reused === 0) {
      // Nothing changed — leave the row alone.
      continue;
    }

    const after = jsonByteLength(rewritten);
    await pg.query(`UPDATE cart_items SET customization = $1::jsonb WHERE id = $2`, [
      JSON.stringify(rewritten),
      row.id,
    ]);

    totals.uploaded += stats.uploaded;
    totals.reused += stats.reused;
    totals.failed += stats.failed;
    totals.rowsRewritten += 1;
    totals.bytesBefore += before;
    totals.bytesAfter += after;

    if (after > SIZE_TARGET_BYTES) stillLarge.push({ id: row.id, bytes: after });

    console.log(
      `  ✓ ${row.id} — uploaded=${stats.uploaded} reused=${stats.reused} ${(before / 1024).toFixed(1)}KB → ${(after / 1024).toFixed(1)}KB`,
    );
  }

  console.log("\n=== DONE ===");
  console.log(`rows rewritten   : ${totals.rowsRewritten}`);
  console.log(`images uploaded  : ${totals.uploaded}`);
  console.log(`images deduped   : ${totals.reused}`);
  console.log(`images failed    : ${totals.failed}`);
  console.log(
    `total bytes      : ${(totals.bytesBefore / 1024 / 1024).toFixed(2)} MB → ${(totals.bytesAfter / 1024 / 1024).toFixed(2)} MB`,
  );
  if (stillLarge.length) {
    console.log(`\n${stillLarge.length} rows still > ${SIZE_TARGET_BYTES} bytes after rewrite (inspect manually):`);
    for (const r of stillLarge.slice(0, 20)) {
      console.log(`  ${r.id}  ${(r.bytes / 1024).toFixed(1)}KB`);
    }
  }

  await pg.end();
}

main().catch((err) => {
  console.error("[strip-cart-base64] failed:", err);
  process.exit(1);
});

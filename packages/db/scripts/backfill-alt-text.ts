/**
 * One-shot backfill: populate `alt` text on every existing product image
 * that's missing one. The auto-fill at create/update time only catches
 * NEW writes — this script catches everything that pre-dates the change.
 *
 * Rules (mirror products.service.ts:autoFillAltText):
 *   - Format: `<BRAND_NAME> – <product title>` (en-dash), e.g.
 *     "Gifteeng – Personalised Photo Frame"
 *   - If the product has multiple images, suffix " (image N)" so screen
 *     readers + Google distinguish them
 *   - Caller-supplied alts are NEVER overwritten — only blanks are filled
 *   - Idempotent — re-running is a no-op for already-altted rows
 *
 * Run:
 *   pnpm --filter @gifteeng/db tsx scripts/backfill-alt-text.ts
 *
 * Required env:
 *   DATABASE_URL  (same one Prisma uses)
 *   BRAND_NAME    (optional, defaults to "Gifteeng")
 */

import { PrismaClient, Prisma } from "@prisma/client";

const BRAND_NAME = (process.env.BRAND_NAME ?? "Gifteeng").trim() || "Gifteeng";

const prisma = new PrismaClient();

function altFor(title: string, total: number, idx: number): string {
  const base = title.trim()
    ? `${BRAND_NAME} – ${title.trim()}`
    : (BRAND_NAME || "Product image");
  return total > 1 ? `${base} (image ${idx + 1})` : base;
}

/**
 * Coerce a single image entry into `{ url, alt, ...rest }` and fill in
 * missing alt. Returns null when we couldn't extract a URL (so it gets
 * dropped from the array — keeps the data clean).
 */
function normaliseImage(
  raw: unknown,
  title: string,
  total: number,
  idx: number,
): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    if (!raw) return null;
    return { url: raw, alt: altFor(title, total, idx) };
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const url = (o.url as string | undefined)
      ?? (o.src as string | undefined)
      ?? "";
    if (!url) return null;
    const existing = ((o.alt as string | undefined) ?? "").trim();
    return {
      ...o,
      url,
      alt: existing ? existing : altFor(title, total, idx),
    };
  }
  return null;
}

async function run() {
  console.log(`[backfill-alt-text] starting (brand=${BRAND_NAME})`);

  let cursor: string | undefined;
  let total = 0;
  let touched = 0;
  // Page in batches of 200 — fits comfortably under Prisma's default
  // statement cache and keeps memory bounded on stores with 10k+ products.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.product.findMany({
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, title: true, images: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;
    total += rows.length;

    for (const r of rows) {
      const imgs = r.images;
      if (!Array.isArray(imgs) || imgs.length === 0) continue;

      // Detect whether ANY image is missing alt or is a bare string. If
      // every image already has a non-empty alt, skip the row.
      const needs = imgs.some((im) => {
        if (typeof im === "string") return true;
        if (im && typeof im === "object") {
          const alt = (im as { alt?: string }).alt;
          return !alt || !alt.trim();
        }
        return false;
      });
      if (!needs) continue;

      const next = imgs
        .map((im, i) => normaliseImage(im, r.title ?? "", imgs.length, i))
        .filter((x): x is Record<string, unknown> => x !== null);

      await prisma.product.update({
        where: { id: r.id },
        data: { images: next as Prisma.InputJsonValue },
      });
      touched++;
    }
    console.log(`[backfill-alt-text] scanned ${total} · updated ${touched}`);
  }

  console.log(
    `[backfill-alt-text] done. scanned=${total} updated=${touched}`,
  );
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

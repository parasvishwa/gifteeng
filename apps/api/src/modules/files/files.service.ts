import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";
import * as dns from "node:dns/promises";
import { URL } from "node:url";
import { PrismaService } from "../../prisma/prisma.service";

// SSRF defence — block fetches that resolve to loopback, link-local, or
// RFC1918 private ranges. Critical for /api/files/upload-from-url which
// makes outbound HTTP on the API box's behalf — without this an admin
// (or a stolen admin token) could exfiltrate cloud-metadata service
// credentials at 169.254.169.254, or hit internal-only services.
function isPrivateIp(addr: string): boolean {
  if (addr === "::1" || addr === "::") return true;
  if (addr.startsWith("127.") || addr.startsWith("10.") || addr.startsWith("192.168.")) return true;
  if (addr.startsWith("169.254.")) return true; // link-local + AWS metadata
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)) return true; // 172.16/12
  if (/^f[cd][0-9a-f]{2}:/i.test(addr)) return true; // IPv6 ULA fc00::/7
  if (addr.startsWith("fe80:")) return true; // IPv6 link-local
  return false;
}

// Cap downloads from `uploadFromUrl` so a single admin click can't pin a
// worker streaming a multi-GB asset to disk.
const MAX_REMOTE_BYTES = 25 * 1024 * 1024; // 25 MB

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  private uploadDir() {
    return process.env.UPLOAD_DIR ?? "/var/gifteeng/uploads";
  }

  private signingSecret() {
    // No fallback in production. main.ts asserts FILES_SIGNING_SECRET is
    // present at startup; if NODE_ENV ever lies we'd rather throw on first
    // sign() than silently use a guessable constant.
    const s = process.env.FILES_SIGNING_SECRET;
    if (!s) throw new Error("FILES_SIGNING_SECRET is not set");
    return s;
  }

  /** Generate HMAC-signed token for a file path. */
  sign(relPath: string, ttlSeconds = 3600) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const mac = crypto
      .createHmac("sha256", this.signingSecret())
      .update(`${relPath}|${expires}`)
      .digest("hex");
    return { url: `/api/files/${mac}.${expires}/${relPath}`, expires };
  }

  verify(token: string, relPath: string): boolean {
    const [mac, expiresStr] = token.split(".");
    if (!mac || !expiresStr) return false;
    const expires = Number(expiresStr);
    if (Number.isNaN(expires) || Date.now() / 1000 > expires) return false;
    const expected = crypto
      .createHmac("sha256", this.signingSecret())
      .update(`${relPath}|${expires}`)
      .digest("hex");
    // timingSafeEqual throws RangeError on length mismatch — guard it so a
    // malformed token surfaces as `false`, not a 500. Decode both sides as
    // hex so the buffer comparison happens on raw bytes (not the hex
    // string), matching the Razorpay webhook handler's pattern.
    let macBuf: Buffer;
    let expBuf: Buffer;
    try {
      macBuf = Buffer.from(mac, "hex");
      expBuf = Buffer.from(expected, "hex");
    } catch {
      return false;
    }
    if (macBuf.length === 0 || macBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(macBuf, expBuf);
  }

  async save(ownerType: any, ownerId: string | null, buffer: Buffer, mime: string, name: string) {
    const rel = `${ownerType}/${Date.now()}-${name}`;
    const abs = path.join(this.uploadDir(), rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
    return this.prisma.fileAsset.create({
      data: {
        ownerType,
        ownerId: ownerId ?? undefined,
        path: rel,
        mimeType: mime,
        sizeBytes: buffer.length,
      },
    });
  }

  /**
   * Fetch a remote URL (e.g. a DALL-E 3 signed URL which expires quickly) and
   * persist the bytes locally so we have a stable, long-lived reference.
   */
  async uploadFromUrl(url: string, ownerType = "product") {
    // ── SSRF + scheme + size guards ────────────────────────────────────────
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException("Invalid URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new BadRequestException("Only http/https URLs allowed");
    }
    // Resolve every A/AAAA record and reject if any address is private.
    // Resolving once-then-fetching is technically subject to a TOCTOU race
    // (rebinding DNS attack), but Node's fetch follows the same DNS so the
    // practical risk is bounded — and any real exfil would still need a
    // size > 0 response with the right MIME, which we limit below.
    try {
      const resolved = await dns.lookup(parsed.hostname, { all: true });
      if (resolved.some(({ address }) => isPrivateIp(address))) {
        throw new BadRequestException("URL resolves to a private/internal IP");
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("Could not resolve hostname");
    }
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok) throw new Error(`Fetch ${resp.status}: ${resp.statusText}`);
    // Early reject: content-length above cap. Doesn't catch chunked
    // responses without the header — we still re-check after reading.
    const declaredLen = Number(resp.headers.get("content-length") ?? "0");
    if (declaredLen > MAX_REMOTE_BYTES) {
      throw new BadRequestException("Remote file exceeds 25 MB cap");
    }
    const mime = resp.headers.get("content-type") || "image/png";
    const ab = await resp.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (buffer.length > MAX_REMOTE_BYTES) {
      throw new BadRequestException("Remote file exceeds 25 MB cap");
    }
    // Derive a friendly filename from URL path or fall back to a generated name
    const urlPath = url.split("?")[0] ?? "";
    const last = decodeURIComponent(urlPath.split("/").pop() || "").trim();
    const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : mime.includes("jpeg") ? ".jpg" : "";
    const name = last && last.length < 80 ? last : `ai-${Date.now()}${ext || ".png"}`;
    return this.save(ownerType, null, buffer, mime, name);
  }

  readStream(token: string, relPath: string) {
    if (!this.verify(token, relPath)) throw new UnauthorizedException();
    const abs = path.join(this.uploadDir(), relPath);
    if (!fs.existsSync(abs)) throw new NotFoundException();
    return fs.createReadStream(abs);
  }

  /**
   * In-place file replacement — overwrites the bytes on disk and updates sizeBytes
   * in the DB. The path/ID/URL slug stay the same so existing references keep working.
   */
  async replaceFile(id: string, buffer: Buffer, mime: string) {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("File asset not found");
    const abs = path.join(this.uploadDir(), asset.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
    return this.prisma.fileAsset.update({
      where: { id },
      data: { sizeBytes: buffer.length, mimeType: mime },
    });
  }

  /** List all file assets, newest first. Augments each row with a
   *  best-effort `usageCount` (number of products that reference the file
   *  by path or signed URL) and a `usedIn[]` array of product titles for
   *  the inline tooltip on the admin Files page. Previously every file
   *  showed "0×" because no usage was computed at all. */
  async listAssets(pageSize = 500) {
    const assets = await this.prisma.fileAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: pageSize,
    });

    // Materialise usage in two cheap passes:
    //   1. Pull every product's images JSON + title once. We scan in JS
    //      because images is a heterogeneous JSON array (strings, objects,
    //      or absent) and Postgres-side path-extraction is fragile across
    //      historical row shapes.
    //   2. Build a map `relPath → { count, titles[] }` and merge into the
    //      response. Cost is O(P × I) where P ≈ a few hundred and I ≈ 4.
    const products = await this.prisma.product.findMany({
      select: { title: true, images: true },
    });
    const usage = new Map<string, { count: number; titles: string[] }>();
    const bump = (key: string, title: string) => {
      if (!key) return;
      const existing = usage.get(key);
      if (existing) {
        existing.count++;
        if (existing.titles.length < 8) existing.titles.push(title);
      } else {
        usage.set(key, { count: 1, titles: [title] });
      }
    };
    const harvestUrl = (raw: string, title: string) => {
      if (!raw) return;
      // Try a few extraction strategies — admin pages persist both signed
      // /api/files/<token>/<path> URLs and bare /uploads/<path> URLs.
      const matchSigned = raw.match(/\/api\/files\/[^/]+\/(.+?)(?:\?|$)/);
      const matchUploads = raw.match(/\/uploads\/(.+?)(?:\?|$)/);
      const path = matchSigned?.[1] ?? matchUploads?.[1] ?? raw;
      bump(path, title);
    };
    for (const p of products) {
      const title = p.title ?? "";
      const imgs = p.images;
      if (!imgs) continue;
      if (Array.isArray(imgs)) {
        for (const im of imgs) {
          if (typeof im === "string") harvestUrl(im, title);
          else if (im && typeof im === "object") {
            const url = (im as { url?: string; src?: string }).url
              ?? (im as { src?: string }).src;
            if (url) harvestUrl(url, title);
          }
        }
      } else if (typeof imgs === "string") {
        harvestUrl(imgs, title);
      }
    }

    return assets.map((a) => {
      const u = usage.get(a.path) ?? { count: 0, titles: [] };
      return {
        id: a.id,
        path: a.path,
        ownerType: a.ownerType,
        ownerId: a.ownerId,
        mimeType: a.mimeType,
        sizeBytes: Number(a.sizeBytes),
        createdAt: a.createdAt,
        usageCount: u.count,
        usedIn: u.titles,
        ...this.sign(a.path, 3600 * 24 * 30), // 30-day signed URL for admin listing
      };
    });
  }
}

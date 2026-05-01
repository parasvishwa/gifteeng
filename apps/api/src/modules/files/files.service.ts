import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class FilesService {
  constructor(private prisma: PrismaService) {}

  private uploadDir() {
    return process.env.UPLOAD_DIR ?? "/var/gifteeng/uploads";
  }

  private signingSecret() {
    return process.env.FILES_SIGNING_SECRET ?? "dev-files";
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
    return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
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
    if (!/^https?:\/\//i.test(url)) throw new Error("Invalid URL");
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Fetch ${resp.status}: ${resp.statusText}`);
    const mime = resp.headers.get("content-type") || "image/png";
    const ab = await resp.arrayBuffer();
    const buffer = Buffer.from(ab);
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

  /** List all file assets, newest first. */
  async listAssets(pageSize = 500) {
    const assets = await this.prisma.fileAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: pageSize,
    });
    return assets.map((a) => ({
      id: a.id,
      path: a.path,
      ownerType: a.ownerType,
      ownerId: a.ownerId,
      mimeType: a.mimeType,
      sizeBytes: Number(a.sizeBytes),
      createdAt: a.createdAt,
      ...this.sign(a.path, 3600 * 24 * 30), // 30-day signed URL for admin listing
    }));
  }
}

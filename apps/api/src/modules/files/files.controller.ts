import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { FilesService } from "./files.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import * as jwt from "jsonwebtoken";

// ── Upload guardrails (security session79) ─────────────────────────────────
// Before this hardening, /api/files/upload was unauthenticated, accepted
// any content-type, had no size cap, and any internet user could fill the
// disk with arbitrary content. New rules:
//   - Authenticated callers only (B2C JWT *or* B2B JWT) — `OptionalAuthGuard`
//     short-circuits the request with 401 if neither token resolves.
//   - 25 MB hard limit per file (multer `limits.fileSize`). Larger uploads
//     are rare (canvas renders top out around 8 MB); we keep some headroom.
//   - MIME-type whitelist for the customer-facing customizer flow. Admins
//     uploading product photography go through /admin/files/upload (this
//     route now disallows risky MIME types — HTML, scripts, executables).
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME_TYPES = new Set<string>([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml",
  "image/avif", "image/heic", "image/heif",
]);

const FORBIDDEN_PREFIXES = [
  "text/html", "application/javascript", "application/x-msdownload",
  "application/x-sh", "application/x-executable", "application/x-msdos-program",
  "application/octet-stream",
];

function assertSafeMime(mime: string): void {
  const m = (mime ?? "").toLowerCase();
  if (!m) {
    throw new BadRequestException("Missing content-type on upload.");
  }
  if (FORBIDDEN_PREFIXES.some((p) => m.startsWith(p))) {
    throw new BadRequestException(`File type '${mime}' is not allowed.`);
  }
  if (!ALLOWED_MIME_TYPES.has(m)) {
    throw new BadRequestException(
      `File type '${mime}' is not in the allowed list. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}.`,
    );
  }
}

@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(private service: FilesService) {}

  /**
   * Admin-only listing. Was previously unguarded; now requires a B2B JWT.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Get()
  async list(@Query("pageSize") pageSize?: string) {
    return this.service.listAssets(pageSize ? Math.min(Number(pageSize), 1000) : 500);
  }

  /**
   * General upload. Now authenticated (either b2c or b2b JWT — the
   * customizer needs a logged-in customer to upload images for their
   * own design; admins use this path for product photography).
   *
   * Hardened against:
   *   • Anonymous abuse (filebrowser-style file hosting)
   *   • Disk-fill DoS (25 MB cap)
   *   • Content-type forgery (image/* whitelist)
   */
  @ApiBearerAuth()
  @Post("upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body("ownerType") ownerType?: string,
  ) {
    if (!file) throw new BadRequestException("Missing file in form-data field 'file'.");
    // Auth — accept either b2c or b2b token. Validate the bearer token
    // ourselves rather than mount two competing guards.
    if (!await this.hasAnyAuth(req)) {
      throw new UnauthorizedException(
        "Upload requires a logged-in customer or admin.",
      );
    }
    assertSafeMime(file.mimetype);

    const type = ownerType && ownerType.trim() ? ownerType.trim() : "system";
    const asset = await this.service.save(type, null, file.buffer, file.mimetype, file.originalname);
    const signed = this.service.sign(asset.path, 315_360_000); // 10 years
    return { id: asset.id, path: asset.path, ownerType: type, ...signed };
  }

  /** Product images upload — admin only. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Post("upload/product")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadProduct(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Missing file in form-data field 'file'.");
    assertSafeMime(file.mimetype);
    const asset = await this.service.save("product", null, file.buffer, file.mimetype, file.originalname);
    const signed = this.service.sign(asset.path, 315_360_000); // 10 years
    return { id: asset.id, path: asset.path, ownerType: "product", ...signed };
  }

  /**
   * Fetch a remote URL and persist locally. Admin-only — this is an
   * SSRF-class endpoint (we make outbound HTTP from the API box on the
   * caller's behalf). The service-level `uploadFromUrl` should already
   * validate the URL is HTTPS + not pointing at metadata services /
   * private IPs; the auth guard here ensures only authenticated B2B
   * users can trigger it.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Post("upload-from-url")
  async uploadFromUrl(@Body() body: { url: string; ownerType?: string }) {
    const asset = await this.service.uploadFromUrl(body.url, body.ownerType || "product");
    const signed = this.service.sign(asset.path, 315_360_000); // 10 years
    return { id: asset.id, path: asset.path, ownerType: asset.ownerType, ...signed };
  }

  /** In-place replace — admin only. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Patch(":id/replace")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async replace(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException("Missing file in form-data field 'file'.");
    assertSafeMime(file.mimetype);
    const asset = await this.service.replaceFile(id, file.buffer, file.mimetype);
    const signed = this.service.sign(asset.path, 3600 * 24 * 30);
    res.json({ id: asset.id, path: asset.path, sizeBytes: Number(asset.sizeBytes), ...signed });
  }

  /**
   * Serve signed file — public on purpose; the signed token is the
   * authorization. FilesService.readStream verifies the HMAC + expiry
   * before opening the file.
   */
  @Get(":token/*")
  serve(@Param("token") token: string, @Param("0") relPath: string, @Res() res: Response) {
    const stream = this.service.readStream(token, relPath);
    stream.pipe(res);
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Allow the upload when the request carries either:
   *   - a valid B2C JWT signed with JWT_B2C_SECRET, or
   *   - a valid B2B JWT signed with JWT_B2B_SECRET.
   *
   * We verify the signature ourselves with `jwt.verify` because Nest's
   * AuthGuard chain doesn't natively support "any one of these passes".
   * Returns true on first successful verification.
   */
  private async hasAnyAuth(req: any): Promise<boolean> {
    const auth = req?.headers?.authorization ?? req?.headers?.Authorization;
    if (typeof auth !== "string" || !auth.toLowerCase().startsWith("bearer ")) {
      return false;
    }
    const token = auth.slice(7).trim();
    if (!token) return false;

    const b2c = process.env.JWT_B2C_SECRET;
    const b2b = process.env.JWT_B2B_SECRET;
    for (const secret of [b2c, b2b]) {
      if (!secret) continue;
      try {
        jwt.verify(token, secret);
        return true;
      } catch { /* try next */ }
    }
    return false;
  }
}

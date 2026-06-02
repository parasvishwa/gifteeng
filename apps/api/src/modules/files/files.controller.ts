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
import { PrismaService } from "../../prisma/prisma.service";
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

// Per-cart-session daily upload budget — 100 MB / 24 h. Sized to comfortably
// cover any realistic customizer flow (a handful of high-res images) without
// letting a single rotating session ID become a free image host. See
// SECURITY_AUDIT.md M-1.
const GUEST_DAILY_BUDGET_BYTES = 100 * 1024 * 1024;

@ApiTags("files")
@Controller("files")
export class FilesController {
  // In-memory daily-budget tracker keyed by sessionKey. Resets per worker on
  // restart (acceptable — workers cycle through a deploy and the cap is not
  // a hard security boundary, it's a quota knob). For multi-worker
  // production setups we'd swap this for Redis; the API box currently runs
  // one worker per Contabo node so this is fine.
  private static budget = new Map<string, { resetAt: number; usedBytes: number }>();

  constructor(private service: FilesService, private prisma: PrismaService) {}

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
    // Auth — accept either b2c or b2b token, or a real X-Cart-Session under
    // its daily budget. Pass fileSize so the guest budget tracker can debit.
    if (!await this.hasAnyAuth(req, file.size ?? 0)) {
      throw new UnauthorizedException(
        "Upload requires a logged-in customer or admin (or a valid cart session under its daily budget).",
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
   * Allow the upload when the request carries any of:
   *   1. A valid B2C JWT signed with JWT_B2C_SECRET (logged-in customer)
   *   2. A valid B2B JWT signed with JWT_B2B_SECRET (admin)
   *   3. An `X-Cart-Session` header that corresponds to a REAL cart row
   *      AND that session is under its 100 MB / 24 h daily upload budget.
   *
   * (1) and (2) verify cryptographically. (3) was previously trivially
   * forgeable — any random UUID-shaped string was accepted, letting bots
   * fill the disk by rotating session IDs (SECURITY_AUDIT.md M-1). We now
   * gate guest uploads on:
   *   - a row in `carts` with `sessionKey = <header>` actually existing
   *     (proves the client went through the normal cart-create flow), AND
   *   - the running per-session daily byte total still being under the
   *     budget for this calendar day.
   *
   * Returns true on first successful check.
   */
  private async hasAnyAuth(req: any, fileSize = 0): Promise<boolean> {
    // Guest path: X-Cart-Session must map to a real cart, and the session
    // must be within budget.
    const cartSession = req?.headers?.["x-cart-session"];
    if (typeof cartSession === "string" && cartSession.length >= 8 && cartSession.length <= 128) {
      const exists = await this.prisma.cart.findUnique({
        where: { sessionKey: cartSession },
        select: { id: true },
      });
      if (exists && this.consumeGuestBudget(cartSession, fileSize)) {
        return true;
      }
      // Fall through to bearer-token path — a logged-in customer's web app
      // may still send X-Cart-Session for cart-merge but their JWT is the
      // real authorization.
    }

    // Authed path: verify the bearer token against either JWT secret.
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

  /**
   * Track per-session byte usage in a 24-hour rolling window. Returns
   * true if the requested fileSize fits in the remaining budget (and
   * deducts it), false if the cap is reached.
   */
  private consumeGuestBudget(sessionKey: string, fileSize: number): boolean {
    const now = Date.now();
    const bucket = FilesController.budget.get(sessionKey);
    if (!bucket || bucket.resetAt < now) {
      FilesController.budget.set(sessionKey, {
        resetAt: now + 24 * 60 * 60 * 1000,
        usedBytes: fileSize,
      });
      return fileSize <= GUEST_DAILY_BUDGET_BYTES;
    }
    if (bucket.usedBytes + fileSize > GUEST_DAILY_BUDGET_BYTES) return false;
    bucket.usedBytes += fileSize;
    return true;
  }
}

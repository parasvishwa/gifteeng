import {
  Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PrivacyService } from "./privacy.service";
import type { ConsentCategory } from "@gifteeng/db";

// ─────────────────────────────────────────────────────────────────────────
// Customer endpoints — under /api/me to match the existing customer-side
// route convention (auth-b2c, /me/events, etc.).
// ─────────────────────────────────────────────────────────────────────────

@ApiTags("privacy-customer")
@Controller("me/privacy")
export class PrivacyCustomerController {
  constructor(private privacy: PrivacyService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("consents")
  async consents(@Req() req: any) {
    return this.privacy.getConsentSnapshot(req.user.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("consents")
  async setConsent(
    @Req() req: any,
    @Body() body: { category: ConsentCategory; granted: boolean },
  ) {
    return this.privacy.setConsent(req.user.customerId, body.category, !!body.granted, {
      source: "settings_page",
      ipAddress: (req.ip ?? (req.headers?.["x-forwarded-for"] as string | undefined) ?? undefined),
      userAgent: ((req.headers?.["user-agent"] as string | undefined) ?? undefined),
    });
  }

  /**
   * Synchronous data export. Returns the request id; client polls
   * /me/privacy/exports/:id to fetch the JSON. For our current scale
   * the export is built within the same request and stored ready-to-go,
   * so the poll usually returns immediately.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("export")
  async createExport(@Req() req: any) {
    const r = await this.privacy.exportData(req.user.customerId);
    return { id: r.id, status: r.status, sizeBytes: r.sizeBytes, expiresAt: r.expiresAt };
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("exports")
  async listExports(@Req() req: any) {
    return this.privacy.listExports(req.user.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("exports/:id")
  async getExport(@Req() req: any, @Param("id") id: string) {
    return this.privacy.getExport(req.user.customerId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("delete-account")
  async requestDeletion(
    @Req() req: any,
    @Body() body: { graceDays?: number },
  ) {
    const grace = body?.graceDays && body.graceDays >= 0 && body.graceDays <= 90
      ? body.graceDays
      : undefined;
    return this.privacy.requestDeletion(req.user.customerId, grace);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Delete("delete-account")
  async cancelDeletion(@Req() req: any) {
    return this.privacy.cancelDeletion(req.user.customerId);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Admin endpoints
// ─────────────────────────────────────────────────────────────────────────

@ApiTags("privacy-admin")
@Controller("admin/privacy")
export class PrivacyAdminController {
  constructor(private privacy: PrivacyService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Get("pending-deletions")
  async pendingDeletions() {
    return this.privacy.listPendingDeletions();
  }

  /** Force-process a deletion immediately (overrides the grace period). */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("anonymize/:customerId")
  async anonymize(@Param("customerId") customerId: string) {
    return this.privacy.anonymizeCustomer(customerId, "manual admin trigger");
  }
}

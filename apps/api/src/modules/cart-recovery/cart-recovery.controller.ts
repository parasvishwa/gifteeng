import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CartRecoveryService, CartRecoveryRuleInput } from "./cart-recovery.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const ruleSchema = z.object({
  name:           z.string().min(1).max(100).optional(),
  triggerMinutes: z.number().int().min(5).max(43_200).optional(), // 5min..30d
  minCartValue:   z.number().int().min(0).max(10_000_000).nullable().optional(),
  maxCartValue:   z.number().int().min(0).max(10_000_000).nullable().optional(),
  loggedInOnly:   z.boolean().optional(),
  title:          z.string().min(1).max(200).optional(),
  body:           z.string().min(1).max(500).optional(),
  ctaText:        z.string().max(40).optional(),
  ctaUrl:         z.string().max(200).optional(),
  cooldownHours:  z.number().int().min(0).max(720).optional(),
  isActive:       z.boolean().optional(),
  sortOrder:      z.number().int().optional(),
});

@ApiTags("cart-recovery")
@Controller()
export class CartRecoveryController {
  constructor(private readonly service: CartRecoveryService) {}

  // ── Admin CRUD on rules ──────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/cart-recovery/rules")
  list() {
    return this.service.listRules();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/cart-recovery/stats")
  stats() {
    return this.service.getStats();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/cart-recovery/rules")
  create(@Body(new ZodValidationPipe(ruleSchema)) body: CartRecoveryRuleInput) {
    return this.service.createRule(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch("admin/cart-recovery/rules/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ruleSchema)) body: CartRecoveryRuleInput,
  ) {
    return this.service.updateRule(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete("admin/cart-recovery/rules/:id")
  remove(@Param("id") id: string) {
    return this.service.deleteRule(id);
  }

  // ── Preview eligible candidates ──────────────────────────────────────────

  /**
   * GET /admin/cart-recovery/candidates?ruleId=xxx
   *
   * Shows which customers would receive a notification for this rule right
   * now. By default ignores cooldown so the admin can see "all qualifying
   * carts"; pass ?excludeCooldown=true to see exactly what the next run
   * would actually send.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/cart-recovery/candidates")
  candidates(
    @Query("ruleId") ruleId: string,
    @Query("excludeCooldown") excludeCooldown?: string,
  ) {
    return this.service.findCandidates(ruleId, excludeCooldown !== "true");
  }

  // ── Test send (admin "send to me" button) ────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/cart-recovery/rules/:id/test-send")
  testSend(
    @Param("id") id: string,
    @Body() body: { customerId: string },
  ) {
    return this.service.testSend(id, body.customerId);
  }

  // ── Cron-triggered: scan all rules + send pushes ─────────────────────────

  /**
   * POST /admin/cart-recovery/run
   *
   * Hook this to a cron at every 15-30 min. Idempotent — cooldown enforces
   * no duplicate sends.
   *
   *   curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
   *     https://new-api.gifteeng.com/api/admin/cart-recovery/run
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/cart-recovery/run")
  run() {
    return this.service.runRecovery();
  }
}

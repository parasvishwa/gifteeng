import { Body, Controller, Get, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { InactivityRewardsService, InactivityConfigInput } from "./inactivity-rewards.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const configSchema = z.object({
  enabled:             z.boolean().optional(),
  minGoins:            z.number().int().min(1).max(10_000).optional(),
  maxGoins:            z.number().int().min(1).max(10_000).optional(),
  minInactiveDays:     z.number().int().min(1).max(365).optional(),
  cooldownDays:        z.number().int().min(1).max(365).optional(),
  maxLifetimePerUser:  z.number().int().min(0).max(100).optional(),
  dailyDropRate:       z.number().int().min(0).max(100).optional(),
  pushTitleTemplate:   z.string().min(1).max(200).optional(),
  pushBodyTemplate:    z.string().min(1).max(500).optional(),
  ctaUrl:              z.string().min(1).max(200).optional(),
});

@ApiTags("inactivity-rewards")
@Controller()
export class InactivityRewardsController {
  constructor(private readonly service: InactivityRewardsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/inactivity-rewards/config")
  getConfig() {
    return this.service.getConfig();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch("admin/inactivity-rewards/config")
  updateConfig(@Body(new ZodValidationPipe(configSchema)) body: InactivityConfigInput) {
    return this.service.updateConfig(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/inactivity-rewards/stats")
  stats() {
    return this.service.getStats();
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/inactivity-rewards/recent")
  recent(@Query("limit") limit?: string) {
    return this.service.getRecentSends(limit ? Number(limit) : 50);
  }

  /**
   * POST /api/admin/inactivity-rewards/run
   *
   * Hook to a daily cron (e.g. 10:30 UTC). Idempotent — cooldown + lifetime
   * cap prevent re-rewarding the same user.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/inactivity-rewards/run")
  run() {
    return this.service.runDrops();
  }

  /** Test-send to a specific customer for preview. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/inactivity-rewards/test-send")
  testSend(@Body() body: { customerId: string }) {
    return this.service.sendTestTo(body.customerId);
  }
}

import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { MilestoneRewardsService, MilestoneConfigInput } from "./milestone-rewards.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const configSchema = z.object({
  webEnabled: z.boolean().optional(), webEvery: z.number().int().min(1).max(100_000).optional(), webGoins: z.number().int().min(1).max(100_000).optional(),
  webTitle:   z.string().min(1).max(200).optional(), webBody:  z.string().min(1).max(500).optional(),
  appEnabled: z.boolean().optional(), appEvery: z.number().int().min(1).max(100_000).optional(), appGoins: z.number().int().min(1).max(100_000).optional(),
  appTitle:   z.string().min(1).max(200).optional(), appBody:  z.string().min(1).max(500).optional(),
  ctaUrl:     z.string().min(1).max(200).optional(),
});

@ApiTags("milestone-rewards")
@Controller()
export class MilestoneRewardsController {
  constructor(private readonly service: MilestoneRewardsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/milestone-rewards/config")
  getConfig() { return this.service.getConfig(); }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch("admin/milestone-rewards/config")
  updateConfig(@Body(new ZodValidationPipe(configSchema)) body: MilestoneConfigInput) {
    return this.service.updateConfig(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/milestone-rewards/stats")
  stats() { return this.service.getStats(); }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/milestone-rewards/recent")
  recent(@Query("limit") limit?: string) {
    return this.service.getRecent(limit ? Number(limit) : 50);
  }
}

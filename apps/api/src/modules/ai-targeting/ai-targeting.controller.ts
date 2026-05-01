import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { AiTargetingService } from "./ai-targeting.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

/**
 * Admin endpoints for the AI customer-intent targeting layer.
 *   POST /api/admin/ai-targeting/sweep           — run the cron sweep now
 *   POST /api/admin/ai-targeting/customer/:id    — evaluate one customer
 *   GET  /api/admin/ai-targeting/customer/:id    — return the last snapshot
 */
@ApiTags("ai-targeting")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
@Controller("admin/ai-targeting")
export class AiTargetingController {
  constructor(private readonly service: AiTargetingService) {}

  @Post("sweep")
  async sweep() {
    await this.service.sweep();
    return { ok: true };
  }

  @Post("customer/:id")
  async evaluate(@Param("id") id: string) {
    const snap = await this.service.evaluateCustomerById(id);
    return { ok: true, snapshot: snap };
  }
}

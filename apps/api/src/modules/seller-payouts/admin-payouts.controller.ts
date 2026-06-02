import {
  Body, Controller, Get, Param, Post, Put, Query, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { SellerPayoutsService } from "./seller-payouts.service";

const markPaidSchema = z.object({
  paymentRef: z.string().max(200).optional(),
  notes:      z.string().max(500).optional(),
});

const settingSchema = z.object({
  value: z.unknown(),
});

@ApiTags("admin-payouts")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
@Controller("admin")
export class AdminPayoutsController {
  constructor(private svc: SellerPayoutsService) {}

  // ── Payouts ──────────────────────────────────────────────────────────

  @Get("payouts")
  list(@Query("status") status?: string) {
    return this.svc.adminListPayouts(status);
  }

  @Get("payouts/:id")
  get(@Param("id") id: string) {
    return this.svc.adminGetPayout(id);
  }

  @Post("payouts/:id/mark-processing")
  markProcessing(@Param("id") id: string) {
    return this.svc.adminMarkProcessing(id);
  }

  @Post("payouts/:id/mark-paid")
  markPaid(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(markPaidSchema)) body: z.infer<typeof markPaidSchema>,
  ) {
    return this.svc.adminMarkPaid(id, body.paymentRef, body.notes);
  }

  @Post("payouts/trigger")
  triggerPayouts() {
    return this.svc.adminTriggerPayouts();
  }

  // ── Platform settings ────────────────────────────────────────────────

  @Get("platform-settings")
  getSettings() {
    return this.svc.getAllSettings();
  }

  @Put("platform-settings/:key")
  setSetting(
    @Param("key") key: string,
    @Body(new ZodValidationPipe(settingSchema)) body: z.infer<typeof settingSchema>,
  ) {
    return this.svc.setSetting(key, body.value);
  }
}

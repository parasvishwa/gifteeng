import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { z } from "zod";
import { CoinsService } from "./coins.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const validateRedeemSchema = z.object({
  coins: z.number().int().positive(),
  orderValue: z.number().positive(),
});

const confirmRedeemSchema = z.object({
  coins: z.number().int().positive(),
  orderId: z.string().min(1),
});

const adminGrantSchema = z.object({
  customerId: z.string().uuid(),
  coins: z.number().int().positive(),
  reason: z.string().min(1),
});

const freezeSchema = z.object({
  customerId: z.string().uuid(),
  reason: z.string().min(3).max(280),
});

const unfreezeSchema = z.object({
  customerId: z.string().uuid(),
});

@ApiTags("coins")
@Controller("coins")
export class CoinsController {
  constructor(private service: CoinsService) {}

  /** GET /api/coins/balance — customer's coin balance + spin eligibility */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("balance")
  balance(@Req() req: any) {
    return this.service.getBalance(req.user.customerId as string);
  }

  /** POST /api/coins/spin — daily spin wheel */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("spin")
  spin(@Req() req: any) {
    return this.service.spin(req.user.customerId as string);
  }

  /** POST /api/coins/validate-redeem — preview discount before checkout */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("validate-redeem")
  validateRedeem(
    @Req() req: any,
    @Body(new ZodValidationPipe(validateRedeemSchema))
    body: z.infer<typeof validateRedeemSchema>,
  ) {
    return this.service.validateRedeem(
      req.user.customerId as string,
      body.coins,
      body.orderValue,
    );
  }

  /** POST /api/coins/confirm-redeem — deduct coins at checkout */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("confirm-redeem")
  confirmRedeem(
    @Req() req: any,
    @Body(new ZodValidationPipe(confirmRedeemSchema))
    body: z.infer<typeof confirmRedeemSchema>,
  ) {
    return this.service.confirmRedeem(
      req.user.customerId as string,
      body.coins,
      body.orderId,
    );
  }

  /** GET /api/coins/history — transaction history */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("history")
  history(
    @Req() req: any,
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.service.getHistory(req.user.customerId as string, limit);
  }

  /** POST /api/coins/admin/grant — admin grants coins to a customer */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/grant")
  adminGrant(
    @Body(new ZodValidationPipe(adminGrantSchema))
    body: z.infer<typeof adminGrantSchema>,
  ) {
    return this.service.adminGrant(body.customerId, body.coins, body.reason);
  }

  /**
   * POST /api/coins/admin/sweep-expired — Deploy 116.
   * Expire positive-value Goin transactions older than 90 days and
   * deduct their balance from the owning customer. Intended to be hit
   * daily from cron. Idempotent.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/sweep-expired")
  sweepExpired() {
    return this.service.sweepExpired();
  }

  /** GET /api/coins/admin/audit/top-earners — Deploy 117 fraud-watch. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/audit/top-earners")
  auditTopEarners(
    @Query("days", new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.auditTopEarners({ days, limit });
  }

  /** POST /api/coins/admin/freeze — freeze a customer's Goin earn + redeem. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/freeze")
  freezeAccount(
    @Req() req: any,
    @Body(new ZodValidationPipe(freezeSchema))
    body: z.infer<typeof freezeSchema>,
  ) {
    const adminId = (req.user?.companyUserId as string | undefined) ?? undefined;
    return this.service.freezeAccount(body.customerId, body.reason, adminId);
  }

  /** POST /api/coins/admin/unfreeze — restore earn + redeem. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/unfreeze")
  unfreezeAccount(
    @Req() req: any,
    @Body(new ZodValidationPipe(unfreezeSchema))
    body: z.infer<typeof unfreezeSchema>,
  ) {
    const adminId = (req.user?.companyUserId as string | undefined) ?? undefined;
    return this.service.unfreezeAccount(body.customerId, adminId);
  }
}

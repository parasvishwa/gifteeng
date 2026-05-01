import {
  Controller, Get, Post, Body, Query, Req, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { z } from "zod";
import { RewardsService } from "./rewards.service";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const applyRewardSchema = z.object({
  rewardId: z.string().uuid(),
  cartId: z.string().optional(),
});

const computeSchema = z.object({
  subtotal: z.number().min(0),
  shipping: z.number().min(0).default(0),
  giftWrap: z.number().min(0).default(0),
  cartId: z.string().optional(),
});

@ApiTags("rewards")
@Controller("rewards")
export class RewardsController {
  constructor(private service: RewardsService) {}

  /** GET /api/rewards/active — user's pending + applied rewards */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("active")
  active(@Req() req: any) {
    return this.service.listActive(req.user.customerId as string);
  }

  /** GET /api/rewards/history — reward history (last 30) */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("history")
  history(
    @Req() req: any,
    @Query("limit", new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.service.listHistory(req.user.customerId as string, limit);
  }

  /** POST /api/rewards/apply — toggle-apply a reward to cart */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("apply")
  apply(
    @Req() req: any,
    @Body(new ZodValidationPipe(applyRewardSchema))
    body: z.infer<typeof applyRewardSchema>,
  ) {
    return this.service.applyReward(
      req.user.customerId as string,
      body.rewardId,
      body.cartId,
    );
  }

  /** POST /api/rewards/compute — recompute cart totals with applied rewards */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("compute")
  compute(
    @Req() req: any,
    @Body(new ZodValidationPipe(computeSchema))
    body: z.infer<typeof computeSchema>,
  ) {
    return this.service.computeAppliedDiscount(
      req.user.customerId as string,
      body.subtotal,
      body.shipping,
      body.giftWrap,
      body.cartId,
    );
  }
}

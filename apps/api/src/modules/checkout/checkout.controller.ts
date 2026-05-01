import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CheckoutInputSchema } from "@gifteeng/shared";
import type { CheckoutInput } from "@gifteeng/shared";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { CheckoutService, PlaceOrderResult } from "./checkout.service";

type AuthedB2cRequest = Request & { user: { customerId: string } };
type AuthedB2bRequest = Request & {
  user: { companyUserId: string; companyId: string; role: string };
};

@ApiTags("checkout")
@Controller("checkout")
export class CheckoutController {
  constructor(private service: CheckoutService) {}

  // ---- Place order (B2C) ----
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("b2c/place")
  @UsePipes(new ZodValidationPipe(CheckoutInputSchema))
  placeB2c(
    @Req() req: AuthedB2cRequest,
    @Body() body: CheckoutInput,
  ): Promise<PlaceOrderResult> {
    return this.service.placeOrderB2c(req.user.customerId, body);
  }

  // ---- Place order (B2B) ----
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("employee", "hr_admin")
  @Post("b2b/place")
  @UsePipes(new ZodValidationPipe(CheckoutInputSchema))
  placeB2b(
    @Req() req: AuthedB2bRequest,
    @Body() body: CheckoutInput,
  ): Promise<PlaceOrderResult> {
    return this.service.placeOrderB2b(
      req.user.companyUserId,
      req.user.companyId,
      body,
    );
  }

  // ---- Razorpay capture (client-driven) ----
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("razorpay/capture")
  capture(
    @Body()
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    return this.service.captureRazorpayPayment(body);
  }

  // ---- Razorpay webhook (no guard, raw body required) ----
  @Post("razorpay/webhook")
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-razorpay-signature") signature: string,
  ): Promise<{ received: true }> {
    const raw = req.rawBody?.toString("utf8");
    if (!raw) throw new BadRequestException("Raw body unavailable");
    if (!signature) throw new BadRequestException("Missing x-razorpay-signature header");
    return this.service.handleRazorpayWebhook(raw, signature);
  }

  // ---- Legacy (backward compat) ----
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("razorpay/order")
  createOrder(@Body() body: { amount: number; receipt: string }) {
    return this.service.createRazorpayOrder(body.amount, body.receipt);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("razorpay/verify")
  verify(
    @Body()
    body: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    },
  ) {
    const ok = this.service.verifySignature(
      body.razorpay_order_id,
      body.razorpay_payment_id,
      body.razorpay_signature,
    );
    return { verified: ok };
  }
}

import {
  Body, Controller, Get, Headers, Patch, Post, Query, Req, UnauthorizedException, UseGuards, UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtSellerGuard } from "../../common/guards/jwt-seller.guard";
import { AuthSellerService, SellerOnboardInput } from "./auth-seller.service";

const otpRequestSchema = z.object({ phone: z.string().min(8).max(20) });
const otpVerifySchema  = z.object({ phone: z.string().min(8).max(20), code: z.string().min(4).max(8) });

const profileUpdateSchema = z.object({
  brandName:         z.string().min(2).max(120).optional(),
  email:             z.string().email().max(160).optional().nullable(),
  contactName:       z.string().min(2).max(120).optional(),
  contactPhone:      z.string().max(20).optional().nullable(),
  contactEmail:      z.string().email().max(160).optional().nullable(),
  addressLine:       z.string().max(300).optional().nullable(),
  city:              z.string().max(80).optional().nullable(),
  state:             z.string().max(80).optional().nullable(),
  pincode:           z.string().min(4).max(10).optional(),
  bankAccountName:   z.string().max(120).optional().nullable(),
  bankAccountNumber: z.string().max(40).optional().nullable(),
  bankIfsc:          z.string().max(20).optional().nullable(),
  dispatchDays:      z.number().int().min(1).max(30).optional(),
});

const onboardSchema = z.object({
  type:              z.enum(["individual", "business"]),
  mode:              z.enum(["vendor_only", "full_seller"]).optional(),
  brandName:         z.string().min(2).max(120),
  legalName:         z.string().min(2).max(160),
  email:             z.string().email().max(160).optional(),
  gstNumber:         z.string().max(20).optional(),
  panNumber:         z.string().max(12).optional(),
  contactName:       z.string().min(2).max(120),
  contactPhone:      z.string().max(20).optional(),
  contactEmail:      z.string().email().max(160).optional(),
  addressLine:       z.string().max(300).optional(),
  city:              z.string().max(80).optional(),
  state:             z.string().max(80).optional(),
  pincode:           z.string().min(4).max(10),
  bankAccountName:   z.string().max(120).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  bankIfsc:          z.string().max(20).optional(),
  kycDocs:           z.array(z.object({ type: z.string(), url: z.string() })).optional(),
  hasTrademark:      z.boolean().optional(),
  trademarkNumber:   z.string().max(60).optional(),
});

type AuthedSellerRequest = Request & { user: { sellerId: string } };

@ApiTags("seller-auth")
@Controller("seller/auth")
export class AuthSellerController {
  constructor(private readonly service: AuthSellerService) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("request-otp")
  requestOtp(@Body(new ZodValidationPipe(otpRequestSchema)) body: { phone: string }) {
    return this.service.requestOtp(body.phone);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("verify-otp")
  verifyOtp(@Body(new ZodValidationPipe(otpVerifySchema)) body: { phone: string; code: string }) {
    return this.service.verifyOtp(body.phone, body.code);
  }

  @Throttle({ default: { ttl: 10_000, limit: 10 } })
  @Get("brand-check")
  brandCheck(@Query("name") name: string) {
    if (!name?.trim()) return { available: false };
    return this.service.checkBrandName(name);
  }

  // Onboarding token is passed as a Bearer header — it proves the phone was
  // OTP-verified. The body carries the seller's KYC / business details.
  @Post("onboard")
  onboard(
    @Headers("authorization") auth: string | undefined,
    @Body(new ZodValidationPipe(onboardSchema)) body: SellerOnboardInput,
  ) {
    const token = (auth ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new UnauthorizedException("Missing onboarding token");
    return this.service.onboard(token, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtSellerGuard)
  @Get("me")
  me(@Req() req: AuthedSellerRequest) {
    return this.service.getSeller(req.user.sellerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtSellerGuard)
  @Patch("me")
  updateMe(
    @Req() req: AuthedSellerRequest,
    @Body(new ZodValidationPipe(profileUpdateSchema)) body: z.infer<typeof profileUpdateSchema>,
  ) {
    return this.service.updateSeller(req.user.sellerId, body);
  }
}

import { Body, Controller, Get, Headers, NotFoundException, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { AuthB2cService } from "./auth-b2c.service";
import { B2cOtpRequestSchema, B2cOtpVerifySchema, B2cGoogleVerifySchema } from "@gifteeng/shared";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { MilestoneRewardsService } from "../milestone-rewards/milestone-rewards.service";

/**
 * Best-effort platform detection from the request's User-Agent.
 * Flutter dio sends `Dart/X (dart:io)` so we recognise app traffic by
 * the leading "Dart/" prefix. Everything else is treated as web.
 */
function detectPlatform(userAgent: string | undefined): "app" | "web" {
  if (!userAgent) return "web";
  const ua = userAgent.toLowerCase();
  if (ua.startsWith("dart/") || ua.includes("flutter")) return "app";
  return "web";
}

const updateMeB2cSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  // Birthday (no year - just month + day for wishes)
  birthMonth: z.number().int().min(1).max(12).optional(),
  birthDay: z.number().int().min(1).max(31).optional(),
  // City (free text)
  city: z.string().min(1).max(100).optional(),
});

// Profile completion bonus — award once per customer when birthday + city are
// first filled. Tracked via metadata.profileBonusAwardedAt timestamp.
const PROFILE_BONUS_GOINS = 100;

@ApiTags("auth-b2c")
@Controller("auth/b2c")
export class AuthB2cController {
  constructor(
    private service: AuthB2cService,
    private prisma: PrismaService,
    private milestone: MilestoneRewardsService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Get("me")
  async me(@Req() req: any) {
    const c = await this.prisma.customer.findUnique({ where: { id: req.user.customerId } });
    if (!c) throw new NotFoundException();
    const { passwordHash: _pw, ...rest } = c;
    return rest;
  }

  /**
   * POST /api/auth/b2c/me/milestone-claim/seen
   *
   * Marks the customer's pending milestone-reward celebration as seen so the
   * confetti popup doesn't fire again. Frontend calls this after the popup
   * has been dismissed.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Post("me/milestone-claim/seen")
  async markMilestoneClaimSeen(@Req() req: any) {
    const c = await this.prisma.customer.findUnique({
      where: { id: req.user.customerId },
    });
    if (!c) throw new NotFoundException();
    const meta = (c.metadata as Record<string, unknown> | null) ?? {};
    const claim = meta.milestoneClaim as Record<string, unknown> | undefined;
    if (claim) {
      claim.seen = true;
      await this.prisma.customer.update({
        where: { id: req.user.customerId },
        data:  { metadata: { ...meta, milestoneClaim: claim } as any },
      });
    }
    return { ok: true };
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2cGuard)
  @Patch("me")
  async patchMe(
    @Req() req: any,
    @Body(new ZodValidationPipe(updateMeB2cSchema))
    body: z.infer<typeof updateMeB2cSchema>,
  ) {
    // Load existing to compute the profile-bonus delta.
    const before = await this.prisma.customer.findUnique({
      where: { id: req.user.customerId },
    });
    if (!before) throw new NotFoundException();

    const beforeMeta = (before.metadata as Record<string, unknown> | null) ?? {};
    const hadBonus = !!beforeMeta.profileBonusAwardedAt;

    // Build merged metadata only including non-undefined updates.
    const mergedMeta: Record<string, unknown> = { ...beforeMeta };
    if (body.birthMonth !== undefined) mergedMeta.birthMonth = body.birthMonth;
    if (body.birthDay   !== undefined) mergedMeta.birthDay   = body.birthDay;
    if (body.city       !== undefined) mergedMeta.city       = body.city;

    // Award 100 Goins one-time when both birthday + city are first set.
    const hasBirthday = !!(mergedMeta.birthMonth && mergedMeta.birthDay);
    const hasCity     = typeof mergedMeta.city === "string" && (mergedMeta.city as string).length > 0;
    let bonusAwarded = false;
    if (!hadBonus && hasBirthday && hasCity) {
      mergedMeta.profileBonusAwardedAt = new Date().toISOString();
      bonusAwarded = true;
    }

    // Single transactional update so coin balance + metadata stay in sync.
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.update({
        where: { id: req.user.customerId },
        data: {
          fullName: body.fullName,
          email:    body.email,
          metadata: mergedMeta as any,
          ...(bonusAwarded
            ? { coinBalance: { increment: PROFILE_BONUS_GOINS } }
            : {}),
        },
      });
      if (bonusAwarded) {
        await tx.coinTransaction.create({
          data: {
            customerId:  req.user.customerId,
            amount:      PROFILE_BONUS_GOINS,
            type:        "admin_grant",
            description: "Profile completed — birthday & city",
          },
        });
      }
      return c;
    });

    const { passwordHash: _pw, ...rest } = updated;
    return { ...rest, bonusAwarded, bonusAmount: bonusAwarded ? PROFILE_BONUS_GOINS : 0 };
  }

  // Tight throttle on OTP request — SMS costs money + a brute-force
  // bot could otherwise drain credits. 5 requests / minute / IP.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post("otp/request")
  request(@Body(new ZodValidationPipe(B2cOtpRequestSchema)) body: { phone: string }) {
    return this.service.requestOtp(body.phone);
  }

  // Verify takes a 6-digit code — at 10 attempts/minute an attacker
  // would still take ~1700 minutes to brute-force a single phone (10⁶
  // / 600 = 1666). Service-layer per-phone counter caps at 5 fails
  // before lockout, so the IP throttle is just defence-in-depth.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post("otp/verify")
  async verify(
    @Body(new ZodValidationPipe(B2cOtpVerifySchema)) body: { phone: string; code: string },
    @Headers("x-cart-session") sessionKey?: string,
    @Headers("user-agent")     userAgent?: string,
  ) {
    const result = await this.service.verifyOtp(body.phone, body.code, sessionKey);
    // Trigger milestone check on FIRST signup only — never on returning login.
    if (result.isNewSignup) {
      const kind = detectPlatform(userAgent);
      try { await this.milestone.maybeAward(result.customerId, kind); } catch { /* non-fatal */ }
    }
    return result;
  }

  /** Google Sign-In — verifies a Google ID-token issued to this app */
  @Post("google/verify")
  async googleVerify(
    @Body(new ZodValidationPipe(B2cGoogleVerifySchema)) body: { credential: string },
    @Headers("x-cart-session") sessionKey?: string,
    @Headers("user-agent")     userAgent?: string,
  ) {
    const result = await this.service.verifyGoogleCredential(body.credential, sessionKey);
    if (result.isNewSignup) {
      const kind = detectPlatform(userAgent);
      try { await this.milestone.maybeAward(result.customerId, kind); } catch { /* non-fatal */ }
    }
    return result;
  }
}

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { CartService } from "../cart/cart.service";
import { NotificationsService } from "../notifications/notifications.service";

interface GoogleTokenInfo {
  sub: string;           // Google user ID
  email: string;
  email_verified: string;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  aud: string;
  iss: string;
  exp: string;
}

@Injectable()
export class AuthB2cService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cartService: CartService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Canonical phone format: +91XXXXXXXXXX (10-digit Indian mobile).
   * Strips all non-digits, takes the last 10 digits, prepends +91.
   * Handles all input variants:
   *   "9867755441" | "919867755441" | "+919867755441" | "+91 98677 55441"
   *   → "+919867755441"
   */
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    const local = digits.length >= 10 ? digits.slice(-10) : digits;
    return `+91${local}`;
  }

  /**
   * Returns legacy storage variants of a normalized phone so we can
   * find accounts created before normalization was enforced.
   * e.g. "+919867755441" → ["919867755441", "9867755441"]
   */
  private legacyPhoneForms(normalized: string): string[] {
    return [
      normalized.slice(1),   // "919867755441"  (no +)
      normalized.slice(3),   // "9867755441"    (local only)
    ];
  }

  async requestOtp(rawPhone: string) {
    const phone = this.normalizePhone(rawPhone);
    const code = crypto.randomInt(100_000, 999_999).toString();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60_000);

    await this.prisma.phoneOtp.create({
      data: { phone, codeHash, purpose: "b2c_login", expiresAt },
    });

    // Hand off to NotificationsService → MSG91 (DLT-approved template).
    // Never blocks login flow if MSG91 fails; dev fallback logs the code.
    await this.notifications.sendLoginOtp(phone, code);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(`[DEV] OTP for ${phone}: ${code}`);
    }
    return { sent: true };
  }

  // ── Google Sign-In (ID-token verification) ───────────────────────────────
  async verifyGoogleCredential(credential: string, sessionKey?: string) {
    // Step 1: verify the ID token with Google's tokeninfo endpoint
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    );
    if (!res.ok) throw new UnauthorizedException("Invalid Google credential");

    const info = (await res.json()) as GoogleTokenInfo;

    // Step 2: validate the token was issued for OUR app
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (expectedAud && info.aud !== expectedAud) {
      throw new UnauthorizedException("Google token audience mismatch");
    }

    // Step 3: token must not be expired (Google tokeninfo handles this, but double-check)
    if (Number(info.exp) * 1000 < Date.now()) {
      throw new UnauthorizedException("Google token expired");
    }

    // Step 4: find or create customer
    let customer = await this.prisma.customer.findUnique({
      where: { googleId: info.sub },
    });

    if (!customer && info.email) {
      // Try linking to existing customer who signed up with same email via phone OTP
      customer = await this.prisma.customer.findUnique({ where: { email: info.email } });
      if (customer) {
        customer = await this.prisma.customer.update({
          where: { id: customer.id },
          data: {
            googleId: info.sub,
            avatarUrl: info.picture ?? customer.avatarUrl,
            emailVerified: true,
            lastLoginAt: new Date(),
          },
        });
      }
    }

    let isNewSignup = false;
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          email: info.email || null,
          fullName: info.name || null,
          googleId: info.sub,
          avatarUrl: info.picture || null,
          emailVerified: info.email_verified === "true",
          lastLoginAt: new Date(),
        },
      });
      isNewSignup = true;
    } else {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { lastLoginAt: new Date() },
      });
    }

    const accessToken = await this.jwt.signAsync(
      { sub: customer.id, aud: "b2c" },
      {
        secret: process.env.JWT_B2C_SECRET!,
        expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
      },
    );

    if (sessionKey && sessionKey.length > 0) {
      await this.cartService.mergeGuestIntoCustomer(sessionKey, customer.id);
    }

    return {
      accessToken,
      audience: "b2c" as const,
      expiresIn: 60 * 60 * 24 * 7,
      customerId: customer.id,
      isNewSignup,
    };
  }

  async verifyOtp(rawPhone: string, code: string, sessionKey?: string) {
    const phone = this.normalizePhone(rawPhone);

    // ── Test bypass (dummy login, never runs in production) ─────────────────
    const TEST_PHONE = this.normalizePhone(process.env.TEST_PHONE ?? "+919999999999");
    const TEST_OTP   = process.env.TEST_OTP   ?? "000000";
    const isTestBypass =
      process.env.NODE_ENV !== "production" &&
      phone === TEST_PHONE &&
      code === TEST_OTP;

    if (!isTestBypass) {
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const otp = await this.prisma.phoneOtp.findFirst({
        where: { phone, codeHash, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (!otp) throw new UnauthorizedException("Invalid or expired code");

      await this.prisma.phoneOtp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
    }

    // Look up by canonical phone first.
    let customer = await this.prisma.customer.findUnique({ where: { phone } });

    // Auto-migrate: if not found, check legacy formats (accounts stored before
    // normalization was enforced, e.g. "919867755441" or "9867755441").
    if (!customer) {
      const legacy = this.legacyPhoneForms(phone);
      customer = await this.prisma.customer.findFirst({
        where: { phone: { in: legacy } },
      });
      if (customer) {
        // Rewrite the phone to canonical format so future lookups work.
        customer = await this.prisma.customer.update({
          where: { id: customer.id },
          data: { phone, phoneVerified: true, lastLoginAt: new Date() },
        });
      }
    }

    let isNewSignup = false;
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone, phoneVerified: true, lastLoginAt: new Date() },
      });
      isNewSignup = true;
    } else if (!customer.phoneVerified) {
      customer = await this.prisma.customer.update({
        where: { id: customer.id },
        data: { phoneVerified: true, lastLoginAt: new Date() },
      });
    } else {
      // returning login — bump lastLoginAt so inactivity rewards work
      await this.prisma.customer.update({
        where: { id: customer.id },
        data:  { lastLoginAt: new Date() },
      });
    }

    const accessToken = await this.jwt.signAsync(
      { sub: customer.id, aud: "b2c" },
      { secret: process.env.JWT_B2C_SECRET!, expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" },
    );

    if (sessionKey && sessionKey.length > 0) {
      await this.cartService.mergeGuestIntoCustomer(sessionKey, customer.id);
    }

    return {
      accessToken,
      audience: "b2c" as const,
      expiresIn: 60 * 60 * 24 * 7,
      customerId: customer.id,
      isNewSignup,
    };
  }
}

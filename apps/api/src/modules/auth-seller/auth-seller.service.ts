import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

// Onboarding payload — the form a new seller fills after OTP verification.
export interface SellerOnboardInput {
  type: "individual" | "business";
  mode?: "vendor_only" | "full_seller";
  brandName: string;
  legalName: string;
  email?: string;
  gstNumber?: string;
  panNumber?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  pincode: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  kycDocs?: { type: string; url: string }[];
  hasTrademark?: boolean;
  trademarkNumber?: string;
}

const OTP_TTL_MS = 10 * 60_000;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN ?? "7d";
const ONBOARD_TOKEN_TTL = "30m";

@Injectable()
export class AuthSellerService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private notifications: NotificationsService,
  ) {}

  private get secret(): string {
    const s = process.env.JWT_SELLER_SECRET;
    if (!s) throw new Error("JWT_SELLER_SECRET is not set");
    return s;
  }

  /** Normalise to the last 10 digits — Indian mobile numbers. */
  private normalizePhone(raw: string): string {
    const digits = (raw ?? "").replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (last10.length !== 10) {
      throw new BadRequestException("Enter a valid 10-digit mobile number");
    }
    return last10;
  }

  private hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  // ── Step 1: request an OTP ──────────────────────────────────────────────
  async requestOtp(rawPhone: string): Promise<{ sent: true }> {
    const phone = this.normalizePhone(rawPhone);
    const code = crypto.randomInt(100_000, 999_999).toString();

    await this.prisma.sellerOtp.create({
      data: {
        phone,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    await this.notifications.sendLoginOtp(phone, code);
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(`[DEV] Seller OTP for ${phone}: ${code}`);
    }
    return { sent: true };
  }

  // ── Step 2: verify the OTP ──────────────────────────────────────────────
  // Existing seller  → full seller JWT.
  // New phone        → short-lived onboarding token (proves the phone is
  //                    OTP-verified) so the onboarding form can be submitted.
  async verifyOtp(rawPhone: string, code: string): Promise<{
    needsOnboarding: boolean;
    accessToken?: string;
    onboardingToken?: string;
    seller?: unknown;
  }> {
    const phone = this.normalizePhone(rawPhone);
    const otp = await this.prisma.sellerOtp.findFirst({
      where: {
        phone,
        codeHash: this.hashCode(code),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw new UnauthorizedException("Invalid or expired code");

    await this.prisma.sellerOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const seller = await this.prisma.seller.findUnique({ where: { phone } });
    if (seller) {
      const accessToken = await this.jwt.signAsync(
        { sub: seller.id, aud: "seller" },
        { secret: this.secret, expiresIn: JWT_EXPIRES },
      );
      return { needsOnboarding: false, accessToken, seller };
    }

    // New phone — issue a scoped onboarding token carrying the phone.
    const onboardingToken = await this.jwt.signAsync(
      { sub: phone, aud: "seller-onboard" },
      { secret: this.secret, expiresIn: ONBOARD_TOKEN_TTL },
    );
    return { needsOnboarding: true, onboardingToken };
  }

  // ── Step 3: onboarding — create the Seller (status = pending) ───────────
  async onboard(onboardingToken: string, input: SellerOnboardInput): Promise<{
    accessToken: string;
    seller: unknown;
  }> {
    let phone: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; aud: string }>(
        onboardingToken,
        { secret: this.secret, audience: "seller-onboard" },
      );
      phone = payload.sub;
    } catch {
      throw new UnauthorizedException("Onboarding session expired — verify your phone again");
    }

    const existing = await this.prisma.seller.findUnique({ where: { phone } });
    if (existing) {
      throw new BadRequestException("A seller account already exists for this number");
    }

    const seller = await this.prisma.seller.create({
      data: {
        phone,
        email:             input.email ?? null,
        type:              input.type,
        mode:              input.mode ?? "full_seller",
        brandName:         input.brandName.trim(),
        legalName:         input.legalName.trim(),
        gstNumber:         input.gstNumber?.trim() || null,
        panNumber:         input.panNumber?.trim() || null,
        contactName:       input.contactName.trim(),
        contactPhone:      input.contactPhone?.trim() || null,
        contactEmail:      input.contactEmail?.trim() || null,
        addressLine:       input.addressLine?.trim() || null,
        city:              input.city?.trim() || null,
        state:             input.state?.trim() || null,
        pincode:           input.pincode.trim(),
        bankAccountName:   input.bankAccountName?.trim() || null,
        bankAccountNumber: input.bankAccountNumber?.trim() || null,
        bankIfsc:          input.bankIfsc?.trim() || null,
        kycDocs:           (input.kycDocs ?? []) as unknown as object,
        hasTrademark:      input.hasTrademark ?? null,
        trademarkNumber:   input.trademarkNumber?.trim() || null,
        status:            "pending",
      },
    });

    // Slug: kebab(brandName) + first 8 chars of UUID — deterministic and unique
    const brandSlug = input.brandName.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "seller";
    await this.prisma.seller.update({
      where: { id: seller.id },
      data: { slug: `${brandSlug}-${seller.id.slice(0, 8)}` },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: seller.id, aud: "seller" },
      { secret: this.secret, expiresIn: JWT_EXPIRES },
    );
    return { accessToken, seller };
  }

  // ── Authenticated: current seller profile ───────────────────────────────
  async getSeller(sellerId: string): Promise<unknown> {
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new UnauthorizedException("Seller account not found");
    return seller;
  }

  async updateSeller(sellerId: string, data: {
    brandName?: string;
    email?: string | null;
    contactName?: string;
    contactPhone?: string | null;
    contactEmail?: string | null;
    addressLine?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankIfsc?: string | null;
    dispatchDays?: number;
  }): Promise<unknown> {
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new UnauthorizedException("Seller account not found");
    return this.prisma.seller.update({
      where: { id: sellerId },
      data: {
        ...(data.brandName   !== undefined && { brandName:   data.brandName.trim()   }),
        ...(data.contactName !== undefined && { contactName: data.contactName.trim() }),
        ...(data.pincode     !== undefined && { pincode:     data.pincode.trim()     }),
        ...(data.email       !== undefined && { email:       data.email?.trim() || null }),
        ...(data.contactPhone  !== undefined && { contactPhone:  data.contactPhone?.trim()  || null }),
        ...(data.contactEmail  !== undefined && { contactEmail:  data.contactEmail?.trim()  || null }),
        ...(data.addressLine   !== undefined && { addressLine:   data.addressLine?.trim()   || null }),
        ...(data.city          !== undefined && { city:          data.city?.trim()          || null }),
        ...(data.state         !== undefined && { state:         data.state?.trim()         || null }),
        ...(data.bankAccountName   !== undefined && { bankAccountName:   data.bankAccountName?.trim()   || null }),
        ...(data.bankAccountNumber !== undefined && { bankAccountNumber: data.bankAccountNumber?.trim() || null }),
        ...(data.bankIfsc          !== undefined && { bankIfsc:          data.bankIfsc?.trim()          || null }),
        ...(data.dispatchDays !== undefined && { dispatchDays: data.dispatchDays }),
      },
    });
  }

  // ── Super-admin: seller approval queue ──────────────────────────────────
  async listSellers(status?: string): Promise<unknown[]> {
    const valid = ["pending", "approved", "rejected", "suspended"];
    return this.prisma.seller.findMany({
      where: status && valid.includes(status) ? { status: status as never } : {},
      orderBy: { createdAt: "desc" },
    });
  }

  async approveSeller(id: string): Promise<unknown> {
    const seller = await this.prisma.seller.findUnique({ where: { id } });
    if (!seller) throw new NotFoundException("Seller not found");
    return this.prisma.seller.update({
      where: { id },
      data: { status: "approved", approvedAt: new Date(), rejectedReason: null },
    });
  }

  async rejectSeller(id: string, reason: string): Promise<unknown> {
    const seller = await this.prisma.seller.findUnique({ where: { id } });
    if (!seller) throw new NotFoundException("Seller not found");
    return this.prisma.seller.update({
      where: { id },
      data: { status: "rejected", rejectedReason: reason.trim() || "Not specified" },
    });
  }

  async suspendSeller(id: string, reason: string): Promise<unknown> {
    const seller = await this.prisma.seller.findUnique({ where: { id } });
    if (!seller) throw new NotFoundException("Seller not found");
    return this.prisma.seller.update({
      where: { id },
      data: { status: "suspended", rejectedReason: reason.trim() || "Suspended by admin" },
    });
  }

  async checkBrandName(name: string): Promise<{ available: boolean }> {
    const existing = await this.prisma.seller.findFirst({
      where: { brandName: { equals: name.trim(), mode: "insensitive" } },
      select: { id: true },
    });
    return { available: !existing };
  }
}

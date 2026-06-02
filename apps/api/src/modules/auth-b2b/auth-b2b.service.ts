import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service";
import type { UserRole } from "@gifteeng/shared";

@Injectable()
export class AuthB2bService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    // Normalize so "Admin@x.com" and "admin@x.com" don't create / authenticate
    // against two separate rows. team.service.ts:invite() already lowercases
    // on write — this matches that on the read side.
    const normalized = (email ?? "").trim().toLowerCase();
    const user = await this.prisma.companyUser.findFirst({
      where: { email: normalized, isActive: true },
    });
    if (!user || !user.passwordHash) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException();

    await this.prisma.companyUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        companyId: user.companyId,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        aud: "b2b",
      },
      { secret: process.env.JWT_B2B_SECRET!, expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" },
    );
    return { accessToken, audience: "b2b" as const, expiresIn: 60 * 60 * 24 * 7 };
  }

  /**
   * Sets or updates the password for a user who has no passwordHash yet
   * (e.g. invited via magic-link flow). One-time use per account.
   */
  /**
   * @deprecated Use TeamService.acceptInvite(token, password) — see
   * docs/SECURITY_AUDIT.md finding C-3 for why the email-only flow was
   * removed. This stub now refuses any row that has an unused invite
   * token, which means every freshly-invited user (since the migration)
   * is unreachable from this path. Legacy rows created before the new
   * flow shipped can still use this once, but the route's caller is
   * throttled and email-normalized.
   */
  async setPassword(email: string, password: string) {
    const normalized = (email ?? "").trim().toLowerCase();
    const user = await this.prisma.companyUser.findFirst({ where: { email: normalized } });
    if (!user) throw new UnauthorizedException("User not found");
    if (user.passwordHash) throw new ConflictException("Password already set. Use forgot-password.");
    // Hard-deny if there is an outstanding invite token — operator should
    // use the accept-invite link instead.
    if (user.inviteTokenHash) {
      throw new ConflictException(
        "This account is pending invite acceptance. Open the invite link you were sent instead.",
      );
    }
    const hash = await argon2.hash(password);
    await this.prisma.companyUser.update({ where: { id: user.id }, data: { passwordHash: hash, isActive: true } });
    return { ok: true };
  }

  /**
   * Bootstrap: creates the first super-admin + company if none exist.
   * Disabled once any super_admin is present.
   */
  async bootstrap(input: { email: string; password: string; fullName: string; companyName: string }) {
    const existing = await this.prisma.companyUser.findFirst({ where: { role: "super_admin" } });
    if (existing) throw new ConflictException("Super admin already exists. Use login instead.");

    // Ensure a company exists
    let company = await this.prisma.company.findFirst();
    if (!company) {
      company = await this.prisma.company.create({
        data: { name: input.companyName, slug: input.companyName.toLowerCase().replace(/\s+/g, "-") },
      });
    }

    const hash = await argon2.hash(input.password);
    const user = await this.prisma.companyUser.create({
      data: {
        companyId: company.id,
        email: (input.email ?? "").trim().toLowerCase(),
        fullName: input.fullName,
        role: "super_admin",
        passwordHash: hash,
        isActive: true,
      },
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        companyId: company.id,
        role: user.role,
        email: user.email,
        fullName: user.fullName,
        aud: "b2b",
      },
      { secret: process.env.JWT_B2B_SECRET!, expiresIn: "7d" },
    );
    return { ok: true, accessToken, email: user.email, role: user.role };
  }

  /**
   * Backwards-compatible invite used by non-team-page flows (e.g. the
   * B2B-catalog enquiry approval path in catalogs.service). Internally
   * generates a single-use invite token via the same mechanism as
   * TeamService.invite() — so the resulting CompanyUser row is *not*
   * vulnerable to the legacy /set-password takeover described in
   * docs/SECURITY_AUDIT.md C-3. Callers that don't surface inviteUrl to
   * the operator should pivot to TeamService.invite() so the link is
   * actually shareable; for now we just ensure the row is safe even if
   * the URL is silently dropped.
   */
  async invite(
    companyId: string,
    invitedBy: string,
    input: { email: string; fullName: string; role: UserRole },
  ): Promise<{ id: string; inviteUrl: string; expiresAt: Date }> {
    const email = (input.email ?? "").trim().toLowerCase();
    const existing = await this.prisma.companyUser.findUnique({
      where: { companyId_email: { companyId, email } },
    });
    if (existing) throw new ConflictException("User already exists for this company");

    const raw = (await import("crypto")).randomBytes(32).toString("base64url");
    const hash = (await import("crypto")).createHash("sha256").update(raw).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const user = await this.prisma.companyUser.create({
      data: {
        companyId,
        email,
        fullName: input.fullName,
        role: input.role,
        invitedBy,
        invitedAt: new Date(),
        inviteTokenHash:      hash,
        inviteTokenExpiresAt: expiresAt,
        isActive: false,
      },
    });
    const base = (process.env.PUBLIC_ADMIN_URL ?? process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
    const inviteUrl = `${base}/super-admin/accept-invite?token=${encodeURIComponent(raw)}`;
    return { id: user.id, inviteUrl, expiresAt };
  }
}

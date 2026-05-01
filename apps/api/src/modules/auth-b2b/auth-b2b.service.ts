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
    const user = await this.prisma.companyUser.findFirst({
      where: { email, isActive: true },
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
  async setPassword(email: string, password: string) {
    const user = await this.prisma.companyUser.findFirst({ where: { email } });
    if (!user) throw new UnauthorizedException("User not found");
    if (user.passwordHash) throw new ConflictException("Password already set. Use forgot-password.");
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
        email: input.email,
        fullName: input.fullName,
        role: "super_admin",
        passwordHash: hash,
        isActive: true,
      },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, companyId: company.id, role: user.role, aud: "b2b" },
      { secret: process.env.JWT_B2B_SECRET!, expiresIn: "7d" },
    );
    return { ok: true, accessToken, email: user.email, role: user.role };
  }

  async invite(companyId: string, invitedBy: string, input: { email: string; fullName: string; role: UserRole }) {
    const existing = await this.prisma.companyUser.findUnique({
      where: { companyId_email: { companyId, email: input.email } },
    });
    if (existing) throw new ConflictException("User already exists for this company");

    const user = await this.prisma.companyUser.create({
      data: {
        companyId,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        invitedBy,
        invitedAt: new Date(),
      },
    });
    // TODO: NotificationsService.sendInvite(user.id) — magic link email
    return { id: user.id };
  }
}

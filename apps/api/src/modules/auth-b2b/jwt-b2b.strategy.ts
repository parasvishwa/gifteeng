import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { UserRole } from "@gifteeng/shared";
import { PrismaService } from "../../prisma/prisma.service";

export type B2bJwtPayload = {
  sub: string; // companyUserId
  companyId: string;
  role: UserRole;
  aud: "b2b";
  iat?: number;
  exp?: number;
};

/// Decorated `request.user` shape — controllers + guards can rely on this.
export interface B2bCurrentUser {
  companyUserId: string;
  companyId:     string;
  role:          UserRole;
  /// Effective extra permissions from `company_users.permissions` (NOT the
  /// role defaults — those are merged in by `hasPermission()`). Empty array
  /// for super_admin / users with no extra grants. Re-fetched on every
  /// request so permission edits take effect immediately, no token rotation.
  permissions:   string[];
  audience:      "b2b";
}

@Injectable()
export class JwtB2bStrategy extends PassportStrategy(Strategy, "jwt-b2b") {
  constructor(private prisma: PrismaService) {
    // Refuse to construct the strategy with a missing/weak secret. The
    // production-secret check in main.ts already gates startup, but removing
    // the `?? "dev-b2b"` fallback here eliminates the chance that a typo'd
    // NODE_ENV (e.g. "developement") silently lets us sign tokens with a
    // known-bad key.
    const secret = process.env.JWT_B2B_SECRET;
    if (!secret) {
      throw new Error("JWT_B2B_SECRET is not set — refusing to start B2B auth strategy");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      audience: "b2b",
    });
  }

  async validate(payload: B2bJwtPayload): Promise<B2bCurrentUser> {
    // Pull the latest permissions array so that an admin can revoke/grant
    // access without forcing the user to log out.
    const row = await this.prisma.companyUser.findUnique({
      where: { id: payload.sub },
      select: { permissions: true, isActive: true, role: true },
    });
    // Hard-reject deactivated / deleted accounts. Previously we returned an
    // empty `permissions` array which kept the user authenticated for any
    // endpoint that only checks JwtB2bGuard (e.g. /auth/b2b/me).
    if (!row || row.isActive === false) {
      throw new UnauthorizedException("Account disabled");
    }
    return {
      companyUserId: payload.sub,
      companyId:     payload.companyId,
      role:          row.role as UserRole,
      permissions:   row.permissions ?? [],
      audience:      payload.aud,
    };
  }
}

import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { UserRole } from "@gifteeng/shared";

export type B2bJwtPayload = {
  sub: string; // companyUserId
  companyId: string;
  role: UserRole;
  aud: "b2b";
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtB2bStrategy extends PassportStrategy(Strategy, "jwt-b2b") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_B2B_SECRET ?? "dev-b2b",
      audience: "b2b",
    });
  }

  async validate(payload: B2bJwtPayload) {
    return {
      companyUserId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      audience: payload.aud,
    };
  }
}

import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export type B2cJwtPayload = {
  sub: string; // customerId
  aud: "b2c";
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtB2cStrategy extends PassportStrategy(Strategy, "jwt-b2c") {
  constructor() {
    super({
      // Accept either an Authorization: Bearer header (default) OR a
      // ?token= query param. Query-string fallback exists for endpoints
      // EventSource hits — browsers don't let you set Authorization
      // headers on EventSource, so /api/me/events relies on this.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter("token"),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_B2C_SECRET ?? "dev-b2c",
      audience: "b2c",
    });
  }

  async validate(payload: B2cJwtPayload) {
    return { customerId: payload.sub, audience: payload.aud };
  }
}

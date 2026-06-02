import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

interface SellerJwtPayload {
  sub: string;       // seller id
  aud: string;       // "seller"
}

/**
 * Passport JWT strategy for the seller portal. Mirrors the B2C strategy:
 * Bearer header or ?token= query param, audience-scoped to "seller".
 */
@Injectable()
export class JwtSellerStrategy extends PassportStrategy(Strategy, "jwt-seller") {
  constructor() {
    const secret = process.env.JWT_SELLER_SECRET;
    if (!secret) {
      throw new Error("JWT_SELLER_SECRET is not set — refusing to start seller auth strategy");
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter("token"),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      audience: "seller",
    });
  }

  async validate(payload: SellerJwtPayload) {
    return { sellerId: payload.sub, audience: payload.aud };
  }
}

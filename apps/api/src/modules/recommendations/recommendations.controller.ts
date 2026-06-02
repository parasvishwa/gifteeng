import { Controller, Get, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { RecommendationsService } from "./recommendations.service";

/**
 * Public endpoint — works for both anonymous and logged-in customers.
 * Anonymous browsers pass `viewed=slug1,slug2,…` from localStorage; logged-in
 * customers pass their B2C bearer token (which we soft-decode — invalid tokens
 * silently fall through to the anonymous path).
 */
@ApiTags("recommendations")
@Controller("recommendations")
export class RecommendationsController {
  constructor(private service: RecommendationsService, private jwt: JwtService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query("viewed") viewedRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const limit = Number(limitRaw) || 12;
    const viewedSlugs = viewedRaw
      ? viewedRaw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12)
      : [];

    const customerId = await this.softDecodeCustomer(req);
    return this.service.getRecommendations({ customerId, viewedSlugs, limit });
  }

  // Soft-decode: the recommendation endpoint is public, so we don't 401 on
  // missing/invalid tokens. We just try to extract the customer id; if it
  // fails, the request is treated as anonymous.
  private async softDecodeCustomer(req: Request): Promise<string | undefined> {
    const auth = req.headers.authorization || (req.headers as any).Authorization;
    if (!auth || typeof auth !== "string" || !auth.toLowerCase().startsWith("bearer ")) return undefined;
    const token = auth.slice(7).trim();
    if (!token) return undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; aud?: string }>(token, {
        secret: process.env.JWT_B2C_SECRET,
      });
      // Only B2C customer tokens identify a real Customer row. B2B tokens have
      // a separate audience and a different ID space.
      if (payload?.aud === "b2c" && payload.sub) return payload.sub;
      return undefined;
    } catch {
      return undefined;
    }
  }
}

import {
  Controller, Delete, Get, Param, Post, Req, UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtB2cGuard } from "../../common/guards/jwt-b2c.guard";
import { OptionalJwtB2cGuard } from "../../common/guards/optional-jwt-b2c.guard";
import { MarketplaceService } from "./marketplace.service";

type B2cRequest = Request & { user?: { customerId: string } };

@Controller("store")
export class SellerStoreController {
  constructor(private readonly service: MarketplaceService) {}

  @UseGuards(OptionalJwtB2cGuard)
  @Get("sellers/:slug")
  getStore(@Param("slug") slug: string, @Req() req: B2cRequest) {
    return this.service.getSellerStore(slug, req.user?.customerId);
  }

  @UseGuards(JwtB2cGuard)
  @Post("sellers/:slug/follow")
  follow(@Param("slug") slug: string, @Req() req: B2cRequest) {
    return this.service.followSeller(slug, req.user!.customerId);
  }

  @UseGuards(JwtB2cGuard)
  @Delete("sellers/:slug/follow")
  unfollow(@Param("slug") slug: string, @Req() req: B2cRequest) {
    return this.service.unfollowSeller(slug, req.user!.customerId);
  }

  @Post("products/:id/view")
  trackView(@Param("id") id: string) {
    return this.service.trackProductView(id);
  }
}

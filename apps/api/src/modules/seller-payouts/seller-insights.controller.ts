import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtSellerGuard } from "../../common/guards/jwt-seller.guard";
import { SellerInsightsService } from "./seller-insights.service";

type SellerReq = Request & { user: { sellerId: string } };

@ApiTags("seller-insights")
@ApiBearerAuth()
@UseGuards(JwtSellerGuard)
@Controller("seller/insights")
export class SellerInsightsController {
  constructor(private svc: SellerInsightsService) {}

  @Get("payout-summary")
  payoutSummary(
    @Req() req: SellerReq,
    @Query("from") from?: string,
    @Query("to")   to?: string,
  ) {
    return this.svc.getPayoutSummary(req.user.sellerId, from, to);
  }

  @Get("order-summary")
  orderSummary(
    @Req() req: SellerReq,
    @Query("from")   from?: string,
    @Query("to")     to?: string,
    @Query("status") status?: string,
    @Query("page")   page?: string,
    @Query("limit")  limit?: string,
  ) {
    return this.svc.getOrderSummary(
      req.user.sellerId, from, to, status,
      page  ? parseInt(page,  10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get("product-summary")
  productSummary(
    @Req() req: SellerReq,
    @Query("from") from?: string,
    @Query("to")   to?: string,
  ) {
    return this.svc.getProductSummary(req.user.sellerId, from, to);
  }
}

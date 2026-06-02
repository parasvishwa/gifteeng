import { Controller, Get, Param, UseGuards, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtSellerGuard } from "../../common/guards/jwt-seller.guard";
import { SellerPayoutsService } from "./seller-payouts.service";

type SellerReq = Request & { user: { sellerId: string } };

@ApiTags("seller-payouts")
@ApiBearerAuth()
@UseGuards(JwtSellerGuard)
@Controller("seller")
export class SellerPayoutsController {
  constructor(private svc: SellerPayoutsService) {}

  @Get("analytics")
  analytics(@Req() req: SellerReq) {
    return this.svc.getSellerAnalytics(req.user.sellerId);
  }

  @Get("payouts")
  payouts(@Req() req: SellerReq) {
    return this.svc.getSellerPayouts(req.user.sellerId);
  }

  @Get("payouts/outstanding")
  outstanding(@Req() req: SellerReq) {
    return this.svc.getOutstandingPayments(req.user.sellerId);
  }

  @Get("payouts/:id/invoice")
  payoutInvoice(@Req() req: SellerReq, @Param("id") id: string) {
    return this.svc.getPayoutInvoiceData(id, req.user.sellerId);
  }
}

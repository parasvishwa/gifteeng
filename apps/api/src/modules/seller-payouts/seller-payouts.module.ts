import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthSellerModule } from "../auth-seller/auth-seller.module";
import { SellerPayoutsService } from "./seller-payouts.service";
import { SellerPayoutsController } from "./seller-payouts.controller";
import { AdminPayoutsController } from "./admin-payouts.controller";
import { SellerInsightsController } from "./seller-insights.controller";
import { SellerInsightsService } from "./seller-insights.service";
import { SellerReportsController } from "./seller-reports.controller";

@Module({
  imports: [PrismaModule, AuthSellerModule],
  controllers: [SellerPayoutsController, AdminPayoutsController, SellerInsightsController, SellerReportsController],
  providers: [SellerPayoutsService, SellerInsightsService],
  exports: [SellerPayoutsService],
})
export class SellerPayoutsModule {}

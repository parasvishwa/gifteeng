import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MarketplaceModule } from "../marketplace/marketplace.module";
import { OrderRoutingService } from "./order-routing.service";
import { SellerOrdersController } from "./seller-orders.controller";
import { AdminAssignmentsController } from "./admin-assignments.controller";
import { AuthSellerModule } from "../auth-seller/auth-seller.module";

@Module({
  imports: [PrismaModule, MarketplaceModule, AuthSellerModule],
  controllers: [SellerOrdersController, AdminAssignmentsController],
  providers: [OrderRoutingService],
  exports: [OrderRoutingService],
})
export class OrderRoutingModule {}

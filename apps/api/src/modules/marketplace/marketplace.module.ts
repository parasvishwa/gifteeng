import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthSellerModule } from "../auth-seller/auth-seller.module";
import { AuthB2cModule } from "../auth-b2c/auth-b2c.module";
import { MarketplaceService } from "./marketplace.service";
import { SellerProductsController } from "./seller-products.controller";
import { MarketplaceAdminController } from "./marketplace-admin.controller";
import { MarketplacePublicController } from "./marketplace-public.controller";
import { SellerStoreController } from "./seller-store.controller";

@Module({
  imports: [PrismaModule, AuthSellerModule, AuthB2cModule],
  controllers: [SellerProductsController, MarketplaceAdminController, MarketplacePublicController, SellerStoreController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}

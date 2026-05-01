import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ShopifyMigrateController } from "./shopify-migrate.controller";
import { ShopifyMigrateService } from "./shopify-migrate.service";

@Module({
  imports: [PrismaModule],
  controllers: [ShopifyMigrateController],
  providers: [ShopifyMigrateService],
})
export class ShopifyMigrateModule {}

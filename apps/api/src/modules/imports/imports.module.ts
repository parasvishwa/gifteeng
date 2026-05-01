import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ImportsController } from "./imports.controller";
import { ImportsService } from "./imports.service";

/**
 * ImportsModule — unified product import surface.
 *
 * Replaces the six legacy B2C admin pages (AdminAmazonImport,
 * AdminShopifyImport, AdminProductImport, AdminImportData,
 * AdminUniversalImport, AdminMarketplace) with a single controller + service
 * pair. Mounted at /api/imports.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ImportsController],
  providers: [ImportsService],
  exports: [ImportsService],
})
export class ImportsModule {}

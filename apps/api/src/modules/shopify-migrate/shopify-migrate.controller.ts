import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { ShopifyMigrateService } from "./shopify-migrate.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

/**
 * Shopify migrate — admin-only one-shot importer.
 *
 * Two endpoints accept multipart CSV uploads:
 *   POST /api/shopify-migrate/customers   (Shopify "Customers" export)
 *   POST /api/shopify-migrate/orders      (Shopify "Orders" export)
 *
 * Both honour `?dryRun=true` to preview totals without writing. The
 * service handles dedup (by Shopify id / phone / email) so re-running
 * is safe.
 */
@ApiTags("shopify-migrate")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("shopify-migrate")
export class ShopifyMigrateController {
  constructor(private readonly service: ShopifyMigrateService) {}

  @Post("customers")
  @UseInterceptors(FileInterceptor("file"))
  async customers(
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
    @Query("dryRun") dryRun?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("CSV upload required (field: 'file')");
    }
    return this.service.importCustomers(file.buffer, {
      dryRun: dryRun === "true" || dryRun === "1",
    });
  }

  @Post("orders")
  @UseInterceptors(FileInterceptor("file"))
  async orders(
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
    @Query("dryRun") dryRun?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("CSV upload required (field: 'file')");
    }
    return this.service.importOrders(file.buffer, {
      dryRun: dryRun === "true" || dryRun === "1",
    });
  }
}

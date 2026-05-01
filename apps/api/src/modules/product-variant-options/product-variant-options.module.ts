import { Module } from "@nestjs/common";
import { ProductVariantOptionsController } from "./product-variant-options.controller";
import { ProductVariantOptionsService } from "./product-variant-options.service";

@Module({
  controllers: [ProductVariantOptionsController],
  providers: [ProductVariantOptionsService],
  exports: [ProductVariantOptionsService],
})
export class ProductVariantOptionsModule {}

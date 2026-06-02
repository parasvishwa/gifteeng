import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { SpApiModule } from "../amazon-sp/sp-api.module";
import { SeoEnrichmentModule } from "../seo/seo-enrichment.module";
import { AuthB2bModule } from "../auth-b2b/auth-b2b.module";

@Module({
  imports: [SpApiModule, SeoEnrichmentModule, AuthB2bModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}

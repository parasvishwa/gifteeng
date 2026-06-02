import { Module } from "@nestjs/common";
import { SeoEnrichmentService } from "./seo-enrichment.service";
import { SeoCronService }       from "./seo-cron.service";

@Module({
  providers: [SeoEnrichmentService, SeoCronService],
  exports:   [SeoEnrichmentService],
})
export class SeoEnrichmentModule {}

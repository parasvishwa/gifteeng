import { Module } from "@nestjs/common";
import { MarketplaceLinksController } from "./marketplace-links.controller";
import { MarketplaceLinksService } from "./marketplace-links.service";

@Module({
  controllers: [MarketplaceLinksController],
  providers: [MarketplaceLinksService],
})
export class MarketplaceLinksModule {}

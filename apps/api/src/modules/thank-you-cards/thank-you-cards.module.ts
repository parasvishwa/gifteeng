import { Module } from "@nestjs/common";
import { ThankYouCardsController } from "./thank-you-cards.controller";
import { ThankYouCardsService } from "./thank-you-cards.service";

@Module({
  controllers: [ThankYouCardsController],
  providers: [ThankYouCardsService],
  exports: [ThankYouCardsService],
})
export class ThankYouCardsModule {}

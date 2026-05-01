import { Module } from "@nestjs/common";
import { AmazonReviewsController } from "./amazon-reviews.controller";
import { AmazonReviewsService } from "./amazon-reviews.service";
import { ImportsModule } from "../imports/imports.module";

@Module({
  imports: [ImportsModule],
  controllers: [AmazonReviewsController],
  providers: [AmazonReviewsService],
  exports: [AmazonReviewsService],
})
export class AmazonReviewsModule {}

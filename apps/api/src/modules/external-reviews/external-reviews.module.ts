import { Module } from "@nestjs/common";
import { ExternalReviewsController } from "./external-reviews.controller";
import { ExternalReviewsService } from "./external-reviews.service";
import { PrismaService } from "../../prisma/prisma.service";

@Module({
  controllers: [ExternalReviewsController],
  providers:   [ExternalReviewsService, PrismaService],
  exports:     [ExternalReviewsService],
})
export class ExternalReviewsModule {}

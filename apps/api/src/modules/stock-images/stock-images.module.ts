import { Module } from "@nestjs/common";
import { StockImagesController } from "./stock-images.controller";
import { StockImagesService } from "./stock-images.service";

@Module({
  controllers: [StockImagesController],
  providers: [StockImagesService],
  exports: [StockImagesService],
})
export class StockImagesModule {}

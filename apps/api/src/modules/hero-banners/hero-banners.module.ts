import { Module } from "@nestjs/common";
import { HeroBannersController } from "./hero-banners.controller";
import { HeroBannersService } from "./hero-banners.service";
import { PrismaService } from "../../prisma/prisma.service";

@Module({
  controllers: [HeroBannersController],
  providers:   [HeroBannersService, PrismaService],
  exports:     [HeroBannersService],
})
export class HeroBannersModule {}

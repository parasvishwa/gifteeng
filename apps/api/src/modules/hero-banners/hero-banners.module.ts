import { Module } from "@nestjs/common";
import { HeroBannersController } from "./hero-banners.controller";
import { HeroBannersService } from "./hero-banners.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthB2bModule } from "../auth-b2b/auth-b2b.module";

@Module({
  imports:     [AuthB2bModule],
  controllers: [HeroBannersController],
  providers:   [HeroBannersService, PrismaService],
  exports:     [HeroBannersService],
})
export class HeroBannersModule {}

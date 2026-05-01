import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SpApiController } from "./sp-api.controller";
import { SpApiService } from "./sp-api.service";

@Module({
  imports: [PrismaModule],
  controllers: [SpApiController],
  providers: [SpApiService],
  exports: [SpApiService],
})
export class SpApiModule {}

import { Module } from "@nestjs/common";
import { DuetController } from "./duet.controller";
import { DuetService } from "./duet.service";

@Module({
  controllers: [DuetController],
  providers: [DuetService],
  exports: [DuetService],
})
export class DuetModule {}

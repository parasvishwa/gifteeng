import { Module } from "@nestjs/common";
import { FlashJackpotController } from "./flash-jackpot.controller";
import { FlashJackpotService } from "./flash-jackpot.service";

@Module({
  controllers: [FlashJackpotController],
  providers: [FlashJackpotService],
  exports: [FlashJackpotService],
})
export class FlashJackpotModule {}

import { Module } from "@nestjs/common";
import { InactivityRewardsController } from "./inactivity-rewards.controller";
import { InactivityRewardsService } from "./inactivity-rewards.service";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports:     [NotificationsModule],
  controllers: [InactivityRewardsController],
  providers:   [InactivityRewardsService, PrismaService],
  exports:     [InactivityRewardsService],
})
export class InactivityRewardsModule {}

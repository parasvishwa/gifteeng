import { Module } from "@nestjs/common";
import { MilestoneRewardsController } from "./milestone-rewards.controller";
import { MilestoneRewardsService } from "./milestone-rewards.service";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports:     [NotificationsModule],
  controllers: [MilestoneRewardsController],
  providers:   [MilestoneRewardsService, PrismaService],
  exports:     [MilestoneRewardsService],
})
export class MilestoneRewardsModule {}

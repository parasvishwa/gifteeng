import { Module } from "@nestjs/common";
import { CartRecoveryController } from "./cart-recovery.controller";
import { CartRecoveryService } from "./cart-recovery.service";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports:     [NotificationsModule],
  controllers: [CartRecoveryController],
  providers:   [CartRecoveryService, PrismaService],
  exports:     [CartRecoveryService],
})
export class CartRecoveryModule {}

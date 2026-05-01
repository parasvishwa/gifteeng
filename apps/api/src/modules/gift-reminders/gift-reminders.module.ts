import { Module } from "@nestjs/common";
import { GiftRemindersController } from "./gift-reminders.controller";
import { GiftRemindersService } from "./gift-reminders.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [GiftRemindersController],
  providers: [GiftRemindersService],
  exports: [GiftRemindersService],
})
export class GiftRemindersModule {}

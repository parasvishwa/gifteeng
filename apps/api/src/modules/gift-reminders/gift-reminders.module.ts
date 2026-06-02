import { Module } from "@nestjs/common";
import { GiftRemindersController } from "./gift-reminders.controller";
import { GiftRemindersService } from "./gift-reminders.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { CartModule } from "../cart/cart.module";

@Module({
  imports: [NotificationsModule, CartModule],
  controllers: [GiftRemindersController],
  providers: [GiftRemindersService],
  exports: [GiftRemindersService],
})
export class GiftRemindersModule {}

import { Module } from "@nestjs/common";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { CartModule } from "../cart/cart.module";
import { WalletModule } from "../wallet/wallet.module";
import { OrdersModule } from "../orders/orders.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RewardsModule } from "../rewards/rewards.module";
import { StickersModule } from "../stickers/stickers.module";

@Module({
  imports: [CartModule, WalletModule, OrdersModule, NotificationsModule, RewardsModule, StickersModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}

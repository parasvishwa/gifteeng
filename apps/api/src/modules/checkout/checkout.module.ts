import { Module } from "@nestjs/common";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { CartModule } from "../cart/cart.module";
import { OrdersModule } from "../orders/orders.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RewardsModule } from "../rewards/rewards.module";
import { StickersModule } from "../stickers/stickers.module";
import { RecommendationsModule } from "../recommendations/recommendations.module";
import { OrderRoutingModule } from "../order-routing/order-routing.module";
import { CoinsModule } from "../coins/coins.module";

@Module({
  imports: [
    CartModule, OrdersModule, NotificationsModule, RewardsModule,
    StickersModule, RecommendationsModule, OrderRoutingModule, CoinsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}

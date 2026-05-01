import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { CoinsModule } from "../coins/coins.module";
import { ProductsModule } from "../products/products.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [CoinsModule, ProductsModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

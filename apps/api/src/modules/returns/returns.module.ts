import { Module } from "@nestjs/common";
import { ReturnsService } from "./returns.service";
import { ReturnsCustomerController, ReturnsAdminController } from "./returns.controller";
import { OrdersModule } from "../orders/orders.module";
import { NotificationsModule } from "../notifications/notifications.module";

/**
 * Returns / RMA flow.
 *
 * Depends on:
 *   - OrdersModule for the existing refundOrder() pipeline so an
 *     RMA-finalize-refund call lands the same way (Razorpay or Goins,
 *     order.metadata.refunds[], audit log, push) as a direct admin refund.
 *   - NotificationsModule for the customer push notifications fired on
 *     every state transition (request received / approved / rejected).
 */
@Module({
  imports: [OrdersModule, NotificationsModule],
  controllers: [ReturnsCustomerController, ReturnsAdminController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}

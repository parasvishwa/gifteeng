import {
  Body, Controller, Get, Param, Patch, Query, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtSellerGuard } from "../../common/guards/jwt-seller.guard";
import { OrderRoutingService } from "./order-routing.service";

type SellerReq = Request & { user: { sellerId: string } };

const bulkAcceptSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

const updateStatusSchema = z.object({
  status:         z.enum(["processing", "dispatched", "delivered", "returned"]),
  useOwnCourier:  z.boolean().optional(),
  courier:        z.string().max(100).optional(),
  awb:            z.string().max(100).optional(),
  trackingUrl:    z.string().url().optional(),
  notes:          z.string().max(500).optional(),
});

const scheduleDispatchSchema = z.object({
  scheduledDispatchAt: z.string().datetime(),
});

const bulkScheduleSchema = z.object({
  ids:                 z.array(z.string().uuid()).min(1).max(50),
  scheduledDispatchAt: z.string().datetime(),
});

@ApiTags("seller-orders")
@ApiBearerAuth()
@UseGuards(JwtSellerGuard)
@Controller("seller/orders")
export class SellerOrdersController {
  constructor(private routing: OrderRoutingService) {}

  @Get()
  list(@Req() req: SellerReq, @Query("status") status?: string) {
    return this.routing.getSellerOrders(req.user.sellerId, status);
  }

  @Get(":id/invoice")
  invoice(@Req() req: SellerReq, @Param("id") id: string) {
    return this.routing.getInvoiceData(id, req.user.sellerId);
  }

  @Get(":id")
  get(@Req() req: SellerReq, @Param("id") id: string) {
    return this.routing.getAssignment(id, req.user.sellerId);
  }

  @Patch("bulk-accept")
  bulkAccept(
    @Req() req: SellerReq,
    @Body(new ZodValidationPipe(bulkAcceptSchema)) body: { ids: string[] },
  ) {
    return this.routing.bulkAcceptAssignments(body.ids, req.user.sellerId);
  }

  @Patch("bulk-schedule")
  bulkSchedule(
    @Req() req: SellerReq,
    @Body(new ZodValidationPipe(bulkScheduleSchema)) body: z.infer<typeof bulkScheduleSchema>,
  ) {
    return this.routing.bulkScheduleDispatch(body.ids, req.user.sellerId, new Date(body.scheduledDispatchAt));
  }

  @Patch(":id/accept")
  accept(@Req() req: SellerReq, @Param("id") id: string) {
    return this.routing.acceptAssignment(id, req.user.sellerId);
  }

  @Patch(":id/schedule")
  schedule(
    @Req() req: SellerReq,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scheduleDispatchSchema)) body: z.infer<typeof scheduleDispatchSchema>,
  ) {
    return this.routing.scheduleDispatch(id, req.user.sellerId, new Date(body.scheduledDispatchAt));
  }

  @Patch(":id/status")
  updateStatus(
    @Req() req: SellerReq,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: z.infer<typeof updateStatusSchema>,
  ) {
    return this.routing.updateStatus(id, req.user.sellerId, body);
  }
}

import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";
import { OrdersService, type CallerContext } from "../orders/orders.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";

const VALID_REASONS = new Set([
  "defective",
  "damaged_in_transit",
  "wrong_item",
  "size_issue",
  "not_as_described",
  "changed_mind",
  "other",
]);

// Default return window in days. Per-product override lives in
// product.metadata.returnWindowDays (admin-set).
const DEFAULT_RETURN_WINDOW_DAYS = 7;

@Injectable()
export class ReturnsService {
  private readonly log = new Logger(ReturnsService.name);

  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────
  // Customer flows
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Customer files a return request for one OrderItem (or the whole order
   * when `orderItemId` is omitted). Validates:
   *   - the order belongs to the caller
   *   - the order is delivered
   *   - we're inside the return window
   *   - the item exists in the order
   *   - the requested qty doesn't exceed the line qty (minus already-
   *     returned qty for the same item)
   *   - no other pending/approved/received request exists for the same
   *     OrderItem (to prevent dupes)
   */
  async createForCustomer(
    customerId: string,
    orderId: string,
    args: { orderItemId?: string; qty?: number; reason: string; details?: string; photos?: string[] },
  ) {
    const reason = (args.reason ?? "").toLowerCase().trim();
    if (!VALID_REASONS.has(reason)) {
      throw new BadRequestException(`Invalid reason. Must be one of: ${[...VALID_REASONS].join(", ")}`);
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== customerId) throw new ForbiddenException();

    if (order.status !== "delivered") {
      throw new BadRequestException(
        `Returns are only available for delivered orders. This order is ${order.status.replace(/_/g, " ")}.`,
      );
    }
    if (!order.deliveredAt) {
      throw new BadRequestException("Order is missing a delivery date — please contact support.");
    }

    // Return window — product can override via metadata.returnWindowDays.
    let windowDays = DEFAULT_RETURN_WINDOW_DAYS;
    if (args.orderItemId) {
      const it = order.items.find((x) => x.id === args.orderItemId);
      if (!it) throw new BadRequestException("Order item not found in this order.");
      const meta = (it.product?.metadata ?? null) as Record<string, unknown> | null;
      const override = meta?.returnWindowDays;
      if (typeof override === "number" && override >= 0) windowDays = override;
    }
    const deadline = new Date(order.deliveredAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
    if (new Date() > deadline) {
      throw new BadRequestException(
        `Return window of ${windowDays} days has passed (delivered ${order.deliveredAt.toLocaleDateString("en-IN")}).`,
      );
    }

    // Qty validation — can't return more than ordered minus already-
    // requested-and-not-rejected qty.
    let cappedQty = args.qty ?? 1;
    if (args.orderItemId) {
      const item = order.items.find((x) => x.id === args.orderItemId)!;
      const priorRequests = await this.prisma.returnRequest.findMany({
        where: {
          orderItemId: args.orderItemId,
          status: { notIn: ["rejected", "cancelled"] },
        },
      });
      const alreadyRequestedQty = priorRequests.reduce((s, r) => s + r.qty, 0);
      const remaining = item.qty - alreadyRequestedQty;
      if (remaining <= 0) {
        throw new BadRequestException(
          "All units of this item already have an open or completed return request.",
        );
      }
      cappedQty = Math.min(Math.max(1, cappedQty), remaining);
    }

    const created = await this.prisma.returnRequest.create({
      data: {
        orderId,
        orderItemId: args.orderItemId,
        customerId,
        qty: cappedQty,
        reason,
        details: args.details?.trim() || null,
        photos: Array.isArray(args.photos) ? args.photos.slice(0, 8) : [],
        status: "pending",
      },
    });

    // Notify the customer their request is in queue (sets expectations
    // — they shouldn't expect immediate refund).
    try {
      await this.notifications.sendToCustomer(customerId, {
        title: `Return request received for ${order.orderNumber}`,
        body: "We'll review and get back to you within 24 hours.",
        data: { orderId, returnId: created.id },
      });
    } catch (err) {
      this.log.warn(`return-created push failed: ${(err as Error).message}`);
    }
    this.realtime.publish(customerId, "orders");
    return created;
  }

  /** Customer-side: list their requests for one order. */
  async listForCustomerOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== customerId) throw new ForbiddenException();
    return this.prisma.returnRequest.findMany({
      where: { orderId, customerId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Customer cancels their own pending request before admin acts on it. */
  async cancelByCustomer(customerId: string, returnId: string) {
    const rma = await this.prisma.returnRequest.findUnique({ where: { id: returnId } });
    if (!rma) throw new NotFoundException();
    if (rma.customerId !== customerId) throw new ForbiddenException();
    if (rma.status !== "pending") {
      throw new BadRequestException(`Cannot cancel — request is already ${rma.status}.`);
    }
    const updated = await this.prisma.returnRequest.update({
      where: { id: returnId },
      data: { status: "cancelled" },
    });
    this.realtime.publish(customerId, "orders");
    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Admin flows
  // ──────────────────────────────────────────────────────────────────────

  /** Admin: list all return requests with optional filters. */
  async listForAdmin(filter: {
    status?: string;
    customerId?: string;
    orderId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
    const where: Prisma.ReturnRequestWhereInput = {};
    if (filter.status)     where.status     = filter.status as any;
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.orderId)    where.orderId    = filter.orderId;

    const [items, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: [
          // Pending first (admin's queue), then by date
          { status: "asc" },
          { createdAt: "desc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: {
            select: { id: true, orderNumber: true, grandTotal: true, currency: true, customerId: true },
          },
          customer: {
            select: { id: true, fullName: true, email: true, phone: true },
          },
        },
      }),
      this.prisma.returnRequest.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Admin: list all RMAs for a single order — used by the order-detail panel. */
  async listForOrder(orderId: string) {
    return this.prisma.returnRequest.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
  }

  async approve(returnId: string, caller: CallerContext) {
    const rma = await this.requireOpen(returnId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: "approved",
          approvedAt: new Date(),
          approvedById: caller.companyUserId ?? null,
          rejectedAt: null,
          rejectReason: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: caller.companyUserId ?? null,
          action: "return.approved",
          entityType: "return_request",
          entityId: returnId,
          payload: { orderId: rma.orderId } as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    // Notify customer with next steps
    try {
      const order = await this.prisma.order.findUnique({ where: { id: rma.orderId } });
      await this.notifications.sendToCustomer(rma.customerId, {
        title: "Return request approved 🎉",
        body: `For order ${order?.orderNumber ?? ""}. We'll reach out shortly with pickup or drop-off details.`,
        data: { orderId: rma.orderId, returnId },
      });
    } catch (err) {
      this.log.warn(`return-approved push failed: ${(err as Error).message}`);
    }
    this.realtime.publish(rma.customerId, "orders");
    return updated;
  }

  async reject(returnId: string, reason: string, caller: CallerContext) {
    if (!reason?.trim()) throw new BadRequestException("Reject reason is required.");
    const rma = await this.requireOpen(returnId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: "rejected",
          rejectedAt: new Date(),
          rejectReason: reason.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: caller.companyUserId ?? null,
          action: "return.rejected",
          entityType: "return_request",
          entityId: returnId,
          payload: { orderId: rma.orderId, reason } as Prisma.InputJsonValue,
        },
      });
      return row;
    });
    try {
      await this.notifications.sendToCustomer(rma.customerId, {
        title: "Return request couldn't be approved",
        body: `Reason: ${reason}. Please contact support if you have questions.`,
        data: { orderId: rma.orderId, returnId },
      });
    } catch (err) {
      this.log.warn(`return-rejected push failed: ${(err as Error).message}`);
    }
    this.realtime.publish(rma.customerId, "orders");
    return updated;
  }

  /** Admin marks the returned parcel as received in the warehouse. */
  async markReceived(
    returnId: string,
    args: { carrier?: string; trackingNumber?: string },
    caller: CallerContext,
  ) {
    const rma = await this.prisma.returnRequest.findUnique({ where: { id: returnId } });
    if (!rma) throw new NotFoundException();
    if (rma.status !== "approved") {
      throw new BadRequestException(`Can only mark approved requests as received (currently ${rma.status}).`);
    }
    const updated = await this.prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        status: "received",
        receivedAt: new Date(),
        carrier:        args.carrier ?? rma.carrier,
        trackingNumber: args.trackingNumber ?? rma.trackingNumber,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorType: "admin",
        actorId: caller.companyUserId ?? null,
        action: "return.received",
        entityType: "return_request",
        entityId: returnId,
        payload: { orderId: rma.orderId, carrier: args.carrier, trackingNumber: args.trackingNumber } as Prisma.InputJsonValue,
      },
    });
    this.realtime.publish(rma.customerId, "orders");
    return updated;
  }

  /**
   * Finalize the refund attached to a return request. Calls into the
   * existing OrdersService.refundOrder() so the refund record lands in
   * order.metadata.refunds[] alongside any non-RMA refunds.
   *
   * The refund amount, when omitted, defaults to:
   *   item.unitPrice × rma.qty (single-item RMA)
   *   order.grandTotal           (whole-order RMA)
   *
   * The agent can override with `amountInr` if there's a partial refund
   * decision (restock fee, shipping not refundable, etc.).
   */
  async finalizeRefund(
    returnId: string,
    args: { amountInr?: number; reason?: string; asGoins?: boolean },
    caller: CallerContext,
  ) {
    const rma = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
    });
    if (!rma) throw new NotFoundException();
    if (rma.status !== "received" && rma.status !== "approved") {
      throw new BadRequestException(
        `Can only refund approved or received returns (currently ${rma.status}).`,
      );
    }

    // Default refund amount: line-level if scoped to one OrderItem,
    // otherwise full order.
    let refundAmount = args.amountInr;
    if (!refundAmount || refundAmount <= 0) {
      if (rma.orderItemId) {
        const item = await this.prisma.orderItem.findUnique({ where: { id: rma.orderItemId } });
        refundAmount = item ? Number(item.unitPrice) * rma.qty : 0;
      } else {
        const o = await this.prisma.order.findUnique({ where: { id: rma.orderId } });
        refundAmount = o ? Number(o.grandTotal) : 0;
      }
    }
    if (!refundAmount || refundAmount <= 0) {
      throw new BadRequestException("Could not determine refund amount — pass amountInr explicitly.");
    }

    const reason = args.reason?.trim() || `Return: ${rma.reason}`;

    // Delegate to OrdersService.refundOrder (handles Razorpay / Goins,
    // metadata.refunds[], audit log, push notification).
    await this.orders.refundOrder(
      rma.orderId,
      { amountInr: refundAmount, reason, asGoins: !!args.asGoins },
      caller,
    );

    const updated = await this.prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        status: "refunded",
        refundedAt: new Date(),
        refundEntry: {
          amountInr: refundAmount,
          asGoins: !!args.asGoins,
          reason,
          at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return updated;
  }

  private async requireOpen(returnId: string) {
    const rma = await this.prisma.returnRequest.findUnique({ where: { id: returnId } });
    if (!rma) throw new NotFoundException();
    if (rma.status !== "pending") {
      throw new BadRequestException(`Request is already ${rma.status}.`);
    }
    return rma;
  }
}

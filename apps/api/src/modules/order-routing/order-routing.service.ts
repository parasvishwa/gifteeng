import {
  ForbiddenException, Injectable, Logger, NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";
import { MarketplaceService } from "../marketplace/marketplace.service";

const DEADLINE_HOURS = 24;

export interface UpdateStatusInput {
  status: "processing" | "dispatched" | "delivered" | "returned";
  useOwnCourier?: boolean;
  courier?: string;
  awb?: string;
  trackingUrl?: string;
  notes?: string;
  scheduledDispatchAt?: Date;
}

@Injectable()
export class OrderRoutingService {
  private readonly logger = new Logger(OrderRoutingService.name);

  constructor(
    private prisma: PrismaService,
    private marketplace: MarketplaceService,
  ) {}

  // ─── Post-checkout trigger ──────────────────────────────────────────────

  /**
   * Called right after an order is confirmed. Creates the first assignment
   * for every marketplace item (those with sellerProductId) using the seller
   * the buyer originally chose from the SellerPicker.
   */
  async assignOrderItems(orderId: string): Promise<void> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: { sellerProduct: { select: { sellerId: true } } },
    });

    for (const item of items) {
      const existing = await this.prisma.orderItemAssignment.findFirst({
        where: {
          orderItemId: item.id,
          status: { in: ["pending", "accepted", "processing", "dispatched"] },
        },
      });
      if (existing) continue;

      // Resolve seller: explicit sellerProductId takes priority;
      // fallback to the first approved seller listing for this product.
      let sellerId: string | null = item.sellerProduct?.sellerId ?? null;
      let sellerProductId: string | null = item.sellerProductId ?? null;

      if (!sellerProductId) {
        const sp = await this.prisma.sellerProduct.findFirst({
          where: { productId: item.productId, status: "approved" },
          select: { id: true, sellerId: true },
        });
        if (sp) {
          sellerProductId = sp.id;
          sellerId = sp.sellerId;
          await this.prisma.orderItem.update({
            where: { id: item.id },
            data: { sellerProductId: sp.id },
          });
        }
      }

      if (!sellerId || !sellerProductId) continue;

      const deadline = new Date();
      deadline.setHours(deadline.getHours() + DEADLINE_HOURS);

      await this.prisma.orderItemAssignment.create({
        data: {
          orderItemId:     item.id,
          sellerId,
          sellerProductId,
          attemptNumber:   1,
          deadlineAt:      deadline,
        },
      });

      this.logger.log(
        `Assigned orderItem=${item.id} → seller=${sellerId} (attempt 1)`,
      );
    }
  }

  // ─── Cron: cascade overdue assignments ─────────────────────────────────

  /** Every 30 minutes: move overdue pending/accepted assignments to floating
   *  and route to the next-best available seller. */
  @Cron("0 */30 * * * *")
  async checkDeadlines(): Promise<void> {
    const overdue = await this.prisma.orderItemAssignment.findMany({
      where: {
        status: { in: ["pending", "accepted"] },
        deadlineAt: { lt: new Date() },
      },
    });

    for (const a of overdue) {
      this.logger.log(`Assignment ${a.id} overdue — floating`);
      await this.prisma.orderItemAssignment.update({
        where: { id: a.id },
        data: { status: "floating" },
      });
      await this.doAssign(a.orderItemId);
    }
  }

  /**
   * Selects and creates the next assignment for an order item, skipping all
   * sellers who already have an assignment record for it.
   */
  private async doAssign(orderItemId: string): Promise<void> {
    const tried = await this.prisma.orderItemAssignment.findMany({
      where: { orderItemId },
      select: { sellerId: true, attemptNumber: true },
      orderBy: { attemptNumber: "desc" },
    });
    const exhaustedIds = tried.map((t) => t.sellerId);
    const nextAttempt  = (tried[0]?.attemptNumber ?? 0) + 1;

    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: { select: { shippingAddress: true } },
        sellerProduct: { include: { product: { select: { id: true, slug: true } } } },
      },
    });
    if (!item?.sellerProduct) return;

    const addr        = item.order.shippingAddress as { pincode?: string } | null;
    const slugOrId    = item.sellerProduct.product.slug ?? item.sellerProduct.product.id;
    const ranked      = await this.marketplace.listProductSellers(slugOrId, addr?.pincode);
    const next        = ranked.find((r) => !exhaustedIds.includes(r.seller.id) && r.inStock);

    if (!next) {
      // All sellers exhausted — mark the last floating record as cancelled
      const lastFloating = await this.prisma.orderItemAssignment.findFirst({
        where: { orderItemId, status: "floating" },
        orderBy: { attemptNumber: "desc" },
      });
      if (lastFloating) {
        await this.prisma.orderItemAssignment.update({
          where: { id: lastFloating.id },
          data: { status: "cancelled" },
        });
      }
      this.logger.warn(`All sellers exhausted for orderItem=${orderItemId}`);
      return;
    }

    const deadline = new Date();
    deadline.setHours(deadline.getHours() + DEADLINE_HOURS);

    await this.prisma.orderItemAssignment.create({
      data: {
        orderItemId,
        sellerId:        next.seller.id,
        sellerProductId: next.sellerProductId,
        attemptNumber:   nextAttempt,
        deadlineAt:      deadline,
      },
    });

    this.logger.log(
      `Re-assigned orderItem=${orderItemId} → seller=${next.seller.id} (attempt ${nextAttempt})`,
    );
  }

  // ─── Seller-facing ──────────────────────────────────────────────────────

  async getSellerOrders(sellerId: string, status?: string) {
    return this.prisma.orderItemAssignment.findMany({
      where: {
        sellerId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { assignedAt: "desc" },
      include: {
        orderItem: {
          include: {
            order: {
              select: {
                orderNumber: true, shippingAddress: true,
                grandTotal: true, placedAt: true,
              },
            },
            product: { select: { title: true, images: true, slug: true } },
          },
        },
        sellerProduct: { select: { price: true } },
      },
    });
  }

  async getAssignment(id: string, sellerId: string) {
    const a = await this.prisma.orderItemAssignment.findFirst({
      where: { id, sellerId },
      include: {
        orderItem: {
          include: {
            order: true,
            product: { select: { title: true, images: true } },
          },
        },
        sellerProduct: { select: { price: true } },
        seller: { select: { chargesCourier: true, brandName: true } },
      },
    });
    if (!a) throw new NotFoundException("Assignment not found");
    return a;
  }

  async acceptAssignment(id: string, sellerId: string) {
    const a = await this.prisma.orderItemAssignment.findFirst({
      where: { id, sellerId },
    });
    if (!a) throw new NotFoundException("Assignment not found");
    if (a.status !== "pending") {
      throw new ForbiddenException(`Cannot accept — current status: ${a.status}`);
    }
    return this.prisma.orderItemAssignment.update({
      where: { id },
      data: { status: "accepted", acceptedAt: new Date() },
      include: {
        orderItem: {
          include: {
            order: true,
            product: { select: { title: true, images: true } },
          },
        },
        sellerProduct: { select: { price: true } },
        seller: { select: { chargesCourier: true, brandName: true } },
      },
    });
  }

  async bulkAcceptAssignments(ids: string[], sellerId: string): Promise<{ accepted: number; skipped: number }> {
    const assignments = await this.prisma.orderItemAssignment.findMany({
      where: { id: { in: ids }, sellerId, status: "pending" },
    });
    if (assignments.length === 0) return { accepted: 0, skipped: ids.length };
    await this.prisma.orderItemAssignment.updateMany({
      where: { id: { in: assignments.map(a => a.id) } },
      data: { status: "accepted", acceptedAt: new Date() },
    });
    return { accepted: assignments.length, skipped: ids.length - assignments.length };
  }

  async updateStatus(id: string, sellerId: string, body: UpdateStatusInput) {
    const a = await this.prisma.orderItemAssignment.findFirst({
      where: { id, sellerId },
    });
    if (!a) throw new NotFoundException("Assignment not found");

    const allowed: Record<string, string[]> = {
      accepted:   ["processing"],
      processing: ["dispatched"],
      dispatched: ["delivered", "returned"],
    };
    if (!allowed[a.status]?.includes(body.status)) {
      throw new ForbiddenException(
        `Cannot transition ${a.status} → ${body.status}`,
      );
    }

    const data: Record<string, unknown> = { status: body.status };
    if (body.useOwnCourier !== undefined) data.useOwnCourier = body.useOwnCourier;
    if (body.courier !== undefined)       data.courier       = body.courier;
    if (body.awb !== undefined)           data.awb           = body.awb;
    if (body.trackingUrl !== undefined)   data.trackingUrl   = body.trackingUrl;
    if (body.notes !== undefined)         data.notes         = body.notes;
    if (body.status === "dispatched")     data.dispatchedAt  = new Date();
    if (body.status === "delivered")      data.deliveredAt   = new Date();
    if (body.status === "returned")       data.returnedAt    = new Date();

    return this.prisma.orderItemAssignment.update({
      where: { id },
      data,
      include: {
        orderItem: {
          include: {
            order: true,
            product: { select: { title: true, images: true } },
          },
        },
        sellerProduct: { select: { price: true } },
        seller: { select: { chargesCourier: true, brandName: true } },
      },
    });
  }

  // ─── Admin-facing ───────────────────────────────────────────────────────

  async adminListAssignments(status?: string) {
    return this.prisma.orderItemAssignment.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { assignedAt: "desc" },
      take: 200,
      include: {
        orderItem: {
          include: {
            order: { select: { orderNumber: true, grandTotal: true } },
            product: { select: { title: true } },
          },
        },
        seller: { select: { brandName: true, city: true, state: true } },
      },
    });
  }

  async adminGetAssignment(id: string) {
    const a = await this.prisma.orderItemAssignment.findUnique({
      where: { id },
      include: {
        orderItem: { include: { order: true, product: true } },
        seller: { select: { brandName: true, phone: true, city: true, state: true } },
        sellerProduct: { select: { price: true } },
      },
    });
    if (!a) throw new NotFoundException("Assignment not found");
    return a;
  }

  async adminForceReassign(id: string) {
    const a = await this.prisma.orderItemAssignment.findUnique({ where: { id } });
    if (!a) throw new NotFoundException("Assignment not found");
    await this.prisma.orderItemAssignment.update({
      where: { id },
      data: { status: "floating" },
    });
    await this.doAssign(a.orderItemId);
    return { ok: true };
  }

  // ─── Tax invoice data ───────────────────────────────────────────────────

  async getInvoiceData(id: string, sellerId: string) {
    const a = await this.prisma.orderItemAssignment.findFirst({
      where: { id, sellerId },
      include: {
        orderItem: {
          include: {
            product: { select: { title: true } },
            order:   true,
          },
        },
        sellerProduct: { select: { price: true } },
        seller: {
          select: {
            brandName: true, legalName: true, gstNumber: true,
            city: true, state: true, pincode: true, contactPhone: true,
          },
        },
      },
    });
    if (!a) throw new NotFoundException("Assignment not found");

    const GST_RATE   = 0.12;
    const addr       = a.orderItem.order.shippingAddress as Record<string, string> | null;
    const sellerSt   = (a.seller.state ?? "").trim().toLowerCase();
    const buyerSt    = (addr?.state ?? "").trim().toLowerCase();
    const interState = !sellerSt || sellerSt !== buyerSt;
    const unitPrice  = Number(a.sellerProduct?.price ?? a.orderItem.unitPrice);
    const qty        = a.orderItem.qty;
    const total      = +(unitPrice * qty).toFixed(2);
    const taxable    = +(total / (1 + GST_RATE)).toFixed(2);
    const totalGst   = +(total - taxable).toFixed(2);
    const half       = +(totalGst / 2).toFixed(2);

    return {
      invoiceNumber: `GT-INV-${a.orderItem.order.orderNumber}`,
      invoiceDate:   (a.deliveredAt ?? a.assignedAt).toISOString().slice(0, 10),
      orderNumber:   a.orderItem.order.orderNumber,
      seller: {
        brandName: a.seller.brandName,
        legalName: a.seller.legalName,
        gstin:     a.seller.gstNumber ?? "Not registered",
        city:      a.seller.city  ?? "",
        state:     a.seller.state ?? "",
        pincode:   a.seller.pincode,
        phone:     a.seller.contactPhone ?? "",
      },
      buyer: {
        name:    addr?.name    ?? "Customer",
        line1:   addr?.line1   ?? "",
        line2:   addr?.line2   ?? "",
        city:    addr?.city    ?? "",
        state:   addr?.state   ?? "",
        pincode: addr?.pincode ?? "",
        phone:   addr?.phone   ?? "",
      },
      item: {
        title:    a.orderItem.product.title,
        hsn:      "4911",
        qty,
        unitPrice: +unitPrice.toFixed(2),
        taxable,
        cgst:  interState ? 0 : half,
        sgst:  interState ? 0 : half,
        igst:  interState ? totalGst : 0,
        totalGst,
        total,
      },
      totals: {
        taxable,
        cgst:     interState ? 0 : half,
        sgst:     interState ? 0 : half,
        igst:     interState ? totalGst : 0,
        totalGst,
        total,
      },
      supplyType: interState ? "Interstate" : "Intrastate",
    };
  }

  // ─── Schedule dispatch ──────────────────────────────────────────────────

  async scheduleDispatch(id: string, sellerId: string, scheduledDispatchAt: Date) {
    const a = await this.prisma.orderItemAssignment.findFirst({ where: { id, sellerId } });
    if (!a) throw new NotFoundException("Assignment not found");
    if (!["accepted", "processing"].includes(a.status)) {
      throw new ForbiddenException("Can only schedule accepted or processing orders");
    }
    return this.prisma.orderItemAssignment.update({
      where: { id },
      data: { scheduledDispatchAt },
    });
  }

  async bulkScheduleDispatch(ids: string[], sellerId: string, scheduledDispatchAt: Date) {
    const assignments = await this.prisma.orderItemAssignment.findMany({
      where: { id: { in: ids }, sellerId, status: { in: ["accepted", "processing"] } },
    });
    if (assignments.length === 0) return { scheduled: 0, skipped: ids.length };
    await this.prisma.orderItemAssignment.updateMany({
      where: { id: { in: assignments.map((a) => a.id) } },
      data: { scheduledDispatchAt },
    });
    return { scheduled: assignments.length, skipped: ids.length - assignments.length };
  }
}

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PassThrough } from "stream";
import PDFDocument from "pdfkit";
import Razorpay from "razorpay";
import { PrismaService } from "../../prisma/prisma.service";
import { CoinsService } from "../coins/coins.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";
import type { Channel, OrderStatus, UserRole } from "@gifteeng/shared";

export type OrderListFilter = {
  channel?: Channel;
  status?: OrderStatus | OrderStatus[];
  companyId?: string;
  customerId?: string;
  companyUserId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CallerContext = {
  audience: "b2c" | "b2b";
  // b2c
  customerId?: string;
  // b2b
  companyId?: string | null; // null = super/sales admin, no scope
  companyUserId?: string;
  role?: UserRole;
};

/**
 * The OrdersService is the single backbone for every order view in the system.
 * Four portals read from this one service:
 *
 *   Super admin         → listOrders({ channel?: any })
 *   HR admin (B2B)      → listOrders({ companyId: myCompany, channel: 'b2b' })
 *   Production          → listOrders({ status: in_production|ready_to_ship }) — both channels
 *   Employee store      → listOrders({ companyUserId: me })
 *   B2C customer        → listOrders({ customerId: me, channel: 'b2c' })
 *
 * Tenant isolation is enforced in `listOrders` by merging the caller's
 * context into the filter — B2B callers cannot read orders outside their
 * company unless they're super_admin/sales_admin.
 */
@Injectable()
export class OrdersService {
  private readonly log = new Logger(OrdersService.name);
  private readonly razorpay: Razorpay | null;

  constructor(
    private prisma: PrismaService,
    private coins: CoinsService,
    private notifications: NotificationsService,
    private realtime: RealtimeService,
  ) {
    // Razorpay client for the admin refund flow. Same env vars as the
    // checkout-side instance — RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.
    // When unset (dev) the refund flow falls back to "mark refunded
    // locally + log it" without an upstream call so it doesn't crash.
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    this.razorpay = (keyId && keySecret)
      ? new Razorpay({ key_id: keyId, key_secret: keySecret })
      : null;
  }

  /**
   * Fire a push notification to the customer about an order status change.
   * Fire-and-forget: errors are swallowed so a push failure never blocks
   * the order flow. Skipped for guest / B2B orders where customerId is null.
   * Skipped for intermediate / admin-only statuses that don't warrant a ping.
   */
  private pushOrderStatus(
    customerId: string | null,
    orderNumber: string,
    status: OrderStatus,
  ): void {
    if (!customerId) return;

    // Only these customer-facing milestones deserve a push. The rest
    // (new_order, in_production, ready_to_ship, returned) are internal
    // workflow states the buyer doesn't need to be interrupted for.
    const pingWorthy: OrderStatus[] = [
      "confirmed",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!pingWorthy.includes(status)) return;

    this.notifications
      .sendOrderStatusUpdate(customerId, { orderNumber, status })
      .catch((err) => {
        this.log.error(
          `push for order ${orderNumber} → ${status} failed (non-fatal)`,
          err as Error,
        );
      });
  }

  async listOrders(caller: CallerContext, filter: OrderListFilter = {}) {
    const where = this.buildWhere(caller, filter);
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, filter.pageSize ?? 20);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true, shipments: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getById(id: string, caller: CallerContext) {
    const include = {
      items: true,
      shipments: true,
      customer: {
        select: {
          id: true, fullName: true, email: true, phone: true,
          createdAt: true, metadata: true,
        },
      },
    } as const;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const order = isUuid
      ? await this.prisma.order.findUnique({ where: { id }, include })
      : await this.prisma.order.findFirst({ where: { orderNumber: id }, include });
    if (!order) throw new NotFoundException();
    this.assertVisible(order, caller);

    // Hydrate the customer's lifetime stats for the admin side panel:
    //   - customerOrderCount   — total orders ever placed
    //   - customerLifetimeValue — sum of grandTotal across non-cancelled
    //     orders (gives the agent a fast "VIP / first-time / churned" read)
    //   - customerRecentOrders  — last 5 orders excluding the current one,
    //     so the agent can drill into any of them with one click
    //   - duplicateOrderIds     — same customer + same item composition
    //     placed within ±10 minutes of this one. Catches accidental
    //     double-charges from rage-click on Pay before the success
    //     screen rendered.
    let customerOrderCount = 0;
    let customerLifetimeValue = 0;
    let customerRecentOrders: Array<{
      id: string; orderNumber: string; placedAt: Date | null;
      grandTotal: string | number; status: string;
    }> = [];
    if (order.customerId) {
      const [count, agg, recent] = await Promise.all([
        this.prisma.order.count({ where: { customerId: order.customerId } }),
        this.prisma.order.aggregate({
          where: {
            customerId: order.customerId,
            status: { notIn: ["cancelled", "returned"] },
          },
          _sum: { grandTotal: true },
        }),
        this.prisma.order.findMany({
          where: { customerId: order.customerId, NOT: { id: order.id } },
          orderBy: { placedAt: "desc" },
          take: 5,
          select: {
            id: true, orderNumber: true, placedAt: true,
            grandTotal: true, status: true,
          },
        }),
      ]);
      customerOrderCount     = count;
      customerLifetimeValue  = Number(agg._sum.grandTotal ?? 0);
      customerRecentOrders   = recent.map((r) => ({
        id: r.id, orderNumber: r.orderNumber, placedAt: r.placedAt,
        grandTotal: r.grandTotal as unknown as string | number,
        status: r.status,
      }));
    }

    // Duplicate detection — same customer, same item set (productId + qty
    // multiset), placed within ±10 minutes. We compare by a stable key
    // string so JSON stringification ordering doesn't trip us up.
    let duplicateOrderIds: string[] = [];
    if (order.customerId && order.placedAt) {
      const keyFor = (items: { productId: string; qty: number }[]) =>
        items
          .map((it) => `${it.productId}:${it.qty}`)
          .sort()
          .join("|");
      const thisKey = keyFor((order.items ?? []).map((it: any) => ({
        productId: it.productId,
        qty: it.qty,
      })));
      const windowMs = 10 * 60 * 1000;
      const candidates = await this.prisma.order.findMany({
        where: {
          customerId: order.customerId,
          NOT: { id: order.id },
          placedAt: {
            gte: new Date(order.placedAt.getTime() - windowMs),
            lte: new Date(order.placedAt.getTime() + windowMs),
          },
        },
        select: { id: true, items: { select: { productId: true, qty: true } } },
      });
      duplicateOrderIds = candidates
        .filter((c) => keyFor(c.items) === thisKey)
        .map((c) => c.id);
    }

    // ── Conversion summary ────────────────────────────────────────────────
    // Surfaces the path this customer took before placing the order:
    // first-seen date, session count, top pages, device, referrer/UTM.
    // Used by marketing to compute true channel ROI per order, and by
    // customer-service to spot "this customer browsed for 30 min before
    // buying — they really wanted this".
    const conversionSummary = await this.computeConversionSummary(order);

    // ── Risk score ────────────────────────────────────────────────────────
    // Simple heuristics today (no ML). Score 0 (safe) → 100 (high risk).
    //   level = "low" if score < 30, "medium" 30-59, "high" ≥ 60.
    // Each contributing factor is included so the agent knows WHY the
    // score is what it is — opaque scores are useless.
    const riskScore = this.computeRiskScore({
      order,
      customerOrderCount,
      customerLifetimeValue,
    });

    return {
      ...order,
      customerOrderCount,
      customerLifetimeValue,
      customerRecentOrders,
      duplicateOrderIds,
      conversionSummary,
      riskScore,
    } as typeof order & {
      customerOrderCount: number;
      customerLifetimeValue: number;
      customerRecentOrders: typeof customerRecentOrders;
      duplicateOrderIds: string[];
      conversionSummary: typeof conversionSummary;
      riskScore: typeof riskScore;
    };
  }

  // ── Conversion summary ─────────────────────────────────────────────────
  // Replays the customer's pre-purchase journey from the page_views table.
  // We look back 30 days max from the order — long enough to see typical
  // research patterns (gifting purchases often have a multi-day deliberation
  // window) without dragging in unrelated browsing months later.
  private async computeConversionSummary(order: { id: string; placedAt: Date | null; customerId: string | null }) {
    if (!order.customerId || !order.placedAt) {
      return null;
    }
    const lookbackStart = new Date(order.placedAt.getTime() - 30 * 24 * 60 * 60 * 1000);

    const views = await this.prisma.pageView.findMany({
      where: {
        customerId: order.customerId,
        createdAt: { gte: lookbackStart, lt: order.placedAt },
      },
      orderBy: { createdAt: "asc" },
      select: {
        sessionId: true, path: true, event: true, props: true,
        platform: true, deviceType: true, browser: true, os: true,
        country: true, region: true, city: true, referrer: true,
        createdAt: true,
      },
    });

    if (views.length === 0) {
      return {
        firstSeenAt:           null as Date | null,
        sessionsBeforeOrder:   0,
        pageViewsBeforeOrder:  0,
        timeFromFirstVisitMin: null as number | null,
        topPages:              [] as Array<{ path: string; views: number }>,
        firstReferrer:         null as string | null,
        firstUtm:              null as { source?: string; medium?: string; campaign?: string } | null,
        firstDevice:           null as { platform?: string | null; deviceType?: string | null; browser?: string | null; os?: string | null } | null,
        firstLocation:         null as { country?: string | null; region?: string | null; city?: string | null } | null,
      };
    }

    // Safe: views.length === 0 was guarded above.
    const first = views[0]!;
    const sessions = new Set(views.map((v) => v.sessionId));

    // Top 5 paths by visits
    const pathCounts = new Map<string, number>();
    for (const v of views) pathCounts.set(v.path, (pathCounts.get(v.path) ?? 0) + 1);
    const topPages = [...pathCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([path, c]) => ({ path, views: c }));

    // Try to extract UTM tags from the first pageview's props or referrer
    const firstProps = (first.props ?? null) as Record<string, unknown> | null;
    const firstUtm = firstProps && typeof firstProps === "object"
      ? {
          source:   typeof firstProps["utm_source"]   === "string" ? firstProps["utm_source"]   as string : undefined,
          medium:   typeof firstProps["utm_medium"]   === "string" ? firstProps["utm_medium"]   as string : undefined,
          campaign: typeof firstProps["utm_campaign"] === "string" ? firstProps["utm_campaign"] as string : undefined,
        }
      : null;

    const minutesSinceFirst = Math.round(
      (order.placedAt.getTime() - first.createdAt.getTime()) / 60_000,
    );

    return {
      firstSeenAt:           first.createdAt,
      sessionsBeforeOrder:   sessions.size,
      pageViewsBeforeOrder:  views.length,
      timeFromFirstVisitMin: minutesSinceFirst,
      topPages,
      firstReferrer:         first.referrer ?? null,
      firstUtm:              (firstUtm && (firstUtm.source || firstUtm.medium || firstUtm.campaign)) ? firstUtm : null,
      firstDevice: {
        platform:   first.platform   ?? null,
        deviceType: first.deviceType ?? null,
        browser:    first.browser    ?? null,
        os:         first.os         ?? null,
      },
      firstLocation: {
        country: first.country ?? null,
        region:  first.region  ?? null,
        city:    first.city    ?? null,
      },
    };
  }

  // ── Risk score ─────────────────────────────────────────────────────────
  // Heuristic chargeback / fraud risk. Pure functions of the order +
  // customer aggregates we already pulled. Each factor either ADDS or
  // SUBTRACTS points; the level is bucketed at the end. We return the
  // factor list so the admin sees WHY the score is what it is — opaque
  // numbers without explanation are useless on a dashboard.
  //
  // Tuned by hand based on Indian e-commerce chargeback patterns. Will
  // get smarter once we have refund / chargeback labels to train on.
  private computeRiskScore(args: {
    order: {
      paymentMethod: string | null;
      paymentStatus: string | null;
      grandTotal: unknown;
      shippingAddress: unknown;
      billingAddress:  unknown;
    };
    customerOrderCount: number;
    customerLifetimeValue: number;
  }): { level: "low" | "medium" | "high"; score: number; factors: Array<{ icon: string; text: string; delta: number }> } {
    const factors: Array<{ icon: string; text: string; delta: number }> = [];
    let score = 30; // neutral starting point

    const total = Number(args.order.grandTotal ?? 0);
    const isCod = (args.order.paymentMethod ?? "").toLowerCase() === "cod";
    const isPrepaid = !isCod &&
      ["paid", "captured", "completed"].includes((args.order.paymentStatus ?? "").toLowerCase());

    // ── Payment method ───────────────────────────────────────────────
    if (isPrepaid) {
      score -= 15;
      factors.push({ icon: "💳", text: "Prepaid via Razorpay (lower chargeback risk)", delta: -15 });
    } else if (isCod) {
      score += 15;
      factors.push({ icon: "💵", text: "Cash on delivery (higher RTO / dispute risk)", delta: 15 });
    }

    // ── Cart value tiers ─────────────────────────────────────────────
    if (total >= 10000) {
      score += 20;
      factors.push({ icon: "💎", text: `High-value order (₹${total.toLocaleString("en-IN")})`, delta: 20 });
    } else if (total >= 5000) {
      score += 8;
      factors.push({ icon: "💰", text: `Above-average order (₹${total.toLocaleString("en-IN")})`, delta: 8 });
    }

    // ── Customer trust ───────────────────────────────────────────────
    if (args.customerOrderCount === 0 || args.customerOrderCount === 1) {
      score += 10;
      factors.push({ icon: "🆕", text: "First-time customer — no track record yet", delta: 10 });
    }
    if (args.customerLifetimeValue >= 20000 && args.customerOrderCount >= 5) {
      score -= 35;
      factors.push({
        icon: "⭐",
        text: `VIP — ${args.customerOrderCount} prior orders, ₹${args.customerLifetimeValue.toLocaleString("en-IN")} LTV`,
        delta: -35,
      });
    } else if (args.customerLifetimeValue >= 5000 && args.customerOrderCount >= 3) {
      score -= 20;
      factors.push({
        icon: "🤝",
        text: `Trusted — ${args.customerOrderCount} prior orders, ₹${args.customerLifetimeValue.toLocaleString("en-IN")} LTV`,
        delta: -20,
      });
    }

    // ── Address verification ─────────────────────────────────────────
    const ship = (args.order.shippingAddress ?? null) as Record<string, string> | null;
    const bill = (args.order.billingAddress  ?? null) as Record<string, string> | null;
    if (ship && bill) {
      const sCountry = (ship.country ?? "").toLowerCase().trim();
      const bCountry = (bill.country ?? "").toLowerCase().trim();
      if (sCountry && bCountry && sCountry !== bCountry) {
        score += 25;
        factors.push({
          icon: "🌐",
          text: `Billing country (${bCountry}) ≠ shipping country (${sCountry})`,
          delta: 25,
        });
      }
      const sPin = (ship.postalCode ?? ship.pincode ?? "").trim();
      const bPin = (bill.postalCode ?? bill.pincode ?? "").trim();
      if (sPin && bPin && sPin !== bPin) {
        // Soft signal — many genuine customers ship to office while
        // billing to home. Just nudge.
        score += 3;
        factors.push({
          icon: "📍",
          text: "Billing & shipping postal codes differ (mild)",
          delta: 3,
        });
      }
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));
    const level: "low" | "medium" | "high" =
      score < 30 ? "low" : score < 60 ? "medium" : "high";

    return { level, score, factors };
  }

  async updateStatus(id: string, status: OrderStatus, caller: CallerContext) {
    // Grab the pre-transaction state so we can tell whether the status
    // actually CHANGED (admin might click "Confirmed" on an already-
    // confirmed order — we don't want to spam the customer with a push
    // for a no-op). `statusChanged` is consumed after the transaction.
    let statusChanged = false;
    let changedOrder: Awaited<ReturnType<typeof this.prisma.order.update>> | null = null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true, shipments: true },
      });
      if (!order) throw new NotFoundException();
      this.assertVisible(order, caller);

      statusChanged = order.status !== status;

      const now = new Date();
      const data: Prisma.OrderUpdateInput = { status };
      if (status === "confirmed" && !order.confirmedAt) data.confirmedAt = now;
      if (status === "shipped" && !order.shippedAt) data.shippedAt = now;
      if (status === "delivered" && !order.deliveredAt) data.deliveredAt = now;
      if (status === "cancelled" && !order.cancelledAt) data.cancelledAt = now;

      const row = await tx.order.update({
        where: { id },
        data,
        include: { items: true, shipments: true },
      });
      changedOrder = row;

      await tx.auditLog.create({
        data: {
          actorType: "company_user",
          actorId: caller.companyUserId ?? null,
          action: "order.status.change",
          entityType: "order",
          entityId: id,
          payload: { from: order.status, to: status } as Prisma.InputJsonValue,
        },
      });

      return row;
    });

    // ── Post-transaction side effects (non-blocking where possible) ─────
    if (status === "delivered") {
      try {
        await this.coins.releaseOrderCoins(id);
      } catch (err) {
        // Swallow — coin release is best-effort and should not block the
        // order status update. Logged via Nest's default logger.
        console.error("[orders.updateStatus] releaseOrderCoins failed", err);
      }
    }

    // Fire a customer-facing push notification for milestone transitions
    // (confirmed / shipped / delivered / cancelled). Only when the status
    // actually changed — avoids double-pings when an admin re-clicks the
    // same status. Non-blocking: errors are swallowed inside the helper.
    if (statusChanged && changedOrder) {
      this.pushOrderStatus(
        (changedOrder as any).customerId ?? null,
        (changedOrder as any).orderNumber,
        status,
      );
    }

    // Tell other open sessions for this customer to refresh the orders
    // list / detail. Status delivered also bumps goins (released coins).
    if (statusChanged && (changedOrder as any)?.customerId) {
      const cid = (changedOrder as any).customerId as string;
      const scopes: ("orders" | "goins")[] = ["orders"];
      if (status === "delivered") scopes.push("goins");
      this.realtime.publishMany(cid, scopes);
    }

    return updated;
  }

  /**
   * Customer updates the canvas customization on a single order item.
   * Only allowed while the order is in an editable status (pending / confirmed).
   * The new customization JSON (designs[], canvasJSON, previewDataUrl) replaces
   * the existing one on the OrderItem row.
   */
  async updateItemCustomization(
    orderId: string,
    itemId: string,
    customization: unknown,
    caller: CallerContext,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertVisible(order, caller);

    const editableStatuses = ["pending", "confirmed"];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Design cannot be edited once the order is ${order.status.replace(/_/g, " ")}.`,
      );
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Order item not found");

    return this.prisma.orderItem.update({
      where: { id: itemId },
      data: { customization: customization as Prisma.InputJsonValue },
    });
  }

  /**
   * Customer-initiated cancellation. Only allowed before in_production.
   * Stores the reason in `notes` and fires a push notification.
   */
  async cancelOrder(id: string, reason: string, caller: CallerContext) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, shipments: true },
    });
    if (!order) throw new NotFoundException();
    this.assertVisible(order, caller);

    const blockedStatuses = ["in_production", "ready_to_ship", "shipped", "delivered", "cancelled", "returned"];
    if (blockedStatuses.includes(order.status)) {
      throw new BadRequestException(`Order cannot be cancelled once it is ${order.status.replace(/_/g, " ")}.`);
    }

    const noteText = reason
      ? `[Cancelled by customer] ${reason}`
      : "[Cancelled by customer]";

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id },
        data: { status: "cancelled", cancelledAt: new Date(), notes: noteText },
        include: { items: true, shipments: true },
      });
      await tx.auditLog.create({
        data: {
          actorType: "customer",
          actorId: caller.customerId ?? null,
          action: "order.cancelled_by_customer",
          entityType: "order",
          entityId: id,
          payload: { reason } as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    this.pushOrderStatus(order.customerId, order.orderNumber, "cancelled");
    if (order.customerId) this.realtime.publish(order.customerId, "orders");
    return updated;
  }

  /**
   * Admin-initiated cancellation with optional inventory restock.
   *
   * Differences from customer-initiated cancel:
   *   - Allowed at ANY status except already-cancelled / delivered. Admin
   *     can cancel a shipped order if there's a return-to-sender flow.
   *   - When `restock=true`, increments product / variant inventory back
   *     by each line's qty inside the same transaction so a half-failed
   *     restock can't leave us with phantom stock.
   *   - Records actor as the admin's b2b user id, not the customer id.
   *
   * Note: the OrderItem schema doesn't store the variantOptionId directly,
   * so for variant-restock we look up the matching ProductVariantOption by
   * (productId + name + value) from the snapshot. If the admin renamed
   * the variant since purchase we restock the parent product's inventory
   * field (correct fallback — it's still the same SKU upstream).
   */
  async cancelOrderByAdmin(
    id: string,
    args: { reason?: string; restock?: boolean },
    caller: CallerContext,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, shipments: true },
    });
    if (!order) throw new NotFoundException();

    if (order.status === "cancelled") {
      throw new BadRequestException("Order is already cancelled.");
    }
    if (order.status === "delivered") {
      throw new BadRequestException("Delivered orders should be refunded, not cancelled. Use the refund flow.");
    }

    const reason = args.reason?.trim() || "";
    const restock = args.restock === true;
    const noteText = reason
      ? `[Cancelled by admin] ${reason}`
      : `[Cancelled by admin]`;

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Mark order cancelled
      const row = await tx.order.update({
        where: { id },
        data: { status: "cancelled", cancelledAt: new Date(), notes: noteText },
        include: { items: true, shipments: true },
      });

      // 2. Restock inventory if requested. Best-effort — never fail the
      //    cancel because a restock side-effect couldn't resolve a
      //    variant. The audit log captures what happened.
      const restocked: Array<{ productId: string; qty: number; variantValue?: string | null }> = [];
      if (restock) {
        for (const it of order.items) {
          try {
            // Try variant first if the line had variantOptions
            const variantOpts = (it.variantOptions ?? null) as Record<string, string> | null;
            let restockedVariant = false;
            if (variantOpts && Object.keys(variantOpts).length > 0) {
              for (const [name, value] of Object.entries(variantOpts)) {
                const variant = await tx.productVariantOption.findFirst({
                  where: { productId: it.productId, name, value },
                });
                if (variant) {
                  await tx.productVariantOption.update({
                    where: { id: variant.id },
                    data: { inventory: { increment: it.qty } },
                  });
                  restocked.push({ productId: it.productId, qty: it.qty, variantValue: value });
                  restockedVariant = true;
                  break;
                }
              }
            }
            if (!restockedVariant) {
              await tx.product.update({
                where: { id: it.productId },
                data: { inventory: { increment: it.qty } },
              });
              restocked.push({ productId: it.productId, qty: it.qty });
            }
          } catch (err) {
            // Swallow per-line errors; audit log shows what we attempted.
            // Don't break the cancel because of a restock hiccup.
          }
        }
      }

      // 3. Audit log
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: caller.companyUserId ?? null,
          action: restock ? "order.cancelled_by_admin_with_restock" : "order.cancelled_by_admin",
          entityType: "order",
          entityId: id,
          payload: { reason, restock, restocked } as Prisma.InputJsonValue,
        },
      });

      return row;
    });

    this.pushOrderStatus(order.customerId, order.orderNumber, "cancelled");
    if (order.customerId) this.realtime.publish(order.customerId, "orders");
    // Restock changed product / variant inventory — invalidate catalog cache so
    // the storefront's "in stock" / qty hint reflect immediately.
    if (restock) {
      this.realtime.publishGlobal("products");
    }
    return updated;
  }

  /**
   * Refund an order — full or partial — and either credit Razorpay back
   * to the original payment method, or credit Goins to the customer's
   * wallet (for goodwill / promo refunds where we'd rather keep the
   * money in our ecosystem).
   *
   * Args:
   *   amountInr  — partial amount in rupees. Pass 0 / undefined for full refund.
   *   reason     — required, stored on the order + audit log + customer push.
   *   asGoins    — true → no Razorpay call, credit Goins instead (1₹ = 1 coin).
   *                Useful for COD orders (no payment to refund) or for
   *                "we'll give you store credit instead of bank reversal" deals.
   *
   * Effects:
   *   - calls Razorpay payments.refund() if applicable (prepaid + asGoins=false)
   *   - updates order.paymentStatus = "refunded" (full) or "partially_refunded"
   *   - records reason + razorpay_refund_id in order.metadata.refunds[]
   *   - audit log entry
   *   - push notification to the customer
   *   - SSE invalidate for the customer's orders scope
   *
   * Note: refunding does NOT cancel the order or restock inventory by
   * itself. If the customer wants both, the agent should call cancel
   * (with restock=true) first, then refund.
   */
  async refundOrder(
    id: string,
    args: { amountInr?: number; reason: string; asGoins?: boolean },
    caller: CallerContext,
  ) {
    if (!args.reason?.trim()) {
      throw new BadRequestException("Refund reason is required.");
    }
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw new NotFoundException();

    const grand = Number(order.grandTotal);
    const requestedInr = args.amountInr ?? 0;
    const refundAmountInr = requestedInr > 0
      ? Math.min(requestedInr, grand)
      : grand;
    if (refundAmountInr <= 0) {
      throw new BadRequestException("Refund amount must be greater than zero.");
    }

    // Already-refunded sanity check
    const meta = (order.metadata ?? {}) as Record<string, unknown>;
    const priorRefunds = Array.isArray(meta.refunds) ? (meta.refunds as Array<{ amountInr: number }>) : [];
    const alreadyRefunded = priorRefunds.reduce((s, r) => s + Number(r.amountInr ?? 0), 0);
    if (alreadyRefunded + refundAmountInr > grand + 0.5 /* float guard */) {
      throw new BadRequestException(
        `Cannot refund more than the order total. Already refunded ₹${alreadyRefunded.toFixed(2)} of ₹${grand.toFixed(2)}.`,
      );
    }

    const isCod = (order.paymentMethod ?? "").toLowerCase() === "cod";
    const isPrepaid = !isCod && !!order.razorpayPaymentId;
    const asGoins = !!args.asGoins || (isCod && !args.asGoins);

    // ── Execute the refund side-effect ──────────────────────────────────
    let razorpayRefundId: string | null = null;
    if (asGoins) {
      // Credit Gifteeng coins to the customer's wallet. 1₹ = 1 coin.
      // Skipped for guest orders (no customerId).
      if (order.customerId) {
        await this.coins.adminGrant(
          order.customerId,
          Math.round(refundAmountInr),
          `Refund for order ${order.orderNumber}: ${args.reason}`,
        );
      }
    } else if (isPrepaid && this.razorpay) {
      try {
        const refund = await this.razorpay.payments.refund(order.razorpayPaymentId!, {
          amount: Math.round(refundAmountInr * 100), // paise
          notes: { reason: args.reason, orderNumber: order.orderNumber },
          speed: "normal",
        } as any);
        razorpayRefundId = (refund as any)?.id ?? null;
      } catch (err) {
        // Bubble a clean message — admin needs to know the gateway said no
        // (insufficient balance, refund window expired, etc.).
        const msg = (err as any)?.error?.description ?? (err as Error).message ?? "Razorpay refund failed";
        throw new BadRequestException(`Razorpay refund failed: ${msg}`);
      }
    } else if (isPrepaid && !this.razorpay) {
      throw new BadRequestException(
        "Razorpay is not configured on this server. Refund cannot be processed back to original payment method.",
      );
    }

    // ── Persist to DB ───────────────────────────────────────────────────
    const refundEntry = {
      amountInr: refundAmountInr,
      reason: args.reason,
      asGoins,
      razorpayRefundId,
      at: new Date().toISOString(),
      actorType: "admin",
      actorId: caller.companyUserId ?? null,
    };
    const newRefunds = [...priorRefunds, refundEntry];
    const totalRefunded = alreadyRefunded + refundAmountInr;
    const fullyRefunded = Math.abs(totalRefunded - grand) < 0.5;

    const updated = await this.prisma.$transaction(async (tx) => {
      // PaymentStatus enum has only 5 values (pending/authorized/captured/
      // failed/refunded) — there's no `partially_refunded`. So for partial
      // refunds we leave the enum at `captured` and track the partial
      // refund history in `metadata.refunds[]`. UI reads `metadata.refunds`
      // to render the partial-refund banner. Full refund flips the enum.
      const row = await tx.order.update({
        where: { id },
        data: {
          ...(fullyRefunded ? { paymentStatus: "refunded" as const } : {}),
          metadata: { ...meta, refunds: newRefunds } as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: caller.companyUserId ?? null,
          action: fullyRefunded ? "order.refunded_full" : "order.refunded_partial",
          entityType: "order",
          entityId: id,
          payload: refundEntry as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    // ── Notify the customer ─────────────────────────────────────────────
    if (order.customerId) {
      const title = asGoins
        ? `${refundAmountInr.toFixed(0)} Gifteeng coins added`
        : `₹${refundAmountInr.toFixed(0)} refunded for ${order.orderNumber}`;
      const body = asGoins
        ? `Reason: ${args.reason}. Use them on your next order.`
        : `Reason: ${args.reason}. The amount will reflect in your account in 5-7 working days.`;
      try {
        await this.notifications.sendToCustomer(order.customerId, { title, body, data: { orderId: id } });
      } catch (err) {
        this.log.warn(`refund push failed for order ${id}: ${(err as Error).message}`);
      }
      this.realtime.publish(order.customerId, "orders");
      if (asGoins) this.realtime.publish(order.customerId, "goins");
    }

    return updated;
  }

  /**
   * Customer requests a later delivery date (postpone only — cannot prepone).
   * Stored in order.metadata.requestedDeliveryDate; visible to production team.
   */
  /**
   * Admin order edit — per-line qty changes, line removals, and address
   * updates in a single transactional call.
   *
   * Scope of this MVP (Phase C-2):
   *   - Edit existing line qty (qty=0 with remove=true deletes the line)
   *   - Update shipping address
   *   - Update billing address
   *
   * Out of scope until Phase C-3:
   *   - Variant swap on an existing line (workaround: remove + add)
   *   - Adding a new line item from scratch (workaround: customer
   *     places a top-up order)
   *
   * Allowed statuses: any pre-shipment state — `new_order`, `confirmed`,
   * `in_production`, `ready_to_ship`. Once the parcel has shipped or
   * been delivered the order is fait accompli (use refund + RMA path).
   *
   * Side-effects executed atomically inside one Postgres transaction:
   *   - Inventory restock when qty drops or a line is removed (variant
   *     match by name+value, parent fallback).
   *   - Inventory deduct when qty increases (validates against current
   *     stock; throws if insufficient — order qty stays unchanged in
   *     that case).
   *   - Subtotal / tax / grandTotal recomputed. Tax stays proportional
   *     to the original tax rate; discount + shipping unchanged unless
   *     explicitly passed.
   *   - AuditLog entry with the diff.
   *   - Optional push notification to the customer ("Your order has
   *     been updated. New total: ₹X.").
   *   - SSE invalidate for orders + (if any restock occurred) products
   *     scopes so storefront stock counters refresh immediately.
   *
   * Note on totals after edit: this never silently captures additional
   * payment OR auto-refunds. If grandTotal drops, the admin should
   * follow up with a refund call (use the existing refund flow). If
   * grandTotal goes up, the admin should request a top-up payment
   * link from the customer (out of scope here). Both deltas are shown
   * in the response so the agent can act.
   */
  async editOrder(
    id: string,
    edits: {
      items?: Array<{ id: string; qty: number; remove?: boolean }>;
      shippingAddress?: Record<string, unknown>;
      billingAddress?:  Record<string, unknown>;
      notifyCustomer?:  boolean;
    },
    caller: CallerContext,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, shipments: true },
    });
    if (!order) throw new NotFoundException();

    const editableStatuses = new Set(["new_order", "confirmed", "in_production", "ready_to_ship"]);
    if (!editableStatuses.has(order.status)) {
      throw new BadRequestException(
        `Cannot edit a ${order.status.replace(/_/g, " ")} order. Use the refund / RMA flow instead.`,
      );
    }

    // Pre-validate edits against the existing item set.
    const editsByItemId = new Map<string, { qty: number; remove?: boolean }>();
    for (const e of (edits.items ?? [])) {
      if (e.qty < 0) throw new BadRequestException(`Item ${e.id}: qty cannot be negative.`);
      if (e.qty === 0 && !e.remove) {
        throw new BadRequestException(
          `Item ${e.id}: qty=0 must be paired with remove=true (explicit deletion).`,
        );
      }
      editsByItemId.set(e.id, { qty: e.qty, remove: e.remove });
    }

    // Pre-flight: refuse to touch a line that has an open return
    // request. Allowing it would either orphan the RMA (FK now
    // SET NULLs the orderItemId, but the customer-facing "I asked
    // for a return on item X" history loses meaning) or silently
    // cancel the customer's RMA — both are bad UX.
    const editedIds = [...editsByItemId.keys()];
    if (editedIds.length > 0) {
      const openRmas = await this.prisma.returnRequest.findMany({
        where: {
          orderItemId: { in: editedIds },
          status: { notIn: ["rejected", "cancelled", "refunded"] },
        },
        select: { id: true, orderItemId: true, status: true },
      });
      if (openRmas.length > 0) {
        const ids = openRmas.map((r) => r.id.slice(0, 8) + "…").join(", ");
        throw new BadRequestException(
          `Cannot edit line items with open return requests (${ids}). ` +
          `Resolve the returns first (approve / reject / refund), then edit.`,
        );
      }
    }

    // Pre-flight stock check for qty increases.
    for (const it of order.items) {
      const e = editsByItemId.get(it.id);
      if (!e || e.remove) continue;
      const delta = e.qty - it.qty;
      if (delta > 0) {
        const variantOpts = (it.variantOptions ?? null) as Record<string, string> | null;
        let availableInVariant: number | null = null;
        if (variantOpts && Object.keys(variantOpts).length > 0) {
          for (const [name, value] of Object.entries(variantOpts)) {
            const v = await this.prisma.productVariantOption.findFirst({
              where: { productId: it.productId, name, value },
            });
            if (v) { availableInVariant = v.inventory; break; }
          }
        }
        if (availableInVariant !== null) {
          if (availableInVariant < delta) {
            throw new BadRequestException(
              `Item ${it.id}: only ${availableInVariant} units available in this variant; cannot increase qty by ${delta}.`,
            );
          }
        } else {
          const product = await this.prisma.product.findUnique({ where: { id: it.productId } });
          if ((product?.inventory ?? 0) < delta) {
            throw new BadRequestException(
              `Item ${it.id}: only ${product?.inventory ?? 0} units in stock; cannot increase qty by ${delta}.`,
            );
          }
        }
      }
    }

    // Run everything in one transaction.
    const oldGrand = Number(order.grandTotal);
    const oldSubtotal = Number(order.subtotal);
    const oldTax = Number(order.taxTotal);
    const taxRate = oldSubtotal > 0 ? oldTax / oldSubtotal : 0;

    const inventoryDelta: Array<{ productId: string; qty: number; variantValue?: string | null }> = [];

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Apply per-line edits
      for (const it of order.items) {
        const e = editsByItemId.get(it.id);
        if (!e) continue;
        const variantOpts = (it.variantOptions ?? null) as Record<string, string> | null;

        if (e.remove) {
          await tx.orderItem.delete({ where: { id: it.id } });
          // Restock the entire line
          await this.applyInventoryDelta(tx, it.productId, variantOpts, +it.qty, inventoryDelta);
        } else {
          const delta = e.qty - it.qty;
          if (delta !== 0) {
            await tx.orderItem.update({
              where: { id: it.id },
              data: {
                qty: e.qty,
                totalPrice: new Prisma.Decimal(it.unitPrice).mul(e.qty),
              },
            });
            // delta > 0 → deduct from stock; delta < 0 → restock
            await this.applyInventoryDelta(tx, it.productId, variantOpts, -delta, inventoryDelta);
          }
        }
      }

      // 2. Recompute totals from the surviving lines
      const remainingItems = await tx.orderItem.findMany({ where: { orderId: id } });
      const newSubtotal = remainingItems.reduce(
        (s, li) => s + Number(li.unitPrice) * li.qty, 0,
      );
      const newTax = +(newSubtotal * taxRate).toFixed(2);
      const newGrand = newSubtotal
        - Number(order.discountTotal)
        + Number(order.shippingTotal)
        + newTax;

      const updateData: Prisma.OrderUpdateInput = {
        subtotal:   new Prisma.Decimal(newSubtotal.toFixed(2)),
        taxTotal:   new Prisma.Decimal(newTax.toFixed(2)),
        grandTotal: new Prisma.Decimal(Math.max(0, newGrand).toFixed(2)),
      };
      if (edits.shippingAddress) updateData.shippingAddress = edits.shippingAddress as Prisma.InputJsonValue;
      if (edits.billingAddress)  updateData.billingAddress  = edits.billingAddress  as Prisma.InputJsonValue;

      const updated = await tx.order.update({
        where: { id },
        data: updateData,
        include: { items: true },
      });

      // 3. Audit log with the diff
      await tx.auditLog.create({
        data: {
          actorType: "admin",
          actorId: caller.companyUserId ?? null,
          action: "order.edited",
          entityType: "order",
          entityId: id,
          payload: {
            itemEdits: edits.items ?? [],
            shippingAddressChanged: !!edits.shippingAddress,
            billingAddressChanged:  !!edits.billingAddress,
            oldGrand,
            newGrand: Number(updated.grandTotal),
            inventoryDelta,
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });

    // 4. Out-of-band notifications
    if (order.customerId) {
      this.realtime.publish(order.customerId, "orders");
    }
    if (inventoryDelta.length > 0) {
      this.realtime.publishGlobal("products");
    }
    if (edits.notifyCustomer && order.customerId) {
      const newGrand = Number(result.grandTotal);
      const diff = newGrand - oldGrand;
      try {
        await this.notifications.sendToCustomer(order.customerId, {
          title: `Your order ${order.orderNumber} has been updated`,
          body: diff === 0
            ? `Some details changed. New total: ₹${newGrand.toFixed(0)}.`
            : diff > 0
              ? `New total: ₹${newGrand.toFixed(0)} (+ ₹${Math.abs(diff).toFixed(0)}).`
              : `New total: ₹${newGrand.toFixed(0)} (− ₹${Math.abs(diff).toFixed(0)} less).`,
          data: { orderId: id, kind: "order_edited" },
        });
      } catch (err) {
        this.log.warn(`order-edited push failed: ${(err as Error).message}`);
      }
    }

    return {
      order: result,
      delta: {
        oldGrand,
        newGrand: Number(result.grandTotal),
        diff: Number(result.grandTotal) - oldGrand,
      },
      inventoryDelta,
    };
  }

  /** Helper: apply an inventory increment (positive) or decrement (negative). */
  private async applyInventoryDelta(
    tx: Prisma.TransactionClient,
    productId: string,
    variantOpts: Record<string, string> | null,
    qtyDelta: number,
    log: Array<{ productId: string; qty: number; variantValue?: string | null }>,
  ): Promise<void> {
    if (qtyDelta === 0) return;
    let touched = false;
    if (variantOpts && Object.keys(variantOpts).length > 0) {
      for (const [name, value] of Object.entries(variantOpts)) {
        const variant = await tx.productVariantOption.findFirst({
          where: { productId, name, value },
        });
        if (variant) {
          await tx.productVariantOption.update({
            where: { id: variant.id },
            data: { inventory: { increment: qtyDelta } },
          });
          log.push({ productId, qty: qtyDelta, variantValue: value });
          touched = true;
          break;
        }
      }
    }
    if (!touched) {
      await tx.product.update({
        where: { id: productId },
        data: { inventory: { increment: qtyDelta } },
      });
      log.push({ productId, qty: qtyDelta });
    }
  }

  async requestDeliveryDate(id: string, requestedDate: string, caller: CallerContext) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, shipments: true },
    });
    if (!order) throw new NotFoundException();
    this.assertVisible(order, caller);

    const newDate = new Date(requestedDate);
    if (isNaN(newDate.getTime())) throw new BadRequestException("Invalid date format.");

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (newDate <= now) throw new BadRequestException("Requested delivery date must be a future date.");

    // Enforce postpone-only: new date must be after the existing requested date.
    const existingMeta = (order.metadata ?? {}) as Record<string, unknown>;
    if (existingMeta.requestedDeliveryDate) {
      const existing = new Date(existingMeta.requestedDeliveryDate as string);
      if (newDate <= existing) {
        throw new BadRequestException("You can only postpone the delivery date, not move it earlier.");
      }
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        metadata: {
          ...(existingMeta as object),
          requestedDeliveryDate: newDate.toISOString(),
          requestedDeliveryUpdatedAt: new Date().toISOString(),
        },
      },
      include: { items: true, shipments: true },
    });

    if (order.customerId) this.realtime.publish(order.customerId, "orders");
    return updated;
  }

  /**
   * Generate the order invoice PDF.
   *
   * Availability rules (enforced here, not at the controller, so any future
   * caller — admin re-download, customer self-serve, email attachment — gets
   * the same gating):
   *   • Online prepaid orders (Razorpay + paymentStatus="paid"/"captured")
   *     → invoice is available immediately after payment.
   *   • COD orders → invoice is available only once the order is DELIVERED.
   *     Until then we throw a 403 explaining that the bill issues on
   *     delivery (when the customer hands over cash).
   * Anything else (failed payment, refunded, cancelled) → also blocked.
   */
  async generateInvoicePdf(id: string): Promise<Buffer> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        company: true,
        customer: true,
      },
    });
    if (!order) throw new NotFoundException();

    const payMethod = (order.paymentMethod ?? "").toLowerCase();
    const payStatus = (order.paymentStatus ?? "").toLowerCase();
    const orderStat = (order.status        ?? "").toLowerCase();
    const isCod      = payMethod === "cod";
    const isPrepaid  = !isCod && (payStatus === "paid" || payStatus === "captured" || payStatus === "completed");
    const isDelivered = orderStat === "delivered";

    if (!isPrepaid && !(isCod && isDelivered)) {
      // ForbiddenException so the controller maps it to 403 with a clean
      // message the customer can act on.
      throw new ForbiddenException(
        isCod
          ? "Invoice will be available once your order is delivered (COD orders generate the bill on delivery)."
          : "Invoice is available only after the payment is fully received.",
      );
    }

    // ── Firm details (issuer of the invoice) ─────────────────────────────
    // Read from env so we can update without a code change. Sensible
    // defaults baked in so dev environments still produce a valid bill.
    const firm = {
      name:    process.env.INVOICE_FIRM_NAME    ?? "Gifteeng Solutions Pvt. Ltd.",
      addr1:   process.env.INVOICE_FIRM_ADDR1   ?? "1st Floor, Plot No. 12",
      addr2:   process.env.INVOICE_FIRM_ADDR2   ?? "Andheri West",
      city:    process.env.INVOICE_FIRM_CITY    ?? "Mumbai, Maharashtra 400053",
      gstin:   process.env.INVOICE_FIRM_GSTIN   ?? "27AAGCG1234A1Z5",
      pan:     process.env.INVOICE_FIRM_PAN     ?? "AAGCG1234A",
      cin:     process.env.INVOICE_FIRM_CIN     ?? "U74999MH2024PTC123456",
      email:   process.env.INVOICE_FIRM_EMAIL   ?? "support@gifteeng.com",
      phone:   process.env.INVOICE_FIRM_PHONE   ?? "+91 91234 56789",
      website: process.env.INVOICE_FIRM_WEBSITE ?? "https://gifteeng.com",
    };

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on("data", (c) => chunks.push(c as Buffer));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
      doc.pipe(stream);

      const PAGE_W = doc.page.width;
      const M      = 40;                           // page margin
      const RIGHT  = PAGE_W - M;
      const BRAND  = "#EF3752";

      // ── Header band — firm name + invoice meta on the right ─────────────
      doc.fillColor(BRAND).rect(M, M, PAGE_W - 2 * M, 4).fill();
      doc.fillColor("#000");

      doc.fontSize(18).font("Helvetica-Bold").text(firm.name, M, M + 14);
      doc.fontSize(9).font("Helvetica");
      doc.text(firm.addr1, M, doc.y + 2);
      doc.text(firm.addr2);
      doc.text(firm.city);
      doc.text(`GSTIN: ${firm.gstin}    PAN: ${firm.pan}`);
      if (firm.cin) doc.text(`CIN: ${firm.cin}`);
      doc.text(`${firm.email}  |  ${firm.phone}  |  ${firm.website}`);

      // Right-aligned invoice block (TAX INVOICE big label + #/date)
      doc.fontSize(20).font("Helvetica-Bold").fillColor(BRAND)
         .text("TAX INVOICE", M, M + 14, { width: PAGE_W - 2 * M, align: "right" });
      doc.fillColor("#000").font("Helvetica").fontSize(9);
      const placedAt = order.placedAt instanceof Date
        ? order.placedAt
        : new Date(order.placedAt);
      doc.text(`Invoice No.: ${order.orderNumber}`, M, doc.y + 4, { width: PAGE_W - 2 * M, align: "right" });
      doc.text(`Invoice Date: ${placedAt.toISOString().slice(0, 10)}`, { width: PAGE_W - 2 * M, align: "right" });
      doc.text(`Payment: ${order.paymentMethod}${isPrepaid ? " (Paid)" : isCod ? " (Paid on delivery)" : ""}`, { width: PAGE_W - 2 * M, align: "right" });

      doc.moveDown(2);

      // Divider
      const dy = doc.y;
      doc.strokeColor("#dddddd").lineWidth(0.5).moveTo(M, dy).lineTo(RIGHT, dy).stroke();
      doc.moveDown(0.5);

      // ── Bill To panel ───────────────────────────────────────────────────
      const billY = doc.y;
      doc.fontSize(10).font("Helvetica-Bold").text("Bill To", M, billY);
      doc.font("Helvetica").fontSize(9);
      const buyerName = order.company?.name
        ?? order.customer?.fullName
        ?? order.customer?.email
        ?? "";
      doc.text(buyerName, M, doc.y + 2);
      const addr = order.billingAddress as any;
      if (addr && typeof addr === "object") {
        if (addr.line1)  doc.text(String(addr.line1));
        if (addr.line2)  doc.text(String(addr.line2));
        const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
        if (cityLine)    doc.text(cityLine);
        if (addr.phone)  doc.text(`Phone: ${addr.phone}`);
        if (addr.gstin)  doc.text(`GSTIN: ${addr.gstin}`);
      }
      doc.moveDown();

      // Divider
      const dy2 = doc.y;
      doc.strokeColor("#dddddd").lineWidth(0.5).moveTo(M, dy2).lineTo(RIGHT, dy2).stroke();
      doc.moveDown(0.5);

      // ── Line-items table ────────────────────────────────────────────────
      const COL_ITEM   = M;
      const COL_QTY    = M + 320;
      const COL_UNIT   = M + 380;
      const COL_TOTAL  = M + 460;

      // Header row
      const headerY = doc.y;
      doc.fillColor("#f3f4f6").rect(M, headerY - 2, PAGE_W - 2 * M, 18).fill();
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(9);
      doc.text("Description",  COL_ITEM,  headerY + 2);
      doc.text("Qty",           COL_QTY,   headerY + 2);
      doc.text("Unit (₹)",      COL_UNIT,  headerY + 2);
      doc.text("Total (₹)",     COL_TOTAL, headerY + 2, { width: RIGHT - COL_TOTAL, align: "right" });
      doc.moveDown(1.4);

      doc.font("Helvetica").fontSize(9);
      for (const it of order.items) {
        const rowY = doc.y;
        const title = it.product?.title ?? "Item";
        doc.text(title, COL_ITEM, rowY, { width: COL_QTY - COL_ITEM - 8 });
        const lineHeight = doc.y - rowY;
        doc.text(String(it.qty),                       COL_QTY,   rowY);
        doc.text(Number(it.unitPrice).toFixed(2),      COL_UNIT,  rowY);
        doc.text(Number(it.totalPrice).toFixed(2),     COL_TOTAL, rowY, { width: RIGHT - COL_TOTAL, align: "right" });
        doc.y = rowY + Math.max(lineHeight, 14);
        doc.strokeColor("#eeeeee").lineWidth(0.5).moveTo(M, doc.y).lineTo(RIGHT, doc.y).stroke();
        doc.moveDown(0.3);
      }
      doc.moveDown(0.5);

      // ── Totals — right-aligned summary ──────────────────────────────────
      const totalsX = RIGHT - 220;
      const writeRow = (label: string, value: string, bold = false) => {
        const yy = doc.y;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9);
        doc.text(label, totalsX, yy, { width: 100 });
        doc.text(value, totalsX + 100, yy, { width: 120, align: "right" });
        doc.moveDown(0.3);
      };
      writeRow("Subtotal",  `₹ ${Number(order.subtotal).toFixed(2)}`);
      writeRow("Discount",  `– ₹ ${Number(order.discountTotal).toFixed(2)}`);
      writeRow("Shipping",  `₹ ${Number(order.shippingTotal).toFixed(2)}`);
      writeRow("Tax (GST)", `₹ ${Number(order.taxTotal).toFixed(2)}`);
      doc.moveDown(0.2);
      doc.strokeColor("#000").lineWidth(0.7).moveTo(totalsX, doc.y).lineTo(RIGHT, doc.y).stroke();
      doc.moveDown(0.4);
      writeRow("Grand Total", `₹ ${Number(order.grandTotal).toFixed(2)}`, true);

      // ── Footer ──────────────────────────────────────────────────────────
      doc.moveDown(2);
      doc.fontSize(8).fillColor("#666").font("Helvetica");
      doc.text(
        "This is a system-generated invoice and does not require a signature. " +
        "All amounts are in INR. For any billing queries please contact " +
        `${firm.email}.`,
        M, doc.y, { width: PAGE_W - 2 * M, align: "center" },
      );

      doc.end();
    });
  }

  /**
   * Resend the order-confirmation SMS + push notification. Used by the
   * admin "Resend confirmation" action for cases where the customer
   * claims they didn't receive their original SMS (changed SIM, was
   * abroad, MSG91 / carrier glitch, etc.).
   *
   * Returns `{ ok, sms, push }` so the admin UI can show what fired.
   */
  async resendOrderConfirmation(id: string): Promise<{
    ok: boolean; sms: boolean; push: boolean; reason?: string;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!order) throw new NotFoundException();

    const phone = order.customer?.phone;
    let sms = false;
    let push = false;

    if (phone) {
      try {
        await this.notifications.sendOrderConfirmationSms(
          phone,
          order.orderNumber,
          Number(order.grandTotal),
        );
        sms = true;
      } catch (err) {
        this.log.warn(`resend SMS failed for order ${id}: ${(err as Error).message}`);
      }
    }

    if (order.customerId) {
      try {
        this.pushOrderStatus(order.customerId, order.orderNumber, "confirmed");
        push = true;
      } catch (err) {
        this.log.warn(`resend push failed for order ${id}: ${(err as Error).message}`);
      }
    }

    if (!sms && !push) {
      return { ok: false, sms, push, reason: "No phone or push token on file." };
    }
    return { ok: true, sms, push };
  }

  /**
   * Generate a packing slip PDF — the document the dispatch desk prints
   * to put inside the parcel. NO prices (the customer should never see
   * what we paid in tax / our cost), NO GST line, just:
   *   - Shipping address (big, scannable)
   *   - Order number + barcode-style line for warehouse scan
   *   - Item list with title / SKU / variant / qty
   *   - Personalisation note ("DR. ABIRAMI") if set in adminNote
   *
   * Available regardless of payment status — packing happens before
   * money clears for COD anyway.
   */
  async generatePackingSlipPdf(id: string): Promise<Buffer> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        customer: true,
      },
    });
    if (!order) throw new NotFoundException();

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on("data",  (c) => chunks.push(c as Buffer));
      stream.on("end",   () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
      doc.pipe(stream);

      const M = 40;
      const PAGE_W = doc.page.width;

      // Header
      doc.font("Helvetica-Bold").fontSize(20).fillColor("#000")
         .text("PACKING SLIP", M, M, { align: "left" });
      doc.font("Helvetica").fontSize(10).fillColor("#444")
         .text(`Order ${order.orderNumber}`, M, M + 26)
         .text(`Placed ${order.placedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
               M, M + 40);

      // Big shipping address block (right side)
      const ship = (order.shippingAddress ?? {}) as Record<string, string>;
      const shipName = ship.name || ship.fullName || order.customer?.fullName || "—";
      const shipLines = [
        ship.line1, ship.line2,
        [ship.city, ship.state, ship.postalCode || ship.pincode].filter(Boolean).join(", "),
        ship.country, ship.phone,
      ].filter(Boolean) as string[];

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#000")
         .text("SHIP TO", PAGE_W - M - 220, M, { width: 220 });
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#000")
         .text(shipName, PAGE_W - M - 220, M + 16, { width: 220 });
      doc.font("Helvetica").fontSize(10).fillColor("#222");
      let y = M + 34;
      for (const line of shipLines) {
        doc.text(line, PAGE_W - M - 220, y, { width: 220 });
        y += 14;
      }

      // Personalisation note from adminNote (warehouse needs to see it)
      const adminNote = (order.metadata as any)?.adminNote as string | undefined;
      if (adminNote && adminNote.trim()) {
        doc.moveDown(2);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#a00")
           .text("⚠ NOTE FROM CUSTOMER SERVICE", M, doc.y);
        doc.font("Helvetica").fontSize(11).fillColor("#000")
           .text(adminNote, M, doc.y + 4, { width: PAGE_W - 2 * M });
      }

      // Items table
      doc.moveDown(2);
      const tableTop = Math.max(doc.y, M + 130);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000");
      doc.text("ITEM",      M,            tableTop);
      doc.text("VARIANT",   M + 250,      tableTop);
      doc.text("SKU",       M + 380,      tableTop);
      doc.text("QTY",       PAGE_W - M - 40, tableTop, { width: 40, align: "right" });
      doc.moveTo(M, tableTop + 14).lineTo(PAGE_W - M, tableTop + 14)
         .strokeColor("#bbb").lineWidth(0.5).stroke();

      let rowY = tableTop + 20;
      doc.font("Helvetica").fontSize(10).fillColor("#000");
      for (const it of order.items) {
        // OrderItem snapshot stores title + sku at time of purchase so
        // future product renames don't change historical packing slips.
        const snap = (it.snapshot ?? null) as { title?: string; sku?: string } | null;
        const title = snap?.title || it.product?.title || "Item";
        const variantOptions = (it.variantOptions ?? null) as Record<string, string> | null;
        const variantStr = variantOptions
          ? Object.entries(variantOptions).map(([k, v]) => `${k}: ${v}`).join(", ")
          : "—";
        const sku = snap?.sku || it.product?.sku || "—";
        doc.text(title,      M,            rowY, { width: 240 });
        doc.text(variantStr, M + 250,      rowY, { width: 120 });
        doc.text(sku,        M + 380,      rowY, { width: 100 });
        doc.text(String(it.qty), PAGE_W - M - 40, rowY, { width: 40, align: "right" });
        rowY += 22;
      }

      // Footer: scan / signature box
      doc.moveTo(M, rowY + 20).lineTo(PAGE_W - M, rowY + 20)
         .strokeColor("#bbb").lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(8).fillColor("#666")
         .text(
           `Packed by: __________________     Date: __________     ` +
           `Carrier label: __________________`,
           M, rowY + 28,
         );

      doc.end();
    });
  }

  // ---- internals ----

  private buildWhere(caller: CallerContext, filter: OrderListFilter): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};

    // Tenant isolation (merged with requested filter — requested cannot widen).
    if (caller.audience === "b2c") {
      // B2C caller can only ever see their own customer orders.
      if (!caller.customerId) throw new ForbiddenException();
      where.customerId = caller.customerId;
      where.channel = "b2c";
    } else {
      // B2B caller.
      const isPlatformStaff = caller.role === "super_admin" || caller.role === "sales_admin";
      if (!isPlatformStaff) {
        if (!caller.companyId) throw new ForbiddenException();
        where.companyId = caller.companyId;
        where.channel = "b2b";
      }
      // Employee can only see their own orders (their role is 'employee').
      if (caller.role === "employee") {
        if (!caller.companyUserId) throw new ForbiddenException();
        where.companyUserId = caller.companyUserId;
      }
    }

    // Overlay requested filters on top (more restrictive only).
    if (filter.channel) {
      // If scope already pinned a channel and the caller requested a different one → empty result.
      if (where.channel && where.channel !== filter.channel) {
        where.id = "__never__";
      } else {
        where.channel = filter.channel;
      }
    }
    if (filter.status) {
      where.status = Array.isArray(filter.status) ? { in: filter.status } : filter.status;
    }
    if (filter.companyId && !where.companyId) where.companyId = filter.companyId;
    if (filter.customerId && !where.customerId) where.customerId = filter.customerId;
    if (filter.companyUserId && !where.companyUserId) where.companyUserId = filter.companyUserId;
    if (filter.from || filter.to) {
      where.placedAt = {};
      if (filter.from) (where.placedAt as Prisma.DateTimeFilter).gte = filter.from;
      if (filter.to) (where.placedAt as Prisma.DateTimeFilter).lte = filter.to;
    }
    if (filter.search) {
      where.OR = [
        { orderNumber: { contains: filter.search, mode: "insensitive" } },
        { notes: { contains: filter.search, mode: "insensitive" } },
      ];
    }

    return where;
  }

  private assertVisible(order: { channel: string; customerId: string | null; companyId: string | null; companyUserId: string | null }, caller: CallerContext) {
    if (caller.audience === "b2c") {
      if (order.channel !== "b2c" || order.customerId !== caller.customerId) throw new ForbiddenException();
      return;
    }
    const isPlatformStaff = caller.role === "super_admin" || caller.role === "sales_admin";
    if (isPlatformStaff) return;
    if (order.channel !== "b2b" || order.companyId !== caller.companyId) throw new ForbiddenException();
    if (caller.role === "employee" && order.companyUserId !== caller.companyUserId) throw new ForbiddenException();
  }

  // ── Admin-only metadata patches (tags + internal note) ───────────────────

  /** Patch admin-only fields stored under metadata: tags + note. */
  async patchAdminMeta(
    id: string,
    body: { tags?: string[]; note?: string | null },
    caller: CallerContext,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    this.assertVisible(order, caller);
    const meta = (order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata))
      ? { ...(order.metadata as Record<string, unknown>) }
      : {};
    if (Array.isArray(body.tags)) {
      meta.tags = body.tags
        .map(t => String(t).trim())
        .filter(t => t.length > 0)
        .slice(0, 32);
    }
    if (body.note !== undefined) {
      meta.adminNote = body.note ? String(body.note).slice(0, 4000) : null;
    }
    const updated = await this.prisma.order.update({
      where: { id },
      data: { metadata: meta as Prisma.InputJsonValue },
      include: { items: true, shipments: true },
    });
    if (updated.customerId) this.realtime.publish(updated.customerId, "orders");
    return updated;
  }

  /** Append a staff comment to the order's internal timeline. */
  async addInternalComment(
    id: string,
    text: string,
    author: string,
    caller: CallerContext,
  ) {
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException("Comment text required");
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    this.assertVisible(order, caller);
    const meta = (order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata))
      ? { ...(order.metadata as Record<string, unknown>) }
      : {};
    const comments = Array.isArray((meta as any).internalComments)
      ? [...((meta as any).internalComments as unknown[])]
      : [];
    comments.push({
      author,
      text: trimmed.slice(0, 4000),
      at: new Date().toISOString(),
    });
    (meta as any).internalComments = comments.slice(-200); // cap history
    const updated = await this.prisma.order.update({
      where: { id },
      data: { metadata: meta as Prisma.InputJsonValue },
      include: { items: true, shipments: true },
    });
    if (updated.customerId) this.realtime.publish(updated.customerId, "orders");
    return updated;
  }
}

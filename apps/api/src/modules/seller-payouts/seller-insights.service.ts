import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const COMMISSION_KEY = "marketplace_commission_rate";
const DEFAULT_COMMISSION = 0.10;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

@Injectable()
export class SellerInsightsService {
  constructor(private prisma: PrismaService) {}

  private period(from?: string, to?: string) {
    const now = new Date();
    const start = from
      ? new Date(from + "T00:00:00.000Z")
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = to
      ? new Date(to + "T23:59:59.999Z")
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { start, end };
  }

  private async commissionRate() {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: COMMISSION_KEY } });
    return row && typeof row.value === "number" ? row.value : DEFAULT_COMMISSION;
  }

  // ── Payout Summary ────────────────────────────────────────────────────────

  async getPayoutSummary(sellerId: string, from?: string, to?: string) {
    const { start, end } = this.period(from, to);

    // 6-month revenue chart (delivered orders, grouped by month of deliveredAt)
    const sixAgo = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1));
    const delivered6m = await this.prisma.orderItemAssignment.findMany({
      where: { sellerId, status: "delivered", deliveredAt: { gte: sixAgo, lte: end } },
      select: { deliveredAt: true, orderItem: { select: { totalPrice: true } } },
    });

    const chartMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
      chartMap.set(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, 0);
    }
    for (const a of delivered6m) {
      if (!a.deliveredAt) continue;
      const d = new Date(a.deliveredAt);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      if (chartMap.has(key)) chartMap.set(key, (chartMap.get(key) ?? 0) + Number(a.orderItem.totalPrice));
    }
    const chart = Array.from(chartMap.entries()).map(([k, amount]) => {
      const parts = k.split("-").map(Number);
      const y = parts[0] ?? 0, m = parts[1] ?? 1;
      return { month: `${MONTHS[m - 1] ?? ""} '${String(y).slice(2)}`, amount };
    });

    // Period breakdown
    const assignments = await this.prisma.orderItemAssignment.findMany({
      where: { sellerId, assignedAt: { gte: start, lte: end } },
      select: {
        id: true, status: true,
        orderItem: { select: { totalPrice: true } },
        payoutItem: {
          include: { payout: { select: { status: true, commissionRate: true, commissionAmount: true } } },
        },
      },
    });

    let gross = 0, commissionAmount = 0, commissionRateUsed = 0;
    const b = {
      delivered: { count: 0, value: 0 },
      returned:  { count: 0, value: 0 },
      cancelled: { count: 0, value: 0 },
      rto:       { count: 0, value: 0 },
    };

    for (const a of assignments) {
      const val = Number(a.orderItem.totalPrice);
      if (a.status === "delivered") {
        b.delivered.count++; b.delivered.value += val; gross += val;
        if (a.payoutItem?.payout) {
          commissionRateUsed  = Number(a.payoutItem.payout.commissionRate);
          commissionAmount   += Number(a.payoutItem.payout.commissionAmount);
        }
      } else if (a.status === "returned") {
        b.returned.count++;  b.returned.value += val;
      } else if (a.status === "cancelled") {
        b.cancelled.count++; b.cancelled.value += val;
      } else if (a.status === "floating") {
        b.rto.count++;       b.rto.value += val;
      }
    }

    if (gross > 0 && commissionAmount === 0) {
      commissionRateUsed = await this.commissionRate();
      commissionAmount   = +(gross * commissionRateUsed).toFixed(2);
    }

    // All-time settled / overall pending
    const [settledAgg, pendingCount] = await Promise.all([
      this.prisma.sellerPayout.aggregate({
        where: { sellerId, status: "paid" },
        _sum: { netAmount: true }, _count: { id: true },
      }),
      this.prisma.orderItemAssignment.count({
        where: { sellerId, status: "delivered", payoutItem: null },
      }),
    ]);

    return {
      period: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
      chart,
      summary: {
        settled:      Number(settledAgg._sum.netAmount ?? 0),
        settledCount: settledAgg._count.id,
        pendingCount,
      },
      breakdown: {
        ...b,
        commission: { rate: commissionRateUsed, amount: -commissionAmount },
        gross,
        net: +(gross - commissionAmount).toFixed(2),
      },
    };
  }

  // ── Order Summary ─────────────────────────────────────────────────────────

  async getOrderSummary(
    sellerId: string, from?: string, to?: string,
    status?: string, page = 1, limit = 20,
  ) {
    const { start, end } = this.period(from, to);
    const baseWhere = { sellerId, assignedAt: { gte: start, lte: end } } as const;
    const listWhere = { ...baseWhere, ...(status ? { status: status as never } : {}) };

    const [total, statusGroups, rows] = await Promise.all([
      this.prisma.orderItemAssignment.count({ where: listWhere }),
      this.prisma.orderItemAssignment.groupBy({
        by: ["status"], where: baseWhere, _count: { id: true },
      }),
      this.prisma.orderItemAssignment.findMany({
        where:   listWhere,
        orderBy: { assignedAt: "desc" },
        skip:    (page - 1) * limit,
        take:    limit,
        include: {
          orderItem: {
            include: {
              product: { select: { title: true, images: true } },
              order:   { select: { orderNumber: true, placedAt: true } },
            },
          },
          payoutItem: { include: { payout: { select: { status: true } } } },
        },
      }),
    ]);

    const overview: Record<string, number> = { total: 0 };
    for (const g of statusGroups) {
      overview[g.status] = g._count.id;
      overview["total"]  = (overview["total"] ?? 0) + g._count.id;
    }

    const orders = rows.map(a => ({
      id:          a.id,
      status:      a.status,
      orderNumber: a.orderItem.order.orderNumber,
      product: {
        title: a.orderItem.product.title,
        image: (a.orderItem.product.images as { url: string }[])?.[0]?.url ?? null,
      },
      qty:         a.orderItem.qty,
      orderAmount: Number(a.orderItem.totalPrice).toFixed(2),
      payoutStatus: !a.payoutItem
        ? "none"
        : a.payoutItem.payout?.status === "paid" ? "settled" : "pending",
      assignedAt:  a.assignedAt,
      deliveredAt: a.deliveredAt,
      orderDate:   a.orderItem.order.placedAt,
    }));

    // Dispatch compliance for this period
    const dispatched = await this.prisma.orderItemAssignment.findMany({
      where: {
        sellerId,
        dispatchedAt: { gte: start, lte: end },
        acceptedAt:   { not: null },
      },
      select: { acceptedAt: true, dispatchedAt: true, deadlineAt: true },
    });

    let onTime = 0, late = 0, totalMs = 0;
    for (const d of dispatched) {
      if (!d.dispatchedAt || !d.acceptedAt) continue;
      totalMs += new Date(d.dispatchedAt).getTime() - new Date(d.acceptedAt).getTime();
      if (new Date(d.dispatchedAt) <= new Date(d.deadlineAt)) onTime++;
      else late++;
    }
    const dispatchTotal = onTime + late;
    const compliance = {
      onTime,
      late,
      total:            dispatchTotal,
      pct:              dispatchTotal > 0 ? Math.round(onTime / dispatchTotal * 100) : null,
      avgDispatchHours: dispatchTotal > 0 ? Math.round(totalMs / dispatchTotal / 3_600_000) : null,
    };

    return { overview, orders, total, page, limit, compliance };
  }

  // ── Product Summary ───────────────────────────────────────────────────────

  async getProductSummary(sellerId: string, from?: string, to?: string) {
    const { start, end } = this.period(from, to);

    const rows = await this.prisma.orderItemAssignment.findMany({
      where: { sellerId, assignedAt: { gte: start, lte: end } },
      include: {
        orderItem: { select: { totalPrice: true } },
        payoutItem: { select: { grossAmount: true } },
        sellerProduct: {
          include: {
            product: { select: { title: true, images: true, category: true } },
          },
        },
      },
    });

    const map = new Map<string, {
      sellerProductId: string; title: string; image: string | null; category: string | null;
      ratingAvg: number; ratingCount: number;
      orders: number; delivered: number; returned: number; cancelled: number;
      revenue: number; payout: number;
    }>();

    for (const a of rows) {
      if (!a.sellerProduct) continue;
      const sid = a.sellerProduct.id;
      if (!map.has(sid)) {
        map.set(sid, {
          sellerProductId: sid,
          title:      a.sellerProduct.product.title,
          image:      (a.sellerProduct.product.images as { url: string }[])?.[0]?.url ?? null,
          category:   a.sellerProduct.product.category,
          ratingAvg:  a.sellerProduct.ratingAvg,
          ratingCount: a.sellerProduct.ratingCount,
          orders: 0, delivered: 0, returned: 0, cancelled: 0, revenue: 0, payout: 0,
        });
      }
      const e = map.get(sid)!;
      const val = Number(a.orderItem.totalPrice);
      e.orders++; e.revenue += val;
      if (a.status === "delivered") {
        e.delivered++;
        e.payout += a.payoutItem ? Number(a.payoutItem.grossAmount) : val;
      } else if (a.status === "returned") { e.returned++; }
      else if (a.status === "cancelled")  { e.cancelled++; }
    }

    return Array.from(map.values()).sort((a, b) => b.orders - a.orders);
  }
}

import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

// Eligibility: delivered + 7d return window + 10d hold = 17 days
const ELIGIBILITY_DAYS = 17;
const DEFAULT_COMMISSION = 0.10;
const COMMISSION_KEY = "marketplace_commission_rate";

@Injectable()
export class SellerPayoutsService {
  private readonly logger = new Logger(SellerPayoutsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Commission setting ────────────────────────────────────────────────

  async getCommissionRate(): Promise<number> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: COMMISSION_KEY },
    });
    if (!row) return DEFAULT_COMMISSION;
    return typeof row.value === "number" ? row.value : DEFAULT_COMMISSION;
  }

  async setCommissionRate(rate: number): Promise<void> {
    if (rate < 0 || rate > 1) throw new BadRequestException("Rate must be 0–1 (e.g. 0.10 for 10%)");
    await this.prisma.platformSetting.upsert({
      where: { key: COMMISSION_KEY },
      update: { value: rate },
      create: { key: COMMISSION_KEY, value: rate },
    });
  }

  async getAllSettings() {
    return this.prisma.platformSetting.findMany();
  }

  async setSetting(key: string, value: unknown) {
    return this.prisma.platformSetting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue },
      create: { key, value: value as Prisma.InputJsonValue },
    });
  }

  // ─── Payout cron — runs once a day at 02:00 IST (20:30 UTC) ──────────

  @Cron("30 20 * * *")
  async processPendingPayouts(): Promise<void> {
    const rate = await this.getCommissionRate();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ELIGIBILITY_DAYS);

    // Find all delivered assignments past the eligibility window with no payout item yet
    const eligible = await this.prisma.orderItemAssignment.findMany({
      where: {
        status: "delivered",
        deliveredAt: { lte: cutoff },
        payoutItem: null,
      },
      include: {
        orderItem: { select: { totalPrice: true, qty: true } },
      },
    });

    if (eligible.length === 0) return;

    // Group by seller
    const bySeller = new Map<string, typeof eligible>();
    for (const a of eligible) {
      const list = bySeller.get(a.sellerId) ?? [];
      list.push(a);
      bySeller.set(a.sellerId, list);
    }

    for (const [sellerId, items] of bySeller) {
      const gross = items.reduce(
        (sum, a) => sum + Number(a.orderItem.totalPrice),
        0,
      );
      const commission = +(gross * rate).toFixed(2);
      const net = +(gross - commission).toFixed(2);

      const payout = await this.prisma.sellerPayout.create({
        data: {
          sellerId,
          grossAmount:      gross,
          commissionRate:   rate,
          commissionAmount: commission,
          netAmount:        net,
          status:           "eligible",
          items: {
            create: items.map((a) => ({
              assignmentId: a.id,
              grossAmount:  Number(a.orderItem.totalPrice),
            })),
          },
        },
      });

      this.logger.log(
        `Created payout=${payout.id} seller=${sellerId} net=₹${net} (${items.length} items)`,
      );
    }
  }

  // ─── Seller-facing ──────────────────────────────────────────────────────

  async getSellerAnalytics(sellerId: string) {
    const now   = new Date();
    const day   = new Date(now); day.setHours(0, 0, 0, 0);
    const week  = new Date(now); week.setDate(week.getDate() - 7);
    const month = new Date(now); month.setMonth(month.getMonth() - 1);
    const q3    = new Date(now); q3.setMonth(q3.getMonth() - 3);

    const [today, thisWeek, lastMonth, last3Months, totalOrders] = await Promise.all([
      this.prisma.orderItemAssignment.count({
        where: { sellerId, status: { notIn: ["floating", "cancelled"] }, assignedAt: { gte: day } },
      }),
      this.prisma.orderItemAssignment.count({
        where: { sellerId, status: { notIn: ["floating", "cancelled"] }, assignedAt: { gte: week } },
      }),
      this.prisma.orderItemAssignment.count({
        where: { sellerId, status: { notIn: ["floating", "cancelled"] }, assignedAt: { gte: month } },
      }),
      this.prisma.orderItemAssignment.count({
        where: { sellerId, status: { notIn: ["floating", "cancelled"] }, assignedAt: { gte: q3 } },
      }),
      this.prisma.orderItemAssignment.count({
        where: { sellerId, status: { notIn: ["floating", "cancelled"] } },
      }),
    ]);

    // Pending (in return window — delivered < ELIGIBILITY_DAYS ago, no payout)
    const returnCutoff = new Date();
    returnCutoff.setDate(returnCutoff.getDate() - ELIGIBILITY_DAYS);

    const [inReturnWindow, eligibleAssignments, lastPayout, activeAssignments] = await Promise.all([
      this.prisma.orderItemAssignment.findMany({
        where: {
          sellerId,
          status: "delivered",
          deliveredAt: { gt: returnCutoff },
          payoutItem: null,
        },
        include: { orderItem: { select: { totalPrice: true } } },
      }),
      this.prisma.orderItemAssignment.findMany({
        where: {
          sellerId,
          status: "delivered",
          deliveredAt: { lte: returnCutoff },
          payoutItem: null,
        },
        include: { orderItem: { select: { totalPrice: true } } },
      }),
      this.prisma.sellerPayout.findFirst({
        where: { sellerId, status: "paid" },
        orderBy: { paidAt: "desc" },
      }),
      this.prisma.orderItemAssignment.groupBy({
        by: ["status"],
        where: { sellerId, status: { in: ["pending", "accepted", "processing", "dispatched"] } },
        _count: true,
      }),
    ]);

    const pendingInReturnWindow = inReturnWindow.reduce(
      (s, a) => s + Number(a.orderItem.totalPrice), 0,
    );
    const nextPayoutAmount = eligibleAssignments.reduce(
      (s, a) => s + Number(a.orderItem.totalPrice), 0,
    );
    const commissionRate = await this.getCommissionRate();

    // Next payout eligibility date = oldest unprocessed delivery + 17 days
    const oldestDelivery = inReturnWindow.sort(
      (a, b) => new Date(a.deliveredAt!).getTime() - new Date(b.deliveredAt!).getTime(),
    )[0];
    let nextPayoutEligibleAt: string | null = null;
    if (oldestDelivery?.deliveredAt) {
      const d = new Date(oldestDelivery.deliveredAt);
      d.setDate(d.getDate() + ELIGIBILITY_DAYS);
      nextPayoutEligibleAt = d.toISOString();
    }

    const activeMap = Object.fromEntries(
      activeAssignments.map((r) => [r.status, r._count]),
    );

    // Catalog metrics
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const [activeListings, recentSalesIds] = await Promise.all([
      this.prisma.sellerProduct.count({ where: { sellerId, status: "approved" } }),
      this.prisma.orderItemAssignment.findMany({
        where: {
          sellerId,
          status:      "delivered",
          deliveredAt: { gte: thirtyAgo },
          sellerProductId: { not: null },
        },
        select:   { sellerProductId: true },
        distinct: ["sellerProductId"],
      }),
    ]);
    const zeroSales30d = Math.max(0, activeListings - recentSalesIds.length);

    return {
      orders: { today, thisWeek, lastMonth, last3Months, total: totalOrders },
      earnings: {
        commissionRate,
        pendingInReturnWindow: +pendingInReturnWindow.toFixed(2),
        nextPayoutAmount:      +nextPayoutAmount.toFixed(2),
        nextPayoutEligibleAt,
        lastPayout: lastPayout
          ? { amount: Number(lastPayout.netAmount), paidAt: lastPayout.paidAt }
          : null,
      },
      active: {
        pending:    activeMap["pending"]    ?? 0,
        accepted:   activeMap["accepted"]   ?? 0,
        processing: activeMap["processing"] ?? 0,
        dispatched: activeMap["dispatched"] ?? 0,
      },
      catalog: { activeListings, zeroSales30d },
    };
  }

  async getOutstandingPayments(sellerId: string) {
    const returnCutoff = new Date();
    returnCutoff.setDate(returnCutoff.getDate() - ELIGIBILITY_DAYS);
    const rate = await this.getCommissionRate();

    const [inWindow, eligible] = await Promise.all([
      this.prisma.orderItemAssignment.findMany({
        where: { sellerId, status: "delivered", deliveredAt: { gt: returnCutoff }, payoutItem: null },
        orderBy: { deliveredAt: "desc" },
        include: {
          orderItem: {
            include: {
              product: { select: { title: true } },
              order:   { select: { orderNumber: true } },
            },
          },
        },
      }),
      this.prisma.orderItemAssignment.findMany({
        where: { sellerId, status: "delivered", deliveredAt: { lte: returnCutoff }, payoutItem: null },
        orderBy: { deliveredAt: "desc" },
        include: {
          orderItem: {
            include: {
              product: { select: { title: true } },
              order:   { select: { orderNumber: true } },
            },
          },
        },
      }),
    ]);

    const toItem = (a: typeof inWindow[0]) => {
      const gross = Number(a.orderItem.totalPrice);
      const net   = +(gross * (1 - rate)).toFixed(2);
      const eligibleAt = new Date(a.deliveredAt!);
      eligibleAt.setDate(eligibleAt.getDate() + ELIGIBILITY_DAYS);
      return {
        id:                a.id,
        orderNumber:       a.orderItem.order.orderNumber,
        product:           a.orderItem.product.title,
        qty:               a.orderItem.qty,
        deliveredAt:       a.deliveredAt,
        grossAmount:       gross,
        netPayout:         net,
        eligibleAt:        eligibleAt.toISOString(),
        daysUntilEligible: Math.ceil((eligibleAt.getTime() - Date.now()) / 86_400_000),
      };
    };

    return {
      inReturnWindow: inWindow.map(toItem),
      eligible:       eligible.map(toItem),
      totals: {
        inWindow: +inWindow.reduce((s, a) => s + Number(a.orderItem.totalPrice) * (1 - rate), 0).toFixed(2),
        eligible: +eligible.reduce((s, a) => s + Number(a.orderItem.totalPrice) * (1 - rate), 0).toFixed(2),
      },
    };
  }

  async getSellerPayouts(sellerId: string) {
    return this.prisma.sellerPayout.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            assignment: {
              include: {
                orderItem: {
                  include: {
                    product: { select: { title: true } },
                    order:   { select: { orderNumber: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  // ─── Commission (supplier) invoice ────────────────────────────────────

  async getPayoutInvoiceData(id: string, sellerId: string) {
    const p = await this.prisma.sellerPayout.findFirst({
      where: { id, sellerId },
      include: {
        seller: {
          select: { legalName: true, gstNumber: true, city: true, state: true, pincode: true },
        },
      },
    });
    if (!p) throw new NotFoundException("Payout not found");

    const settings = await this.prisma.platformSetting.findMany({
      where: { key: { in: ["platform_legal_name", "platform_gstin", "platform_city", "platform_state", "platform_pincode", "platform_address"] } },
    });
    const cfg = Object.fromEntries(settings.map(s => [s.key, String(s.value ?? "")]));

    const COMM_GST = 0.18;
    const platSt   = (cfg["platform_state"] ?? "maharashtra").trim().toLowerCase();
    const sellSt   = (p.seller.state ?? "").trim().toLowerCase();
    const inter    = !sellSt || platSt !== sellSt;
    const comm     = Number(p.commissionAmount);
    const gst      = +(comm * COMM_GST).toFixed(2);
    const half     = +(gst / 2).toFixed(2);

    return {
      invoiceNumber: `GT-COMM-${p.id.slice(0, 8).toUpperCase()}`,
      invoiceDate:   (p.paidAt ?? p.createdAt).toISOString().slice(0, 10),
      platform: {
        legalName: cfg["platform_legal_name"] ?? "Gifteeng Technologies Pvt Ltd",
        gstin:     cfg["platform_gstin"]      ?? "Not available — contact support",
        address:   cfg["platform_address"]    ?? "",
        city:      cfg["platform_city"]       ?? "",
        state:     cfg["platform_state"]      ?? "Maharashtra",
        pincode:   cfg["platform_pincode"]    ?? "",
      },
      seller: {
        legalName: p.seller.legalName,
        gstin:     p.seller.gstNumber ?? "Not registered",
        city:      p.seller.city   ?? "",
        state:     p.seller.state  ?? "",
        pincode:   p.seller.pincode ?? "",
      },
      service: {
        description: "Online marketplace listing, order facilitation and fulfilment support services",
        hsn:      "998314",
        taxable:  +comm.toFixed(2),
        cgst:     inter ? 0 : half,
        sgst:     inter ? 0 : half,
        igst:     inter ? gst : 0,
        totalGst: gst,
        total:    +(comm + gst).toFixed(2),
      },
      payout: {
        grossAmount:      Number(p.grossAmount),
        commissionRate:   Number(p.commissionRate),
        commissionAmount: comm,
        netAmount:        Number(p.netAmount),
        status:           p.status,
        paidAt:           p.paidAt?.toISOString() ?? null,
      },
      supplyType: inter ? "Interstate" : "Intrastate",
    };
  }

  // ─── Admin-facing ───────────────────────────────────────────────────────

  async adminListPayouts(status?: string) {
    return this.prisma.sellerPayout.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        seller: { select: { brandName: true, bankAccountName: true, bankAccountNumber: true, bankIfsc: true, city: true } },
        _count: { select: { items: true } },
      },
    });
  }

  async adminGetPayout(id: string) {
    const p = await this.prisma.sellerPayout.findUnique({
      where: { id },
      include: {
        seller: { select: { brandName: true, bankAccountName: true, bankAccountNumber: true, bankIfsc: true } },
        items: {
          include: {
            assignment: {
              include: {
                orderItem: {
                  include: {
                    product: { select: { title: true } },
                    order:   { select: { orderNumber: true, grandTotal: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!p) throw new NotFoundException("Payout not found");
    return p;
  }

  async adminMarkPaid(id: string, paymentRef?: string, notes?: string) {
    const p = await this.prisma.sellerPayout.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payout not found");
    if (p.status === "paid") throw new BadRequestException("Already paid");
    return this.prisma.sellerPayout.update({
      where: { id },
      data: { status: "paid", paidAt: new Date(), paymentRef, notes },
    });
  }

  async adminMarkProcessing(id: string) {
    const p = await this.prisma.sellerPayout.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Payout not found");
    if (!["eligible"].includes(p.status)) {
      throw new BadRequestException(`Cannot move to processing from status: ${p.status}`);
    }
    return this.prisma.sellerPayout.update({ where: { id }, data: { status: "processing" } });
  }

  async adminTriggerPayouts() {
    await this.processPendingPayouts();
    return { ok: true };
  }
}

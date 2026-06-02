import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { JwtSellerGuard } from "../../common/guards/jwt-seller.guard";
import { PrismaService } from "../../prisma/prisma.service";

type SellerReq = Request & { user: { sellerId: string } };

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(c => {
    const s = c == null ? "" : String(c);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}

function isoDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function parsePeriod(from?: string, to?: string) {
  const now = new Date();
  const start = from
    ? new Date(from + "T00:00:00.000Z")
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = to
    ? new Date(to + "T23:59:59.999Z")
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

@ApiTags("seller-reports")
@ApiBearerAuth()
@UseGuards(JwtSellerGuard)
@Controller("seller/reports")
export class SellerReportsController {
  constructor(private prisma: PrismaService) {}

  // ── Order Report ─────────────────────────────────────────────────────────

  @Get("orders")
  async downloadOrders(
    @Req() req: SellerReq,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to")   to?: string,
  ) {
    const { start, end } = parsePeriod(from, to);
    const sellerId = req.user.sellerId;

    const rows = await this.prisma.orderItemAssignment.findMany({
      where: { sellerId, assignedAt: { gte: start, lte: end } },
      orderBy: { assignedAt: "desc" },
      include: {
        orderItem: {
          include: {
            product: { select: { title: true } },
            order:   { select: { orderNumber: true, placedAt: true, shippingAddress: true } },
          },
        },
        sellerProduct: { select: { price: true } },
        payoutItem: {
          include: { payout: { select: { status: true, netAmount: true } } },
        },
      },
    });

    const header = csvRow([
      "Order Number", "Product", "Qty", "Unit Price (₹)",
      "Order Amount (₹)", "Assignment Date", "Delivered Date",
      "Status", "Customer City", "Customer State",
      "Payout Status", "Net Payout (₹)",
    ]);

    const lines = rows.map(a => {
      const addr = a.orderItem.order.shippingAddress as Record<string, string> | null;
      const price = Number(a.sellerProduct?.price ?? a.orderItem.unitPrice);
      const payoutStatus = !a.payoutItem ? "None"
        : a.payoutItem.payout?.status === "paid" ? "Settled" : "Pending";
      const netPayout = a.payoutItem?.payout?.status === "paid"
        ? Number(a.payoutItem.payout.netAmount).toFixed(2) : "";

      return csvRow([
        a.orderItem.order.orderNumber,
        a.orderItem.product.title,
        a.orderItem.qty,
        price.toFixed(2),
        (price * a.orderItem.qty).toFixed(2),
        isoDate(a.assignedAt),
        isoDate(a.deliveredAt),
        a.status,
        addr?.city ?? "",
        addr?.state ?? "",
        payoutStatus,
        netPayout,
      ]);
    });

    const csv = [header, ...lines].join("\n");
    const fname = `gifteeng-orders-${isoDate(start)}-to-${isoDate(end)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send("﻿" + csv); // BOM for Excel UTF-8 compatibility
  }

  // ── GST Report ───────────────────────────────────────────────────────────

  @Get("gst")
  async downloadGst(
    @Req() req: SellerReq,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to")   to?: string,
  ) {
    const { start, end } = parsePeriod(from, to);
    const sellerId = req.user.sellerId;

    const [seller, rows] = await Promise.all([
      this.prisma.seller.findUnique({
        where: { id: sellerId },
        select: { state: true, gstNumber: true, brandName: true },
      }),
      this.prisma.orderItemAssignment.findMany({
        where: { sellerId, status: "delivered", deliveredAt: { gte: start, lte: end } },
        orderBy: { deliveredAt: "asc" },
        include: {
          orderItem: {
            include: {
              product: { select: { title: true } },
              order:   { select: { orderNumber: true, shippingAddress: true } },
            },
          },
          sellerProduct: { select: { price: true } },
        },
      }),
    ]);

    const GST_RATE = 0.12;

    const header = csvRow([
      "Order Number", "Invoice Date", "Buyer Name", "Buyer City", "Buyer State",
      "Product", "Qty", "Taxable Value (₹)",
      "CGST Rate (%)", "CGST (₹)", "SGST Rate (%)", "SGST (₹)",
      "IGST Rate (%)", "IGST (₹)", "Total GST (₹)", "Invoice Total (₹)", "Supply Type",
    ]);

    const lines = rows.map(a => {
      const addr      = a.orderItem.order.shippingAddress as Record<string, string> | null;
      const buyerState  = (addr?.state ?? "").trim().toLowerCase();
      const sellerState = (seller?.state ?? "").trim().toLowerCase();
      const interState  = sellerState !== buyerState || !sellerState;
      const total       = Number(a.sellerProduct?.price ?? a.orderItem.unitPrice) * a.orderItem.qty;
      const taxable     = +(total / (1 + GST_RATE)).toFixed(2);
      const totalGst    = +(total - taxable).toFixed(2);
      const half        = +(totalGst / 2).toFixed(2);

      return csvRow([
        a.orderItem.order.orderNumber,
        isoDate(a.deliveredAt),
        addr?.name ?? "Customer",
        addr?.city ?? "",
        addr?.state ?? "",
        a.orderItem.product.title,
        a.orderItem.qty,
        taxable,
        interState ? "" : "6",   interState ? "" : half,
        interState ? "" : "6",   interState ? "" : half,
        interState ? "12" : "",  interState ? totalGst : "",
        totalGst,
        total,
        interState ? "Interstate" : "Intrastate",
      ]);
    });

    if (lines.length === 0) lines.push(csvRow(["No delivered orders in this period"]));

    const csv  = [header, ...lines].join("\n");
    const note = csvRow([`Seller GSTIN: ${seller?.gstNumber ?? "N/A"} | GST rate: ${(GST_RATE * 100).toFixed(0)}% (incl. in price) | Verify rates with your CA`]);
    const fname = `gifteeng-gst-${isoDate(start)}-to-${isoDate(end)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send("﻿" + note + "\n" + csv);
  }

  // ── Outstanding Payments Report ───────────────────────────────────────────

  @Get("outstanding")
  async downloadOutstanding(
    @Req() req: SellerReq,
    @Res() res: Response,
  ) {
    const sellerId = req.user.sellerId;
    const ELIGIBILITY_DAYS = 17;
    const returnCutoff = new Date();
    returnCutoff.setDate(returnCutoff.getDate() - ELIGIBILITY_DAYS);

    const commRow = await this.prisma.platformSetting.findUnique({ where: { key: "marketplace_commission_rate" } });
    const rate = commRow && typeof commRow.value === "number" ? commRow.value : 0.10;

    const rows = await this.prisma.orderItemAssignment.findMany({
      where: { sellerId, status: "delivered", payoutItem: null },
      orderBy: { deliveredAt: "desc" },
      include: {
        orderItem: {
          include: {
            product: { select: { title: true } },
            order:   { select: { orderNumber: true } },
          },
        },
      },
    });

    const header = csvRow([
      "Order Number", "Product", "Qty",
      "Delivered Date", "Order Amount (₹)", "Platform Fee (%)",
      "Net Payout (₹)", "Eligible For Payout On", "Status",
    ]);

    const lines = rows.map(a => {
      const gross      = Number(a.orderItem.totalPrice);
      const net        = +(gross * (1 - rate)).toFixed(2);
      const eligibleAt = new Date(a.deliveredAt!);
      eligibleAt.setDate(eligibleAt.getDate() + ELIGIBILITY_DAYS);
      const inWindow   = new Date(a.deliveredAt!) > returnCutoff;
      return csvRow([
        a.orderItem.order.orderNumber,
        a.orderItem.product.title,
        a.orderItem.qty,
        isoDate(a.deliveredAt),
        gross.toFixed(2),
        (rate * 100).toFixed(0),
        net.toFixed(2),
        isoDate(eligibleAt),
        inWindow ? "In return window" : "Eligible — awaiting batch",
      ]);
    });

    if (lines.length === 0) lines.push(csvRow(["No outstanding payments"]));

    const csv   = [header, ...lines].join("\n");
    const fname = `gifteeng-outstanding-${isoDate(new Date())}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send("﻿" + csv);
  }

  // ── Payout Report ────────────────────────────────────────────────────────

  @Get("payouts")
  async downloadPayouts(
    @Req() req: SellerReq,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to")   to?: string,
  ) {
    const { start, end } = parsePeriod(from, to);
    const sellerId = req.user.sellerId;

    const payouts = await this.prisma.sellerPayout.findMany({
      where: { sellerId, createdAt: { gte: start, lte: end } },
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

    const header = csvRow([
      "Payout ID", "Payout Date", "Status",
      "Order Number", "Product", "Gross Amount (₹)",
      "Commission Rate (%)", "Commission (₹)", "Net Amount (₹)",
      "Payment Ref",
    ]);

    const lines: string[] = [];
    for (const p of payouts) {
      for (const item of p.items) {
        lines.push(csvRow([
          p.id,
          isoDate(p.paidAt ?? p.createdAt),
          p.status,
          item.assignment.orderItem.order.orderNumber,
          item.assignment.orderItem.product.title,
          Number(item.grossAmount).toFixed(2),
          (Number(p.commissionRate) * 100).toFixed(1),
          Number(p.commissionAmount).toFixed(2),
          Number(p.netAmount).toFixed(2),
          p.paymentRef ?? "",
        ]));
      }
      if (p.items.length === 0) {
        lines.push(csvRow([
          p.id,
          isoDate(p.paidAt ?? p.createdAt),
          p.status,
          "", "",
          Number(p.grossAmount).toFixed(2),
          (Number(p.commissionRate) * 100).toFixed(1),
          Number(p.commissionAmount).toFixed(2),
          Number(p.netAmount).toFixed(2),
          p.paymentRef ?? "",
        ]));
      }
    }

    if (lines.length === 0) {
      lines.push(csvRow(["No payouts found for this period"]));
    }

    const csv = [header, ...lines].join("\n");
    const fname = `gifteeng-payouts-${isoDate(start)}-to-${isoDate(end)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send("﻿" + csv);
  }
}

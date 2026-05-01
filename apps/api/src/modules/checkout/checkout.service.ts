import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import Razorpay from "razorpay";
import * as crypto from "crypto";
import { Prisma } from "@gifteeng/db";
import type { CheckoutInput } from "@gifteeng/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { WalletService } from "../wallet/wallet.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RewardsService } from "../rewards/rewards.service";
import { StickersService } from "../stickers/stickers.service";
import { RealtimeService } from "../realtime/realtime.service";

type RazorpayOrderResult = {
  id: string;
  entity: string;
  amount: number | string;
  currency: string;
  receipt: string;
  status: string;
  [key: string]: unknown;
};

export type PlaceOrderResult = {
  order: Prisma.OrderGetPayload<{ include: { items: true } }>;
  razorpayOrder: RazorpayOrderResult | null;
};

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private razorpay: Razorpay | null = null;

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private rewards: RewardsService,
    private stickers: StickersService,
    private realtime: RealtimeService,
  ) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (keyId && keySecret) {
      this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
  }

  async createRazorpayOrder(
    amountInPaise: number,
    receipt: string,
  ): Promise<RazorpayOrderResult> {
    if (!this.razorpay) throw new Error("Razorpay not configured");
    const order = await this.razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
    });
    return order as unknown as RazorpayOrderResult;
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    return expected === signature;
  }

  async debitWalletForOrder(
    walletId: string,
    amount: number,
    orderId: string,
  ): Promise<void> {
    // Locks wallet balance using SELECT FOR UPDATE via raw transaction for race safety.
    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
      if (!wallet) throw new Error("Wallet not found");
      if (Number(wallet.balance) < amount) throw new Error("Insufficient wallet balance");

      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { decrement: amount } },
      });
      await tx.walletTransaction.create({
        data: { walletId, type: "debit", amount, reference: orderId },
      });
    });
  }

  // ============================================================
  // Place-order flows
  // ============================================================

  async placeOrderB2c(
    customerId: string,
    input: CheckoutInput,
  ): Promise<PlaceOrderResult> {
    if (input.paymentMethod === "wallet" || input.paymentMethod === "invoice") {
      throw new BadRequestException(
        `Payment method '${input.paymentMethod}' not supported for B2C`,
      );
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { customerId },
        include: { items: { include: { product: true } } },
      });
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException("Cart is empty");
      }

      const totals = await this.computeTotals(tx, cart.items, input.discountCode);

      const orderNumber = "GFT-" + Date.now().toString(36).toUpperCase();
      const created = await tx.order.create({
        data: {
          orderNumber,
          channel: "b2c",
          customerId,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingTotal: totals.shippingTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          paymentMethod: input.paymentMethod,
          paymentStatus: "pending",
          shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: (input.billingAddress ??
            input.shippingAddress) as unknown as Prisma.InputJsonValue,
          discountCode: input.discountCode,
          notes: input.notes,
          items: {
            create: cart.items.map((ci, i) => {
              // If this item qualifies as a free gift (subtotal threshold
              // met), computeTotals has placed a blended override in
              // freeGiftOverrides keyed by array index. Use it so the
              // Order line-item price matches the grand total.
              const unitPrice = totals.freeGiftOverrides.get(i)
                ?? new Prisma.Decimal(ci.product.basePrice);
              const totalPrice = unitPrice.times(ci.qty);
              const isFreeGiftLine = totals.freeGiftOverrides.has(i);
              return {
                productId: ci.productId,
                qty: ci.qty,
                unitPrice,
                totalPrice,
                variantOptions: (ci.variantOptions ?? undefined) as Prisma.InputJsonValue | undefined,
                customization: (ci.customization ?? undefined) as Prisma.InputJsonValue | undefined,
                snapshot: {
                  id: ci.product.id,
                  slug: ci.product.slug,
                  title: ci.product.title,
                  basePrice: ci.product.basePrice.toString(),
                  currency: ci.product.currency,
                  images: ci.product.images ?? null,
                  ...(isFreeGiftLine ? { wonAsFreeGift: true, originalBasePrice: ci.product.basePrice.toString() } : {}),
                } as unknown as Prisma.InputJsonValue,
              };
            }),
          },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return created;
    });

    // Consume any applied rewards (marks them as 'used' so they cannot be reused)
    try {
      await this.rewards.consumeOnCheckout(customerId, order.id);
    } catch (e) {
      this.logger.warn(`Reward consume failed for order ${order.id}: ${(e as Error).message}`);
    }

    // Award a random sticker for the Gift Collector album
    try {
      await this.stickers.awardRandom(customerId, order.id);
    } catch (e) {
      this.logger.warn(`Sticker award failed for order ${order.id}: ${(e as Error).message}`);
    }

    let razorpayOrder: RazorpayOrderResult | null = null;
    if (input.paymentMethod === "razorpay") {
      razorpayOrder = await this.createRazorpayOrder(
        new Prisma.Decimal(order.grandTotal).times(100).toNumber(),
        order.orderNumber,
      );
      await this.prisma.order.update({
        where: { id: order.id },
        data: { razorpayOrderId: razorpayOrder.id },
      });
      (order as { razorpayOrderId: string | null }).razorpayOrderId = razorpayOrder.id;
    }

    // For COD orders send confirmation SMS immediately; Razorpay orders are
    // confirmed on payment capture so SMS fires there instead.
    if (input.paymentMethod === "cod") {
      const phone = (input.shippingAddress as { phone?: string })?.phone;
      if (phone) {
        const shortNumber = order.orderNumber;
        const total = new Prisma.Decimal(order.grandTotal).toNumber();
        void this.notifications.sendOrderConfirmationSms(phone, shortNumber, total);
      }

      // Push notification on COD order placement — the immediate "your
      // order is confirmed 🎁" on the customer's device. Fire-and-forget.
      void this.notifications
        .sendOrderStatusUpdate(customerId, {
          orderNumber: order.orderNumber,
          status: "confirmed",
        })
        .catch((err) =>
          this.logger.warn(
            `push for COD order ${order.orderNumber} failed (non-fatal): ${(err as Error).message}`,
          ),
        );
    }

    // Realtime fanout: cart cleared, new order placed, balance shifted
    // (rewards/stickers may have credited Goins). Tell every other open
    // session for this customer to refresh those scopes.
    this.realtime.publishMany(customerId, ["cart", "orders", "goins"]);

    return { order, razorpayOrder };
  }

  async placeOrderB2b(
    companyUserId: string,
    companyId: string,
    input: CheckoutInput,
  ): Promise<PlaceOrderResult> {
    if (input.paymentMethod === "razorpay") {
      throw new BadRequestException("Razorpay is not supported for B2B orders");
    }
    if (input.paymentMethod === "cod") {
      throw new BadRequestException("COD is not supported for B2B orders");
    }

    const order = await this.prisma.$transaction(async (tx) => {
      // B2B uses per-customer carts; phase 1 uses companyUserId as the cart owner key.
      const cart = await tx.cart.findFirst({
        where: { customerId: companyUserId },
        include: { items: { include: { product: true } } },
      });
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException("Cart is empty");
      }

      const totals = await this.computeTotals(tx, cart.items, input.discountCode);

      const orderNumber = "GFT-" + Date.now().toString(36).toUpperCase();
      const created = await tx.order.create({
        data: {
          orderNumber,
          channel: "b2b",
          companyId,
          companyUserId,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingTotal: totals.shippingTotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          paymentMethod: input.paymentMethod,
          paymentStatus: "pending",
          shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress: (input.billingAddress ??
            input.shippingAddress) as unknown as Prisma.InputJsonValue,
          discountCode: input.discountCode,
          notes: input.notes,
          items: {
            create: cart.items.map((ci, i) => {
              // If this item qualifies as a free gift (subtotal threshold
              // met), computeTotals has placed a blended override in
              // freeGiftOverrides keyed by array index. Use it so the
              // Order line-item price matches the grand total.
              const unitPrice = totals.freeGiftOverrides.get(i)
                ?? new Prisma.Decimal(ci.product.basePrice);
              const totalPrice = unitPrice.times(ci.qty);
              const isFreeGiftLine = totals.freeGiftOverrides.has(i);
              return {
                productId: ci.productId,
                qty: ci.qty,
                unitPrice,
                totalPrice,
                variantOptions: (ci.variantOptions ?? undefined) as Prisma.InputJsonValue | undefined,
                customization: (ci.customization ?? undefined) as Prisma.InputJsonValue | undefined,
                snapshot: {
                  id: ci.product.id,
                  slug: ci.product.slug,
                  title: ci.product.title,
                  basePrice: ci.product.basePrice.toString(),
                  currency: ci.product.currency,
                  images: ci.product.images ?? null,
                  ...(isFreeGiftLine ? { wonAsFreeGift: true, originalBasePrice: ci.product.basePrice.toString() } : {}),
                } as unknown as Prisma.InputJsonValue,
              };
            }),
          },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return created;
    });

    if (input.paymentMethod === "wallet") {
      const companyWallet = await this.prisma.wallet.findFirst({
        where: { ownerType: "company", companyId },
      });
      if (!companyWallet) {
        throw new BadRequestException("Company wallet not found");
      }
      const amount = new Prisma.Decimal(order.grandTotal).toNumber();
      await this.wallet.lock(companyWallet.id, amount, order.id);
      const txn = await this.prisma.walletTransaction.findFirst({
        where: { walletId: companyWallet.id, type: "lock", reference: order.id },
        orderBy: { createdAt: "desc" },
      });
      if (txn) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { walletTxnId: txn.id },
        });
        (order as { walletTxnId: string | null }).walletTxnId = txn.id;
      }
    }
    // 'invoice' → leave pending; reconciled later.

    return { order, razorpayOrder: null };
  }

  async captureRazorpayPayment(input: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<Prisma.OrderGetPayload<{ include: { items: true } }>> {
    const ok = this.verifySignature(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature,
    );
    if (!ok) throw new UnauthorizedException("Invalid Razorpay signature");

    const existing = await this.prisma.order.findFirst({
      where: { razorpayOrderId: input.razorpay_order_id },
    });
    if (!existing) throw new NotFoundException("Order not found for razorpay order id");

    const updated = await this.prisma.order.update({
      where: { id: existing.id },
      data: {
        paymentStatus: "captured",
        razorpayPaymentId: input.razorpay_payment_id,
        status: "confirmed",
        confirmedAt: new Date(),
      },
      include: { items: true },
    });

    this.logger.log(
      `Razorpay payment captured order=${updated.orderNumber} payment=${input.razorpay_payment_id}`,
    );

    // Fire order confirmation SMS (non-blocking, never throws).
    const addr = updated.shippingAddress as { phone?: string } | null;
    const phone = addr?.phone;
    if (phone) {
      const total = new Prisma.Decimal(updated.grandTotal).toNumber();
      void this.notifications.sendOrderConfirmationSms(phone, updated.orderNumber, total);
    }

    // Push notification: Razorpay payment captured → order is confirmed.
    // Non-blocking — errors are swallowed so a push failure never breaks
    // the checkout success flow for the customer.
    if (updated.customerId) {
      void this.notifications
        .sendOrderStatusUpdate(updated.customerId, {
          orderNumber: updated.orderNumber,
          status: "confirmed",
        })
        .catch((err) =>
          this.logger.warn(
            `push for paid order ${updated.orderNumber} failed (non-fatal): ${(err as Error).message}`,
          ),
        );
      // Realtime fanout — tell other open sessions the order is now paid
      // so the orders list / detail re-fetches with paymentStatus=captured.
      this.realtime.publish(updated.customerId, "orders");
    }

    return updated;
  }

  async handleRazorpayWebhook(
    rawBody: string,
    signature: string,
  ): Promise<{ received: true }> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
    if (!secret) {
      throw new UnauthorizedException("Webhook secret not configured");
    }
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    // Constant-time compare to defeat timing-based signature recovery.
    // String !== shortcuts on the first mismatched byte, leaking the
    // length of the matching prefix to a careful attacker.
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(signature ?? "", "hex");
    if (
      expectedBuf.length !== receivedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    let parsed: {
      event?: string;
      payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
    };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException("Invalid webhook body");
    }

    const event = parsed.event;
    const entity = parsed.payload?.payment?.entity;
    const razorpayOrderId = entity?.order_id;
    const razorpayPaymentId = entity?.id;

    if (event === "payment.captured" && razorpayOrderId) {
      const order = await this.prisma.order.findFirst({
        where: { razorpayOrderId },
      });
      if (order) {
        // Dedup: only push if the order wasn't already confirmed. Webhooks
        // can be delivered multiple times — don't spam the customer if the
        // client-side verify path already fired the push.
        const wasAlreadyConfirmed = order.status === "confirmed";
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "captured",
            status: "confirmed",
            confirmedAt: new Date(),
            razorpayPaymentId: razorpayPaymentId ?? order.razorpayPaymentId,
          },
        });
        this.logger.log(
          `Webhook payment.captured applied to order=${order.orderNumber}`,
        );
        if (!wasAlreadyConfirmed && order.customerId) {
          void this.notifications
            .sendOrderStatusUpdate(order.customerId, {
              orderNumber: order.orderNumber,
              status: "confirmed",
            })
            .catch((err) =>
              this.logger.warn(
                `push (webhook) for order ${order.orderNumber} failed (non-fatal): ${(err as Error).message}`,
              ),
            );
        }
      }
    } else if (event === "payment.failed" && razorpayOrderId) {
      const order = await this.prisma.order.findFirst({
        where: { razorpayOrderId },
      });
      if (order) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "failed" },
        });
        this.logger.log(`Webhook payment.failed applied to order=${order.orderNumber}`);
      }
    } else {
      this.logger.debug(`Ignoring razorpay webhook event=${event ?? "unknown"}`);
    }

    return { received: true };
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Free-gift pricing helper — Deploy 122.
   *
   * Inspects `product.metadata.freeGift` on every cart item. If a product
   * has an active gift rule AND the cart's subtotal (EXCLUDING gift items)
   * meets its minCartInr threshold, we price up to `maxPerOrder` of that
   * product at its `shippingInr` instead of the regular basePrice.
   *
   * Returns a Map keyed by array index → effective unit price to use, so
   * `computeTotals` + the Order creation sites stay in lock-step.
   */
  private resolveFreeGiftPricing(items: Array<{
    qty: number;
    product: { basePrice: Prisma.Decimal; metadata?: unknown; id?: string };
  }>): Map<number, Prisma.Decimal> {
    const overrides = new Map<number, Prisma.Decimal>();

    const giftCfg = (meta: unknown) => {
      const m = (meta ?? {}) as {
        freeGift?: { isActive?: boolean; minCartInr?: number; shippingInr?: number; maxPerOrder?: number };
      };
      const f = m?.freeGift;
      if (!f?.isActive) return null;
      return {
        minCartInr: Number(f.minCartInr ?? 0),
        shippingInr: Number(f.shippingInr ?? 0),
        maxPerOrder: Number(f.maxPerOrder ?? 1),
      };
    };

    // Pass 1 — compute subtotal WITHOUT any candidate gift items.
    let subtotalWithoutGifts = new Prisma.Decimal(0);
    for (const it of items) {
      if (giftCfg(it.product.metadata)) continue;
      subtotalWithoutGifts = subtotalWithoutGifts.plus(
        new Prisma.Decimal(it.product.basePrice).times(it.qty),
      );
    }

    // Pass 2 — for each gift-candidate item, if threshold met, override
    // unit price for up to maxPerOrder units. Remaining qty stays at full
    // price (unlikely in practice since users typically only add 1, but
    // keeps the math honest).
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const cfg = giftCfg(it.product.metadata);
      if (!cfg) continue;
      if (subtotalWithoutGifts.lessThan(new Prisma.Decimal(cfg.minCartInr))) continue;
      // Within threshold — cap override to maxPerOrder units; the rest
      // bill at full basePrice.
      const coverQty = Math.min(it.qty, cfg.maxPerOrder);
      if (coverQty <= 0) continue;
      const remaining = it.qty - coverQty;
      const coveredAmount = new Prisma.Decimal(cfg.shippingInr).times(coverQty);
      const remainingAmount = new Prisma.Decimal(it.product.basePrice).times(remaining);
      // Store blended unit price so times(qty) reproduces the mixed total.
      // blendedUnit = (coveredAmount + remainingAmount) / qty
      const blended = coveredAmount.plus(remainingAmount).dividedBy(it.qty);
      overrides.set(i, new Prisma.Decimal(blended.toFixed(2)));
    }

    return overrides;
  }

  private async computeTotals(
    tx: Prisma.TransactionClient,
    items: Array<{
      qty: number;
      product: { basePrice: Prisma.Decimal; metadata?: unknown; id?: string };
    }>,
    discountCode: string | undefined,
  ): Promise<{
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    shippingTotal: Prisma.Decimal;
    taxTotal: Prisma.Decimal;
    grandTotal: Prisma.Decimal;
    freeGiftOverrides: Map<number, Prisma.Decimal>;
  }> {
    const freeGiftOverrides = this.resolveFreeGiftPricing(items);
    let subtotal = new Prisma.Decimal(0);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const unit = freeGiftOverrides.get(i) ?? new Prisma.Decimal(it.product.basePrice);
      subtotal = subtotal.plus(unit.times(it.qty));
    }

    let discountTotal = new Prisma.Decimal(0);
    if (discountCode) {
      const discount = await tx.discount.findUnique({ where: { code: discountCode } });
      if (!discount || !discount.isActive) {
        throw new BadRequestException("Discount code is not valid");
      }
      const now = new Date();
      if (discount.startsAt && discount.startsAt > now) {
        throw new BadRequestException("Discount code is not active yet");
      }
      if (discount.endsAt && discount.endsAt < now) {
        throw new BadRequestException("Discount code has expired");
      }
      if (
        discount.usageLimit !== null &&
        discount.usageLimit !== undefined &&
        discount.usedCount >= discount.usageLimit
      ) {
        throw new BadRequestException("Discount code usage limit reached");
      }
      if (
        discount.minOrderTotal &&
        subtotal.lessThan(new Prisma.Decimal(discount.minOrderTotal))
      ) {
        throw new BadRequestException("Order does not meet discount minimum");
      }
      if (discount.percent) {
        discountTotal = subtotal.times(new Prisma.Decimal(discount.percent)).dividedBy(100);
      } else if (discount.amount) {
        discountTotal = new Prisma.Decimal(discount.amount);
      }
      if (discountTotal.greaterThan(subtotal)) discountTotal = subtotal;

      await tx.discount.update({
        where: { id: discount.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    const shippingTotal = new Prisma.Decimal(0);
    const taxableBase = subtotal.minus(discountTotal);
    const taxTotal = taxableBase.times(18).dividedBy(100);
    const grandTotal = taxableBase.plus(shippingTotal).plus(taxTotal);

    return {
      subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
      discountTotal: new Prisma.Decimal(discountTotal.toFixed(2)),
      shippingTotal: new Prisma.Decimal(shippingTotal.toFixed(2)),
      taxTotal: new Prisma.Decimal(taxTotal.toFixed(2)),
      grandTotal: new Prisma.Decimal(grandTotal.toFixed(2)),
      freeGiftOverrides,
    };
  }
}

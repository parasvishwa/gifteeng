import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type RewardType =
  | "goins"
  | "discount_pct"
  | "discount_flat"
  | "free_shipping"
  | "free_gift_wrap"
  | "free_product"
  | "miss";

export type RewardPreview = {
  id: string;
  code: string;
  type: RewardType;
  value: string;
  label: string;
  source: string;
  status: string;
  minCartInr: number;
  expiresAt: Date | null;
  createdAt: Date;
};

export type CartSummary = {
  subtotal: number;
  discountInr: number;
  shippingInr: number;
  giftWrapInr: number;
  totalInr: number;
  breakdown: { kind: string; label: string; amount: number }[];
};

@Injectable()
export class RewardsService {
  constructor(private prisma: PrismaService) {}

  /** List user's active (pending or applied) rewards */
  async listActive(customerId: string) {
    const now = new Date();
    // Expire any old pending rewards in-place
    await this.prisma.rewardInstance.updateMany({
      where: {
        customerId,
        status: { in: ["pending", "applied"] },
        expiresAt: { lt: now },
      },
      data: { status: "expired" },
    });

    const rows = await this.prisma.rewardInstance.findMany({
      where: {
        customerId,
        status: { in: ["pending", "applied"] },
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map<RewardPreview>((r) => ({
      id: r.id,
      code: r.code ?? "",
      type: r.type,
      value: r.value,
      label: r.label,
      source: r.source,
      status: r.status,
      minCartInr: r.minCartInr,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  /** Get full reward history (used + expired too) */
  async listHistory(customerId: string, limit = 30) {
    const rows = await this.prisma.rewardInstance.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows;
  }

  /** Toggle-apply a reward to user's active cart. Enforces stack rules. */
  async applyReward(customerId: string, rewardId: string, cartId?: string) {
    const reward = await this.prisma.rewardInstance.findUnique({
      where: { id: rewardId },
    });
    if (!reward) throw new NotFoundException("Reward not found");
    if (reward.customerId !== customerId) throw new NotFoundException("Reward not found");
    if (reward.status === "used" || reward.status === "expired") {
      throw new BadRequestException("This reward is no longer available");
    }
    if (reward.expiresAt && reward.expiresAt < new Date()) {
      await this.prisma.rewardInstance.update({
        where: { id: rewardId },
        data: { status: "expired" },
      });
      throw new BadRequestException("This reward has expired");
    }

    const targetCart = cartId ?? `cust:${customerId}`;

    // If already applied — toggle off
    if (reward.status === "applied") {
      await this.prisma.rewardInstance.update({
        where: { id: rewardId },
        data: { status: "pending", appliedCartId: null },
      });
      return { applied: false, reward };
    }

    // Enforce stack rules: only ONE discount_pct/discount_flat at a time per cart
    const conflicting = await this.prisma.rewardInstance.findMany({
      where: {
        customerId,
        status: "applied",
        appliedCartId: targetCart,
      },
    });
    if (reward.type === "discount_pct" || reward.type === "discount_flat") {
      const existingDiscount = conflicting.find(
        (c) => c.type === "discount_pct" || c.type === "discount_flat",
      );
      if (existingDiscount) {
        // Swap — remove old, apply new
        await this.prisma.rewardInstance.update({
          where: { id: existingDiscount.id },
          data: { status: "pending", appliedCartId: null },
        });
      }
    } else {
      // Same type cannot stack (e.g. two free_gift_wrap)
      const sameType = conflicting.find((c) => c.type === reward.type);
      if (sameType) {
        await this.prisma.rewardInstance.update({
          where: { id: sameType.id },
          data: { status: "pending", appliedCartId: null },
        });
      }
    }

    const updated = await this.prisma.rewardInstance.update({
      where: { id: rewardId },
      data: { status: "applied", appliedCartId: targetCart },
    });
    return { applied: true, reward: updated };
  }

  /**
   * Compute cart discount based on currently-applied rewards.
   * Returns the discount breakdown. Called from cart and checkout.
   */
  async computeAppliedDiscount(
    customerId: string,
    cartSubtotalInr: number,
    shippingInr: number,
    giftWrapInr: number,
    cartId?: string,
  ): Promise<CartSummary> {
    const targetCart = cartId ?? `cust:${customerId}`;
    const applied = await this.prisma.rewardInstance.findMany({
      where: {
        customerId,
        status: "applied",
        appliedCartId: targetCart,
      },
    });

    const breakdown: { kind: string; label: string; amount: number }[] = [];
    let discountInr = 0;
    let shippingWaived = false;
    let wrapWaived = false;

    for (const r of applied) {
      // Enforce minimum cart
      if (r.minCartInr && cartSubtotalInr < r.minCartInr) continue;
      // Skip expired
      if (r.expiresAt && r.expiresAt < new Date()) continue;

      switch (r.type) {
        case "discount_pct": {
          const pct = parseFloat(r.value) || 0;
          const amt = (cartSubtotalInr * pct) / 100;
          discountInr += amt;
          breakdown.push({ kind: "discount", label: r.label, amount: -amt });
          break;
        }
        case "discount_flat": {
          const amt = Math.min(parseFloat(r.value) || 0, cartSubtotalInr);
          discountInr += amt;
          breakdown.push({ kind: "discount", label: r.label, amount: -amt });
          break;
        }
        case "free_shipping":
          if (!shippingWaived && shippingInr > 0) {
            shippingWaived = true;
            breakdown.push({ kind: "shipping", label: r.label, amount: -shippingInr });
          }
          break;
        case "free_gift_wrap":
          if (!wrapWaived && giftWrapInr > 0) {
            wrapWaived = true;
            breakdown.push({ kind: "giftwrap", label: r.label, amount: -giftWrapInr });
          }
          break;
        default:
          // free_product / goins / miss — no direct cart effect here
          break;
      }
    }

    const effectiveShipping = shippingWaived ? 0 : shippingInr;
    const effectiveWrap = wrapWaived ? 0 : giftWrapInr;
    const totalInr = Math.max(
      0,
      cartSubtotalInr - discountInr + effectiveShipping + effectiveWrap,
    );

    return {
      subtotal: cartSubtotalInr,
      discountInr,
      shippingInr: effectiveShipping,
      giftWrapInr: effectiveWrap,
      totalInr,
      breakdown,
    };
  }

  /**
   * Mark applied rewards as used on successful checkout.
   * Called from orders.service when an order is confirmed.
   */
  async consumeOnCheckout(customerId: string, orderId: string, cartId?: string) {
    const targetCart = cartId ?? `cust:${customerId}`;
    const applied = await this.prisma.rewardInstance.findMany({
      where: {
        customerId,
        status: "applied",
        appliedCartId: targetCart,
      },
    });
    if (applied.length === 0) return { consumed: 0 };
    await this.prisma.rewardInstance.updateMany({
      where: { id: { in: applied.map((a) => a.id) } },
      data: { status: "used", usedOrderId: orderId },
    });
    return { consumed: applied.length, rewards: applied.map((a) => a.label) };
  }

  /**
   * Post-order scratch card trigger. Creates a linked GamePlay record and
   * returns info needed by the UI to kick off the scratch animation.
   * Order value controls how many scratch cards are granted (capped at 3).
   */
  async scratchCardsForOrder(
    customerId: string,
    orderId: string,
    orderValueInr: number,
  ): Promise<{ count: number }> {
    // 1 card per ₹500, capped at 3
    const count = Math.min(3, Math.max(1, Math.floor(orderValueInr / 500)));
    // We just track the count via an associated reward of a special "pending
    // scratch" type — or we let frontend play them directly. Keep it simple:
    // store count in a transient way via reward metadata. For now, we just
    // return the count — frontend calls /api/games/scratch N times.
    return { count };
  }
}

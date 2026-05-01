import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

// 100 Gifteeng Coins (Goins) = ₹1 redeem value.
// Changed from 0.25 → 0.01 in Deploy 97 alongside a 4× balance migration
// (UPDATE customers SET "coinBalance" = "coinBalance" * 4 …) and a 4× bump
// on every reward pool, so the rupee-value per reward is preserved.
const COIN_VALUE_INR = 0.01;
// Redemption caps (Deploy 116 — "unlimited earn / capped redeem" model).
//   - Percentage cap : max 20% of any single order can be paid via coins.
//   - Absolute cap   : max ₹25 discount PER ORDER, no matter how large the
//                       cart or how many Goins the user has saved up. The
//                       tighter of the two always wins. Users can still
//                       accumulate unlimited Goins — they just spend up to
//                       ₹25 worth on each checkout.
const MAX_COIN_REDEMPTION_PCT = 20;
const MAX_COIN_REDEMPTION_INR_PER_ORDER = 25;
// Goin expiry — earned Goins auto-expire 90 days after credit if unused. A
// nightly cron (see coins.cron.ts, added in Deploy 116) sweeps expired
// transactions and deducts them from coinBalance. Keeps company liability
// bounded even under unlimited-earn.
const COIN_EXPIRY_DAYS = 90;
// Coins from `order_bonus` transactions are parked until the order is
// delivered. We tag the CoinTransaction.description with this prefix so the
// coins appear in the "pending" balance but do not yet count as redeemable.
// On delivery the prefix is stripped and the coins are credited to
// Customer.coinBalance via `releaseOrderCoins`.
const PENDING_PREFIX = "PENDING:";
// Wheel segments — MUST match the visual SW_SEGS on the frontend SpinWheel.
// The pointer landing on a slice IS the reward — no more silent mismatch
// between "lands on 15G" and "server awards 3G".
// Order 0..7 = MISS · 5G · 10G · MISS · 25G · 15G · 50G · 20G
// Amounts are ×4 vs. the pre-Deploy-97 values so the rupee-value the user
// sees on the wheel is preserved after the rate change to 0.01.
const SPIN_SEGMENTS: { goins: number; weight: number }[] = [
  { goins: 0,   weight: 50 },  // 0 · MISS
  { goins: 20,  weight: 60 },  // 1 · 20G  (₹0.20)
  { goins: 40,  weight: 40 },  // 2 · 40G  (₹0.40)
  { goins: 0,   weight: 30 },  // 3 · MISS
  { goins: 100, weight: 10 },  // 4 · 100G (₹1)
  { goins: 60,  weight: 8  },  // 5 · 60G  (₹0.60)
  { goins: 200, weight: 1  },  // 6 · 200G jackpot (₹2)
  { goins: 80,  weight: 1  },  // 7 · 80G  (₹0.80)
];
function pickSpinSegment(): number {
  const total = SPIN_SEGMENTS.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SPIN_SEGMENTS.length; i++) {
    r -= SPIN_SEGMENTS[i]!.weight;
    if (r <= 0) return i;
  }
  return 0;
}

@Injectable()
export class CoinsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  /** Helper used by every mutating method below to broadcast a refresh. */
  private notifyGoinsChanged(customerId: string | null | undefined) {
    this.realtime.publish(customerId, "goins");
  }

  async getBalance(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { coinBalance: true, lastSpinAt: true },
    });
    if (!customer) throw new BadRequestException("Customer not found");

    // Pending coins = order_bonus transactions that have not yet been
    // released (order still in-progress / not delivered yet).
    const pendingAgg = await this.prisma.coinTransaction.aggregate({
      where: {
        customerId,
        type: "order_bonus",
        description: { startsWith: PENDING_PREFIX },
      },
      _sum: { amount: true },
    });
    const pendingBalance = pendingAgg._sum.amount ?? 0;

    const canSpin = this.canSpinToday(customer.lastSpinAt);
    const nextSpinAt = this.nextSpinTime(customer.lastSpinAt);

    // Earliest-expiring redeemable Goin — for the B2C dashboard to show a
    // "Goins worth ₹X expire on DD MMM" line, nudging redemption.
    const oldestActive = await this.prisma.coinTransaction.findFirst({
      where: {
        customerId,
        amount: { gt: 0 },
        type: { notIn: ["expiry", "redemption"] },
        NOT: { description: { startsWith: PENDING_PREFIX } },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const nextExpiryAt = oldestActive
      ? new Date(oldestActive.createdAt.getTime() + COIN_EXPIRY_DAYS * 86_400_000)
      : null;

    return {
      balance: customer.coinBalance,
      pendingBalance,
      totalBalance: customer.coinBalance + pendingBalance,
      valueInr: +(customer.coinBalance * COIN_VALUE_INR).toFixed(2),
      pendingValueInr: +(pendingBalance * COIN_VALUE_INR).toFixed(2),
      canSpin,
      lastSpinAt: customer.lastSpinAt,
      nextSpinAt,
      coinValueInr: COIN_VALUE_INR,
      maxRedemptionPct: MAX_COIN_REDEMPTION_PCT,
      maxRedemptionInrPerOrder: MAX_COIN_REDEMPTION_INR_PER_ORDER,
      coinExpiryDays: COIN_EXPIRY_DAYS,
      nextExpiryAt,
    };
  }

  /** Common fraud-watch guard — thrown when a frozen account tries to earn or spend. */
  private assertNotFrozen(customer: { isFrozen?: boolean; frozenReason?: string | null } | null) {
    if (customer?.isFrozen) {
      throw new BadRequestException(
        customer.frozenReason
          ? `This account is frozen: ${customer.frozenReason}`
          : "This account is frozen. Please contact support.",
      );
    }
  }

  async spin(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { coinBalance: true, lastSpinAt: true, isFrozen: true, frozenReason: true },
    });
    if (!customer) throw new BadRequestException("Customer not found");
    this.assertNotFrozen(customer);

    if (!this.canSpinToday(customer.lastSpinAt)) {
      const next = this.nextSpinTime(customer.lastSpinAt);
      throw new BadRequestException(
        `You've already spun today! Come back ${next ? `at ${next.toLocaleTimeString("en-IN")}` : "tomorrow"}.`,
      );
    }

    const segment = pickSpinSegment();
    const coinsEarned = SPIN_SEGMENTS[segment]!.goins;

    const [updated] = await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: customerId },
        data: {
          coinBalance: { increment: coinsEarned },
          lastSpinAt: new Date(),
        },
        select: { coinBalance: true },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: coinsEarned,
          type: "spin_wheel",
          description: `Daily spin wheel — earned ${coinsEarned} ${coinsEarned === 1 ? "coin" : "coins"}`,
        },
      }),
    ]);
    this.notifyGoinsChanged(customerId);

    return {
      coinsEarned,
      newBalance: updated.coinBalance,
      segment,
      message:
        coinsEarned === 0
          ? "💨 So close! Try again tomorrow."
          : coinsEarned >= 200
            ? `🎉 JACKPOT! ${coinsEarned} Goins!`
            : coinsEarned >= 80
              ? "🌟 Big win! Great spin!"
              : coinsEarned >= 40
                ? "✨ Nice win — keep it up!"
                : "🪙 Every coin counts!",
    };
  }

  async awardReferral(referrerId: string, refId: string) {
    // ₹25 worth at 100 G = ₹1. Credited IMMEDIATELY per Deploy 97 policy
    // (previously only on the friend's first order; that flow still calls
    // this method, we just bumped the amount).
    const REFERRAL_COINS = 2500;
    const referrer = await this.prisma.customer.findUnique({
      where: { id: referrerId },
      select: { isFrozen: true, frozenReason: true },
    });
    // Frozen accounts cannot earn referral bonuses — prevents fraud rings
    // where one bad actor rotates referrals through a ring of fake friends.
    if (referrer?.isFrozen) return { coinsEarned: 0, newBalance: 0, frozen: true };
    const [updated] = await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: referrerId },
        data: { coinBalance: { increment: REFERRAL_COINS } },
        select: { coinBalance: true },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId: referrerId,
          amount: REFERRAL_COINS,
          type: "referral",
          description: `Referral bonus — friend placed their first order`,
          refId,
        },
      }),
    ]);
    this.notifyGoinsChanged(referrerId);
    return { coinsEarned: REFERRAL_COINS, newBalance: updated.coinBalance };
  }

  async awardOrderBonus(customerId: string, orderId: string, orderValue: number) {
    // Flat ₹10 worth of Goins per order, parked until delivery + 1 day.
    // Deploy 97 policy: every completed order earns a fixed bonus regardless
    // of order value. 100 G = ₹1, so ₹10 = 1000 G.
    const ORDER_BONUS_GOINS = 1000;
    const coins = orderValue > 0 ? ORDER_BONUS_GOINS : 0;
    if (coins < 1) return { coinsEarned: 0, newBalance: 0, pending: true };
    // Frozen accounts do not earn order bonuses.
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { isFrozen: true, coinBalance: true },
    });
    if (customer?.isFrozen) return { coinsEarned: 0, newBalance: 0, pending: false, frozen: true };

    // These coins are PENDING until the order is delivered. We record the
    // transaction but do NOT yet increment the redeemable coinBalance — that
    // happens in `releaseOrderCoins` once the order status becomes "delivered".
    await this.prisma.coinTransaction.create({
      data: {
        customerId,
        amount: coins,
        type: "order_bonus",
        description: `${PENDING_PREFIX} Order bonus — earning ${coins} coins on ₹${orderValue.toFixed(0)} purchase (unlocks on delivery)`,
        refId: orderId,
      },
    });
    return {
      coinsEarned: coins,
      newBalance: customer?.coinBalance ?? 0,
      pending: true,
    };
  }

  /**
   * Release the pending order-bonus coins for a specific order. Called from
   * `orders.service.updateStatus` when the status transitions to "delivered".
   * Idempotent — if already released, returns 0 coins.
   */
  async releaseOrderCoins(orderId: string) {
    const pending = await this.prisma.coinTransaction.findMany({
      where: {
        refId: orderId,
        type: "order_bonus",
        description: { startsWith: PENDING_PREFIX },
      },
    });
    if (pending.length === 0) return { coinsReleased: 0 };

    // Group by customer (there should only be one customer per order but
    // we guard against it just in case).
    const byCustomer = new Map<string, { total: number; txnIds: string[] }>();
    for (const t of pending) {
      const cur = byCustomer.get(t.customerId) ?? { total: 0, txnIds: [] };
      cur.total += t.amount;
      cur.txnIds.push(t.id);
      byCustomer.set(t.customerId, cur);
    }

    let released = 0;
    for (const [customerId, { total, txnIds }] of byCustomer) {
      await this.prisma.$transaction([
        this.prisma.customer.update({
          where: { id: customerId },
          data: { coinBalance: { increment: total } },
          select: { coinBalance: true },
        }),
        // Strip the PENDING prefix so the transaction stops counting in the
        // pending balance and shows as a completed credit in history.
        ...txnIds.map((id) =>
          this.prisma.coinTransaction.update({
            where: { id },
            data: {
              description: `Order bonus — ${total} coins unlocked on delivery`,
            },
          }),
        ),
      ]);
      released += total;
      this.notifyGoinsChanged(customerId);
    }

    return { coinsReleased: released };
  }

  async adminGrant(customerId: string, coins: number, reason: string) {
    const [updated] = await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: coins } },
        select: { coinBalance: true },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: coins,
          type: "admin_grant",
          description: reason,
        },
      }),
    ]);
    this.notifyGoinsChanged(customerId);
    return { newBalance: updated.coinBalance };
  }

  /**
   * Validates redeem eligibility. Returns discount amount in INR.
   * Does NOT deduct yet — deduction happens at checkout confirmation.
   */
  async validateRedeem(customerId: string, coinsToRedeem: number, orderValue: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { coinBalance: true, isFrozen: true, frozenReason: true },
    });
    if (!customer) throw new BadRequestException("Customer not found");
    this.assertNotFrozen(customer);
    if (coinsToRedeem < 1) throw new BadRequestException("Enter at least 1 coin");
    if (customer.coinBalance < coinsToRedeem)
      throw new BadRequestException(
        `You only have ${customer.coinBalance} coins (₹${(customer.coinBalance * COIN_VALUE_INR).toFixed(2)})`,
      );

    // The tighter of: 20% of order value OR the absolute ₹25/order cap.
    // Goins can only *reduce* the order total — never zero it — so we also
    // clamp by orderValue as a safety net.
    const pctCap   = (orderValue * MAX_COIN_REDEMPTION_PCT) / 100;
    const absCap   = MAX_COIN_REDEMPTION_INR_PER_ORDER;
    const maxDiscount = Math.max(0, Math.min(pctCap, absCap, orderValue));
    const requestedDiscount = coinsToRedeem * COIN_VALUE_INR;
    const actualDiscount = Math.min(requestedDiscount, maxDiscount);
    // Use floor — never round UP, or we'd give the customer more discount
    // than their coins actually pay for.
    const actualCoins = Math.floor(actualDiscount / COIN_VALUE_INR);

    return {
      coinsToRedeem: actualCoins,
      discountInr: +actualDiscount.toFixed(2),
      balance: customer.coinBalance,
      maxDiscount: +maxDiscount.toFixed(2),
      maxDiscountInrPerOrder: MAX_COIN_REDEMPTION_INR_PER_ORDER,
      capped: actualCoins < coinsToRedeem,
      capReason: actualCoins < coinsToRedeem
        ? (pctCap <= absCap ? "pct" : "abs")
        : null,
    };
  }

  /** Called at checkout confirmation to actually deduct coins */
  async confirmRedeem(customerId: string, coinsToRedeem: number, orderId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { coinBalance: true },
    });
    if (!customer) throw new BadRequestException("Customer not found");
    if (customer.coinBalance < coinsToRedeem)
      throw new BadRequestException("Insufficient coins");

    const [updated] = await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: customerId },
        data: { coinBalance: { decrement: coinsToRedeem } },
        select: { coinBalance: true },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: -coinsToRedeem,
          type: "redemption",
          description: `Redeemed ${coinsToRedeem} coins for ₹${(coinsToRedeem * COIN_VALUE_INR).toFixed(2)} off`,
          refId: orderId,
        },
      }),
    ]);
    this.notifyGoinsChanged(customerId);

    return {
      coinsRedeemed: coinsToRedeem,
      discountInr: +(coinsToRedeem * COIN_VALUE_INR).toFixed(2),
      newBalance: updated.coinBalance,
    };
  }

  /**
   * Goin-expiry sweep — Deploy 116.
   *
   * Unlimited earn means every single Goin a customer ever earns is a
   * permanent liability on the company balance sheet unless it expires. We
   * expire positive (earn) transactions older than `COIN_EXPIRY_DAYS`:
   *   - Find every earn txn older than the threshold that hasn't already
   *     been offset by an `expiry` txn referencing it (idempotent via refId).
   *   - Per customer, sum the amount that should expire.
   *   - Clamp the deduction to the customer's current coinBalance (never go
   *     negative — redemptions / admin claw-backs may have already drawn it
   *     down).
   *   - Insert one `expiry` txn per original earn and decrement the balance
   *     in a single transaction.
   *
   * Meant to be called from a daily cronjob — expose via
   * `/coins/admin/sweep-expired` (see controller).
   */
  async sweepExpired() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - COIN_EXPIRY_DAYS);

    // Earn transactions older than the cutoff that haven't been expired yet.
    // We identify already-expired ones by looking up expiry txns whose
    // refId points to the earn id (we use refId on expiry rows below).
    const earned = await this.prisma.coinTransaction.findMany({
      where: {
        createdAt: { lt: cutoff },
        amount: { gt: 0 },
        type: { notIn: ["expiry", "redemption"] },
        // order_bonus in PENDING state hasn't actually credited the balance
        // yet — skip them; they'll either be released (and tick the clock)
        // or cancelled when the order is abandoned.
        NOT: { description: { startsWith: PENDING_PREFIX } },
      },
      select: { id: true, customerId: true, amount: true, createdAt: true },
    });
    if (earned.length === 0) return { expiredTxns: 0, totalCoinsExpired: 0 };

    // De-dupe: drop any earn we've already expired.
    const alreadyExpired = await this.prisma.coinTransaction.findMany({
      where: {
        type: "expiry",
        refId: { in: earned.map((e) => e.id) },
      },
      select: { refId: true },
    });
    const expiredSet = new Set(alreadyExpired.map((e) => e.refId).filter(Boolean) as string[]);
    const toExpire = earned.filter((e) => !expiredSet.has(e.id));
    if (toExpire.length === 0) return { expiredTxns: 0, totalCoinsExpired: 0 };

    // Group by customer so we can clamp against current balance.
    const byCustomer = new Map<string, typeof toExpire>();
    for (const t of toExpire) {
      const cur = byCustomer.get(t.customerId) ?? [];
      cur.push(t);
      byCustomer.set(t.customerId, cur);
    }

    let expiredTxns = 0;
    let totalCoinsExpired = 0;
    for (const [customerId, txns] of byCustomer) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { coinBalance: true },
      });
      if (!customer) continue;
      // Clamp: never expire more than the current redeemable balance.
      let remaining = customer.coinBalance;
      if (remaining <= 0) {
        // Still record the expiry txns (with amount 0 or clamped) so we don't
        // re-scan them on every sweep. Simpler: insert zero-value expiry rows.
        for (const t of txns) {
          await this.prisma.coinTransaction.create({
            data: {
              customerId,
              amount: 0,
              type: "expiry",
              description: `Expired (no balance to deduct) — ${t.amount}G from ${t.createdAt.toISOString().slice(0, 10)}`,
              refId: t.id,
            },
          });
        }
        expiredTxns += txns.length;
        continue;
      }
      const ops: any[] = [];
      let customerExpired = 0;
      for (const t of txns) {
        const take = Math.min(remaining, t.amount);
        remaining -= take;
        customerExpired += take;
        ops.push(
          this.prisma.coinTransaction.create({
            data: {
              customerId,
              amount: -take,
              type: "expiry",
              description: `Expired ${take} Goins (earned ${t.createdAt.toISOString().slice(0, 10)}, ${COIN_EXPIRY_DAYS}-day TTL)`,
              refId: t.id,
            },
          }),
        );
        if (remaining <= 0) {
          // Remaining transactions in this customer's list have no balance
          // to deduct — emit zero-valued expiry rows to prevent re-scanning.
          for (const rest of txns.slice(txns.indexOf(t) + 1)) {
            ops.push(
              this.prisma.coinTransaction.create({
                data: {
                  customerId,
                  amount: 0,
                  type: "expiry",
                  description: `Expired (balance exhausted) — ${rest.amount}G from ${rest.createdAt.toISOString().slice(0, 10)}`,
                  refId: rest.id,
                },
              }),
            );
          }
          break;
        }
      }
      if (customerExpired > 0) {
        ops.push(
          this.prisma.customer.update({
            where: { id: customerId },
            data: { coinBalance: { decrement: customerExpired } },
          }),
        );
      }
      await this.prisma.$transaction(ops);
      if (customerExpired > 0) this.notifyGoinsChanged(customerId);
      expiredTxns += txns.length;
      totalCoinsExpired += customerExpired;
    }
    return { expiredTxns, totalCoinsExpired };
  }

  // ── Admin audit / fraud-watch (Deploy 117) ─────────────────────────────
  //
  // Freeze / unfreeze a customer account. Frozen accounts can still log in
  // and browse but every earn / spend / spin method returns early. Logged
  // as a coin transaction with type = "admin_grant" and amount = 0 so the
  // action is visible in the customer's coin history.
  async freezeAccount(customerId: string, reason: string, adminId?: string) {
    const existing = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, isFrozen: true },
    });
    if (!existing) throw new BadRequestException("Customer not found");
    if (existing.isFrozen) return { ok: true, alreadyFrozen: true };

    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: customerId },
        data: {
          isFrozen: true,
          frozenAt: new Date(),
          frozenReason: reason.slice(0, 280),
        },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: 0,
          type: "admin_grant",
          description: `🚫 Account frozen by admin${adminId ? ` (${adminId.slice(0, 8)})` : ""} — ${reason.slice(0, 160)}`,
        },
      }),
    ]);
    return { ok: true, alreadyFrozen: false };
  }

  async unfreezeAccount(customerId: string, adminId?: string) {
    const existing = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, isFrozen: true },
    });
    if (!existing) throw new BadRequestException("Customer not found");
    if (!existing.isFrozen) return { ok: true, alreadyActive: true };

    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: customerId },
        data: { isFrozen: false, frozenAt: null, frozenReason: null },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: 0,
          type: "admin_grant",
          description: `✅ Account unfrozen by admin${adminId ? ` (${adminId.slice(0, 8)})` : ""}`,
        },
      }),
    ]);
    return { ok: true, alreadyActive: false };
  }

  /**
   * Top-earners audit view — sorted list of customers who earned the most
   * Goins in the specified window. Powers the fraud-watch dashboard.
   * Includes breakdown per earn type and the account's current frozen state.
   */
  async auditTopEarners(opts: { days?: number; limit?: number } = {}) {
    const windowDays = Math.min(Math.max(opts.days ?? 30, 1), 365);
    const since = new Date(Date.now() - windowDays * 86_400_000);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);

    // Sum earn transactions per customer within the window.
    const earnGroups = await this.prisma.coinTransaction.groupBy({
      by: ["customerId"],
      where: {
        createdAt: { gte: since },
        amount: { gt: 0 },
        type: { notIn: ["expiry", "redemption"] },
      },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: "desc" } },
      take: limit,
    });

    if (earnGroups.length === 0) return [];

    const customerIds = earnGroups.map((g) => g.customerId);
    const [customers, perTypeGroups] = await Promise.all([
      this.prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: {
          id: true, email: true, phone: true, fullName: true,
          coinBalance: true, isFrozen: true, frozenAt: true, frozenReason: true,
          createdAt: true, lastLoginAt: true,
        },
      }),
      this.prisma.coinTransaction.groupBy({
        by: ["customerId", "type"],
        where: {
          createdAt: { gte: since },
          customerId: { in: customerIds },
          amount: { gt: 0 },
          type: { notIn: ["expiry", "redemption"] },
        },
        _sum: { amount: true },
      }),
    ]);

    const custMap = new Map(customers.map((c) => [c.id, c]));
    const breakdownMap = new Map<string, Record<string, number>>();
    for (const p of perTypeGroups) {
      const b = breakdownMap.get(p.customerId) ?? {};
      b[p.type] = p._sum.amount ?? 0;
      breakdownMap.set(p.customerId, b);
    }

    return earnGroups.map((g) => {
      const c = custMap.get(g.customerId);
      return {
        customerId: g.customerId,
        email: c?.email ?? null,
        phone: c?.phone ?? null,
        fullName: c?.fullName ?? null,
        currentBalance: c?.coinBalance ?? 0,
        earnedInWindow: g._sum.amount ?? 0,
        earnedInWindowInr: +((g._sum.amount ?? 0) * COIN_VALUE_INR).toFixed(2),
        transactionsInWindow: g._count._all,
        breakdownByType: breakdownMap.get(g.customerId) ?? {},
        isFrozen: c?.isFrozen ?? false,
        frozenAt: c?.frozenAt ?? null,
        frozenReason: c?.frozenReason ?? null,
        accountCreatedAt: c?.createdAt ?? null,
        lastLoginAt: c?.lastLoginAt ?? null,
        windowDays,
      };
    });
  }

  async getHistory(customerId: string, limit = 30) {
    const txns = await this.prisma.coinTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return txns.map((t) => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      description: t.description,
      refId: t.refId,
      createdAt: t.createdAt,
      isCredit: t.amount > 0,
    }));
  }

  private canSpinToday(lastSpinAt: Date | null): boolean {
    if (!lastSpinAt) return true;
    const now = new Date();
    const last = new Date(lastSpinAt);
    // Reset at midnight IST (UTC+5:30)
    const nowIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const lastIST = new Date(last.getTime() + 5.5 * 60 * 60 * 1000);
    return (
      nowIST.getFullYear() !== lastIST.getFullYear() ||
      nowIST.getMonth() !== lastIST.getMonth() ||
      nowIST.getDate() !== lastIST.getDate()
    );
  }

  private nextSpinTime(lastSpinAt: Date | null): Date | null {
    if (!lastSpinAt) return null;
    const lastIST = new Date(lastSpinAt.getTime() + 5.5 * 60 * 60 * 1000);
    const nextMidnightIST = new Date(lastIST);
    nextMidnightIST.setDate(nextMidnightIST.getDate() + 1);
    nextMidnightIST.setHours(0, 0, 0, 0);
    // Convert back to UTC
    return new Date(nextMidnightIST.getTime() - 5.5 * 60 * 60 * 1000);
  }
}

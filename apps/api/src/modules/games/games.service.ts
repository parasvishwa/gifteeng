import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// Local type aliases matching Prisma enums (avoids @prisma/client type import)
type GameType   =
  | "scratch_card" | "jackpot" | "mystery_box" | "spin_wheel" | "streak"
  | "daily_quest" | "streak_ladder" | "treasure_hunt" | "goin_wager"
  | "product_drop";
type RewardType =
  | "goins" | "discount_pct" | "discount_flat" | "free_shipping"
  | "free_gift_wrap" | "free_product" | "miss";

// ─── Types for reward pool entries (stored as JSON) ─────────────────────────
type PoolEntry = {
  type: RewardType;
  value: string;        // coins amount | pct | flat rupees | product id | ""
  weight: number;       // relative weight — sum does not need to be 100
  label: string;        // shown to user, e.g. "15% off", "50 Goins"
  minCart?: number;     // minimum cart value (INR) for reward to apply
  expiresInDays?: number; // reward expiry (default 30d)
  consolationGoins?: number; // for "miss" entries — small consolation award
};

// Map GameType → CoinTxnType for the coin-ledger side effect (when reward is goins)
const COIN_TXN_BY_GAME: Record<string, string> = {
  scratch_card:  "scratch_card",
  jackpot:       "jackpot",
  mystery_box:   "mystery_box",
  spin_wheel:    "spin_wheel",
  streak:        "streak_reward",
  daily_quest:   "daily_quest",
  streak_ladder: "streak_reward",
  treasure_hunt: "treasure_hunt",
  goin_wager:    "goin_wager",
  // Product Drop wins don't credit coins; RewardInstance carries the prize.
  product_drop:  "admin_grant",
};

// ─── Default reward pools (seed if GameConfig row missing) ──────────────────
// All goin / consolation values below are ×4 vs pre-Deploy-97 amounts so
// the rupee-value per reward stays the same after the 100 G = ₹1 rate flip.
// Discount values (flat/pct), minCart, expiry, free-shipping etc. are ₹-
// denominated and stay untouched.
const DEFAULT_POOLS: Record<GameType, PoolEntry[]> = {
  scratch_card: [
    { type: "discount_pct",   value: "5",  weight: 25, label: "5% off",        minCart: 500,  expiresInDays: 30 },
    { type: "discount_pct",   value: "10", weight: 20, label: "10% off",       minCart: 800,  expiresInDays: 30 },
    { type: "discount_pct",   value: "15", weight: 15, label: "15% off",       minCart: 1000, expiresInDays: 30 },
    { type: "discount_pct",   value: "20", weight: 8,  label: "20% off",       minCart: 1500, expiresInDays: 30 },
    { type: "discount_flat",  value: "50", weight: 10, label: "₹50 off",       minCart: 500,  expiresInDays: 30 },
    { type: "free_gift_wrap", value: "1",  weight: 8,  label: "Free gift wrap", expiresInDays: 30 },
    { type: "free_shipping",  value: "1",  weight: 6,  label: "Free shipping",  expiresInDays: 30 },
    { type: "goins",          value: "400",  weight: 5, label: "400 Goins" },
    { type: "goins",          value: "1000", weight: 2, label: "1000 Goins" },
    { type: "miss",           value: "",     weight: 1, label: "No luck — but here's 40 Goins", consolationGoins: 40 },
  ],
  jackpot: [
    { type: "goins",          value: "600",  weight: 30, label: "600 Goins",      consolationGoins: 600 }, // partial return
    { type: "discount_pct",   value: "20",   weight: 15, label: "20% off",        minCart: 1500, expiresInDays: 30 },
    { type: "discount_pct",   value: "30",   weight: 8,  label: "30% off",        minCart: 2000, expiresInDays: 30 },
    { type: "discount_flat",  value: "200",  weight: 10, label: "₹200 off",       minCart: 1000, expiresInDays: 30 },
    { type: "discount_flat",  value: "500",  weight: 3,  label: "₹500 off",       minCart: 2500, expiresInDays: 30 },
    { type: "free_shipping",  value: "1",    weight: 12, label: "Free shipping",  expiresInDays: 30 },
    { type: "free_gift_wrap", value: "1",    weight: 12, label: "Free gift wrap", expiresInDays: 30 },
    { type: "goins",          value: "2000", weight: 5,  label: "2000 Goins" },
    { type: "goins",          value: "4000", weight: 2,  label: "4000 Goins — Jackpot!" },
    { type: "miss",           value: "",     weight: 3,  label: "Missed — 200 Goins back", consolationGoins: 200 },
  ],
  mystery_box: [
    { type: "goins",          value: "40",   weight: 30, label: "40 Goins" },
    { type: "goins",          value: "100",  weight: 25, label: "100 Goins" },
    { type: "goins",          value: "200",  weight: 15, label: "200 Goins" },
    { type: "goins",          value: "400",  weight: 8,  label: "400 Goins" },
    { type: "discount_pct",   value: "10",   weight: 10, label: "10% off",       minCart: 500,  expiresInDays: 14 },
    { type: "discount_flat",  value: "100",  weight: 6,  label: "₹100 off",      minCart: 600,  expiresInDays: 14 },
    { type: "free_gift_wrap", value: "1",    weight: 4,  label: "Free gift wrap", expiresInDays: 14 },
    { type: "miss",           value: "",     weight: 2,  label: "Empty box — 20 Goins", consolationGoins: 20 },
  ],
  spin_wheel: [
    { type: "goins",          value: "20",   weight: 30, label: "20 Goins" },
    { type: "goins",          value: "40",   weight: 25, label: "40 Goins" },
    { type: "goins",          value: "100",  weight: 15, label: "100 Goins" },
    { type: "goins",          value: "200",  weight: 8,  label: "200 Goins" },
    { type: "goins",          value: "400",  weight: 3,  label: "400 Goins" },
    { type: "discount_pct",   value: "10",   weight: 8,  label: "10% off",       minCart: 500, expiresInDays: 14 },
    { type: "discount_flat",  value: "50",   weight: 8,  label: "₹50 off",       minCart: 300, expiresInDays: 14 },
    { type: "free_shipping",  value: "1",    weight: 3,  label: "Free shipping", expiresInDays: 14 },
  ],
  streak: [
    { type: "goins",          value: "100",  weight: 1, label: "100 Goins (Day 3)" },
    { type: "goins",          value: "300",  weight: 1, label: "300 Goins (Day 7)" },
    { type: "goins",          value: "600",  weight: 1, label: "600 Goins (Day 14)" },
    { type: "goins",          value: "1000", weight: 1, label: "1000 Goins (Day 30)" },
  ],
  // ── Deploy 118 — Daily Quest. Played once a day; completing all three
  // sub-tasks fires one "bonus" award on top of per-step micro-awards.
  // Steps fire atomically (so partial progress survives a page reload).
  daily_quest: [
    { type: "goins",  value: "25",  weight: 1, label: "Step 1 — browse 3 products" },
    { type: "goins",  value: "35",  weight: 1, label: "Step 2 — add 1 to wishlist" },
    { type: "goins",  value: "60",  weight: 1, label: "Step 3 — spin the wheel today" },
    { type: "goins",  value: "200", weight: 1, label: "🏆 All-3 bonus" },
  ],
  // ── Deploy 118 — Streak Ladder. Richer milestones than the old streak
  // game: 8 rungs, each visible on the UI ladder, each claimable only
  // after the prior is unlocked.
  streak_ladder: [
    { type: "goins",  value: "50",   weight: 1, label: "Rung 1 — Day 1" },
    { type: "goins",  value: "100",  weight: 1, label: "Rung 2 — Day 2" },
    { type: "goins",  value: "200",  weight: 1, label: "Rung 3 — Day 3" },
    { type: "goins",  value: "350",  weight: 1, label: "Rung 4 — Day 5" },
    { type: "goins",  value: "600",  weight: 1, label: "Rung 5 — Day 7" },
    { type: "goins",  value: "1000", weight: 1, label: "Rung 6 — Day 14" },
    { type: "goins",  value: "1800", weight: 1, label: "Rung 7 — Day 21" },
    { type: "goins",  value: "3500", weight: 1, label: "Rung 8 — Day 30" },
  ],
  // ── Deploy 119 — Treasure Hunt. Customer picks 1 of N boxes. Most are
  // consolation; exactly one is the big prize per reset window.
  treasure_hunt: [
    { type: "goins",  value: "20",   weight: 40, label: "Small treasure" },
    { type: "goins",  value: "60",   weight: 25, label: "Medium treasure" },
    { type: "goins",  value: "150",  weight: 15, label: "Large treasure" },
    { type: "discount_flat", value: "50",  weight: 8, label: "₹50 off",  minCart: 300, expiresInDays: 14 },
    { type: "discount_pct",  value: "15",  weight: 5, label: "15% off",  minCart: 1000, expiresInDays: 14 },
    { type: "goins",  value: "500",  weight: 4,  label: "Hidden treasure" },
    { type: "goins",  value: "1500", weight: 1,  label: "🏆 Jackpot treasure" },
    { type: "miss",   value: "",     weight: 2,  label: "Empty box — 10 Goins", consolationGoins: 10 },
  ],
  // ── Deploy 119 — Goin Wager. Stake N Goins, outcome resolved by the
  // same weighted pool. The WIN entries pay out `value` × stake; LOSS
  // entries return `consolationGoins` outright (so the house still "keeps"
  // part of the stake). Admins can tune odds per stake tier.
  goin_wager: [
    { type: "goins", value: "2",  weight: 40, label: "2× payout" },
    { type: "goins", value: "3",  weight: 20, label: "3× payout" },
    { type: "goins", value: "5",  weight: 8,  label: "5× payout" },
    { type: "goins", value: "10", weight: 2,  label: "10× JACKPOT" },
    { type: "miss",  value: "",   weight: 30, label: "House wins — 20% stake back", consolationGoins: 0 },
  ],
  // Product Drop — pool is not used for reward selection (each drop is a
  // single-product win/lose). Seeded here so the generic game loader doesn't
  // choke on an empty pool. Win odds live on ProductDropConfig.winOddsPct.
  product_drop: [
    { type: "free_product", value: "", weight: 1, label: "You won! Pay only shipping." },
    { type: "miss",         value: "", weight: 99, label: "Better luck tomorrow" },
  ],
};

// Streak milestones: day → goins reward (×4 vs pre-Deploy-97)
const STREAK_MILESTONES: { day: number; goins: number; label: string }[] = [
  { day: 3,  goins: 100,  label: "3-Day Streak Bonus" },
  { day: 7,  goins: 300,  label: "7-Day Streak Bonus" },
  { day: 14, goins: 600,  label: "14-Day Streak Bonus" },
  { day: 30, goins: 1000, label: "30-Day Streak Bonus" },
];

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  // ─── Gifter's Tree ───────────────────────────────────────────────────────
  async getTree(customerId: string) {
    const giftsSent = await this.prisma.order.count({
      where: { customerId, paymentStatus: { not: "failed" } },
    });
    const LEVELS = [
      { min: 0,  max: 0,   name: "Seed",              emoji: "🌱", perks: ["Plant your first gift!"] },
      { min: 1,  max: 5,   name: "Seedling",          emoji: "🌿", perks: ["Your journey begins"] },
      { min: 6,  max: 15,  name: "Sapling",           emoji: "🌳", perks: ["+1 daily scratch card", "Free gift-wrap on orders ≥ ₹1000"] },
      { min: 16, max: 50,  name: "Great Oak",         emoji: "🌲", perks: ["+1 daily scratch card", "Free shipping on orders ≥ ₹800", "2× Jackpot consolation Goins"] },
      { min: 51, max: 999, name: "Legendary Banyan",  emoji: "🏯", perks: ["Double daily rewards", "Exclusive premium collection", "Early-access seasonal drops"] },
    ];
    const level = LEVELS.findIndex((l) => giftsSent >= l.min && giftsSent <= l.max);
    const idx = level < 0 ? 0 : level;
    const current = LEVELS[idx]!;
    const next = LEVELS[idx + 1] ?? null;
    return {
      giftsSent,
      levelIndex: idx,
      levelName: current.name,
      levelEmoji: current.emoji,
      perks: current.perks,
      nextLevelName: next?.name ?? null,
      nextLevelEmoji: next?.emoji ?? null,
      giftsToNext: next ? Math.max(0, next.min - giftsSent) : null,
      progress: next
        ? Math.min(1, (giftsSent - current.min) / (next.min - current.min))
        : 1,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  async getHub(customerId: string) {
    const [cfgs, plays, streak, balance] = await Promise.all([
      this.prisma.gameConfig.findMany(),
      this.prisma.gamePlay.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.loginStreak.findUnique({ where: { customerId } }),
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { coinBalance: true },
      }),
    ]);

    // Compute today's plays per game
    const today = this.startOfDayIST(new Date());
    const todaysPlays = plays.filter(p => p.createdAt >= today);
    const playsByType: Record<string, number> = {};
    for (const p of todaysPlays) {
      playsByType[p.gameType] = (playsByType[p.gameType] ?? 0) + 1;
    }

    // All user-facing games shown on the /play hub. `streak` is intentionally
    // skipped because it auto-fires on login; the streak strip at the top of
    // the hub already surfaces it. `product_drop` is also skipped here — it's
    // only rendered when there's at least one active ProductDropConfig
    // campaign (checked below) and is driven by ProductDropConfig, not
    // GameConfig.
    const HUB_ORDER: GameType[] = [
      "scratch_card",
      "jackpot",
      "mystery_box",
      "spin_wheel",
      "daily_quest",
      "streak_ladder",
      "treasure_hunt",
      "goin_wager",
    ];
    const games = HUB_ORDER.map(type => {
      const cfg = cfgs.find(c => c.type === type);
      const dailyLimit = cfg?.dailyLimit ?? this.defaultDailyLimit(type);
      const played = playsByType[type] ?? 0;
      return {
        type,
        title: cfg?.title ?? this.defaultTitle(type),
        description: cfg?.description ?? this.defaultDescription(type),
        dailyLimit,
        playsToday: played,
        canPlay: played < dailyLimit,
        costGoins: cfg?.costGoins ?? this.defaultCost(type),
      };
    });

    // Product Drop tile appears only if at least one drop is active — no
    // point surfacing an empty wheel. Count the active drops so the tile
    // can show "3 drops live" as a badge.
    const now = new Date();
    const activeDrops = await this.prisma.productDropConfig.count({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null   }, { endsAt:   { gte: now } }] },
        ],
      },
    });
    if (activeDrops > 0) {
      games.push({
        type: "product_drop" as GameType,
        title: this.defaultTitle("product_drop"),
        description: `${activeDrops} live ${activeDrops === 1 ? "drop" : "drops"}`,
        dailyLimit: 1,
        playsToday: playsByType["product_drop"] ?? 0,
        canPlay: true,
        costGoins: 0,
      });
    }

    return {
      goinBalance: balance?.coinBalance ?? 0,
      streak: {
        current: streak?.currentStreak ?? 0,
        longest: streak?.longestStreak ?? 0,
        milestonesHit: (streak?.milestonesHit as number[] | null) ?? [],
        nextMilestone: STREAK_MILESTONES.find(m =>
          m.day > (streak?.currentStreak ?? 0),
        ),
      },
      games,
      recentPlays: plays.slice(0, 10).map(p => ({
        gameType: p.gameType,
        rewardLabel: p.rewardLabel,
        createdAt: p.createdAt,
      })),
    };
  }

  // ─── Scratch card ────────────────────────────────────────────────────────
  async playScratchCard(customerId: string, triggerRef?: string) {
    // Post-order scratch cards (when triggerRef is a real orderId) bypass the
    // daily limit and are capped by floor(orderValue / 500) — max 3.
    if (triggerRef) {
      const order = await this.prisma.order.findUnique({
        where: { id: triggerRef },
        select: { id: true, customerId: true, grandTotal: true },
      });
      if (order && order.customerId === customerId) {
        const maxCards = Math.min(
          3,
          Math.max(1, Math.floor(Number(order.grandTotal) / 500)),
        );
        const playsForOrder = await this.prisma.gamePlay.count({
          where: {
            customerId,
            gameType: "scratch_card",
            triggerRef: order.id,
          },
        });
        if (playsForOrder >= maxCards) {
          throw new BadRequestException(
            "You've scratched all cards for this order. Check your rewards wallet.",
          );
        }
        // Bypass daily limit for post-order scratches
        return this.playGame(customerId, "scratch_card", triggerRef, { bypassDailyLimit: true });
      }
    }
    return this.playGame(customerId, "scratch_card", triggerRef);
  }

  // ─── Jackpot ─────────────────────────────────────────────────────────────
  async playJackpot(customerId: string) {
    return this.playGame(customerId, "jackpot");
  }

  // ─── Mystery Box ─────────────────────────────────────────────────────────
  async playMysteryBox(customerId: string) {
    return this.playGame(customerId, "mystery_box");
  }

  // ─── Streak check-in ─────────────────────────────────────────────────────
  async streakCheckIn(customerId: string) {
    const existing = await this.prisma.loginStreak.findUnique({
      where: { customerId },
    });
    const now = new Date();
    const today = this.startOfDayIST(now);

    let current = 1;
    let longest = existing?.longestStreak ?? 0;
    let milestonesHit = (existing?.milestonesHit as number[] | null) ?? [];

    if (existing?.lastCheckInAt) {
      const last = this.startOfDayIST(existing.lastCheckInAt);
      const diffDays = Math.round((today.getTime() - last.getTime()) / 86_400_000);
      if (diffDays === 0) {
        // Already checked in today — no-op
        return {
          alreadyCheckedIn: true,
          currentStreak: existing.currentStreak,
          longestStreak: existing.longestStreak,
          milestonesHit,
          nextMilestone: STREAK_MILESTONES.find(m => m.day > existing.currentStreak),
        };
      } else if (diffDays === 1) {
        current = existing.currentStreak + 1;
      } else {
        // broken streak — reset and clear milestones
        current = 1;
        milestonesHit = [];
      }
    }
    longest = Math.max(longest, current);

    // Check if this day hits a new milestone → award goins
    let awarded: { goins: number; label: string } | null = null;
    const milestone = STREAK_MILESTONES.find(m => m.day === current);
    if (milestone && !milestonesHit.includes(current)) {
      milestonesHit = [...milestonesHit, current];
      awarded = { goins: milestone.goins, label: milestone.label };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.loginStreak.upsert({
        where: { customerId },
        create: {
          customerId,
          currentStreak: current,
          longestStreak: longest,
          lastCheckInAt: now,
          milestonesHit,
        },
        update: {
          currentStreak: current,
          longestStreak: longest,
          lastCheckInAt: now,
          milestonesHit,
        },
      });

      if (awarded) {
        await tx.customer.update({
          where: { id: customerId },
          data: { coinBalance: { increment: awarded.goins } },
        });
        await tx.coinTransaction.create({
          data: {
            customerId,
            amount: awarded.goins,
            type: "streak_reward",
            description: `${awarded.label} — ${awarded.goins} Goins`,
          },
        });
        await tx.gamePlay.create({
          data: {
            customerId,
            gameType: "streak",
            rewardType: "goins",
            rewardValue: String(awarded.goins),
            rewardLabel: awarded.label,
          },
        });
      }
    });

    return {
      alreadyCheckedIn: false,
      currentStreak: current,
      longestStreak: longest,
      milestonesHit,
      nextMilestone: STREAK_MILESTONES.find(m => m.day > current),
      awarded,
    };
  }

  // ─── Core game play logic (shared by scratch/jackpot/mystery) ───────────
  private async playGame(
    customerId: string,
    gameType: GameType,
    triggerRef?: string,
    opts?: { bypassDailyLimit?: boolean },
  ) {
    const cfg = await this.prisma.gameConfig.findUnique({
      where: { type: gameType },
    });
    const pool: PoolEntry[] =
      (cfg?.rewardPool as PoolEntry[] | null) ??
      (DEFAULT_POOLS as Record<string, PoolEntry[]>)[gameType] ??
      [];
    if (!pool || pool.length === 0) {
      throw new BadRequestException("No rewards configured for this game");
    }
    const dailyLimit = cfg?.dailyLimit ?? this.defaultDailyLimit(gameType);
    const costGoins  = cfg?.costGoins  ?? this.defaultCost(gameType);

    // Enforce daily limit (IST midnight reset), unless bypassed (post-order)
    if (!opts?.bypassDailyLimit) {
      const today = this.startOfDayIST(new Date());
      const playsToday = await this.prisma.gamePlay.count({
        where: {
          customerId,
          gameType,
          createdAt: { gte: today },
          // Don't count post-order triggered plays against the daily limit
          triggerRef: null,
        },
      });
      if (playsToday >= dailyLimit) {
        throw new BadRequestException(
          `You've reached today's limit (${dailyLimit}). Come back tomorrow!`,
        );
      }
    }

    // Enforce cost (if any)
    if (costGoins > 0) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { coinBalance: true },
      });
      if (!customer) throw new NotFoundException("Customer not found");
      if (customer.coinBalance < costGoins) {
        throw new BadRequestException(
          `You need ${costGoins} Goins to play. Current balance: ${customer.coinBalance}`,
        );
      }
    }

    // Pick reward (weighted random)
    const picked = this.pickWeighted(pool);

    // Execute in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct cost if any
      if (costGoins > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { coinBalance: { decrement: costGoins } },
        });
        await tx.coinTransaction.create({
          data: {
            customerId,
            amount: -costGoins,
            type: COIN_TXN_BY_GAME[gameType] as any,
            description: `${this.defaultTitle(gameType)} — play cost`,
          },
        });
      }

      let rewardInstance: { id: string; code: string } | null = null;
      let goinsAwarded = 0;

      if (picked.type === "goins") {
        goinsAwarded = parseInt(picked.value, 10) || 0;
      } else if (picked.type === "miss") {
        goinsAwarded = picked.consolationGoins ?? 0;
      } else {
        // Create reward instance for later cart application
        const code = this.generateCode(gameType);
        const expiresAt = picked.expiresInDays
          ? new Date(Date.now() + picked.expiresInDays * 86_400_000)
          : null;
        const ri = await tx.rewardInstance.create({
          data: {
            customerId,
            type: picked.type,
            value: picked.value,
            label: picked.label,
            source: gameType,
            code,
            minCartInr: picked.minCart ?? 0,
            expiresAt,
          },
        });
        rewardInstance = { id: ri.id, code: ri.code! };
        // Some non-goins rewards also include consolation goins
        goinsAwarded = picked.consolationGoins ?? 0;
      }

      if (goinsAwarded > 0) {
        await tx.customer.update({
          where: { id: customerId },
          data: { coinBalance: { increment: goinsAwarded } },
        });
        await tx.coinTransaction.create({
          data: {
            customerId,
            amount: goinsAwarded,
            type: COIN_TXN_BY_GAME[gameType] as any,
            description: `${this.defaultTitle(gameType)} — ${picked.label}`,
          },
        });
      }

      await tx.gamePlay.create({
        data: {
          customerId,
          gameType,
          rewardType: picked.type,
          rewardValue: picked.value,
          rewardLabel: picked.label,
          costGoins,
          rewardId: rewardInstance?.id ?? null,
          triggerRef: triggerRef ?? null,
        },
      });

      const customerAfter = await tx.customer.findUnique({
        where: { id: customerId },
        select: { coinBalance: true },
      });

      return {
        rewardType: picked.type,
        rewardValue: picked.value,
        rewardLabel: picked.label,
        goinsAwarded,
        rewardCode: rewardInstance?.code ?? null,
        rewardId: rewardInstance?.id ?? null,
        minCartInr: picked.minCart ?? 0,
        expiresAt:
          picked.expiresInDays
            ? new Date(Date.now() + picked.expiresInDays * 86_400_000)
            : null,
        newBalance: customerAfter?.coinBalance ?? 0,
        isMiss: picked.type === "miss",
      };
    });

    return result;
  }

  // ─── Admin / seed ────────────────────────────────────────────────────────
  async seedDefaults() {
    const seeded: string[] = [];
    for (const [type, pool] of Object.entries(DEFAULT_POOLS)) {
      const existing = await this.prisma.gameConfig.findUnique({
        where: { type: type as GameType },
      });
      if (!existing) {
        await this.prisma.gameConfig.create({
          data: {
            type: type as GameType,
            title: this.defaultTitle(type as GameType),
            description: this.defaultDescription(type as GameType),
            rewardPool: pool as any,
            dailyLimit: this.defaultDailyLimit(type as GameType),
            costGoins: this.defaultCost(type as GameType),
          },
        });
        seeded.push(type);
      }
    }
    return { seeded };
  }

  async adminListConfigs() {
    return this.prisma.gameConfig.findMany({ orderBy: { type: "asc" } });
  }

  async adminUpdateConfig(
    type: GameType,
    data: {
      title?: string;
      description?: string;
      rewardPool?: PoolEntry[];
      dailyLimit?: number;
      costGoins?: number;
      isActive?: boolean;
    },
  ) {
    return this.prisma.gameConfig.update({
      where: { type },
      data: {
        title: data.title,
        description: data.description,
        rewardPool: data.rewardPool as any,
        dailyLimit: data.dailyLimit,
        costGoins: data.costGoins,
        isActive: data.isActive,
      },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private pickWeighted(pool: PoolEntry[]): PoolEntry {
    const total = pool.reduce((a, p) => a + p.weight, 0);
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p;
    }
    return pool[pool.length - 1]!;
  }

  private generateCode(gameType: GameType): string {
    const prefixMap: Record<string, string> = {
      scratch_card: "SCR",
      jackpot:      "JKP",
      mystery_box:  "MYB",
      spin_wheel:   "SPN",
      streak:       "STK",
    };
    const prefix = prefixMap[gameType as unknown as string] ?? "GFT";
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}-${rand}`;
  }

  private startOfDayIST(d: Date): Date {
    // Shift into IST (UTC+5:30), strip time, shift back to UTC
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    ist.setUTCHours(0, 0, 0, 0);
    return new Date(ist.getTime() - 5.5 * 60 * 60 * 1000);
  }

  private defaultTitle(t: GameType): string {
    const m: Record<string, string> = {
      scratch_card:  "Scratch Card",
      jackpot:       "Gift Jackpot",
      mystery_box:   "Mystery Box",
      spin_wheel:    "Spin the Wheel",
      streak:        "Daily Streak",
      daily_quest:   "Daily Quest",
      streak_ladder: "Streak Ladder",
      treasure_hunt: "Treasure Hunt",
      goin_wager:    "Goin Wager",
      product_drop:  "Product Drop",
    };
    return m[t as unknown as string] ?? "Game";
  }

  private defaultDescription(t: GameType): string {
    const m: Record<string, string> = {
      scratch_card:  "Scratch to reveal discounts, free gifts or Goins.",
      jackpot:       "Three reels. Match gifts. Win big.",
      mystery_box:   "Pick one of six wrapped boxes — what's inside?",
      spin_wheel:    "Free daily spin — always win something.",
      streak:        "Log in daily, unlock escalating rewards.",
      daily_quest:   "Complete 3 tiny tasks for a Goin bonus.",
      streak_ladder: "Show up daily — climb the 8-rung ladder.",
      treasure_hunt: "Pick a box. One hides a jackpot.",
      goin_wager:    "Stake Goins. Double them — or lose them.",
      product_drop:  "Win the product. Pay only shipping.",
    };
    return m[t as unknown as string] ?? "";
  }

  private defaultDailyLimit(t: GameType): number {
    const m: Record<string, number> = {
      scratch_card: 1,
      jackpot: 3,
      mystery_box: 1,
      spin_wheel: 1,
      streak: 1,
      daily_quest: 1,    // one quest run per day
      streak_ladder: 1,  // one rung claim per day
      treasure_hunt: 1,  // one treasure pick per day
      goin_wager: 5,     // five wagers per day (capped gambling)
      product_drop: 1,   // one product-drop attempt per day per campaign
    };
    return m[t as unknown as string] ?? 1;
  }

  private defaultCost(t: GameType): number {
    const m: Record<string, number> = {
      scratch_card: 0,
      jackpot: 500,
      mystery_box: 0,
      spin_wheel: 0,
      streak: 0,
      daily_quest: 0,
      streak_ladder: 0,
      treasure_hunt: 0,
      // Wager cost is dynamic — the client passes the stake; the play
      // method uses that instead of this default.
      goin_wager: 0,
      product_drop: 0,   // free to play — winner pays shipping at checkout
    };
    return m[t as unknown as string] ?? 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Deploy 118 — Daily Quest
  // ═══════════════════════════════════════════════════════════════════════
  //
  // A tiny 3-step checklist that resets at IST midnight. Steps are:
  //   1. visit 3 product pages                      (client reports after tracking)
  //   2. add at least 1 item to wishlist            (client reports)
  //   3. play any other casino game                 (server-detected)
  //
  // Each step awards a small coin trickle on completion. If all three fire
  // on the same day, a bonus 200 G triggers. Idempotent: repeated completion
  // of the same step returns { alreadyClaimed: true } instead of paying twice.

  async getDailyQuestState(customerId: string) {
    const today = this.startOfDayIST(new Date());
    const plays = await this.prisma.gamePlay.findMany({
      where: { customerId, gameType: "daily_quest", createdAt: { gte: today } },
      orderBy: { createdAt: "asc" },
    });
    // metadata.step holds a 1-indexed step or "bonus".
    const claimedSteps = new Set<string>();
    for (const p of plays) {
      const meta = (p.metadata as any) ?? {};
      if (meta.step) claimedSteps.add(String(meta.step));
    }
    // Detect step 3 (played any other game today) on the fly so the client
    // doesn't have to "report" it — cleaner UX.
    const otherGamesToday = await this.prisma.gamePlay.count({
      where: {
        customerId,
        createdAt: { gte: today },
        gameType: { notIn: ["daily_quest"] },
      },
    });
    const stepsDoneAuto = {
      "1": claimedSteps.has("1"),
      "2": claimedSteps.has("2"),
      "3": claimedSteps.has("3") || otherGamesToday > 0, // server-detected
    };
    const allDone = stepsDoneAuto["1"] && stepsDoneAuto["2"] && stepsDoneAuto["3"];
    const bonusClaimed = claimedSteps.has("bonus");
    return {
      stepsDone: stepsDoneAuto,
      bonusEligible: allDone && !bonusClaimed,
      bonusClaimed,
      steps: [
        { id: "1", label: "Browse 3 products", reward: 25 },
        { id: "2", label: "Add 1 to wishlist", reward: 35 },
        { id: "3", label: "Play any casino game", reward: 60 },
      ],
      bonusReward: 200,
    };
  }

  async claimDailyQuestStep(customerId: string, step: "1" | "2" | "3" | "bonus") {
    const today = this.startOfDayIST(new Date());
    const already = await this.prisma.gamePlay.findFirst({
      where: {
        customerId,
        gameType: "daily_quest",
        createdAt: { gte: today },
        metadata: { path: ["step"], equals: step } as any,
      },
    });
    if (already) return { alreadyClaimed: true };

    // Validate eligibility server-side for the bonus + step 3 (auto-detected).
    const state = await this.getDailyQuestState(customerId);
    if (step === "bonus" && !state.bonusEligible)
      throw new BadRequestException("Complete all three steps first.");
    if (step === "3" && !(state.stepsDone as any)["3"])
      throw new BadRequestException("Play another game first (spin, scratch, treasure etc.).");

    const stepRewards: Record<string, number> = { "1": 25, "2": 35, "3": 60, bonus: 200 };
    const coins = stepRewards[step] ?? 0;
    if (coins <= 0) throw new BadRequestException("Invalid step.");

    await this.prisma.$transaction([
      this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "daily_quest",
          rewardType: "goins",
          rewardValue: String(coins),
          rewardLabel: step === "bonus" ? "All-3 bonus" : `Step ${step}`,
          metadata: { step } as any,
        },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: coins } },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: coins,
          type: "daily_quest",
          description: `Daily Quest — ${step === "bonus" ? "all-3 bonus" : `step ${step}`}: +${coins} G`,
        },
      }),
    ]);
    return { claimed: step, coinsEarned: coins };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Deploy 118 — Streak Ladder
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 8-rung ladder. A "login streak" day = any day the customer had at least
  // one GamePlay row (any type) — easy to compute without a new table.
  // Each rung unlocks after the specified day-count and can be claimed once
  // per streak. If the streak breaks, rungs reset.

  private static readonly LADDER_RUNGS = [
    { day: 1,  goins: 50,   label: "Rung 1 — Day 1" },
    { day: 2,  goins: 100,  label: "Rung 2 — Day 2" },
    { day: 3,  goins: 200,  label: "Rung 3 — Day 3" },
    { day: 5,  goins: 350,  label: "Rung 4 — Day 5" },
    { day: 7,  goins: 600,  label: "Rung 5 — Day 7" },
    { day: 14, goins: 1000, label: "Rung 6 — Day 14" },
    { day: 21, goins: 1800, label: "Rung 7 — Day 21" },
    { day: 30, goins: 3500, label: "Rung 8 — Day 30" },
  ];

  /**
   * Count consecutive IST days (ending today) where the customer had at
   * least one GamePlay row. Missing a day resets the streak to 0.
   */
  async currentStreakDays(customerId: string): Promise<number> {
    const today = this.startOfDayIST(new Date());
    // Pull last 35 days of plays, bucket by IST date, count consecutive.
    const since = new Date(today.getTime() - 35 * 86_400_000);
    const plays = await this.prisma.gamePlay.findMany({
      where: { customerId, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const daysWithPlay = new Set<string>();
    for (const p of plays) {
      const ist = new Date(p.createdAt.getTime() + 5.5 * 3600_000);
      daysWithPlay.add(`${ist.getUTCFullYear()}-${ist.getUTCMonth() + 1}-${ist.getUTCDate()}`);
    }
    let streak = 0;
    for (let i = 0; i < 35; i++) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const ist = new Date(d.getTime() + 5.5 * 3600_000);
      const key = `${ist.getUTCFullYear()}-${ist.getUTCMonth() + 1}-${ist.getUTCDate()}`;
      if (daysWithPlay.has(key)) streak += 1;
      else break;
    }
    return streak;
  }

  async getStreakLadderState(customerId: string) {
    const streak = await this.currentStreakDays(customerId);
    // Which rungs have already been claimed (ever)? Each claim is tagged
    // with metadata.rung = day.
    const claims = await this.prisma.gamePlay.findMany({
      where: { customerId, gameType: "streak_ladder" },
      select: { metadata: true, createdAt: true },
    });
    const claimedDays = new Set<number>();
    for (const c of claims) {
      const r = (c.metadata as any)?.rung;
      if (typeof r === "number") claimedDays.add(r);
    }
    return {
      streakDays: streak,
      rungs: GamesService.LADDER_RUNGS.map((r) => ({
        ...r,
        unlocked: streak >= r.day,
        claimed: claimedDays.has(r.day),
      })),
    };
  }

  async claimStreakLadderRung(customerId: string, day: number) {
    const rung = GamesService.LADDER_RUNGS.find((r) => r.day === day);
    if (!rung) throw new BadRequestException("Unknown rung");
    const state = await this.getStreakLadderState(customerId);
    const target = state.rungs.find((r) => r.day === day);
    if (!target?.unlocked) throw new BadRequestException("Streak not long enough yet");
    if (target.claimed) return { alreadyClaimed: true };

    await this.prisma.$transaction([
      this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "streak_ladder",
          rewardType: "goins",
          rewardValue: String(rung.goins),
          rewardLabel: rung.label,
          metadata: { rung: day } as any,
        },
      }),
      this.prisma.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: rung.goins } },
      }),
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: rung.goins,
          type: "streak_reward",
          description: `Streak Ladder — ${rung.label}: +${rung.goins} G`,
        },
      }),
    ]);
    return { claimed: day, coinsEarned: rung.goins };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Deploy 119 — Treasure Hunt
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Customer picks one of N numbered boxes; server resolves the pick using
  // the treasure_hunt default pool above. Once/day (config-overridable).

  async playTreasureHunt(customerId: string, pickIndex: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { coinBalance: true, isFrozen: true, frozenReason: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.isFrozen)
      throw new BadRequestException(customer.frozenReason ?? "Account is frozen.");

    const today = this.startOfDayIST(new Date());
    const playsToday = await this.prisma.gamePlay.count({
      where: { customerId, gameType: "treasure_hunt", createdAt: { gte: today } },
    });
    if (playsToday >= 1)
      throw new BadRequestException("You've already hunted today — come back tomorrow!");

    const pool = DEFAULT_POOLS.treasure_hunt;
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    let reward: PoolEntry = pool[0]!;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) { reward = p; break; }
    }
    const coins = reward.type === "goins"
      ? parseInt(reward.value, 10) || 0
      : reward.type === "miss"
        ? reward.consolationGoins ?? 0
        : 0;

    const ops: any[] = [
      this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "treasure_hunt",
          rewardType: reward.type as any,
          rewardValue: reward.value,
          rewardLabel: reward.label,
          metadata: { pickIndex } as any,
        },
      }),
    ];
    if (coins > 0) {
      ops.push(
        this.prisma.customer.update({
          where: { id: customerId },
          data: { coinBalance: { increment: coins } },
        }),
        this.prisma.coinTransaction.create({
          data: {
            customerId,
            amount: coins,
            type: "treasure_hunt",
            description: `Treasure Hunt (box ${pickIndex + 1}) — ${reward.label}: +${coins} G`,
          },
        }),
      );
    }
    await this.prisma.$transaction(ops);
    return {
      pickIndex,
      reward: { type: reward.type, value: reward.value, label: reward.label, coins },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Deploy 119 — Goin Wager
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Customer stakes N Goins. Server samples the wager pool. On a win, the
  // payout is stake × multiplier (where multiplier = parseInt(value, 10)).
  // On a loss, return `consolationGoins` (typically 0; the stake is lost).

  async playGoinWager(customerId: string, stake: number) {
    if (!Number.isFinite(stake) || stake <= 0)
      throw new BadRequestException("Enter a positive stake");
    const minStake = 50, maxStake = 2000;
    if (stake < minStake) throw new BadRequestException(`Minimum stake is ${minStake} G`);
    if (stake > maxStake) throw new BadRequestException(`Maximum stake is ${maxStake} G`);

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { coinBalance: true, isFrozen: true, frozenReason: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.isFrozen)
      throw new BadRequestException(customer.frozenReason ?? "Account is frozen.");
    if (customer.coinBalance < stake)
      throw new BadRequestException(`You only have ${customer.coinBalance} G (need ${stake}).`);

    const today = this.startOfDayIST(new Date());
    const playsToday = await this.prisma.gamePlay.count({
      where: { customerId, gameType: "goin_wager", createdAt: { gte: today } },
    });
    if (playsToday >= this.defaultDailyLimit("goin_wager"))
      throw new BadRequestException("You've hit today's wager limit. Try again tomorrow.");

    const pool = DEFAULT_POOLS.goin_wager;
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    let outcome: PoolEntry = pool[0]!;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) { outcome = p; break; }
    }

    const won = outcome.type === "goins";
    const multiplier = won ? (parseInt(outcome.value, 10) || 0) : 0;
    // On a loss, consolationGoins is what the house returns (often 0).
    const consolation = !won ? (outcome.consolationGoins ?? 0) : 0;

    // Net = payout - stake.
    //  - win:  payout = stake * multiplier, net = stake*(multiplier-1)
    //  - loss: payout = consolation,         net = consolation - stake
    const payout = won ? stake * multiplier : consolation;
    const net    = payout - stake;

    const ops: any[] = [
      this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "goin_wager",
          rewardType: won ? "goins" : "miss",
          rewardValue: String(payout),
          rewardLabel: outcome.label,
          costGoins: stake,
          metadata: { stake, outcome: outcome.label, multiplier, payout, net } as any,
        },
      }),
      // Always record the stake deduction as a discrete transaction for the
      // ledger — easier to audit than collapsing to a single net entry.
      this.prisma.coinTransaction.create({
        data: {
          customerId,
          amount: -stake,
          type: "goin_wager",
          description: `Wager stake: ${stake} G on ${outcome.label}`,
        },
      }),
    ];
    if (payout > 0) {
      ops.push(
        this.prisma.coinTransaction.create({
          data: {
            customerId,
            amount: payout,
            type: "goin_wager",
            description: won
              ? `Wager WIN — ${multiplier}× on ${stake} G = +${payout} G`
              : `Wager consolation — ${payout} G back`,
          },
        }),
      );
    }
    // Single balance update with the net effect.
    ops.push(
      this.prisma.customer.update({
        where: { id: customerId },
        data: { coinBalance: { increment: net } },
      }),
    );
    await this.prisma.$transaction(ops);

    return {
      stake,
      won,
      multiplier: won ? multiplier : 0,
      payout,
      net,
      outcomeLabel: outcome.label,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Deploy 120 — Product Drop
  // ═══════════════════════════════════════════════════════════════════════
  //
  // A "product drop" is an admin-curated campaign. The admin picks a real
  // product + a shipping-only price + win odds. Customers can attempt once
  // per day per campaign. On win, we create a RewardInstance of type
  // `free_product` (value = "productId:shippingInr") that the cart module
  // recognises and applies as a replacement price.
  //
  // The campaign model is ProductDropConfig; the per-play log row is a
  // GamePlay with gameType = product_drop and metadata { productDropId,
  // configId, won, productId }.

  /** Public list of currently-active drops (customer-facing). */
  async listActiveProductDrops() {
    const now = new Date();
    const rows = await this.prisma.productDropConfig.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null   }, { endsAt:   { gte: now } }] },
        ],
      },
      include: {
        product: {
          select: { id: true, slug: true, title: true, basePrice: true, images: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      product: r.product,
      gameMode: r.gameMode,
      modeConfig: r.modeConfig,
      shippingInr: r.shippingInr,
      winOddsPct: Number(r.winOddsPct),
      dailyLimit: r.dailyLimit,
      maxWinners: r.maxWinners,
      winnersCount: r.winnersCount,
      claimWindowHours: r.claimWindowHours,
      title: r.title ?? r.product.title,
      subtitle: r.subtitle,
      bannerImage: r.bannerImage,
      endsAt: r.endsAt,
    }));
  }

  async getProductDropState(customerId: string, dropId: string) {
    const drop = await this.prisma.productDropConfig.findUnique({
      where: { id: dropId },
      include: {
        product: {
          select: { id: true, slug: true, title: true, basePrice: true, images: true },
        },
      },
    });
    if (!drop) throw new NotFoundException("Drop not found");
    const today = this.startOfDayIST(new Date());
    const playsToday = await this.prisma.gamePlay.count({
      where: {
        customerId,
        gameType: "product_drop",
        createdAt: { gte: today },
        metadata: { path: ["configId"], equals: drop.id } as any,
      },
    });
    // Check for an already-won unused voucher (so we don't double-issue).
    const existingWin = await this.prisma.rewardInstance.findFirst({
      where: {
        customerId,
        source: "product_drop",
        status: { in: ["pending", "applied"] },
        value: { startsWith: `${drop.productId}:` },
      },
    });
    const capped = drop.maxWinners !== null && drop.maxWinners !== undefined
      ? drop.winnersCount >= drop.maxWinners
      : false;
    return {
      dropId: drop.id,
      product: drop.product,
      gameMode: drop.gameMode,
      modeConfig: drop.modeConfig,
      shippingInr: drop.shippingInr,
      winOddsPct: Number(drop.winOddsPct),
      dailyLimit: drop.dailyLimit,
      playsToday,
      canPlay: playsToday < drop.dailyLimit && drop.isActive && !capped && !existingWin,
      campaignFull: capped,
      winnersCount: drop.winnersCount,
      maxWinners: drop.maxWinners,
      alreadyWon: !!existingWin,
      existingVoucherCode: existingWin?.code ?? null,
      endsAt: drop.endsAt,
    };
  }

  async playProductDrop(customerId: string, dropId: string) {
    // Fraud-watch gate.
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { isFrozen: true, frozenReason: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.isFrozen)
      throw new BadRequestException(customer.frozenReason ?? "Account is frozen.");

    const drop = await this.prisma.productDropConfig.findUnique({
      where: { id: dropId },
      include: { product: { select: { id: true, title: true, basePrice: true } } },
    });
    if (!drop) throw new NotFoundException("Drop not found");
    if (!drop.isActive) throw new BadRequestException("This drop is not active.");
    const now = new Date();
    if (drop.startsAt && drop.startsAt > now)
      throw new BadRequestException("This drop hasn't started yet.");
    if (drop.endsAt && drop.endsAt < now)
      throw new BadRequestException("This drop has ended.");
    if (drop.maxWinners !== null && drop.winnersCount >= drop.maxWinners)
      throw new BadRequestException("All prizes claimed for this drop.");

    // Enforce daily limit and "one outstanding voucher" rule.
    const today = this.startOfDayIST(new Date());
    const playsToday = await this.prisma.gamePlay.count({
      where: {
        customerId,
        gameType: "product_drop",
        createdAt: { gte: today },
        metadata: { path: ["configId"], equals: drop.id } as any,
      },
    });
    if (playsToday >= drop.dailyLimit)
      throw new BadRequestException("You've already tried this drop today — come back tomorrow.");

    const existingWin = await this.prisma.rewardInstance.findFirst({
      where: {
        customerId,
        source: "product_drop",
        status: { in: ["pending", "applied"] },
        value: { startsWith: `${drop.productId}:` },
      },
    });
    if (existingWin)
      throw new BadRequestException("You already won this drop — check your rewards.");

    // Roll.
    const roll = Math.random() * 100;
    const won = roll < Number(drop.winOddsPct);

    if (!won) {
      await this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "product_drop",
          rewardType: "miss",
          rewardValue: "",
          rewardLabel: `No win — ${drop.product.title}`,
          metadata: {
            configId: drop.id,
            productId: drop.productId,
            won: false,
            winOddsPct: Number(drop.winOddsPct),
          } as any,
        },
      });
      return {
        won: false,
        message: "Not this time. Try again tomorrow!",
        product: { id: drop.product.id, title: drop.product.title },
      };
    }

    // Winner! Issue a free_product voucher + bump winners count + log play.
    const code = `DROP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + drop.claimWindowHours * 3_600_000);
    const [voucher] = await this.prisma.$transaction([
      this.prisma.rewardInstance.create({
        data: {
          customerId,
          type: "free_product",
          // Encoded value: productId:shippingInr → parsed by cart to override price.
          value: `${drop.productId}:${drop.shippingInr}`,
          label: `${drop.product.title} — pay only ₹${drop.shippingInr} shipping`,
          source: "product_drop",
          code,
          expiresAt,
          status: "pending",
        },
      }),
      this.prisma.productDropConfig.update({
        where: { id: drop.id },
        data: { winnersCount: { increment: 1 } },
      }),
      this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "product_drop",
          rewardType: "free_product",
          rewardValue: `${drop.productId}:${drop.shippingInr}`,
          rewardLabel: `🎁 Won ${drop.product.title}`,
          metadata: {
            configId: drop.id,
            productId: drop.productId,
            won: true,
            winOddsPct: Number(drop.winOddsPct),
            shippingInr: drop.shippingInr,
            voucherCode: code,
          } as any,
        },
      }),
    ]);

    return {
      won: true,
      message: `🎉 You won the ${drop.product.title}!`,
      product: { id: drop.product.id, title: drop.product.title },
      voucher: {
        code: voucher.code,
        shippingInr: drop.shippingInr,
        expiresAt: voucher.expiresAt,
      },
    };
  }

  // ── Admin — Product Drop CRUD ──────────────────────────────────────────
  async adminListProductDrops() {
    return this.prisma.productDropConfig.findMany({
      orderBy: { createdAt: "desc" },
      include: { product: { select: { id: true, title: true, slug: true, images: true, basePrice: true } } },
    });
  }

  async adminCreateProductDrop(input: {
    productId: string;
    shippingInr: number;
    gameMode?: "drop" | "guess_price" | "daily_deal" | "product_wheel";
    modeConfig?: Record<string, unknown> | null;
    winOddsPct?: number;
    dailyLimit?: number;
    maxWinners?: number | null;
    claimWindowHours?: number;
    startsAt?: Date | null;
    endsAt?: Date | null;
    title?: string;
    subtitle?: string;
    bannerImage?: string;
    isActive?: boolean;
  }) {
    // Sanity-check the product exists (FK would fail otherwise with a worse error).
    const exists = await this.prisma.product.findUnique({ where: { id: input.productId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Product not found");
    return this.prisma.productDropConfig.create({
      data: {
        productId: input.productId,
        shippingInr: input.shippingInr,
        gameMode: input.gameMode ?? "drop",
        modeConfig: (input.modeConfig ?? null) as any,
        winOddsPct: input.winOddsPct ?? 1.0,
        dailyLimit: input.dailyLimit ?? 1,
        maxWinners: input.maxWinners ?? null,
        claimWindowHours: input.claimWindowHours ?? 72,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        title: input.title ?? null,
        subtitle: input.subtitle ?? null,
        bannerImage: input.bannerImage ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async adminUpdateProductDrop(id: string, input: Partial<{
    shippingInr: number;
    gameMode: "drop" | "guess_price" | "daily_deal" | "product_wheel";
    modeConfig: Record<string, unknown> | null;
    winOddsPct: number;
    dailyLimit: number;
    maxWinners: number | null;
    claimWindowHours: number;
    startsAt: Date | null;
    endsAt: Date | null;
    title: string | null;
    subtitle: string | null;
    bannerImage: string | null;
    isActive: boolean;
  }>) {
    const existing = await this.prisma.productDropConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Drop not found");
    return this.prisma.productDropConfig.update({
      where: { id },
      data: {
        ...(input.shippingInr      !== undefined ? { shippingInr: input.shippingInr } : {}),
        ...(input.gameMode         !== undefined ? { gameMode: input.gameMode } : {}),
        ...(input.modeConfig       !== undefined ? { modeConfig: input.modeConfig as any } : {}),
        ...(input.winOddsPct       !== undefined ? { winOddsPct: input.winOddsPct } : {}),
        ...(input.dailyLimit       !== undefined ? { dailyLimit: input.dailyLimit } : {}),
        ...(input.maxWinners       !== undefined ? { maxWinners: input.maxWinners } : {}),
        ...(input.claimWindowHours !== undefined ? { claimWindowHours: input.claimWindowHours } : {}),
        ...(input.startsAt         !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt           !== undefined ? { endsAt:   input.endsAt } : {}),
        ...(input.title            !== undefined ? { title: input.title } : {}),
        ...(input.subtitle         !== undefined ? { subtitle: input.subtitle } : {}),
        ...(input.bannerImage      !== undefined ? { bannerImage: input.bannerImage } : {}),
        ...(input.isActive         !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  async adminDeleteProductDrop(id: string) {
    const existing = await this.prisma.productDropConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Drop not found");
    await this.prisma.productDropConfig.delete({ where: { id } });
    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Deploy 121 — Product game modes (guess price / daily deal / product wheel)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // These reuse the same ProductDropConfig + RewardInstance plumbing as the
  // base "drop" game. The only differences are (1) the win condition and
  // (2) the front-end UX. All three still end in a free_product voucher
  // the customer claims via claimProductDrop.

  /** Issue the free_product voucher + log the win + bump winnersCount. */
  private async issueProductDropVoucher(params: {
    customerId: string;
    drop: { id: string; productId: string; shippingInr: number; claimWindowHours: number };
    productTitle: string;
    gameMode: string;
    metadata: Record<string, unknown>;
  }) {
    const { customerId, drop, productTitle, gameMode, metadata } = params;
    const code = `DROP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + drop.claimWindowHours * 3_600_000);
    const [voucher] = await this.prisma.$transaction([
      this.prisma.rewardInstance.create({
        data: {
          customerId,
          type: "free_product",
          value: `${drop.productId}:${drop.shippingInr}`,
          label: `${productTitle} — pay only ₹${drop.shippingInr} shipping`,
          source: "product_drop",
          code,
          expiresAt,
          status: "pending",
        },
      }),
      this.prisma.productDropConfig.update({
        where: { id: drop.id },
        data: { winnersCount: { increment: 1 } },
      }),
      this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "product_drop",
          rewardType: "free_product",
          rewardValue: `${drop.productId}:${drop.shippingInr}`,
          rewardLabel: `🎁 Won ${productTitle} (${gameMode})`,
          metadata: { ...metadata, gameMode, voucherCode: code } as any,
        },
      }),
    ]);
    return voucher;
  }

  /** Common pre-flight guards shared by every product-game mode. */
  private async assertCanPlayProductGame(customerId: string, dropId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { isFrozen: true, frozenReason: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    if (customer.isFrozen)
      throw new BadRequestException(customer.frozenReason ?? "Account is frozen.");
    const drop = await this.prisma.productDropConfig.findUnique({
      where: { id: dropId },
      include: { product: { select: { id: true, title: true, basePrice: true } } },
    });
    if (!drop) throw new NotFoundException("Drop not found");
    if (!drop.isActive) throw new BadRequestException("This drop is not active.");
    const now = new Date();
    if (drop.startsAt && drop.startsAt > now)
      throw new BadRequestException("This drop hasn't started yet.");
    if (drop.endsAt && drop.endsAt < now)
      throw new BadRequestException("This drop has ended.");
    if (drop.maxWinners !== null && drop.winnersCount >= drop.maxWinners)
      throw new BadRequestException("All prizes claimed for this drop.");
    const today = this.startOfDayIST(new Date());
    const playsToday = await this.prisma.gamePlay.count({
      where: {
        customerId,
        gameType: "product_drop",
        createdAt: { gte: today },
        metadata: { path: ["configId"], equals: drop.id } as any,
      },
    });
    if (playsToday >= drop.dailyLimit)
      throw new BadRequestException("You've already tried this today — come back tomorrow.");

    const existingWin = await this.prisma.rewardInstance.findFirst({
      where: {
        customerId,
        source: "product_drop",
        status: { in: ["pending", "applied"] },
        value: { startsWith: `${drop.productId}:` },
      },
    });
    if (existingWin)
      throw new BadRequestException("You already won this drop — check your rewards.");

    return drop;
  }

  /**
   * Guess the Price — admin sets a tolerance (% deviation from base price).
   * If the customer's guess lies within ±tolerance of the product's base
   * price they win. Example: basePrice ₹999 + tolerance 10% → they win
   * whenever 899 ≤ guess ≤ 1099. Keeps people playing — near-misses are
   * close enough to make a next-day attempt feel winnable.
   */
  async playGuessPrice(customerId: string, dropId: string, guessInr: number) {
    if (!Number.isFinite(guessInr) || guessInr <= 0)
      throw new BadRequestException("Enter a positive guess");
    const drop = await this.assertCanPlayProductGame(customerId, dropId);
    if (drop.gameMode !== "guess_price")
      throw new BadRequestException("This drop isn't a Guess-the-Price game.");

    const cfg = (drop.modeConfig as any) ?? {};
    const tolerancePct = Math.max(0, Math.min(50, Number(cfg.tolerancePct ?? 10)));
    const basePrice = Number(drop.product.basePrice);
    const band = (basePrice * tolerancePct) / 100;
    const low  = basePrice - band;
    const high = basePrice + band;
    const won  = guessInr >= low && guessInr <= high;

    if (!won) {
      await this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "product_drop",
          rewardType: "miss",
          rewardValue: "",
          rewardLabel: `Guess miss — ${drop.product.title}`,
          metadata: {
            configId: drop.id,
            productId: drop.productId,
            gameMode: "guess_price",
            guessInr,
            basePrice,
            tolerancePct,
            won: false,
          } as any,
        },
      });
      // Give a helpful "hotter/colder" hint.
      const delta = guessInr - basePrice;
      const hint = delta > 0 ? "too high" : delta < 0 ? "too low" : "exact tie? try again";
      return {
        won: false,
        hint,
        message: `${hint} — not quite. Come back tomorrow!`,
        product: { id: drop.product.id, title: drop.product.title },
      };
    }

    const voucher = await this.issueProductDropVoucher({
      customerId,
      drop: { id: drop.id, productId: drop.productId, shippingInr: drop.shippingInr, claimWindowHours: drop.claimWindowHours },
      productTitle: drop.product.title,
      gameMode: "guess_price",
      metadata: {
        configId: drop.id,
        productId: drop.productId,
        guessInr,
        basePrice,
        tolerancePct,
        won: true,
      },
    });
    return {
      won: true,
      message: `🎯 Spot on! You guessed within ${tolerancePct}% of ₹${basePrice.toFixed(0)}.`,
      product: { id: drop.product.id, title: drop.product.title },
      voucher: { code: voucher.code, shippingInr: drop.shippingInr, expiresAt: voucher.expiresAt },
    };
  }

  /**
   * Daily Deal — no lottery. Everyone who plays today gets the product at
   * the shipping-only price, once per day. Creates a scarcity vibe via the
   * UI ("Today's deal: ...") plus the existing maxWinners cap. First come,
   * first served via the same winnersCount counter.
   */
  async playDailyDeal(customerId: string, dropId: string) {
    const drop = await this.assertCanPlayProductGame(customerId, dropId);
    if (drop.gameMode !== "daily_deal")
      throw new BadRequestException("This drop isn't a Daily Deal game.");
    // Guaranteed win — issue the voucher.
    const voucher = await this.issueProductDropVoucher({
      customerId,
      drop: { id: drop.id, productId: drop.productId, shippingInr: drop.shippingInr, claimWindowHours: drop.claimWindowHours },
      productTitle: drop.product.title,
      gameMode: "daily_deal",
      metadata: {
        configId: drop.id,
        productId: drop.productId,
        won: true,
      },
    });
    return {
      won: true,
      message: `💥 Today's deal unlocked: ${drop.product.title}`,
      product: { id: drop.product.id, title: drop.product.title },
      voucher: { code: voucher.code, shippingInr: drop.shippingInr, expiresAt: voucher.expiresAt },
    };
  }

  /**
   * Product Wheel — N slices, each referencing a product + shipping price
   * + weight. Server picks a slice and issues that product's voucher. Admin
   * stores slices in modeConfig.slices: [{ productId, shippingInr, weight, label? }].
   * The "winning" product may be DIFFERENT from the drop's own productId
   * (which acts as the primary / fallback slice). No-win slices are
   * allowed by including a slice with productId = "".
   */
  async spinProductWheel(customerId: string, dropId: string) {
    const drop = await this.assertCanPlayProductGame(customerId, dropId);
    if (drop.gameMode !== "product_wheel")
      throw new BadRequestException("This drop isn't a Product Wheel game.");

    const cfg = (drop.modeConfig as any) ?? {};
    const slices: { productId: string; shippingInr: number; weight: number; label?: string }[] =
      Array.isArray(cfg.slices) && cfg.slices.length > 0 ? cfg.slices : [];
    if (slices.length === 0)
      throw new BadRequestException("This wheel hasn't been configured yet.");

    const total = slices.reduce((s, x) => s + (x.weight || 0), 0);
    if (total <= 0) throw new BadRequestException("Wheel slices have no weight.");
    let r = Math.random() * total;
    let chosen = slices[0]!;
    let chosenIdx = 0;
    for (let i = 0; i < slices.length; i++) {
      r -= slices[i]!.weight;
      if (r <= 0) { chosen = slices[i]!; chosenIdx = i; break; }
    }

    // No-win slice: empty productId = miss.
    if (!chosen.productId) {
      await this.prisma.gamePlay.create({
        data: {
          customerId,
          gameType: "product_drop",
          rewardType: "miss",
          rewardValue: "",
          rewardLabel: `Wheel miss — ${chosen.label ?? "no luck"}`,
          metadata: {
            configId: drop.id,
            gameMode: "product_wheel",
            sliceIdx: chosenIdx,
            won: false,
          } as any,
        },
      });
      return {
        won: false,
        sliceIdx: chosenIdx,
        message: chosen.label ?? "Spin again tomorrow!",
      };
    }

    // Winning slice — look up the target product.
    const product = await this.prisma.product.findUnique({
      where: { id: chosen.productId },
      select: { id: true, title: true },
    });
    if (!product) throw new BadRequestException("Wheel is misconfigured — product missing.");

    // Issue the voucher against the chosen slice's product + shipping.
    // We reuse the same helper but point it at the slice's product, not the
    // drop's primary product, so the cart integration still works correctly.
    const voucher = await this.issueProductDropVoucher({
      customerId,
      drop: { id: drop.id, productId: product.id, shippingInr: chosen.shippingInr, claimWindowHours: drop.claimWindowHours },
      productTitle: product.title,
      gameMode: "product_wheel",
      metadata: {
        configId: drop.id,
        productId: product.id,
        sliceIdx: chosenIdx,
        won: true,
      },
    });
    return {
      won: true,
      sliceIdx: chosenIdx,
      message: `🎡 The wheel landed on ${product.title}!`,
      product: { id: product.id, title: product.title },
      voucher: { code: voucher.code, shippingInr: chosen.shippingInr, expiresAt: voucher.expiresAt },
    };
  }

  /**
   * Claim a product-drop voucher — places a single-item COD order at the
   * shipping-only price, marks the voucher `used`, links it to the order.
   * Intentionally bypasses cart/checkout because the experience is "you won
   * this product, here's your address, done" — no upsell, no discount
   * stacking.
   */
  async claimProductDrop(
    customerId: string,
    code: string,
    input: {
      shippingAddress: Record<string, unknown>;
      phone?: string;
    },
  ) {
    const voucher = await this.prisma.rewardInstance.findUnique({ where: { code } });
    if (!voucher) throw new NotFoundException("Voucher not found");
    if (voucher.customerId !== customerId) throw new NotFoundException("Voucher not found");
    if (voucher.type !== "free_product" || voucher.source !== "product_drop")
      throw new BadRequestException("This voucher isn't a product drop.");
    if (voucher.status === "used")
      throw new BadRequestException("This voucher has already been redeemed.");
    if (voucher.expiresAt && voucher.expiresAt < new Date())
      throw new BadRequestException("This voucher has expired.");

    // value format: "productId:shippingInr"
    const [productId, shippingStr] = voucher.value.split(":");
    const shippingInr = parseInt(shippingStr ?? "0", 10);
    if (!productId || !Number.isFinite(shippingInr))
      throw new BadRequestException("Voucher is malformed.");

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true, slug: true, title: true, basePrice: true, currency: true, images: true,
      },
    });
    if (!product) throw new NotFoundException("Product no longer exists.");

    const orderNumber = "DROP-" + Date.now().toString(36).toUpperCase();
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          channel: "b2c",
          customerId,
          // Shipping IS the full cost — no separate shipping charge, no GST.
          subtotal: shippingInr as any,
          discountTotal: 0 as any,
          shippingTotal: 0 as any,
          taxTotal: 0 as any,
          grandTotal: shippingInr as any,
          paymentMethod: "cod",
          paymentStatus: "pending",
          shippingAddress: input.shippingAddress as any,
          billingAddress:  input.shippingAddress as any,
          notes: `Product Drop win — voucher ${voucher.code}`,
          metadata: {
            source: "product_drop",
            voucherCode: voucher.code,
            productId: product.id,
            shippingInr,
          } as any,
          items: {
            create: [
              {
                productId: product.id,
                qty: 1,
                unitPrice: shippingInr as any,
                totalPrice: shippingInr as any,
                snapshot: {
                  id: product.id,
                  slug: product.slug,
                  title: product.title,
                  basePrice: product.basePrice.toString(),
                  // Flag on snapshot — surfaces in admin order view + customer receipt.
                  wonViaProductDrop: true,
                  originalShippingInr: shippingInr,
                } as any,
              },
            ],
          },
        },
        include: { items: true },
      });

      await tx.rewardInstance.update({
        where: { id: voucher.id },
        data: { status: "used", usedOrderId: created.id },
      });

      return created;
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      grandTotal: Number(order.grandTotal),
      product: { id: product.id, slug: product.slug, title: product.title },
    };
  }

  /**
   * Recent public winners feed — used by the mobile Play screen and the web
   * games hub for social proof. Returns the N most-recent non-miss plays
   * across all games. Customer names are privacy-truncated to "FirstName L."
   * so the feed is shareable without leaking full identities.
   *
   * Public endpoint — no auth required. Safe to cache at CDN for 30s.
   */
  async getRecentWinners(limit = 10) {
    const take = Math.min(Math.max(limit, 1), 50);

    const plays = await this.prisma.gamePlay.findMany({
      where: {
        // Anything that wasn't an outright miss counts as a "win" in the feed.
        // This catches goin wins, discount wins, free gifts, product drops etc.
        rewardType: { not: "miss" as any },
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        gameType: true,
        rewardType: true,
        rewardValue: true,
        rewardLabel: true,
        createdAt: true,
        customer: {
          select: {
            fullName: true,
            phone: true,
          },
        },
      },
    });

    return plays.map((p) => ({
      id: p.id,
      name: this.shortName(p.customer?.fullName, p.customer?.phone),
      prize: this.prizeLabel(p.rewardType, p.rewardValue, p.rewardLabel),
      gameType: p.gameType,
      rewardType: p.rewardType,
      at: p.createdAt.toISOString(),
      ago: this.agoMinutes(p.createdAt),
    }));
  }

  /** "Priya Sharma" → "Priya S.". Falls back to "Gifter • last 4 digits" if only phone. */
  private shortName(fullName?: string | null, phone?: string | null): string {
    if (fullName && fullName.trim().length > 0) {
      const parts = fullName.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return "A Gifter";
      if (parts.length === 1) return parts[0] as string;
      const first = parts[0] as string;
      const last  = parts[parts.length - 1] as string;
      return `${first} ${last.charAt(0).toUpperCase()}.`;
    }
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      const last4  = digits.slice(-4);
      return `Gifter •${last4}`;
    }
    return "A Gifter";
  }

  /** Produces a human-friendly prize label if `rewardLabel` is missing. */
  private prizeLabel(
    rewardType: string,
    rewardValue: string | null,
    rewardLabel: string | null,
  ): string {
    if (rewardLabel && rewardLabel.trim().length > 0) return rewardLabel;
    const v = rewardValue ?? "";
    switch (rewardType) {
      case "goins":          return `${v} Goins`;
      case "discount_pct":   return `${v}% off`;
      case "discount_flat":  return `₹${v} off`;
      case "free_shipping":  return "Free shipping";
      case "free_gift_wrap": return "Free gift wrap";
      case "free_product":   return "Free product";
      default:               return "A nice reward";
    }
  }

  private agoMinutes(d: Date): number {
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// Flash Jackpot — one winner per hour (IST).
// Strategy: when any authenticated user calls /api/flash-jackpot/roll,
// we check if this hour already has a winner. If not, we roll with a
// configured probability (default 1 in 5 — so ~1 in 5 hour-buckets produces
// a winner overall; but we commit on first successful roll so subsequent
// visitors in that hour see the locked winner).
// This keeps it simple without needing a background cron.

const WIN_PROBABILITY_PCT = 40; // 40% chance per unique hour that a winner is picked
const FLASH_REWARDS = [
  { type: "discount_pct",  value: "15", label: "15% off — Flash Jackpot",  weight: 30 },
  { type: "discount_pct",  value: "25", label: "25% off — Flash Jackpot",  weight: 20 },
  { type: "discount_flat", value: "100", label: "₹100 off — Flash Jackpot", weight: 25 },
  { type: "discount_flat", value: "250", label: "₹250 off — Flash Jackpot", weight: 15 },
  { type: "free_shipping", value: "1",   label: "Free shipping — Flash Jackpot", weight: 10 },
];

@Injectable()
export class FlashJackpotService {
  constructor(private prisma: PrismaService) {}

  /** Current hour bucket (IST) — "YYYY-MM-DD-HH" */
  private hourBucket(d: Date = new Date()): string {
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const y  = ist.getUTCFullYear();
    const m  = String(ist.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ist.getUTCDate()).padStart(2, "0");
    const h  = String(ist.getUTCHours()).padStart(2, "0");
    return `${y}-${m}-${dd}-${h}`;
  }

  /** Get latest 5 winners (for the live feed) */
  async getLatestWinners(limit = 5) {
    const rows = await this.prisma.flashJackpotWinner.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { customer: { select: { fullName: true, phone: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      name: this.obfuscateName(r.customer.fullName, r.customer.phone),
      rewardLabel: r.rewardLabel,
      createdAt: r.createdAt,
    }));
  }

  /** Check current hour state */
  async getCurrentState(customerId: string | null) {
    const hb = this.hourBucket();
    const existing = await this.prisma.flashJackpotWinner.findUnique({
      where: { hourBucket: hb },
      include: { customer: { select: { fullName: true, phone: true } } },
    });
    const hasWinner = !!existing;
    const isMe = !!(existing && customerId && existing.customerId === customerId);
    return {
      hourBucket: hb,
      hasWinner,
      isMe,
      winner: existing
        ? {
            name: this.obfuscateName(existing.customer.fullName, existing.customer.phone),
            rewardLabel: existing.rewardLabel,
          }
        : null,
    };
  }

  /**
   * Roll for flash jackpot. Called on explicit user action (tap "Try Flash").
   * Returns either a win, or "not this hour".
   */
  async roll(customerId: string) {
    const hb = this.hourBucket();

    // Atomic check: does a winner exist already for this hour?
    const existing = await this.prisma.flashJackpotWinner.findUnique({
      where: { hourBucket: hb },
    });
    if (existing) {
      const isMe = existing.customerId === customerId;
      return {
        won: false,
        alreadyWinner: true,
        isMe,
        message: isMe
          ? "You are this hour's Flash Jackpot winner!"
          : "This hour already has a winner — try next hour!",
      };
    }

    // Roll the dice
    if (Math.random() * 100 > WIN_PROBABILITY_PCT) {
      return {
        won: false,
        alreadyWinner: false,
        message: "Not this hour — try again in a bit!",
      };
    }

    // Winner! Pick a reward from the pool
    const reward = this.pickWeighted(FLASH_REWARDS);
    const code = `FLSH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Try to create winner row — unique constraint on hourBucket prevents races
        const ri = await tx.rewardInstance.create({
          data: {
            customerId,
            type: reward.type as any,
            value: reward.value,
            label: reward.label,
            source: "jackpot",
            code,
            minCartInr: reward.type === "discount_flat" ? Math.max(300, parseInt(reward.value)) : 500,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h only!
          },
        });
        await tx.flashJackpotWinner.create({
          data: {
            customerId,
            rewardType: reward.type as any,
            rewardValue: reward.value,
            rewardLabel: reward.label,
            rewardId: ri.id,
            hourBucket: hb,
          },
        });
        return { rewardCode: code, rewardLabel: reward.label };
      });

      return {
        won: true,
        alreadyWinner: false,
        rewardCode: result.rewardCode,
        rewardLabel: result.rewardLabel,
        message: `🎉 Flash Jackpot! You won ${reward.label}!`,
      };
    } catch (e: any) {
      // Unique constraint race — someone else just won
      return {
        won: false,
        alreadyWinner: true,
        message: "Another player just won this hour — better luck next!",
      };
    }
  }

  private pickWeighted<T extends { weight: number }>(pool: T[]): T {
    const total = pool.reduce((a, p) => a + p.weight, 0);
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.weight;
      if (r <= 0) return p;
    }
    return pool[pool.length - 1]!;
  }

  private obfuscateName(fullName: string | null, phone: string | null): string {
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      const first = parts[0] ?? "";
      const lastInitial = parts[1]?.[0] ?? "";
      return `${first} ${lastInitial}${lastInitial ? "." : ""}`.trim();
    }
    if (phone) return `+91 ${phone.slice(-5, -3)}${"*".repeat(5)}`;
    return "A gifteer";
  }
}

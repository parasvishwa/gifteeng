import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

const DEFAULT_ID = "default";

function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export interface InactivityConfigInput {
  enabled?:             boolean;
  minGoins?:            number;
  maxGoins?:            number;
  minInactiveDays?:     number;
  cooldownDays?:        number;
  maxLifetimePerUser?:  number;
  dailyDropRate?:       number;
  pushTitleTemplate?:   string;
  pushBodyTemplate?:    string;
  ctaUrl?:              string;
}

@Injectable()
export class InactivityRewardsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── Config ────────────────────────────────────────────────────────────────

  async getConfig() {
    const cfg = await this.prisma.inactivityRewardConfig.findUnique({
      where: { id: DEFAULT_ID },
    });
    if (cfg) return cfg;
    // Auto-seed if migration didn't insert (defensive — migration does seed).
    return this.prisma.inactivityRewardConfig.create({
      data: { id: DEFAULT_ID },
    });
  }

  async updateConfig(input: InactivityConfigInput) {
    // Sanitise ranges so a typo doesn't drain the wallet.
    const data: InactivityConfigInput = { ...input };
    if (data.minGoins !== undefined) data.minGoins = Math.max(1, Math.min(10_000, data.minGoins));
    if (data.maxGoins !== undefined) data.maxGoins = Math.max(1, Math.min(10_000, data.maxGoins));
    if (data.minInactiveDays    !== undefined) data.minInactiveDays    = Math.max(1, Math.min(365, data.minInactiveDays));
    if (data.cooldownDays       !== undefined) data.cooldownDays       = Math.max(1, Math.min(365, data.cooldownDays));
    if (data.maxLifetimePerUser !== undefined) data.maxLifetimePerUser = Math.max(0, Math.min(100, data.maxLifetimePerUser));
    if (data.dailyDropRate      !== undefined) data.dailyDropRate      = Math.max(0, Math.min(100, data.dailyDropRate));

    return this.prisma.inactivityRewardConfig.upsert({
      where:  { id: DEFAULT_ID },
      create: { id: DEFAULT_ID, ...data },
      update: data,
    });
  }

  // ── Stats / log ───────────────────────────────────────────────────────────

  async getStats() {
    const [totalAwards, last24h, last7d, totalGoinsAwarded] = await Promise.all([
      this.prisma.inactivityRewardSent.count(),
      this.prisma.inactivityRewardSent.count({
        where: { sentAt: { gte: new Date(Date.now() - 86_400_000) } },
      }),
      this.prisma.inactivityRewardSent.count({
        where: { sentAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      }),
      this.prisma.inactivityRewardSent.aggregate({
        _sum: { amount: true },
      }),
    ]);
    return {
      totalAwards,
      last24h,
      last7d,
      totalGoinsAwarded: totalGoinsAwarded._sum.amount ?? 0,
    };
  }

  async getRecentSends(limit = 50) {
    const rows = await this.prisma.inactivityRewardSent.findMany({
      orderBy: { sentAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
    });
    if (rows.length === 0) return [];
    const customerIds = Array.from(new Set(rows.map((r) => r.customerId)));
    const customers = await this.prisma.customer.findMany({
      where:  { id: { in: customerIds } },
      select: { id: true, fullName: true, phone: true, email: true },
    });
    const m = new Map(customers.map((c) => [c.id, c]));
    return rows.map((r) => ({
      ...r,
      customer: m.get(r.customerId) ?? null,
    }));
  }

  // ── Cron entrypoint ───────────────────────────────────────────────────────

  /**
   * For every customer who's been inactive ≥ minInactiveDays AND hasn't been
   * rewarded within cooldownDays AND hasn't hit maxLifetimePerUser, decide
   * (with `dailyDropRate` % chance) whether to drop a random reward today.
   *
   * Awards are atomic (transaction): coin balance increment + CoinTransaction
   * row + InactivityRewardSent row + push notification dispatch.
   *
   * Hook to a daily cron at e.g. 10:30 IST (good engagement time).
   */
  async runDrops(): Promise<{
    ok: true;
    enabled: boolean;
    eligible: number;
    awarded: number;
    skipped: number;
    totalGoinsAwarded: number;
  }> {
    const cfg = await this.getConfig();
    if (!cfg.enabled) {
      return { ok: true, enabled: false, eligible: 0, awarded: 0, skipped: 0, totalGoinsAwarded: 0 };
    }

    const now           = Date.now();
    const inactiveCutoff = new Date(now - cfg.minInactiveDays * 86_400_000);
    const cooldownCutoff = new Date(now - cfg.cooldownDays    * 86_400_000);

    // Step 1: customers inactive for ≥ minInactiveDays.
    // We use lastLoginAt; customers with null lastLoginAt are treated as
    // "never logged in" — skip them (their createdAt could be hours ago).
    const inactives = await this.prisma.customer.findMany({
      where: {
        lastLoginAt: { lte: inactiveCutoff, not: null },
        isFrozen:    false,
      },
      select: { id: true, fullName: true, lastLoginAt: true },
      take: 5000, // sanity cap; large stores can run multiple batches
    });

    if (inactives.length === 0) {
      return { ok: true, enabled: true, eligible: 0, awarded: 0, skipped: 0, totalGoinsAwarded: 0 };
    }

    // Step 2: filter out cooldown + lifetime cap in one bulk query
    const sentLookup = await this.prisma.inactivityRewardSent.groupBy({
      by: ["customerId"],
      where: { customerId: { in: inactives.map((c) => c.id) } },
      _count: { _all: true },
      _max:   { sentAt: true },
    });
    const sentMap = new Map(sentLookup.map((s) => [s.customerId, s]));

    const eligible = inactives.filter((c) => {
      const s = sentMap.get(c.id);
      if (!s) return true; // never rewarded — eligible
      if ((s._count._all) >= cfg.maxLifetimePerUser) return false;          // lifetime cap
      if (s._max.sentAt && s._max.sentAt > cooldownCutoff) return false;    // still in cooldown
      return true;
    });

    // Step 3: probabilistic daily drop. Each eligible user has dailyDropRate%
    // chance of being awarded today. This staggers drops naturally over days
    // and keeps "random" feel from the customer side.
    let awarded = 0;
    let totalGoinsAwarded = 0;
    let skipped = 0;
    const rate = Math.max(0, Math.min(100, cfg.dailyDropRate)) / 100;

    for (const c of eligible) {
      if (Math.random() >= rate) { skipped++; continue; }

      const amount = Math.floor(Math.random() * (cfg.maxGoins - cfg.minGoins + 1)) + cfg.minGoins;
      const inactiveDays = c.lastLoginAt
        ? Math.floor((now - c.lastLoginAt.getTime()) / 86_400_000)
        : cfg.minInactiveDays;

      try {
        // Atomic: balance + transaction log + sent log
        await this.prisma.$transaction(async (tx) => {
          await tx.customer.update({
            where: { id: c.id },
            data:  { coinBalance: { increment: amount } },
          });
          await tx.coinTransaction.create({
            data: {
              customerId:  c.id,
              amount,
              type:        "admin_grant",
              description: `Inactivity reward — ${amount} Goins`,
            },
          });
          await tx.inactivityRewardSent.create({
            data: {
              customerId:   c.id,
              amount,
              inactiveDays,
            },
          });
        });

        // Step 4: push notification (out of transaction — push failures
        // shouldn't roll back the credit).
        const firstName = c.fullName?.split(" ")[0] ?? "there";
        const title = renderTemplate(cfg.pushTitleTemplate, { firstName, amount });
        const body  = renderTemplate(cfg.pushBodyTemplate,  { firstName, amount });
        try {
          const res = await this.notifications.sendToCustomer(c.id, {
            title, body,
            data: {
              kind:   "inactivity_reward",
              amount: String(amount),
              ctaUrl: cfg.ctaUrl,
            },
          });
          if (res.sent > 0) {
            await this.prisma.inactivityRewardSent.updateMany({
              where: { customerId: c.id, amount, sentAt: { gte: new Date(Date.now() - 60_000) } },
              data:  { pushSent: true },
            });
          }
        } catch { /* push failure is non-fatal */ }

        awarded++;
        totalGoinsAwarded += amount;
      } catch {
        skipped++;
      }
    }

    return {
      ok: true,
      enabled: true,
      eligible: eligible.length,
      awarded,
      skipped,
      totalGoinsAwarded,
    };
  }

  // ── Manual test send (admin "send to me" preview) ─────────────────────────

  async sendTestTo(customerId: string) {
    const cfg = await this.getConfig();
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { fullName: true },
    });
    const amount = Math.floor((cfg.minGoins + cfg.maxGoins) / 2);
    const firstName = customer?.fullName?.split(" ")[0] ?? "there";
    const title = renderTemplate(cfg.pushTitleTemplate, { firstName, amount });
    const body  = renderTemplate(cfg.pushBodyTemplate,  { firstName, amount });

    const res = await this.notifications.sendToCustomer(customerId, {
      title, body,
      data: {
        kind:    "inactivity_reward_test",
        amount:  String(amount),
        ctaUrl:  cfg.ctaUrl,
      },
    });
    return { ok: true, sent: res.sent, failed: res.failed, title, body };
  }
}

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

export interface MilestoneConfigInput {
  webEnabled?: boolean; webEvery?: number; webGoins?: number;
  webTitle?:   string;  webBody?:  string;
  appEnabled?: boolean; appEvery?: number; appGoins?: number;
  appTitle?:   string;  appBody?:  string;
  ctaUrl?:     string;
}

export type MilestoneKind = "web" | "app";

@Injectable()
export class MilestoneRewardsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── Config ────────────────────────────────────────────────────────────────

  async getConfig() {
    const cfg = await this.prisma.milestoneRewardConfig.findUnique({
      where: { id: DEFAULT_ID },
    });
    if (cfg) return cfg;
    return this.prisma.milestoneRewardConfig.create({ data: { id: DEFAULT_ID } });
  }

  async updateConfig(data: MilestoneConfigInput) {
    const sanitised: MilestoneConfigInput = { ...data };
    for (const k of ["webEvery", "webGoins", "appEvery", "appGoins"] as const) {
      const v = sanitised[k];
      if (v !== undefined) {
        // Reasonable ranges so a typo doesn't ruin things.
        sanitised[k] = Math.max(1, Math.min(k.endsWith("Goins") ? 100_000 : 100_000, v as number));
      }
    }
    return this.prisma.milestoneRewardConfig.upsert({
      where:  { id: DEFAULT_ID },
      create: { id: DEFAULT_ID, ...sanitised },
      update: sanitised,
    });
  }

  async getStats() {
    const [totalWeb, totalApp, last24h, totalGoinsAwarded] = await Promise.all([
      this.prisma.milestoneRewardSent.count({ where: { kind: "web" } }),
      this.prisma.milestoneRewardSent.count({ where: { kind: "app" } }),
      this.prisma.milestoneRewardSent.count({
        where: { sentAt: { gte: new Date(Date.now() - 86_400_000) } },
      }),
      this.prisma.milestoneRewardSent.aggregate({ _sum: { amount: true } }),
    ]);
    return {
      totalWeb, totalApp, last24h,
      totalGoinsAwarded: totalGoinsAwarded._sum.amount ?? 0,
    };
  }

  async getRecent(limit = 50) {
    const rows = await this.prisma.milestoneRewardSent.findMany({
      orderBy: { sentAt: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
    });
    if (rows.length === 0) return [];
    const customerIds = Array.from(new Set(rows.map((r) => r.customerId)));
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, fullName: true, phone: true, email: true },
    });
    const m = new Map(customers.map((c) => [c.id, c]));
    return rows.map((r) => ({ ...r, customer: m.get(r.customerId) ?? null }));
  }

  // ── Trigger — called when a new customer signs up ────────────────────────

  /**
   * Atomically increments the platform counter and, if the new value is a
   * multiple of `every`, awards the configured Goins to this customer +
   * fires a celebratory push.
   *
   * Idempotent per signup — caller should only call this once per new
   * customer creation. Returns null if disabled or not a milestone hit.
   */
  async maybeAward(customerId: string, kind: MilestoneKind):
    Promise<{ awarded: true; position: number; amount: number } | null>
  {
    const cfg = await this.getConfig();
    const enabled = kind === "web" ? cfg.webEnabled : cfg.appEnabled;
    if (!enabled) return null;
    const every = kind === "web" ? cfg.webEvery : cfg.appEvery;
    const goins = kind === "web" ? cfg.webGoins : cfg.appGoins;
    if (every <= 0 || goins <= 0) return null;

    // Atomic increment via raw SQL — Prisma's update returns the new row but
    // doesn't give us the OLD value cleanly, and we need the post-increment
    // counter to compute "is this the Nth?".
    const counterField = kind === "web" ? "webCounter" : "appCounter";
    const bumped = await this.prisma.$queryRawUnsafe<Array<{ newVal: number }>>(
      `UPDATE "milestone_reward_config"
         SET "${counterField}" = "${counterField}" + 1,
             "updatedAt" = NOW()
         WHERE "id" = $1
         RETURNING "${counterField}" AS "newVal"`,
      DEFAULT_ID,
    );
    const newVal = bumped?.[0]?.newVal ?? 0;
    if (newVal === 0) return null; // shouldn't happen
    if (newVal % every !== 0) return null; // not a milestone hit

    // Hit! Award the customer.
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { fullName: true, isFrozen: true },
    });
    if (!customer || customer.isFrozen) return null;

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data:  {
          coinBalance: { increment: goins },
          // Mark the celebratory popup so on next app/web open we can show it.
          metadata: {
            milestoneClaim: {
              kind,
              position: newVal,
              amount:   goins,
              awardedAt: new Date().toISOString(),
              seen: false,
            },
          } as any,
        },
      });
      await tx.coinTransaction.create({
        data: {
          customerId,
          amount:      goins,
          type:        "admin_grant",
          description: `Milestone — ${kind}-signup #${newVal} · ${goins} Goins`,
        },
      });
      await tx.milestoneRewardSent.create({
        data: { customerId, kind, position: newVal, amount: goins },
      });
    });

    // Push (out of transaction — non-fatal on failure)
    try {
      const firstName = customer.fullName?.split(" ")[0] ?? "there";
      const titleTpl = kind === "web" ? cfg.webTitle : cfg.appTitle;
      const bodyTpl  = kind === "web" ? cfg.webBody  : cfg.appBody;
      const title = renderTemplate(titleTpl, { firstName, position: newVal, amount: goins });
      const body  = renderTemplate(bodyTpl,  { firstName, position: newVal, amount: goins });
      const res = await this.notifications.sendToCustomer(customerId, {
        title, body,
        data: {
          kind:     "milestone_reward",
          source:   kind,
          amount:   String(goins),
          position: String(newVal),
          ctaUrl:   cfg.ctaUrl,
        },
      });
      if (res.sent > 0) {
        await this.prisma.milestoneRewardSent.updateMany({
          where: { customerId, kind, position: newVal },
          data:  { pushSent: true },
        });
      }
    } catch { /* push failure ignored */ }

    return { awarded: true, position: newVal, amount: goins };
  }

  // ── Counter merge: existing customer logs in for first time on a NEW
  // platform. (Optional — only if you want platform-cross-attribution.)
  // For now, the trigger fires once per signup, never re-fires.
}

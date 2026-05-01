import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";

import { PrismaService } from "../../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * AI customer-intent targeting.
 *
 * Every 15 minutes (cron) we walk every customer who has page-view
 * activity in the last hour, summarise it, and ask the LLM to pick:
 *   • intent      — high_intent_buy | abandoned_cart | browsing |
 *                    returning_loyal | first_time_curious | dormant
 *   • confidence  — 0–1
 *   • action      — wait | nudge_whatsapp | nudge_push | offer_discount |
 *                    welcome_back | reorder_reminder
 *   • copy        — one-line outreach message in the customer's name
 *
 * The result is stored on Customer.metadata.aiIntent so the admin
 * Activity Feed and Customers page can show segments. If `action` is a
 * nudge, we queue a push notification (NotificationsService) — capped
 * at one nudge per customer per 24 hours so we never spam.
 *
 * The whole thing is gated on the AI key being configured. With no key
 * the service still records page-view summaries (without the LLM
 * classification), so the admin can see activity even before AI is on.
 */

interface IntentSnapshot {
  intent:     string;
  confidence: number;
  action:     string;
  copy:       string;
  evaluatedAt: string;
  evidence:   string[];   // 3-5 short bullets of what the AI saw
}

@Injectable()
export class AiTargetingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AiTargetingService.name);
  // 24-hour anti-spam memory of who we've already nudged.
  private readonly nudgedRecently = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  // 30-minute sweep — frequent enough to feel "live", cheap on AI quota.
  private readonly intervalMs = 30 * 60 * 1000;

  constructor(
    private readonly prisma:        PrismaService,
    private readonly ai:            AiService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Lifecycle: schedule the sweep ────────────────────────────────────

  onModuleInit() {
    // Singleton-cron guard: when the API runs as multiple workers under
    // Node cluster, only the FIRST worker (id=1) schedules background
    // sweeps. Otherwise every worker would fire its own sweep on the
    // same interval and we'd send N AI nudges per cycle. Single-process
    // deployments (cluster off) have no cluster.worker, so the guard
    // collapses to "always run".
    const cluster = require("node:cluster") as typeof import("node:cluster") & { default?: any };
    const c = (cluster as any).default ?? cluster;
    const isLeader = !c.worker || c.worker.id === 1;
    if (!isLeader) return;
    // Stagger first run by 60s so it doesn't fight startup contention.
    setTimeout(() => { this.sweep().catch(() => {}); }, 60_000);
    this.timer = setInterval(() => { this.sweep().catch(() => {}); }, this.intervalMs);

    // Deterministic cart-abandonment sweep — runs every 10 min, much
    // tighter cycle than the AI intent sweep because it doesn't cost
    // anything (pure SQL + push). Targets customers with non-empty
    // carts who haven't checked out within their browsing window.
    setTimeout(() => { this.sweepCartAbandonment().catch(() => {}); }, 90_000);
    this.cartTimer = setInterval(
      () => { this.sweepCartAbandonment().catch(() => {}); },
      10 * 60 * 1000,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.cartTimer) clearInterval(this.cartTimer);
  }

  // Cart-abandonment sweep timer — separate from the AI sweep so we
  // can run it on a different cadence.
  private cartTimer: NodeJS.Timeout | null = null;

  // 24-hour cooldown for cart-abandonment nudges (separate key from the
  // AI nudge cooldown so they don't fight; a customer can get one of
  // each per day).
  private readonly cartNudgedRecently = new Map<string, number>();

  /**
   * Send a cart-abandonment nudge to every customer who:
   *   - has a non-empty cart
   *   - last cart activity was 30-720 minutes ago (sweet spot — give
   *     them time to come back on their own, but not so long that it
   *     feels like spam)
   *   - hasn't placed an order since their last cart activity
   *   - hasn't been nudged for cart abandonment in the last 24 hours
   *
   * The nudge is a push notification with the cart subtotal so the
   * customer sees what they're missing. We skip SMS / WhatsApp here
   * because push is free; SMS gets layered on by the existing AI
   * intent sweep when it picks `nudge_whatsapp` as the action.
   */
  async sweepCartAbandonment() {
    const now = Date.now();
    const lo = new Date(now - 12 * 60 * 60 * 1000);   // 12 hours ago
    const hi = new Date(now - 30 * 60 * 1000);        // 30 minutes ago

    // Single SQL — find carts that look abandoned in the window. We
    // join cart_items so empty carts drop out, sum the line totals on
    // the fly using product.basePrice (snapshot-free; close enough for
    // a notification copy line). Outer-join orders to skip customers
    // who already checked out since their last cart activity.
    type Row = {
      customerId: string;
      cartUpdatedAt: Date;
      itemCount: bigint;
      subtotalGuess: string;
      fullName: string | null;
      phone: string | null;
    };
    let rows: Row[] = [];
    try {
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT
          c."customerId"                                         AS "customerId",
          c."updatedAt"                                          AS "cartUpdatedAt",
          count(ci.id)::bigint                                   AS "itemCount",
          coalesce(sum((p."basePrice")::numeric * ci.qty), 0)::text AS "subtotalGuess",
          cust."fullName"                                        AS "fullName",
          cust.phone                                             AS "phone"
        FROM "carts" c
        INNER JOIN "cart_items" ci  ON ci."cartId" = c.id
        INNER JOIN "products"   p   ON p.id        = ci."productId"
        INNER JOIN "customers"  cust ON cust.id    = c."customerId"
        WHERE c."customerId" IS NOT NULL
          AND c."updatedAt" >= ${lo}
          AND c."updatedAt" <= ${hi}
          AND NOT EXISTS (
            SELECT 1 FROM "orders" o
            WHERE o."customerId" = c."customerId"
              AND o."placedAt" >= c."updatedAt"
          )
        GROUP BY c."customerId", c."updatedAt", cust."fullName", cust.phone
        HAVING count(ci.id) > 0
        LIMIT 100
      `;
    } catch (err) {
      this.log.warn(`cart-abandonment query failed: ${(err as Error).message}`);
      return;
    }

    if (rows.length === 0) return;
    this.log.log(`Cart-abandonment sweep — ${rows.length} candidate carts`);

    let nudged = 0;
    for (const r of rows) {
      // 24-hour anti-spam check.
      const lastNudge = this.cartNudgedRecently.get(r.customerId);
      if (lastNudge && now - lastNudge < 24 * 60 * 60 * 1000) continue;

      const subtotal = Math.round(Number(r.subtotalGuess));
      const itemCount = Number(r.itemCount);
      const firstName = (r.fullName ?? "").split(" ")[0] || "there";

      const title = `Hey ${firstName}, your cart is waiting 🛒`;
      const body = itemCount === 1
        ? `1 item worth ₹${subtotal} — finish checkout in 2 taps.`
        : `${itemCount} items worth ₹${subtotal} — finish checkout in 2 taps.`;

      try {
        await this.notifications.sendToCustomer(r.customerId, {
          title, body,
          data: { kind: "cart_abandonment", cartUpdatedAt: r.cartUpdatedAt.toISOString() },
        });
        this.cartNudgedRecently.set(r.customerId, now);
        nudged++;
      } catch (err) {
        this.log.warn(`cart-nudge push failed for ${r.customerId}: ${(err as Error).message}`);
      }
    }
    if (nudged > 0) this.log.log(`Cart-abandonment sweep — sent ${nudged} nudge(s)`);

    // Trim the cooldown map every once in a while so it can't grow
    // unbounded over a long-running process.
    if (this.cartNudgedRecently.size > 5000) {
      const cutoff = now - 24 * 60 * 60 * 1000;
      for (const [k, t] of this.cartNudgedRecently) {
        if (t < cutoff) this.cartNudgedRecently.delete(k);
      }
    }
  }

  // ── Sweep ────────────────────────────────────────────────────────────

  async sweep() {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000); // last hour
      // Pull recent customer activity.
      const recent = await this.prisma.pageView.findMany({
        where: { createdAt: { gte: since }, customerId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      // Group by customer.
      const byCustomer = new Map<string, typeof recent>();
      for (const r of recent) {
        if (!r.customerId) continue;
        const arr = byCustomer.get(r.customerId) ?? [];
        arr.push(r);
        byCustomer.set(r.customerId, arr);
      }
      this.log.log(`AI targeting sweep — ${byCustomer.size} customers active in last hour`);
      for (const [customerId, events] of byCustomer) {
        try {
          await this.evaluateCustomer(customerId, events);
        } catch (err) {
          this.log.warn(`evaluateCustomer(${customerId}) failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.log.error(`AI targeting sweep failed: ${(err as Error).message}`);
    }
  }

  // ── Per-customer evaluation ──────────────────────────────────────────

  /** Public — admin can invoke from a button on the customer detail page. */
  async evaluateCustomerById(customerId: string): Promise<IntentSnapshot | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await this.prisma.pageView.findMany({
      where: { customerId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    if (events.length === 0) return null;
    return this.evaluateCustomer(customerId, events);
  }

  private async evaluateCustomer(
    customerId: string,
    events: { path: string; event: string | null; props: any; createdAt: Date }[],
  ): Promise<IntentSnapshot | null> {
    if (events.length === 0) return null;

    // Compress events into a compact summary the LLM can consume cheaply.
    const summary = events
      .slice(0, 80)
      .map(e => `${e.createdAt.toISOString().slice(11,16)}  ${e.event ?? "view"}  ${e.path}`)
      .join("\n");

    // Customer profile snippet — past orders, total spend, days since last
    // visit. Helps the AI distinguish "loyal returner" from "first-timer".
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { fullName: true, createdAt: true },
    });
    if (!customer) return null;
    // Orders fetched separately because Order's "created" field is
    // `placedAt` (not `createdAt`) and select-with-nested-orderBy was
    // tripping the Prisma generated types.
    const recentOrders = await this.prisma.order.findMany({
      where: { customerId },
      select: { grandTotal: true },
      orderBy: { placedAt: "desc" },
      take: 5,
    });
    const orderCount = recentOrders.length;
    const totalSpentRupees = recentOrders.reduce(
      (s: number, o) => s + Number(o.grandTotal ?? 0),
      0,
    );
    const daysSinceSignup = Math.floor((Date.now() - customer.createdAt.getTime()) / 86_400_000);

    const prompt = [
      `You are Gifteeng's customer-intent classifier. Output STRICT JSON only.`,
      ``,
      `## Customer profile`,
      `- Name: ${customer.fullName ?? "Unknown"}`,
      `- Joined: ${daysSinceSignup} days ago`,
      `- Past orders: ${orderCount}`,
      `- Lifetime spend: ₹${totalSpentRupees.toFixed(0)}`,
      ``,
      `## Recent activity (newest first, last hour or so)`,
      summary,
      ``,
      `## Output schema`,
      `{`,
      `  "intent": "high_intent_buy" | "abandoned_cart" | "browsing" | "returning_loyal" | "first_time_curious" | "dormant",`,
      `  "confidence": 0.0-1.0,`,
      `  "action": "wait" | "nudge_whatsapp" | "nudge_push" | "offer_discount" | "welcome_back" | "reorder_reminder",`,
      `  "copy":  "single-line message addressed to ${customer.fullName ?? "the customer"} (max 140 chars)",`,
      `  "evidence": ["3-5 short bullets quoting specific events that drove the call"]`,
      `}`,
      ``,
      `Decision rules:`,
      `- "abandoned_cart" wins if cart events appear without a checkout/purchase event.`,
      `- "high_intent_buy" if the user repeatedly views the same product or the customizer.`,
      `- "returning_loyal" if past orders ≥ 2 and they're back browsing.`,
      `- "first_time_curious" for joined-today / orders=0 / browsing only.`,
      `- "wait" is the default action when confidence < 0.55.`,
    ].join("\n");

    const r = await this.ai.write({
      field:  "ai_intent",
      prompt,
    });
    const text = (r.text ?? "").trim();
    if (!text || text.startsWith("⚠️")) {
      this.log.debug(`AI returned an error / no key for ${customerId}: ${text}`);
      return null;
    }

    let parsed: IntentSnapshot | null = null;
    try {
      // Robust JSON extraction — strip markdown fences if present.
      const jsonText = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const j = JSON.parse(jsonText);
      parsed = {
        intent:      String(j.intent ?? "browsing"),
        confidence:  Number(j.confidence ?? 0),
        action:      String(j.action ?? "wait"),
        copy:        String(j.copy ?? ""),
        evidence:    Array.isArray(j.evidence) ? j.evidence.map(String).slice(0, 5) : [],
        evaluatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.log.warn(`Could not parse AI JSON for ${customerId}: ${(err as Error).message} — text: ${text.slice(0, 200)}`);
      return null;
    }

    // Persist the snapshot on the customer's metadata.
    const existingMeta = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { metadata: true },
    });
    const meta = (existingMeta?.metadata && typeof existingMeta.metadata === "object" && !Array.isArray(existingMeta.metadata))
      ? { ...(existingMeta.metadata as Record<string, unknown>) }
      : {};
    (meta as any).aiIntent = parsed;
    await this.prisma.customer.update({
      where: { id: customerId },
      data:  { metadata: meta as Prisma.InputJsonValue },
    });

    // Action — fire a nudge if the AI said so. Spam-cap at 1 per 24h.
    if (parsed.action !== "wait" && parsed.copy && parsed.confidence >= 0.55) {
      const last = this.nudgedRecently.get(customerId) ?? 0;
      if (Date.now() - last > 24 * 60 * 60 * 1000) {
        await this.dispatchNudge(customerId, parsed);
        this.nudgedRecently.set(customerId, Date.now());
      } else {
        this.log.debug(`Skipping nudge for ${customerId} — already nudged in last 24h`);
      }
    }

    return parsed;
  }

  // ── Action dispatch ──────────────────────────────────────────────────

  private async dispatchNudge(customerId: string, snap: IntentSnapshot) {
    // For now we only support push (FCM) — WhatsApp / email hooks can be
    // wired in here later. Failure is logged but not thrown so a single
    // bad customer doesn't kill the sweep.
    const title = this.titleFor(snap.action) ?? "We have something for you 🎁";
    try {
      await this.notifications.sendToCustomer(customerId, {
        title,
        body: snap.copy,
        data: {
          source:    "ai-targeting",
          intent:    snap.intent,
          action:    snap.action,
          // Where the user lands when they tap the push.
          deeplink:  this.deepLinkFor(snap.action),
        },
      });
      this.log.log(`AI nudge → ${customerId} :: ${snap.action} :: "${snap.copy}"`);
    } catch (err) {
      this.log.warn(`Nudge dispatch failed for ${customerId}: ${(err as Error).message}`);
    }
  }

  private titleFor(action: string): string | null {
    switch (action) {
      case "nudge_whatsapp":   return "Still thinking? 💭";
      case "nudge_push":       return "Don't miss out 👀";
      case "offer_discount":   return "Special offer just for you 🎁";
      case "welcome_back":     return "Welcome back! 👋";
      case "reorder_reminder": return "Time to reorder? 🔁";
      default:                 return null;
    }
  }

  private deepLinkFor(action: string): string {
    switch (action) {
      case "offer_discount":   return "/shop";
      case "reorder_reminder": return "/account?tab=orders";
      case "welcome_back":     return "/";
      default:                 return "/cart";
    }
  }
}

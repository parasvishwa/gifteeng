import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

// Template-variable substitution. Supports the placeholders documented in
// the admin UI:  {firstName}  {firstItem}  {itemCount}  {cartValue}
function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export interface CartRecoveryRuleInput {
  name?:           string;
  triggerMinutes?: number;
  minCartValue?:   number | null;
  maxCartValue?:   number | null;
  loggedInOnly?:   boolean;
  title?:          string;
  body?:           string;
  ctaText?:        string;
  ctaUrl?:         string;
  cooldownHours?:  number;
  isActive?:       boolean;
  sortOrder?:      number;
}

@Injectable()
export class CartRecoveryService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async listRules() {
    return this.prisma.cartRecoveryRule.findMany({
      orderBy: [{ sortOrder: "asc" }, { triggerMinutes: "asc" }],
    });
  }

  async getRule(id: string) {
    const rule = await this.prisma.cartRecoveryRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException("Rule not found");
    return rule;
  }

  async createRule(data: CartRecoveryRuleInput) {
    return this.prisma.cartRecoveryRule.create({
      data: {
        name:           data.name           ?? "Untitled rule",
        triggerMinutes: data.triggerMinutes ?? 60,
        minCartValue:   data.minCartValue   ?? null,
        maxCartValue:   data.maxCartValue   ?? null,
        loggedInOnly:   data.loggedInOnly   ?? true,
        title:          data.title          ?? "Your cart is waiting",
        body:           data.body           ?? "Items in your cart are still saved. Continue shopping?",
        ctaText:        data.ctaText        ?? "View cart",
        ctaUrl:         data.ctaUrl         ?? "/cart",
        cooldownHours:  data.cooldownHours  ?? 48,
        isActive:       data.isActive       ?? true,
        sortOrder:      data.sortOrder      ?? 0,
      },
    });
  }

  async updateRule(id: string, data: CartRecoveryRuleInput) {
    await this.getRule(id); // 404 check
    return this.prisma.cartRecoveryRule.update({
      where: { id },
      data,
    });
  }

  async deleteRule(id: string) {
    await this.prisma.cartRecoveryRule.delete({ where: { id } });
    return { ok: true };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats() {
    const [totalRules, activeRules, totalSent, sentLast24h, sentLast7d] = await Promise.all([
      this.prisma.cartRecoveryRule.count(),
      this.prisma.cartRecoveryRule.count({ where: { isActive: true } }),
      this.prisma.cartRecoverySent.count(),
      this.prisma.cartRecoverySent.count({
        where: { sentAt: { gte: new Date(Date.now() - 86_400_000) } },
      }),
      this.prisma.cartRecoverySent.count({
        where: { sentAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      }),
    ]);
    return { totalRules, activeRules, totalSent, sentLast24h, sentLast7d };
  }

  // ── Candidates preview (for admin debug + cron) ───────────────────────────

  /**
   * Returns abandoned carts that match a given rule's conditions, ignoring
   * the cooldown filter (so the admin can preview "who would be eligible").
   * The cron uses the same logic but ALSO filters out users in cooldown.
   */
  async findCandidates(ruleId: string, includeCooldown = true) {
    const rule = await this.getRule(ruleId);

    // Find carts whose newest item is older than triggerMinutes AND has at
    // least one item. updatedAt on Cart bumps when a CartItem is added/removed.
    const cutoff = new Date(Date.now() - rule.triggerMinutes * 60_000);
    const carts = await this.prisma.cart.findMany({
      where: {
        updatedAt: { lt: cutoff },
        ...(rule.loggedInOnly ? { customerId: { not: null } } : {}),
        items: { some: {} }, // at least one item
      },
      include: {
        customer: {
          select: { id: true, fullName: true, phone: true, email: true },
        },
        items: {
          include: {
            product: { select: { id: true, title: true, basePrice: true, slug: true } },
          },
        },
      },
      take: 500, // sanity cap
    });

    // Filter by min/max cart value, optionally check cooldown
    const eligible: Array<{
      customerId: string;
      cartValue:  number;     // paise
      itemCount:  number;
      firstItem:  string;
      vars:       Record<string, string | number>;
    }> = [];

    for (const cart of carts) {
      if (!cart.customerId) continue; // logged-in only carts have customerId
      const itemCount = cart.items.reduce((s, it) => s + it.qty, 0);
      // Compute cart value in paise (basePrice is Decimal in INR, multiply by 100).
      const cartValuePaise = cart.items.reduce((s, it) => {
        const p = Number(it.product.basePrice ?? 0);
        return s + Math.round(p * 100) * it.qty;
      }, 0);
      if (rule.minCartValue != null && cartValuePaise < rule.minCartValue) continue;
      if (rule.maxCartValue != null && cartValuePaise > rule.maxCartValue) continue;

      if (!includeCooldown) {
        // Check cooldown — was this rule sent to this customer recently?
        const recentSend = await this.prisma.cartRecoverySent.findFirst({
          where: {
            customerId: cart.customerId,
            ruleId:     rule.id,
            sentAt: { gte: new Date(Date.now() - rule.cooldownHours * 3_600_000) },
          },
          select: { id: true },
        });
        if (recentSend) continue;
      }

      const firstName = cart.customer?.fullName?.split(" ")[0] ?? "there";
      const firstItem = cart.items[0]?.product.title ?? "your gift";

      eligible.push({
        customerId: cart.customerId,
        cartValue:  cartValuePaise,
        itemCount,
        firstItem,
        vars: {
          firstName,
          firstItem,
          itemCount,
          cartValue: `₹${Math.round(cartValuePaise / 100)}`,
        },
      });
    }

    return { rule, candidates: eligible };
  }

  // ── Cron entrypoint: scan all active rules + send pushes ──────────────────

  /**
   * For every active rule, finds candidates that pass the cooldown filter,
   * sends a push notification to each, and records to cart_recovery_sent.
   *
   * Idempotent: the cooldown check guarantees no duplicate sends within the
   * configured window. Safe to run every 15-30 minutes from cron.
   */
  async runRecovery() {
    const rules = await this.prisma.cartRecoveryRule.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    let totalSent = 0;
    let totalFailed = 0;
    const perRule: Array<{ ruleId: string; ruleName: string; sent: number; failed: number }> = [];

    for (const rule of rules) {
      const { candidates } = await this.findCandidates(rule.id, false);
      let sent = 0, failed = 0;

      for (const c of candidates) {
        const title = renderTemplate(rule.title, c.vars);
        const body  = renderTemplate(rule.body,  c.vars);
        try {
          const res = await this.notifications.sendToCustomer(c.customerId, {
            title,
            body,
            data: {
              kind:    "cart_recovery",
              ruleId:  rule.id,
              ctaUrl:  rule.ctaUrl,
              ctaText: rule.ctaText,
            },
          });
          if (res.sent > 0) {
            sent++;
            totalSent++;
          } else {
            failed++;
            totalFailed++;
          }
          // Record the send EVEN if the push failed — we still respect the
          // cooldown so we don't keep retrying a user with no FCM token.
          await this.prisma.cartRecoverySent.create({
            data: {
              ruleId:     rule.id,
              customerId: c.customerId,
              cartValue:  c.cartValue,
              itemCount:  c.itemCount,
              channel:    "push",
            },
          });
        } catch (e) {
          failed++;
          totalFailed++;
        }
      }

      // Update denormalised counter for the admin UI
      if (sent > 0) {
        await this.prisma.cartRecoveryRule.update({
          where: { id: rule.id },
          data:  { sentCount: { increment: sent } },
        });
      }
      perRule.push({ ruleId: rule.id, ruleName: rule.name, sent, failed });
    }

    return {
      ok: true,
      totalSent,
      totalFailed,
      rulesProcessed: rules.length,
      perRule,
      ranAt: new Date().toISOString(),
    };
  }

  // ── Test send (admin "Send to me" button) ─────────────────────────────────

  /**
   * Renders a rule's template with sample vars (or a real customer's name)
   * and sends ONE push to a specific customer for preview.
   */
  async testSend(ruleId: string, customerId: string) {
    const rule = await this.getRule(ruleId);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { fullName: true },
    });

    const vars: Record<string, string | number> = {
      firstName: customer?.fullName?.split(" ")[0] ?? "there",
      firstItem: "Photo Magnet",
      itemCount: 3,
      cartValue: "₹1,247",
    };
    const title = renderTemplate(rule.title, vars);
    const body  = renderTemplate(rule.body,  vars);

    const res = await this.notifications.sendToCustomer(customerId, {
      title,
      body,
      data: {
        kind:    "cart_recovery_test",
        ruleId:  rule.id,
        ctaUrl:  rule.ctaUrl,
        ctaText: rule.ctaText,
      },
    });
    return { ok: true, sent: res.sent, failed: res.failed, title, body };
  }
}

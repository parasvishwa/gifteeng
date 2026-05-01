// ────────────────────────────────────────────────────────────────────────
// Privacy / DPDP Act compliance service
// ────────────────────────────────────────────────────────────────────────
//
// Implements the customer-facing rights mandated by India's Digital
// Personal Data Protection Act (2023):
//
//   - Right to know  → getConsentSnapshot(), exportData()
//   - Right to consent / withdraw → setConsent()
//   - Right to erasure → requestDeletion(), cancelDeletion()
//
// Plus a daily cron `processScheduledDeletions` that anonymizes PII
// for any customer whose `dataDeletionScheduledFor` is in the past.
//
// Deletion model: ANONYMIZE, don't hard-delete. Indian tax law
// (CGST + IT Act) requires us to keep order records for 6-7 years.
// Anonymizing means we redact name/email/phone/addresses + customizer
// photos but keep the order rows so the books still balance.

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { ConsentCategory, Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

const ALL_CATEGORIES: ConsentCategory[] = [
  "essential",
  "analytics",
  "marketing",
  "ai_personalization",
];

// `essential` cannot be turned off — it covers login, cart, checkout.
// DPDP allows processing without consent for purposes that are
// "necessary for the performance of any function under any law"
// or "performance of a contract" — covers our checkout flow.
const ESSENTIAL_CANNOT_WITHDRAW = new Set<ConsentCategory>(["essential"]);

const DEFAULT_DELETION_GRACE_DAYS = 30;
const EXPORT_TTL_DAYS = 7;

@Injectable()
export class PrivacyService implements OnModuleInit {
  private readonly log = new Logger(PrivacyService.name);
  private cron: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  // ── Cron ─────────────────────────────────────────────────────────────

  onModuleInit() {
    // Cluster-aware: only worker 1 runs the deletion sweep so we don't
    // process the same customer N times.
    const cluster = require("node:cluster") as typeof import("node:cluster") & { default?: any };
    const c = (cluster as any).default ?? cluster;
    const isLeader = !c.worker || c.worker.id === 1;
    if (!isLeader) return;

    // Run once at startup (after a stagger), then every hour. Hourly
    // is more than enough — DPDP windows are days, not minutes.
    setTimeout(() => { this.processScheduledDeletions().catch(() => {}); }, 90_000);
    this.cron = setInterval(() => {
      this.processScheduledDeletions().catch(() => {});
      this.expireOldExports().catch(() => {});
    }, 60 * 60 * 1000);
  }

  // ── Consents ─────────────────────────────────────────────────────────

  /**
   * Returns the latest decision per category for a customer. Categories
   * the customer hasn't explicitly chosen on yet default to `granted=false`
   * for non-essential and `granted=true` for essential (which they can't
   * withdraw anyway).
   */
  async getConsentSnapshot(customerId: string): Promise<Record<ConsentCategory, {
    granted: boolean; recordedAt: Date | null; policyVersion: string;
  }>> {
    const records = await this.prisma.consentRecord.findMany({
      where: { customerId },
      orderBy: { recordedAt: "desc" },
    });
    const seen = new Set<ConsentCategory>();
    const out: Record<string, { granted: boolean; recordedAt: Date | null; policyVersion: string }> = {};
    for (const r of records) {
      if (seen.has(r.category)) continue;
      seen.add(r.category);
      out[r.category] = { granted: r.granted, recordedAt: r.recordedAt, policyVersion: r.policyVersion };
    }
    for (const c of ALL_CATEGORIES) {
      if (!out[c]) {
        out[c] = {
          granted: c === "essential", // essentials default-on
          recordedAt: null,
          policyVersion: "1.0",
        };
      }
    }
    return out as Record<ConsentCategory, { granted: boolean; recordedAt: Date | null; policyVersion: string }>;
  }

  /**
   * Record a consent change. Each call creates a NEW row — we never
   * update or delete prior records. This makes the audit trail
   * tamper-evident: regulators can see exactly when consent flipped.
   */
  async setConsent(
    customerId: string,
    category: ConsentCategory,
    granted: boolean,
    meta: { source?: string; ipAddress?: string; userAgent?: string } = {},
  ) {
    if (ESSENTIAL_CANNOT_WITHDRAW.has(category) && !granted) {
      throw new BadRequestException(
        `'${category}' consent is required to use the platform and cannot be withdrawn. ` +
        `If you wish to leave the platform, please request account deletion instead.`,
      );
    }
    if (!ALL_CATEGORIES.includes(category)) {
      throw new BadRequestException(`Unknown consent category: ${category}`);
    }
    return this.prisma.consentRecord.create({
      data: {
        customerId,
        category,
        granted,
        source:    meta.source ?? "settings_page",
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
  }

  // ── Data export ──────────────────────────────────────────────────────

  /**
   * Synchronous data export — pulls every row referencing this
   * customer, packages as JSON, stores under DataExportRequest.payload.
   * For our current scale (most customers <200 rows total) this fits
   * comfortably in a single Postgres row. When we outgrow this we'll
   * swap to S3-backed signed downloads — the DataExportRequest schema
   * already has `payload` nullable so it's a non-breaking change.
   */
  async exportData(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        savedAddresses: true,
        // Wishlist has nested items, each pointing at a Product. Match
        // the actual schema rather than guessing at a `products` join.
        wishlists:      { include: { items: { include: { product: true } } } },
        reviews:        true,
        loginStreak:    true,
        stickerProfile: true,
        userStickers:   true,
        deviceTokens:   { select: { id: true, platform: true, createdAt: true } },
        // intentionally omit: passwordHash, googleId, isAdmin
      },
    });
    if (!customer) throw new NotFoundException("Customer not found");

    const [orders, returnRequests, coinTransactions, consentRecords, gamePlays, rewardInstances, customerPhotos] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId },
        include: { items: true, shipments: true },
      }),
      this.prisma.returnRequest.findMany({ where: { customerId } }),
      this.prisma.coinTransaction.findMany({ where: { customerId } }),
      this.prisma.consentRecord.findMany({ where: { customerId }, orderBy: { recordedAt: "asc" } }),
      this.prisma.gamePlay.findMany({ where: { customerId } }),
      this.prisma.rewardInstance.findMany({ where: { customerId } }),
      this.prisma.customerPhoto.findMany({ where: { customerId } }),
    ]);

    const payload = {
      generatedAt: new Date().toISOString(),
      schemaVersion: "1.0",
      customer: {
        id: customer.id,
        email: customer.email,
        phone: customer.phone,
        fullName: customer.fullName,
        avatarUrl: customer.avatarUrl,
        emailVerified: customer.emailVerified,
        phoneVerified: customer.phoneVerified,
        coinBalance: customer.coinBalance,
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
      },
      addresses: customer.savedAddresses,
      wishlists: customer.wishlists,
      reviews: customer.reviews,
      orders, returnRequests, coinTransactions,
      consentRecords, gamePlays, rewardInstances, customerPhotos,
      deviceTokens: customer.deviceTokens,
      loginStreak: customer.loginStreak,
      stickerProfile: customer.stickerProfile,
      userStickers: customer.userStickers,
    };
    const json = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(json, "utf8");

    const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const record = await this.prisma.dataExportRequest.create({
      data: {
        customerId,
        status: "ready",
        payload: payload as Prisma.InputJsonValue,
        sizeBytes,
        readyAt: new Date(),
        expiresAt,
      },
    });
    return record;
  }

  async listExports(customerId: string) {
    return this.prisma.dataExportRequest.findMany({
      where: { customerId, status: { in: ["pending", "ready"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, sizeBytes: true,
        createdAt: true, readyAt: true, expiresAt: true,
      },
    });
  }

  async getExport(customerId: string, exportId: string) {
    const r = await this.prisma.dataExportRequest.findUnique({ where: { id: exportId } });
    if (!r || r.customerId !== customerId) throw new ForbiddenException();
    if (r.expiresAt && r.expiresAt < new Date()) {
      throw new NotFoundException("Export has expired. Please request a new one.");
    }
    return r;
  }

  /** Auto-expire ready exports past their TTL — keeps the table small. */
  async expireOldExports() {
    const result = await this.prisma.dataExportRequest.updateMany({
      where: {
        status: "ready",
        expiresAt: { lt: new Date() },
      },
      data: { status: "expired", payload: Prisma.JsonNull },
    });
    if (result.count > 0) this.log.log(`Expired ${result.count} stale data exports`);
  }

  // ── Deletion ─────────────────────────────────────────────────────────

  /**
   * Schedule the customer's deletion. We give a 30-day grace period by
   * default — DPDP allows reasonable processing-completion windows
   * (orders in flight, refund cycles, etc.). The customer can cancel
   * any time before the grace period elapses.
   */
  async requestDeletion(customerId: string, graceDays = DEFAULT_DELETION_GRACE_DAYS) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException();
    if (customer.dpdpAnonymizedAt) {
      throw new BadRequestException("Account is already anonymized.");
    }
    const scheduledFor = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { dataDeletionScheduledFor: scheduledFor },
    });
  }

  async cancelDeletion(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException();
    if (!customer.dataDeletionScheduledFor) {
      throw new BadRequestException("No pending deletion to cancel.");
    }
    if (customer.dpdpAnonymizedAt) {
      throw new BadRequestException("Account already anonymized — cancellation no longer possible.");
    }
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { dataDeletionScheduledFor: null },
    });
  }

  /**
   * Anonymize a single customer's PII. Run by the cron when the grace
   * period elapses, or manually by an admin override.
   *
   * Strategy:
   *   - Customer.{fullName,email,phone,avatarUrl,googleId} → "[deleted]" / null
   *   - SavedAddress.* → null name/phone, generic city, no line1
   *   - CustomerPhoto.fileUrl → null
   *   - Order rows are PRESERVED (tax law). Order shipping addresses
   *     are anonymized in-place.
   *   - DeviceToken rows DROPPED (no further pushes after deletion).
   *   - Wishlist rows DROPPED (purely personal preference data).
   *   - Reviews KEPT but author swapped to "Anonymous Gifteengster"
   *     so the public review stays useful but the customer is
   *     untraceable.
   *   - Consent + audit records KEPT for regulator queries.
   */
  async anonymizeCustomer(customerId: string, actorNote = "scheduled by customer") {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException();
    if (customer.dpdpAnonymizedAt) {
      this.log.log(`Customer ${customerId.slice(0, 8)}… already anonymized — skipping`);
      return customer;
    }

    const now = new Date();
    const REDACTED = "[deleted]";

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          fullName: REDACTED,
          email: null,
          phone: null,
          avatarUrl: null,
          googleId: null,
          // Keep coinBalance for accounting reconciliation; the row will
          // never resolve to a person again so it's a sealed record.
          dpdpAnonymizedAt: now,
        },
      });
      await tx.savedAddress.updateMany({
        where: { customerId },
        data: {
          fullName: REDACTED, phone: REDACTED,
          line1: REDACTED, line2: null,
        },
      });
      // CustomerPhoto.url is NOT NULL in the schema, so we can't null
      // it out — drop the rows entirely. Photos are personal anyway,
      // there's no audit value in keeping them.
      await tx.customerPhoto.deleteMany({ where: { customerId } });
      // Anonymize per-order shipping address snapshots (kept on Order
      // for shipping audit trail). Iterate to avoid loading large blobs.
      const orders = await tx.order.findMany({
        where: { customerId },
        select: { id: true },
      });
      for (const o of orders) {
        await tx.order.update({
          where: { id: o.id },
          data: {
            shippingAddress: { redacted: true } as Prisma.InputJsonValue,
            billingAddress:  { redacted: true } as Prisma.InputJsonValue,
            notes: null,
          },
        });
      }
      // Drop personal preferences — they have no audit value once the
      // owner asks to be forgotten.
      await tx.wishlist.deleteMany({ where: { customerId } });
      await tx.deviceToken.deleteMany({ where: { customerId } });
      await tx.giftReminder.deleteMany({ where: { customerId } });
      // Reviews stay public — they reference customerId; the customer's
      // fullName has already been redacted to "[deleted]" so any UI that
      // resolves the reviewer name through the relation gets the
      // anonymized value automatically. We DON'T null out customerId
      // because that breaks any downstream "filter to verified-buyer
      // reviews" logic, and the customer row itself is now anonymized.
      // Audit log
      await tx.auditLog.create({
        data: {
          actorType: "system",
          actorId: null,
          action: "customer.anonymized",
          entityType: "customer",
          entityId: customerId,
          payload: { reason: "DPDP erasure", note: actorNote, ordersAnonymized: orders.length } as Prisma.InputJsonValue,
        },
      });
    });

    this.realtime.publish(customerId, "profile");
    this.log.log(`Anonymized customer ${customerId.slice(0, 8)}… (${actorNote})`);
    return this.prisma.customer.findUnique({ where: { id: customerId } });
  }

  /**
   * Cron sweep — find customers whose deletion grace period has passed
   * and process them. Idempotent: anonymized rows don't qualify so the
   * same customer won't be processed twice.
   */
  async processScheduledDeletions() {
    const now = new Date();
    const due = await this.prisma.customer.findMany({
      where: {
        dataDeletionScheduledFor: { lte: now },
        dpdpAnonymizedAt: null,
      },
      select: { id: true, dataDeletionScheduledFor: true },
      take: 50,
    });
    if (due.length === 0) return;
    this.log.log(`DPDP cron — ${due.length} customer(s) due for anonymization`);
    for (const c of due) {
      try { await this.anonymizeCustomer(c.id, "scheduled deletion grace expired"); }
      catch (err) { this.log.warn(`anonymize ${c.id} failed: ${(err as Error).message}`); }
    }
  }

  // ── Admin queue ──────────────────────────────────────────────────────

  async listPendingDeletions() {
    return this.prisma.customer.findMany({
      where: {
        dataDeletionScheduledFor: { not: null },
        dpdpAnonymizedAt: null,
      },
      orderBy: { dataDeletionScheduledFor: "asc" },
      select: {
        id: true, fullName: true, email: true, phone: true,
        dataDeletionScheduledFor: true, createdAt: true,
      },
    });
  }
}

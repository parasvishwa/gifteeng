/**
 * SeoCronService — Fully Automatic SEO Maintenance
 *
 * Runs completely in the background. Zero human involvement needed.
 *
 * Schedule:
 *   02:00 every night  → fill any products still missing SEO (rule-based, fast)
 *   03:00 every Sunday → AI-upgrade every rule-based product (full catalog)
 *   04:00 every Monday → ping Google & Bing sitemap endpoints
 *
 * Why this matters:
 *   • Products created while the AI key was unavailable only got rule-based SEO.
 *     The Sunday sweep upgrades them automatically when the key is back.
 *   • New products added in bulk imports are enriched within 24 h at most.
 *   • Sitemap ping tells crawlers that new/updated content is ready without
 *     waiting for the next scheduled crawl.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { SeoEnrichmentService } from "./seo-enrichment.service";

@Injectable()
export class SeoCronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeoCronService.name);
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(private readonly seo: SeoEnrichmentService) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onModuleInit(): void {
    this.scheduleRecurring("SEO nightly fill",    2, 0, "daily",  () => this.runNightlyFill());
    this.scheduleRecurring("SEO weekly AI sweep", 3, 0, "weekly", () => this.runWeeklyAiUpgrade());
    this.logger.log("SEO cron jobs registered ✓");
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
  }

  // ── Scheduling helpers ─────────────────────────────────────────────────────

  /**
   * Calculates the next wall-clock occurrence of HH:MM for the given cadence
   * and sets a self-rescheduling timeout. Always fires exactly once per cycle.
   */
  private scheduleRecurring(
    name: string,
    hour: number,
    minute: number,
    cadence: "daily" | "weekly",
    fn: () => Promise<void>,
  ): void {
    const scheduleNext = () => {
      const now  = new Date();
      const next = new Date(now);
      next.setSeconds(0, 0);
      next.setHours(hour, minute);

      if (cadence === "weekly") {
        // Target Sunday (0)
        const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
        next.setDate(now.getDate() + daysUntilSunday);
      }

      if (next <= now) {
        if (cadence === "daily")  next.setDate(next.getDate() + 1);
        if (cadence === "weekly") next.setDate(next.getDate() + 7);
      }

      const delay = next.getTime() - now.getTime();
      this.logger.debug(
        `${name}: next run in ${Math.round(delay / 60_000)} min (${next.toISOString()})`,
      );

      const t = setTimeout(async () => {
        await fn();
        scheduleNext();
      }, delay);

      this.timers.push(t);
    };

    scheduleNext();
  }

  // ── Jobs ───────────────────────────────────────────────────────────────────

  /**
   * Nightly 02:00 — fills every product that still has no SEO metadata.
   * Uses rule-based tier only (< 1 ms per product, no API cost, no rate limits).
   * Processes up to 2 000 products per run — covers any bulk import that landed
   * during the day.
   */
  async runNightlyFill(): Promise<void> {
    this.logger.log("SEO Cron ▶ Nightly fill starting…");
    try {
      const result = await this.seo.bulkEnrich({
        onlyMissing: true,
        limit:       2_000,
        forceAi:     false,
      });
      this.logger.log(
        `SEO Cron ✓ Nightly fill — processed=${result.processed} ` +
        `updated=${result.updated} errors=${result.errors}`,
      );
      await this.seo.pingSitemaps();
    } catch (err) {
      this.logger.error(`SEO Cron ✗ Nightly fill failed: ${String(err)}`);
    }
  }

  /**
   * Weekly Sunday 03:00 — AI-upgrades every rule-based product.
   * Uses the configured LLM (Claude / GPT) to produce richer SEO for up to
   * 1 000 products.  Batches are processed with a 300 ms pause between each
   * to avoid hammering the AI API.
   */
  async runWeeklyAiUpgrade(): Promise<void> {
    this.logger.log("SEO Cron ▶ Weekly AI upgrade starting…");
    try {
      const result = await this.seo.bulkEnrich({
        onlyMissing: false,
        limit:       1_000,
        forceAi:     true,
      });
      this.logger.log(
        `SEO Cron ✓ Weekly AI upgrade — processed=${result.processed} ` +
        `updated=${result.updated} errors=${result.errors}`,
      );
      await this.seo.pingSitemaps();
    } catch (err) {
      this.logger.error(`SEO Cron ✗ Weekly AI upgrade failed: ${String(err)}`);
    }
  }
}

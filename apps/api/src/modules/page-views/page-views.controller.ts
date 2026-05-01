import {
  Body, Controller, Get, Post, Query,
  Req, UseGuards, ParseIntPipe, DefaultValuePipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PageViewsService, type TrackBatchItem } from "./page-views.service";

/**
 * Best-effort customerId extraction from a Bearer JWT.
 *
 * The /analytics/track endpoint is public (no JwtB2cGuard), so we manually
 * decode the token payload to attribute events to the logged-in user. We
 * decode the payload without verifying the signature because:
 *   • The endpoint is fire-and-forget — a forged customerId only pollutes
 *     analytics, never grants any privileged action.
 *   • Verifying would require importing JwtService and adding latency to
 *     every track call.
 *
 * Token can come as "Bearer <jwt>" or just "<jwt>". Returns undefined on
 * any parse failure.
 */
function extractCustomerIdFromAuth(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return undefined;
  try {
    // JWT base64url-encoded — pad and replace url chars before decoding.
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    // The b2c JWT uses standard JWT claims: { sub: customer.id, aud: "b2c" }.
    // (See auth-b2c.service.ts signAsync + jwt-b2c.strategy.ts validate.)
    // We only attribute b2c customer events here — never b2b admin tokens.
    if (json.aud !== "b2c") return undefined;
    if (typeof json.sub === "string" && json.sub.length > 0) return json.sub;
    return undefined;
  } catch {
    return undefined;
  }
}

@ApiTags("page-views")
@Controller()
export class PageViewsController {
  constructor(private service: PageViewsService) {}

  /**
   * POST /api/analytics/track — single event beacon.
   *
   * Body (all fields optional except path):
   *   sessionId   — stable anon id (mobile creates one per install)
   *   path        — screen/route ("/home", "/shop/hyd-magnet")
   *   event       — named event (defaults to "page_view" when null)
   *   props       — event payload (cartValue, rarity, productId, …)
   *   platform    — "android" | "ios" | "web"
   *   appVersion  — "1.0.0+23"
   *   customerId  — customer uuid when logged in
   *
   * Public — no auth. Fire-and-forget from the client.
   */
  @Post("analytics/track")
  track(
    @Body() body: {
      sessionId?:  string;
      path?:       string;
      event?:      string;
      props?:      Record<string, unknown>;
      platform?:   string;
      appVersion?: string;
      referrer?:   string;
      customerId?: string;
    },
    @Req() req: any,
  ) {
    const userAgent = req.headers["user-agent"] ?? "";
    const sessionId = body.sessionId ?? `anon-${Date.now()}`;
    const path      = body.path ?? "/";
    // If client didn't pass customerId, try to extract it from the JWT in the
    // Authorization header. This way the activity feed correctly attributes
    // events to logged-in users without requiring every client to set the field.
    const customerId = body.customerId ?? extractCustomerIdFromAuth(req.headers["authorization"]);
    return this.service.track({
      sessionId,
      path,
      event:      body.event,
      props:      body.props,
      platform:   body.platform,
      appVersion: body.appVersion,
      referrer:   body.referrer,
      userAgent,
      customerId,
    });
  }

  /**
   * POST /api/analytics/track-batch — bulk event ingest.
   *
   * Mobile batches events in-memory and flushes every 10s or on
   * app-background. Greatly reduces network chatter vs per-event beacons.
   *
   * Body:
   *   sessionId   — shared across all events in this batch
   *   platform    — "android" | "ios" (shared)
   *   appVersion  — shared
   *   customerId  — shared (if logged in at flush time)
   *   events[]    — { path, event?, props?, timestamp? }
   */
  @Post("analytics/track-batch")
  trackBatch(
    @Body() body: {
      sessionId?:  string;
      platform?:   string;
      appVersion?: string;
      customerId?: string;
      events?:     TrackBatchItem[];
    },
    @Req() req: any,
  ) {
    const userAgent = req.headers["user-agent"] ?? "";
    const sessionId = body.sessionId ?? `anon-${Date.now()}`;
    const customerId = body.customerId ?? extractCustomerIdFromAuth(req.headers["authorization"]);
    return this.service.trackBatch(sessionId, body.events ?? [], {
      userAgent,
      platform:   body.platform,
      appVersion: body.appVersion,
      customerId,
    });
  }

  /** GET /api/admin/page-views — super-admin only (raw rows, legacy) */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/page-views")
  getViews(
    @Query("since") since?: string,
    @Query("limit", new DefaultValuePipe(5000), ParseIntPipe) limit?: number,
  ) {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.service.getViews(sinceDate, limit);
  }

  /**
   * GET /api/admin/analytics/summary?days=7
   *
   * Aggregated dashboard stats for the admin observability page.
   * Returns totals + event counts + platform breakdown + conversion funnel.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/analytics/summary")
  getSummary(@Query("days", new DefaultValuePipe(7), ParseIntPipe) days?: number) {
    return this.service.getSummary(days);
  }

  /**
   * GET /api/admin/analytics/activity
   *
   * Live activity feed — last N events across all users (web + mobile).
   * Each row is formatted for human reading: "User X is on /shop", "User Y
   * bought 2x Magnet", "User Z left cart with ₹499", "Anonymous A got error
   * 500 on /checkout", etc.
   *
   * Query:
   *   limit  — max rows (default 200, capped at 1000)
   *   event  — filter to specific event name (optional)
   *   sessionId — filter to specific session (optional, for drill-down)
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/analytics/activity")
  getActivity(
    @Query("limit", new DefaultValuePipe(200), ParseIntPipe) limit?: number,
    @Query("hours", new DefaultValuePipe(24), ParseIntPipe) hours?: number,
    @Query("event") event?: string,
    @Query("sessionId") sessionId?: string,
    @Query("customerId") customerId?: string,
    @Query("userType") userType?: string,
  ) {
    // Server hard-cap raised from 1000 → 5000 to cover the 500-concurrent
    // target — at that scale a busy hour produces 5-10 k events. The
    // admin client requests 1000 by default; pulling the full 5000 only
    // matters for the per-user drill-down view or CSV export. Going
    // higher than 5000 from a single query would start punishing
    // Postgres + the row payload over HTTP — paginate instead.
    return this.service.getActivityFeed({
      limit: Math.min(limit ?? 200, 5000),
      hours: Math.min(hours ?? 24, 720),
      event,
      sessionId,
      customerId,
      userType,
    });
  }

  /**
   * GET /api/admin/analytics/users
   *
   * User-grouped activity — one row per (customerId or sessionId) with their
   * total event count, last seen, last event description, and platform.
   * Click a user to drill into their full timeline via /activity?customerId=
   * or /activity?sessionId=.
   *
   * Query:
   *   hours      — window (default 24, max 720)
   *   limit      — max users to return (default 100, max 500)
   *   userType   — filter: "new" | "returning" | "anon" | "anon-new"
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/analytics/users")
  getUsers(
    @Query("hours", new DefaultValuePipe(24), ParseIntPipe) hours?: number,
    @Query("limit", new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Query("userType") userType?: string,
  ) {
    return this.service.getUserActivity({
      hours: Math.min(hours ?? 24, 720),
      limit: Math.min(limit ?? 100, 500),
      userType,
    });
  }

  /**
   * POST /api/admin/analytics/rollup-daily
   *
   * Aggregate the previous day's events into the daily summary table.
   * Idempotent — re-running for the same day re-counts.
   *
   * Hook to a daily cron at ~01:00 UTC.
   *   curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
   *     https://new-api.gifteeng.com/api/admin/analytics/rollup-daily
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/analytics/rollup-daily")
  rollupDaily(@Body() body: { date?: string } = {}) {
    return this.service.rollupDaily(body?.date);
  }

  /**
   * POST /api/admin/analytics/prune-old
   *
   * Deletes raw page_views older than `daysToKeep` (default 90, min 7, max 365).
   * Run AFTER rollup-daily so historical aggregates are preserved.
   *
   * Hook to a daily cron at ~02:00 UTC, after the rollup job.
   *   curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
   *     -H "Content-Type: application/json" -d '{"daysToKeep":90}' \
   *     https://new-api.gifteeng.com/api/admin/analytics/prune-old
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/analytics/prune-old")
  pruneOld(@Body() body: { daysToKeep?: number } = {}) {
    return this.service.pruneOld(body?.daysToKeep ?? 90);
  }
}

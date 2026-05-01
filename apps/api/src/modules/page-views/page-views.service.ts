import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * Convert a raw analytics event into a human-readable single-line description
 * for the admin activity feed. Examples:
 *   "Viewing /shop"
 *   "Bought 2× Photo Magnet (₹498)"
 *   "Left cart with 3 items (₹1,247)"
 *   "Started customizing Photo Frame"
 *   "Got error 500 on /checkout"
 */
function formatEventDescription(args: {
  event:    string | null;
  path:     string;
  props:    Record<string, unknown> | null;
  platform: string | null;
}): string {
  const e = args.event;
  const p = args.props ?? {};
  const path = args.path;

  // Helper to coerce numeric values
  const num = (v: unknown): number | null => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const str = (v: unknown): string => (v == null ? "" : String(v));

  // Implicit page_view (event is null)
  if (!e || e === "page_view") return `Viewed ${path}`;

  switch (e) {
    case "home_view":
      return "Opened home page";
    case "shop_view":
      return "Browsing shop";
    case "category_tap":
      return `Tapped category: ${str(p.category) || str(p.name) || "—"}`;
    case "product_view": {
      const title = str(p.title) || str(p.name) || str(p.productTitle) || "a product";
      return `Viewed product: ${title}`;
    }
    case "add_to_cart": {
      const title = str(p.title) || str(p.productTitle) || "product";
      const qty = num(p.qty) ?? 1;
      const price = num(p.price) ?? num(p.priceInr);
      return `Added to cart: ${qty}× ${title}${price ? ` (₹${price})` : ""}`;
    }
    case "remove_from_cart":
      return `Removed from cart: ${str(p.title) || "item"}`;
    case "cart_view": {
      const count = num(p.itemCount) ?? num(p.count);
      const value = num(p.cartValue) ?? num(p.subtotal);
      return `Opened cart${count ? ` (${count} items` : ""}${value ? `, ₹${value})` : count ? ")" : ""}`;
    }
    case "cart_abandon": {
      const count = num(p.itemCount) ?? num(p.count) ?? 0;
      const value = num(p.cartValue) ?? num(p.subtotal) ?? 0;
      return `Left cart with ${count} item${count === 1 ? "" : "s"} (₹${value})`;
    }
    case "checkout_start":
      return "Started checkout";
    case "checkout_step": {
      return `Checkout step: ${str(p.step) || "—"}`;
    }
    case "checkout_success":
    case "purchase": {
      const orderNo = str(p.orderNumber) || str(p.orderId) || "";
      const total = num(p.total) ?? num(p.grandTotal) ?? num(p.amount);
      const itemCount = num(p.itemCount) ?? num(p.count);
      const itemsLabel = itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "";
      return `🛒 Bought ${itemsLabel}${orderNo ? ` · #${orderNo}` : ""}${total ? ` · ₹${total}` : ""}`;
    }
    case "checkout_abandon":
      return `Left checkout${p.step ? ` at ${str(p.step)}` : ""}`;
    case "customize_start":
      return `Started customizing: ${str(p.title) || str(p.productTitle) || "product"}`;
    case "customize_save":
      return `Saved customization: ${str(p.title) || "product"}`;
    case "customize_abandon":
      return `Abandoned customization: ${str(p.title) || "product"}`;
    case "wishlist_add":
      return `❤️ Added to wishlist: ${str(p.title) || "product"}`;
    case "wishlist_remove":
      return `Removed from wishlist: ${str(p.title) || "product"}`;
    case "search":
      return `Searched: "${str(p.query) || "—"}"`;
    case "login":
      return "Signed in";
    case "logout":
      return "Signed out";
    case "signup":
      return "Created account";
    case "session_start":
      return "Opened the app";
    case "session_end":
      return "Closed the app";
    case "page_leave": {
      const dwell = num(p.dwellMs);
      return `Left ${path}${dwell ? ` after ${Math.round(dwell / 1000)}s` : ""}`;
    }
    case "error": {
      const code = str(p.status) || str(p.code) || "?";
      const msg = str(p.message) || str(p.error);
      // The error event is fired from a global Dio interceptor — the actual
      // failed API path lives in props.path, not the screen path.
      const errPath = str(p.path) || path;
      const method = str(p.method);
      return `⚠️ Error ${code} on ${method ? method + " " : ""}${errPath}${msg ? ` — ${msg.slice(0, 100)}` : ""}`;
    }
    case "goins_earned":
      return `🪙 Earned ${num(p.amount) ?? "?"} Goins`;
    case "goins_spent":
      return `Spent ${num(p.amount) ?? "?"} Goins`;
    case "payment_failed": {
      const code   = str(p.code) || "?";
      const reason = str(p.description) || str(p.reason) || "";
      const order  = str(p.orderId);
      return `💳❌ Payment failed${order ? ` · #${order}` : ""} · ${code}${reason ? ` — ${reason.slice(0, 100)}` : ""}`;
    }
    case "payment_dismissed": {
      const order = str(p.orderId);
      return `💳 Payment cancelled by user${order ? ` · #${order}` : ""}`;
    }
    case "404_view": {
      const ref = str(p.referrer);
      return `🔍 404 on ${path}${ref ? ` ← from ${ref}` : ""}`;
    }
    case "review_submitted": {
      const stars = "★".repeat(Math.min(5, num(p.rating) ?? 0));
      const photos = p.hasPhotos ? " · 📷" : "";
      return `📝 Submitted review ${stars}${photos}`;
    }
    default:
      return `${e} on ${path}`;
  }
}

function parseUA(ua: string): { deviceType: string; browser: string; os: string } {
  const s = ua.toLowerCase();
  const deviceType = /mobile|android.*mobile|iphone|ipod|windows phone/.test(s)
    ? "mobile"
    : /tablet|ipad|android(?!.*mobile)/.test(s)
      ? "tablet"
      : "desktop";

  const browser =
    s.includes("edg/")     ? "Edge"
    : s.includes("chrome/") ? "Chrome"
    : s.includes("firefox/") ? "Firefox"
    : s.includes("safari/") && !s.includes("chrome/") ? "Safari"
    : s.includes("opr/") || s.includes("opera/") ? "Opera"
    : "Other";

  const os =
    s.includes("windows nt") ? "Windows"
    : s.includes("mac os x") ? "macOS"
    : s.includes("android")  ? "Android"
    : s.includes("iphone") || s.includes("ipad") ? "iOS"
    : s.includes("linux")    ? "Linux"
    : "Other";

  return { deviceType, browser, os };
}

export interface TrackInput {
  sessionId: string;
  path:      string;
  event?:    string;               // null → implicit page_view
  props?:    Record<string, unknown>;
  platform?: string;
  appVersion?: string;
  referrer?:   string;
  userAgent?:  string;
  customerId?: string;
}

export interface TrackBatchItem extends Omit<TrackInput, "sessionId"> {
  sessionId?: string;              // shared at batch level
}

// In-memory "currently online" snapshot, keyed by sessionId. Stored as
// the most-recent presence payload + a `lastSeen` timestamp so a new
// admin SSE connection can be replayed the live state without waiting
// for new page-view events. Sessions go stale after 3 minutes — same
// window the admin LivePresenceStrip uses client-side.
interface PresenceSnap {
  sessionId:  string;
  customerId: string | null;
  label:      string;
  path:       string;
  platform:   string | null;
  deviceType: string;
  browser:    string;
  os:         string;
  firstSeen:  string;
  lastSeen:   number;        // epoch ms — used for stale eviction
}

const PRESENCE_STALE_MS = 3 * 60 * 1000;

@Injectable()
export class PageViewsService {
  // Throttle re-announcements: a single session should beep ONCE per
  // window, not on every page view. We refresh the lastSeen timestamp
  // on every track so the admin-tab snapshot stays accurate.
  private readonly presence = new Map<string, PresenceSnap>();

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {
    // On startup, register a snapshot supplier with the realtime
    // service. Every time a new admin browser tab opens the public
    // SSE channel, we replay the active sessions so the "X on site
    // now" panel populates instantly without waiting for a fresh
    // page-view event.
    this.realtime.setPresenceSnapshotSupplier(() => {
      const now = Date.now();
      const out: Record<string, unknown>[] = [];
      for (const [k, v] of this.presence) {
        if (now - v.lastSeen > PRESENCE_STALE_MS) {
          this.presence.delete(k);
          continue;
        }
        out.push({
          sessionId:  v.sessionId,
          customerId: v.customerId,
          label:      v.label,
          path:       v.path,
          platform:   v.platform,
          deviceType: v.deviceType,
          browser:    v.browser,
          os:         v.os,
          firstSeen:  v.firstSeen,
        });
      }
      return out;
    });
  }

  async track(data: TrackInput) {
    const parsed = data.userAgent
      ? parseUA(data.userAgent)
      : { deviceType: "desktop", browser: "Unknown", os: "Unknown" };

    // The Flutter app sends a generic Dart user-agent that doesn't match the
    // mobile UA regex — but it DOES set `platform: "android" | "ios"` in the
    // body. Trust the explicit platform field and override the UA-derived
    // device fields so the activity feed shows "mobile · Flutter · Android"
    // instead of "desktop · Other · Other".
    const explicit = (data.platform ?? "").toLowerCase();
    const deviceType =
      explicit === "android" || explicit === "ios" ? "mobile"
      : explicit === "web-mobile"                  ? "mobile"
      : explicit === "tablet"                      ? "tablet"
      : parsed.deviceType;
    const browser =
      explicit === "android" || explicit === "ios" ? "Flutter App"
      : parsed.browser;
    const os =
      explicit === "android" ? "Android"
      : explicit === "ios"   ? "iOS"
      : parsed.os;

    await this.prisma.pageView.create({
      data: {
        sessionId:  data.sessionId,
        path:       data.path,
        event:      data.event ?? null,
        props:      (data.props ?? null) as any,
        platform:   data.platform ?? (deviceType === "mobile" ? "web-mobile" : "web"),
        appVersion: data.appVersion ?? null,
        referrer:   data.referrer ?? null,
        userAgent:  data.userAgent ?? null,
        deviceType,
        browser,
        os,
        customerId: data.customerId ?? null,
      },
    });

    // Live-presence beep — every NEW session triggers a "presence" event
    // on the realtime channel that the admin activity feed listens to.
    // De-duped via the in-memory `announcedSessions` set so a single
    // visitor doesn't beep on every page view, only when they arrive.
    await this.announcePresence(data, { deviceType, browser, os });

    return { ok: true };
  }

  private async announcePresence(
    data: TrackInput,
    derived: { deviceType: string; browser: string; os: string },
  ) {
    const key = data.sessionId;
    if (!key) return;

    const now = Date.now();
    const existing = this.presence.get(key);

    // Refresh the latest path / lastSeen on every track so the admin
    // snapshot stays accurate as the visitor navigates around. Only
    // the FIRST track for a session triggers a broadcast event (so the
    // admin LivePresenceStrip beeps once per arrival, not on every
    // page hop).
    if (existing && now - existing.lastSeen <= PRESENCE_STALE_MS) {
      existing.path     = data.path;
      existing.lastSeen = now;
      this.presence.set(key, existing);
      return;
    }

    // Resolve a friendly label so the admin feed can show "Paras (Mumbai)"
    // instead of an opaque session id.
    let label = "Anonymous visitor";
    if (data.customerId) {
      try {
        const c = await this.prisma.customer.findUnique({
          where: { id: data.customerId },
          select: { fullName: true, phone: true, email: true },
        });
        label = c?.fullName?.trim() || c?.phone || c?.email || "Customer";
      } catch { /* swallow */ }
    }

    const snap: PresenceSnap = {
      sessionId:  data.sessionId,
      customerId: data.customerId ?? null,
      label,
      path:       data.path,
      platform:   data.platform ?? null,
      deviceType: derived.deviceType,
      browser:    derived.browser,
      os:         derived.os,
      firstSeen:  new Date().toISOString(),
      lastSeen:   now,
    };
    this.presence.set(key, snap);

    // Bound memory — drop the oldest entries if the map grows past
    // 5000 active sessions (well past anything we'd hit at our scale).
    if (this.presence.size > 5000) {
      const oldest = [...this.presence.entries()]
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
        .slice(0, this.presence.size - 5000)
        .map(([k]) => k);
      for (const k of oldest) this.presence.delete(k);
    }

    this.realtime.publishGlobal("presence", {
      sessionId:   snap.sessionId,
      customerId:  snap.customerId,
      label:       snap.label,
      path:        snap.path,
      platform:    snap.platform,
      deviceType:  snap.deviceType,
      browser:     snap.browser,
      os:          snap.os,
      firstSeen:   snap.firstSeen,
    });
  }

  /**
   * Bulk-ingest events from a mobile flush. Mobile batches events in-memory
   * + flushes every 10s or on app-backgrounding to cut network chatter.
   * Returns the number of events successfully written.
   */
  async trackBatch(sessionId: string, items: TrackBatchItem[], meta: {
    userAgent?: string;
    platform?:  string;
    appVersion?: string;
    customerId?: string;
  }) {
    if (!items?.length) return { ok: true, count: 0 };

    const parsed = meta.userAgent
      ? parseUA(meta.userAgent)
      : { deviceType: "mobile", browser: "App", os: "Unknown" };

    // Trust the explicit `platform` field over the user-agent regex — Flutter
    // sends a generic Dart UA but always sets platform="android"|"ios".
    const explicit = (meta.platform ?? "").toLowerCase();
    const deviceType =
      explicit === "android" || explicit === "ios" ? "mobile"
      : explicit === "web-mobile"                  ? "mobile"
      : explicit === "tablet"                      ? "tablet"
      : parsed.deviceType;
    const browser =
      explicit === "android" || explicit === "ios" ? "Flutter App"
      : parsed.browser;
    const os =
      explicit === "android" ? "Android"
      : explicit === "ios"   ? "iOS"
      : parsed.os;

    // `createMany` doesn't support Json? well on some PG versions when mixed
    // null + object — use individual creates for safety. 20-event batches
    // are cheap anyway.
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.pageView.create({
          data: {
            sessionId:  it.sessionId ?? sessionId,
            path:       it.path,
            event:      it.event ?? null,
            props:      (it.props ?? null) as any,
            platform:   it.platform   ?? meta.platform   ?? "mobile",
            appVersion: it.appVersion ?? meta.appVersion ?? null,
            userAgent:  it.userAgent  ?? meta.userAgent  ?? null,
            deviceType,
            browser,
            os,
            customerId: it.customerId ?? meta.customerId ?? null,
          },
        }),
      ),
    );
    return { ok: true, count: items.length };
  }

  /**
   * Aggregate summary for the admin observability dashboard.
   *
   * Returns:
   *   - totalEvents       — total rows in window
   *   - uniqueSessions    — distinct sessionIds
   *   - uniqueCustomers   — distinct non-null customerIds
   *   - byEvent[]         — {event, count} sorted desc
   *   - byPlatform[]      — {platform, count}
   *   - byDay[]           — {date: YYYY-MM-DD, count}
   *   - topPaths[]        — {path, count} (page_view events only)
   *   - funnel            — home_view → category_tap → product_view →
   *                         add_to_cart → checkout_start → checkout_success
   */
  async getSummary(days = 7) {
    const d = Math.max(1, Math.min(90, Math.floor(days)));
    const since = new Date(Date.now() - d * 86_400_000);

    const whereBase = { createdAt: { gte: since } };

    const [
      totalEvents,
      uniqueSessions,
      uniqueCustomers,
      byEventRaw,
      byPlatformRaw,
      topPathsRaw,
      rowsForFunnel,
      dailyCounts,
    ] = await Promise.all([
      this.prisma.pageView.count({ where: whereBase }),
      this.prisma.pageView.findMany({
        where: whereBase,
        distinct: ["sessionId"],
        select: { sessionId: true },
      }).then((r) => r.length),
      this.prisma.pageView.findMany({
        where: { ...whereBase, customerId: { not: null } },
        distinct: ["customerId"],
        select: { customerId: true },
      }).then((r) => r.length),
      this.prisma.pageView.groupBy({
        by: ["event"],
        where: whereBase,
        _count: { _all: true },
      }),
      this.prisma.pageView.groupBy({
        by: ["platform"],
        where: whereBase,
        _count: { _all: true },
      }),
      this.prisma.pageView.groupBy({
        by: ["path"],
        where: { ...whereBase, event: null },
        _count: { _all: true },
        orderBy: { _count: { path: "desc" } },
        take: 10,
      }),
      // For funnel — count unique sessions that fired each of the funnel events
      this.prisma.pageView.findMany({
        where: {
          ...whereBase,
          event: {
            in: [
              "home_view",
              "category_tap",
              "product_view",
              "add_to_cart",
              "checkout_start",
              "checkout_success",
            ],
          },
        },
        select: { event: true, sessionId: true },
      }),
      // Daily event counts
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "created_at") AS day, COUNT(*)::bigint AS count
        FROM page_views
        WHERE "created_at" >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    // ── Funnel: sessions that hit each stage
    const funnelStages = [
      "home_view", "category_tap", "product_view",
      "add_to_cart", "checkout_start", "checkout_success",
    ];
    const sessionsByEvent = new Map<string, Set<string>>();
    for (const row of rowsForFunnel) {
      if (!row.event) continue;
      const set = sessionsByEvent.get(row.event) ?? new Set<string>();
      set.add(row.sessionId);
      sessionsByEvent.set(row.event, set);
    }
    const funnel = funnelStages.map((ev) => ({
      event: ev,
      sessions: sessionsByEvent.get(ev)?.size ?? 0,
    }));

    return {
      windowDays: d,
      totalEvents,
      uniqueSessions,
      uniqueCustomers,
      byEvent: byEventRaw
        .map((r) => ({ event: r.event ?? "page_view", count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      byPlatform: byPlatformRaw.map((r) => ({
        platform: r.platform ?? "unknown",
        count: r._count._all,
      })),
      topPaths: topPathsRaw.map((r) => ({
        path: r.path,
        count: r._count._all,
      })),
      byDay: dailyCounts.map((r) => ({
        date:  r.day.toISOString().slice(0, 10),
        count: Number(r.count),
      })),
      funnel,
    };
  }

  /**
   * Live activity feed — recent events with formatted human-readable
   * descriptions. Joins page_views with customer details so the admin
   * can see "+91… (Aman, Mumbai)" instead of an opaque session ID.
   *
   * Returns at most `limit` rows ordered newest-first, with each row
   * tagged with platform (web/android/ios) and customer info if logged in.
   *
   * Scalability:
   *   • Default window: last 24 hours. Caller can pass `hours` up to 720 (30d).
   *     This keeps the feed responsive even with 1M+ events stored.
   *   • Always uses the (createdAt) index via `orderBy desc + take limit`.
   *   • Use `event` or `sessionId` filters to drill down further.
   */
  async getActivityFeed(opts: {
    limit?: number;
    event?: string;
    sessionId?: string;
    customerId?: string;
    hours?: number;
    /** "new" | "returning" | "anon" | "anon-new" */
    userType?: string;
  } = {}) {
    const limit = Math.min(opts.limit ?? 200, 1000);
    // Default to last 24h to keep the feed fast even with millions of rows.
    const hours = Math.max(1, Math.min(opts.hours ?? 24, 720));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const where: any = { createdAt: { gte: since } };
    if (opts.event)      where.event      = opts.event;
    if (opts.sessionId)  where.sessionId  = opts.sessionId;
    if (opts.customerId) where.customerId = opts.customerId;
    // Hard SQL-level filter for logged-in vs anonymous when userType is set:
    if (opts.userType === "new" || opts.userType === "returning") {
      where.customerId = where.customerId ?? { not: null };
    } else if (opts.userType === "anon" || opts.userType === "anon-new") {
      where.customerId = null;
    }

    const [rows, totalInWindow] = await Promise.all([
      this.prisma.pageView.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id:         true,
          sessionId:  true,
          path:       true,
          event:      true,
          props:      true,
          platform:   true,
          appVersion: true,
          deviceType: true,
          browser:    true,
          os:         true,
          userAgent:  true,
          country:    true,
          city:       true,
          customerId: true,
          createdAt:  true,
        },
      }),
      // Total count in the same window — gives the admin a sense of
      // throughput when the feed is truncated to `limit`.
      this.prisma.pageView.count({ where }),
    ]);

    // Bulk-fetch customer details (incl. metadata for city + createdAt for
    // new/returning classification) in ONE query.
    const customerIds = Array.from(
      new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x)),
    );
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: {
            id: true, fullName: true, phone: true, email: true,
            metadata: true, createdAt: true,
          },
        })
      : [];
    const custMap = new Map(customers.map((c) => [c.id, c]));

    // Anon sessions: tag "new" if no event for that session exists before the
    // window. One batched query for all anon sessions in this page.
    const anonSessionIds = Array.from(new Set(
      rows.filter((r) => !r.customerId).map((r) => r.sessionId),
    ));
    const olderAnon = anonSessionIds.length
      ? await this.prisma.pageView.findMany({
          where: {
            sessionId: { in: anonSessionIds },
            createdAt: { lt: since },
          },
          distinct: ["sessionId"],
          select: { sessionId: true },
        })
      : [];
    const knownAnonSessions = new Set(olderAnon.map((r) => r.sessionId));
    const NEW_CUSTOMER_WINDOW_MS = 7 * 86_400_000;
    const newCustomerCutoff = Date.now() - NEW_CUSTOMER_WINDOW_MS;

    const items = rows.map((r) => {
      const cust = r.customerId ? custMap.get(r.customerId) : null;
      // City: prefer customer.metadata.city (set via birthday popup), fall
      // back to event-time city captured in page_views row.
      let userCity = "";
      if (cust) {
        const meta = (cust.metadata as Record<string, unknown> | null) ?? {};
        if (typeof meta.city === "string") userCity = meta.city;
      }
      if (!userCity && r.city) userCity = r.city;

      // Format: "Mobile (Name, City)" — e.g. "+919876543210 (Rohan, Mumbai)"
      let userLabel: string;
      if (cust) {
        const phone = cust.phone || cust.email || "Customer";
        const name  = cust.fullName || cust.email || "";
        const inner = [name, userCity].filter((s) => !!s && s.trim().length > 0).join(", ");
        userLabel = inner ? `${phone} (${inner})` : phone;
      } else {
        userLabel = `Anon (${r.sessionId.slice(-6)})`;
      }

      // Tag user type for color-coding in the UI.
      let userType: "new" | "returning" | "anon-new" | "anon";
      if (cust) {
        userType = cust.createdAt.getTime() >= newCustomerCutoff
          ? "new"
          : "returning";
      } else {
        userType = knownAnonSessions.has(r.sessionId) ? "anon" : "anon-new";
      }

      // Format human-readable description from event + props
      const description = formatEventDescription({
        event:    r.event,
        path:     r.path,
        props:    r.props as Record<string, unknown> | null,
        platform: r.platform,
      });

      return {
        id:          r.id,
        sessionId:   r.sessionId,
        path:        r.path,
        event:       r.event ?? "page_view",
        props:       r.props,
        platform:    r.platform ?? "web",
        appVersion:  r.appVersion,
        device:      `${r.deviceType ?? "desktop"} · ${r.browser ?? ""} · ${r.os ?? ""}`,
        location:    [r.city, r.country].filter(Boolean).join(", ") || null,
        customer: cust
          ? {
              id: cust.id,
              name: cust.fullName,
              phone: cust.phone,
              email: cust.email,
              city: userCity || null,
            }
          : null,
        userLabel,
        userType,
        description,
        createdAt:   r.createdAt.toISOString(),
      };
    });

    // Post-filter for fine-grained userType (new vs returning, anon-new vs anon).
    // The SQL where-clause already narrowed logged-in vs anon; this final pass
    // keeps only the rows whose computed userType matches the requested one.
    const filtered = (opts.userType === "new" ||
                      opts.userType === "returning" ||
                      opts.userType === "anon-new" ||
                      opts.userType === "anon")
      ? items.filter((it) => it.userType === opts.userType)
      : items;

    return {
      items: filtered,
      meta: {
        windowHours: hours,
        totalInWindow,
        returned: filtered.length,
        truncated: totalInWindow > filtered.length,
      },
    };
  }

  /**
   * User-grouped activity — one row per (customerId or sessionId) with their
   * total event count, last seen timestamp, last event description, and
   * platform mix. Lets the admin pick a user and drill into their timeline.
   *
   * Scales the same way as the live feed — bounded by `hours` window so
   * even with billions of total events, this query only scans recent ones.
   */
  async getUserActivity(opts: {
    hours?: number;
    limit?: number;
    customerOnly?: boolean;
    /** "new" | "returning" | "anon" | "anon-new" */
    userType?: string;
  } = {}) {
    const hours = Math.max(1, Math.min(opts.hours ?? 24, 720));
    const limit = Math.min(opts.limit ?? 100, 500);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Group by sessionId (catches both anon and logged-in). For logged-in users
    // we'll merge sessions later by customerId so one customer with multiple
    // sessions/devices shows as one row.
    const where: any = { createdAt: { gte: since } };
    if (opts.customerOnly) where.customerId = { not: null };
    // SQL-narrow logged-in vs anon when userType filter is requested
    if (opts.userType === "new" || opts.userType === "returning") {
      where.customerId = where.customerId ?? { not: null };
    } else if (opts.userType === "anon" || opts.userType === "anon-new") {
      where.customerId = null;
    }

    const grouped = await this.prisma.pageView.groupBy({
      by: ["sessionId", "customerId"],
      where,
      _count: { _all: true },
      _max:   { createdAt: true },
    });

    // Merge by customerId — a logged-in user may span multiple sessions/devices.
    type Bucket = {
      key:        string;          // customerId or sessionId
      customerId: string | null;
      sessionId:  string;          // most recent session
      eventCount: number;
      lastSeen:   Date;
      sessions:   Set<string>;
    };
    const byKey = new Map<string, Bucket>();
    for (const g of grouped) {
      const key = g.customerId || `s:${g.sessionId}`;
      const ts = g._max.createdAt ?? since;
      const existing = byKey.get(key);
      if (existing) {
        existing.eventCount += g._count._all;
        existing.sessions.add(g.sessionId);
        if (ts > existing.lastSeen) {
          existing.lastSeen = ts;
          existing.sessionId = g.sessionId;
        }
      } else {
        byKey.set(key, {
          key,
          customerId: g.customerId,
          sessionId:  g.sessionId,
          eventCount: g._count._all,
          lastSeen:   ts,
          sessions:   new Set([g.sessionId]),
        });
      }
    }

    // Sort by lastSeen desc, take top N
    const sorted = Array.from(byKey.values())
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, limit);

    // Bulk-fetch customers + last event per user for label/description.
    const customerIds = sorted
      .map((b) => b.customerId)
      .filter((id): id is string => !!id);
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, fullName: true, phone: true, email: true, metadata: true },
        })
      : [];
    const custMap = new Map(customers.map((c) => [c.id, c]));

    // Last event per user — one query, group again by sessionId taking the
    // newest event from each. We fetch the most-recent N events in the window
    // and pick out one per session as we iterate (cheap).
    const recent = await this.prisma.pageView.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 2000, // enough to cover most active users in the window
      select: {
        sessionId: true, customerId: true, event: true, path: true,
        props: true, platform: true, appVersion: true,
      },
    });
    const lastEventByKey = new Map<string, typeof recent[number]>();
    for (const r of recent) {
      const k = r.customerId || `s:${r.sessionId}`;
      if (!lastEventByKey.has(k)) lastEventByKey.set(k, r);
    }

    // Fetch customer.createdAt so we can tag NEW vs RETURNING customers.
    const customerCreatedAtMap = new Map<string, Date>();
    if (customerIds.length) {
      const rows = await this.prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, createdAt: true },
      });
      for (const r of rows) customerCreatedAtMap.set(r.id, r.createdAt);
    }

    // For anon sessions: a session is "new" if it has NO events older than
    // `since` — i.e. their first event in our system fell within this window.
    // We do a single batch query for all anon sessions to keep this O(1).
    const anonSessionIds = sorted
      .filter((b) => !b.customerId)
      .map((b) => b.sessionId);
    const olderAnon = anonSessionIds.length
      ? await this.prisma.pageView.findMany({
          where: {
            sessionId: { in: anonSessionIds },
            createdAt: { lt: since },
          },
          distinct: ["sessionId"],
          select: { sessionId: true },
        })
      : [];
    const knownAnonSessions = new Set(olderAnon.map((r) => r.sessionId));

    // "New customer" threshold: signed up within the last 7 days.
    const NEW_CUSTOMER_WINDOW_MS = 7 * 86_400_000;
    const newCustomerCutoff = Date.now() - NEW_CUSTOMER_WINDOW_MS;

    const mapped = sorted.map((b) => {
      const cust = b.customerId ? custMap.get(b.customerId) : null;
      const meta = (cust?.metadata as Record<string, unknown> | null) ?? {};
      const city = typeof meta.city === "string" ? meta.city : null;

      let userLabel: string;
      if (cust) {
        const phone = cust.phone || cust.email || "Customer";
        const name  = cust.fullName || cust.email || "";
        const inner = [name, city].filter((s) => !!s && s.trim().length > 0).join(", ");
        userLabel = inner ? `${phone} (${inner})` : phone;
      } else {
        userLabel = `Anon (${b.sessionId.slice(-6)})`;
      }

      // Classify user type:
      //   "new"       — signed up in the last 7 days (excited, courting them)
      //   "returning" — logged-in customer signed up earlier
      //   "anon-new"  — first time we've seen this anon session
      //   "anon"      — anon session that has older events on file
      let userType: "new" | "returning" | "anon-new" | "anon";
      if (cust) {
        const createdAt = customerCreatedAtMap.get(cust.id);
        userType = createdAt && createdAt.getTime() >= newCustomerCutoff
          ? "new"
          : "returning";
      } else {
        userType = knownAnonSessions.has(b.sessionId) ? "anon" : "anon-new";
      }

      const last = lastEventByKey.get(b.key);
      const lastDescription = last
        ? formatEventDescription({
            event:    last.event,
            path:     last.path,
            props:    last.props as Record<string, unknown> | null,
            platform: last.platform,
          })
        : "";

      return {
        key:             b.key,
        customerId:      b.customerId,
        sessionId:       b.sessionId, // most recent session
        sessionsCount:   b.sessions.size,
        userLabel,
        userType,
        eventCount:      b.eventCount,
        lastSeen:        b.lastSeen.toISOString(),
        lastDescription,
        platform:        last?.platform ?? null,
        appVersion:      last?.appVersion ?? null,
        customer: cust ? {
          id: cust.id, name: cust.fullName, phone: cust.phone,
          email: cust.email, city,
          createdAt: cust && customerCreatedAtMap.get(cust.id)?.toISOString() || null,
        } : null,
      };
    });

    // Final fine-grained userType filter (post-mapping)
    return (opts.userType === "new" ||
            opts.userType === "returning" ||
            opts.userType === "anon-new" ||
            opts.userType === "anon")
      ? mapped.filter((u) => u.userType === opts.userType)
      : mapped;
  }

  /**
   * Pruning — delete events older than `daysToKeep` (default 90 days).
   *
   * Called from a daily cron via POST /admin/analytics/prune-old. Keeps the
   * `page_views` table size bounded indefinitely.
   *
   * IMPORTANT: should only run AFTER `rollupDaily` has captured the day being
   * pruned, otherwise historical reporting loses data.
   *
   * Returns the number of rows deleted.
   */
  async pruneOld(daysToKeep = 90): Promise<{ ok: true; deleted: number; cutoff: string }> {
    const days = Math.max(7, Math.min(365, Math.floor(daysToKeep)));
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const res = await this.prisma.pageView.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { ok: true, deleted: res.count, cutoff: cutoff.toISOString() };
  }

  /**
   * Daily rollup — aggregate the previous day's events into the
   * `page_view_daily_summary` table for fast dashboard queries.
   *
   * Idempotent — re-running for the same day re-counts and upserts. Default
   * target: yesterday (UTC). Pass `targetDate` (ISO yyyy-MM-dd) to backfill
   * a specific day.
   *
   * Hook to a daily cron (~01:00 UTC) via POST /admin/analytics/rollup-daily.
   */
  async rollupDaily(targetDateIso?: string): Promise<{
    ok: true;
    date: string;
    inserted: number;
  }> {
    // Default: yesterday (UTC)
    const target = targetDateIso ? new Date(targetDateIso) : new Date(Date.now() - 86_400_000);
    const dayStart = new Date(Date.UTC(
      target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 0, 0, 0, 0,
    ));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    // Group counts by (event, platform). NULL event becomes 'page_view'.
    // We compute uniqueSessions / uniqueCustomers per group separately.
    const grouped = await this.prisma.pageView.groupBy({
      by: ["event", "platform"],
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
      _count: { _all: true },
    });

    // For each group, fetch distinct sessions + customers in a single roundtrip.
    // (Prisma doesn't support COUNT DISTINCT in groupBy yet — workaround.)
    let inserted = 0;
    for (const row of grouped) {
      const eventName = row.event ?? "page_view";
      const platform = row.platform ?? "unknown";
      const where = {
        createdAt: { gte: dayStart, lt: dayEnd },
        event:    row.event,
        platform: row.platform,
      };
      const [sessions, customers] = await Promise.all([
        this.prisma.pageView.findMany({
          where,
          distinct: ["sessionId"],
          select: { sessionId: true },
        }).then((rs) => rs.length),
        this.prisma.pageView.findMany({
          where: { ...where, customerId: { not: null } },
          distinct: ["customerId"],
          select: { customerId: true },
        }).then((rs) => rs.length),
      ]);

      // Upsert — re-running for same day overwrites the prior counts.
      await this.prisma.pageViewDailySummary.upsert({
        where: {
          date_event_platform: {
            date:     dayStart,
            event:    eventName,
            platform,
          },
        },
        create: {
          date:            dayStart,
          event:           eventName,
          platform,
          count:           row._count._all,
          uniqueSessions:  sessions,
          uniqueCustomers: customers,
        },
        update: {
          count:           row._count._all,
          uniqueSessions:  sessions,
          uniqueCustomers: customers,
        },
      });
      inserted++;
    }

    return { ok: true, date: dayStart.toISOString().slice(0, 10), inserted };
  }

  async getViews(since: Date, limit = 5000) {
    const rows = await this.prisma.pageView.findMany({
      where:   { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take:    Math.min(limit, 10_000),
      select: {
        id:         true,
        sessionId:  true,
        path:       true,
        referrer:   true,
        deviceType: true,
        browser:    true,
        os:         true,
        country:    true,
        region:     true,
        city:       true,
        createdAt:  true,
      },
    });

    // Return field names matching what the analytics page expects
    return rows.map(r => ({
      id:          r.id,
      session_id:  r.sessionId,
      page_path:   r.path,
      referrer:    r.referrer ?? "",
      device_type: r.deviceType ?? "desktop",
      browser:     r.browser ?? "Unknown",
      os:          r.os ?? "Unknown",
      country:     r.country ?? "",
      region:      r.region ?? "",
      city:        r.city ?? "",
      created_at:  r.createdAt.toISOString(),
    }));
  }
}

"use client";

/**
 * Activity Feed — live stream of every user action (web + Flutter).
 *
 * Two views:
 *   • Live Feed — chronological event stream
 *   • By User   — group events per user, click to see their full timeline
 *
 * Filters: time window, event type, user type (new / returning / anonymous).
 * Export: CSV download of current visible rows.
 *
 * Auto-refreshes every 10s while in Live Feed mode.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Activity, RefreshCw, Search, Smartphone, Globe, ChevronDown,
  ShoppingCart, Heart, AlertTriangle, Wand2, LogIn, Eye, X,
  Users, Download, Sparkles, UserCircle,
} from "lucide-react";
import { adminGet } from "@/lib/admin-api";
import LivePresenceStrip from "./LivePresenceStrip";

// ── Types ────────────────────────────────────────────────────────────────────
type UserType = "new" | "returning" | "anon-new" | "anon";

interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  createdAt?: string | null;
}

interface ActivityRow {
  id:          string;
  sessionId:   string;
  path:        string;
  event:       string;
  props:       Record<string, unknown> | null;
  platform:    string;
  appVersion:  string | null;
  device:      string;
  location:    string | null;
  customer:    Customer | null;
  userLabel:   string;
  userType:    UserType;
  description: string;
  createdAt:   string;
}

interface ActivityResponse {
  items: ActivityRow[];
  meta:  {
    windowHours:    number;
    totalInWindow:  number;
    returned:       number;
    truncated:      boolean;
  };
}

interface UserRow {
  key:             string;
  customerId:      string | null;
  sessionId:       string;
  sessionsCount:   number;
  userLabel:       string;
  userType:        UserType;
  eventCount:      number;
  lastSeen:        string;
  lastDescription: string;
  platform:        string | null;
  appVersion:      string | null;
  customer:        Customer | null;
}

// Window options (hours).
const WINDOW_OPTIONS = [
  { value: 1,    label: "Last 1 hour"   },
  { value: 6,    label: "Last 6 hours"  },
  { value: 24,   label: "Last 24 hours" },
  { value: 72,   label: "Last 3 days"   },
  { value: 168,  label: "Last 7 days"   },
  { value: 720,  label: "Last 30 days"  },
];

const EVENT_FILTERS = [
  { value: "",                  label: "All events"            },
  { value: "purchase",          label: "Purchases"             },
  { value: "checkout_success",  label: "Checkout success"      },
  { value: "checkout_start",    label: "Checkout started"      },
  { value: "cart_abandon",      label: "Cart abandoned"        },
  { value: "add_to_cart",       label: "Add to cart"           },
  { value: "customize_start",   label: "Customizer started"    },
  { value: "customize_save",    label: "Customizer saved"      },
  { value: "customize_abandon", label: "Customizer abandoned"  },
  { value: "wishlist_add",      label: "Wishlist add"          },
  { value: "product_view",      label: "Product views"         },
  { value: "error",             label: "Errors"                },
  { value: "payment_failed",    label: "Payment failures"      },
  { value: "payment_dismissed", label: "Payment cancellations" },
  { value: "404_view",          label: "404s (broken links)"   },
  { value: "login",             label: "Logins"                },
  { value: "page_view",         label: "Page views"            },
];

const USER_TYPE_FILTERS = [
  { value: "",          label: "All users"            },
  { value: "new",       label: "✨ New (signed up <7d)" },
  { value: "returning", label: "🔁 Returning"         },
  { value: "anon-new",  label: "👻 Anonymous (new)"   },
  { value: "anon",      label: "👤 Anonymous (seen before)" },
];

// User-type → color tag styles
const USER_TYPE_STYLES: Record<UserType, { bg: string; text: string; label: string }> = {
  "new":        { bg: "bg-emerald-500/15", text: "text-emerald-600", label: "NEW" },
  "returning":  { bg: "bg-blue-500/15",     text: "text-blue-600",    label: "RETURNING" },
  "anon-new":   { bg: "bg-purple-500/15",   text: "text-purple-600",  label: "NEW · ANON" },
  "anon":       { bg: "bg-slate-500/15",    text: "text-slate-600",   label: "ANON" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)        return `${Math.floor(ms/1000)}s ago`;
  if (ms < 3_600_000)     return `${Math.floor(ms/60_000)}m ago`;
  if (ms < 86_400_000)    return `${Math.floor(ms/3_600_000)}h ago`;
  return `${Math.floor(ms/86_400_000)}d ago`;
}

function platformIcon(platform: string | null) {
  if (platform === "android" || platform === "ios" || platform === "mobile") return Smartphone;
  return Globe;
}

function platformBadge(platform: string | null) {
  switch (platform) {
    case "android":     return { bg: "bg-emerald-500/15", text: "text-emerald-600", label: "Android" };
    case "ios":         return { bg: "bg-slate-500/15",   text: "text-slate-600",   label: "iOS" };
    case "web":         return { bg: "bg-blue-500/15",    text: "text-blue-600",    label: "Web" };
    case "web-mobile":  return { bg: "bg-blue-500/15",    text: "text-blue-600",    label: "Web (Mobile)" };
    default:            return { bg: "bg-muted",           text: "text-muted-foreground", label: platform ?? "—" };
  }
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);
  const header = cols.map(csvCell).join(",");
  const body   = rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")).join("\n");
  const csv    = `﻿${header}\n${body}`; // BOM for Excel UTF-8
  const blob   = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ActivityFeedPage() {
  const [tab, setTab]             = useState<"feed" | "users">("feed");
  const [rows, setRows]           = useState<ActivityRow[]>([]);
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [meta, setMeta]           = useState<ActivityResponse["meta"] | null>(null);
  const [loading, setLoading]     = useState(true);
  const [eventFilter, setEvent]   = useState("");
  const [userTypeF, setUserType]  = useState("");
  const [search, setSearch]       = useState("");
  const [auto, setAuto]           = useState(true);
  const [windowHours, setWindow]  = useState(24);
  const [activeRow, setActive]    = useState<ActivityRow | null>(null);
  // Drill-down: when a user is selected, show their timeline
  const [drillUser, setDrill]     = useState<UserRow | null>(null);
  // User-controlled fetch size. 1000 is the default sweet-spot for the
  // 500-concurrent-user target (DOM stays snappy, peak hour visible);
  // 5000 is the server hard-cap and matches the admin's heaviest scan.
  // Persisted across reloads via localStorage.
  const [pageLimit, setPageLimit] = useState<number>(() => {
    if (typeof window === "undefined") return 1000;
    const saved = parseInt(window.localStorage.getItem("gifteeng.feedLimit") ?? "1000", 10);
    return [300, 1000, 2000, 5000].includes(saved) ? saved : 1000;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("gifteeng.feedLimit", String(pageLimit));
    }
  }, [pageLimit]);

  const fetchData = async () => {
    if (tab === "feed") {
      // Per-fetch row count is now driven by the in-page selector
      // (`pageLimit`), persisted across sessions in localStorage.
      // Server hard-cap is 5000 — enforced in
      // apps/api/src/modules/page-views/page-views.controller.ts.
      // If/when 5000 starts feeling slow on the client, wrap the list
      // in react-window (virtual scrolling) — the data shape is
      // already stable so it's a 30-line change.
      const qs = new URLSearchParams({
        limit: String(pageLimit),
        hours: String(windowHours),
      });
      if (eventFilter) qs.set("event", eventFilter);
      if (userTypeF)   qs.set("userType", userTypeF);
      if (drillUser?.customerId) qs.set("customerId", drillUser.customerId);
      else if (drillUser?.sessionId) qs.set("sessionId", drillUser.sessionId);

      const data = await adminGet<ActivityResponse | ActivityRow[]>(
        `/admin/analytics/activity?${qs.toString()}`,
        { items: [], meta: { windowHours, totalInWindow: 0, returned: 0, truncated: false } },
      );
      if (Array.isArray(data)) {
        setRows(data); setMeta(null);
      } else {
        setRows(data.items ?? []); setMeta(data.meta ?? null);
      }
    } else {
      const qs = new URLSearchParams({
        limit: "200",
        hours: String(windowHours),
      });
      if (userTypeF) qs.set("userType", userTypeF);
      const data = await adminGet<UserRow[]>(`/admin/analytics/users?${qs.toString()}`, []);
      setUsers(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ },
    [tab, eventFilter, userTypeF, windowHours, drillUser, pageLimit]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(fetchData, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [auto, tab, eventFilter, userTypeF, windowHours, drillUser, pageLimit]);

  const filteredFeed = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.description.toLowerCase().includes(q) ||
      r.userLabel.toLowerCase().includes(q) ||
      r.path.toLowerCase().includes(q) ||
      (r.customer?.phone ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) =>
      u.userLabel.toLowerCase().includes(q) ||
      u.lastDescription.toLowerCase().includes(q) ||
      (u.customer?.phone ?? "").toLowerCase().includes(q) ||
      (u.customer?.email ?? "").toLowerCase().includes(q) ||
      (u.customer?.name ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  const stats = useMemo(() => {
    const data = tab === "feed" ? rows : users;
    let logged = 0, anon = 0, newU = 0, returning = 0;
    for (const r of data as { userType: UserType }[]) {
      if (r.userType === "new")            newU++;
      else if (r.userType === "returning") returning++;
      else                                 anon++;
      if (r.userType === "new" || r.userType === "returning") logged++;
    }
    let purchases = 0, errors = 0, paymentFails = 0, notFounds = 0;
    if (tab === "feed") {
      for (const r of rows) {
        if (r.event === "purchase" || r.event === "checkout_success") purchases++;
        if (r.event === "error") errors++;
        if (r.event === "payment_failed") paymentFails++;
        if (r.event === "404_view") notFounds++;
      }
    }
    return { logged, anon, newU, returning, purchases, errors, paymentFails, notFounds };
  }, [rows, users, tab]);

  const handleExport = () => {
    if (tab === "feed") {
      downloadCSV(
        `activity-feed_${new Date().toISOString().slice(0,10)}.csv`,
        filteredFeed.map((r) => ({
          when:          r.createdAt,
          user:          r.userLabel,
          userType:      r.userType,
          event:         r.event,
          description:   r.description,
          path:          r.path,
          platform:      r.platform,
          appVersion:    r.appVersion ?? "",
          device:        r.device,
          location:      r.location ?? "",
          phone:         r.customer?.phone ?? "",
          email:         r.customer?.email ?? "",
          city:          r.customer?.city ?? "",
          customerId:    r.customer?.id ?? "",
          sessionId:     r.sessionId,
        })),
      );
    } else {
      downloadCSV(
        `users-activity_${new Date().toISOString().slice(0,10)}.csv`,
        filteredUsers.map((u) => ({
          user:          u.userLabel,
          userType:      u.userType,
          eventCount:    u.eventCount,
          lastSeen:      u.lastSeen,
          lastEvent:     u.lastDescription,
          platform:      u.platform ?? "",
          appVersion:    u.appVersion ?? "",
          phone:         u.customer?.phone ?? "",
          email:         u.customer?.email ?? "",
          city:          u.customer?.city ?? "",
          customerId:    u.customerId ?? "",
          sessionId:     u.sessionId,
          sessionsCount: u.sessionsCount,
        })),
      );
    }
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-4">
      {/* Local keyframes for the error-attention banner */}
      <style jsx global>{`
        @keyframes pulse-attention {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
          50%      { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.18); }
        }
      `}</style>

      {/* Live presence — beeps + lists customers currently on the site */}
      <LivePresenceStrip />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#EF3752]" />
            Activity Feed
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live stream of every user action across web &amp; Flutter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-card border border-border hover:bg-muted transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={() => setAuto((a) => !a)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
              auto
                ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${auto ? "animate-spin" : ""}`} />
            {auto ? "Live" : "Paused"}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-card border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        <button
          onClick={() => { setTab("feed"); setDrill(null); }}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 ${
            tab === "feed" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="w-3.5 h-3.5" /> Live Feed
        </button>
        <button
          onClick={() => { setTab("users"); setDrill(null); }}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 ${
            tab === "users" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="w-3.5 h-3.5" /> By User
        </button>
      </div>

      {/* Drill-down banner */}
      {drillUser && (
        <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-blue-600" />
          <span className="text-xs">
            Showing only events for <span className="font-bold">{drillUser.userLabel}</span>
          </span>
          <button onClick={() => setDrill(null)}
            className="ml-auto text-xs font-bold text-blue-600 hover:underline">
            Show all events
          </button>
        </div>
      )}

      {/* Stat chips */}
      <div className="flex flex-wrap gap-2">
        {meta && tab === "feed" && (
          <StatChip
            label={`Events in last ${meta.windowHours}h`}
            value={meta.totalInWindow}
            color="text-foreground"
          />
        )}
        <StatChip label={tab === "feed" ? "Showing events" : "Users in window"}
                  value={tab === "feed" ? rows.length : users.length} />
        <StatChip label="✨ New"        value={stats.newU}      color="text-emerald-600" />
        <StatChip label="🔁 Returning"  value={stats.returning} color="text-blue-600" />
        <StatChip label="👻 Anonymous"  value={stats.anon}      color="text-slate-600" />
        {tab === "feed" && (
          <>
            <StatChip label="Purchases"        value={stats.purchases}    color="text-emerald-600" />
            <StatChip label="Errors"           value={stats.errors}       color="text-red-600" />
            <StatChip label="Payment failures" value={stats.paymentFails} color="text-red-600" />
            <StatChip label="404s"             value={stats.notFounds}    color="text-amber-600" />
          </>
        )}
      </div>

      {/* ── Error alert — pinned at top when errors are present ──────────── */}
      {tab === "feed" && stats.errors > 0 && eventFilter !== "error" && (
        <button
          onClick={() => setEvent("error")}
          className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-red-500/40 bg-red-500/10 hover:bg-red-500/15 transition-colors"
          style={{ animation: "pulse-attention 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}
        >
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-red-700 dark:text-red-400">
              {stats.errors} error{stats.errors === 1 ? "" : "s"} in the last {windowHours}h —
              click to investigate
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80">
              Users encountered API or app errors. Filter shows status codes, paths, and full error messages.
            </p>
          </div>
          <span className="text-[10px] font-black text-red-600 underline">VIEW →</span>
        </button>
      )}

      {meta?.truncated && tab === "feed" && (
        <div className="text-[11px] text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-lg">
          Showing newest {meta.returned} of {meta.totalInWindow.toLocaleString()} events. Narrow the time range or use filters to see specific events.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "feed"
              ? "Search by user, phone, page, or description…"
              : "Search by user, phone, email, or last action…"}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-border text-sm"
          />
        </div>
        <FilterSelect value={String(windowHours)} onChange={(v) => setWindow(Number(v))}
          options={WINDOW_OPTIONS.map((w) => ({ value: String(w.value), label: w.label }))} />
        <FilterSelect value={userTypeF} onChange={setUserType} options={USER_TYPE_FILTERS} />
        {tab === "feed" && (
          <>
            {/* Page-size selector. Default 1000, server hard-cap 5000.
                Persists in localStorage so admins keep their preference
                across reloads. Pick 5000 during peak-traffic windows
                (sale launches), 300 for a quick scan. */}
            <FilterSelect
              value={String(pageLimit)}
              onChange={(v) => setPageLimit(Number(v))}
              options={[
                { value: "300",  label: "Show 300"   },
                { value: "1000", label: "Show 1,000" },
                { value: "2000", label: "Show 2,000" },
                { value: "5000", label: "Show 5,000" },
              ]}
            />
            <FilterSelect value={eventFilter} onChange={setEvent} options={EVENT_FILTERS} />
          </>
        )}
      </div>

      {/* List */}
      {tab === "feed" ? (
        <FeedList rows={filteredFeed} loading={loading}
          onRowClick={setActive} hasSearch={search.length > 0} />
      ) : (
        <UsersList users={filteredUsers} loading={loading}
          onUserClick={(u) => { setDrill(u); setTab("feed"); }}
          hasSearch={search.length > 0} />
      )}

      {activeRow && (
        <DetailDrawer row={activeRow} onClose={() => setActive(null)}
          onShowUser={() => {
            // Convert ActivityRow.customer to a UserRow-shaped drill target
            setDrill({
              key: activeRow.customer?.id || `s:${activeRow.sessionId}`,
              customerId: activeRow.customer?.id ?? null,
              sessionId: activeRow.sessionId,
              sessionsCount: 1,
              userLabel: activeRow.userLabel,
              userType: activeRow.userType,
              eventCount: 0,
              lastSeen: activeRow.createdAt,
              lastDescription: activeRow.description,
              platform: activeRow.platform,
              appVersion: activeRow.appVersion,
              customer: activeRow.customer,
            });
            setActive(null);
          }} />
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FilterSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-9 py-2 rounded-lg bg-card border border-border text-sm font-medium cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function StatChip({ label, value, color = "text-foreground" }: {
  label: string; value: number; color?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${color}`}>{value.toLocaleString()}</span>
    </div>
  );
}

function UserTypeBadge({ type }: { type: UserType }) {
  const s = USER_TYPE_STYLES[type];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function FeedList({ rows, loading, onRowClick, hasSearch }: {
  rows: ActivityRow[]; loading: boolean;
  onRowClick: (r: ActivityRow) => void; hasSearch: boolean;
}) {
  if (loading) {
    return <div className="rounded-xl border border-border p-12 text-center text-muted-foreground bg-card">Loading activity…</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border p-12 text-center text-muted-foreground bg-card">
        {hasSearch ? "No results match your search." : "No activity in this window."}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
        {rows.map((r) => {
          const PlatIcon = platformIcon(r.platform);
          const pBadge = platformBadge(r.platform);
          const isError = r.event === "error";
          const isPurchase = r.event === "purchase" || r.event === "checkout_success";
          // Errors + payment failures + 404s all get visual highlighting:
          // red border, AlertTriangle icon, status-code badge, message in red.
          const isPaymentFail = r.event === "payment_failed";
          const is404 = r.event === "404_view";
          const isAlert = isError || isPaymentFail || is404;
          const status = isError ? (r.props as Record<string, unknown> | null)?.status : null;
          return (
            <button
              key={r.id}
              onClick={() => onRowClick(r)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${
                isAlert    ? "bg-red-500/10 border-l-4 border-red-500"
                : isPurchase ? "bg-emerald-500/5 border-l-4 border-emerald-500"
                : ""
              }`}
            >
              <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                isAlert ? "bg-red-500/20 text-red-600" : `${pBadge.bg} ${pBadge.text}`
              }`}>
                {isAlert ? <AlertTriangle className="w-4 h-4" /> : <PlatIcon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm truncate">{r.userLabel}</span>
                  <UserTypeBadge type={r.userType} />
                  {isError && status != null && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-black bg-red-500/20 text-red-700 dark:text-red-400">
                      HTTP {String(status)}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${pBadge.bg} ${pBadge.text}`}>
                    {pBadge.label}
                  </span>
                  {r.appVersion && (
                    <span className="text-[10px] text-muted-foreground">v{r.appVersion}</span>
                  )}
                </div>
                <p className={`text-sm mt-0.5 truncate ${isAlert ? "font-bold text-red-700 dark:text-red-400" : ""}`}>
                  {r.description}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {relativeTime(r.createdAt)}
                  {r.location && ` · ${r.location}`}
                  {` · ${r.device}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UsersList({ users, loading, onUserClick, hasSearch }: {
  users: UserRow[]; loading: boolean;
  onUserClick: (u: UserRow) => void; hasSearch: boolean;
}) {
  if (loading) {
    return <div className="rounded-xl border border-border p-12 text-center text-muted-foreground bg-card">Loading users…</div>;
  }
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-border p-12 text-center text-muted-foreground bg-card">
        {hasSearch ? "No users match your search." : "No users in this window."}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
        {users.map((u) => {
          const PlatIcon = platformIcon(u.platform);
          const pBadge = platformBadge(u.platform);
          return (
            <button
              key={u.key}
              onClick={() => onUserClick(u)}
              className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${pBadge.bg} ${pBadge.text}`}>
                <PlatIcon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm truncate">{u.userLabel}</span>
                  <UserTypeBadge type={u.userType} />
                  {u.platform && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${pBadge.bg} ${pBadge.text}`}>
                      {pBadge.label}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-0.5 truncate text-muted-foreground">
                  Last: {u.lastDescription}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {u.eventCount.toLocaleString()} event{u.eventCount === 1 ? "" : "s"} · last seen {relativeTime(u.lastSeen)}
                  {u.sessionsCount > 1 && ` · ${u.sessionsCount} sessions`}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 mt-1" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailDrawer({ row, onClose, onShowUser }: {
  row: ActivityRow; onClose: () => void; onShowUser: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-bold flex items-center gap-2">
            Event details
            <UserTypeBadge type={row.userType} />
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <Field k="User"        v={row.userLabel} />
          {row.customer && <>
            <Field k="Customer ID" v={row.customer.id} />
            {row.customer.phone && <Field k="Phone" v={row.customer.phone} />}
            {row.customer.email && <Field k="Email" v={row.customer.email} />}
            {row.customer.city  && <Field k="City"  v={row.customer.city} />}
            {row.customer.createdAt && <Field k="Signed up" v={new Date(row.customer.createdAt).toLocaleDateString()} />}
          </>}
          <Field k="Description" v={row.description} />
          <Field k="Event"       v={row.event} />
          <Field k="Path"        v={row.path} />
          <Field k="Platform"    v={`${row.platform}${row.appVersion ? ` · v${row.appVersion}` : ""}`} />
          <Field k="Device"      v={row.device} />
          {row.location && <Field k="Location" v={row.location} />}
          <Field k="Session"     v={row.sessionId} />
          <Field k="When"        v={new Date(row.createdAt).toLocaleString()} />
          {row.props && Object.keys(row.props).length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-muted-foreground mb-1">Event payload</p>
              <pre className="bg-muted rounded p-2 text-[11px] overflow-x-auto">
                {JSON.stringify(row.props, null, 2)}
              </pre>
            </div>
          )}
          <button
            onClick={onShowUser}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#EF3752] hover:underline"
          >
            <Sparkles className="w-3 h-3" />
            See full timeline for this user →
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-24 shrink-0">{k}</span>
      <span className="font-medium break-all">{v}</span>
    </div>
  );
}

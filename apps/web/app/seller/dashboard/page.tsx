"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store, Loader2, Clock, CheckCircle2, XCircle, Ban, LogOut,
  Package, IndianRupee, Wallet, CalendarClock, ShoppingBag,
  UserCog, BarChart2, FileText, ChevronRight, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, Cell, PieChart, Pie,
  ResponsiveContainer, Tooltip, XAxis,
} from "recharts";
import { sellerApi, getSellerToken, clearSellerToken } from "@/lib/seller-api";

type SellerStatus = "pending" | "approved" | "rejected" | "suspended";

interface Seller {
  id: string; brandName: string; legalName: string;
  type: "individual" | "business"; mode: "vendor_only" | "full_seller";
  status: SellerStatus; rejectedReason: string | null;
  contactName: string; contactPhone: string | null; email: string | null;
  city: string | null; state: string | null; pincode: string;
  gstNumber: string | null; ratingAvg: number; ratingCount: number;
  createdAt: string; approvedAt: string | null;
}

interface Analytics {
  orders: { today: number; thisWeek: number; lastMonth: number; last3Months: number; total: number };
  earnings: {
    commissionRate: number;
    pendingInReturnWindow: number;
    nextPayoutAmount: number;
    nextPayoutEligibleAt: string | null;
    lastPayout: { amount: number; paidAt: string } | null;
  };
  active: { pending: number; accepted: number; processing: number; dispatched: number };
  catalog?: { activeListings: number; zeroSales30d: number };
}

const PRIMARY = "#EF3752";
const PIPELINE_PALETTE = ["#6366f1", "#f59e0b", "#8b5cf6", "#10b981"];

const STATUS: Record<SellerStatus, { icon: typeof Clock; tint: string; label: string; blurb: string }> = {
  pending: {
    icon: Clock,
    tint: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    label: "Verification in progress",
    blurb: "Our team is reviewing your business details. This usually takes 1–2 working days.",
  },
  approved: {
    icon: CheckCircle2,
    tint: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
    label: "Verified seller",
    blurb: "Your account is live. You can now list products and start receiving orders.",
  },
  rejected: {
    icon: XCircle,
    tint: "text-destructive bg-destructive/5 border-destructive/20",
    label: "Application not approved",
    blurb: "Your application could not be approved. Contact support to re-apply.",
  },
  suspended: {
    icon: Ban,
    tint: "text-destructive bg-destructive/5 border-destructive/20",
    label: "Account suspended",
    blurb: "Your seller account is currently suspended. Please contact Gifteeng support.",
  },
};

function inr(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SellerDashboard() {
  const router = useRouter();
  const [seller,    setSeller]    = useState<Seller | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    let alive = true;
    (async () => {
      try {
        const me = await sellerApi.get<Seller>("/seller/auth/me");
        if (!alive) return;
        setSeller(me);
        if (me.status === "approved") {
          const a = await sellerApi.get<Analytics>("/seller/analytics").catch(() => null);
          if (alive) setAnalytics(a);
        }
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 401) { clearSellerToken(); router.replace("/seller/login"); return; }
        if (alive) setError((e as { message?: string })?.message ?? "Could not load your account");
      }
    })();
    return () => { alive = false; };
  }, [router]);

  const signOut = () => { clearSellerToken(); router.replace("/seller/login"); };

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-destructive font-semibold">{error}</p>
        <button onClick={signOut} className="mt-4 text-xs font-semibold text-primary hover:underline">
          Back to login
        </button>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const s = STATUS[seller.status];
  const StatusIcon = s.icon;

  const activeCount = analytics
    ? analytics.active.pending + analytics.active.accepted +
      analytics.active.processing + analytics.active.dispatched
    : 0;

  const pipelineData = analytics ? [
    { name: "Assigned",   value: analytics.active.pending,    fill: PIPELINE_PALETTE[0] },
    { name: "Accepted",   value: analytics.active.accepted,   fill: PIPELINE_PALETTE[1] },
    { name: "Preparing",  value: analytics.active.processing, fill: PIPELINE_PALETTE[2] },
    { name: "Dispatched", value: analytics.active.dispatched, fill: PIPELINE_PALETTE[3] },
  ].filter(d => d.value > 0) : [];

  const volumeData = analytics ? [
    { period: "Today", orders: analytics.orders.today },
    { period: "7d",    orders: analytics.orders.thisWeek },
    { period: "30d",   orders: analytics.orders.lastMonth },
    { period: "90d",   orders: analytics.orders.last3Months },
  ] : [];

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tight leading-none">{seller.brandName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {seller.type === "business" ? "Business" : "Individual"} ·{" "}
              {seller.mode === "vendor_only" ? "Mfg. partner" : "Marketplace seller"}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Status banner */}
      <div className={`rounded-xl border px-4 py-3 flex items-start gap-2.5 mb-5 ${s.tint}`}>
        <StatusIcon className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black">{s.label}</p>
          <p className="text-xs leading-relaxed opacity-85 mt-0.5">{s.blurb}</p>
          {(seller.status === "rejected" || seller.status === "suspended") && seller.rejectedReason && (
            <p className="mt-2 text-xs font-semibold bg-background/50 rounded-lg px-2.5 py-1.5">
              Reason: {seller.rejectedReason}
            </p>
          )}
        </div>
      </div>

      {/* Approved seller content */}
      {seller.status === "approved" && (
        <>
          {/* Navigation tiles */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <NavTile
              icon={Package}
              label="Products"
              sub={analytics?.catalog ? `${analytics.catalog.activeListings} listings` : "Manage"}
              onClick={() => router.push("/seller/products")}
            />
            <NavTile
              icon={ShoppingBag}
              label="Orders"
              sub={activeCount > 0 ? `${activeCount} active` : "Track"}
              onClick={() => router.push("/seller/orders")}
              badge={activeCount > 0 ? activeCount : undefined}
            />
            <NavTile
              icon={Wallet}
              label="Payouts"
              sub={analytics?.earnings.nextPayoutAmount ? `₹${inr(analytics.earnings.nextPayoutAmount)} due` : "Revenue"}
              onClick={() => router.push("/seller/payouts")}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6">
            <NavTile
              icon={BarChart2}
              label="Insights"
              sub="Analytics & trends"
              onClick={() => router.push("/seller/insights")}
            />
            <NavTile
              icon={FileText}
              label="Reports"
              sub="CSV exports"
              onClick={() => router.push("/seller/reports")}
            />
            <NavTile
              icon={UserCog}
              label="Profile"
              sub={seller.city ? seller.city : "Settings"}
              onClick={() => router.push("/seller/profile")}
            />
          </div>

          {/* Analytics */}
          {analytics ? (
            <div className="space-y-3">

              {/* ── Active pipeline donut ──────────────────────────── */}
              <section className="rounded-2xl border border-border/50 bg-card px-4 pt-4 pb-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">
                  Active pipeline
                </p>

                {activeCount > 0 ? (
                  <div className="flex gap-4 items-center">
                    <div style={{ width: 120, height: 120 }} className="shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pipelineData}
                            cx="50%" cy="50%"
                            innerRadius={32} outerRadius={52}
                            dataKey="value"
                            strokeWidth={2}
                            stroke="white"
                            paddingAngle={2}
                          >
                            {pipelineData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const p = payload[0];
                              return (
                                <div className="bg-foreground text-background text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none">
                                  {p.name}: {p.value}
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex-1 min-w-0 space-y-2.5">
                      {[
                        { name: "Assigned",   value: analytics.active.pending,    color: PIPELINE_PALETTE[0] },
                        { name: "Accepted",   value: analytics.active.accepted,   color: PIPELINE_PALETTE[1] },
                        { name: "Preparing",  value: analytics.active.processing, color: PIPELINE_PALETTE[2] },
                        { name: "Dispatched", value: analytics.active.dispatched, color: PIPELINE_PALETTE[3] },
                      ].map(({ name, value, color }) => (
                        <div key={name} className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: color, opacity: value === 0 ? 0.2 : 1 }}
                          />
                          <span className={`text-xs flex-1 ${value === 0 ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                            {name}
                          </span>
                          <span className={`text-xs font-black tabular-nums w-5 text-right ${value === 0 ? "text-muted-foreground/30" : ""}`}>
                            {value}
                          </span>
                        </div>
                      ))}
                      <button
                        onClick={() => router.push("/seller/orders")}
                        className="flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline pt-0.5"
                      >
                        View all <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-5 text-center">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                    <p className="text-sm font-semibold text-muted-foreground">No active orders</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">New assignments will appear here</p>
                  </div>
                )}
              </section>

              {/* ── Order volume bar chart ─────────────────────────── */}
              <section className="rounded-2xl border border-border/50 bg-card px-4 pt-4 pb-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Order volume
                  </p>
                  <p className="text-[10px] text-muted-foreground">{analytics.orders.total} total</p>
                </div>
                <div style={{ height: 108 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={volumeData}
                      barSize={32}
                      margin={{ top: 4, right: 4, bottom: 0, left: -28 }}
                    >
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 10, fill: "#6b7280" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(0,0,0,0.04)", radius: 4 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-foreground text-background text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none">
                              <span className="text-background/50 mr-1.5">{label}</span>
                              {payload[0].value} orders
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
                        {volumeData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={i === volumeData.length - 1 ? PRIMARY : `${PRIMARY}44`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* ── Earnings ──────────────────────────────────────── */}
              <section className="rounded-2xl border border-border/50 bg-card p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">
                  Earnings
                </p>
                <div className="grid grid-cols-2 divide-x divide-border/50">
                  <div className="pr-4">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-0.5">
                      <CalendarClock className="w-3 h-3" /> Next payout
                    </p>
                    <p className="text-xl font-black">₹{inr(analytics.earnings.nextPayoutAmount)}</p>
                    {analytics.earnings.nextPayoutEligibleAt ? (
                      <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                        Eligible {fmtDate(analytics.earnings.nextPayoutEligibleAt)}
                      </p>
                    ) : analytics.earnings.pendingInReturnWindow > 0 ? (
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        ₹{inr(analytics.earnings.pendingInReturnWindow)} in return window
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mt-0.5">No pending items</p>
                    )}
                  </div>
                  <div className="pl-4">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mb-0.5">
                      <IndianRupee className="w-3 h-3" /> Last payout
                    </p>
                    {analytics.earnings.lastPayout ? (
                      <>
                        <p className="text-xl font-black">₹{inr(analytics.earnings.lastPayout.amount)}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {fmtDate(analytics.earnings.lastPayout.paidAt)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-black text-muted-foreground/30">—</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">No payouts yet</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Platform fee: {(analytics.earnings.commissionRate * 100).toFixed(0)}%
                  </span>
                  <button
                    onClick={() => router.push("/seller/payouts")}
                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5"
                  >
                    View history <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </section>

              {/* ── Catalogue health ──────────────────────────────── */}
              {analytics.catalog && (
                <section className="rounded-2xl border border-border/50 bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                      Catalogue health
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {analytics.catalog.activeListings} listings
                    </span>
                  </div>
                  <CatalogBars catalog={analytics.catalog} />
                  {analytics.catalog.zeroSales30d > 0 && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700">
                        {analytics.catalog.zeroSales30d} listing{analytics.catalog.zeroSales30d > 1 ? "s" : ""} with no orders in 30 days.{" "}
                        <button
                          onClick={() => router.push("/seller/products")}
                          className="font-bold underline"
                        >
                          Review pricing
                        </button>
                      </p>
                    </div>
                  )}
                </section>
              )}

            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading analytics…
            </div>
          )}
        </>
      )}

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavTile({
  icon: Icon, label, sub, onClick, badge,
}: { icon: typeof Package; label: string; sub: string; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-start gap-1.5 rounded-xl border border-border/50 bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] active:scale-[0.97]"
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-xs font-bold">{label}</span>
      <span className="text-[10px] text-muted-foreground truncate w-full">{sub}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-2 right-2 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}

function CatalogBars({ catalog }: { catalog: { activeListings: number; zeroSales30d: number } }) {
  const selling = Math.max(0, catalog.activeListings - catalog.zeroSales30d);
  const total   = catalog.activeListings || 1;
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Selling (30d)
          </span>
          <span className="text-xs font-black">{selling}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${Math.max((selling / total) * 100, 2)}%` }}
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-border inline-block" />
            No sales (30d)
          </span>
          <span className={`text-xs font-black ${catalog.zeroSales30d > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
            {catalog.zeroSales30d}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-400 transition-all duration-700"
            style={{ width: `${catalog.zeroSales30d > 0 ? Math.max((catalog.zeroSales30d / total) * 100, 2) : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}


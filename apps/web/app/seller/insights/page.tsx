"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2, Package, TrendingUp, IndianRupee, Star,
  ChevronRight, Loader2, ArrowLeft, ArrowUpRight, ArrowDownRight,
  ShoppingBag, RotateCcw, Ban, Truck, CheckCircle2,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PayoutSummary {
  period: { from: string; to: string };
  chart: { month: string; amount: number }[];
  summary: { settled: number; settledCount: number; pendingCount: number };
  breakdown: {
    delivered: { count: number; value: number };
    returned:  { count: number; value: number };
    cancelled: { count: number; value: number };
    rto:       { count: number; value: number };
    commission: { rate: number; amount: number };
    gross: number;
    net: number;
  };
}

interface OrderSummary {
  overview: Record<string, number>;
  orders: {
    id: string; status: string; orderNumber: string;
    product: { title: string; image: string | null };
    qty: number; orderAmount: string;
    payoutStatus: "settled" | "pending" | "none";
    assignedAt: string; deliveredAt: string | null; orderDate: string;
  }[];
  total: number; page: number; limit: number;
  compliance?: {
    onTime: number; late: number; total: number;
    pct: number | null; avgDispatchHours: number | null;
  };
}

interface ProductItem {
  sellerProductId: string; title: string; image: string | null; category: string | null;
  ratingAvg: number; ratingCount: number;
  orders: number; delivered: number; returned: number; cancelled: number;
  revenue: number; payout: number;
}

// ── Date presets ──────────────────────────────────────────────────────────────

type Preset = "this_month" | "last_month" | "last_3m" | "this_year";

function presetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "this_month") return { from: iso(new Date(y, m, 1)),     to: iso(new Date(y, m + 1, 0)) };
  if (p === "last_month") return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0))     };
  if (p === "last_3m")    return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m + 1, 0)) };
  /* this_year */          return { from: iso(new Date(y, 0, 1)),     to: iso(new Date(y, 11, 31))   };
}

const PRESET_LABELS: Record<Preset, string> = {
  this_month: "This month",
  last_month: "Last month",
  last_3m:    "Last 3 months",
  this_year:  "This year",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function inr(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const PRIMARY = "#EF3752";

const STATUS_COLORS: Record<string, string> = {
  delivered:  "#10b981",
  dispatched: "#8b5cf6",
  processing: "#f59e0b",
  accepted:   "#6366f1",
  pending:    "#3b82f6",
  returned:   "#f43f5e",
  cancelled:  "#9ca3af",
  floating:   "#f97316",
};

const STATUS_STYLE: Record<string, string> = {
  delivered:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  dispatched: "bg-purple-50 text-purple-700 border-purple-200",
  processing: "bg-amber-50 text-amber-700 border-amber-200",
  accepted:   "bg-indigo-50 text-indigo-700 border-indigo-200",
  pending:    "bg-blue-50 text-blue-700 border-blue-200",
  returned:   "bg-rose-50 text-rose-700 border-rose-200",
  cancelled:  "bg-gray-50 text-gray-500 border-gray-200",
  floating:   "bg-orange-50 text-orange-700 border-orange-200",
};

const STATUS_LABEL: Record<string, string> = {
  delivered:  "Delivered",
  dispatched: "Dispatched",
  processing: "Preparing",
  accepted:   "Accepted",
  pending:    "Assigned",
  returned:   "Returned",
  cancelled:  "Cancelled",
  floating:   "Re-routed",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PayoutBadge({ status }: { status: "settled" | "pending" | "none" }) {
  if (status === "none")    return <span className="text-[10px] text-muted-foreground">—</span>;
  if (status === "settled") return <span className="text-[10px] font-semibold text-emerald-600">Settled</span>;
  return <span className="text-[10px] font-semibold text-amber-600">Pending</span>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = "payout" | "orders" | "products";

export default function SellerInsightsPage() {
  const router = useRouter();
  const [tab,    setTab]    = useState<Tab>("payout");
  const [preset, setPreset] = useState<Preset>("this_month");

  const dates = presetDates(preset);

  useEffect(() => {
    if (!getSellerToken()) router.replace("/seller/login");
  }, [router]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 bg-card border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.push("/seller/dashboard")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <BarChart2 className="w-5 h-5 text-primary" />
          <h1 className="font-black text-base flex-1">Seller Insights</h1>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {(Object.keys(PRESET_LABELS) as Preset[]).map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                preset === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex gap-1 px-4 py-3 bg-white border-b">
        {([
          ["payout",   "💰 Payouts"],
          ["orders",   "📦 Orders"],
          ["products", "🏷️ Products"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {tab === "payout"   && <PayoutTab   from={dates.from} to={dates.to} />}
        {tab === "orders"   && <OrdersTab   from={dates.from} to={dates.to} />}
        {tab === "products" && <ProductsTab from={dates.from} to={dates.to} />}
      </div>
    </div>
  );
}

// ── Payout Tab ────────────────────────────────────────────────────────────────

function PayoutTab({ from, to }: { from: string; to: string }) {
  const [data,    setData]    = useState<PayoutSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    sellerApi.get<PayoutSummary>(`/seller/insights/payout-summary?from=${from}&to=${to}`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [from, to]);

  if (loading) return <Spinner />;
  if (!data)   return <EmptyState label="Could not load payout data" />;

  const b = data.breakdown;
  const hasChartData = data.chart.some(c => c.amount > 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard
          icon={IndianRupee}
          label="All-time settled"
          value={`₹${inr(data.summary.settled)}`}
          sub={`${data.summary.settledCount} order${data.summary.settledCount !== 1 ? "s" : ""}`}
          tint="text-emerald-600 bg-emerald-500/10"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Pending payout"
          value={data.summary.pendingCount > 0 ? `${data.summary.pendingCount} orders` : "All clear"}
          sub="Delivered, awaiting cycle"
          tint="text-amber-600 bg-amber-500/10"
        />
      </div>

      {/* Revenue area chart */}
      <div className="rounded-2xl border border-border/50 bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black">Revenue trend</h2>
          <span className="text-[11px] text-muted-foreground">Delivered order value</span>
        </div>
        {!hasChartData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No delivered orders yet</p>
        ) : (
          <div style={{ height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chart} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={PRIMARY} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-foreground text-background text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none">
                        <span className="text-background/50 mr-1.5">{label}</span>
                        ₹{inr(payload[0].value as number)}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={PRIMARY}
                  strokeWidth={2}
                  fill="url(#revenueGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: PRIMARY, stroke: "white", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Breakdown table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <h2 className="text-sm font-black">Period breakdown</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{from} → {to}</p>
        </div>
        <div className="divide-y divide-border/40">
          <BreakdownRow
            label="Delivered orders"
            sub={`${b.delivered.count} order${b.delivered.count !== 1 ? "s" : ""}`}
            value={b.delivered.value}
            positive
          />
          {b.returned.count > 0 && (
            <BreakdownRow
              label="Returned"
              sub={`${b.returned.count} return${b.returned.count !== 1 ? "s" : ""}`}
              value={-b.returned.value}
            />
          )}
          {b.cancelled.count > 0 && (
            <BreakdownRow
              label="Cancelled"
              sub={`${b.cancelled.count} order${b.cancelled.count !== 1 ? "s" : ""}`}
              value={0}
              neutral
            />
          )}
          {b.rto.count > 0 && (
            <BreakdownRow
              label="Re-routed (RTO)"
              sub={`${b.rto.count} item${b.rto.count !== 1 ? "s" : ""}`}
              value={0}
              neutral
            />
          )}
          <div className="px-4 py-2 bg-muted/30">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Gross order value</span>
              <span className="text-xs font-bold">₹{inr(b.gross)}</span>
            </div>
          </div>
          <BreakdownRow
            label="Platform commission"
            sub={`${(b.commission.rate * 100).toFixed(0)}% deducted`}
            value={b.commission.amount}
          />
          <div className="px-4 py-3 bg-primary/5">
            <div className="flex justify-between items-center">
              <span className="text-sm font-black">Estimated net payout</span>
              <span className="text-base font-black text-primary">₹{inr(b.net)}</span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground text-center px-4">
        Final payout depends on returns, claims, and settlement cycle. Payouts are processed 17 days after delivery.
      </p>
    </div>
  );
}

function BreakdownRow({
  label, sub, value, positive, neutral,
}: { label: string; sub: string; value: number; positive?: boolean; neutral?: boolean }) {
  const isNeg  = value < 0;
  const isZero = value === 0 || neutral;
  const color  = isZero ? "text-muted-foreground" : positive ? "text-emerald-600" : "text-red-500";
  const prefix = isZero ? "" : positive ? "+" : "";
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${color}`}>
          {isZero ? "₹0" : `${prefix}₹${inr(Math.abs(value))}`}
        </p>
        {!isZero && !isNeg && <ArrowUpRight className="w-3 h-3 text-emerald-500 ml-auto" />}
        {!isZero && isNeg  && <ArrowDownRight className="w-3 h-3 text-red-400 ml-auto" />}
      </div>
    </div>
  );
}

// ── Orders Tab ────────────────────────────────────────────────────────────────

function OrdersTab({ from, to }: { from: string; to: string }) {
  const [data,    setData]    = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("");
  const [page,    setPage]    = useState(1);
  const router = useRouter();

  const load = useCallback((f: string, p: number) => {
    setLoading(true);
    const qs = [`from=${from}`, `to=${to}`, `page=${p}`, `limit=20`];
    if (f) qs.push(`status=${f}`);
    sellerApi.get<OrderSummary>(`/seller/insights/order-summary?${qs.join("&")}`)
      .then(d => { setData(d); setPage(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { setFilter(""); setPage(1); load("", 1); }, [load]);

  function applyFilter(f: string) { setFilter(f); load(f, 1); }

  const ov = data?.overview ?? {};

  const OVERVIEW_META = [
    { key: "total",     label: "Total",      icon: ShoppingBag },
    { key: "delivered", label: "Delivered",  icon: CheckCircle2 },
    { key: "returned",  label: "Returned",   icon: RotateCcw },
    { key: "floating",  label: "Re-routed",  icon: Truck },
    { key: "cancelled", label: "Cancelled",  icon: Ban },
  ];

  const FILTERS = [
    { key: "",           label: "All" },
    { key: "delivered",  label: "Delivered" },
    { key: "returned",   label: "Returned" },
    { key: "processing", label: "Preparing" },
    { key: "dispatched", label: "Dispatched" },
    { key: "cancelled",  label: "Cancelled" },
  ];

  // Status distribution ring data
  const ringKeys = ["delivered", "dispatched", "processing", "accepted", "pending", "returned", "cancelled", "floating"];
  const ringData = ringKeys
    .map(k => ({ name: STATUS_LABEL[k] ?? k, value: ov[k] ?? 0, fill: STATUS_COLORS[k] ?? "#9ca3af" }))
    .filter(d => d.value > 0);

  const total = ov.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Status distribution ring */}
      {data && total > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <h2 className="text-sm font-black mb-4">Order distribution</h2>
          <div className="flex gap-4 items-center">
            <div style={{ width: 128, height: 128 }} className="shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ringData}
                    cx="50%" cy="50%"
                    innerRadius={36} outerRadius={56}
                    dataKey="value"
                    strokeWidth={2}
                    stroke="white"
                    paddingAngle={2}
                  >
                    {ringData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0];
                      const pct = total > 0 ? ((p.value as number / total) * 100).toFixed(0) : 0;
                      return (
                        <div className="bg-foreground text-background text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-lg pointer-events-none">
                          {p.name}: {p.value} ({pct}%)
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2">
              {ringData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="text-[11px] text-muted-foreground truncate">{d.name}</span>
                  <span className="text-[11px] font-black ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Overview tiles */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {OVERVIEW_META.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-xl border border-border/50 bg-card p-3 text-center">
            <Icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-lg font-black">{ov[key] ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Dispatch compliance */}
      {data?.compliance && data.compliance.total > 0 && (
        <div className="rounded-xl border border-border/50 bg-card p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Dispatch compliance
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    (data.compliance.pct ?? 0) >= 80 ? "bg-emerald-500" :
                    (data.compliance.pct ?? 0) >= 60 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${data.compliance.pct ?? 0}%` }}
                />
              </div>
              <span className="text-sm font-black w-10 text-right">
                {data.compliance.pct ?? 0}%
              </span>
            </div>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="text-emerald-600 font-semibold">{data.compliance.onTime} on time</span>
              {data.compliance.late > 0 && (
                <span className="text-red-500 font-semibold">{data.compliance.late} late</span>
              )}
              {data.compliance.avgDispatchHours !== null && (
                <span>avg {data.compliance.avgDispatchHours}h</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => applyFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {loading ? (
        <Spinner />
      ) : !data || data.orders.length === 0 ? (
        <EmptyState label="No orders in this period" />
      ) : (
        <>
          <div className="space-y-2">
            {data.orders.map(o => (
              <div
                key={o.id}
                onClick={() => router.push(`/seller/orders/${o.id}`)}
                className="rounded-xl border border-border/50 bg-card p-3 flex gap-3 items-start cursor-pointer hover:shadow-sm transition-all"
              >
                {o.product.image ? (
                  <img src={o.product.image} alt={o.product.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{o.product.title}</p>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {o.orderNumber} · Qty {o.qty} · ₹{inr(Number(o.orderAmount))}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(o.orderDate)}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StatusBadge status={o.status} />
                    <PayoutBadge status={o.payoutStatus} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.total > data.limit && (
            <div className="flex items-center justify-center gap-3 py-2">
              <button
                disabled={page === 1}
                onClick={() => load(filter, page - 1)}
                className="text-xs font-semibold text-primary disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.total / data.limit)}
              </span>
              <button
                disabled={page >= Math.ceil(data.total / data.limit)}
                onClick={() => load(filter, page + 1)}
                className="text-xs font-semibold text-primary disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ from, to }: { from: string; to: string }) {
  const [data,    setData]    = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort,    setSort]    = useState<"orders" | "revenue" | "returns">("orders");
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    setData([]);
    sellerApi.get<ProductItem[]>(`/seller/insights/product-summary?from=${from}&to=${to}`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [from, to]);

  const sorted = [...data].sort((a, b) => {
    if (sort === "revenue") return b.revenue - a.revenue;
    if (sort === "returns") return b.returned - a.returned;
    return b.orders - a.orders;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {([
          ["orders",  "Most orders"],
          ["revenue", "Most revenue"],
          ["returns", "High returns"],
        ] as [typeof sort, string][]).map(([s, l]) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              sort === s ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <EmptyState label="No products with orders in this period" />
      ) : (
        <div className="space-y-3">
          {sorted.map((p, i) => {
            const returnPct   = p.orders > 0 ? ((p.returned / p.orders) * 100).toFixed(0) : "0";
            const isHighReturn = Number(returnPct) >= 20;
            const miniBar = [
              { name: "Delivered", value: p.delivered, fill: "#10b981" },
              { name: "Returned",  value: p.returned,  fill: "#f43f5e" },
              { name: "Cancelled", value: p.cancelled, fill: "#d1d5db" },
            ].filter(d => d.value > 0);

            return (
              <div
                key={p.sellerProductId}
                onClick={() => router.push(`/seller/products/${p.sellerProductId}/customizer`)}
                className="rounded-2xl border border-border/50 bg-card p-4 flex gap-3 cursor-pointer hover:shadow-sm transition-all"
              >
                <div className="relative flex-shrink-0">
                  {p.image ? (
                    <img src={p.image} alt={p.title} className="w-16 h-16 rounded-xl object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-muted text-[10px] font-black flex items-center justify-center border border-border">
                    {i + 1}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{p.title}</p>
                  {p.category && <p className="text-[11px] text-muted-foreground">{p.category}</p>}

                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Metric label="Orders"  value={String(p.orders)} />
                    <Metric label="Revenue" value={`₹${inr(p.revenue)}`} />
                    <Metric
                      label="Returns"
                      value={`${returnPct}%`}
                      highlight={isHighReturn ? "red" : undefined}
                    />
                  </div>

                  {/* Mini outcome bar */}
                  {p.orders > 0 && miniBar.length > 0 && (
                    <div className="mt-2 flex h-1.5 rounded-full overflow-hidden gap-px">
                      {miniBar.map(seg => (
                        <div
                          key={seg.name}
                          className="h-full"
                          style={{ width: `${(seg.value / p.orders) * 100}%`, background: seg.fill }}
                          title={`${seg.name}: ${seg.value}`}
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs font-bold">{p.ratingAvg.toFixed(1)}</span>
                      <span className="text-[10px] text-muted-foreground">({p.ratingCount})</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {p.delivered} delivered · {p.cancelled} cancelled
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon, label, value, sub, tint,
}: { icon: typeof IndianRupee; label: string; value: string; sub: string; tint: string }) {
  return (
    <div className={`rounded-2xl p-4 ${tint}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: "red" }) {
  return (
    <div>
      <p className={`text-sm font-black ${highlight === "red" ? "text-red-500" : ""}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-25" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

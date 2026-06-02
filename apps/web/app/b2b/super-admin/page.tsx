"use client";

import { useEffect, useState } from "react";
import {
  Package, ShoppingCart, Users, Star, Eye,
  IndianRupee, Truck, CheckCircle, AlertCircle, Zap,
  ShoppingBag, ArrowUpRight, Globe, Tags, Layers,
  TrendingUp, Image, Palette, BarChart3, ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { safeGet } from "@/lib/admin-api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardStats {
  products: number;
  activeProducts: number;
  sections: number;
  categories: number;
  collections: number;
  customers: number;
  reviews: number;
  avgRating: number;
  discounts: number;
  stockImages: number;
  variantOptions: number;
  pageViews: number;
  todayViews: number;
  totalRevenue: number;
  totalOrders: number;
  confirmedOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  todayOrders: number;
  topPages: { page_path: string; count: number }[];
  recentCustomers: { name: string; email: string; created_at: string }[];
  topProducts: { name: string; price: number; rating: number; reviews: number }[];
  recentOrders: { order_number: string; customer_name: string; total: number; status: string; created_at: string }[];
  weeklyViews: number[];
}

// ─── Status colors ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  confirmed:       "bg-emerald-500/12 text-emerald-600",
  processing:      "bg-blue-500/12    text-blue-600",
  shipped:         "bg-violet-500/12  text-violet-600",
  delivered:       "bg-emerald-500/12 text-emerald-600",
  cancelled:       "bg-destructive/12 text-destructive",
  incomplete:      "bg-amber-500/12   text-amber-600",
  payment_pending: "bg-orange-500/12  text-orange-600",
  pending:         "bg-amber-500/12   text-amber-600",
};

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data }: { data: number[] }) {
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const h = 28, w = 72;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        opacity="0.55"
      />
    </svg>
  );
}

// ─── Greeting helper ──────────────────────────────────────────────────────────
function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    products: 0, activeProducts: 0, sections: 0, categories: 0,
    collections: 0, customers: 0, reviews: 0, avgRating: 0,
    discounts: 0, stockImages: 0, variantOptions: 0, pageViews: 0,
    todayViews: 0, totalRevenue: 0, totalOrders: 0, confirmedOrders: 0,
    pendingOrders: 0, deliveredOrders: 0, todayOrders: 0,
    topPages: [], recentCustomers: [], topProducts: [], recentOrders: [],
    weeklyViews: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    safeGet<Partial<DashboardStats>>("/admin/stats", {}).then((data) => {
      setStats((prev) => ({
        ...prev,
        ...data,
        topProducts:      Array.isArray(data.topProducts)      ? data.topProducts      : prev.topProducts,
        recentCustomers:  Array.isArray(data.recentCustomers)  ? data.recentCustomers  : prev.recentCustomers,
        recentOrders:     Array.isArray(data.recentOrders)     ? data.recentOrders     : prev.recentOrders,
      }));
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary animate-pulse" />
          </div>
          <p className="text-xs text-muted-foreground">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const quickCounts = [
    { label: "Categories",  value: stats.categories    },
    { label: "Collections", value: stats.collections   },
    { label: "Discounts",   value: stats.discounts     },
    { label: "Sections",    value: stats.sections      },
    { label: "Images",      value: stats.stockImages   },
    { label: "Variants",    value: stats.variantOptions },
  ];

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
          <h2 className="text-xl font-display font-bold tracking-tight text-foreground mt-0.5">
            {timeGreeting()} 👋
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold text-emerald-600">Live</span>
        </div>
      </div>

      {/* ── Revenue + order pipeline ───────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        {/* Revenue row */}
        <div className="px-6 py-5 flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-border/40">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/60 mb-1.5">
              Total Revenue
            </p>
            <p className="text-5xl font-display font-black tracking-tight text-foreground leading-none tabular-nums">
              ₹{stats.totalRevenue.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="flex items-stretch gap-5 mb-0.5 pb-0.5">
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">All Orders</p>
              <p className="text-lg font-display font-bold text-foreground tabular-nums">{stats.totalOrders}</p>
            </div>
            <div className="w-px bg-border/50" />
            <div>
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">Today</p>
              <p className="text-lg font-display font-bold text-primary tabular-nums flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />{stats.todayOrders}
              </p>
            </div>
          </div>
        </div>

        {/* Order pipeline */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border/30">
          {([
            { label: "Confirmed",  value: stats.confirmedOrders,  tint: "text-emerald-600", Icon: CheckCircle },
            { label: "Delivered",  value: stats.deliveredOrders,  tint: "text-violet-600",  Icon: Truck       },
            { label: "Pending",    value: stats.pendingOrders,    tint: "text-amber-600",   Icon: AlertCircle },
            { label: "Processing", value: stats.totalOrders - stats.confirmedOrders - stats.deliveredOrders - stats.pendingOrders,
                                                                  tint: "text-blue-600",    Icon: ShoppingBag },
          ] as const).map(({ label, value, tint, Icon }) => (
            <button
              key={label}
              onClick={() => router.push("/super-admin/orders")}
              className="group flex flex-col items-center justify-center py-4 px-3 hover:bg-muted/40
                         [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1)]
                         active:scale-[0.97] [transition:transform_160ms_cubic-bezier(0.23,1,0.32,1)]"
            >
              <Icon className={`w-3.5 h-3.5 ${tint} mb-1.5 opacity-70`} />
              <p className={`text-2xl font-display font-black tabular-nums leading-none ${tint}`}>
                {Math.max(0, value)}
              </p>
              <p className="text-[10px] font-medium text-muted-foreground mt-1 uppercase tracking-wider">
                {label}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { label: "Products",   value: stats.products,   sub: `${stats.activeProducts} active`, Icon: Package, href: "/super-admin/products" },
          { label: "Customers",  value: stats.customers,  sub: "registered",                    Icon: Users,   href: "/super-admin/customers" },
          { label: "Page Views", value: stats.pageViews,  sub: `${stats.todayViews} today`,      Icon: Eye,     href: "/super-admin/analytics", spark: stats.weeklyViews },
          { label: "Reviews",    value: stats.reviews,    sub: `${stats.avgRating}★ avg`,        Icon: Star,    href: "/super-admin/reviews" },
        ] as const).map(({ label, value, sub, Icon, href, ...rest }) => {
          const spark = "spark" in rest ? rest.spark : undefined;
          return (
            <button
              key={label}
              onClick={() => router.push(href)}
              className="group rounded-xl border border-border/50 bg-card p-4 text-left
                         [transition:border-color_160ms_cubic-bezier(0.23,1,0.32,1),box-shadow_160ms_cubic-bezier(0.23,1,0.32,1),transform_160ms_cubic-bezier(0.23,1,0.32,1)]
                         hover:border-border hover:shadow-sm active:scale-[0.97]"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                {spark && spark.length > 0
                  ? <Sparkline data={spark} />
                  : <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/25
                      [transition:color_160ms_cubic-bezier(0.23,1,0.32,1)]
                      group-hover:text-muted-foreground/60" />
                }
              </div>
              <p className="text-2xl font-display font-black text-foreground tabular-nums leading-tight">
                {value.toLocaleString("en-IN")}
              </p>
              <div className="flex items-center justify-between mt-1 gap-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground/45 tabular-nums shrink-0">{sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Quick counts ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {quickCounts.map(({ label, value }) => (
          <div
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/30 px-3 py-1"
          >
            <span className="text-xs font-bold text-foreground tabular-nums">{value}</span>
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Bottom 2×2 grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Recent Orders */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5 text-primary/70" />
              Recent Orders
            </h3>
            <button
              onClick={() => router.push("/super-admin/orders")}
              className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline
                         [transition:opacity_150ms_cubic-bezier(0.23,1,0.32,1)] hover:opacity-80"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {stats.recentOrders.length > 0 ? (
            <div className="space-y-3">
              {stats.recentOrders.map((o, i) => {
                const code = o.order_number.replace(/^(GFT|SH)-?/i, "");
                const name = (o.customer_name || "").trim();
                const initials = name
                  ? name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
                  : "";
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/8 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {initials || <ShoppingCart className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {name || "Guest"}
                        <span className="ml-1.5 font-mono text-[9px] font-medium text-muted-foreground/60">
                          #{code}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        ₹{o.total.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_COLOR[o.status] ?? "bg-muted text-muted-foreground"}`}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No orders yet</p>
          )}
        </div>

        {/* Top Products */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-primary/70" />
              Top Products
            </h3>
            <button
              onClick={() => router.push("/super-admin/products")}
              className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline
                         [transition:opacity_150ms_cubic-bezier(0.23,1,0.32,1)] hover:opacity-80"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {stats.topProducts.length > 0 ? (
            <div className="space-y-3">
              {stats.topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 tabular-nums ${
                    i === 0 ? "bg-amber-500/15 text-amber-600" :
                    i === 1 ? "bg-border/60     text-muted-foreground" :
                               "bg-muted         text-muted-foreground/60"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      ₹{p.price.toLocaleString("en-IN")} · {p.reviews} reviews
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                    <span className="text-[11px] font-bold text-foreground tabular-nums">{p.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No products yet</p>
          )}
        </div>

        {/* Recent Customers */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary/70" />
              Recent Customers
            </h3>
            <button
              onClick={() => router.push("/super-admin/customers")}
              className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline
                         [transition:opacity_150ms_cubic-bezier(0.23,1,0.32,1)] hover:opacity-80"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {stats.recentCustomers.length > 0 ? (
            <div className="space-y-3">
              {stats.recentCustomers.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
                    {(c.name?.[0] || c.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{c.name || "Unnamed"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums">
                    {new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No customers yet</p>
          )}
        </div>

        {/* Top Pages */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-primary/70" />
              Top Pages
            </h3>
            <button
              onClick={() => router.push("/super-admin/analytics")}
              className="text-[11px] text-primary font-semibold flex items-center gap-0.5 hover:underline
                         [transition:opacity_150ms_cubic-bezier(0.23,1,0.32,1)] hover:opacity-80"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {stats.topPages.length > 0 ? (
            <div className="space-y-1.5">
              {stats.topPages.map((p, i) => {
                const maxCount = stats.topPages[0]?.count || 1;
                const pct = (p.count / maxCount) * 100;
                return (
                  <div key={i} className="relative rounded-lg overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-lg bg-primary/6"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center gap-2 px-3 py-2">
                      <span className="text-[9px] font-mono text-muted-foreground/40 w-3 shrink-0 tabular-nums">{i + 1}</span>
                      <p className="text-[11px] font-mono font-medium text-foreground truncate flex-1">{p.page_path}</p>
                      <span className="text-[11px] font-bold text-primary/80 tabular-nums shrink-0">{p.count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No page views yet</p>
          )}
        </div>

      </div>
    </div>
  );
}

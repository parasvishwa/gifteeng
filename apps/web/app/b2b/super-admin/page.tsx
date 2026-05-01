"use client";

import { useEffect, useState } from "react";
import {
  Package, Layers, ShoppingCart, Users, Star, Eye, TrendingUp,
  Image, Tags, Palette, BarChart3, Globe, IndianRupee,
  Truck, CheckCircle, AlertCircle, Zap, ShoppingBag, ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { safeGet } from "@/lib/admin-api";

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

const statusColor: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-600",
  processing: "bg-blue-500/15 text-blue-600",
  shipped: "bg-violet-500/15 text-violet-600",
  delivered: "bg-emerald-500/15 text-emerald-600",
  cancelled: "bg-destructive/15 text-destructive",
  incomplete: "bg-amber-500/15 text-amber-600",
  payment_pending: "bg-orange-500/15 text-orange-600",
  pending: "bg-amber-500/15 text-amber-600",
};

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const h = 36;
  const w = 120;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4)}`).join(" ");
  const fillPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg width={w} height={h} className="shrink-0">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill="url(#sparkFill)" points={fillPoints} />
      <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

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
  const [showAllCounts, setShowAllCounts] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      // Single call now returns everything the dashboard needs
      const adminStats = await safeGet<Partial<DashboardStats>>("/admin/stats", {});
      setStats((prev) => ({
        ...prev,
        ...adminStats,
        topProducts: Array.isArray(adminStats.topProducts) ? adminStats.topProducts : prev.topProducts,
        recentCustomers: Array.isArray(adminStats.recentCustomers) ? adminStats.recentCustomers : prev.recentCustomers,
        recentOrders: Array.isArray(adminStats.recentOrders) ? adminStats.recentOrders : prev.recentOrders,
      }));
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <BarChart3 className="w-7 h-7 text-primary" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground animate-pulse">Loading dashboard…</p>
    </div>
  );

  const quickCountItems = [
    { label: "Categories", value: stats.categories, icon: Tags },
    { label: "Collections", value: stats.collections, icon: Layers },
    { label: "Discounts", value: stats.discounts, icon: TrendingUp },
    { label: "Sections", value: stats.sections, icon: Layers },
    { label: "Images", value: stats.stockImages, icon: Image },
    { label: "Variants", value: stats.variantOptions, icon: Palette },
  ];

  // Items always shown (first 8 or fewer)
  const visibleCounts = quickCountItems.slice(0, 8);
  // Items hidden until expanded (only relevant if > 8 items)
  const hiddenCounts = quickCountItems.slice(8);

  return (
    <div className="space-y-6 max-w-6xl animate-fade-in">
      {/* Welcome + Live badge */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"} 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Here's what's happening with your store</p>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-emerald-600">Live</span>
        </div>
      </div>

      {/* Revenue hero card */}
      <div className="rounded-2xl bg-gradient-to-br from-primary via-primary to-pink-dark p-6 text-primary-foreground shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wider">Total Revenue</p>
          </div>
          <p className="text-4xl font-display font-black tracking-tight">₹{stats.totalRevenue.toLocaleString("en-IN")}</p>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-primary-foreground/60">{stats.totalOrders} total orders</span>
            <span className="text-xs text-primary-foreground/80 flex items-center gap-1">
              <Zap className="w-3 h-3" /> {stats.todayOrders} today
            </span>
          </div>
        </div>
      </div>

      {/* Order status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Orders", value: stats.totalOrders, icon: ShoppingBag, color: "text-blue-500 bg-blue-500/10" },
          { label: "Confirmed", value: stats.confirmedOrders, icon: CheckCircle, color: "text-emerald-500 bg-emerald-500/10" },
          { label: "Delivered", value: stats.deliveredOrders, icon: Truck, color: "text-violet-500 bg-violet-500/10" },
          { label: "Pending", value: stats.pendingOrders, icon: AlertCircle, color: "text-amber-500 bg-amber-500/10" },
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-card border border-border/50 p-4 min-h-[100px] hover:shadow-md transition-shadow cursor-pointer group"
            onClick={() => router.push("/super-admin/orders")}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}>
                <c.icon className="w-4.5 h-4.5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
            </div>
            <p className="text-2xl font-display font-black text-foreground">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Products", value: stats.products, sub: `${stats.activeProducts} active`, icon: Package },
          { label: "Customers", value: stats.customers, sub: "registered", icon: Users },
          { label: "Page Views", value: stats.pageViews, sub: `${stats.todayViews} today`, icon: Eye, sparkData: stats.weeklyViews },
          { label: "Reviews", value: stats.reviews, sub: `${stats.avgRating}★ avg`, icon: Star },
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-card border border-border/50 p-4 min-h-[100px]">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                <c.icon className="w-4.5 h-4.5 text-muted-foreground" />
              </div>
              {'sparkData' in c && c.sparkData && c.sparkData.length > 0 && <Sparkline data={c.sparkData} />}
            </div>
            <p className="text-2xl font-display font-black text-foreground">{c.value.toLocaleString()}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-xs text-muted-foreground/50">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick counts */}
      <div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {visibleCounts.map(c => (
            <div key={c.label} className="flex items-center gap-2.5 bg-card border border-border/40 rounded-xl px-3 py-2.5 min-h-[100px]">
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-display font-bold text-foreground leading-tight">{c.value}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">{c.label}</p>
              </div>
            </div>
          ))}
        </div>
        {hiddenCounts.length > 0 && (
          <div className="mt-2">
            {showAllCounts && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-2">
                {hiddenCounts.map(c => (
                  <div key={c.label} className="flex items-center gap-2.5 bg-card border border-border/40 rounded-xl px-3 py-2.5 min-h-[100px]">
                    <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-display font-bold text-foreground leading-tight">{c.value}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">{c.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowAllCounts((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showAllCounts ? "rotate-180" : ""}`} />
              {showAllCounts ? "Show less" : `Show all (${hiddenCounts.length} more)`}
            </button>
          </div>
        )}
      </div>

      {/* Bottom grid — 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Orders */}
        <div className="bg-card rounded-2xl border border-border/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" /> Recent Orders
            </h3>
            <button onClick={() => router.push("/super-admin/orders")} className="text-xs text-primary font-medium hover:underline">View all</button>
          </div>
          {stats.recentOrders.length > 0 ? (
            <div className="space-y-3">
              {stats.recentOrders.map((o, i) => {
                // Strip the "GFT-" / "GFT" / "SH-" prefix so the order
                // number reads as a short, scannable code in the dashboard.
                // (`.replace("GFT", "")` left an orphan dash on every
                // GFT-prefixed order — "GFT-MOKA805R" → "-MOKA805R" → "#-MOKA805R".)
                const code = o.order_number.replace(/^(GFT|SH)-?/i, "");
                // Initials avatar from customer name when present, falls
                // back to a shopping-bag glyph for guest orders.
                const name = (o.customer_name || "").trim();
                const initials = name
                  ? name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
                  : "";
                return (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                      {initials || <ShoppingCart className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {name || "Guest"}
                        <span className="ml-1.5 font-mono text-[10px] font-medium text-muted-foreground">#{code}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">₹{o.total.toLocaleString("en-IN")}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize shrink-0 ${statusColor[o.status] || "bg-muted text-muted-foreground"}`}>
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
        <div className="bg-card rounded-2xl border border-border/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> Top Products
            </h3>
            <button onClick={() => router.push("/super-admin/products")} className="text-xs text-primary font-medium hover:underline">View all</button>
          </div>
          {stats.topProducts.length > 0 ? (
            <div className="space-y-3">
              {stats.topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    i === 0 ? "bg-amber-500/15 text-amber-600" : i === 1 ? "bg-slate-300/20 text-slate-500" : "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">₹{p.price} · {p.reviews} reviews</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold text-foreground">{p.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">No products yet</p>
          )}
        </div>

        {/* Recent Customers */}
        <div className="bg-card rounded-2xl border border-border/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Recent Customers
            </h3>
            <button onClick={() => router.push("/super-admin/customers")} className="text-xs text-primary font-medium hover:underline">View all</button>
          </div>
          {stats.recentCustomers.length > 0 ? (
            <div className="space-y-3">
              {stats.recentCustomers.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {(c.name?.[0] || c.email?.[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{c.name || "Unnamed"}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground/50 shrink-0 tabular-nums">
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
        <div className="bg-card rounded-2xl border border-border/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Top Pages
            </h3>
            <button onClick={() => router.push("/super-admin/analytics")} className="text-xs text-primary font-medium hover:underline">View all</button>
          </div>
          {stats.topPages.length > 0 ? (
            <div className="space-y-2">
              {stats.topPages.map((p, i) => {
                const maxCount = stats.topPages[0]?.count || 1;
                const pct = (p.count / maxCount) * 100;
                return (
                  <div key={i} className="relative rounded-lg overflow-hidden">
                    <div className="absolute inset-0 bg-primary/5 rounded-lg" style={{ width: `${pct}%` }} />
                    <div className="relative flex items-center gap-2 px-3 py-2">
                      <span className="text-xs font-mono text-muted-foreground/60 w-3 shrink-0">{i + 1}</span>
                      <p className="text-xs font-mono font-medium text-foreground truncate flex-1">{p.page_path}</p>
                      <span className="text-xs font-bold text-primary tabular-nums shrink-0">{p.count}</span>
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

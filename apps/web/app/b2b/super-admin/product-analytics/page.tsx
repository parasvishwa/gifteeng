"use client";

// Super-admin — Product Analytics (events + funnel)
// Complements the existing /super-admin/analytics page (which focuses on
// traffic: page views, geo, referrers). This page visualises the new
// event-driven analytics backend:
//
//   GET /api/admin/analytics/summary?days=N
//     {
//       windowDays, totalEvents, uniqueSessions, uniqueCustomers,
//       byEvent:    [{event, count}],
//       byPlatform: [{platform, count}],
//       topPaths:   [{path, count}],      // page_view events only
//       byDay:      [{date, count}],
//       funnel:     [{event, sessions}],  // 6-stage conversion funnel
//     }

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gifteeng/ui";
import {
  Activity, Users, Smartphone, Target, TrendingUp, Loader2, RefreshCw, LineChart, Zap,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { authHeaders, getApiBase, safeGet } from "@/lib/admin-api";

interface Summary {
  windowDays: number;
  totalEvents: number;
  uniqueSessions: number;
  uniqueCustomers: number;
  byEvent:    { event: string; count: number }[];
  byPlatform: { platform: string; count: number }[];
  topPaths:   { path: string; count: number }[];
  byDay:      { date: string; count: number }[];
  funnel:     { event: string; sessions: number }[];
}

const FUNNEL_LABEL: Record<string, string> = {
  home_view:        "Home viewed",
  category_tap:     "Category tapped",
  product_view:     "Product opened",
  add_to_cart:      "Added to cart",
  checkout_start:   "Checkout started",
  checkout_success: "Order placed",
};

const EVENT_COLORS = ["#F59E0B", "#EC4899", "#10B981", "#8B5CF6", "#3B82F6", "#F43F5E", "#06B6D4", "#84CC16"];

export default function ProductAnalytics() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await safeGet<Summary | null>(`/admin/analytics/summary?days=${days}`, null);
    setData(s);
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight">Product Analytics</h1>
          <p className="text-xs text-muted-foreground">
            Events, conversion funnel, and platform breakdown
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5 h-8 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data || data.totalEvents === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-4 gap-2">
            <StatCard label="Total events"      val={data.totalEvents}      icon={Activity} color="text-primary" />
            <StatCard label="Unique sessions"   val={data.uniqueSessions}   icon={Users}    color="text-emerald-600" />
            <StatCard label="Unique customers"  val={data.uniqueCustomers}  icon={Users}    color="text-blue-600" />
            <StatCard label="Days in window"    val={data.windowDays}       icon={LineChart} color="text-amber-600" />
          </div>

          {/* Conversion funnel */}
          <FunnelCard funnel={data.funnel} />

          <div className="grid md:grid-cols-2 gap-3">
            {/* Daily trend */}
            <Card title="Daily events" icon={LineChart}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.byDay}>
                  <defs>
                    <linearGradient id="dayGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4}/>
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="date" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                  <YAxis fontSize={10} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#F59E0B" fill="url(#dayGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* Platform pie-style bar */}
            <Card title="By platform" icon={Smartphone}>
              <div className="space-y-2">
                {data.byPlatform.map((p, i) => {
                  const pct = (p.count / data.totalEvents) * 100;
                  return (
                    <div key={p.platform}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium capitalize">{p.platform || "unknown"}</span>
                        <span className="text-muted-foreground">
                          {p.count.toLocaleString("en-IN")} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: EVENT_COLORS[i % EVENT_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {/* Top events bar chart */}
            <Card title="Top events" icon={Activity}>
              <ResponsiveContainer width="100%" height={Math.max(200, data.byEvent.slice(0, 10).length * 28)}>
                <BarChart data={data.byEvent.slice(0, 10)} layout="vertical" margin={{ left: 90, right: 8 }}>
                  <XAxis type="number" fontSize={10} />
                  <YAxis type="category" dataKey="event" fontSize={11} width={100} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.byEvent.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={EVENT_COLORS[i % EVENT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Top paths */}
            <Card title="Top screens (page_view only)" icon={TrendingUp}>
              {data.topPaths.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No page views recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.topPaths.map((p) => (
                    <div
                      key={p.path}
                      className="flex items-center gap-3 px-2.5 py-1.5 bg-muted/10 rounded-lg"
                    >
                      <span className="flex-1 text-xs font-mono truncate">{p.path}</span>
                      <span className="text-xs font-bold text-primary shrink-0">
                        {p.count.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
      <Zap className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
      <p className="text-sm font-medium mb-1">No events yet</p>
      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
        As soon as mobile users interact with the app — searches, category taps, pack opens,
        checkouts — events will flow into this dashboard.
      </p>
    </div>
  );
}

function StatCard({
  label, val, icon: Icon, color,
}: { label: string; val: number; icon: React.ElementType; color?: string }) {
  return (
    <div className="bg-card rounded-xl p-3 border border-border/40">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${color ?? "text-muted-foreground"}`} />
        <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold tracking-tight">{val.toLocaleString("en-IN")}</p>
    </div>
  );
}

function Card({
  title, icon: Icon, children,
}: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: { event: string; sessions: number }[] }) {
  const top = funnel[0]?.sessions ?? 0;

  return (
    <Card title="Conversion funnel" icon={Target}>
      {top === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Funnel populates once mobile events start flowing. Instrument home_view → checkout_success.
        </p>
      ) : (
        <div className="space-y-2.5">
          {funnel.map((stage, i) => {
            const pct = top > 0 ? (stage.sessions / top) * 100 : 0;
            const prevSessions = i === 0 ? stage.sessions : funnel[i - 1]!.sessions;
            const stepPct = prevSessions > 0 ? (stage.sessions / prevSessions) * 100 : 0;
            const color = EVENT_COLORS[i % EVENT_COLORS.length];
            return (
              <div key={stage.event}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] w-4 text-muted-foreground font-mono">{i + 1}</span>
                  <span className="text-xs font-medium">
                    {FUNNEL_LABEL[stage.event] ?? stage.event}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {stage.sessions.toLocaleString("en-IN")} sessions
                  </span>
                  {i > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${stepPct >= 50 ? "bg-emerald-500/10 text-emerald-600" : stepPct >= 25 ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-500"}`}>
                      {stepPct.toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="h-6 bg-muted/20 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg flex items-center px-3 text-[10px] font-bold text-white transition-all"
                    style={{ width: `${Math.max(pct, 2)}%`, background: color }}
                  >
                    {pct >= 12 && `${pct.toFixed(0)}%`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

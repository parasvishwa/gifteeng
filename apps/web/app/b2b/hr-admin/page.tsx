"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@gifteeng/ui";
import {
  Gift,
  Wallet,
  Package,
  Users,
  Plus,
  ArrowRight,
  Clock,
  Sparkles,
  ChevronRight,
  Target,
  TrendingUp,
  Building2,
} from "lucide-react";
import { apiB2b } from "@/lib/api";
import { useCompany } from "./_components/CompanyContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type WalletData = {
  id: string;
  balance: number;
  locked: number;
  currency: string;
};

type Campaign = {
  id: string;
  title: string;
  description?: string;
  status: string;
  type: string;
  budgetTotal: number;
  perEmployeeAmount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  currency?: string;
};

type Order = {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: string;
  grandTotal: number;
  currency?: string;
  employeeName?: string;
};

type OrdersResp = { items: Order[]; total?: number } | Order[];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}

const CAMPAIGN_COLORS: Record<string, string> = {
  festival:   "bg-orange-100 text-orange-700",
  reward:     "bg-purple-100 text-purple-700",
  onboarding: "bg-green-100  text-green-700",
  milestone:  "bg-blue-100   text-blue-700",
  custom:     "bg-gray-100   text-gray-700",
};

const CAMPAIGN_ICONS: Record<string, string> = {
  festival: "🎉", reward: "⭐", onboarding: "👋", milestone: "🏆", custom: "🎁",
};

function daysLeft(endsAt?: string | null): string {
  if (!endsAt) return "Ongoing";
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "Ended";
  if (days === 0) return "Ends today";
  return `${days} day${days !== 1 ? "s" : ""} left`;
}

const QUICK_ACTIONS = [
  {
    href: "/hr-admin/campaigns",
    icon: Gift,
    label: "New Campaign",
    desc: "Reward your team",
    grad: "from-purple-500 to-violet-600",
  },
  {
    href: "/hr-admin/employees",
    icon: Users,
    label: "Manage Team",
    desc: "Add or view employees",
    grad: "from-blue-500 to-indigo-600",
  },
  {
    href: "/hr-admin/wallet",
    icon: Wallet,
    label: "Fund Wallet",
    desc: "Top up gift budget",
    grad: "from-emerald-500 to-teal-600",
  },
  {
    href: "/hr-admin/orders",
    icon: Package,
    label: "Track Orders",
    desc: "View all gift orders",
    grad: "from-amber-500 to-orange-600",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HrAdminDashboardPage() {
  const { company, loading: companyLoading } = useCompany();
  const [wallet, setWallet]       = useState<WalletData | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [empCount, setEmpCount]   = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const api = apiB2b();
      try {
        const [walletRes, campaignsRes, ordersRes, empRes] = await Promise.allSettled([
          api.get<any>("/api/wallet/company"),
          api.get<Campaign[]>("/api/campaigns"),
          api.get<OrdersResp>("/api/orders/b2b/company", { pageSize: 5 }),
          api.get<any>("/api/companies/me/employees"),
        ]);

        if (walletRes.status === "fulfilled" && walletRes.value) {
          const r = walletRes.value;
          setWallet({
            id:       r.id,
            balance:  Number(r.balance ?? 0),
            locked:   Number(r.locked ?? r.lockedBalance ?? 0),
            currency: r.currency ?? "INR",
          });
        }
        if (campaignsRes.status === "fulfilled") {
          setCampaigns(Array.isArray(campaignsRes.value) ? campaignsRes.value : []);
        }
        if (ordersRes.status === "fulfilled") {
          const v = ordersRes.value;
          setOrders(Array.isArray(v) ? v : (v?.items ?? []));
        }
        if (empRes.status === "fulfilled") {
          const v = empRes.value;
          setEmpCount(Array.isArray(v) ? v.length : (v?.total ?? null));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const openOrders = orders.filter(
    (o) => !["delivered", "cancelled"].includes(o.status),
  ).length;
  const available = wallet ? Math.max(0, wallet.balance - wallet.locked) : 0;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">

      {/* ─── Hero Banner ──────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-6 text-white shadow-xl">
        {/* dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* large decorative circle */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-purple-200">
              <Sparkles className="h-3.5 w-3.5" />
              Gifteeng for Business
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">
              {greeting},{" "}
              <span className="text-purple-100">
                {companyLoading ? "..." : company?.name ?? "Team"}
              </span>
              ! 👋
            </h1>
            <p className="mt-1 text-sm text-purple-200">
              {activeCampaigns.length > 0
                ? `${activeCampaigns.length} active campaign${activeCampaigns.length !== 1 ? "s" : ""} running — keep it up!`
                : "Ready to make your team feel special today?"}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/hr-admin/campaigns"
              className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 shadow transition-all hover:scale-105 hover:bg-purple-50"
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </Link>
            <Link
              href="/hr-admin/employees"
              className="flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-sm text-white backdrop-blur-sm transition-all hover:bg-white/25"
            >
              <Users className="h-4 w-4" />
              Team
            </Link>
          </div>
        </div>

        {/* Stats row inside hero */}
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              emoji: "💰",
              label: "Available Budget",
              val:   wallet ? fmt(available, wallet.currency) : "—",
            },
            {
              emoji: "🎯",
              label: "Active Campaigns",
              val:   loading ? "..." : String(activeCampaigns.length),
            },
            {
              emoji: "📦",
              label: "Open Orders",
              val:   loading ? "..." : String(openOrders),
            },
            {
              emoji: "👥",
              label: "Employees",
              val:   loading ? "..." : (empCount != null ? String(empCount) : "—"),
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-white/10 p-3.5 backdrop-blur-sm"
            >
              <div className="text-2xl leading-none">{s.emoji}</div>
              <div className="mt-1.5 text-xl font-bold">{s.val}</div>
              <div className="text-[11px] text-purple-200">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ─── Quick Actions ────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group relative overflow-hidden rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${a.grad} text-white shadow`}
              >
                <a.icon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">{a.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{a.desc}</p>
              <ChevronRight className="absolute right-3 top-4 h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </div>

      {/* ─── No Campaigns Onboarding ──────────────────────────── */}
      {!loading && campaigns.length === 0 && (
        <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50 py-10 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-purple-100">
            <Gift className="h-7 w-7 text-purple-500" />
          </div>
          <h3 className="font-semibold text-purple-900">Launch your first campaign</h3>
          <p className="mx-auto mt-1 max-w-xs text-sm text-purple-600">
            Gifting campaigns help you reward employees, celebrate milestones, and boost team morale.
          </p>
          <Link
            href="/hr-admin/campaigns"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            Create first campaign
          </Link>
        </div>
      )}

      {/* ─── Active Campaigns ─────────────────────────────────── */}
      {(loading || activeCampaigns.length > 0) && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Active Campaigns
            </h2>
            <Link
              href="/hr-admin/campaigns"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activeCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/hr-admin/campaigns/${c.id}`}
                  className="group block rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-xl">
                        {CAMPAIGN_ICONS[c.type] ?? "🎁"}
                      </div>
                      <div>
                        <p className="line-clamp-1 text-sm font-semibold">{c.title}</p>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${CAMPAIGN_COLORS[c.type] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {c.type}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <div className="mt-3 space-y-1.5 border-t pt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Total budget</span>
                      <span className="font-semibold">
                        {fmt(c.budgetTotal, c.currency)}
                      </span>
                    </div>
                    {c.perEmployeeAmount != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Per employee</span>
                        <span className="font-semibold">
                          {fmt(c.perEmployeeAmount, c.currency)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {daysLeft(c.endsAt)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Budget Snapshot ─────────────────────────────────── */}
      {!loading && wallet && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {fmt(available, wallet.currency)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ready to allocate to campaigns
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Locked in Orders</p>
              <p className="mt-1 text-xl font-bold text-amber-700">
                {fmt(wallet.locked, wallet.currency)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Pending delivery confirmation
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Wallet</p>
              <p className="mt-1 text-xl font-bold text-violet-700">
                {fmt(wallet.balance, wallet.currency)}
              </p>
              <Link
                href="/hr-admin/wallet"
                className="mt-0.5 flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Fund wallet <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Recent Orders ────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <Link
            href="/hr-admin/orders"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32" />
          ) : orders.length === 0 ? (
            <div className="rounded-lg bg-muted/30 py-10 text-center">
              <Package className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No orders placed yet.</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Activate a campaign to let employees start gifting.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Order #</TableCell>
                  <TableCell>Employee</TableCell>
                  <TableCell>Placed</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell className="text-right">Total</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.orderNumber}</TableCell>
                    <TableCell>{o.employeeName ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(o.placedAt).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(o.grandTotal, o.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

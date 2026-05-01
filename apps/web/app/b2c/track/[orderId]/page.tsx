"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, Truck, CheckCircle2, Clock, Home, ArrowLeft, Loader2 } from "lucide-react";

type Shipment = {
  id: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  status?: string;
  estimatedDelivery?: string;
};

type Order = {
  id: string;
  number?: string;
  orderNumber?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  items?: Array<{ id?: string; title?: string; productId?: string; qty?: number; quantity?: number }>;
  shipments?: Shipment[];
};

const TIMELINE: Array<{ key: string; label: string; icon: React.ElementType }> = [
  { key: "ordered",       label: "Ordered",       icon: CheckCircle2 },
  { key: "confirmed",     label: "Confirmed",     icon: CheckCircle2 },
  { key: "in_production", label: "In Production", icon: Package },
  { key: "shipped",       label: "Shipped",       icon: Truck },
  { key: "delivered",     label: "Delivered",     icon: Home },
];

const STATUS_COLOR: Record<string, string> = {
  delivered:     "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400",
  shipped:       "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30 dark:text-cyan-400",
  in_production: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 dark:text-indigo-400",
  confirmed:     "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400",
  cancelled:     "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400",
};

async function fetchOrder(orderId: string): Promise<Order | null> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2c.token") : null;

  const endpoints = [
    // Authenticated endpoint — for logged-in users coming from orders page
    token
      ? { url: `/api/orders/b2c/mine/${orderId}`, headers: { Authorization: `Bearer ${token}` } }
      : null,
    // Public tracking endpoint — for guests coming from track search
    { url: `/api/orders/track/${orderId}`, headers: {} },
  ].filter(Boolean) as { url: string; headers: Record<string, string> }[];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        headers: { "Content-Type": "application/json", ...ep.headers },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as Order;
        if (data?.id) return data;
      }
    } catch { /* try next */ }
  }
  return null;
}

export default function TrackOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrder(orderId).then((o) => {
      setOrder(o);
      setLoading(false);
    });
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="text-5xl mb-4">📦</div>
        <h1 className="text-2xl font-black">Order not found</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          We couldn&apos;t find tracking info for this order. It may have been removed or you may need to log in.
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <Link
            href="/b2c/track"
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold hover:bg-muted transition-colors"
          >
            Track by order number
          </Link>
          <Link
            href="/b2c/orders"
            className="rounded-xl bg-[#EF3752] text-white px-4 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            My Orders
          </Link>
        </div>
      </div>
    );
  }

  const statusKey = (order.status ?? "").toLowerCase();
  const currentIdx = TIMELINE.findIndex((s) => s.key === statusKey);
  const displayNumber = order.orderNumber ?? order.number ?? order.id.slice(0, 8).toUpperCase();
  const rawDate = order.createdAt ?? order.created_at;
  const placedDate = rawDate ? new Date(rawDate) : null;
  const statusColor = STATUS_COLOR[statusKey] ?? "text-primary bg-primary/10";

  return (
    <div className="mx-auto max-w-3xl px-4 pt-20 md:pt-24 pb-28 md:pb-12">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {/* Hero card */}
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
              Tracking Order
            </p>
            <h1 className="text-2xl md:text-3xl font-black tabular-nums">
              #{displayNumber}
            </h1>
            {placedDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Placed {placedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {placedDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
              </p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${statusColor}`}>
            {(order.status ?? "Processing").replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 mb-5">
        <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-5">Status</h2>
        <div className="relative">
          <div className="absolute left-0 right-0 top-5 h-0.5 bg-muted" />
          {currentIdx >= 0 && (
            <div
              className="absolute left-0 top-5 h-0.5 bg-[#EF3752] transition-all duration-700"
              style={{ width: `${(currentIdx / (TIMELINE.length - 1)) * 100}%` }}
            />
          )}
          <ol className="relative flex items-start justify-between">
            {TIMELINE.map((step, i) => {
              const active = i <= currentIdx;
              const Icon = step.icon;
              return (
                <li key={step.key} className="flex flex-col items-center flex-1">
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`mt-2 text-[10px] md:text-xs font-bold text-center px-1 ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Shipments */}
      {order.shipments && order.shipments.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6 mb-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5" /> Shipment Tracking
          </h2>
          <div className="space-y-3">
            {order.shipments.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-border/60 p-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{s.carrier ?? "Standard shipping"}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {s.trackingNumber ?? "Tracking pending"}
                  </p>
                  {s.estimatedDelivery && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">
                      ETA: {new Date(s.estimatedDelivery).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  )}
                </div>
                {s.trackingUrl && (
                  <a
                    href={s.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-black text-primary hover:underline shrink-0"
                  >
                    Track →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items */}
      {order.items && order.items.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground mb-4">
            Items ({order.items.length})
          </h2>
          <div className="space-y-2">
            {order.items.map((it, i) => (
              <div key={it.id ?? i} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2.5 text-sm">
                <span className="font-medium text-foreground truncate">{it.title ?? it.productId ?? "Product"}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-3">
                  Qty {it.qty ?? it.quantity ?? 1}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

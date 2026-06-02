"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, ChevronRight, ShoppingBag, Clock, CheckCircle2, XCircle, Truck, Loader2 } from "lucide-react";
import { API_BASE_URL, getB2cToken } from "@/lib/api";

interface OrderItem {
  id: string;
  title?: string;
  product_name?: string;
  quantity?: number;
  qty?: number;
  priceLabel?: string;
  unit_price?: number;
  total_price?: number;
  product_image?: string;
  image?: string;
}

interface Order {
  id: string;
  orderNumber?: string;
  order_number?: string;
  status: string;
  paymentStatus?: string;
  payment_status?: string;
  total?: number;
  subtotal?: number;
  createdAt?: string;
  created_at?: string;
  items?: OrderItem[];
  shippingAddress?: { city?: string; state?: string };
  shipping_city?: string;
}

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  new_order: { label: "New Order", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock },
  pending: { label: "Pending", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  processing: { label: "Processing", color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20", icon: Package },
  shipped: { label: "Shipped", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20", icon: Truck },
  delivered: { label: "Delivered", color: "bg-green-500/10 text-green-700 border-green-500/20", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status?.toLowerCase()] ?? {
    label: status,
    color: "bg-muted text-muted-foreground border-border",
    icon: Package,
  };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(order: Order) {
  const amt = order.total ?? order.subtotal ?? 0;
  return `₹${amt.toLocaleString("en-IN")}`;
}

function getOrderNumber(order: Order) {
  return order.orderNumber ?? order.order_number ?? order.id.slice(0, 8).toUpperCase();
}

function getCreatedAt(order: Order) {
  return order.createdAt ?? order.created_at;
}

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const token = getB2cToken();
    if (!token) {
      router.push("/auth");
      return;
    }
    setAuthed(true);
    fetch(`${API_BASE_URL}/api/orders/b2c/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load orders");
        return r.json();
      })
      .then((data: Order[] | { items?: Order[]; data?: Order[] }) => {
        if (Array.isArray(data)) setOrders(data);
        else setOrders(data.items ?? data.data ?? []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load orders"))
      .finally(() => setLoading(false));
  }, [router]);

  if (!authed) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-24 md:pt-28 pb-24 md:pb-16">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track and manage your orders</p>
        </div>
        <Link
          href="/products"
          className="rounded-xl bg-[#EF3752] px-4 py-2 text-sm font-bold text-white"
        >
          Shop more
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed py-24 text-center">
          <ShoppingBag className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <p className="font-semibold text-muted-foreground">No orders yet</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Your orders will appear here once you place one.
            </p>
          </div>
          <Link
            href="/products"
            className="mt-2 rounded-xl bg-[#EF3752] px-5 py-2 text-sm font-bold text-white"
          >
            Browse gifts
          </Link>
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-5">
          {orders.map((order) => {
            const firstItem = order.items?.[0];
            const itemCount = order.items?.length ?? 0;

            return (
              <Link
                key={order.id}
                href={`/orders/${order.orderNumber ?? order.order_number ?? order.id}`}
                className="group block rounded-2xl border border-border/40 bg-card p-6 transition-all hover:border-[#EF3752]/20 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {firstItem?.product_image || firstItem?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={firstItem.product_image ?? firstItem.image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="m-auto mt-3.5 h-7 w-7 text-muted-foreground/40" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">#{getOrderNumber(order)}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {firstItem?.title ?? firstItem?.product_name ?? "Order"}
                        {itemCount > 1 && (
                          <span className="ml-1 text-xs">+{itemCount - 1} more</span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(getCreatedAt(order))}
                        {(order.shippingAddress?.city || order.shipping_city) && (
                          <> · {order.shippingAddress?.city ?? order.shipping_city}</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold">{formatAmount(order)}</div>
                      {(order.paymentStatus ?? order.payment_status) && (
                        <div className="mt-0.5 text-xs text-muted-foreground capitalize">
                          {(order.paymentStatus ?? order.payment_status)?.replace("_", " ")}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

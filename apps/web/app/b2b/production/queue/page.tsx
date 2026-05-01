"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiB2b } from "@/lib/api";

interface OrderItem {
  id?: string;
  name?: string;
  quantity?: number;
}

interface ProductionOrder {
  id: string;
  orderNumber?: string;
  channel?: "b2c" | "b2b";
  status: string;
  customerName?: string;
  companyName?: string;
  grandTotal?: number;
  placedAt?: string;
  items?: OrderItem[];
}

const COLUMNS: { key: string; label: string; next?: string }[] = [
  { key: "confirmed", label: "Confirmed", next: "in_production" },
  { key: "in_production", label: "In Production", next: "ready_to_ship" },
  { key: "ready_to_ship", label: "Ready to Ship", next: "shipped" },
  { key: "shipped", label: "Shipped" },
];

function formatCurrency(v?: number): string {
  if (v == null) return "-";
  return `₹${v.toLocaleString("en-IN")}`;
}

function formatDate(v?: string): string {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleDateString("en-IN");
  } catch {
    return v;
  }
}

export default function ProductionQueuePage() {
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProductionOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const statuses = COLUMNS.map((c) => c.key).join(",");
      const res = await api.get<{ orders?: ProductionOrder[] } | ProductionOrder[]>(
        `/api/orders/production/queue?status=${statuses}`
      );
      const list = Array.isArray(res) ? res : res.orders ?? [];
      setOrders(list);
    } catch {
      setError("Failed to load production queue");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function moveNext(order: ProductionOrder, nextStatus: string) {
    try {
      const api = apiB2b();
      await api.patch(`/api/orders/${order.id}/status`, { status: nextStatus });
      await load();
    } catch {
      setError(`Failed to move order ${order.orderNumber ?? order.id}`);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Production queue</h1>
          <p className="text-sm text-muted-foreground">
            Channel-agnostic orders moving through production
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter((o) => o.status === col.key);
            return (
              <div key={col.key} className="rounded-lg border bg-card p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {colOrders.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colOrders.length === 0 && (
                    <div className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                      Empty
                    </div>
                  )}
                  {colOrders.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-md border bg-background p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                          {o.orderNumber ?? o.id.slice(-6)}
                        </div>
                        <span
                          className={
                            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                            (o.channel === "b2b"
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary text-secondary-foreground")
                          }
                        >
                          {o.channel ?? "b2c"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {o.companyName ?? o.customerName ?? "—"}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span>{o.items?.length ?? 0} items</span>
                        <span>{formatCurrency(o.grandTotal)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {formatDate(o.placedAt)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setSelected(o)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Details
                        </button>
                        <Link
                          href={`/production/queue/${o.id}`}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Open
                        </Link>
                        {col.next && (
                          <button
                            type="button"
                            onClick={() => void moveNext(o, col.next!)}
                            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                          >
                            Move to next
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end bg-black/40"
          onClick={() => setSelected(null)}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {selected.orderNumber ?? selected.id}
              </h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded border px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize">{selected.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Channel</dt>
                <dd className="font-medium uppercase">{selected.channel ?? "b2c"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Customer</dt>
                <dd className="font-medium">
                  {selected.companyName ?? selected.customerName ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="font-medium">{formatCurrency(selected.grandTotal)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">Items</h3>
              <ul className="space-y-1 text-sm">
                {(selected.items ?? []).map((it, idx) => (
                  <li
                    key={it.id ?? idx}
                    className="flex justify-between border-b pb-1"
                  >
                    <span>{it.name ?? "Item"}</span>
                    <span className="text-muted-foreground">
                      x{it.quantity ?? 1}
                    </span>
                  </li>
                ))}
                {(!selected.items || selected.items.length === 0) && (
                  <li className="text-xs text-muted-foreground">No items listed</li>
                )}
              </ul>
            </div>
            <div className="mt-6">
              <Link
                href={`/production/queue/${selected.id}`}
                className="inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                Open full details
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

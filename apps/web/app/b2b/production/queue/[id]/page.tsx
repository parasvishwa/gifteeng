"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiB2b } from "@/lib/api";

interface OrderItem {
  id?: string;
  name?: string;
  sku?: string;
  quantity?: number;
  price?: number;
  customization?: Record<string, unknown>;
}

interface OrderDetail {
  id: string;
  orderNumber?: string;
  channel?: "b2c" | "b2b";
  status: string;
  customerName?: string;
  companyName?: string;
  grandTotal?: number;
  placedAt?: string;
  items?: OrderItem[];
  shipment?: { awb?: string; courier?: string; status?: string };
  statusHistory?: { status: string; at: string }[];
}

export default function ProductionOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const res = await api.get<OrderDetail>(`/api/orders/${id}`);
      setOrder(res);
    } catch {
      setError("Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  async function updateStatus(nextStatus: string) {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const api = apiB2b();
      await api.patch(`/api/orders/${order.id}/status`, { status: nextStatus });
      setFlash(`Status updated to ${nextStatus}`);
      await load();
    } catch {
      setError("Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  async function createShipment() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const api = apiB2b();
      await api.post(`/api/shipping/create`, { orderId: order.id });
      setFlash("Shiprocket shipment created");
      await load();
    } catch {
      setError("Failed to create shipment");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  if (!order) {
    return (
      <div>
        <p className="text-sm text-destructive">{error ?? "Order not found"}</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-3 rounded-md border px-3 py-1.5 text-sm"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {order.orderNumber ?? order.id}
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.companyName ?? order.customerName ?? "—"} ·{" "}
            <span className="capitalize">{order.status}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          Back
        </button>
      </div>

      {flash && (
        <div className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
          {flash}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Items</h2>
            <ul className="divide-y">
              {(order.items ?? []).map((it, idx) => (
                <li key={it.id ?? idx} className="py-2">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{it.name ?? "Item"}</div>
                      {it.sku && (
                        <div className="text-xs text-muted-foreground">
                          SKU: {it.sku}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div>x{it.quantity ?? 1}</div>
                      {it.price != null && (
                        <div className="text-xs text-muted-foreground">
                          ₹{it.price.toLocaleString("en-IN")}
                        </div>
                      )}
                    </div>
                  </div>
                  {it.customization && (
                    <pre className="mt-2 overflow-x-auto rounded bg-secondary p-2 text-[11px]">
                      {JSON.stringify(it.customization, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
              {(!order.items || order.items.length === 0) && (
                <li className="py-2 text-sm text-muted-foreground">
                  No items
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Status timeline</h2>
            <ol className="space-y-2">
              {(order.statusHistory ?? []).map((h, idx) => (
                <li key={idx} className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="capitalize">{h.status}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.at).toLocaleString()}
                  </span>
                </li>
              ))}
              {(!order.statusHistory || order.statusHistory.length === 0) && (
                <li className="text-xs text-muted-foreground">
                  No history available
                </li>
              )}
            </ol>
          </section>
        </div>

        <aside className="space-y-3">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Actions</h2>
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateStatus("in_production")}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                Mark in production
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void updateStatus("ready_to_ship")}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                Mark ready
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createShipment()}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                Create Shiprocket shipment
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                Print label
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                Print invoice
              </button>
            </div>
          </div>

          {order.shipment && (
            <div className="rounded-lg border bg-card p-4 text-sm">
              <h2 className="mb-2 text-sm font-semibold">Shipment</h2>
              <div>AWB: {order.shipment.awb ?? "—"}</div>
              <div>Courier: {order.shipment.courier ?? "—"}</div>
              <div>Status: {order.shipment.status ?? "—"}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";

interface EmployeeOrder {
  id: string;
  orderNumber?: string;
  status: string;
  grandTotal?: number;
  placedAt?: string;
  itemCount?: number;
}

export default function EmployeeOrdersPage() {
  const [orders, setOrders] = useState<EmployeeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const api = apiB2b();
        // API returns { items: Order[], total, page, pageSize } — paginated shape
        const res = await api.get<{ items?: any[] } | any[]>(
          "/api/orders/b2b/employee/mine"
        );
        const raw: any[] = Array.isArray(res) ? res : (res?.items ?? []);
        // Normalise: compute itemCount from items[], coerce Decimal grandTotal to number
        const list: EmployeeOrder[] = raw.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          grandTotal: o.grandTotal != null ? Number(o.grandTotal) : undefined,
          placedAt: o.placedAt,
          itemCount: Array.isArray(o.items) ? o.items.length : undefined,
        }));
        setOrders(list);
      } catch {
        setError("Failed to load orders");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">My orders</h1>
      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Placed</th>
                <th className="p-3">Items</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="cursor-pointer border-t hover:bg-secondary/40"
                  onClick={() =>
                    (window.location.href = `/employee/orders/${o.id}`)
                  }
                >
                  <td className="p-3">
                    <Link
                      href={`/employee/orders/${o.id}`}
                      className="font-medium hover:underline"
                    >
                      {o.orderNumber ?? o.id.slice(-6)}
                    </Link>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {o.placedAt ? new Date(o.placedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3">{o.itemCount ?? "—"}</td>
                  <td className="p-3">
                    {o.grandTotal != null
                      ? `₹${o.grandTotal.toLocaleString("en-IN")}`
                      : "—"}
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

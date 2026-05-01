"use client";

import { useCallback, useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";

interface Shipment {
  id?: string;
  orderId?: string;
  orderNumber?: string;
  awb?: string;
  courier?: string;
  status?: string;
  updatedAt?: string;
}

interface TrackingEvent {
  status?: string;
  location?: string;
  at?: string;
  description?: string;
}

export default function ShippingPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awb, setAwb] = useState("");
  const [tracking, setTracking] = useState<TrackingEvent[] | null>(null);
  const [tracking_err, setTrackingErr] = useState<string | null>(null);
  const [tracking_loading, setTrackingLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const res = await api.get<{ shipments?: Shipment[] } | Shipment[]>(
        `/api/orders/production/queue?status=shipped,ready_to_ship`
      );
      const list = Array.isArray(res) ? res : res.shipments ?? [];
      const mapped: Shipment[] = (list as unknown as Array<Record<string, unknown>>).map(
        (o) => {
          const shipment = (o["shipment"] as Shipment | undefined) ?? {};
          return {
            id: (o["id"] as string | undefined) ?? shipment.id,
            orderId: (o["id"] as string | undefined) ?? shipment.orderId,
            orderNumber: (o["orderNumber"] as string | undefined) ?? shipment.orderNumber,
            awb: shipment.awb,
            courier: shipment.courier,
            status: shipment.status ?? (o["status"] as string | undefined),
            updatedAt: (o["updatedAt"] as string | undefined) ?? shipment.updatedAt,
          };
        }
      );
      setShipments(mapped);
    } catch {
      setError("Failed to load shipments");
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function trackShipment(e: React.FormEvent) {
    e.preventDefault();
    if (!awb.trim()) return;
    setTrackingLoading(true);
    setTrackingErr(null);
    setTracking(null);
    try {
      const api = apiB2b();
      const res = await api.get<{ events?: TrackingEvent[] } | TrackingEvent[]>(
        `/api/shipping/track/${encodeURIComponent(awb.trim())}`
      );
      const events = Array.isArray(res) ? res : res.events ?? [];
      setTracking(events);
    } catch {
      setTrackingErr("Tracking lookup failed");
    } finally {
      setTrackingLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shipping</h1>
        <p className="text-sm text-muted-foreground">
          Recent shipments and tracking lookup
        </p>
      </div>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Track shipment</h2>
        <form onSubmit={trackShipment} className="flex gap-2">
          <input
            type="text"
            value={awb}
            onChange={(e) => setAwb(e.target.value)}
            placeholder="Enter AWB number"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={tracking_loading}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {tracking_loading ? "..." : "Track"}
          </button>
        </form>
        {tracking_err && (
          <div className="mt-3 text-sm text-destructive">{tracking_err}</div>
        )}
        {tracking && (
          <ol className="mt-4 space-y-2">
            {tracking.length === 0 && (
              <li className="text-xs text-muted-foreground">No events yet</li>
            )}
            {tracking.map((ev, idx) => (
              <li key={idx} className="flex gap-3 text-sm">
                <span className="h-2 w-2 translate-y-2 rounded-full bg-primary" />
                <div>
                  <div className="font-medium capitalize">
                    {ev.status ?? ev.description ?? "Event"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ev.location} ·{" "}
                    {ev.at ? new Date(ev.at).toLocaleString() : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">Recent shipments</h2>
        </div>
        {error && (
          <div className="px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">AWB</th>
                <th className="p-3">Order</th>
                <th className="p-3">Courier</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last update</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-muted-foreground"
                  >
                    No shipments yet
                  </td>
                </tr>
              ) : (
                shipments.map((s, idx) => (
                  <tr key={s.id ?? idx} className="border-t">
                    <td className="p-3 font-mono text-xs">{s.awb ?? "—"}</td>
                    <td className="p-3">{s.orderNumber ?? s.orderId ?? "—"}</td>
                    <td className="p-3">{s.courier ?? "—"}</td>
                    <td className="p-3 capitalize">{s.status ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

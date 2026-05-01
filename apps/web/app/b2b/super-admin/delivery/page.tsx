"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Truck, Package, CheckCircle2, XCircle, Clock, Search, X,
  Download, ChevronDown, ChevronRight, Loader2, RefreshCw,
  MapPin, AlertTriangle, ArrowLeft, Filter,
} from "lucide-react";
import {
  Button, Input, Checkbox,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import Link from "next/link";
import { authHeaders, getApiBase, safeGet, safePatch } from "@/lib/admin-api";

// ─── API helpers ─────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────
interface Shipment {
  id: string;
  orderNumber: string;
  order_number?: string;
  customerName: string;
  customer_name?: string;
  awbNumber?: string;
  awb_number?: string;
  courier?: string;
  status: string;
  dispatchedAt?: string;
  dispatched_at?: string;
  expectedDelivery?: string;
  expected_delivery?: string;
  placedAt?: string;
  placed_at?: string;
  created_at?: string;
  grandTotal?: string;
  total?: number;
}

interface TrackingEvent {
  timestamp: string;
  location?: string;
  activity?: string;
  status?: string;
  description?: string;
}

interface TrackingData {
  awb?: string;
  status?: string;
  courier?: string;
  events?: TrackingEvent[];
  tracking?: TrackingEvent[];
  current_status?: string;
  estimated_delivery?: string;
}

// ─── Status config ────────────────────────────────────────────────────────────
const SHIP_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending_pickup: { label: "Pending Pickup", color: "bg-amber-100 text-amber-700 border-amber-300", icon: Clock },
  in_transit:     { label: "In Transit",     color: "bg-blue-100 text-blue-700 border-blue-300",   icon: Truck },
  out_for_delivery: { label: "Out for Delivery", color: "bg-purple-100 text-purple-700 border-purple-300", icon: MapPin },
  delivered:      { label: "Delivered",      color: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  failed:         { label: "Failed",         color: "bg-red-100 text-red-700 border-red-300",     icon: XCircle },
  rto:            { label: "RTO",            color: "bg-orange-100 text-orange-700 border-orange-300", icon: AlertTriangle },
  shipped:        { label: "Shipped",        color: "bg-indigo-100 text-indigo-700 border-indigo-300", icon: Truck },
  returned:       { label: "Returned",       color: "bg-orange-100 text-orange-700 border-orange-300", icon: AlertTriangle },
};

function normalizeShipment(o: Record<string, unknown>): Shipment {
  return {
    id: String(o.id ?? ""),
    orderNumber: String(o.orderNumber ?? o.order_number ?? ""),
    customerName: String(o.customerName ?? o.customer_name ?? "—"),
    awbNumber: String(o.awbNumber ?? o.awb_number ?? o.tracking_number ?? ""),
    courier: String(o.courier ?? o.courier_name ?? ""),
    status: String(o.status ?? "shipped"),
    dispatchedAt: String(o.dispatchedAt ?? o.dispatched_at ?? o.shippedAt ?? o.shipped_at ?? ""),
    expectedDelivery: String(o.expectedDelivery ?? o.expected_delivery ?? ""),
    placedAt: String(o.placedAt ?? o.placed_at ?? o.createdAt ?? o.created_at ?? ""),
    grandTotal: String(o.grandTotal ?? o.total ?? "0"),
  };
}

function ShipStatusBadge({ status }: { status: string }) {
  const cfg = SHIP_STATUS[status] || SHIP_STATUS.shipped;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function fmtDate(s?: string) {
  if (!s || s === "undefined" || s === "null") return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

// ─── Tracking timeline panel ──────────────────────────────────────────────────
function TrackingPanel({ awb, onClose }: { awb: string; onClose: () => void }) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!awb) return;
    setLoading(true);
    setError(null);
    fetch(`${getApiBase()}/api/shipping/track/${encodeURIComponent(awb)}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [awb]);

  const events: TrackingEvent[] = data?.events ?? data?.tracking ?? [];

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-primary" />
          Tracking: <span className="font-mono">{awb}</span>
        </p>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted">
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</div>
      )}
      {!loading && !error && data && (
        <>
          {data.current_status && (
            <div className="flex items-center gap-2">
              <ShipStatusBadge status={data.current_status} />
              {data.estimated_delivery && (
                <span className="text-[10px] text-muted-foreground">Est. {fmtDate(data.estimated_delivery)}</span>
              )}
            </div>
          )}
          {events.length > 0 ? (
            <ol className="relative border-l-2 border-border/50 ml-2 space-y-3 pl-4">
              {events.map((ev, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-primary bg-background" />
                  <p className="text-[10px] text-muted-foreground">{ev.timestamp ? new Date(ev.timestamp).toLocaleString("en-IN") : ""}</p>
                  <p className="text-xs font-medium">{ev.activity ?? ev.status ?? ev.description ?? ""}</p>
                  {ev.location && <p className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{ev.location}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <pre className="text-[10px] overflow-x-auto text-muted-foreground">{JSON.stringify(data, null, 2)}</pre>
          )}
        </>
      )}
    </div>
  );
}

// ─── AWB editor ──────────────────────────────────────────────────────────────
function AwbInput({ shipment, onSaved }: { shipment: Shipment; onSaved: (awb: string) => void }) {
  const [val, setVal] = useState(shipment.awbNumber ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!val.trim()) return;
    setSaving(true);
    await safePatch(`/orders/${shipment.id}`, { awbNumber: val.trim() }, null);
    onSaved(val.trim());
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="Enter AWB…"
        onKeyDown={e => e.key === "Enter" && save()}
        className="flex-1 h-6 rounded border border-border bg-background px-2 text-[10px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
      />
      <button
        onClick={save}
        disabled={saving || !val.trim()}
        className="h-6 px-2 rounded bg-primary text-[9px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "..." : "Save"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminDeliveryPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null); // awb
  const [expandedRow, setExpandedRow] = useState<string | null>(null);     // shipment id
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [markingDelivered, setMarkingDelivered] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchShipments = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    const statuses = ["shipped", "delivered", "returned"];
    const results = await Promise.all(
      statuses.map(s =>
        safeGet<{ items?: unknown[]; data?: unknown[] }>(`/orders/admin/all?pageSize=100&status=${s}`, { items: [] })
      )
    );
    const all: Shipment[] = results.flatMap(r => {
      const arr = (r.items ?? (r as any).data ?? []) as Record<string, unknown>[];
      return arr.map(normalizeShipment);
    });
    // deduplicate by id
    const seen = new Set<string>();
    const deduped = all.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    setShipments(deduped);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchShipments(); }, [fetchShipments]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total:       shipments.length,
      inTransit:   shipments.filter(s => ["shipped", "in_transit", "out_for_delivery"].includes(s.status)).length,
      deliveredToday: shipments.filter(s => s.status === "delivered" && s.dispatchedAt && new Date(s.dispatchedAt).toDateString() === today).length,
      failedRto:   shipments.filter(s => ["failed", "rto", "returned"].includes(s.status)).length,
    };
  }, [shipments]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return shipments.filter(s => {
      const matchSearch = !q
        || s.orderNumber.toLowerCase().includes(q)
        || s.customerName.toLowerCase().includes(q)
        || (s.awbNumber ?? "").toLowerCase().includes(q)
        || (s.courier ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [shipments, search, statusFilter]);

  // ── Selection ──────────────────────────────────────────────────────────────
  const allSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(s => s.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Bulk dispatch ──────────────────────────────────────────────────────────
  const bulkMarkDispatched = async () => {
    const ids = [...selectedIds];
    await Promise.all(ids.map(id => safePatch(`/orders/${id}/status`, { status: "shipped" }, null)));
    setShipments(prev => prev.map(s => ids.includes(s.id) ? { ...s, status: "shipped" } : s));
    setSelectedIds(new Set());
    showToast(`${ids.length} shipment${ids.length > 1 ? "s" : ""} marked as dispatched`);
  };

  // ── Mark delivered ─────────────────────────────────────────────────────────
  const markDelivered = async (s: Shipment) => {
    setMarkingDelivered(s.id);
    await safePatch(`/orders/${s.id}/status`, { status: "delivered" }, null);
    setShipments(prev => prev.map(x => x.id === s.id ? { ...x, status: "delivered" } : x));
    setMarkingDelivered(null);
    showToast(`Order #${s.orderNumber} marked as delivered`);
  };

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = [
      ["Order #", "Customer", "AWB", "Courier", "Status", "Dispatched", "Expected Delivery"],
      ...filtered.map(s => [
        s.orderNumber, s.customerName, s.awbNumber ?? "", s.courier ?? "",
        s.status, fmtDate(s.dispatchedAt), fmtDate(s.expectedDelivery),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shipments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10 space-y-6">

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg animate-in slide-in-from-bottom-2">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/super-admin" className="inline-flex items-center gap-1 hover:text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Delivery Management</h1>
            <p className="text-xs text-muted-foreground">{stats.total} shipments · {stats.inTransit} in transit</p>
          </div>
        </div>
        <button
          onClick={() => fetchShipments(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Section 1: Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Shipments", value: stats.total,         color: "bg-blue-50 border-blue-200 text-blue-800",     icon: Package },
          { label: "In Transit",      value: stats.inTransit,     color: "bg-indigo-50 border-indigo-200 text-indigo-800", icon: Truck },
          { label: "Delivered Today", value: stats.deliveredToday, color: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: CheckCircle2 },
          { label: "Failed / RTO",    value: stats.failedRto,     color: "bg-red-50 border-red-200 text-red-800",       icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`rounded-xl border p-4 ${color}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className="w-4 h-4 opacity-70" />
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</span>
            </div>
            <p className="text-3xl font-bold leading-none">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Section 2: Filters + Table ───────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Order #, customer, AWB, courier…"
              className="pl-8 h-8 text-xs pr-7"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="rto">RTO</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} records</span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm font-medium">No shipments found</p>
            <p className="text-xs text-muted-foreground mt-0.5">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3">Order #</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">AWB Number</th>
                  <th className="px-3 py-3">Courier</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Dispatched</th>
                  <th className="px-3 py-3">Exp. Delivery</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filtered.map(s => {
                  const isExpanded = expandedRow === s.id;
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        className={`hover:bg-muted/30 transition-colors ${isExpanded ? "bg-muted/20" : ""}`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3 w-8" onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(s.id)}
                            onCheckedChange={() => toggleOne(s.id)}
                          />
                        </td>

                        {/* Order # */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : s.id)}
                            className="flex items-center gap-1 font-mono text-xs font-bold hover:text-primary"
                          >
                            {isExpanded
                              ? <ChevronDown className="w-3 h-3" />
                              : <ChevronRight className="w-3 h-3" />}
                            #{s.orderNumber}
                          </button>
                        </td>

                        {/* Customer */}
                        <td className="px-3 py-3 text-xs max-w-[140px] truncate">{s.customerName}</td>

                        {/* AWB */}
                        <td className="px-3 py-3">
                          {s.awbNumber ? (
                            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{s.awbNumber}</span>
                          ) : (
                            <AwbInput
                              shipment={s}
                              onSaved={awb => setShipments(prev => prev.map(x => x.id === s.id ? { ...x, awbNumber: awb } : x))}
                            />
                          )}
                        </td>

                        {/* Courier */}
                        <td className="px-3 py-3 text-xs text-muted-foreground">{s.courier || "—"}</td>

                        {/* Status */}
                        <td className="px-3 py-3">
                          <ShipStatusBadge status={s.status} />
                        </td>

                        {/* Dispatched */}
                        <td className="px-3 py-3 text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(s.dispatchedAt)}</td>

                        {/* Expected */}
                        <td className="px-3 py-3 text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(s.expectedDelivery)}</td>

                        {/* Actions */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {s.awbNumber && (
                              <button
                                onClick={() => {
                                  setExpandedRow(s.id);
                                  setExpandedTrack(expandedTrack === s.awbNumber ? null : (s.awbNumber ?? null));
                                }}
                                className="h-6 px-2 rounded border border-border text-[10px] font-medium hover:bg-muted transition-colors inline-flex items-center gap-1"
                              >
                                <Truck className="w-2.5 h-2.5" /> Track
                              </button>
                            )}
                            {s.status !== "delivered" && (
                              <button
                                onClick={() => markDelivered(s)}
                                disabled={markingDelivered === s.id}
                                className="h-6 px-2 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                              >
                                {markingDelivered === s.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                                Delivered
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row: AWB editor + tracking */}
                      {isExpanded && (
                        <tr className="bg-muted/10">
                          <td colSpan={9} className="px-6 pb-4 pt-2">
                            <div className="space-y-3">
                              {/* AWB edit even if already set */}
                              <div className="max-w-xs">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Update AWB Number</p>
                                <AwbInput
                                  shipment={s}
                                  onSaved={awb => setShipments(prev => prev.map(x => x.id === s.id ? { ...x, awbNumber: awb } : x))}
                                />
                              </div>

                              {/* Tracking panel */}
                              {s.awbNumber && expandedTrack === s.awbNumber && (
                                <TrackingPanel awb={s.awbNumber} onClose={() => setExpandedTrack(null)} />
                              )}
                              {s.awbNumber && expandedTrack !== s.awbNumber && (
                                <button
                                  onClick={() => setExpandedTrack(s.awbNumber ?? null)}
                                  className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  <Truck className="w-3 h-3" /> Show tracking timeline
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 3: Bulk Actions ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-4 py-4 flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bulk Actions</p>
        <span className="text-xs text-muted-foreground">
          {selectedIds.size} selected
        </span>

        <button
          onClick={toggleAll}
          className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={bulkMarkDispatched}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
          >
            <Truck className="w-3.5 h-3.5" />
            Mark {selectedIds.size} as Dispatched
          </button>
        )}

        <button
          onClick={exportCsv}
          className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
    </div>
  );
}

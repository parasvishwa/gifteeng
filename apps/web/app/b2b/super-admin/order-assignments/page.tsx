"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Zap, Loader2, CheckCircle2, XCircle, Clock, Search,
  Truck, AlertTriangle, Star, Package, RotateCcw,
} from "lucide-react";
import { safeGet, safePatch, adminToast } from "@/lib/admin-api";

type AssignmentStatus =
  | "pending" | "accepted" | "processing" | "dispatched"
  | "delivered" | "returned" | "floating" | "cancelled";

interface Assignment {
  id: string;
  status: AssignmentStatus;
  attemptNumber: number;
  assignedAt: string;
  deadlineAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  courier: string | null;
  awb: string | null;
  seller: { brandName: string; city: string | null; state: string | null };
  orderItem: {
    qty: number;
    order: { orderNumber: string; grandTotal: string };
    product: { title: string };
  };
}

const STATUS_META: Record<AssignmentStatus, { icon: typeof Clock; cls: string; label: string }> = {
  pending:    { icon: Clock,          cls: "text-blue-700 bg-blue-100 border-blue-200",     label: "Pending" },
  accepted:   { icon: CheckCircle2,   cls: "text-indigo-700 bg-indigo-100 border-indigo-200", label: "Accepted" },
  processing: { icon: Package,        cls: "text-amber-700 bg-amber-100 border-amber-200",  label: "Preparing" },
  dispatched: { icon: Truck,          cls: "text-purple-700 bg-purple-100 border-purple-200", label: "Dispatched" },
  delivered:  { icon: Star,           cls: "text-emerald-700 bg-emerald-100 border-emerald-200", label: "Delivered" },
  returned:   { icon: XCircle,        cls: "text-rose-700 bg-rose-100 border-rose-200",     label: "Returned" },
  floating:   { icon: AlertTriangle,  cls: "text-orange-700 bg-orange-100 border-orange-200", label: "Floating" },
  cancelled:  { icon: XCircle,        cls: "text-gray-500 bg-gray-100 border-gray-200",     label: "Cancelled" },
};

const TABS: { key: AssignmentStatus | ""; label: string }[] = [
  { key: "",           label: "All" },
  { key: "pending",    label: "Pending" },
  { key: "floating",   label: "Floating" },
  { key: "cancelled",  label: "Cancelled" },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered",  label: "Delivered" },
];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminOrderAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [tab, setTab]                 = useState<AssignmentStatus | "">("");
  const [search, setSearch]           = useState("");
  const [busy, setBusy]               = useState<string | null>(null);

  useEffect(() => { load(); }, [tab]);

  async function load() {
    setLoading(true);
    const qs = tab ? `?status=${tab}` : "";
    const data = await safeGet<Assignment[]>(`/admin/order-assignments${qs}`, []);
    setAssignments(data ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return assignments;
    const q = search.toLowerCase();
    return assignments.filter((a) =>
      a.seller.brandName.toLowerCase().includes(q) ||
      a.orderItem.order.orderNumber.toLowerCase().includes(q) ||
      a.orderItem.product.title.toLowerCase().includes(q),
    );
  }, [assignments, search]);

  async function forceReassign(id: string) {
    setBusy(id);
    const ok = await safePatch(`/admin/order-assignments/${id}/force-reassign`, {}, null);
    if (ok) { adminToast.info("Re-routing order to next seller…"); await load(); }
    setBusy(null);
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Order Assignments</h1>
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} records</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by order number, seller, or product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground text-sm">No assignments found</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Order</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Seller</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Deadline</th>
                <th className="px-4 py-3 text-left">Attempt</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((a) => {
                const meta    = STATUS_META[a.status];
                const Icon    = meta.icon;
                const overdue = new Date(a.deadlineAt) < new Date() && ["pending", "accepted"].includes(a.status);

                return (
                  <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{a.orderItem.order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        ₹{Number(a.orderItem.order.grandTotal).toLocaleString("en-IN")}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[160px] truncate">{a.orderItem.product.title}</p>
                      <p className="text-xs text-muted-foreground">Qty {a.orderItem.qty}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{a.seller.brandName}</p>
                      <p className="text-xs text-muted-foreground">
                        {[a.seller.city, a.seller.state].filter(Boolean).join(", ")}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`text-xs ${overdue ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                        {overdue ? "Overdue" : fmt(a.deadlineAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">#{a.attemptNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      {["pending", "accepted", "floating"].includes(a.status) && (
                        <button
                          onClick={() => forceReassign(a.id)}
                          disabled={busy === a.id}
                          title="Force re-route to next seller"
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                        >
                          {busy === a.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <RotateCcw className="w-3 h-3" />}
                          Re-route
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

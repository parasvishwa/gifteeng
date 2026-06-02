"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Clock, CheckCircle2, Truck, Star, AlertTriangle,
  XCircle, ChevronRight, ArrowLeft, Loader2, CheckSquare,
  Square, Printer, CalendarClock,
} from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

// ── Types ─────────────────────────────────────────────────────────────────────

type AssignmentStatus =
  | "pending" | "accepted" | "processing" | "dispatched"
  | "delivered" | "returned" | "floating" | "cancelled";

interface Assignment {
  id: string;
  status: AssignmentStatus;
  attemptNumber: number;
  assignedAt: string;
  deadlineAt: string;
  acceptedAt: string | null;
  scheduledDispatchAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  courier: string | null;
  awb: string | null;
  orderItem: {
    qty: number;
    unitPrice: string;
    product: { title: string; images: { url: string }[]; slug: string };
    order: {
      orderNumber: string;
      grandTotal: string;
      placedAt: string;
      shippingAddress: { name?: string; city?: string; state?: string; pincode?: string };
    };
  };
  sellerProduct: { price: string } | null;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<AssignmentStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending:    { label: "New order",  color: "text-blue-600 bg-blue-50 border-blue-200",       icon: Clock        },
  accepted:   { label: "Accepted",   color: "text-indigo-600 bg-indigo-50 border-indigo-200", icon: CheckCircle2 },
  processing: { label: "Preparing",  color: "text-amber-600 bg-amber-50 border-amber-200",    icon: Package      },
  dispatched: { label: "Dispatched", color: "text-purple-600 bg-purple-50 border-purple-200", icon: Truck        },
  delivered:  { label: "Delivered",  color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: Star      },
  returned:   { label: "Returned",   color: "text-rose-600 bg-rose-50 border-rose-200",       icon: ArrowLeft    },
  floating:   { label: "Re-routing", color: "text-orange-600 bg-orange-50 border-orange-200", icon: AlertTriangle },
  cancelled:  { label: "Cancelled",  color: "text-gray-500 bg-gray-50 border-gray-200",       icon: XCircle      },
};

const TABS: { key: string; label: string }[] = [
  { key: "",           label: "All"        },
  { key: "pending",    label: "New"        },
  { key: "accepted",   label: "Accepted"   },
  { key: "processing", label: "Preparing"  },
  { key: "dispatched", label: "Dispatched" },
  { key: "delivered",  label: "Delivered"  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoursUntil(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now();
  const hrs  = Math.floor(diff / 3_600_000);
  if (hrs < 0) return { text: "Overdue", urgent: true };
  if (hrs < 2) return { text: `${hrs}h left`, urgent: true };
  return { text: `${hrs}h left`, urgent: false };
}

function inr(v: string | number) {
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SellerOrdersPage() {
  const router = useRouter();

  const [orders,    setOrders]    = useState<Assignment[]>([]);
  const [tab,       setTab]       = useState("");
  const [loading,   setLoading]   = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [bulkBusy,  setBulkBusy]  = useState(false);
  const [bulkMsg,   setBulkMsg]   = useState("");
  const [schedDate, setSchedDate] = useState("");
  const [schedOpen, setSchedOpen] = useState(false);

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Clear selection when tab changes
  useEffect(() => { setSelected(new Set()); setSelectMode(false); setSchedOpen(false); }, [tab]);

  async function load() {
    setLoading(true);
    try {
      const qs   = tab ? `?status=${tab}` : "";
      const data = await sellerApi.get<Assignment[]>(`/seller/orders${qs}`);
      setOrders(data);
    } catch { /* swallow */ }
    finally  { setLoading(false); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pendingIds = orders.filter(o => o.status === "pending").map(o => o.id);
    if (pendingIds.every(id => selected.has(id))) {
      setSelected(prev => { const next = new Set(prev); pendingIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelected(prev => { const next = new Set(prev); pendingIds.forEach(id => next.add(id)); return next; });
    }
  }

  async function handleBulkAccept() {
    const ids = Array.from(selected).filter(id => orders.find(o => o.id === id)?.status === "pending");
    if (ids.length === 0) return;
    setBulkBusy(true); setBulkMsg("");
    try {
      const res = await sellerApi.patch<{ accepted: number; skipped: number }>("/seller/orders/bulk-accept", { ids });
      setBulkMsg(`${res.accepted} order${res.accepted === 1 ? "" : "s"} accepted`);
      setSelected(new Set());
      setSelectMode(false);
      await load();
    } catch {
      setBulkMsg("Bulk accept failed");
    } finally {
      setBulkBusy(false);
      setTimeout(() => setBulkMsg(""), 3000);
    }
  }

  async function handleBulkSchedule() {
    if (!schedDate) return;
    const ids = Array.from(selected).filter(id => {
      const o = orders.find(o => o.id === id);
      return o && ["accepted", "processing"].includes(o.status);
    });
    if (ids.length === 0) return;
    setBulkBusy(true); setBulkMsg("");
    try {
      const res = await sellerApi.patch<{ scheduled: number; skipped: number }>("/seller/orders/bulk-schedule", {
        ids,
        scheduledDispatchAt: new Date(schedDate).toISOString(),
      });
      setBulkMsg(`${res.scheduled} order${res.scheduled === 1 ? "" : "s"} scheduled`);
      setSelected(new Set());
      setSelectMode(false);
      setSchedOpen(false);
      setSchedDate("");
      await load();
    } catch {
      setBulkMsg("Schedule failed");
    } finally {
      setBulkBusy(false);
      setTimeout(() => setBulkMsg(""), 3000);
    }
  }

  function openPackingSlips() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    window.open(`/seller/orders/packing-slip?ids=${ids.join(",")}`, "_blank");
  }

  const pendingInView       = orders.filter(o => o.status === "pending");
  const selectedPending     = Array.from(selected).filter(id => orders.find(o => o.id === id)?.status === "pending");
  const selectedSchedulable = Array.from(selected).filter(id => {
    const o = orders.find(o => o.id === id);
    return o && ["accepted", "processing"].includes(o.status);
  });
  const selectedAll     = orders.filter(o => ["accepted", "processing", "dispatched"].includes(o.status));

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <Package className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-base flex-1">My Orders</h1>
        <button
          onClick={() => { setSelectMode(v => !v); setSelected(new Set()); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${selectMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          {selectMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          {selectMode ? "Cancel" : "Select"}
        </button>
      </header>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-2 flex items-center gap-2 flex-wrap">
          {pendingInView.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {pendingInView.every(o => selected.has(o.id)) ? "Deselect all new" : "Select all new"}
            </button>
          )}
          <span className="text-xs text-muted-foreground flex-1">
            {selected.size > 0 ? `${selected.size} selected` : "Tap orders to select"}
          </span>
          {bulkMsg && (
            <span className="text-xs font-semibold text-emerald-600">{bulkMsg}</span>
          )}
          {selectedPending.length > 0 && (
            <button
              onClick={handleBulkAccept}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
            >
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Accept {selectedPending.length}
            </button>
          )}
          {selectedSchedulable.length > 0 && (
            <button
              onClick={() => setSchedOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${schedOpen ? "bg-indigo-600 text-white border-indigo-600" : "border-border bg-card hover:bg-muted"}`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              Schedule ({selectedSchedulable.length})
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={openPackingSlips}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted"
            >
              <Printer className="w-3.5 h-3.5" /> Packing slip ({selected.size})
            </button>
          )}
        </div>
      )}

      {/* Schedule date picker row */}
      {selectMode && schedOpen && (
        <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <CalendarClock className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-semibold text-indigo-700">Dispatch date:</span>
          <input
            type="datetime-local"
            value={schedDate}
            onChange={(e) => setSchedDate(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className="flex-1 min-w-0 border border-indigo-200 rounded-lg px-2.5 py-1 text-xs bg-white"
          />
          <button
            onClick={handleBulkSchedule}
            disabled={bulkBusy || !schedDate}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50"
          >
            {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Confirm
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto px-4 py-3 bg-white border-b scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 max-w-2xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No orders here yet</p>
          </div>
        ) : (
          orders.map((a) => (
            <OrderCard
              key={a.id}
              assignment={a}
              selectMode={selectMode}
              selected={selected.has(a.id)}
              onToggleSelect={() => toggleSelect(a.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  assignment: a, selectMode, selected, onToggleSelect,
}: {
  assignment: Assignment;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const router     = useRouter();

  if (!a.orderItem) return null;

  const meta       = STATUS_META[a.status];
  const StatusIcon = meta.icon;
  const product    = a.orderItem.product;
  const order      = a.orderItem.order;
  const addr       = order.shippingAddress;
  const isActive   = ["pending", "accepted"].includes(a.status);
  const countdown  = isActive ? hoursUntil(a.deadlineAt) : null;
  const schedAt    = a.scheduledDispatchAt
    ? new Date(a.scheduledDispatchAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : null;
  const imgUrl     = product.images?.[0]?.url;

  function handleClick() {
    if (selectMode) { onToggleSelect(); return; }
    router.push(`/seller/orders/${a.id}`);
  }

  return (
    <div
      onClick={handleClick}
      className={`w-full text-left bg-white rounded-xl border p-4 transition-all flex gap-3 items-start cursor-pointer ${
        selectMode && selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "hover:shadow-sm"
      }`}
    >
      {/* Checkbox in select mode */}
      {selectMode && (
        <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${selected ? "bg-primary border-primary" : "border-border"}`}>
          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
        </div>
      )}

      {/* Thumbnail */}
      {imgUrl ? (
        <img src={imgUrl} alt={product.title} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center">
          <Package className="w-5 h-5 text-muted-foreground" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm truncate">{product.title}</p>
          {!selectMode && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />}
        </div>

        <p className="text-xs text-muted-foreground mt-0.5">
          {order.orderNumber} · Qty {a.orderItem.qty} · ₹{inr(a.sellerProduct?.price ?? a.orderItem.unitPrice)}
        </p>

        <p className="text-xs text-muted-foreground">
          {[addr.name, addr.city, addr.state].filter(Boolean).join(", ")}
          {addr.pincode ? ` — ${addr.pincode}` : ""}
        </p>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
            <StatusIcon className="w-3 h-3" />
            {meta.label}
          </span>
          {countdown && (
            <span className={`text-xs font-medium ${countdown.urgent ? "text-red-500" : "text-muted-foreground"}`}>
              {countdown.text}
            </span>
          )}
          {schedAt && !a.dispatchedAt && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5">
              <CalendarClock className="w-2.5 h-2.5" /> {schedAt}
            </span>
          )}
          {!selectMode && ["accepted", "processing"].includes(a.status) && (
            <a
              href={`/seller/orders/packing-slip?ids=${a.id}`}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="ml-auto text-[10px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              <Printer className="w-3 h-3" /> Slip
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

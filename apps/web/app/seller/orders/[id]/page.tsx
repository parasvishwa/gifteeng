"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft, Package, CheckCircle2, Truck, Star, Clock,
  AlertTriangle, XCircle, MapPin, CalendarClock, Loader2, FileText,
} from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

// ── Types ─────────────────────────────────────────────────────────────────

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
  returnedAt: string | null;
  useOwnCourier: boolean;
  courier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  notes: string | null;
  seller: { chargesCourier: boolean; brandName: string };
  orderItem: {
    qty: number;
    unitPrice: string;
    totalPrice: string;
    variantOptions: Record<string, string> | null;
    customization: Record<string, unknown> | null;
    product: { title: string; images: { url: string }[] };
    order: {
      orderNumber: string;
      grandTotal: string;
      placedAt: string;
      shippingAddress: {
        name?: string; line1?: string; line2?: string;
        city?: string; state?: string; pincode?: string; phone?: string;
      };
    };
  };
  sellerProduct: { price: string } | null;
}

// ── Status config ─────────────────────────────────────────────────────────

const STATUS_META: Record<AssignmentStatus, { label: string; color: string }> = {
  pending:    { label: "New — awaiting your acceptance", color: "text-blue-600 bg-blue-50 border-blue-200" },
  accepted:   { label: "Accepted — prepare the order",   color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  processing: { label: "Preparing",                      color: "text-amber-600 bg-amber-50 border-amber-200" },
  dispatched: { label: "Dispatched",                     color: "text-purple-600 bg-purple-50 border-purple-200" },
  delivered:  { label: "Delivered",                      color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  returned:   { label: "Returned",                       color: "text-rose-600 bg-rose-50 border-rose-200" },
  floating:   { label: "Being re-routed",                color: "text-orange-600 bg-orange-50 border-orange-200" },
  cancelled:  { label: "Cancelled",                      color: "text-gray-500 bg-gray-50 border-gray-200" },
};

// Next action each status allows
const NEXT_ACTION: Partial<Record<AssignmentStatus, { status: AssignmentStatus; label: string; requiresCourier: boolean }>> = {
  accepted:   { status: "processing",  label: "Mark as Preparing",  requiresCourier: false },
  processing: { status: "dispatched",  label: "Mark as Dispatched", requiresCourier: true  },
  dispatched: { status: "delivered",   label: "Mark as Delivered",  requiresCourier: false },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Component ─────────────────────────────────────────────────────────────

export default function SellerOrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  // Courier fields
  const [useOwnCourier, setUseOwnCourier] = useState(false);
  const [courier, setCourier]             = useState("");
  const [awb, setAwb]                     = useState("");
  const [trackingUrl, setTrackingUrl]     = useState("");
  const [notes, setNotes]                 = useState("");

  // Schedule dispatch
  const [schedDate,   setSchedDate]   = useState("");
  const [schedSaving, setSchedSaving] = useState(false);

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    try {
      const data = await sellerApi.get<Assignment>(`/seller/orders/${id}`);
      setAssignment(data);
      setUseOwnCourier(data.useOwnCourier);
      setCourier(data.courier ?? "");
      setAwb(data.awb ?? "");
      setTrackingUrl(data.trackingUrl ?? "");
      setNotes(data.notes ?? "");
    } catch {
      setError("Order not found.");
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    setSaving(true); setError("");
    try {
      const updated = await sellerApi.patch<Assignment>(`/seller/orders/${id}/accept`, {});
      setAssignment(updated);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to accept");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule() {
    if (!schedDate) return;
    setSchedSaving(true); setError("");
    try {
      const updated = await sellerApi.patch<Assignment>(`/seller/orders/${id}/schedule`, {
        scheduledDispatchAt: new Date(schedDate).toISOString(),
      });
      setAssignment(updated);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Failed to save schedule");
    } finally {
      setSchedSaving(false);
    }
  }

  async function advanceStatus(status: AssignmentStatus, requiresCourier: boolean) {
    if (requiresCourier && !awb.trim()) {
      setError("Please enter the AWB / tracking number before marking as dispatched.");
      return;
    }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { status };
      if (useOwnCourier !== undefined) body.useOwnCourier = useOwnCourier;
      if (courier.trim()) body.courier = courier.trim();
      if (awb.trim())     body.awb     = awb.trim();
      if (trackingUrl.trim()) body.trackingUrl = trackingUrl.trim();
      if (notes.trim())   body.notes   = notes.trim();

      const updated = await sellerApi.patch<Assignment>(`/seller/orders/${id}/status`, body);
      setAssignment(updated);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <XCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-muted-foreground">{error || "Order not found"}</p>
        <button onClick={() => router.back()} className="text-sm text-primary">Go back</button>
      </div>
    );
  }

  const { orderItem: oi, status, seller: sellerInfo } = assignment;
  const order   = oi.order;
  const addr    = order.shippingAddress;
  const meta    = STATUS_META[status];
  const next    = NEXT_ACTION[status];
  const imgUrl  = oi.product.images?.[0]?.url;
  const price   = assignment.sellerProduct?.price ?? oi.unitPrice;

  const isActive   = ["pending", "accepted", "processing", "dispatched"].includes(status);
  const isPending  = status === "pending";
  const needsShip  = status === "accepted" || status === "processing";

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm">{order.orderNumber}</h1>
          <p className="text-xs text-muted-foreground">{fmt(order.placedAt)}</p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${meta.color}`}>
          {meta.label}
        </span>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto pb-10">

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        {/* Deadline banner */}
        {isActive && (
          <DeadlineBanner deadline={assignment.deadlineAt} />
        )}

        {/* Product card */}
        <div className="bg-white rounded-xl border p-4 flex gap-3 items-start">
          {imgUrl ? (
            <img src={imgUrl} alt={oi.product.title} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 bg-muted rounded-lg flex-shrink-0 flex items-center justify-center">
              <Package className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{oi.product.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Qty: {oi.qty} &middot; ₹{Number(price).toLocaleString("en-IN")} each
            </p>
            {oi.variantOptions && Object.keys(oi.variantOptions).length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {Object.entries(oi.variantOptions).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </p>
            )}
            {oi.customization && (
              <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">Customer customisation</p>
                {typeof (oi.customization as Record<string, unknown>).text === "string" && (
                  <p className="text-xs text-amber-900 font-medium">"{(oi.customization as Record<string, unknown>).text as string}"</p>
                )}
                {typeof (oi.customization as Record<string, unknown>).imageUrl === "string" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(oi.customization as Record<string, unknown>).imageUrl as string} alt="customer upload" className="mt-1 max-h-24 rounded" />
                )}
                {!(oi.customization as Record<string, unknown>).text && !(oi.customization as Record<string, unknown>).imageUrl && (
                  <p className="text-xs text-amber-700">Design customisation — see dashboard for canvas details.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Shipping address */}
        <div className="bg-white rounded-xl border p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            <MapPin className="w-3.5 h-3.5" />
            Ship to
          </div>
          {addr.name && <p className="text-sm font-medium">{addr.name}</p>}
          {addr.line1 && <p className="text-sm text-muted-foreground">{addr.line1}</p>}
          {addr.line2 && <p className="text-sm text-muted-foreground">{addr.line2}</p>}
          <p className="text-sm text-muted-foreground">
            {[addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}
          </p>
          {addr.phone && <p className="text-sm text-muted-foreground">{addr.phone}</p>}
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Timeline</p>
          <TimelineRow icon={Clock}          label="Assigned"          time={assignment.assignedAt} />
          {assignment.acceptedAt           && <TimelineRow icon={CheckCircle2}   label="Accepted"          time={assignment.acceptedAt} />}
          {assignment.scheduledDispatchAt  && <TimelineRow icon={CalendarClock}  label="Dispatch by"       time={assignment.scheduledDispatchAt} scheduled />}
          {assignment.dispatchedAt         && <TimelineRow icon={Truck}          label="Dispatched"        time={assignment.dispatchedAt} />}
          {assignment.deliveredAt          && <TimelineRow icon={Star}           label="Delivered"         time={assignment.deliveredAt} />}
          {assignment.returnedAt           && <TimelineRow icon={AlertTriangle}  label="Returned"          time={assignment.returnedAt!} />}
        </div>

        {/* Schedule dispatch date */}
        {needsShip && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> Schedule dispatch date
            </p>
            {assignment.scheduledDispatchAt && (
              <p className="text-xs text-indigo-600 font-medium">
                Currently set: {new Date(assignment.scheduledDispatchAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="datetime-local"
                value={schedDate}
                onChange={(e) => setSchedDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={saveSchedule}
                disabled={schedSaving || !schedDate}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {schedSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              This is visible to you only — a reminder for when to dispatch this order.
            </p>
          </div>
        )}

        {/* Courier details (always shown when there's data or action needed) */}
        {(needsShip || next?.requiresCourier || assignment.awb) && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Courier details</p>

            {/* Own courier toggle */}
            {sellerInfo.chargesCourier && (
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={useOwnCourier}
                  onChange={(e) => setUseOwnCourier(e.target.checked)}
                  disabled={!needsShip}
                  className="w-4 h-4 accent-primary"
                />
                Use my own courier
              </label>
            )}

            <input
              type="text"
              placeholder="Courier name (e.g. Delhivery, BlueDart)"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              disabled={!needsShip}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-muted/50"
            />
            <input
              type="text"
              placeholder="AWB / Tracking number *"
              value={awb}
              onChange={(e) => setAwb(e.target.value)}
              disabled={!needsShip}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-muted/50"
            />
            <input
              type="url"
              placeholder="Tracking URL (optional)"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              disabled={!needsShip}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-muted/50"
            />
            <textarea
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!needsShip}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-muted/50 resize-none"
            />
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <button
            onClick={accept}
            disabled={saving}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Accept Order
          </button>
        )}

        {next && !isPending && (
          <button
            onClick={() => advanceStatus(next.status, next.requiresCourier)}
            disabled={saving}
            className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            {next.label}
          </button>
        )}

        {/* Tax invoice */}
        {(status === "delivered" || status === "returned") && (
          <a
            href={`/seller/orders/${id}/invoice`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full border border-border/60 rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <FileText className="w-4 h-4" /> Tax Invoice
          </a>
        )}

        {/* Attempt info */}
        {assignment.attemptNumber > 1 && (
          <p className="text-xs text-center text-muted-foreground">
            Routing attempt #{assignment.attemptNumber}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function DeadlineBanner({ deadline }: { deadline: string }) {
  const diff   = new Date(deadline).getTime() - Date.now();
  const hrs    = Math.floor(diff / 3_600_000);
  const urgent = hrs < 4;

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
      urgent
        ? "bg-red-50 border-red-200 text-red-700"
        : "bg-amber-50 border-amber-200 text-amber-700"
    }`}>
      <Clock className="w-4 h-4 flex-shrink-0" />
      {hrs < 0
        ? "This order is overdue — accept immediately to avoid re-routing."
        : `Accept and process within ${hrs}h or this order will be re-routed.`}
    </div>
  );
}

function TimelineRow({
  icon: Icon, label, time, scheduled,
}: { icon: typeof Clock; label: string; time: string; scheduled?: boolean }) {
  return (
    <div className={`flex items-center gap-3 text-sm ${scheduled ? "opacity-70" : ""}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${scheduled ? "text-indigo-400" : "text-muted-foreground"}`} />
      <span className={`w-24 text-xs ${scheduled ? "text-indigo-500 font-medium" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-xs ${scheduled ? "text-indigo-600 font-medium" : ""}`}>{fmt(time)}</span>
    </div>
  );
}

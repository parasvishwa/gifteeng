"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Clock, Package, Truck, Home, Copy, Check,
  MapPin, CreditCard, Calendar, Phone, ArrowLeft, MessageCircle, Pencil,
  XCircle, AlertTriangle, CalendarDays, Star, Info,
} from "lucide-react";
import { cartFetch, getB2cToken } from "@/lib/api";

type OrderItem = {
  id: string;
  productId: string;
  qty: number;
  unitPrice?: number | string;
  totalPrice?: number | string;
  priceLabel?: string;
  title?: string;
  snapshot?: {
    id?: string;
    slug?: string;
    title?: string;
    basePrice?: string | number;
    currency?: string;
    images?: { url?: string }[] | string[] | null;
  } | null;
  variantOptions?: Record<string, string> | null;
  customization?: {
    canvasJSON?: string | null;
    previewDataUrl?: string | null;
    designs?: { canvasJSON?: string | null; previewDataUrl?: string | null }[];
  } | null;
};

type Address = {
  fullName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
};

type Shipment = {
  id: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  status?: string;
};

// Statuses where design edits are still permitted
const EDITABLE_STATUSES = ["pending", "confirmed", "new_order"];

type Order = {
  id: string;
  number?: string;
  orderNumber?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;   // snake_case fallback from some API versions
  totalLabel?: string;
  subtotal?: number | string;
  discountTotal?: number | string;
  shippingTotal?: number | string;
  taxTotal?: number | string;
  grandTotal?: number | string;
  total?: number;
  currency?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: OrderItem[];
  shippingAddress?: Address;
  billingAddress?: Address;
  shipments?: Shipment[];
  metadata?: Record<string, unknown>;
};

const TIMELINE: { key: string; label: string; icon: any }[] = [
  { key: "ordered",       label: "Ordered",       icon: CheckCircle2 },
  { key: "confirmed",     label: "Confirmed",     icon: CheckCircle2 },
  { key: "in_production", label: "In Production", icon: Package },
  { key: "shipped",       label: "Shipped",       icon: Truck },
  { key: "delivered",     label: "Delivered",     icon: Home },
];

function fmt(v: number | string | undefined): string {
  if (v === undefined || v === null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return `₹${n.toFixed(2)}`;
}

function extractImage(snap: OrderItem["snapshot"]): string | null {
  if (!snap?.images || !Array.isArray(snap.images) || snap.images.length === 0) return null;
  const first: any = snap.images[0];
  if (typeof first === "string") return first;
  if (first?.url) return first.url;
  return null;
}

function AddressCard({ title, addr, icon: Icon }: { title: string; addr?: Address; icon: any }) {
  if (!addr) return null;
  const hasDetails = addr.line1 || addr.city;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="w-3.5 h-3.5" />
        </div>
        {title}
      </div>
      <div className="text-sm text-foreground/90 space-y-0.5">
        {addr.fullName && <div className="font-semibold">{addr.fullName}</div>}
        {addr.line1 && <div className="text-muted-foreground">{addr.line1}</div>}
        {addr.line2 && <div className="text-muted-foreground">{addr.line2}</div>}
        {hasDetails && (
          <div className="text-muted-foreground">
            {[addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}
          </div>
        )}
        {addr.country && <div className="text-muted-foreground">{addr.country}</div>}
        {addr.phone && (
          <div className="flex items-center gap-1 text-muted-foreground pt-1">
            <Phone className="w-3 h-3" /> {addr.phone}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrderDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cancel order state
  const [cancelOpen, setCancelOpen]     = useState(false);
  const [returnOpen, setReturnOpen]     = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnDetails, setReturnDetails] = useState("");
  const [returnItemId, setReturnItemId] = useState<string>("");
  const [returnQty, setReturnQty]       = useState<number>(1);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnErr, setReturnErr]       = useState<string | null>(null);
  const [returnDone, setReturnDone]     = useState(false);
  const [cancelReason, setCancelReason] = useState(""); // selected chip
  const [cancelNote, setCancelNote]     = useState(""); // free-text for "Other"
  const [cancelling, setCancelling]     = useState(false);
  const [cancelErr, setCancelErr]       = useState<string | null>(null);

  // Delivery date postpone state
  const [deliveryDateOpen, setDeliveryDateOpen]     = useState(false);
  const [requestedDate, setRequestedDate]           = useState("");
  const [deliveryDateSaving, setDeliveryDateSaving] = useState(false);
  const [deliveryDateErr, setDeliveryDateErr]       = useState<string | null>(null);

  // Review state
  const [reviewItem, setReviewItem]         = useState<{ productId: string; title: string } | null>(null);
  const [reviewRating, setReviewRating]     = useState(5);
  const [reviewTitle, setReviewTitle]       = useState("");
  const [reviewBody, setReviewBody]         = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewErr, setReviewErr]           = useState<string | null>(null);
  const [reviewedProducts, setReviewedProducts] = useState<Set<string>>(new Set());

  useEffect(() => {
    const token = getB2cToken();
    if (!token) {
      router.push(`/auth?next=${encodeURIComponent(`/b2c/orders/${id}`)}`);
      return;
    }
    (async () => {
      try {
        const data = await cartFetch<Order>(`/orders/b2c/mine/${id}`, { authed: true });
        setOrder(data);
      } catch {
        setNotFoundFlag(true);
      }
      setLoading(false);
    })();
  }, [id, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-muted-foreground">
        <div className="mx-auto w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-3" />
        Loading order…
      </div>
    );
  }

  if (notFoundFlag || !order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <div className="text-5xl mb-3">😕</div>
        <h1 className="text-2xl font-bold">Order not found</h1>
        <p className="text-muted-foreground text-sm mt-2">We couldn't find this order.</p>
        <Link href="/b2c/account" className="mt-6 inline-block px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-bold">
          Back to my account
        </Link>
      </div>
    );
  }

  const statusKey        = (order.status ?? "").toLowerCase();
  // Normalize "new_order" → "ordered" so it aligns with the 5-step visual timeline
  const normalizedStatus = statusKey === "new_order" ? "ordered" : statusKey;
  const currentIdx       = TIMELINE.findIndex((t) => t.key === normalizedStatus);

  const displayNumber       = order.orderNumber ?? order.number ?? order.id.slice(0, 8).toUpperCase();
  const rawDate             = order.createdAt ?? order.created_at;
  const placedDate          = rawDate ? new Date(rawDate) : null;
  const canEditDesign       = EDITABLE_STATUSES.includes(statusKey);
  const canPostponeDelivery = ["new_order", "confirmed", "in_production"].includes(statusKey);
  const isDelivered         = statusKey === "delivered";
  const existingRequestedDate = order.metadata?.requestedDeliveryDate as string | undefined;

  const STATUS_LABEL: Record<string, string> = {
    new_order:    "New Order",    confirmed:    "Confirmed",
    in_production:"In Production",ready_to_ship:"Ready to Ship",
    shipped:      "Shipped",      delivered:    "Delivered",
    cancelled:    "Cancelled",    returned:     "Returned",
  };
  const statusLabel = STATUS_LABEL[statusKey] ?? order.status?.replace(/_/g, " ") ?? "Processing";

  const STATUS_BADGE: Record<string, string> = {
    delivered:     "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    shipped:       "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400",
    in_production: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400",
    ready_to_ship: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    confirmed:     "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    new_order:     "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400",
    cancelled:     "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    returned:      "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400",
  };
  const statusBadgeClass = STATUS_BADGE[statusKey] ?? "bg-muted text-muted-foreground";

  // Min date for postpone: tomorrow, or one day after the existing request (whichever is later)
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const minPostponeDate = existingRequestedDate
    ? new Date(Math.max(new Date(existingRequestedDate).getTime() + 86_400_000, tomorrowDate.getTime()))
    : tomorrowDate;
  const minPostponeDateStr = minPostponeDate.toISOString().slice(0, 10);

  const handleCancelOrder = async () => {
    const finalReason = cancelReason === "Other" ? cancelNote.trim() : cancelReason;
    if (!finalReason) { setCancelErr("Please select a reason first."); return; }
    const token = getB2cToken();
    if (!token) return;
    setCancelling(true);
    setCancelErr(null);
    try {
      const res = await fetch(`/api/orders/b2c/mine/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: finalReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Cancellation failed");
      }
      // Refresh order data
      const updated = await cartFetch<Order>(`/orders/b2c/mine/${id}`, { authed: true });
      setOrder(updated);
      setCancelOpen(false);
      setCancelReason("");
    } catch (e) {
      setCancelErr(e instanceof Error ? e.message : "Failed to cancel order. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const handleRequestDeliveryDate = async () => {
    if (!requestedDate) { setDeliveryDateErr("Please pick a date."); return; }
    if (new Date(requestedDate) <= new Date()) { setDeliveryDateErr("Date must be in the future."); return; }
    const token = getB2cToken();
    if (!token) return;
    setDeliveryDateSaving(true);
    setDeliveryDateErr(null);
    try {
      const res = await fetch(`/api/orders/b2c/mine/${id}/request-delivery-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestedDate }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Failed to update delivery date");
      }
      const updated = await cartFetch<Order>(`/orders/b2c/mine/${id}`, { authed: true });
      setOrder(updated);
      setDeliveryDateOpen(false);
      setRequestedDate("");
    } catch (e) {
      setDeliveryDateErr(e instanceof Error ? e.message : "Failed. Please try again.");
    } finally {
      setDeliveryDateSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewItem) return;
    if (!reviewBody.trim()) { setReviewErr("Please write your review."); return; }
    const token = getB2cToken();
    if (!token) return;
    setReviewSubmitting(true);
    setReviewErr(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productId: reviewItem.productId,
          rating: reviewRating,
          title: reviewTitle.trim() || undefined,
          body: reviewBody.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Failed to submit review");
      }
      setReviewedProducts(prev => new Set([...prev, reviewItem.productId]));
      setReviewItem(null);
      setReviewRating(5);
      setReviewTitle("");
      setReviewBody("");
    } catch (e) {
      setReviewErr(e instanceof Error ? e.message : "Failed to submit. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const copyOrderNumber = () => {
    navigator.clipboard.writeText(`#${displayNumber}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Payment label
  const paymentLabel =
    order.paymentMethod === "cod"        ? "Cash on Delivery"
    : order.paymentMethod === "razorpay" ? "Online Payment"
    : order.paymentMethod === "wallet"   ? "Gifteeng Wallet"
    : order.paymentMethod ?? "—";

  // Totals
  const hasBreakdown = order.subtotal !== undefined || order.discountTotal !== undefined
    || order.shippingTotal !== undefined || order.taxTotal !== undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-20 md:pt-24 pb-28 md:pb-12 space-y-3.5">
      {/* ── Back ─────────────────────────────────────────────────────────── */}
      <Link
        href="/b2c/account"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> My Orders
      </Link>

      {/* ── 1. Header card ───────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground mb-1">Order</p>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-foreground tabular-nums tracking-tight">#{displayNumber}</h1>
              <button
                onClick={copyOrderNumber}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0"
                title="Copy"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            {placedDate && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <Calendar className="w-3 h-3 shrink-0" />
                {placedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {placedDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusBadgeClass}`}>
              {statusLabel}
            </span>
            <p className="text-2xl font-black text-primary tabular-nums mt-2 leading-none">
              {order.totalLabel ?? fmt(order.grandTotal ?? order.total)}
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Progress + Actions ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-5 md:p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-5">
          Order Progress
        </h2>

        {/* Clean stepper */}
        <div className="relative">
          <div className="absolute left-[13px] right-[13px] top-[13px] h-[2px] bg-muted rounded-full" />
          {currentIdx >= 0 && currentIdx < TIMELINE.length - 1 && (
            <div
              className="absolute left-[13px] top-[13px] h-[2px] bg-primary rounded-full transition-all duration-700"
              style={{ width: `${(currentIdx / (TIMELINE.length - 1)) * 100}%` }}
            />
          )}
          {currentIdx === TIMELINE.length - 1 && (
            <div className="absolute left-[13px] right-[13px] top-[13px] h-[2px] bg-primary rounded-full" />
          )}
          <ol className="relative flex items-start justify-between">
            {TIMELINE.map((step, i) => {
              const done    = i < (currentIdx >= 0 ? currentIdx : -1);
              const current = i === currentIdx;
              return (
                <li key={step.key} className="flex flex-col items-center flex-1">
                  <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    done    ? "bg-primary border-primary text-primary-foreground"
                    : current ? "bg-primary border-primary text-primary-foreground ring-4 ring-primary/15"
                    : "bg-card border-border text-muted-foreground"
                  }`}>
                    {done    ? <Check className="w-3 h-3" />
                    : current ? <div className="w-2 h-2 rounded-full bg-white" />
                    : <span className="text-[9px] font-black leading-none">{i + 1}</span>}
                  </div>
                  <span className={`mt-2 text-[9px] md:text-[10px] font-bold text-center leading-tight px-0.5 ${
                    current ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Action buttons */}
        <div className="mt-6 space-y-2">
          <div className={`grid gap-2 ${canEditDesign ? "grid-cols-3" : "grid-cols-2"}`}>
            <Link
              href={`/b2c/track/${order.id}`}
              className="py-3 rounded-xl text-center text-xs font-black text-white bg-[#EF3752] shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <Truck className="w-3.5 h-3.5" /> Track Order
            </Link>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Need help with my Gifteeng order #${displayNumber}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 rounded-xl text-center text-xs font-bold border border-border/60 bg-card hover:bg-muted/50 text-foreground transition-colors flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Need Help?
            </a>
            {canEditDesign && (
              <button
                onClick={() => { setCancelOpen(true); setCancelErr(null); setCancelReason(""); setCancelNote(""); }}
                className="py-3 rounded-xl text-xs font-bold border border-border/60 text-muted-foreground hover:border-red-300/70 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors flex items-center justify-center"
              >
                Cancel Order
              </button>
            )}
            {isDelivered && (
              <button
                onClick={() => setReturnOpen(true)}
                className="py-3 rounded-xl text-xs font-bold border border-border/60 text-muted-foreground hover:border-amber-300/70 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors flex items-center justify-center"
              >
                Return / Refund
              </button>
            )}
          </div>
          {canPostponeDelivery && (
            <button
              onClick={() => { setDeliveryDateOpen(true); setDeliveryDateErr(null); setRequestedDate(""); }}
              className="w-full py-2.5 rounded-xl text-[11px] font-semibold border border-dashed border-indigo-300/60 dark:border-indigo-700/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors flex items-center justify-center gap-1.5"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {existingRequestedDate
                ? `Delivery requested: ${new Date(existingRequestedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · Move later`
                : "Request a later delivery date"}
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Items ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-5 md:p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-4">
          Items · {(order.items ?? []).length}
        </h2>
        <div className="divide-y divide-border/30">
          {(order.items ?? []).map((it, idx) => {
            const title        = it.snapshot?.title ?? it.title ?? "Product";
            const slug         = it.snapshot?.slug;
            const img          = extractImage(it.snapshot);
            const unit         = typeof it.unitPrice  === "string" ? parseFloat(it.unitPrice)  : it.unitPrice;
            const total        = typeof it.totalPrice === "string" ? parseFloat(it.totalPrice) : it.totalPrice;
            const variants     = it.variantOptions
              ? Object.entries(it.variantOptions).map(([k, v]) => `${k}: ${v}`).join(" · ")
              : null;
            const isCustomised = !!it.customization;
            const editSlug     = slug ?? it.productId;
            const hasActions   = (isCustomised && canEditDesign) || isDelivered;
            const itemsLen     = order.items?.length ?? 0;
            return (
              <div key={it.id} className={`flex gap-4 ${idx > 0 ? "pt-4" : ""} ${idx < itemsLen - 1 ? "pb-4" : ""}`}>
                {/* Strict square thumbnail */}
                <div className="shrink-0 w-[72px] h-[72px] rounded-2xl overflow-hidden bg-muted/60 border border-border/30">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">🎁</div>
                  )}
                </div>
                {/* Details */}
                <div className="flex-1 min-w-0">
                  {slug ? (
                    <Link
                      href={`/b2c/products/${slug}`}
                      className="font-bold text-sm text-foreground hover:text-primary transition-colors line-clamp-2 leading-snug block"
                    >
                      {title}
                    </Link>
                  ) : (
                    <p className="font-bold text-sm text-foreground line-clamp-2 leading-snug">{title}</p>
                  )}
                  {variants && <p className="text-[11px] text-muted-foreground mt-1">{variants}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted-foreground">
                      Qty <span className="font-semibold text-foreground">{it.qty}</span>
                      {unit !== undefined && Number.isFinite(unit) && (
                        <> · ₹{unit!.toFixed(0)} each</>
                      )}
                    </p>
                    {total !== undefined && Number.isFinite(total) && (
                      <p className="text-sm font-black text-foreground tabular-nums">₹{total!.toFixed(2)}</p>
                    )}
                  </div>
                  {hasActions && (
                    <div className="flex flex-wrap items-center gap-3 mt-2.5">
                      {isCustomised && canEditDesign && (
                        <Link
                          href={`/b2c/customize/${editSlug}?editOrderId=${order.id}&editItemId=${it.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit your design
                        </Link>
                      )}
                      {isDelivered && !reviewedProducts.has(it.productId) && (
                        <button
                          onClick={() => { setReviewItem({ productId: it.productId, title }); setReviewRating(5); setReviewTitle(""); setReviewBody(""); setReviewErr(null); }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors"
                        >
                          <Star className="w-3 h-3" /> Write Review
                        </button>
                      )}
                      {isDelivered && reviewedProducts.has(it.productId) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <Check className="w-3 h-3" /> Reviewed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. Price Summary ─────────────────────────────────────────────── */}
      {hasBreakdown && (
        <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-5 md:p-6">
          <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-4">
            Price Summary
          </h2>
          <div className="space-y-3">
            {order.subtotal !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums font-medium">{fmt(order.subtotal)}</span>
              </div>
            )}
            {order.discountTotal !== undefined && parseFloat(String(order.discountTotal)) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Discount</span>
                <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400">−{fmt(order.discountTotal)}</span>
              </div>
            )}
            {order.shippingTotal !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className="tabular-nums font-medium">
                  {parseFloat(String(order.shippingTotal)) === 0
                    ? <span className="text-emerald-600 dark:text-emerald-400">Free</span>
                    : fmt(order.shippingTotal)}
                </span>
              </div>
            )}
            {order.taxTotal !== undefined && parseFloat(String(order.taxTotal)) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums font-medium">{fmt(order.taxTotal)}</span>
              </div>
            )}
            <div className="h-px bg-border/50" />
            <div className="flex justify-between items-baseline pt-0.5">
              <span className="font-black text-base text-foreground">Total</span>
              <span className="font-black text-xl text-primary tabular-nums">
                {order.totalLabel ?? fmt(order.grandTotal ?? order.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Payment ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-5 md:p-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-3">
          Payment
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-foreground">{paymentLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {(order.paymentStatus ?? "—").replace(/_/g, " ")}
            </p>
          </div>
          {order.paymentStatus === "paid" && (
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
              ✓ Paid
            </span>
          )}
          {order.paymentStatus === "pending" && (
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              Pending
            </span>
          )}
        </div>
      </div>

      {/* ── 6. Addresses ─────────────────────────────────────────────────── */}
      {(order.shippingAddress || order.billingAddress) && (
        <div className="grid gap-3 md:grid-cols-2">
          <AddressCard title="Shipping Address" addr={order.shippingAddress} icon={MapPin} />
          <AddressCard title="Billing Address"  addr={order.billingAddress}  icon={MapPin} />
        </div>
      )}

      {/* ── 7. Shipments ─────────────────────────────────────────────────── */}
      {order.shipments && order.shipments.length > 0 && (
        <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-5 md:p-6">
          <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-4 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5" /> Shipment
          </h2>
          <div className="space-y-3">
            {order.shipments.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl bg-muted/30 p-3.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{s.carrier ?? "Standard Shipping"}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                    {s.trackingNumber ?? "Tracking ID pending"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {s.status && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {s.status.replace(/_/g, " ")}
                    </span>
                  )}
                  {s.trackingUrl && (
                    <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer"
                      className="block mt-1 text-[11px] font-bold text-primary hover:underline">
                      Track →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Return / Refund Request Modal ────────────────────────────────── */}
      {returnOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          onClick={() => !submittingReturn && setReturnOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {returnDone ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <svg className="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="mb-1 text-base font-semibold">Return request submitted</h3>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll review and get back to you within 24 hours.
                </p>
                <button
                  onClick={() => { setReturnOpen(false); setReturnDone(false); }}
                  className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="mb-1 text-base font-semibold">Request a return</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Pick the item, tell us what went wrong, and we&apos;ll arrange a return + refund.
                </p>

                {(order.items?.length ?? 0) > 1 && (
                  <label className="mb-3 block">
                    <span className="text-xs font-medium">Item</span>
                    <select
                      value={returnItemId}
                      onChange={(e) => setReturnItemId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    >
                      <option value="">Whole order</option>
                      {(order.items ?? []).map((it: any) => (
                        <option key={it.id} value={it.id}>
                          {(it.snapshot?.title ?? it.title ?? "Item")} — qty {it.qty}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="mb-3 block">
                  <span className="text-xs font-medium">What went wrong?</span>
                  <select
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"
                  >
                    <option value="">Pick a reason</option>
                    <option value="defective">Item is defective</option>
                    <option value="damaged_in_transit">Damaged during delivery</option>
                    <option value="wrong_item">Received the wrong item</option>
                    <option value="size_issue">Size or fit issue</option>
                    <option value="not_as_described">Not as described / pictured</option>
                    <option value="changed_mind">Changed my mind</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="mb-3 block">
                  <span className="text-xs font-medium">Details (optional)</span>
                  <textarea
                    value={returnDetails}
                    onChange={(e) => setReturnDetails(e.target.value)}
                    rows={3}
                    placeholder="Anything that helps us process this faster"
                    className="mt-1 w-full resize-none rounded-lg border border-border bg-background p-2 text-sm"
                  />
                </label>

                {returnErr && (
                  <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                    {returnErr}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setReturnOpen(false)}
                    disabled={submittingReturn}
                    className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted/50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={submittingReturn || !returnReason}
                    onClick={async () => {
                      setReturnErr(null);
                      const token = getB2cToken();
                      if (!token) { setReturnErr("You need to be logged in."); return; }
                      setSubmittingReturn(true);
                      try {
                        const res = await fetch(`/api/orders/b2c/mine/${id}/return`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({
                            orderItemId: returnItemId || undefined,
                            qty: returnQty || 1,
                            reason: returnReason,
                            details: returnDetails.trim() || undefined,
                          }),
                        });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({})) as { message?: string };
                          throw new Error(err.message ?? "Could not submit return");
                        }
                        setReturnDone(true);
                      } catch (e) {
                        setReturnErr(e instanceof Error ? e.message : "Could not submit return.");
                      } finally {
                        setSubmittingReturn(false);
                      }
                    }}
                    className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {submittingReturn ? "Submitting…" : "Submit request"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Postpone Delivery Modal ──────────────────────────────────────── */}
      {deliveryDateOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          onClick={() => !deliveryDateSaving && setDeliveryDateOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-black text-base text-foreground">Request Later Delivery</h3>
                <p className="text-[11px] text-muted-foreground">#{displayNumber}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              You can only postpone your delivery — you cannot move it earlier than the original date.
            </p>
            {existingRequestedDate && (
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl px-3 py-2">
                Current request: {new Date(existingRequestedDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </p>
            )}
            <input
              type="date"
              min={minPostponeDateStr}
              value={requestedDate}
              onChange={(e) => { setRequestedDate(e.target.value); setDeliveryDateErr(null); }}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            />
            {deliveryDateErr && (
              <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> {deliveryDateErr}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setDeliveryDateOpen(false)}
                disabled={deliveryDateSaving}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRequestDeliveryDate()}
                disabled={deliveryDateSaving || !requestedDate}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-indigo-500 hover:bg-indigo-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deliveryDateSaving ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                ) : (
                  <><CalendarDays className="w-3.5 h-3.5" /> Confirm Date</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Write Review Modal ────────────────────────────────────────────── */}
      {reviewItem && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
          onClick={() => !reviewSubmitting && setReviewItem(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                <Star className="w-4.5 h-4.5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-black text-base text-foreground">Write a Review</h3>
                <p className="text-[11px] text-muted-foreground line-clamp-1">{reviewItem.title}</p>
              </div>
            </div>

            {/* Star rating */}
            <div className="flex items-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setReviewRating(star)}
                  className="transition-transform active:scale-90"
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= reviewRating
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 text-sm font-bold text-muted-foreground">
                {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][reviewRating]}
              </span>
            </div>

            {/* Title (optional) */}
            <input
              type="text"
              placeholder="Review title (optional)"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-400/40 mb-3"
            />

            {/* Body */}
            <textarea
              rows={4}
              placeholder="Share your experience with this product (required)…"
              value={reviewBody}
              onChange={(e) => { setReviewBody(e.target.value); setReviewErr(null); }}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none"
            />

            {reviewErr && (
              <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> {reviewErr}
              </p>
            )}

            <p className="mt-2 text-[10px] text-muted-foreground">
              Reviews are moderated and visible after approval.
            </p>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setReviewItem(null)}
                disabled={reviewSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmitReview()}
                disabled={reviewSubmitting || !reviewBody.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {reviewSubmitting ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
                ) : (
                  <><Star className="w-3.5 h-3.5" /> Submit Review</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Order Modal — retention-focused ───────────────────────── */}
      {cancelOpen && (() => {
        const firstItem = (order.items ?? [])[0];
        const img = firstItem ? extractImage(firstItem.snapshot) : null;
        const itemTitle = firstItem?.snapshot?.title ?? firstItem?.title ?? "Your order";
        const itemCount = (order.items ?? []).length;
        const isReasonValid = cancelReason.length > 0 && (cancelReason !== "Other" || cancelNote.trim().length > 0);

        return (
          <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
            onClick={() => !cancelling && setCancelOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Card */}
            <div
              className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top gradient accent */}
              <div className="h-[3px] bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

              <div className="p-6">
                {/* Header */}
                <div className="flex items-start gap-3 mb-5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-lg text-foreground leading-tight">Cancel Order?</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Help us improve your experience</p>
                  </div>
                  <button
                    onClick={() => !cancelling && setCancelOpen(false)}
                    className="p-1.5 -mr-1 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>

                {/* Product preview */}
                {firstItem && (
                  <div className="flex items-center gap-3 rounded-2xl bg-muted/40 border border-border/40 p-3 mb-5">
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-border/30 bg-muted">
                      {img
                        ? <img src={img} alt={itemTitle} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">🎁</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground line-clamp-1">{itemTitle}</p>
                      {itemCount > 1 && (
                        <p className="text-xs text-muted-foreground">
                          +{itemCount - 1} more item{itemCount > 2 ? "s" : ""}
                        </p>
                      )}
                      <p className="text-sm font-black text-primary tabular-nums mt-0.5">
                        {fmt(order.grandTotal ?? order.total)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Reason selection */}
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground mb-2.5">
                  What went wrong?
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {["Changed my mind", "Ordered by mistake", "Found better price", "Delivery too slow", "Other"].map((r) => (
                    <button
                      key={r}
                      onClick={() => { setCancelReason(r); setCancelNote(""); setCancelErr(null); }}
                      className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-all ${
                        cancelReason === r
                          ? "bg-primary text-primary-foreground border-primary shadow-sm scale-[1.04]"
                          : "border-border/60 text-foreground/70 bg-muted/30 hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {/* Free-text — only when "Other" */}
                {cancelReason === "Other" && (
                  <textarea
                    rows={3}
                    autoFocus
                    placeholder="Tell us what went wrong…"
                    value={cancelNote}
                    onChange={(e) => { setCancelNote(e.target.value); setCancelErr(null); }}
                    className="w-full rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 resize-none mb-4 transition-colors"
                  />
                )}

                {/* Retention hook */}
                <div className="rounded-2xl bg-primary/5 border border-primary/15 px-4 py-3 mb-5">
                  <p className="text-xs text-foreground/80 leading-relaxed">
                    <span className="font-bold">💡 Need help instead?</span>
                    {" "}Our team can quickly fix delivery delays, design changes, wrong addresses, and more.
                    {" "}
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Hi! I need help with my Gifteeng order #${displayNumber}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-bold hover:underline"
                    >
                      Chat with us →
                    </a>
                  </p>
                </div>

                {/* Friendly error — no raw API text */}
                {cancelErr && (
                  <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded-xl px-3.5 py-2.5 border border-orange-200/50 dark:border-orange-800/30">
                    <span className="shrink-0 text-sm">⚠️</span>
                    Something went wrong. Please try again.
                  </div>
                )}

                {/* CTAs — Keep Order is the hero button */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => !cancelling && setCancelOpen(false)}
                    disabled={cancelling}
                    className="w-full py-3.5 rounded-xl text-sm font-black text-white bg-[#EF3752] shadow-lg shadow-[#EF3752]/20 hover:shadow-[#EF3752]/35 hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ring-[3px] ring-[#EF3752]/15"
                  >
                    ✨ Keep My Order
                  </button>
                  <button
                    onClick={() => void handleCancelOrder()}
                    disabled={cancelling || !isReasonValid}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-35 flex items-center justify-center gap-1.5"
                  >
                    {cancelling ? (
                      <>
                        <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                        Cancelling order…
                      </>
                    ) : (
                      "Cancel Anyway"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

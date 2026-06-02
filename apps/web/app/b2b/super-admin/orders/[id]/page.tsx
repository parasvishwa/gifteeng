"use client";

// Admin order detail page — Shopify-grade information density.
//
// Sections (left → right):
//   • Header strip: order #, status badges (Paid / Fulfilled / Status),
//                    Refund / Print / Edit / Export action buttons.
//   • Fulfillment card: items, tracking carrier + AWB.
//   • Payment card: itemised Subtotal / Shipping / Discount / Tax / Total.
//   • Timeline: chronological event log (placed, payment captured, shipped,
//                delivered, status changes, internal comments).
//   • Internal comment box: staff-only comments posted to timeline.
//   • Right column: Customer panel (name + lifetime orders + click-to-copy
//                    email / phone), Notes panel (admin free-text), Tags,
//                    Shipping + Billing addresses.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiB2b } from "@/lib/api";
import OrderStatusSelect from "../../_components/OrderStatusSelect";

type Address = {
  name?: string;
  fullName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  pincode?: string;
  country?: string;
  phone?: string;
};

type OrderItem = {
  id: string;
  title?: string;
  image?: string | null;
  quantity?: number;
  qty?: number;
  unitPrice?: number;
  totalPrice?: number;
  lineTotal?: number;
  sku?: string;
  variantOptions?: Record<string, string> | null;
  snapshot?: { title?: string; images?: any; sku?: string } | null;
  customization?: Record<string, unknown> | null;
};

type Shipment = {
  id: string;
  carrier?: string;
  trackingNumber?: string;
  status?: string;
  shippedAt?: string;
};

type Comment = { author: string; text: string; at: string };

type Order = {
  id: string;
  orderNumber: string;
  channel?: string;
  status: string;
  placedAt?: string;
  createdAt?: string;
  confirmedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  grandTotal?: number | string;
  subtotal?: number | string;
  taxTotal?: number | string;
  shippingTotal?: number | string;
  discountTotal?: number | string;
  paymentMethod?: string;
  paymentStatus?: string;
  currency?: string;
  customer?: {
    id?: string; fullName?: string; email?: string; phone?: string;
    createdAt?: string;
  } | null;
  customerOrderCount?: number;
  customerLifetimeValue?: number;
  customerRecentOrders?: Array<{
    id: string; orderNumber: string; placedAt?: string | null;
    grandTotal: string | number; status: string;
  }>;
  duplicateOrderIds?: string[];
  conversionSummary?: {
    firstSeenAt: string | null;
    sessionsBeforeOrder: number;
    pageViewsBeforeOrder: number;
    timeFromFirstVisitMin: number | null;
    topPages: Array<{ path: string; views: number }>;
    firstReferrer: string | null;
    firstUtm: { source?: string; medium?: string; campaign?: string } | null;
    firstDevice: { platform?: string | null; deviceType?: string | null; browser?: string | null; os?: string | null } | null;
    firstLocation: { country?: string | null; region?: string | null; city?: string | null } | null;
  } | null;
  riskScore?: {
    level: "low" | "medium" | "high";
    score: number;
    factors: Array<{ icon: string; text: string; delta: number }>;
  };
  company?: { id?: string; name?: string } | null;
  items?: OrderItem[];
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  shipments?: Shipment[];
  metadata?: {
    tags?: string[];
    adminNote?: string | null;
    internalComments?: Comment[];
    requestedDeliveryDate?: string;
    shopify_id?: string;
    shopify_imported?: boolean;
  } | null;
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function money(n: number | string | undefined, currency = "INR") {
  return num(n).toLocaleString("en-IN", { style: "currency", currency });
}

function fmt(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function relTime(d?: string | null) {
  if (!d) return "—";
  const t = new Date(d).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 86400*30) return `${Math.floor(diff/86400)}d ago`;
  return fmt(d);
}

// ── Status badge helpers ─────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  new_order:     { label: "New",          cls: "bg-blue-100 text-blue-800 border-blue-200" },
  confirmed:     { label: "Confirmed",    cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  in_production: { label: "In production",cls: "bg-amber-100 text-amber-800 border-amber-200" },
  ready_to_ship: { label: "Packed",       cls: "bg-violet-100 text-violet-800 border-violet-200" },
  shipped:       { label: "Shipped",      cls: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  delivered:     { label: "Delivered",    cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelled:     { label: "Cancelled",    cls: "bg-rose-100 text-rose-800 border-rose-200" },
  returned:      { label: "Returned",     cls: "bg-gray-200 text-gray-700 border-gray-300" },
};

function StatusBadge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {b.label}
    </span>
  );
}

function PaymentBadge({ paymentStatus }: { paymentStatus?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    captured:   { label: "Paid",       cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    authorized: { label: "Authorized", cls: "bg-cyan-100 text-cyan-800 border-cyan-200" },
    pending:    { label: "Pending",    cls: "bg-amber-100 text-amber-800 border-amber-200" },
    failed:     { label: "Failed",     cls: "bg-rose-100 text-rose-800 border-rose-200" },
    refunded:   { label: "Refunded",   cls: "bg-gray-200 text-gray-700 border-gray-300" },
  };
  const key = (paymentStatus ?? "").toLowerCase();
  const b = map[key] ?? { label: paymentStatus ?? "—", cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${b.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {b.label}
    </span>
  );
}

// ── Click-to-copy ────────────────────────────────────────────────────────

function CopyText({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      title="Click to copy"
      className="text-left hover:underline"
    >
      {label ?? value}
      {copied && <span className="ml-2 text-[10px] text-emerald-600">copied</span>}
    </button>
  );
}

// ── Print File Button ────────────────────────────────────────────────────

function PrintFileButton({ orderId, itemIndex }: { orderId: string; itemIndex: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiB2b().post<{ url: string }>(
        `/api/production/render`,
        { orderId, itemIndex },
      );
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
      >
        {loading ? "Generating…" : "Generate Print File"}
      </button>
      {error && (
        <p className="mt-1 text-xs text-rose-600">Error: {error}</p>
      )}
      {result?.url && (
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt="Print preview"
            className="h-16 w-16 rounded border object-cover"
          />
          <a
            href={result.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline hover:no-underline"
          >
            Download PNG ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ── Address block ────────────────────────────────────────────────────────

function AddressBlock({ title, addr }: { title: string; addr?: Address | null }) {
  const name = addr?.name ?? addr?.fullName;
  const pin = addr?.postalCode ?? addr?.pincode;
  const mapsLink = addr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [addr.line1, addr.line2, addr.city, addr.state, pin, addr.country]
          .filter(Boolean).join(", ")
      )}`
    : null;
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {!addr ? (
        <div className="text-sm text-muted-foreground">—</div>
      ) : (
        <div className="text-xs leading-relaxed">
          {name && <div className="font-medium text-sm">{name}</div>}
          {addr.line1 && <div>{addr.line1}</div>}
          {addr.line2 && <div>{addr.line2}</div>}
          <div>{[addr.city, addr.state, pin].filter(Boolean).join(", ")}</div>
          {addr.country && <div>{addr.country}</div>}
          {addr.phone && <div className="text-muted-foreground">{addr.phone}</div>}
          {mapsLink && (
            <a href={mapsLink} target="_blank" rel="noopener noreferrer"
               className="mt-1 inline-block text-[11px] text-primary hover:underline">
              View map ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Synthesised timeline event list ──────────────────────────────────────

type TimelineEvent = {
  at: string;
  kind: "placed" | "confirmed" | "shipped" | "delivered" | "cancelled" | "payment" | "comment" | "note";
  text: string;
  author?: string;
};

function buildTimeline(o: Order): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (o.placedAt) events.push({ at: o.placedAt, kind: "placed", text: `Order placed via ${o.channel ?? "—"}` });
  if (o.paymentStatus === "captured" && o.placedAt) {
    events.push({
      at: o.placedAt,
      kind: "payment",
      text: `${money(o.grandTotal, o.currency)} paid via ${o.paymentMethod ?? "—"}`,
    });
  }
  if (o.confirmedAt) events.push({ at: o.confirmedAt, kind: "confirmed", text: "Order confirmed" });
  if (o.shippedAt) {
    const ship = o.shipments?.[0];
    const tail = ship?.trackingNumber ? ` · ${ship.carrier ?? "courier"} ${ship.trackingNumber}` : "";
    events.push({ at: o.shippedAt, kind: "shipped", text: `Order shipped${tail}` });
  }
  if (o.deliveredAt) events.push({ at: o.deliveredAt, kind: "delivered", text: "Delivered to customer" });
  if (o.cancelledAt) events.push({ at: o.cancelledAt, kind: "cancelled", text: "Order cancelled" });
  for (const c of o.metadata?.internalComments ?? []) {
    events.push({ at: c.at, kind: "comment", text: c.text, author: c.author });
  }
  return events.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function SuperAdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [comment, setComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const reload = () => {
    return apiB2b()
      .get<Order>(`/api/orders/${id}`)
      .then(o => { setOrder(o); setNoteDraft(o.metadata?.adminNote ?? ""); })
      .catch(() => setError("Failed to load order"));
  };

  useEffect(() => { if (id) reload(); /* eslint-disable-line */ }, [id]);

  const tags = useMemo(() => order?.metadata?.tags ?? [], [order]);
  const timeline = useMemo(() => order ? buildTimeline(order) : [], [order]);

  const saveMeta = async (patch: { tags?: string[]; note?: string | null }) => {
    setSavingMeta(true);
    try {
      await apiB2b().patch(`/api/orders/${id}/admin-meta`, patch);
      await reload();
    } finally {
      setSavingMeta(false);
    }
  };

  const addTag = (t: string) => {
    const cleaned = t.trim();
    if (!cleaned) return;
    if (tags.includes(cleaned)) return;
    saveMeta({ tags: [...tags, cleaned] });
    setTagDraft("");
  };
  const removeTag = (t: string) => saveMeta({ tags: tags.filter(x => x !== t) });
  const saveNote = () => saveMeta({ note: noteDraft.trim() || null });

  const postComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      await apiB2b().post(`/api/orders/${id}/comments`, { text });
      setComment("");
      await reload();
    } finally {
      setPostingComment(false);
    }
  };

  if (error)  return <div className="p-6 text-sm text-destructive">{error}</div>;
  if (!order) return <div className="p-6 text-sm text-muted-foreground">Loading order…</div>;

  const currency = order.currency ?? "INR";
  const items = order.items ?? [];
  const totals = {
    subtotal:      num(order.subtotal),
    shipping:      num(order.shippingTotal),
    discount:      num(order.discountTotal),
    tax:           num(order.taxTotal),
    grand:         num(order.grandTotal),
  };
  const isShopifyImport = !!order.metadata?.shopify_imported;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6 space-y-4">
      {/* Header strip */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <Link href="/super-admin/orders" className="text-xs text-muted-foreground hover:underline">
            ← Back to orders
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
            <PaymentBadge paymentStatus={order.paymentStatus} />
            <StatusBadge status={order.status} />
            {isShopifyImport && (
              <span className="rounded-full border bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                Shopify-imported
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Placed {fmt(order.placedAt ?? order.createdAt)}
            {order.channel && <> · {order.channel.toUpperCase()}</>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          >
            Print
          </button>
          <a
            href={`/api/orders/${order.id}/invoice.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          >
            Invoice PDF
          </a>
          <a
            href={`/api/orders/${order.id}/packing-slip.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            title="Packing slip — for the dispatch desk to put inside the parcel"
          >
            Packing slip
          </a>
          <button
            onClick={async () => {
              if (!confirm("Resend the order confirmation SMS + push to the customer?")) return;
              try {
                const res = await apiB2b().post<{ ok: boolean; sms: boolean; push: boolean; reason?: string }>(
                  `/api/orders/${order.id}/resend-confirmation`, {},
                );
                if (res.ok) {
                  alert(`Sent. ${res.sms ? "SMS ✓ " : ""}${res.push ? "Push ✓" : ""}`);
                } else {
                  alert(`Could not resend: ${res.reason ?? "unknown error"}`);
                }
              } catch (e: any) {
                alert(`Resend failed: ${e?.message ?? e}`);
              }
            }}
            className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            title="Resend order confirmation SMS + push notification"
          >
            Resend SMS
          </button>
          {(["new_order", "confirmed", "in_production", "ready_to_ship"]).includes(order.status) && (
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
              title="Edit line item quantities, remove items, or update addresses"
            >
              Edit
            </button>
          )}
          {order.status !== "cancelled" && order.status !== "delivered" && (
            <button
              onClick={async () => {
                const reason = prompt("Cancel reason (visible in audit log + customer SMS):");
                if (reason === null) return;
                const restock = confirm("Restock the items back into inventory? OK = yes, Cancel = no");
                try {
                  await apiB2b().post(`/api/orders/${order.id}/admin-cancel`, { reason, restock });
                  await reload();
                } catch (e: any) {
                  alert(`Cancel failed: ${e?.message ?? e}`);
                }
              }}
              className="rounded-md border border-destructive/40 bg-card px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5"
              title="Cancel order — choose whether to restock inventory"
            >
              Cancel
            </button>
          )}
          {(() => {
            // Show Refund button on:
            //   - any successful payment status (paid / captured / completed)
            //   - OR an order that already has partial refunds recorded but
            //     hasn't been fully refunded yet (paymentStatus stays
            //     "captured" until the cumulative refund hits the order
            //     total — see service notes about the PaymentStatus enum).
            const ps = (order.paymentStatus ?? "").toLowerCase();
            const refundsArr = ((order.metadata as any)?.refunds ?? []) as Array<{ amountInr?: number }>;
            const totalRefunded = refundsArr.reduce((s, r) => s + Number(r?.amountInr ?? 0), 0);
            const isPaid = ps === "paid" || ps === "captured" || ps === "completed";
            const fullyRefunded = ps === "refunded" || totalRefunded >= totals.grand - 0.5;
            return (isPaid || (refundsArr.length > 0 && !fullyRefunded)) && !fullyRefunded ? (
              <button
                onClick={() => setRefundOpen(true)}
                className="rounded-md border border-amber-500/40 bg-card px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50"
                title="Refund all or part of this order — back to original payment method or as Gifteeng coins"
              >
                Refund
                {totalRefunded > 0 && (
                  <span className="ml-1 text-[10px] text-amber-600">
                    (₹{totalRefunded.toFixed(0)} refunded)
                  </span>
                )}
              </button>
            ) : null;
          })()}
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(order, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `order-${order.orderNumber}.json`; a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted"
          >
            Export JSON
          </button>
          <OrderStatusSelect orderId={order.id} value={order.status} onChange={() => reload()} />
        </div>
      </div>

      {/* Duplicate-order warning — same customer + same items within ±10 min.
          Surfaces accidental double-charges from rage-click on the
          payment screen so the agent can refund the dupe before it ships. */}
      {(order.duplicateOrderIds?.length ?? 0) > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <div className="flex items-start gap-2 text-sm">
            <span className="text-base">⚠</span>
            <div className="flex-1">
              <div className="font-semibold">
                Possible duplicate — same customer placed {order.duplicateOrderIds!.length} order
                {order.duplicateOrderIds!.length === 1 ? "" : "s"} with the exact same items within ±10 minutes.
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {order.duplicateOrderIds!.map((dupId) => (
                  <Link key={dupId}
                    href={`/super-admin/orders/${dupId}`}
                    className="rounded bg-amber-200/60 px-2 py-0.5 font-mono hover:bg-amber-200">
                    {dupId.slice(0, 8)}…
                  </Link>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-amber-700">
                Likely cause: customer rage-clicked the Pay button before the success screen rendered.
                Verify with the customer and refund / cancel the duplicates before fulfilment.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Main column */}
        <div className="space-y-4 md:col-span-2">
          {/* Fulfillment / items card */}
          <div className="rounded-md border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <StatusBadge status={order.status} />
                {order.shipments?.[0]?.trackingNumber && (
                  <span className="text-xs text-muted-foreground">
                    {order.shipments[0].carrier ?? "Courier"}: <CopyText value={order.shipments[0].trackingNumber!} />
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</div>
            </div>
            <ul className="divide-y">
              {items.map((it, idx) => {
                const title = it.title ?? it.snapshot?.title ?? "—";
                const qty   = it.qty ?? it.quantity ?? 1;
                const unit  = num(it.unitPrice);
                const total = num(it.totalPrice ?? it.lineTotal ?? unit * qty);
                const variants = it.variantOptions
                  ? Object.entries(it.variantOptions).map(([k, v]) => `${k}: ${v}`).join(" · ")
                  : null;
                const hasCustomization = !!it.customization;
                return (
                  <li key={it.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-12 shrink-0 overflow-hidden rounded border bg-muted">
                        {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">{title}</div>
                        {variants && <div className="truncate text-xs text-muted-foreground">{variants}</div>}
                        {it.sku && <div className="text-xs text-muted-foreground">SKU: {it.sku}</div>}
                        {hasCustomization && (
                          <PrintFileButton orderId={order.id} itemIndex={idx} />
                        )}
                      </div>
                      <div className="text-right text-sm">
                        <div>{money(unit, currency)} × {qty}</div>
                        <div className="font-semibold">{money(total, currency)}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Payment card — itemised totals */}
          <div className="rounded-md border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <PaymentBadge paymentStatus={order.paymentStatus} />
                <span className="text-xs text-muted-foreground">via {order.paymentMethod ?? "—"}</span>
              </div>
            </div>
            <div className="space-y-1.5 px-4 py-3 text-sm">
              <Row label="Subtotal"       value={money(totals.subtotal, currency)} />
              <Row label="Shipping"       value={money(totals.shipping, currency)} muted={totals.shipping === 0} />
              {totals.discount > 0 && (
                <Row label="Discount"       value={`− ${money(totals.discount, currency)}`} accent="text-emerald-600" />
              )}
              <Row label="Tax (incl.)"    value={money(totals.tax, currency)} muted={totals.tax === 0} />
              <div className="my-1.5 border-t" />
              <Row label="Total" value={money(totals.grand, currency)} bold />
              <Row label={order.paymentStatus === "captured" ? "Paid" : "Due"}
                   value={money(totals.grand, currency)}
                   accent={order.paymentStatus === "captured" ? "text-emerald-600" : "text-rose-600"} />
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-md border bg-card">
            <div className="border-b px-4 py-2.5 text-sm font-medium">Timeline</div>
            <ol className="divide-y">
              {timeline.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">No events yet.</li>
              )}
              {timeline.map((e, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="mt-1.5 size-2 shrink-0 rounded-full bg-foreground/40" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      {e.kind === "comment" && <span className="text-xs font-semibold text-primary">{e.author}: </span>}
                      {e.text}
                    </div>
                    <div className="text-[11px] text-muted-foreground" title={fmt(e.at)}>{relTime(e.at)}</div>
                  </div>
                </li>
              ))}
            </ol>
            {/* Internal staff comment box */}
            <div className="border-t bg-muted/40 p-3">
              <div className="flex items-start gap-2">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Add an internal note (visible to staff only)…"
                  rows={2}
                  className="flex-1 resize-none rounded border bg-card p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  onClick={postComment}
                  disabled={postingComment || !comment.trim()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {postingComment ? "Posting…" : "Post"}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Only staff can see comments. They appear in the timeline above.
              </p>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Customer panel — name, contact, lifetime value, recent orders */}
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</div>
              {order.customerOrderCount != null && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {order.customerOrderCount} order{order.customerOrderCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {order.customer ? (
              <div className="space-y-1.5 text-xs">
                <Link href={`/super-admin/customers?q=${order.customer.id}`} className="block text-sm font-medium text-primary hover:underline">
                  {order.customer.fullName ?? "—"}
                </Link>
                {order.customer.email && (
                  <div><CopyText value={order.customer.email} /></div>
                )}
                {order.customer.phone && (
                  <div><CopyText value={order.customer.phone} /></div>
                )}

                {/* Lifetime value + first-time / repeat / VIP hint */}
                {(order.customerLifetimeValue ?? 0) > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1.5">
                    <div className="rounded bg-muted/60 px-2 py-1.5">
                      <div className="text-[10px] text-muted-foreground">Lifetime value</div>
                      <div className="text-xs font-semibold tabular-nums">
                        {money(order.customerLifetimeValue, currency)}
                      </div>
                    </div>
                    <div className="rounded bg-muted/60 px-2 py-1.5">
                      <div className="text-[10px] text-muted-foreground">Avg order</div>
                      <div className="text-xs font-semibold tabular-nums">
                        {money(
                          (order.customerLifetimeValue ?? 0) /
                            Math.max(1, order.customerOrderCount ?? 1),
                          currency,
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {(order.customerOrderCount ?? 0) <= 1 ? (
                  <div className="rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
                    🎉 First-time customer
                  </div>
                ) : (order.customerOrderCount ?? 0) >= 5 ? (
                  <div className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
                    ⭐ VIP — {order.customerOrderCount} orders
                  </div>
                ) : (
                  <div className="rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700">
                    🔁 Returning customer — {order.customerOrderCount} orders
                  </div>
                )}

                {/* Recent orders — 1-click drill into any of their previous orders */}
                {(order.customerRecentOrders?.length ?? 0) > 0 && (
                  <div className="mt-2 border-t pt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent orders
                    </div>
                    <div className="space-y-1">
                      {order.customerRecentOrders!.map((p) => (
                        <Link
                          key={p.id}
                          href={`/super-admin/orders/${p.id}`}
                          className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-muted text-[11px]"
                        >
                          <span className="font-mono text-muted-foreground">
                            #{p.orderNumber.replace(/^(GFT|SH)-?/i, "")}
                          </span>
                          <span className="tabular-nums">{money(p.grandTotal, currency)}</span>
                          <span className="text-[10px] text-muted-foreground capitalize">
                            {p.status.replace(/_/g, " ")}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">— no customer —</div>
            )}
          </div>

          {/* Order risk score — chargeback / fraud heuristics. Each
              factor explains WHY the score is what it is so the agent
              can make their own call instead of blindly trusting a
              number. Tuned for Indian e-commerce; will get smarter
              once we have refund-label history to train on. */}
          {order.riskScore && (
            <div className="rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Order risk</div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                  order.riskScore.level === "low"     ? "bg-emerald-100 text-emerald-800"
                  : order.riskScore.level === "medium" ? "bg-amber-100 text-amber-800"
                  : "bg-rose-100 text-rose-800"
                }`}>
                  {order.riskScore.level}
                </span>
              </div>
              {/* Visual meter */}
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${
                    order.riskScore.level === "low"     ? "bg-emerald-500"
                    : order.riskScore.level === "medium" ? "bg-amber-500"
                    : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.max(4, order.riskScore.score)}%` }}
                />
              </div>
              <div className="mb-2 text-[10px] text-muted-foreground">
                Score {order.riskScore.score}/100 based on {order.riskScore.factors.length} factor{order.riskScore.factors.length === 1 ? "" : "s"}
              </div>
              {order.riskScore.factors.length > 0 && (
                <ul className="space-y-1 text-[11px]">
                  {order.riskScore.factors.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span>{f.icon}</span>
                      <span className="flex-1">{f.text}</span>
                      <span className={`shrink-0 font-mono ${f.delta > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {f.delta > 0 ? "+" : ""}{f.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Conversion summary — pre-purchase journey from page_views.
              Marketing uses this for true channel attribution; CS uses
              it to gauge intent ("they browsed for 30 min, give them
              the benefit of the doubt"). */}
          {order.conversionSummary && order.conversionSummary.pageViewsBeforeOrder > 0 && (
            <div className="rounded-md border bg-card p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conversion summary</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded bg-muted/60 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground">Sessions</div>
                  <div className="text-xs font-semibold tabular-nums">
                    {order.conversionSummary.sessionsBeforeOrder}
                  </div>
                </div>
                <div className="rounded bg-muted/60 px-2 py-1.5">
                  <div className="text-[10px] text-muted-foreground">Page views</div>
                  <div className="text-xs font-semibold tabular-nums">
                    {order.conversionSummary.pageViewsBeforeOrder}
                  </div>
                </div>
                {order.conversionSummary.timeFromFirstVisitMin != null && (
                  <div className="col-span-2 rounded bg-muted/60 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">Time from first visit</div>
                    <div className="text-xs font-semibold">
                      {order.conversionSummary.timeFromFirstVisitMin >= 60 * 24
                        ? `${Math.round(order.conversionSummary.timeFromFirstVisitMin / (60 * 24))}d ${Math.floor((order.conversionSummary.timeFromFirstVisitMin % (60 * 24)) / 60)}h`
                        : order.conversionSummary.timeFromFirstVisitMin >= 60
                          ? `${Math.floor(order.conversionSummary.timeFromFirstVisitMin / 60)}h ${order.conversionSummary.timeFromFirstVisitMin % 60}m`
                          : `${order.conversionSummary.timeFromFirstVisitMin}m`}
                    </div>
                  </div>
                )}
              </div>

              {/* Attribution */}
              {(order.conversionSummary.firstUtm || order.conversionSummary.firstReferrer) && (
                <div className="mt-2 border-t pt-2 text-[11px]">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">First touch</div>
                  {order.conversionSummary.firstUtm?.source && (
                    <div>📣 <span className="font-medium">{order.conversionSummary.firstUtm.source}</span>
                      {order.conversionSummary.firstUtm.medium && <> / {order.conversionSummary.firstUtm.medium}</>}
                      {order.conversionSummary.firstUtm.campaign && <> · {order.conversionSummary.firstUtm.campaign}</>}
                    </div>
                  )}
                  {!order.conversionSummary.firstUtm && order.conversionSummary.firstReferrer && (
                    <div className="break-all">🔗 {order.conversionSummary.firstReferrer.replace(/^https?:\/\//, "")}</div>
                  )}
                </div>
              )}

              {/* Device + location */}
              {(order.conversionSummary.firstDevice || order.conversionSummary.firstLocation) && (
                <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                  {order.conversionSummary.firstDevice?.deviceType && (
                    <div>
                      📱 {order.conversionSummary.firstDevice.deviceType}
                      {order.conversionSummary.firstDevice.browser && <> · {order.conversionSummary.firstDevice.browser}</>}
                      {order.conversionSummary.firstDevice.os && <> · {order.conversionSummary.firstDevice.os}</>}
                    </div>
                  )}
                  {order.conversionSummary.firstLocation?.city && (
                    <div>
                      📍 {[
                        order.conversionSummary.firstLocation.city,
                        order.conversionSummary.firstLocation.region,
                        order.conversionSummary.firstLocation.country,
                      ].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
              )}

              {/* Top pages */}
              {order.conversionSummary.topPages.length > 0 && (
                <div className="mt-2 border-t pt-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top pages visited</div>
                  <ul className="space-y-0.5 text-[11px]">
                    {order.conversionSummary.topPages.map((p) => (
                      <li key={p.path} className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-muted-foreground">{p.path}</span>
                        <span className="shrink-0 tabular-nums">{p.views}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Notes panel — admin-only free-text */}
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</div>
            <textarea
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onBlur={() => {
                if ((noteDraft || "").trim() !== (order.metadata?.adminNote ?? "")) saveNote();
              }}
              rows={3}
              placeholder="e.g. Name - DR. ABIRAMI / Designation - Clinic Head"
              className="w-full resize-none rounded border bg-card p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              {savingMeta ? "Saving…" : "Auto-saves on blur. Visible to staff only."}
            </div>
          </div>

          {/* Tags */}
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.length === 0 && <div className="text-xs text-muted-foreground">No tags yet</div>}
              {tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                  {t}
                  <button onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground" title="Remove">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagDraft);
                  }
                }}
                placeholder="Add tag"
                className="flex-1 rounded border bg-card p-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button
                onClick={() => addTag(tagDraft)}
                className="rounded border px-2 text-xs hover:bg-muted"
              >
                Add
              </button>
            </div>
          </div>

          <AddressBlock title="Shipping address" addr={order.shippingAddress} />
          <AddressBlock title="Billing address" addr={order.billingAddress} />

          {/* Return / RMA workflow — visible whenever any RMA exists for
              this order, regardless of order status. Each request can
              be approved, rejected, marked received, or finalised
              (refund) inline. */}
          <ReturnsPanel orderId={order.id} currency={currency} onChange={() => reload()} />
        </div>
      </div>

      {editOpen && (
        <EditOrderModal
          order={order}
          currency={currency}
          onClose={() => setEditOpen(false)}
          onDone={() => { setEditOpen(false); reload(); }}
        />
      )}

      {refundOpen && (
        <RefundModal
          orderId={order.id}
          orderNumber={order.orderNumber}
          grandTotal={totals.grand}
          currency={currency}
          isCod={(order.paymentMethod ?? "").toLowerCase() === "cod"}
          alreadyRefunded={
            ((order.metadata as any)?.refunds ?? [])
              .reduce((s: number, r: any) => s + Number(r?.amountInr ?? 0), 0)
          }
          onClose={() => setRefundOpen(false)}
          onDone={() => { setRefundOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

/**
 * Refund modal — full or partial amount, optional Goins-instead-of-Razorpay
 * toggle. The two modes are explained inline so the agent doesn't have to
 * remember which one applies when.
 *
 * For COD orders, the asGoins toggle is forced on (there's no Razorpay
 * payment to reverse).
 */
function RefundModal(props: {
  orderId: string;
  orderNumber: string;
  grandTotal: number;
  currency: string;
  isCod: boolean;
  alreadyRefunded: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const remaining = Math.max(0, props.grandTotal - props.alreadyRefunded);
  const [amountStr, setAmountStr] = useState(String(remaining.toFixed(2)));
  const [reason, setReason] = useState("");
  const [asGoins, setAsGoins] = useState(props.isCod);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const amountInr = Number(amountStr);
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      setError("Enter a valid refund amount."); return;
    }
    if (amountInr > remaining + 0.5) {
      setError(`Cannot refund more than the remaining ₹${remaining.toFixed(2)}.`); return;
    }
    if (!reason.trim()) {
      setError("Reason is required — visible in audit log + customer notification."); return;
    }
    setSubmitting(true);
    try {
      await apiB2b().post(`/api/orders/${props.orderId}/refund`, {
        amountInr, reason: reason.trim(), asGoins,
      });
      props.onDone();
    } catch (e: any) {
      const msg = e?.body?.message ?? e?.message ?? String(e);
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.onClose}>
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Refund {props.orderNumber}</h2>
          <button onClick={props.onClose} className="text-muted-foreground hover:text-foreground">×</button>
        </div>

        <div className="mb-3 rounded bg-muted/60 p-2.5 text-xs">
          <div className="flex justify-between"><span>Order total</span><span className="tabular-nums">{props.grandTotal.toLocaleString("en-IN", { style: "currency", currency: props.currency })}</span></div>
          {props.alreadyRefunded > 0 && (
            <div className="flex justify-between text-amber-700"><span>Already refunded</span><span className="tabular-nums">−{props.alreadyRefunded.toLocaleString("en-IN", { style: "currency", currency: props.currency })}</span></div>
          )}
          <div className="mt-1 flex justify-between border-t border-border/60 pt-1 font-semibold"><span>Refundable</span><span className="tabular-nums">{remaining.toLocaleString("en-IN", { style: "currency", currency: props.currency })}</span></div>
        </div>

        <label className="mb-2 block">
          <span className="text-xs font-medium">Amount (₹)</span>
          <input
            type="number"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            min={0}
            max={remaining}
            step="0.01"
            className="mt-1 w-full rounded border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <span className="text-[10px] text-muted-foreground">
            <button type="button" className="text-primary hover:underline" onClick={() => setAmountStr(String(remaining.toFixed(2)))}>
              Refund full ₹{remaining.toFixed(2)}
            </button>
            {" · "}
            <button type="button" className="text-primary hover:underline" onClick={() => setAmountStr(String((remaining * 0.5).toFixed(2)))}>
              50%
            </button>
          </span>
        </label>

        <label className="mb-3 block">
          <span className="text-xs font-medium">Reason <span className="text-rose-600">*</span></span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Customer received damaged item — replacement out of stock"
            className="mt-1 w-full resize-none rounded border bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </label>

        <label className="mb-3 flex items-start gap-2 rounded border bg-muted/40 p-2.5 text-xs">
          <input
            type="checkbox"
            checked={asGoins}
            disabled={props.isCod}
            onChange={(e) => setAsGoins(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Refund as Gifteeng coins</span>
            {props.isCod && <span className="ml-1 text-amber-700">(required for COD orders)</span>}
            <span className="block text-[10px] text-muted-foreground">
              {asGoins
                ? "1 ₹ = 1 coin. Credited to customer's wallet immediately. No bank reversal."
                : "Refunds back to the original payment method via Razorpay (5-7 working days)."}
            </span>
          </span>
        </label>

        {error && (
          <div className="mb-3 rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={props.onClose} disabled={submitting} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button onClick={submit} disabled={submitting} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
            {submitting ? "Processing…" : asGoins ? "Credit coins" : "Refund to original method"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label, value, muted, bold, accent,
}: {
  label: string; value: string; muted?: boolean; bold?: boolean; accent?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={`${muted ? "text-muted-foreground" : ""} ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${accent ?? ""}`}>{value}</span>
    </div>
  );
}

// ─── Returns / RMA panel ─────────────────────────────────────────────────
// Inline workflow for all RMAs against this order. Each card is one
// ReturnRequest row; the action buttons advance its state machine
// (pending → approved → received → refunded, or pending → rejected /
// cancelled). The "Refund" button delegates to the order's existing
// /api/admin/returns/:id/refund endpoint which in turn calls
// OrdersService.refundOrder so the refund record lands in
// order.metadata.refunds[] (single source of truth) and the customer
// gets their push notification automatically.

type ReturnRow = {
  id: string;
  orderId: string;
  orderItemId: string | null;
  qty: number;
  reason: string;
  details: string | null;
  photos: string[];
  status: "pending" | "approved" | "rejected" | "received" | "refunded" | "cancelled";
  rejectReason: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  receivedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
};

function ReturnsPanel({
  orderId, currency, onChange,
}: { orderId: string; currency: string; onChange: () => void }) {
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    try {
      const r = await apiB2b().get<ReturnRow[]>(`/api/admin/returns/by-order/${orderId}`);
      setRows(r);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [orderId]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try { await fn(); await reload(); onChange(); }
    catch (e: any) { alert(e?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  if (!rows || rows.length === 0) return null;

  const STATUS_BADGE: Record<ReturnRow["status"], string> = {
    pending:   "bg-amber-100 text-amber-800",
    approved:  "bg-emerald-100 text-emerald-800",
    rejected:  "bg-rose-100 text-rose-800",
    received:  "bg-blue-100 text-blue-800",
    refunded:  "bg-violet-100 text-violet-800",
    cancelled: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Return requests ({rows.length})
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded border bg-background p-2.5 text-xs">
            <div className="mb-1.5 flex items-center justify-between">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_BADGE[r.status]}`}>
                {r.status}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="space-y-0.5">
              <div><span className="text-muted-foreground">Reason:</span> {r.reason.replace(/_/g, " ")}</div>
              <div><span className="text-muted-foreground">Qty:</span> {r.qty}{r.orderItemId ? " (line item)" : " (whole order)"}</div>
              {r.details && <div className="text-muted-foreground">&ldquo;{r.details}&rdquo;</div>}
              {r.rejectReason && (
                <div className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700">
                  Rejected: {r.rejectReason}
                </div>
              )}
              {r.trackingNumber && (
                <div className="text-muted-foreground">Return AWB: {r.carrier ?? "courier"} {r.trackingNumber}</div>
              )}
            </div>

            {/* Actions per state */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.status === "pending" && (
                <>
                  <button
                    disabled={busy === r.id}
                    onClick={() => act(r.id, async () => {
                      await apiB2b().post(`/api/admin/returns/${r.id}/approve`, {});
                    })}
                    className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy === r.id}
                    onClick={() => {
                      const reason = prompt("Reason for rejecting (visible to customer):");
                      if (!reason) return;
                      act(r.id, async () => {
                        await apiB2b().post(`/api/admin/returns/${r.id}/reject`, { reason });
                      });
                    }}
                    className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800 hover:bg-rose-100"
                  >
                    Reject
                  </button>
                </>
              )}
              {r.status === "approved" && (
                <button
                  disabled={busy === r.id}
                  onClick={() => {
                    const carrier = prompt("Return courier (optional):") ?? "";
                    const trackingNumber = prompt("Return tracking number (optional):") ?? "";
                    act(r.id, async () => {
                      await apiB2b().post(`/api/admin/returns/${r.id}/mark-received`, { carrier, trackingNumber });
                    });
                  }}
                  className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100"
                >
                  Mark received
                </button>
              )}
              {(r.status === "approved" || r.status === "received") && (
                <button
                  disabled={busy === r.id}
                  onClick={() => {
                    const amtStr = prompt("Refund amount (₹) — leave blank for default:");
                    if (amtStr === null) return;
                    const amountInr = amtStr.trim() ? Number(amtStr) : undefined;
                    if (amtStr.trim() && (!Number.isFinite(amountInr) || (amountInr ?? 0) <= 0)) {
                      alert("Invalid amount."); return;
                    }
                    const asGoins = confirm("Refund as Gifteeng coins instead of original payment method?\nOK = Goins, Cancel = Razorpay");
                    act(r.id, async () => {
                      await apiB2b().post(`/api/admin/returns/${r.id}/refund`, { amountInr, asGoins });
                    });
                  }}
                  className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                >
                  Refund
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Edit-order modal ────────────────────────────────────────────────────
// Per-line qty stepper with remove, plus shipping + billing address
// editors. Server validates against editable status and atomically
// restocks inventory + recomputes totals. We just collect the edits
// and POST them; everything else lives in OrdersService.editOrder.
//
// MVP scope (Phase C-2):
//   - line qty change (or remove)
//   - shipping address
//   - billing address
//
// Out of scope: variant swap, add new item — Phase C-3.

function EditOrderModal(props: {
  order: Order;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const initialQty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of props.order.items ?? []) {
      m[it.id] = it.qty ?? it.quantity ?? 0;
    }
    return m;
  }, [props.order]);
  const [qtyMap, setQtyMap]   = useState<Record<string, number>>(initialQty);
  const [removed, setRemoved] = useState<Record<string, boolean>>({});
  const [ship, setShip]       = useState<Address>(props.order.shippingAddress ?? {});
  const [bill, setBill]       = useState<Address>(props.order.billingAddress ?? {});
  const [notify, setNotify]   = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const items = props.order.items ?? [];

  const oldSubtotal  = num(props.order.subtotal);
  const oldGrand     = num(props.order.grandTotal);
  const oldShipping  = num(props.order.shippingTotal);
  const oldDiscount  = num(props.order.discountTotal);
  const oldTax       = num(props.order.taxTotal);
  const taxRate      = oldSubtotal > 0 ? oldTax / oldSubtotal : 0;
  const newSubtotal  = items.reduce((s, it) => {
    if (removed[it.id]) return s;
    const q = qtyMap[it.id] ?? 0;
    return s + (it.unitPrice ?? 0) * q;
  }, 0);
  const newTax       = +(newSubtotal * taxRate).toFixed(2);
  const newGrand     = Math.max(0, newSubtotal - oldDiscount + oldShipping + newTax);
  const diff         = newGrand - oldGrand;

  const itemsChanged =
    items.some((it) => removed[it.id] || (qtyMap[it.id] !== (it.qty ?? it.quantity ?? 0)));
  const addrChanged =
    JSON.stringify(ship) !== JSON.stringify(props.order.shippingAddress ?? {}) ||
    JSON.stringify(bill) !== JSON.stringify(props.order.billingAddress  ?? {});
  const dirty = itemsChanged || addrChanged;

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const itemEdits = items
        .filter((it) => removed[it.id] || qtyMap[it.id] !== (it.qty ?? it.quantity ?? 0))
        .map((it) => ({
          id: it.id,
          qty: removed[it.id] ? 0 : qtyMap[it.id]!,
          remove: !!removed[it.id],
        }));
      const body: any = { notifyCustomer: notify };
      if (itemEdits.length > 0) body.items = itemEdits;
      if (JSON.stringify(ship) !== JSON.stringify(props.order.shippingAddress ?? {})) {
        body.shippingAddress = ship;
      }
      if (JSON.stringify(bill) !== JSON.stringify(props.order.billingAddress ?? {})) {
        body.billingAddress = bill;
      }
      await apiB2b().post(`/api/orders/${props.order.id}/edit`, body);
      props.onDone();
    } catch (e: any) {
      const msg = e?.body?.message ?? e?.message ?? String(e);
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-card p-5 shadow-xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Edit {props.order.orderNumber}</h2>
          <button onClick={props.onClose} className="text-muted-foreground hover:text-foreground">×</button>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Line items
          </div>
          <div className="space-y-2">
            {items.map((it) => {
              const isRemoved = !!removed[it.id];
              const q = qtyMap[it.id] ?? 0;
              return (
                <div key={it.id}
                     className={`rounded border p-2.5 ${isRemoved ? "bg-rose-50 opacity-70" : "bg-background"}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">
                        {(it.snapshot?.title ?? it.title ?? "Item")}
                      </div>
                      {it.variantOptions && Object.keys(it.variantOptions).length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          {Object.entries(it.variantOptions).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        {money(it.unitPrice ?? 0, props.currency)} × {q} = {money((it.unitPrice ?? 0) * q, props.currency)}
                      </div>
                    </div>
                    {!isRemoved && (
                      <div className="inline-flex items-center rounded-full border bg-muted/50">
                        <button
                          type="button"
                          disabled={q <= 0}
                          onClick={() => setQtyMap((m) => ({ ...m, [it.id]: Math.max(0, (m[it.id] ?? 0) - 1) }))}
                          className="h-8 w-8 disabled:opacity-30"
                        >−</button>
                        <span className="w-8 text-center text-sm tabular-nums">{q}</span>
                        <button
                          type="button"
                          onClick={() => setQtyMap((m) => ({ ...m, [it.id]: (m[it.id] ?? 0) + 1 }))}
                          className="h-8 w-8"
                        >+</button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setRemoved((m) => ({ ...m, [it.id]: !m[it.id] }))}
                      className={`shrink-0 rounded px-2 py-1 text-xs ${isRemoved ? "bg-amber-100 text-amber-800" : "border border-rose-200 text-rose-700 hover:bg-rose-50"}`}
                    >
                      {isRemoved ? "Undo" : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-4 rounded border bg-muted/40 p-2.5 text-xs">
          <div className="flex justify-between"><span>Old total</span><span className="tabular-nums">{money(oldGrand, props.currency)}</span></div>
          <div className="flex justify-between font-semibold"><span>New total</span><span className="tabular-nums">{money(newGrand, props.currency)}</span></div>
          <div className={`flex justify-between text-[11px] ${diff > 0 ? "text-rose-700" : diff < 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
            <span>Δ</span><span className="tabular-nums">{diff > 0 ? "+" : ""}{money(diff, props.currency)}</span>
          </div>
          {diff !== 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              {diff < 0
                ? `Grand total drops by ${money(Math.abs(diff), props.currency)}. Use the Refund flow to return the difference if the customer has already paid.`
                : `Grand total goes up by ${money(diff, props.currency)}. You'll need to request a top-up from the customer manually — this edit does not auto-charge.`}
            </div>
          )}
        </div>

        <details className="mb-3 rounded border bg-background p-2">
          <summary className="cursor-pointer text-xs font-semibold">Shipping address</summary>
          <AddressForm value={ship} onChange={setShip} />
        </details>

        <details className="mb-3 rounded border bg-background p-2">
          <summary className="cursor-pointer text-xs font-semibold">Billing address</summary>
          <AddressForm value={bill} onChange={setBill} />
        </details>

        <label className="mb-3 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify customer of the changes
        </label>

        {error && (
          <div className="mb-3 rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={props.onClose} disabled={saving} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !dirty}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressForm({ value, onChange }: { value: Address; onChange: (v: Address) => void }) {
  const f = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [k]: e.target.value });
  };
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <input className="rounded border bg-background p-1.5 col-span-2" placeholder="Full name"     value={value.fullName ?? value.name ?? ""} onChange={f("fullName")} />
      <input className="rounded border bg-background p-1.5 col-span-2" placeholder="Address line 1" value={value.line1 ?? ""} onChange={f("line1")} />
      <input className="rounded border bg-background p-1.5 col-span-2" placeholder="Address line 2" value={value.line2 ?? ""} onChange={f("line2")} />
      <input className="rounded border bg-background p-1.5"            placeholder="City"           value={value.city ?? ""}    onChange={f("city")} />
      <input className="rounded border bg-background p-1.5"            placeholder="State"          value={value.state ?? ""}   onChange={f("state")} />
      <input className="rounded border bg-background p-1.5"            placeholder="Pincode"        value={value.postalCode ?? value.pincode ?? ""} onChange={f("postalCode")} />
      <input className="rounded border bg-background p-1.5"            placeholder="Country"        value={value.country ?? ""} onChange={f("country")} />
      <input className="rounded border bg-background p-1.5 col-span-2" placeholder="Phone"          value={value.phone ?? ""}   onChange={f("phone")} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiB2b } from "@/lib/api";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface OrderItem {
  id?: string;
  name?: string;
  variant?: string;
  quantity?: number;
  price?: number;
}

interface Address {
  name?: string;
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
}

interface Shipment {
  awb?: string;
  courier?: string;
  status?: string;
  trackingUrl?: string;
}

interface OrderDetail {
  id: string;
  orderNumber?: string;
  status: string;
  grandTotal?: number;
  placedAt?: string;
  paymentMethod?: string;
  allocationId?: string;
  allocationTitle?: string;
  allocationAmountUsed?: number;
  items?: OrderItem[];
  shippingAddress?: Address;
  shipment?: Shipment;
}

interface AllocationBalance {
  remaining?: number;
  title?: string;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function orderId(id: string) {
  return `#ORD-${id.slice(0, 8).toUpperCase()}`;
}

function paymentLabel(method?: string) {
  if (!method) return "—";
  if (method === "wallet") return "Company wallet";
  if (method === "allocation") return "Campaign allocation";
  if (method === "invoice") return "Invoice (HR approval)";
  return method;
}

/* ─── Animated checkmark SVG ─────────────────────────────────────────────── */

function AnimatedCheck() {
  const circleRef = useRef<SVGCircleElement>(null);
  const checkRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    // Trigger animation after mount so it always replays on navigation
    const circle = circleRef.current;
    const check = checkRef.current;
    if (circle) circle.style.strokeDashoffset = "0";
    if (check) check.style.strokeDashoffset = "0";
  }, []);

  return (
    <svg
      viewBox="0 0 80 80"
      width={80}
      height={80}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        ref={circleRef}
        cx="40"
        cy="40"
        r="36"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        className="text-primary"
        style={{
          strokeDasharray: 226,
          strokeDashoffset: 226,
          transition: "stroke-dashoffset 0.55s cubic-bezier(0.4,0,0.2,1)",
        }}
      />
      <polyline
        ref={checkRef}
        points="24,42 35,53 57,29"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
        style={{
          strokeDasharray: 50,
          strokeDashoffset: 50,
          transition:
            "stroke-dashoffset 0.35s cubic-bezier(0.4,0,0.2,1) 0.45s",
        }}
      />
    </svg>
  );
}

/* ─── Skeleton loader ────────────────────────────────────────────────────── */

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      aria-hidden="true"
    />
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-20 w-20 rounded-full" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-5 w-32 ml-auto" />
      </div>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  );
}

/* ─── "What happens next" step list ─────────────────────────────────────── */

const STEPS = [
  {
    icon: "✓",
    label: "Order confirmed",
    detail: "We've received your order.",
    done: true,
  },
  {
    icon: "⟳",
    label: "Being prepared",
    detail: "Your gift will be packed within 1–2 business days.",
    done: false,
  },
  {
    icon: "📦",
    label: "Delivered to you",
    detail: "Expected in 5–7 business days.",
    done: false,
  },
];

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function EmployeeOrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [allocation, setAllocation] = useState<AllocationBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Fetch order
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      try {
        const api = apiB2b();
        const raw = await api.get<any>(`/api/orders/${id}`);
        if (!cancelled && raw) {
          // Normalise API shape → OrderDetail shape
          const addr = raw.shippingAddress ?? {};
          const normalised: OrderDetail = {
            id: raw.id,
            orderNumber: raw.orderNumber,
            status: raw.status,
            grandTotal: raw.grandTotal != null ? Number(raw.grandTotal) : undefined,
            placedAt: raw.placedAt,
            paymentMethod: raw.paymentMethod,
            // campaignAllocationId is the Prisma field name
            allocationId: raw.campaignAllocationId ?? raw.allocationId,
            items: (Array.isArray(raw.items) ? raw.items : []).map((it: any) => ({
              id: it.id,
              name: it.snapshot?.title ?? it.name,
              variant: it.variantOptions ? JSON.stringify(it.variantOptions) : undefined,
              quantity: it.qty ?? it.quantity ?? 1,
              price: it.unitPrice != null ? Number(it.unitPrice) : (it.price != null ? Number(it.price) : undefined),
            })),
            shippingAddress: {
              // Support both schema names (fullName/name, pincode/postalCode)
              name: addr.name ?? addr.fullName,
              line1: addr.line1,
              city: addr.city,
              state: addr.state,
              postalCode: addr.postalCode ?? addr.pincode,
              phone: addr.phone,
            },
            // shipments is an array; take the first one
            shipment: Array.isArray(raw.shipments) && raw.shipments[0]
              ? {
                  awb: raw.shipments[0].trackingNumber ?? raw.shipments[0].awb,
                  courier: raw.shipments[0].carrier ?? raw.shipments[0].courier,
                  status: raw.shipments[0].status,
                  trackingUrl: raw.shipments[0].trackingUrl,
                }
              : undefined,
          };
          setOrder(normalised);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const status =
            err && typeof err === "object" && "status" in err
              ? (err as { status: number }).status
              : 0;
          if (status === 404) setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Allocation remaining balance: no dedicated endpoint — fallback text is shown instead.
  // (allocation state stays null; the card shows "Check with your HR admin")

  /* Render states */

  if (loading) return <PageSkeleton />;

  const shortId = orderId(id);
  // allocationId stored only when order was paid via campaign allocation
  const isAllocation = !!order?.allocationId;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      {/* ── Success header ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AnimatedCheck />

        <h1 className="text-3xl font-bold tracking-tight">Order Placed!</h1>
        <p className="text-base text-muted-foreground">
          Your gift is on its way 🎁
        </p>
        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-mono font-medium text-primary">
          {shortId}
        </span>

        {order?.placedAt && (
          <p className="text-xs text-muted-foreground">
            Placed on{" "}
            {new Date(order.placedAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>

      {/* ── Order summary card ─────────────────────────────────────────── */}
      {(order || notFound) && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Order summary</h2>

          {order?.items && order.items.length > 0 ? (
            <ul className="divide-y">
              {order.items.map((item, idx) => (
                <li
                  key={item.id ?? idx}
                  className="flex items-start justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">
                      {item.name ?? "Item"}
                    </div>
                    {item.variant && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {item.variant}
                      </div>
                    )}
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Qty {item.quantity ?? 1}
                    </div>
                  </div>
                  <div className="shrink-0 tabular-nums text-sm font-medium">
                    {item.price != null
                      ? fmt(item.price * (item.quantity ?? 1))
                      : "—"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Items will appear once the order is confirmed in our system.
            </p>
          )}

          {/* Grand total */}
          {order?.grandTotal != null && (
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="text-sm font-semibold">Grand total</span>
              <span className="text-base font-bold text-primary">
                {fmt(order.grandTotal)}
              </span>
            </div>
          )}
        </section>
      )}

      {/* ── Delivery & payment details ────────────────────────────────── */}
      {order && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Delivery address */}
          {order.shippingAddress && (
            <section className="rounded-lg border bg-card p-4 text-sm">
              <div className="mb-2 flex items-center gap-1.5 font-semibold">
                {/* MapPin icon (inline SVG) */}
                <svg
                  viewBox="0 0 24 24"
                  width={14}
                  height={14}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Delivery address
              </div>
              <div className="space-y-0.5 text-muted-foreground">
                {order.shippingAddress.name && (
                  <div className="font-medium text-foreground">
                    {order.shippingAddress.name}
                  </div>
                )}
                {order.shippingAddress.line1 && (
                  <div>{order.shippingAddress.line1}</div>
                )}
                {(order.shippingAddress.city ||
                  order.shippingAddress.state) && (
                  <div>
                    {[
                      order.shippingAddress.city,
                      order.shippingAddress.state,
                      order.shippingAddress.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                )}
                {order.shippingAddress.phone && (
                  <div>{order.shippingAddress.phone}</div>
                )}
              </div>
            </section>
          )}

          {/* Payment & estimated delivery */}
          <section className="rounded-lg border bg-card p-4 text-sm">
            <div className="mb-2 flex items-center gap-1.5 font-semibold">
              {/* CreditCard icon */}
              <svg
                viewBox="0 0 24 24"
                width={14}
                height={14}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              Payment
            </div>
            <p className="text-muted-foreground">
              {paymentLabel(order.paymentMethod)}
            </p>

            <div className="mt-3 flex items-center gap-1.5 font-semibold">
              {/* Clock icon */}
              <svg
                viewBox="0 0 24 24"
                width={14}
                height={14}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Estimated delivery
            </div>
            <p className="text-muted-foreground">+5–7 business days</p>
          </section>
        </div>
      )}

      {/* ── Allocation balance card ───────────────────────────────────── */}
      {order && (order.allocationId || isAllocation) && (
        <section className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-primary">
            Campaign budget usage
          </h2>

          {order.allocationAmountUsed != null && (
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Budget used</span>
              <span className="font-medium">
                {fmt(order.allocationAmountUsed)}
              </span>
            </div>
          )}

          {order.allocationTitle && (
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Campaign</span>
              <span className="font-medium">{order.allocationTitle}</span>
            </div>
          )}

          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Remaining balance</span>
            <span className="font-medium">
              {allocation?.remaining != null
                ? fmt(allocation.remaining)
                : "Check with your HR admin"}
            </span>
          </div>
        </section>
      )}

      {/* ── Action buttons ────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/employee/store"
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {/* Home icon */}
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Back to Store
        </Link>

        <Link
          href="/employee/orders"
          className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
        >
          {/* Package icon */}
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          View All Orders
        </Link>

        {order?.shipment?.trackingUrl && (
          <a
            href={order.shipment.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            {/* ArrowRight icon */}
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
            Track Order
            {order.shipment.awb && (
              <span className="font-mono text-xs opacity-70">
                ({order.shipment.awb})
              </span>
            )}
          </a>
        )}
      </div>

      {/* ── What happens next ─────────────────────────────────────────── */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 text-sm font-semibold">What happens next</h2>
        <ol className="relative space-y-0">
          {STEPS.map((step, idx) => (
            <li key={idx} className="flex gap-4 pb-6 last:pb-0">
              {/* Connector line + dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-base ${
                    step.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30 bg-background text-muted-foreground"
                  }`}
                >
                  {step.icon}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className="mt-1 w-px flex-1 bg-border" />
                )}
              </div>

              {/* Text */}
              <div className="pt-1">
                <div
                  className={`text-sm font-medium ${step.done ? "text-primary" : "text-foreground"}`}
                >
                  {step.label}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {step.detail}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

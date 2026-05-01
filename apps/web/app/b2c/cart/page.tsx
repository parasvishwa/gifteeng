"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShoppingCart, Lock, Truck, RotateCcw, Sparkles, Gift, Check } from "lucide-react";
import { useCartStore } from "@/lib/stores/cart";
import CartWinnings from "../_components/games/CartWinnings";
import FreeGiftBanner from "./FreeGiftBanner";
import { cartFetch, getB2cToken } from "@/lib/api";

type CartSummary = {
  subtotal: number;
  discountInr: number;
  shippingInr: number;
  giftWrapInr: number;
  totalInr: number;
  breakdown: { kind: string; label: string; amount: number }[];
};

function parsePrice(label: string): number {
  const n = parseFloat(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a human-readable title, replacing raw UUIDs or empty strings. */
function resolveTitle(item: ReturnType<typeof useCartStore.getState>["items"][0]): string {
  if (!item.title || UUID_RE.test(item.title)) {
    return item.customization ? "Custom Design" : "Gift Product";
  }
  return item.title;
}

// ─── Cart Item Card with slide-out animation ──────────────────────────────────
function CartItemCard({
  item,
  cartIdx,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  item: ReturnType<typeof useCartStore.getState>["items"][0];
  cartIdx: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const [qtyBounce, setQtyBounce] = useState<"inc" | "dec" | null>(null);
  const customization = item.customization as
    | { previewDataUrl?: string; designs?: { canvasJSON?: string | null; previewDataUrl?: string | null }[] }
    | null
    | undefined;
  const preview = customization?.previewDataUrl || null;
  const designCount = customization?.designs?.length ?? (customization ? 1 : 0);

  const handleRemove = () => {
    setRemoving(true);
    setTimeout(() => onRemove(), 320);
  };

  const handleIncrease = () => {
    setQtyBounce("inc");
    setTimeout(() => setQtyBounce(null), 280);
    onIncrease();
  };

  const handleDecrease = () => {
    setQtyBounce("dec");
    setTimeout(() => setQtyBounce(null), 280);
    onDecrease();
  };

  return (
    <div
      style={{
        maxHeight: removing ? "0px" : "200px",
        opacity: removing ? 0 : 1,
        overflow: "hidden",
        transition: "max-height 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease",
        marginBottom: removing ? "0px" : undefined,
      }}
    >
      <div className="flex items-start gap-3 rounded-2xl bg-card border border-border/50 p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 mb-4">
        {/* Thumbnail */}
        <div className="relative h-[72px] w-[72px] flex-shrink-0 rounded-2xl bg-muted overflow-hidden">
          {preview ? (
            <Image src={preview} alt={item.title} fill className="object-cover" />
          ) : item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <svg className="h-8 w-8 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          )}
          {preview && (
            <div className="absolute bottom-1 right-1 bg-green-500 text-white rounded-full p-0.5">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{resolveTitle(item)}</p>
          {item.variantOptions && Object.keys(item.variantOptions).length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {Object.entries(item.variantOptions)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
          )}
          <p className="text-sm font-bold text-foreground mt-1">{item.priceLabel}</p>
          {customization && (
            <Link
              href={`/b2c/customize/${item.slug ?? item.productId}?cartIdx=${cartIdx}`}
              className="text-xs text-primary/70 underline mt-0.5 inline-block"
            >
              {designCount > 1 ? `Edit ${designCount} designs` : "Edit design"}
            </Link>
          )}
        </div>

        <div className="flex flex-col items-end gap-2.5 shrink-0">
          {/* Qty controls with bounce animation */}
          <div className="inline-flex items-center rounded-full border border-border/80 bg-muted/60">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-xl leading-none hover:bg-primary/10 transition-colors active:scale-90"
              style={{
                transform: qtyBounce === "dec" ? "scale(0.82)" : "scale(1)",
                transition: "transform 0.15s cubic-bezier(0.34,1.56,0.64,1)",
              }}
              onClick={handleDecrease}
              aria-label="Decrease"
            >
              −
            </button>
            <span
              className="min-w-[2.25rem] text-center text-sm font-semibold tabular-nums"
              style={{
                transform: qtyBounce ? "scale(1.2)" : "scale(1)",
                transition: "transform 0.18s cubic-bezier(0.34,1.56,0.64,1)",
                display: "inline-block",
              }}
            >
              {item.quantity}
            </span>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-xl leading-none hover:bg-primary/10 transition-colors active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                transform: qtyBounce === "inc" ? "scale(0.82)" : "scale(1)",
                transition: "transform 0.15s cubic-bezier(0.34,1.56,0.64,1)",
              }}
              onClick={handleIncrease}
              disabled={!!customization}
              title={customization ? "Change qty via Edit design" : undefined}
              aria-label="Increase"
            >
              +
            </button>
          </div>
          <button
            onClick={handleRemove}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors hover:underline"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sticky sidebar with scroll shadow ───────────────────────────────────────
function OrderSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <aside
      ref={sidebarRef}
      className="h-fit rounded-2xl bg-card border border-border/50 p-6 shadow-sm lg:sticky space-y-4"
      style={{
        top: "96px",
      }}
    >
      {children}
    </aside>
  );
}

// ─── Main Cart Page ───────────────────────────────────────────────────────────
export default function CartPage() {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const removeItemAt = useCartStore((s) => s.removeItemAt);
  const clear = useCartStore((s) => s.clear);
  const ensureSession = useCartStore((s) => s.ensureSession);

  useEffect(() => {
    ensureSession();
  }, [ensureSession]);

  const subtotal = useMemo(
    () => items.reduce((a, i) => a + parsePrice(i.priceLabel) * i.quantity, 0),
    [items],
  );

  // ── Reward-applied discount (live recompute when cart changes or rewards toggle) ──
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const recomputeSummary = useCallback(async () => {
    const token = getB2cToken();
    if (!token || subtotal === 0) {
      setSummary(null);
      return;
    }
    try {
      const s = await cartFetch<CartSummary>("/rewards/compute", {
        method: "POST",
        body: JSON.stringify({ subtotal, shipping: 0, giftWrap: 0 }),
        authed: true,
      });
      setSummary(s);
    } catch {
      setSummary(null);
    }
  }, [subtotal]);

  useEffect(() => {
    void recomputeSummary();
  }, [recomputeSummary]);

  const discount = summary?.discountInr ?? 0;
  const total = Math.max(0, subtotal - discount);

  // ── Empty state with animated emoji ───────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-24 pb-24 text-center">
        <div
          className="mx-auto mb-6 h-28 w-28 rounded-full flex items-center justify-center"
          style={{
            background: "hsl(var(--primary) / 0.08)",
            animation: "empty-bounce 2s ease-in-out infinite",
          }}
        >
          <ShoppingCart className="h-14 w-14 text-primary/60" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold font-display">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">
          Looks like you haven&rsquo;t added anything yet.
        </p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Explore our curated collection — find the perfect gift for every occasion!
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/b2c/products"
            className="inline-flex items-center gap-2 rounded-xl bg-[#EF3752] px-7 py-3.5 text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
          >
            Browse Products <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/b2c/products" className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted/60 active:scale-95 transition-all">
            View Collections
          </Link>
        </div>
        <style>{`
          @keyframes empty-bounce {
            0%, 100% { transform: translateY(0) rotate(-3deg); }
            40%       { transform: translateY(-16px) rotate(3deg); }
            70%       { transform: translateY(-8px) rotate(-2deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-16 md:pt-20 pb-24 md:pb-12">
      <div className="flex items-center justify-between mb-8">
        <h1
          className="text-3xl font-bold font-display"
          style={{ animation: "fade-in 0.4s ease-out both" }}
        >
          Your Cart
          <span className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {items.reduce((a, i) => a + i.quantity, 0)}
          </span>
        </h1>
        <button
          className="text-sm text-muted-foreground hover:text-destructive transition-colors"
          onClick={clear}
        >
          Clear all
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* ── Left: Items + Add-ons ── */}
        <div className="space-y-6">
          {/* Free-gift banner — shows unlock progress or "Claim" CTA */}
          <FreeGiftBanner subtotal={subtotal} />

          {/* Your Winnings panel */}
          <CartWinnings subtotalInr={subtotal} onChange={recomputeSummary} />

          {/* Items */}
          <div>
            {items.map((it, idx) => (
              <CartItemCard
                key={it.id ?? `${it.productId}-${idx}-${JSON.stringify(it.variantOptions ?? {})}`}
                item={it}
                cartIdx={idx}
                onIncrease={() => void addItem({ ...it, quantity: 1 })}
                onDecrease={() => {
                  if (it.quantity <= 1) void removeItemAt(idx);
                  else void addItem({ ...it, quantity: -1 });
                }}
                onRemove={() => void removeItemAt(idx)}
              />
            ))}
          </div>

          {/* Gift Wrap, Thank-You Card & Gifteeng Coins moved to checkout */}
          <div className="rounded-md border border-border/40 bg-muted/20 p-4 flex items-center gap-3 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
            <span>
              Gift wrap, thank-you card and Gifteeng coins can be added at
              checkout.
            </span>
          </div>
        </div>

        {/* ── Right: Order Summary (sticky with scroll shadow) ── */}
        <OrderSidebar>
          <h2 className="text-lg font-bold">Order Summary</h2>

          <div className="space-y-3.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Subtotal ({items.reduce((a, i) => a + i.quantity, 0)} items)
              </span>
              <span className="font-medium">₹{subtotal.toFixed(2)}</span>
            </div>

            {/* Rewards discount breakdown */}
            {summary && summary.breakdown.length > 0 && (
              <>
                {summary.breakdown.map((b, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center text-xs"
                    style={{ animation: "cart-rw-in 0.4s ease-out both" }}
                  >
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <Gift className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      {b.label}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      −₹{Math.abs(b.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className="text-muted-foreground text-xs">Calculated at checkout</span>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Gift wrap / thank-you / coins</span>
              <span>At checkout</span>
            </div>

            <div className="border-t border-border pt-3 flex justify-between text-base font-bold">
              <span>Total</span>
              <span className="text-foreground">
                {discount > 0 && (
                  <span className="mr-2 text-xs font-medium text-muted-foreground line-through">
                    ₹{subtotal.toFixed(2)}
                  </span>
                )}
                ₹{total.toFixed(2)}
              </span>
            </div>

            {discount > 0 && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 text-right font-semibold flex items-center justify-end gap-1">
                <Sparkles className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                You saved ₹{discount.toFixed(2)} from games
              </p>
            )}
          </div>

          {/* Checkout CTA */}
          <Link
            href="/checkout"
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-[#EF3752] shadow-sm hover:-translate-y-0.5 transition-all active:scale-95"
          >
            Proceed to Checkout
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/b2c/products"
            className="block w-full rounded-xl bg-muted border border-border py-3 text-center text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
          >
            Continue Shopping
          </Link>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {([
              { Icon: Lock, label: "Secure payment" },
              { Icon: Truck, label: "Fast delivery" },
              { Icon: RotateCcw, label: "Easy returns" },
            ] as const).map(({ Icon, label }) => (
              <div key={label} className="text-center flex flex-col items-center gap-1">
                <Icon className="h-5 w-5 text-muted-foreground/70" strokeWidth={1.5} />
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </OrderSidebar>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cart-rw-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

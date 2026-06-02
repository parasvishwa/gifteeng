"use client";

/**
 * FreeGiftBanner — Deploy 122.
 *
 * Surfaces admin-configured free-gift rules to the cart page:
 *   - "Add ₹X to unlock a FREE GIFT" when below threshold
 *   - "🎁 Free gift unlocked — Add [product]!" when threshold crossed
 *   - "🎁 Free gift in cart" when already added
 *
 * Backed by GET /api/cart/free-gift-state. Refetches whenever the cart
 * subtotal changes so it stays in sync with the cart UI.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Sparkles, Loader2, Check } from "lucide-react";
import { cartFetch } from "@/lib/api";
import { useCartStore } from "@/lib/stores/cart";

interface GiftOption {
  productId: string;
  product: {
    id: string;
    slug: string;
    title: string;
    basePrice: number;
    images?: unknown;
  };
  minCartInr: number;
  shippingInr: number;
  maxPerOrder: number;
  remainingInr: number;
  alreadyInCart: number;
  unlocked: boolean;
  status: "in_cart" | "unlocked" | "locked";
}

interface FreeGiftState {
  subtotalWithoutGifts: number;
  eligibleGifts: GiftOption[];
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const first = images[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && "url" in first) {
    return (first as { url?: string }).url ?? null;
  }
  return null;
}

export default function FreeGiftBanner({ subtotal }: { subtotal: number }) {
  const [state, setState] = useState<FreeGiftState | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);

  const refresh = useCallback(async () => {
    try {
      const s = await cartFetch<FreeGiftState>("/cart/free-gift-state");
      setState(s);
    } catch { /* silent — banner hides */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh, subtotal]);

  if (!state || state.eligibleGifts.length === 0) return null;

  // The admin may configure multiple free gifts with different thresholds.
  // Pick the one most actionable — in-cart > unlocked > closest-to-unlock.
  const lead = state.eligibleGifts[0];
  if (!lead) return null;

  const addToCart = async (g: GiftOption) => {
    setAdding(g.productId);
    try {
      await addItem({
        productId: g.product.id,
        slug: g.product.slug,
        title: g.product.title,
        // Price label is what the line displays; server will override to
        // shippingInr at checkout based on product.metadata.freeGift.
        priceLabel: `₹${g.shippingInr}`,
        quantity: 1,
        image: firstImage(g.product.images) ?? undefined,
      });
      await refresh();
    } finally {
      setAdding(null);
    }
  };

  // ── Render variants ────────────────────────────────────────────────────
  // Compact, brand-consistent; uses existing pink/amber palette.

  if (lead.status === "in_cart") {
    return (
      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/8 p-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
            🎁 Free gift added — pay only ₹{lead.shippingInr} shipping
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {lead.product.title}
          </div>
        </div>
      </div>
    );
  }

  if (lead.status === "unlocked") {
    const img = firstImage(lead.product.images);
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="w-12 h-12 rounded-md object-cover shrink-0 border border-amber-500/30" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-amber-500/20">
            <Gift className="w-5 h-5 text-amber-600" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Free gift unlocked!
          </div>
          <div className="text-sm font-bold truncate">{lead.product.title}</div>
          <div className="text-[11px] text-muted-foreground">
            Yours for just <span className="font-bold text-pink-600">₹{lead.shippingInr}</span> shipping
            <span className="text-muted-foreground/50 line-through ml-1.5">₹{lead.product.basePrice.toFixed(0)}</span>
          </div>
        </div>
        <button
          onClick={() => addToCart(lead)}
          disabled={adding === lead.productId}
          className="shrink-0 rounded-xl bg-brand hover:bg-brand-dark text-white text-xs font-bold px-4 py-2 transition-colors disabled:opacity-60"
        >
          {adding === lead.productId
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : "Claim"}
        </button>
      </div>
    );
  }

  // Locked — show progress bar
  const progress = lead.minCartInr > 0
    ? Math.min(100, Math.round((state.subtotalWithoutGifts / lead.minCartInr) * 100))
    : 0;
  return (
    <div className="rounded-md border border-pink-500/30 bg-brand/5 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500/10">
          <Gift className="w-4 h-4 text-pink-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            Add <span className="text-pink-600">₹{lead.remainingInr}</span> more to unlock a FREE GIFT
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {lead.product.title} · normally ₹{lead.product.basePrice.toFixed(0)} · yours for ₹{lead.shippingInr} shipping
          </div>
        </div>
        <Link
          href="/products"
          className="shrink-0 text-[11px] font-bold text-pink-600 hover:underline"
        >
          Shop more →
        </Link>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart, Check } from "lucide-react";
import { cartFetch } from "@/lib/api";

type FbtProduct = {
  id: string;
  slug: string;
  title: string;
  basePrice?: string | number | null;
  mrp?: string | number | null;
  discountPct?: number | null;
  images?: { url: string; alt?: string }[] | null;
};

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

function resolveImageUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url}`;
}

function formatPrice(val: string | number | undefined | null): string {
  if (val == null) return "";
  const n = parseFloat(String(val));
  if (!Number.isFinite(n)) return "";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type Props = {
  /** The current (main) product on this PDP. */
  mainProduct: {
    id: string;
    slug: string;
    title: string;
    basePrice?: string | number | null;
  };
  fbtProducts: FbtProduct[];
};

export default function FrequentlyBoughtTogether({ mainProduct, fbtProducts }: Props) {
  // Pre-check all FBT products (the main product is implicitly included)
  const [checked, setChecked] = useState<Set<string>>(() => new Set(fbtProducts.map((p) => p.id)));
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!fbtProducts || fbtProducts.length === 0) return null;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDone(false);
    setError(null);
  }

  const allProducts = fbtProducts;
  const selected = allProducts.filter((p) => checked.has(p.id));
  const selectedCount = selected.length;

  // Total includes the main product price
  const mainPrice = parseFloat(String(mainProduct.basePrice ?? 0)) || 0;
  const fbtTotal = selected.reduce((sum, p) => sum + (parseFloat(String(p.basePrice ?? 0)) || 0), 0);
  const total = mainPrice + fbtTotal;

  async function handleAddAll() {
    if (selectedCount === 0) return;
    setAdding(true);
    setError(null);
    setDone(false);
    try {
      // Add each selected FBT product to cart (main product is managed by the PDP's own CTA)
      await Promise.all(
        selected.map((p) =>
          cartFetch("/api/cart/items", {
            method: "POST",
            body: JSON.stringify({ productId: p.id, qty: 1 }),
            authed: true,
          }),
        ),
      );
      setDone(true);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Failed to add items";
      setError(msg);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="mt-10 rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-black text-foreground mb-4">Frequently Bought Together</h2>

      <div className="flex flex-wrap gap-4 items-start">
        {/* Main product — always included, shown dimly */}
        <div className="flex items-start gap-3 w-full opacity-60">
          <span className="mt-1 h-4 w-4 rounded border-2 border-primary bg-primary/20 flex items-center justify-center shrink-0">
            <Check className="w-2.5 h-2.5 text-primary" />
          </span>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-md border bg-muted shrink-0 overflow-hidden text-[10px] text-muted-foreground flex items-center justify-center">
              This item
            </div>
            <div>
              <p className="text-sm font-semibold line-clamp-2 max-w-[200px]">{mainProduct.title}</p>
              <p className="text-xs text-muted-foreground">{formatPrice(mainProduct.basePrice)}</p>
            </div>
          </div>
        </div>

        {allProducts.map((p) => {
          const img = p.images?.[0]?.url ? resolveImageUrl(p.images[0].url) : null;
          const isChecked = checked.has(p.id);
          return (
            <div key={p.id} className="flex items-start gap-3 w-full">
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={`mt-1 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                  isChecked ? "border-primary bg-primary" : "border-border bg-background"
                }`}
                aria-label={isChecked ? `Deselect ${p.title}` : `Select ${p.title}`}
              >
                {isChecked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </button>
              <div className={`flex items-center gap-3 transition-opacity ${isChecked ? "" : "opacity-40"}`}>
                {img ? (
                  <img
                    src={img}
                    alt={p.images![0]!.alt ?? p.title}
                    className="w-12 h-12 rounded-md border bg-muted object-cover shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md border bg-muted shrink-0" />
                )}
                <div>
                  <Link href={`/products/${p.slug}`} className="text-sm font-semibold line-clamp-2 max-w-[200px] hover:underline">
                    {p.title}
                  </Link>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    {p.basePrice && (
                      <span className="text-xs font-bold">{formatPrice(p.basePrice)}</span>
                    )}
                    {p.mrp && p.mrp !== p.basePrice && (
                      <span className="text-[10px] text-muted-foreground line-through">{formatPrice(p.mrp)}</span>
                    )}
                    {p.discountPct != null && p.discountPct > 0 && (
                      <span className="text-[10px] font-black text-rose-500">{p.discountPct}% OFF</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total + CTA */}
      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4">
        <div>
          <p className="text-xs text-muted-foreground">
            {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected (+ this item)
          </p>
          {total > 0 && (
            <p className="text-lg font-black text-foreground">
              Total: {formatPrice(total)}
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={adding || selectedCount === 0 || done}
          onClick={handleAddAll}
          className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity ml-auto"
        >
          {done ? (
            <>
              <Check className="w-4 h-4" />
              Added to cart
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4" />
              {adding
                ? "Adding…"
                : `Add ${selectedCount} item${selectedCount !== 1 ? "s" : ""} to cart`}
            </>
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}

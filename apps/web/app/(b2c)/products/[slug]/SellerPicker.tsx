"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SellerPicker — marketplace "Sold by" block on the product detail page.
//
// When more than one approved seller offers a product, the buyer picks who
// to buy from. Sellers are ranked nearest-first (pincode proximity) then by
// rating, matching the order-routing preference. Renders nothing for plain
// house-catalogue products (no seller offers).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Store, Star, MapPin, Truck, CheckCircle2, Loader2, ExternalLink } from "lucide-react";

export interface SellerOffer {
  sellerProductId: string;
  price: number;
  stock: number;
  inStock: boolean;
  productRating: { avg: number; count: number };
  isRecommended: boolean;
  chargesCourier: boolean;
  proximity: number;
  seller: {
    id: string;
    brandName: string;
    slug: string | null;
    city: string | null;
    state: string | null;
    rating: { avg: number; count: number };
  };
}

const PINCODE_KEY = "gifteeng.deliverPincode";

function Rating({ avg, count, label }: { avg: number; count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
      <Star className={`h-3 w-3 ${count > 0 ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      {count > 0 ? <><span className="font-bold text-foreground">{avg.toFixed(1)}</span> {label}</> : `New ${label}`}
    </span>
  );
}

export function SellerPicker({
  productSlug,
  currency = "₹",
  onSelect,
}: {
  productSlug: string;
  currency?: string;
  onSelect: (offer: SellerOffer | null) => void;
}) {
  const [offers, setOffers] = useState<SellerOffer[] | null>(null);
  const [pincode, setPincode] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Prefill the pincode from a previous "deliver to" entry.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PINCODE_KEY);
      if (saved) setPincode(saved);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async (pin: string) => {
    setLoading(true);
    try {
      const qs = pin.length === 6 ? `?pincode=${pin}` : "";
      const res = await fetch(`/api/marketplace/products/${encodeURIComponent(productSlug)}/sellers${qs}`);
      const data: SellerOffer[] = res.ok ? await res.json() : [];
      setOffers(Array.isArray(data) ? data : []);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, [productSlug]);

  useEffect(() => { load(pincode); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default selection: the recommended (top-ranked, in-stock) offer.
  useEffect(() => {
    if (!offers || offers.length === 0) { onSelect(null); return; }
    const preferred = offers.find((o) => o.inStock) ?? offers[0];
    setChosenId(preferred.sellerProductId);
    onSelect(preferred);
  }, [offers]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo(
    () => offers?.find((o) => o.sellerProductId === chosenId) ?? null,
    [offers, chosenId],
  );

  const pick = (o: SellerOffer) => {
    setChosenId(o.sellerProductId);
    onSelect(o);
  };

  const applyPincode = () => {
    if (pincode.length === 6) {
      try { localStorage.setItem(PINCODE_KEY, pincode); } catch { /* ignore */ }
      load(pincode);
    }
  };

  // Plain house product (no marketplace sellers) — render nothing.
  if (loading && offers === null) return null;
  if (!offers || offers.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-foreground">
          <Store className="h-3.5 w-3.5 text-primary" />
          {offers.length === 1 ? "Sold by" : `Choose your seller (${offers.length})`}
        </p>
        {chosen && (
          <span className="text-sm font-black tabular-nums text-foreground">
            {currency}{chosen.price.toLocaleString("en-IN")}
          </span>
        )}
      </div>

      {offers.length > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-lg border border-border bg-background px-2.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && applyPincode()}
              inputMode="numeric"
              placeholder="Delivery pincode — find your nearest seller"
              className="flex-1 bg-transparent py-2 px-2 text-xs outline-none"
            />
          </div>
          <button
            type="button"
            onClick={applyPincode}
            disabled={pincode.length !== 6 || loading}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {offers.map((o) => {
          const active = o.sellerProductId === chosenId;
          return (
            <button
              key={o.sellerProductId}
              type="button"
              onClick={() => pick(o)}
              disabled={!o.inStock}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              } ${!o.inStock ? "opacity-55" : ""}`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}
              >
                {active && <CheckCircle2 className="h-4 w-4 text-white" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {o.seller.slug ? (
                    <Link
                      href={`/store/${o.seller.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate text-sm font-bold hover:text-primary hover:underline underline-offset-2 transition-colors"
                    >
                      {o.seller.brandName}
                      <ExternalLink className="ml-1 inline-block h-2.5 w-2.5 opacity-50" />
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-bold">{o.seller.brandName}</span>
                  )}
                  {o.isRecommended && offers.length > 1 && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Rating avg={o.seller.rating.avg} count={o.seller.rating.count} label="seller" />
                  <Rating avg={o.productRating.avg} count={o.productRating.count} label="product" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  {o.seller.city && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      {o.seller.city}
                      {o.proximity >= 3 && <span className="font-bold text-emerald-600"> · nearby</span>}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Truck className="h-2.5 w-2.5" />
                    {o.chargesCourier ? "Delivery charged at checkout" : "Free delivery"}
                  </span>
                  {!o.inStock && <span className="font-bold text-destructive">Out of stock</span>}
                </div>
              </div>
              <span className="shrink-0 text-sm font-black tabular-nums">
                {currency}{o.price.toLocaleString("en-IN")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

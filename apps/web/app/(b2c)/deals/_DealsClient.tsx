"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { normaliseMediaUrl } from "@/lib/media";

type DealProduct = {
  id: string;
  slug: string;
  title: string;
  basePrice?: string | number;
  mrp?: string | number | null;
  discountPct?: number | null;
  currency?: string;
  images?: { url: string; alt?: string }[] | null;
};

type DealListResponse = {
  items: DealProduct[];
  total: number;
  page: number;
  pageSize: number;
};

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

function formatPrice(val: string | number | undefined, currency = "INR"): string {
  if (val == null) return "";
  const n = parseFloat(String(val));
  if (!Number.isFinite(n)) return "";
  const sym = currency === "INR" ? "₹" : currency;
  return `${sym}${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function resolveImageUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url}`;
}

function DealProductCard({ product }: { product: DealProduct }) {
  const image = product.images?.[0]?.url
    ? resolveImageUrl(product.images[0].url)
    : "/placeholder-product.png";
  const price = formatPrice(product.basePrice, product.currency);
  const mrp = formatPrice(product.mrp ?? undefined, product.currency);
  const pct = product.discountPct;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group relative rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Discount badge */}
      {pct != null && pct > 0 && (
        <div className="absolute top-2 left-2 z-10 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white shadow">
          {pct}% OFF
        </div>
      )}
      {/* Product image */}
      <div className="aspect-square w-full overflow-hidden bg-muted">
        <img
          src={image}
          alt={product.images?.[0]?.alt ?? product.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium text-foreground leading-snug">
          {product.title}
        </p>
        <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
          {price && (
            <span className="text-base font-black text-foreground">{price}</span>
          )}
          {mrp && mrp !== price && (
            <span className="text-xs text-muted-foreground line-through">{mrp}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function DealsClient() {
  const [products, setProducts] = useState<DealProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/products?deals=true&pageSize=48&sort=popular`, {
      cache: "no-store",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DealListResponse>;
      })
      .then((data) => {
        setProducts(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => setError(err.message ?? "Failed to load deals"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-16">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-6 h-6 text-rose-500" />
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
            Deals of the Day
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Products at 60% off or more
          {total > 0 && ` · ${total} deal${total === 1 ? "" : "s"} available`}
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-muted animate-pulse aspect-[3/4]" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Flame className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-bold text-foreground">No deals right now</p>
          <p className="text-sm text-muted-foreground mt-1">
            Check back soon — new deals are added daily.
          </p>
          <Link
            href="/products"
            className="mt-6 rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Browse all products
          </Link>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => (
            <DealProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

// Post-purchase upsell — "People also love…" rail on the order-success page.
// Consumes /api/orders/:id/recommendations (auth-scoped to the buyer; backend
// unions the order's item categories and returns freshest in-stock products).
//
// Mirrors the mobile post-purchase rail — same endpoint, same card design.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";

interface Product {
  id: string;
  slug: string;
  title: string;
  basePrice?: number | string;
  images?: Array<{ url?: string } | string> | null;
}

function apiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}
function firstImage(imgs: Product["images"]): string | null {
  if (!imgs || imgs.length === 0) return null;
  const f = imgs[0];
  if (typeof f === "string") return f;
  return f?.url ?? null;
}

export default function PostPurchaseUpsell({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        // Caller should be authenticated (order-success lands post-checkout).
        // Token is in localStorage for b2c — attach if present.
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (typeof window !== "undefined") {
          const t = localStorage.getItem("gifteeng.b2c.token");
          if (t) (headers as any)["Authorization"] = `Bearer ${t}`;
        }
        const r = await fetch(
          `${apiBase()}/api/orders/${orderId}/recommendations?limit=8`,
          { cache: "no-store", headers },
        );
        if (!r.ok) { setLoading(false); return; }
        const data = await r.json();
        const list: Product[] = Array.isArray(data) ? data : (data.items ?? []);
        if (alive) setItems(list);
      } catch { /* swallow — section hides */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [orderId]);

  if (loading) {
    return (
      <section className="px-4 md:px-8 mt-10">
        <div className="h-6 w-48 rounded bg-muted/40 animate-pulse mb-3" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shrink-0 w-36 h-52 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className="px-4 md:px-8 mt-10">
      <h2 className="text-base md:text-lg font-black tracking-tight flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
        People also love
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.slug}`}
            className="shrink-0 w-36 rounded-lg bg-card border border-border/40 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="aspect-square bg-muted/30 overflow-hidden">
              {firstImage(p.images) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firstImage(p.images)!} alt={p.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl opacity-40">🎁</div>
              )}
            </div>
            <div className="p-2.5">
              <p className="text-xs font-bold line-clamp-2 leading-tight">{p.title}</p>
              {p.basePrice != null && (
                <p className="text-xs font-black text-primary mt-1">₹{p.basePrice}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

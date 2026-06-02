"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { getViewHistory } from "@/lib/viewHistory";
import { getB2cToken } from "@/lib/api";

export interface RecItem {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  basePrice: number;
  image: string | null;
  isCustomizable: boolean;
  soldCount?: number | null;
}

/**
 * Client half of "Picked For You".
 *
 * Receives `initialItems` from the server component (SSR-rendered anonymous
 * trending fallback). After hydration, re-fetches with personalisation signals
 * (view history from localStorage + B2C auth token) and swaps in the results.
 * If neither signal exists the initial items are kept as-is — no extra
 * round-trip.
 */
export default function PickedForYouClient({ initialItems }: { initialItems: RecItem[] }) {
  const [items, setItems]   = useState<RecItem[]>(initialItems);
  const [loaded, setLoaded] = useState(initialItems.length > 0);
  const scrollRef           = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  // Tracks the timestamp until which auto-scroll should be suppressed after
  // a manual swipe/scroll so the carousel doesn't fight the user on mobile.
  const manualPauseUntilRef = useRef<number>(0);

  // ── Auto-slide: advance one card every 3.5 s, loop at end ──────────────────
  useEffect(() => {
    if (paused || !loaded || items.length < 2) return;
    const id = setInterval(() => {
      if (Date.now() < manualPauseUntilRef.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const first  = el.firstElementChild as HTMLElement | null;
      const step   = (first?.offsetWidth ?? 200) + 12;
      const atEnd  = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: atEnd ? 0 : el.scrollLeft + step, behavior: "smooth" });
    }, 3500);
    return () => clearInterval(id);
  }, [paused, loaded, items.length]);

  // ── Personalisation re-fetch on mount ──────────────────────────────────────
  useEffect(() => {
    const viewed = getViewHistory().slice(0, 8);
    const token  = getB2cToken();
    const hasPersonalisationSignal = viewed.length > 0 || !!token;

    // If there are no personalisation signals AND we already have SSR items,
    // skip the network round-trip entirely.
    if (!hasPersonalisationSignal && initialItems.length > 0) return;

    const params = new URLSearchParams({ limit: "12" });
    if (viewed.length) params.set("viewed", viewed.join(","));

    fetch(`/api/recommendations?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache:   "no-store",
    })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: RecItem[] }) => {
        const fresh = Array.isArray(data.items) ? data.items : [];
        if (fresh.length > 0) setItems(fresh);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loaded && items.length === 0) return null;

  return (
    <section className="py-6 md:py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-4">
          <h2 className="font-display font-black text-lg md:text-xl tracking-tight">Picked For You</h2>
          <p className="text-[11px] text-muted-foreground/60 font-medium mt-0.5">Hand-curated based on your taste</p>
        </div>

        <div
          ref={scrollRef}
          onScroll={() => { manualPauseUntilRef.current = Date.now() + 5000; }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          className="-mx-4 px-4 pr-4 overflow-x-auto scrollbar-hide flex gap-3 md:gap-4 scroll-smooth [&>*:last-child]:mr-4"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {!loaded
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="min-w-[42%] max-w-[42%] sm:min-w-[26%] sm:max-w-[26%] md:min-w-[17%] md:max-w-[17%] aspect-[3/4] rounded-xl bg-muted/30 animate-pulse flex-shrink-0"
                />
              ))
            : items.map((p) => (
                <div
                  key={p.id}
                  className="min-w-[42%] max-w-[42%] sm:min-w-[26%] sm:max-w-[26%] md:min-w-[17%] md:max-w-[17%] flex-shrink-0"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <ProductCard
                    name={p.title}
                    image={p.image ?? "/brand/icon.svg"}
                    price={p.basePrice}
                    productId={p.id}
                    slug={p.slug}
                    customizable={p.isCustomizable}
                    soldCount={p.soldCount}
                  />
                </div>
              ))}
        </div>

        {loaded && items.length > 0 && (
          <Link
            href="/products"
            className="mt-3 flex items-center justify-center gap-2 w-full rounded-2xl border border-border bg-muted/40 py-2.5 text-[12px] font-bold text-foreground hover:bg-muted/70 transition-colors"
          >
            See all products <ChevronRight className="w-3.5 h-3.5 text-primary" />
          </Link>
        )}
      </div>
    </section>
  );
}

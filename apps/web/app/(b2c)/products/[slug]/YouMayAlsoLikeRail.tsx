"use client";

// ─── You May Also Like — single-row autoswipe rail ────────────────────────────
//
// One horizontal row of 6 product cards that auto-advances every 3.5s. On
// desktop ~4 cards are visible at once; the rail scrolls one card width to
// reveal the next, looping back to the start when it reaches the end.
//
// Pauses on hover so users can stop and inspect. Manual horizontal scroll
// (touch / scroll wheel / scrollbar drag) also pauses the autoplay for
// 5 s afterwards so we don't fight the user.
//
// Why a custom carousel instead of an off-the-shelf one: this is the only
// place we need autoplay + loop, the project doesn't currently bundle any
// carousel library, and the implementation is ~80 lines. Adding embla or
// swiper just for this would be the heavier option.

import { useEffect, useRef, useState } from "react";
import ProductCard from "../../_components/sections/ProductCard";

type Related = {
  id: string;
  title: string;
  imageUrl?: string | null;
  basePrice?: number | string | null;
  slug: string;
  isCustomizable?: boolean;
};

export default function YouMayAlsoLikeRail({ items }: { items: Related[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  // Track manual-scroll bursts so we don't immediately jump back ahead.
  const manualPauseUntilRef = useRef<number>(0);

  useEffect(() => {
    if (paused || items.length < 2) return;

    const advance = () => {
      if (Date.now() < manualPauseUntilRef.current) return;
      const el = scrollRef.current;
      if (!el) return;
      // One card width = first child's offsetWidth + gap (12px).
      const firstChild = el.firstElementChild as HTMLElement | null;
      const step = (firstChild?.offsetWidth ?? 200) + 12;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({
        left: atEnd ? 0 : el.scrollLeft + step,
        behavior: "smooth",
      });
    };

    const id = setInterval(advance, 3500);
    return () => clearInterval(id);
  }, [paused, items.length]);

  const onManualScroll = () => {
    manualPauseUntilRef.current = Date.now() + 5000;
  };

  if (items.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={scrollRef}
        onScroll={onManualScroll}
        className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 [&::-webkit-scrollbar]:hidden scroll-smooth"
        style={{ scrollbarWidth: "none", scrollSnapType: "x mandatory" }}
      >
        {items.slice(0, 6).map((p) => (
          <div
            key={p.id}
            className="w-[44%] sm:w-[30%] md:w-[22%] lg:w-[17%] shrink-0"
            style={{ scrollSnapAlign: "start" }}
          >
            <ProductCard
              name={p.title}
              image={p.imageUrl ?? "/brand/icon.svg"}
              price={Number(p.basePrice ?? 0)}
              productId={p.id}
              slug={p.slug}
              customizable={p.isCustomizable}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

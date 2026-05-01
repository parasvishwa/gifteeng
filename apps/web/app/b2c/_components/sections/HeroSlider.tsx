"use client";

/**
 * HeroSlider — image-only carousel.
 *
 * Each slide is a single 3:1 image (1500×500 recommended) wrapped in a link.
 * NO app-rendered title/subtitle/CTA — every slide's copy and call-to-action
 * lives baked inside the image. Identical rendering to the Flutter app.
 *
 * Source of truth: GET /api/banners?placement=home (admin-managed).
 * Falls back gracefully to legacy `slides` prop for backward compat during
 * the cutover.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { normaliseMediaUrl } from "@/lib/media";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface HeroSlide {
  id:        string;
  imageUrl:  string;
  linkUrl?:  string;
  altText?:  string | null;
  // Legacy fields kept ONLY so old callers don't crash. They're ignored.
  title?:    string;
  subtitle?: string;
  ctaText?:  string;
  ctaLink?:  string;
  active?:   boolean;
  order?:    number;
}

export default function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  // Legacy data may still be in `active`/`order` shape; new data is filtered
  // by the API and arrives sorted, so just take what we get.
  const list = slides.filter((s) => s.active !== false && !!s.imageUrl);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const go = (n: number) => setIdx((n + list.length) % list.length);

  useEffect(() => {
    if (list.length <= 1) return;
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % list.length), 5000);
    return () => clearInterval(timerRef.current);
  }, [list.length]);

  if (list.length === 0) return null;

  // Resolve link target from either new (linkUrl) or legacy (ctaLink) field.
  const getHref = (s: HeroSlide) => s.linkUrl || s.ctaLink || "/shop";

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-muted"
      // 3:1 aspect — caps at 380px tall on desktop, scales down on mobile.
      // The image is the whole banner; no overlay chrome inside.
      style={{ aspectRatio: "3 / 1", maxHeight: 420 }}
      onMouseEnter={() => clearInterval(timerRef.current)}
      onMouseLeave={() => {
        if (list.length > 1) {
          timerRef.current = setInterval(() => setIdx((i) => (i + 1) % list.length), 5000);
        }
      }}
    >
      {list.map((s, i) => (
        <Link
          key={s.id}
          href={getHref(s)}
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === idx ? 1 : 0, zIndex: i === idx ? 1 : 0, pointerEvents: i === idx ? "auto" : "none" }}
          aria-label={s.altText ?? s.title ?? "Banner"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={normaliseMediaUrl(s.imageUrl)}
            alt={s.altText ?? s.title ?? ""}
            className="w-full h-full object-cover"
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
          />
        </Link>
      ))}

      {/* Prev/next arrows — only when more than one slide */}
      {list.length > 1 && (
        <>
          <button
            onClick={() => go(idx - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => go(idx + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Pagination dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {list.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

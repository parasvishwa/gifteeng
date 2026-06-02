"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

interface Testimonial {
  id: string;
  name: string;
  text: string;
  rating: number;
  image_url: string | null;
  product_id: string;
  date_label: string;
}

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  { id: "1", name: "Priya S.",   rating: 5, text: "The personalized mug was a hit at my sister's wedding! Quality is absolutely amazing.", image_url: null, product_id: "", date_label: "Mumbai" },
  { id: "2", name: "Rahul M.",   rating: 5, text: "Ordered 50 keychains for Diwali gifts. Delivered on time and everyone loved them.", image_url: null, product_id: "", date_label: "Bangalore" },
  { id: "3", name: "Anita K.",   rating: 5, text: "Fast shipping, beautiful packaging — my custom photo frame came out perfect!", image_url: null, product_id: "", date_label: "Delhi" },
  { id: "4", name: "Vikram P.",  rating: 4, text: "Great quality printing on the t-shirt. Will definitely order again for my team!", image_url: null, product_id: "", date_label: "Pune" },
  { id: "5", name: "Sneha R.",   rating: 5, text: "Gifted a personalised name plate to my colleague — she absolutely loved it!", image_url: null, product_id: "", date_label: "Chennai" },
  { id: "6", name: "Amir K.",    rating: 5, text: "Super fast delivery and beautiful packaging. Will definitely order again soon.", image_url: null, product_id: "", date_label: "Hyderabad" },
  { id: "7", name: "Meera J.",   rating: 5, text: "Birthday gift for my husband — the engraving was flawless. 10/10 experience!", image_url: null, product_id: "", date_label: "Ahmedabad" },
  { id: "8", name: "Kartik D.",  rating: 5, text: "Corporate bulk order of 200 pieces. Excellent quality and great pricing!", image_url: null, product_id: "", date_label: "Surat" },
];

const AVATAR_COLORS = [
  "#E11D48",
  "#7C3AED",
  "#059669",
  "#0284C7",
  "#B45309",
];

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= rating ? "fill-amber-400 text-amber-400" : "fill-border text-border"}`} />
      ))}
    </div>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  const colorIdx = t.name.charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-border/40 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <div
          className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-sm"
          style={{ background: "hsl(351 85% 58%)" }}
        >
          ❝
        </div>
        <StarRow rating={t.rating} />
      </div>
      <p className="text-foreground/70 text-xs leading-relaxed line-clamp-4 flex-1">{t.text}</p>
      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: AVATAR_COLORS[colorIdx] }}>
          {t.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image_url} alt={t.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-[11px] font-black text-white">{t.name.charAt(0)}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-foreground truncate">{t.name}</p>
          {t.date_label && (
            <p className="text-[9px] text-muted-foreground truncate">📍 {t.date_label}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsCarousel({ testimonials = DEFAULT_TESTIMONIALS }: { testimonials?: Testimonial[] }) {
  const list = testimonials.length > 0 ? testimonials : DEFAULT_TESTIMONIALS;
  const avg  = (list.reduce((s, t) => s + t.rating, 0) / list.length).toFixed(1);

  const trackRef   = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [perPage, setPerPage] = useState(1);
  const [cardW, setCardW]     = useState(0);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const total = list.length;
  const maxPage = Math.max(0, total - perPage);

  // Measure card width + per-page from container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const gap = 16;
      const per = w >= 1024 ? 3 : w >= 640 ? 2 : 1;
      setPerPage(per);
      setCardW((w - gap * (per - 1)) / per);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep current in bounds when perPage changes
  useEffect(() => {
    setCurrent(c => Math.min(c, Math.max(0, total - perPage)));
  }, [perPage, total]);

  const go = useCallback((dir: 1 | -1) => {
    setCurrent(c => Math.max(0, Math.min(c + dir, maxPage)));
  }, [maxPage]);

  // Auto-advance
  useEffect(() => {
    if (hovered) return;
    timerRef.current = setTimeout(() => {
      setCurrent(c => (c >= maxPage ? 0 : c + 1));
    }, 4500);
    return () => clearTimeout(timerRef.current);
  }, [current, hovered, maxPage]);

  const gap = 16;
  const translateX = current * (cardW + gap);

  return (
    <section className="py-12 bg-muted/30 dark:bg-card/30">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Customer Stories</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">
              Loved by{" "}
              <span className="italic text-primary">
                1L+ customers
              </span>
            </h2>
          </div>

          {/* Aggregate badge + nav buttons */}
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-3 border border-border/40 bg-muted rounded-lg px-4 py-2.5">
              <div className="text-2xl font-black text-[#F59E0B] leading-none">{avg}★</div>
              <div>
                <StarRow rating={5} />
                <p className="text-[10px] text-muted-foreground mt-0.5">{list.length} verified reviews</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => go(-1)}
                disabled={current === 0}
                className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => go(1)}
                disabled={current >= maxPage}
                className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Carousel track */}
        <div
          ref={containerRef}
          className="overflow-hidden"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div
            ref={trackRef}
            className="flex transition-transform duration-500 ease-in-out"
            style={{
              gap: `${gap}px`,
              transform: `translateX(-${translateX}px)`,
            }}
          >
            {list.map((t) => (
              <div
                key={t.id}
                style={{ minWidth: cardW > 0 ? `${cardW}px` : "100%", width: cardW > 0 ? `${cardW}px` : "100%" }}
                className="shrink-0"
              >
                <TestimonialCard t={t} />
              </div>
            ))}
          </div>
        </div>

        {/* Dot indicators */}
        {maxPage > 0 && (
          <div className="flex justify-center gap-1.5 mt-6">
            {Array.from({ length: maxPage + 1 }, (_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`rounded-full transition-all ${
                  i === current
                    ? "w-5 h-1.5 bg-primary"
                    : "w-1.5 h-1.5 bg-border hover:bg-muted-foreground"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

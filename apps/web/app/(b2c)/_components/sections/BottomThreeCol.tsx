"use client";

// ─── 3-column bottom layout ───────────────────────────────────────────────────
//   [Gifteeng App]   |   [What people say]   |   [Our Promise]
// Three distinct visual treatments — not identical cards with colored header
// bands. App column is dark; Reviews leads with a featured quote; Promise is a
// clean divider list. All three stack on mobile.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Shield, Truck, Palette } from "lucide-react";

// ── Data ───────────────────────────────────────────────────────────────────────

const APP_FEATURES = [
  "Track orders in real time",
  "Exclusive app-only offers",
  "Play games, earn Goins",
  "Faster checkout experience",
] as const;

const PROMISES = [
  {
    Icon: Palette,
    title: "100% Customised",
    desc: "Made to order. Your photo, your text, delivered.",
  },
  {
    Icon: Truck,
    title: "Dispatched in 24 hrs",
    desc: "Pan-India delivery in 3–5 days.",
  },
  {
    Icon: Shield,
    title: "Secure & Safe",
    desc: "Safe packaging, 7-day returns, 100% quality guarantee.",
  },
] as const;

type Review = {
  name: string;
  location: string;
  rating: number;
  text: string;
};

const FALLBACK_REVIEWS: Review[] = [
  {
    name: "Priya S.",
    location: "Mumbai",
    rating: 5,
    text: "Absolutely loved the personalised photo frame! My husband cried when he saw it. Quality was top-notch and delivered super fast. Gifteeng never disappoints!",
  },
  {
    name: "Rohan M.",
    location: "Bengaluru",
    rating: 5,
    text: "Ordered a custom mug for my sister's birthday at 9pm, it shipped the next morning and reached her in two days. The print quality is amazing, looks exactly like the preview.",
  },
  {
    name: "Aisha K.",
    location: "Delhi",
    rating: 5,
    text: "I've ordered three times now, never been let down. The packaging itself feels like a gift before you even open it. My go-to for last-minute presents.",
  },
];

// ── Stars — brand red, not amber (gold is coins only per DESIGN.md) ──────────

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          className={`w-3.5 h-3.5 ${s <= rating ? "text-primary" : "text-border"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ── Col 1: App — dark card with phone mockup illustration ───────────────────
//
// The phone visual lives at the bottom-right corner of the dark card,
// tilted slightly. It's a pure-CSS device frame with a brand-tinted
// screen — no PNG asset to maintain, no slow-loading external image.
// Subtle and decorative, never overlaps the CTAs.

function PhoneMockup() {
  return (
    <div
      className="pointer-events-none absolute -right-6 -bottom-4 w-32 h-44 rotate-[10deg] opacity-90"
      aria-hidden
    >
      {/* Device frame */}
      <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/15 shadow-[0_24px_50px_-12px_rgb(0_0_0_/_0.6)]">
        {/* Screen */}
        <div className="absolute inset-[6px] rounded-[16px] bg-gradient-to-b from-primary/40 via-primary/20 to-primary/5 overflow-hidden">
          {/* Status bar dot */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-white/15" />
          {/* Mock app content */}
          <div className="absolute top-4 left-2.5 right-2.5 space-y-1.5">
            <div className="h-1.5 w-12 rounded-full bg-white/30" />
            <div className="h-1 w-8 rounded-full bg-white/20" />
          </div>
          <div className="absolute top-12 left-2.5 right-2.5 h-10 rounded-md bg-white/15" />
          <div className="absolute top-24 left-2.5 right-2.5 space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-white/15" />
            <div className="h-1.5 w-3/4 rounded-full bg-white/12" />
          </div>
          <div className="absolute bottom-3 left-2.5 right-2.5 h-5 rounded-md bg-white/95 flex items-center justify-center">
            <div className="h-1 w-6 rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

function AppColumn() {
  return (
    <div className="relative rounded-2xl bg-zinc-900 dark:bg-zinc-800 p-5 md:p-6 h-full flex flex-col overflow-hidden">
      <PhoneMockup />
      {/* Soft brand glow at the top-left to add depth */}
      <span
        aria-hidden
        className="absolute -top-16 -left-12 w-40 h-40 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 60%)" }}
      />

      <div className="relative mb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary mb-1">
          Available now
        </p>
        <h3 className="text-base font-black text-white/95 leading-tight">Gifteeng App</h3>
        <p className="text-[11px] text-white/45 mt-0.5 font-medium">Faster. Easier. Better.</p>
      </div>

      <ul className="relative space-y-3 flex-1 mb-6">
        {APP_FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2.5">
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
              aria-hidden
            />
            <span className="text-[11px] text-white/65 font-medium leading-tight">{f}</span>
          </li>
        ))}
      </ul>

      <p className="relative text-[9px] font-black uppercase tracking-[0.18em] text-white/25 mb-3">
        Download Now
      </p>

      <div className="relative flex flex-col gap-2">
        {/* Google Play */}
        <a
          href="https://play.google.com/store/apps/details?id=com.gifteeng.gifteeng_app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/[0.15] transition-colors px-3 py-2 w-fit [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#a4c639] shrink-0" fill="currentColor">
            <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.64.64 0 0 0-.87-.2c-.29.17-.38.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52M7 15.25A1.25 1.25 0 1 1 8.25 14 1.25 1.25 0 0 1 7 15.25m10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25" />
          </svg>
          <div>
            <p className="text-[9px] text-white/35 leading-none">GET IT ON</p>
            <p className="text-[11px] font-bold text-white/90 leading-tight">Google Play</p>
          </div>
        </a>

        {/* App Store */}
        <a
          href="https://apps.apple.com/app/gifteeng/id6738867947"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/[0.15] transition-colors px-3 py-2 w-fit [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-white/85 shrink-0" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
          </svg>
          <div>
            <p className="text-[9px] text-white/35 leading-none">Download on the</p>
            <p className="text-[11px] font-bold text-white/90 leading-tight">App Store</p>
          </div>
        </a>
      </div>
    </div>
  );
}

// ── Col 2: Reviews — autoswipe carousel of testimonials ────────────────────
//
// Previous version only showed the first review. Now we cycle through up to
// 5, swapping every 5 seconds with a crossfade. Pause on hover so users can
// finish reading. Dot indicators at the bottom let users jump manually.

function ReviewsColumn() {
  const [reviews, setReviews] = useState<Review[]>(FALLBACK_REVIEWS);
  const [index, setIndex]     = useState(0);
  const [paused, setPaused]   = useState(false);

  useEffect(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    fetch(`${base}/api/testimonials?status=approved&pageSize=5`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw = Array.isArray(d) ? d : (d?.items ?? []);
        if (raw.length > 0) {
          setReviews(
            raw.map((t: Partial<Review>) => ({
              name:     t.name     ?? "Customer",
              location: t.location ?? "",
              rating:   t.rating   ?? 5,
              text:     t.text     ?? "",
            })).filter((r: Review) => r.text.length > 0),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Autoswipe — 5 s per slide, paused while hovered. clearInterval on unmount
  // and on every paused/length change so it doesn't double-fire.
  useEffect(() => {
    if (paused || reviews.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % reviews.length);
    }, 5000);
    return () => clearInterval(id);
  }, [paused, reviews.length]);

  const review = reviews[index] ?? FALLBACK_REVIEWS[0];

  return (
    <div
      className="rounded-2xl border border-border/30 bg-card p-5 md:p-6 h-full flex flex-col shadow-[0_1px_3px_hsl(230_20%_0%/0.08),0_1px_6px_-1px_hsl(230_20%_0%/0.06)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Section label + aggregate rating — no big hero number */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/40">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary mb-0.5">
            Reviews
          </p>
          <h3 className="text-base font-black text-foreground leading-tight">What people say</h3>
        </div>
        <div className="text-right">
          <Stars rating={5} />
          <p className="text-[10px] text-muted-foreground mt-1">
            <span className="font-bold text-foreground">4.5</span> from 5,000+
          </p>
        </div>
      </div>

      {/* Quote slot — key={index} forces a re-mount on swap so the fade
          animation restarts. line-clamp-5 keeps card height stable. */}
      <div className="flex-1 relative">
        <span
          className="text-5xl font-black text-primary/15 leading-none block -mb-1"
          aria-hidden
        >
          &ldquo;
        </span>
        <p
          key={index}
          className="text-[12px] md:text-[13px] text-foreground/80 leading-relaxed line-clamp-5 animate-[fadeIn_500ms_cubic-bezier(0.23,1,0.32,1)_both]"
        >
          {review.text}
        </p>
      </div>

      {/* Attribution */}
      <div className="mt-4 pt-3.5 border-t border-border/30 flex items-center gap-2.5">
        <div
          key={`avatar-${index}`}
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-[11px] font-black shrink-0 animate-[fadeIn_500ms_cubic-bezier(0.23,1,0.32,1)_both]"
        >
          {review.name.charAt(0).toUpperCase()}
        </div>
        <div key={`meta-${index}`} className="animate-[fadeIn_500ms_cubic-bezier(0.23,1,0.32,1)_both]">
          <p className="text-[11px] font-bold text-foreground leading-tight">{review.name}</p>
          {review.location && (
            <p className="text-[10px] text-muted-foreground">{review.location}</p>
          )}
        </div>

        {/* Pagination dots — pushed to the right of the attribution row */}
        {reviews.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            {reviews.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show review ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index
                    ? "w-4 bg-primary"
                    : "w-1.5 bg-border hover:bg-border/80"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* fadeIn keyframes (scoped via Tailwind arbitrary animation) */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Col 3: Our Promise — clean divider list, no nested cards ──────────────────

function OurPromiseColumn() {
  return (
    <div className="rounded-2xl border border-border/30 bg-card p-5 md:p-6 h-full flex flex-col shadow-[0_1px_3px_hsl(230_20%_0%/0.08),0_1px_6px_-1px_hsl(230_20%_0%/0.06)]">
      <div className="mb-4 pb-4 border-b border-border/40">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary mb-0.5">
          Our Promise
        </p>
        <h3 className="text-base font-black text-foreground leading-tight">
          Quality you can count on
        </h3>
      </div>

      {/* Divider list — no per-item card containers */}
      <div className="divide-y divide-border/40 flex-1">
        {PROMISES.map(({ Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3.5 py-3.5 first:pt-0 last:pb-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-primary" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black text-foreground leading-tight">{title}</p>
              <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function BottomThreeCol() {
  return (
    <section className="py-6 mb-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 items-stretch">
        <AppColumn />
        <ReviewsColumn />
        <OurPromiseColumn />
      </div>
    </section>
  );
}

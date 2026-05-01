"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, ChevronRight, Sparkles, Truck, RotateCcw, Shield, Star,
  Package, Award, Zap, Users, BadgeCheck, Heart, ArrowRight,
} from "lucide-react";

import { cn } from "@/lib/cn";
import ApprovedTestimonials    from "./_components/sections/ApprovedTestimonials";
import RecentlyViewedStrip     from "./_components/sections/RecentlyViewedStrip";
import OccasionChips           from "./_components/sections/OccasionChips";
import CategoryBento           from "./_components/sections/CategoryBento";
import CategoryTabBar          from "./_components/sections/CategoryTabBar";
import AppStoreBadges          from "./_components/sections/AppStoreBadges";
import AnnouncementBanner      from "./_components/sections/AnnouncementBanner";
import ExitIntentPopup         from "./_components/chrome/ExitIntentPopup";
import OccasionBanner          from "./_components/chrome/OccasionBanner";
import MobileBottomNav         from "./_components/MobileBottomNav";
import HeroSlider, { type HeroSlide } from "./_components/sections/HeroSlider";
import HomepageBlocks          from "./_components/sections/HomepageBlocks";
import MarketplaceStoresSection from "./_components/sections/MarketplaceStoresSection";

// ─── Static content ──────────────────────────────────────────────────────────
// Fallback list — shown on first paint before the live /api/search/trending
// response lands, OR when the API returns nothing (fresh install).
const FALLBACK_TRENDING = [
  "Birthday gift for dad", "Gift under 500", "Valentine gift",
  "Anniversary gift", "Gift for mom", "Corporate gift",
  "Return gift", "Wedding gift",
];

const trustBadges: { icon: React.ElementType; text: string }[] = [
  { icon: Star,      text: "4.9★ Rating" },
  { icon: Truck,     text: "Free Delivery" },
  { icon: Shield,    text: "Secure Checkout" },
  { icon: RotateCcw, text: "7-Day Returns" },
  { icon: Package,   text: "500+ Designs" },
];

const stats = [
  { value: 100000, display: "1L+",  label: "Happy Customers", suffix: "+" },
  { value: 500,    display: "500+", label: "Gift Designs",    suffix: "+" },
  { value: 4.9,    display: "4.9★", label: "Average Rating",  suffix: "★" },
  { value: 99,     display: "₹99",  label: "Starting Price",  prefix: "₹" },
];

const whyUs = [
  { icon: BadgeCheck, title: "Premium Quality",  desc: "Durable materials with professional-grade printing that lasts for years." },
  { icon: Zap,        title: "Fast Dispatch",    desc: "Most orders dispatched within 24–48 hours of placing your order." },
  { icon: Users,      title: "Bulk Orders",      desc: "Special pricing for corporate gifting from 50+ pieces onward." },
  { icon: Heart,      title: "Made with Love",   desc: "Every gift is crafted with care and quality-checked before shipping." },
];

// ─── useIntersectionObserver ──────────────────────────────────────────────────
function useIntersectionObserver(options: IntersectionObserverInit = {}): [React.RefCallback<Element>, boolean] {
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const ref: React.RefCallback<Element> = useCallback(
    (node) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        ([entry]) => { if (entry?.isIntersecting) { setIsVisible(true); observerRef.current?.disconnect(); } },
        { threshold: 0.15, ...options }
      );
      observerRef.current.observe(node);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return [ref, isVisible];
}

// ─── FadeInSection ────────────────────────────────────────────────────────────
function FadeInSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const [ref, isVisible] = useIntersectionObserver();
  return (
    <div ref={ref} className={className} style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? "translateY(0)" : "translateY(28px)", transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s` }}>
      {children}
    </div>
  );
}

// ─── AnimatedStat ─────────────────────────────────────────────────────────────
function AnimatedStat({ stat, delay }: { stat: (typeof stats)[0]; delay: number }) {
  const [ref, isVisible] = useIntersectionObserver();
  const [displayed, setDisplayed] = useState("0");
  const hasRun = useRef(false);
  useEffect(() => {
    if (!isVisible || hasRun.current) return;
    hasRun.current = true;
    const isFloat = !Number.isInteger(stat.value);
    const duration = 1400;
    const start = performance.now();
    const raf = (now: number) => {
      const elapsed = now - start - delay * 1000;
      if (elapsed < 0) { requestAnimationFrame(raf); return; }
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = stat.value * eased;
      setDisplayed(isFloat ? current.toFixed(1) : Math.round(current).toLocaleString("en-IN"));
      if (progress < 1) requestAnimationFrame(raf);
      else setDisplayed(stat.display);
    };
    requestAnimationFrame(raf);
  }, [isVisible, stat, delay]);
  return (
    <div ref={ref} className="space-y-1.5" style={{ animationDelay: `${delay}s` }}>
      <div className="font-display text-4xl font-black md:text-5xl drop-shadow-sm tabular-nums">{displayed}</div>
      <div className="text-sm font-medium text-muted-foreground tracking-wide">{stat.label}</div>
    </div>
  );
}

// ─── Hero Search ──────────────────────────────────────────────────────────────
function HeroSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [trending, setTrending] = useState<string[]>(FALLBACK_TRENDING);
  const [isFocused, setIsFocused] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Real trending: pull top-selling products + their category names. Short
  // phrases that read as typical search queries. Falls back to the static
  // list if the API is unreachable or returns nothing.
  useEffect(() => {
    const base = typeof window === "undefined"
      ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000")
      : "";
    (async () => {
      try {
        const r = await fetch(`${base}/api/products?sort=popular&pageSize=10`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json() as { items?: Array<{ title?: string; category?: string }> };
        const items = d.items ?? [];
        const phrases = new Set<string>();
        for (const p of items) {
          // Clean title: take the first 3-4 informative words, strip brand
          // prefix ("Gifteeng …") and obvious noise ("Premium ", " - …").
          if (p.title) {
            const cleaned = p.title
              .replace(/^gifteeng\s+/i, "")
              .split(/[\-–—|,.()]/)[0]
              .trim()
              .split(/\s+/).slice(0, 4).join(" ");
            if (cleaned && cleaned.length >= 6) phrases.add(cleaned);
          }
          if (p.category) phrases.add(p.category);
        }
        const result = Array.from(phrases).slice(0, 10);
        if (result.length >= 3) setTrending(result);
      } catch { /* keep fallback */ }
    })();
  }, []);

  // Cycle hint through trending phrases
  useEffect(() => {
    if (!trending.length) return;
    const id = setInterval(() => {
      setHintVisible(false);
      const t = setTimeout(() => {
        setHintIdx((i) => (i + 1) % trending.length);
        setHintVisible(true);
      }, 250);
      return () => clearTimeout(t);
    }, 2500);
    return () => clearInterval(id);
  }, [trending]);

  const submit = (term?: string) => {
    const q = term ?? query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };
  const filtered = query.trim() ? trending.filter(t => t.toLowerCase().includes(query.toLowerCase())) : trending;
  return (
    <div ref={wrapRef} className="relative mx-auto max-w-xl mb-3">
      <div className="relative flex items-center rounded-2xl border border-border/60 bg-card shadow-sm focus-within:border-primary/40 focus-within:shadow-md transition-all">
        <Search className="absolute left-4 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { setIsFocused(true); setOpen(true); }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder={isFocused ? "Search for personalized gifts…" : ""}
          // text-left + text-align:start cancels the parent <section text-center>
          // that was making the placeholder appear visually centered (#49c).
          className="w-full rounded-2xl bg-transparent pl-11 pr-4 py-3.5 text-sm text-left text-foreground outline-none placeholder:text-muted-foreground/40"
        />
        {/* Animated cycling hint — hidden while focused or typing */}
        {!query && !isFocused && (
          <span
            aria-hidden
            className={cn(
              "absolute left-11 right-4 pointer-events-none select-none",
              "text-sm text-left text-muted-foreground/50 truncate transition-opacity duration-200",
              hintVisible ? "opacity-100" : "opacity-0",
            )}
          >
            Search for&nbsp;
            <span className="font-medium text-muted-foreground/70">
              {trending[hintIdx] ?? "personalized gifts"}
            </span>
            …
          </span>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] rounded-lg bg-card border border-border shadow-2xl p-4 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60 mb-3 px-1 flex items-center gap-1.5">
            {query.trim() ? "Results" : <><span className="text-orange-500">🔥</span> Trending Searches</>}
          </p>
          <div className="flex flex-wrap gap-2">
            {filtered.slice(0, 10).map(term => (
              <button key={term} onMouseDown={e => { e.preventDefault(); submit(term); }} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all">{term}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stats Band ───────────────────────────────────────────────────────────────
function StatsBand() {
  return (
    <section className="mb-10 md:mb-14">
      <FadeInSection>
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-8 md:p-12 shadow-sm">
          {/* Subtle top accent line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center text-foreground divide-y md:divide-y-0 md:divide-x divide-border/40">
            {stats.map((s, i) => <AnimatedStat key={s.display} stat={s} delay={i * 0.12} />)}
          </div>
        </div>
      </FadeInSection>
    </section>
  );
}

// ─── Why Gifteeng ─────────────────────────────────────────────────────────────
function WhyGifteeng() {
  return (
    <section className="py-10 md:py-16">
      <FadeInSection className="mb-8 md:mb-12 text-center">
        <span className="section-tag"><Award className="h-3 w-3" /> Why Gifteeng</span>
        <h2 className="section-heading text-2xl md:text-3xl font-black tracking-tight">
          Gifts That Feel Like You Made Them
        </h2>
        <p className="section-subtitle mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Every order is crafted with care — personalised, quality-checked, and delivered on time.
        </p>
      </FadeInSection>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
        {whyUs.map(({ icon: Icon, title, desc }, i) => (
          <FadeInSection key={title} delay={i * 0.08}>
            <div
              className="group flex items-start gap-4 rounded-2xl p-6 md:p-7 border border-border/50 bg-card h-full transition-all duration-300 cursor-default hover:border-primary/25 hover:shadow-md"
            >
              <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-primary/[0.08] border border-primary/15 transition-all duration-300 group-hover:bg-primary/15">
                <Icon className="w-5 h-5 text-primary" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-foreground mb-1">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          </FadeInSection>
        ))}
      </div>
    </section>
  );
}

// ─── Corporate CTA ────────────────────────────────────────────────────────────
function CorporateCTA() {
  return (
    <section className="py-6 mb-4">
      <FadeInSection>
        <div className="relative overflow-hidden rounded-2xl p-8 md:p-14 flex flex-col md:flex-row items-center gap-8 md:gap-14 border border-border/30 bg-[#12131A]">
          <div className="pointer-events-none absolute top-1/2 right-8 -translate-y-1/2 opacity-[0.04]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="absolute rounded-full border border-white" style={{ width: `${80 + i * 70}px`, height: `${80 + i * 70}px`, top: `${-(40 + i * 35)}px`, right: `${-(40 + i * 35)}px` }} />
            ))}
          </div>
          <div className="flex-1 text-center md:text-left relative z-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5">
              <Users className="h-3.5 w-3.5 text-white/60" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Perfect for Events &amp; Corporates</span>
            </div>
            <h2 className="font-display text-3xl font-black text-white md:text-4xl mb-3 leading-tight">
              Return Gifts &amp;{" "}
              <span className="text-primary italic">Bulk Orders</span>
            </h2>
            <p className="text-sm text-white/55 md:text-base max-w-lg leading-relaxed">Personalized return gifts for weddings, birthdays, corporate events &amp; festivals — starting from just ₹99/piece with special bulk pricing.</p>
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <Link href="/catalogs" className="inline-flex items-center justify-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white bg-[#EF3752] shadow-lg transition-all hover:bg-[#EF3752]/90 active:scale-95">
              Browse Catalog <ChevronRight className="h-4 w-4" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted px-7 py-3.5 text-sm font-semibold text-foreground/80 hover:bg-muted/80 hover:text-white transition-all active:scale-95">
              Talk to Us
            </Link>
          </div>
        </div>
      </FadeInSection>
    </section>
  );
}

// ─── Closing CTA ──────────────────────────────────────────────────────────────
function ClosingCTA() {
  return (
    <section className="py-10 md:py-14">
      <div className="mx-auto max-w-7xl px-4">
        <FadeInSection>
          <div className="relative overflow-hidden rounded-2xl px-6 py-12 text-center text-white shadow-xl md:px-14 md:py-16 bg-[#EF3752]">
            {/* Subtle noise texture */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)",
                backgroundSize: "6px 6px",
              }}
            />
            {/* Soft radial highlight */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 60% 55% at 50% 0%, rgba(255,255,255,0.18) 0%, transparent 70%)",
              }}
            />
            <div className="relative z-10 max-w-xl mx-auto">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/60 mb-3">
                Over 1 Lakh Orders Delivered
              </p>
              <h2 className="font-display text-2xl font-black md:text-4xl mb-3 leading-[1.1] tracking-tight">
                Someone Is Waiting for a Gift That Feels Like You
              </h2>
              <p className="text-sm text-white/75 mb-8 leading-relaxed">
                Free delivery across India &middot; 7-day returns &middot; Quality guaranteed
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/b2c/products"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-sm font-bold text-[#EF3752] shadow-lg transition-all hover:scale-[1.04] active:scale-95"
                >
                  Shop All Gifts <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/b2c/products?customizable=true"
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-white/30 px-7 py-3 text-sm font-semibold text-white hover:bg-white/15 transition-all active:scale-95"
                >
                  Personalised Gifts
                </Link>
              </div>
            </div>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Apps Coming Soon ─────────────────────────────────────────────────────────
function AppsComingSoon() {
  return (
    <section className="py-6 md:py-8">
      <div className="mx-auto max-w-7xl px-4">
        <FadeInSection>
          <div className="relative overflow-hidden rounded-2xl px-5 py-6 md:px-8 md:py-7 text-white shadow-xl border border-border/30 bg-[#12131A]">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="shrink-0 w-11 h-11 rounded-md flex items-center justify-center shadow-lg bg-[#EF3752]">
                  <Sparkles className="w-5 h-5 text-white" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Coming Soon</span>
                  <h3 className="font-display text-base md:text-xl font-black leading-tight">
                    Gifteeng in your{" "}
                    <span className="text-primary">pocket</span>
                  </h3>
                  <p className="mt-0.5 text-[11px] md:text-xs text-white/60 leading-snug hidden sm:block">Android &amp; iOS apps launching soon · one-tap personalise · live tracking</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-sm">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#a4c639] shrink-0" fill="currentColor" aria-hidden><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.64.64 0 0 0-.87-.2c-.29.17-.38.54-.22.83L6.4 9.48A10.81 10.81 0 0 0 1 18h22a10.81 10.81 0 0 0-5.4-8.52M7 15.25A1.25 1.25 0 1 1 8.25 14 1.25 1.25 0 0 1 7 15.25m10 0A1.25 1.25 0 1 1 18.25 14 1.25 1.25 0 0 1 17 15.25"/></svg>
                  <span className="text-[11px] font-bold text-white">Play</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-sm">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-white shrink-0" fill="currentColor" aria-hidden><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25"/></svg>
                  <span className="text-[11px] font-bold text-white">App Store</span>
                </div>
              </div>
            </div>
          </div>
        </FadeInSection>
      </div>
    </section>
  );
}

// ─── Bottom sections with randomised spin-wheel position ─────────────────────
// Stable sections in order; spin wheel is inserted at a random slot on mount
// Minimal ordered bottom sections — calm, premium, no game clutter
function BottomSections() {
  return (
    <>
      <StatsBand />
      <WhyGifteeng />
      <MarketplaceStoresSection />
      <CorporateCTA />
      <ApprovedTestimonials />
      <ClosingCTA />
    </>
  );
}

// ─── Page body ────────────────────────────────────────────────────────────────
function HomePageClient({ heroSlides, homeSections, homeConfig }: {
  heroSlides: HeroSlide[];
  homeSections: unknown[];
  homeConfig: { version: number; sections: Array<{ id: string; type: string; title?: string; subtitle?: string; active: boolean; visibility?: { mobile?: boolean; desktop?: boolean }; order: number; config: Record<string, unknown> }> } | null;
}) {
  return (
    <div className="font-body min-h-screen bg-background">
      <ExitIntentPopup />
      <MobileBottomNav />

      {/* ═══ HERO ════════════════════════════════════════════════════════ */}
      <section className="bg-background relative">
        {/* Warm ambient glow — barely visible, just warmth */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 50% 0%, hsl(var(--primary) / 0.06) 0%, transparent 70%)",
          }}
        />
        <div className="container relative mx-auto px-4 pt-4 md:pt-8 pb-4 text-center">
          {/* Pill badge */}
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-3.5 py-1.5">
            <Star className="h-3 w-3 text-primary" strokeWidth={1.5} />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/80">
              1 Lakh+ Happy Customers
            </span>
          </div>

          {/* Headline — emotional, benefit-driven */}
          <h1 className="font-display mx-auto max-w-2xl mb-3 text-[2rem] md:text-[3.2rem] font-black leading-[1.08] tracking-[-0.025em] text-foreground">
            The Gift They&apos;ll{" "}
            <span
              className="text-primary italic"
              style={{ display: "inline-block", paddingRight: "2px" }}
            >
              Remember Forever
            </span>
          </h1>

          {/* Value prop subtext */}
          <p className="mx-auto max-w-sm mb-7 text-sm md:text-[15px] text-muted-foreground leading-relaxed">
            Handcrafted &amp; personalized gifts for every occasion.
            <br className="hidden md:block" /> Delivered across India, starting at just ₹99.
          </p>

          {/* Search bar */}
          <HeroSearch />

          {/* Category tab bar — right below search */}
          <CategoryTabBar />

          {/* CTA buttons */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <Link
              href="/b2c/products"
              className="inline-flex items-center gap-2 rounded-xl bg-[#EF3752] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:bg-[#EF3752]/90 hover:shadow-lg active:scale-95"
            >
              Shop All Gifts <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/b2c/gift-quiz"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground/80 transition-all hover:border-primary/40 hover:text-primary active:scale-95"
            >
              Gift Quiz
            </Link>
          </div>

          {/* "Also available on" mobile-app strip — visible above the
              fold so visitors learn we have native apps without scrolling.
              Hidden when both store URLs are unset in /super-admin/marketing. */}
          <AppStoreBadges />
        </div>
      </section>

      {/* ═══ ABOVE-THE-FOLD PRODUCT AREA ═════════════════════════════════ */}
      <div className="mx-auto max-w-7xl px-4">
        <OccasionBanner />

        {/* Admin-scheduled event banner (Valentine's, Diwali, etc.) — auto-
            hides when outside the startsAt/endsAt window. Sync with mobile. */}
        <AnnouncementBanner />

        {heroSlides.length > 0 && (
          <div className="mb-6 mt-2">
            <HeroSlider slides={heroSlides} />
          </div>
        )}

        {/* Shop by Occasion — intent-first discovery (mirrors mobile). */}
        <OccasionChips />

        {/* Trust strip */}
        <div className="mb-10 mt-2">
          <div className="flex items-center justify-center gap-5 md:gap-8 flex-wrap py-3 border-y border-border/40">
            {trustBadges.map(({ icon: Icon, text }, i) => (
              <div key={text} className="flex items-center gap-2 text-[11px] md:text-xs text-muted-foreground font-semibold">
                {i > 0 && <span className="hidden md:block h-3 w-px bg-border/60" />}
                <Icon className="w-3.5 h-3.5 text-primary/70 shrink-0" strokeWidth={1.5} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── SHOP BY CATEGORY (bento with product previews) ──────────────
            Replaces the old flat pill row. Uses /categories?withPreviews=true
            so each card shows 3 real product thumbnails — much more
            compelling than emoji-only tiles. Mirrors mobile. */}
        <CategoryBento />

        {/* ─── ADMIN-MANAGED SECTIONS (new builder or legacy) ───────────
            When `config` is present (admin has saved in the Deploy-100 builder)
            every block — including hero, gamification, CTAs and custom HTML —
            is rendered in the order defined there. Otherwise we fall through
            to the legacy `HomepageSections` renderer. */}
        <HomepageBlocks config={homeConfig} legacySections={homeSections} />

        {/* Games live at /play — link via the Gift Casino nav tab */}
      </div>

      {/* ═══ BOTTOM FEATURE SECTIONS (random spin-wheel position) ════════ */}
      <div className="mx-auto max-w-7xl px-4">
        <BottomSections />
      </div>

      {RecentlyViewedStrip && <RecentlyViewedStrip />}

      <style>{`
        .section-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.6875rem;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: hsl(var(--primary) / 0.8);
          background: hsl(var(--primary) / 0.07);
          border: 1px solid hsl(var(--primary) / 0.15);
          border-radius: 9999px;
          padding: 0.25rem 0.75rem;
          margin-bottom: 0.75rem;
        }
        .section-heading {
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 900;
          letter-spacing: -0.025em;
          line-height: 1.1;
          color: hsl(var(--foreground));
          margin-bottom: 0.5rem;
        }
        .section-subtitle {
          font-size: 0.875rem;
          color: hsl(var(--muted-foreground));
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}

// ─── Page entry point ─────────────────────────────────────────────────────────
export default function HomePage() {
  const [heroSlides, setHeroSlides]     = useState<HeroSlide[]>([]);
  const [homeSections, setHomeSections] = useState<unknown[]>([]);
  // New unified config (Deploy 100). null = admin hasn't saved in new builder yet.
  const [homeConfig, setHomeConfig] = useState<{
    version: number;
    sections: Array<{ id: string; type: string; title?: string; subtitle?: string; active: boolean; visibility?: { mobile?: boolean; desktop?: boolean }; order: number; config: Record<string, unknown> }>;
  } | null>(null);

  useEffect(() => {
    // Same-origin in the browser so this works from any host.
    const base = typeof window === "undefined"
      ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000")
      : "";

    // 1) New banner endpoint — single source of truth, image-only.
    fetch(`${base}/api/banners?placement=home`)
      .then(r => r.ok ? r.json() : [])
      .then((banners: unknown) => {
        if (Array.isArray(banners) && banners.length > 0) {
          setHeroSlides(banners as HeroSlide[]);
        }
      })
      .catch(() => {});

    // 2) Legacy homepage config — kept for sections; if banners endpoint
    //    returned nothing, the legacy heroSlides field still feeds the slider.
    fetch(`${base}/api/homepage/config`)
      .then(r => r.ok ? r.json() : { heroSlides: [], sections: [], config: null })
      .then((cfg: { heroSlides?: unknown[]; sections?: unknown[]; config?: unknown }) => {
        // Only fall back to legacy slides if new endpoint produced nothing.
        setHeroSlides(prev => prev.length > 0 ? prev : ((cfg.heroSlides ?? []) as HeroSlide[]));
        setHomeSections(cfg.sections ?? []);
        const c = cfg.config as typeof homeConfig;
        setHomeConfig(c && Array.isArray(c.sections) ? c : null);
      })
      .catch(() => {});
  }, []);

  return <HomePageClient heroSlides={heroSlides} homeSections={homeSections} homeConfig={homeConfig} />;
}

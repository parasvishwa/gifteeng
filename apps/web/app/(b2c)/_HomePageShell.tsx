"use client";

// ─── Homepage — Client Shell ─────────────────────────────────────────────────
// All interactive client-side code lives here. The server entry (page.tsx)
// fetches heroSlides + homeConfig at request time and passes them as props,
// so above-the-fold content (H1, hero image, trust badges) is server-rendered
// and fully crawlable by Google without executing JS.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  ArrowRight,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { normaliseMediaUrl } from "@/lib/media";
import RecentlyViewedStrip     from "./_components/sections/RecentlyViewedStrip";
import OccasionScroll          from "./_components/sections/OccasionScroll";
import CompactStatsBar         from "./_components/sections/CompactStatsBar";
import HowItWorksSection       from "./_components/sections/HowItWorksSection";
import CoinsBannerSection      from "./_components/sections/CoinsBannerSection";
import UGCWallSection          from "./_components/sections/UGCWallSection";
import TrustQualitySection     from "./_components/sections/TrustQualitySection";
import AppStoreBadges          from "./_components/sections/AppStoreBadges";
import AnnouncementBanner      from "./_components/sections/AnnouncementBanner";
import ExitIntentPopup         from "./_components/chrome/ExitIntentPopup";
import OccasionBanner          from "./_components/chrome/OccasionBanner";
import MobileBottomNav         from "./_components/MobileBottomNav";
import HeroSlider, { type HeroSlide } from "./_components/sections/HeroSlider";
import HomepageBlocks, { type PreloadedProducts } from "./_components/sections/HomepageBlocks";
import PickedForYou             from "./_components/sections/PickedForYou";
import BottomThreeCol           from "./_components/sections/BottomThreeCol";
import GiftReelsStrip           from "./_components/sections/GiftReelsStrip";

// ─── Static content ──────────────────────────────────────────────────────────
const FALLBACK_TRENDING = [
  "Birthday gift for dad", "Gift under 500", "Valentine gift",
  "Anniversary gift", "Gift for mom", "Corporate gift",
  "Return gift", "Wedding gift",
];

// Guarantee strip — what the brand promises. Kept distinct from the
// social-proof strip (CompactStatsBar) which carries the actual metrics
// (Happy Customers, Avg Rating, Dispatch Time, 5-Star Reviews, Designs).
// The under-hero trust strip was removed — it duplicated the role of the
// TrustQualitySection strip near the footer. The homepage now carries one
// trust strip, not two competing ones.

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
    <div ref={ref} className={className} style={{ opacity: isVisible ? 1 : 0, transform: isVisible ? "translateY(0)" : "translateY(20px)", transition: `opacity 500ms cubic-bezier(0.23,1,0.32,1) ${delay}s, transform 500ms cubic-bezier(0.23,1,0.32,1) ${delay}s` }}>
      {children}
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
          className="w-full rounded-2xl bg-transparent pl-11 pr-4 py-3.5 text-sm text-left text-foreground outline-none placeholder:text-muted-foreground/40"
        />
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


// CorporateCTA ("Return Gifts & Bulk Orders") removed — the corporate /
// bulk-order offering was discontinued.

// ─── Closing CTA ──────────────────────────────────────────────────────────────
function ClosingCTA() {
  return (
    <section className="py-10 md:py-14">
      <div className="mx-auto max-w-7xl px-4">
        <FadeInSection>
          <div className="relative overflow-hidden rounded-2xl px-6 py-12 text-center text-white shadow-xl md:px-14 md:py-16 bg-[#EF3752]">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)",
                backgroundSize: "6px 6px",
              }}
            />
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
                Over 3 Lakh Orders Delivered
              </p>
              <h2 className="font-display text-2xl font-black md:text-4xl mb-3 leading-[1.1] tracking-tight">
                Someone Is Waiting for a Gift That Feels Like You
              </h2>
              <p className="text-sm text-white/75 mb-8 leading-relaxed">
                Free delivery across India &middot; 7-day returns &middot; Quality guaranteed
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-sm font-bold text-[#EF3752] shadow-lg transition-all hover:scale-[1.04] active:scale-95"
                >
                  Shop All Gifts <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/products?customizable=true"
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

// ─── Bottom sections ──────────────────────────────────────────────────────────
// Removed CorporateCTA ("Return Gifts & Bulk Orders") and ClosingCTA
// ("Someone Is Waiting for a Gift That Feels Like You") — both were
// duplicates of links already in the global nav / footer.
//
// Each bottom section is gated against the admin's homepage-builder so
// toggling "How it Works" or "Loved by customers" in /super-admin
// /homepage-content actually hides the matching strip here.
function BottomSections({
  isDesktopVisible,
}: {
  isDesktopVisible: (type: string) => boolean;
}) {
  return (
    <>
      <HowItWorksSection />
      {isDesktopVisible("gamification-widget") && <CoinsBannerSection />}
      {isDesktopVisible("testimonials")        && <UGCWallSection />}
      <BottomThreeCol />
      <TrustQualitySection />
    </>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────
export type HeroCopy = {
  enabled: boolean;
  tagline: string;
  heading: string;
  headingAccent: string;
  subtitle: string;
  backgroundUrl: string;
  button1Text: string;
  button1Link: string;
  button2Text: string;
  button2Link: string;
  showSearch: boolean;
};

export type HomePageShellProps = {
  heroSlides: HeroSlide[];
  homeSections: unknown[];
  homeConfig: {
    version: number;
    sections: Array<{
      id: string;
      type: string;
      title?: string;
      subtitle?: string;
      active: boolean;
      visibility?: { mobile?: boolean; desktop?: boolean };
      order: number;
      config: Record<string, unknown>;
    }>;
  } | null;
  // Hero copy from /api/settings/public — overrides hardcoded fallbacks
  // so admins can edit hero text + buttons without a redeploy.
  heroCopy?: HeroCopy;
  // Server-pre-fetched products keyed by source ("best-selling", "new-arrivals")
  // so HomepageBlocks product rows render immediately without a client waterfall.
  preloadedProducts?: PreloadedProducts;
  // Server-pre-fetched "Picked For You" fallback (anonymous trending).
  // Passed straight to PickedForYou so the row renders in the initial HTML
  // — crawlable by Google and no skeleton flash for cold visitors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pickedForYouInitial?: any[];
};

// ─── Main shell — receives server-fetched data as props ───────────────────────
//
// Admin section visibility:
//   The hardcoded sections below (PickedForYou, CompactStatsBar, Trust strip,
//   Hero slider, etc.) are gated against the admin's homepage-builder config.
//   `isDesktopVisible('<type>')` returns true when the admin hasn't disabled
//   that section type for desktop, AND defaults to true when there's no row
//   for that type at all — so a freshly-deployed site keeps everything on
//   until the operator opts a section out. Mirrors the Flutter
//   `homepageConfigProvider` so toggling once in the admin affects both
//   surfaces. See docs/SECURITY_AUDIT.md / home page refactor notes.
export function HomePageShell({ heroSlides, homeSections, homeConfig, heroCopy, preloadedProducts, pickedForYouInitial }: HomePageShellProps) {
  const isDesktopVisible = (type: string): boolean => {
    const rows = (homeConfig?.sections ?? []).filter((s) => s.type === type);
    if (rows.length === 0) return true;
    return rows.some((s) => s.active && (s.visibility?.desktop ?? true));
  };
  // Defaults match the previous hardcoded values so a fresh install renders
  // identically until admin overrides via /super-admin/settings → Hero tab.
  const hero: HeroCopy = heroCopy ?? {
    enabled: true,
    tagline: "MADE WITH LOVE",
    heading: "Personalized Gifts That Create",
    headingAccent: "Forever Memories",
    subtitle: "Customized with love. Delivered with happiness.",
    backgroundUrl: "",
    button1Text: "Shop Bestsellers",
    button1Link: "/products?sort=popular",
    button2Text: "",
    button2Link: "",
    showSearch: true,
  };
  return (
    <div className="font-body min-h-screen bg-background">
      <ExitIntentPopup />
      <MobileBottomNav />

      {/* ═══ HERO ═══════════════════════════════════════════════════════
          The standalone pink-gradient hero section (H1 + CTAs above an
          empty rose backdrop) was MERGED with the banner carousel below.
          Each banner is now a complete hero slide with its own editable
          text overlay + image — see /super-admin/banners.

          We render the merged HeroSlider as the FIRST visible block on
          the page. The container provides horizontal padding to match
          the rest of the homepage. When no banners are seeded yet (fresh
          install), we fall back to the legacy text-only hero so the page
          still has a headline.
        */}
      <section className="mx-auto max-w-7xl px-4 pt-3">
        {heroSlides.length > 0 &&
          heroSlides.some((s) => (s.imageUrl ?? "").length > 0) ? (
          <HeroSlider slides={heroSlides} />
        ) : (
          // No banners yet → legacy text-only fallback with rose gradient
          // so the homepage isn't blank above the fold on a fresh install.
          <div
            className="relative overflow-hidden rounded-2xl border border-border/40"
            style={{
              minHeight: "clamp(360px, 38vw, 520px)",
              background: "linear-gradient(135deg, #fff5f7 0%, #ffe8ee 40%, #ffd6e0 70%, #ffccd9 100%)",
            }}
          >
            <div className="relative z-10 px-6 md:px-12 py-10 md:py-14 max-w-xl">
              {hero.tagline && (
                <p className="text-[11px] md:text-xs font-black uppercase tracking-[0.22em] text-primary/70 mb-3">
                  {hero.tagline}
                </p>
              )}
              {/* h2 here — the page H1 is server-rendered in page.tsx for crawlability */}
              <h2 className="font-display font-black leading-[1.05] tracking-tight mb-4
                             text-[2rem] sm:text-[2.4rem] md:text-[2.8rem] lg:text-[3.2rem]">
                {hero.heading}
                {hero.headingAccent && (
                  <>
                    <br />
                    <span style={{ color: "hsl(var(--primary))" }}>{hero.headingAccent}</span>
                  </>
                )}
              </h2>
              {hero.subtitle && (
                <p className="text-sm md:text-base text-foreground/65 mb-6 leading-relaxed">
                  {hero.subtitle}
                </p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {hero.button1Text && (
                  <Link
                    href={hero.button1Link || "/products"}
                    className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold text-white shadow-md active:scale-[0.97]"
                    style={{ backgroundColor: "#EF3752" }}
                  >
                    {hero.button1Text}
                  </Link>
                )}
                {hero.button2Text && (
                  <Link
                    href={hero.button2Link || "/products"}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/70 hover:text-foreground transition-colors"
                  >
                    {hero.button2Text}
                  </Link>
                )}
              </div>
              <div className="mt-6"><AppStoreBadges /></div>
            </div>
          </div>
        )}
      </section>

      {/* ═══ ABOVE-THE-FOLD PRODUCT AREA ═════════════════════════════════ */}
      <div className="mx-auto max-w-7xl px-4">

        {/* HeroSlider was hoisted above as the page hero. The under-hero
            trust strip was removed — the single TrustQualitySection strip
            near the footer carries the trust signalling now. */}

        {/* Shop by Occasion — discovery navigation right at the top */}
        {isDesktopVisible("shop-by-category") && <OccasionScroll />}

        {/* Stats proof bar — reinforces trust after occasion browse */}
        {isDesktopVisible("features-grid") && <CompactStatsBar />}

        {/* Personalised picks — products after the discovery sections */}
        {isDesktopVisible("product-row") && <PickedForYou initialItems={pickedForYouInitial} />}

        {/* Mid-page promo/announcement bar removed — it duplicated the
            top-of-page chrome AnnouncementBar (mounted in Navbar.tsx)
            with the same "Free shipping / WELCOME10 / 7-day returns / 1L+
            customers" copy, so customers saw the identical marquee twice
            on the homepage. The single chrome bar at the top is enough. */}

        {/* Admin-managed product sections */}
        <HomepageBlocks config={homeConfig} legacySections={homeSections} preloadedProducts={preloadedProducts} />

        {/* Gift Reels — UGC inspiration strip */}
        {isDesktopVisible("testimonials") && <GiftReelsStrip />}
      </div>

      {/* ═══ BOTTOM FEATURE SECTIONS ═══════════════════════════════════ */}
      <div className="mx-auto max-w-7xl px-4">
        <BottomSections isDesktopVisible={isDesktopVisible} />
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

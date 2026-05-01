"use client";

/**
 * HomepageBlocks — new public renderer for the Deploy 100 unified config.
 * Takes a HomepageConfig with 15 section types and dispatches each to the
 * right React block. Falls back to the legacy HomepageSections component
 * when config is null (during the pre-save migration period).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Sparkles, Gift, ShoppingBag, Wand2, Clock, Gem, Star, RotateCw } from "lucide-react";
import HomepageSections from "./HomepageSections";

// Browser calls go same-origin so `fetch("/api/...")` works from any host
// the user lands on (admin.gifteeng.com, new.gifteeng.com, direct IP, etc.)
// without being baked to a loopback URL at build time.
const API = typeof window === "undefined"
  ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000")
  : "";

// ─── Types (mirror packages/shared/src/schemas/homepage) ─────────────────
interface HomepageSection {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  active: boolean;
  visibility?: { mobile?: boolean; desktop?: boolean };
  order: number;
  config: Record<string, unknown>;
}

interface HomepageConfig {
  version: number;
  sections: HomepageSection[];
}

interface ApiProduct {
  id: string; slug?: string; title?: string; name?: string;
  basePrice?: number | string; currency?: string;
  image?: unknown; images?: unknown; imageUrl?: string;
  isCustomizable?: boolean;
}

// ─── Small helpers ───────────────────────────────────────────────────────
function pickImage(p: ApiProduct): string {
  if (p.imageUrl && typeof p.imageUrl === "string") {
    return p.imageUrl.startsWith("http") ? p.imageUrl : `${API}${p.imageUrl}`;
  }
  const imgs = p.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs[0];
    const u = typeof first === "string" ? first : (first as { url?: string })?.url ?? "";
    if (u) return u.startsWith("http") ? u : `${API}${u}`;
  }
  if (p.image) {
    if (typeof p.image === "string") return p.image.startsWith("http") ? p.image : `${API}${p.image}`;
    const u = (p.image as { url?: string })?.url ?? "";
    if (u) return u.startsWith("http") ? u : `${API}${u}`;
  }
  return "";
}
function priceLabel(p: ApiProduct): string {
  if (p.basePrice !== undefined) {
    const n = parseFloat(String(p.basePrice));
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  return "";
}

// ─── Announcement bar block ──────────────────────────────────────────────
function AnnouncementBar({ cfg }: { cfg: Record<string, unknown> }) {
  const msgs = (cfg.messages as Array<{ id: string; icon?: string; text: string; link?: string }> | undefined) ?? [];
  if (!msgs.length) return null;
  // Repeat the set once so the marquee scroll wraps seamlessly.
  const loop = [...msgs, ...msgs];
  return (
    <div className="overflow-hidden bg-gradient-to-r from-black via-zinc-900 to-black text-white/80 text-[11px] md:text-xs">
      <div className="flex whitespace-nowrap gap-8 animate-[marquee_38s_linear_infinite] py-1.5 px-4">
        {loop.map((m, i) => (
          <span key={`${m.id}-${i}`} className="inline-flex items-center gap-1.5">
            {m.link
              ? <Link href={m.link} className="hover:text-white">{m.text}</Link>
              : <span>{m.text}</span>}
            <span className="opacity-30 ml-6">·</span>
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ─── Hero block ──────────────────────────────────────────────────────────
function HeroBlock({ cfg }: { cfg: Record<string, unknown> }) {
  const slides = (cfg.slides as Array<{ id: string; imageUrl: string; title?: string; subtitle?: string; ctaText?: string; ctaLink?: string }> | undefined) ?? [];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);
  if (!slides.length) return null;
  const s = slides[i];
  return (
    <section className="relative aspect-[16/7] md:aspect-[21/7] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.imageUrl} alt={s.title ?? ""} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-transparent" />
      <div className="relative h-full flex flex-col justify-center px-4 md:px-10 max-w-xl text-white">
        {s.title && <h2 className="text-xl md:text-3xl font-black leading-tight">{s.title}</h2>}
        {s.subtitle && <p className="text-xs md:text-sm mt-1.5 text-white/80 max-w-md">{s.subtitle}</p>}
        {s.ctaText && s.ctaLink && (
          <Link href={s.ctaLink} className="mt-3 self-start inline-flex items-center gap-1.5 rounded-full bg-white text-black px-4 py-1.5 text-xs font-bold hover:opacity-90">
            {s.ctaText} <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {slides.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)}
              aria-label={`Slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Product row block ───────────────────────────────────────────────────
function ProductRow({ sec }: { sec: HomepageSection }) {
  const cfg = sec.config as {
    source?: string; categoryName?: string; collectionSlug?: string;
    limit?: number; pinnedProductIds?: string[]; appendAuto?: boolean;
  };
  const [products, setProducts] = useState<ApiProduct[]>([]);
  useEffect(() => {
    (async () => {
      const pinned = cfg.pinnedProductIds ?? [];
      const limit = cfg.limit ?? 12;
      const source = cfg.source ?? "new-arrivals";
      const appendAuto = cfg.appendAuto !== false;

      // Pinned fetched first so admin order is preserved
      const pinnedProducts: ApiProduct[] = [];
      if (pinned.length) {
        const res = await Promise.all(pinned.map((id) =>
          fetch(`${API}/api/products/${id}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null)
        ));
        for (const p of res) if (p) pinnedProducts.push(p as ApiProduct);
      }

      let all = pinnedProducts;
      const need = limit - all.length;
      if (appendAuto && need > 0 && source !== "featured") {
        const params = new URLSearchParams({ pageSize: String(limit) });
        if (source === "best-selling") params.set("sort", "popular");
        else if (source === "new-arrivals") params.set("sort", "newest");
        else if (source === "category" && cfg.categoryName) params.set("category", cfg.categoryName);
        else if (source === "collection" && cfg.collectionSlug) params.set("collection", cfg.collectionSlug);
        try {
          const r = await fetch(`${API}/api/products?${params.toString()}`, { cache: "no-store" });
          const d = await r.json();
          const list: ApiProduct[] = Array.isArray(d) ? d : (d.items ?? []);
          // exclude dupes of pinned
          const pinnedIds = new Set(pinned);
          for (const p of list) {
            if (pinnedIds.has(p.id)) continue;
            all.push(p);
            if (all.length >= limit) break;
          }
        } catch { /* ignore */ }
      }
      setProducts(all.slice(0, limit));
    })();
  }, [cfg.source, cfg.categoryName, cfg.collectionSlug, cfg.limit, JSON.stringify(cfg.pinnedProductIds), cfg.appendAuto]);

  if (!products.length) return null;

  const viewAll = cfg.source === "best-selling" ? "/b2c/products?sort=popular"
    : cfg.source === "new-arrivals" ? "/b2c/products?sort=newest"
    : cfg.source === "category" && cfg.categoryName ? `/b2c/products?category=${encodeURIComponent(cfg.categoryName)}`
    : cfg.source === "collection" && cfg.collectionSlug ? `/b2c/collections/${cfg.collectionSlug}`
    : "/b2c/products";

  return (
    <section className="py-5">
      {/* Heading — upgraded with a thin accent bar before the title so each
          row feels like a distinct "chapter" rather than a bare H2. */}
      <div className="flex items-end justify-between mb-3 px-1">
        <div className="min-w-0">
          {sec.title && (
            <h2 className="text-lg md:text-xl font-black tracking-tight flex items-center gap-2">
              <span className="inline-block h-5 w-1 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
              {sec.title}
            </h2>
          )}
          {sec.subtitle && <p className="text-xs text-muted-foreground mt-0.5 ml-3">{sec.subtitle}</p>}
        </div>
        <Link href={viewAll}
          className="shrink-0 ml-3 inline-flex items-center gap-1 rounded-full bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-300 px-3 py-1 text-[11px] font-bold hover:bg-pink-100 dark:hover:bg-pink-950/50 transition-colors">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Horizontal scroller with snap. Scrollbar hidden for a clean look. */}
      <div className="relative">
        <div
          className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-1 pr-6"
        >
          {products.map((p) => {
            const img = pickImage(p);
            const price = priceLabel(p);
            const slug = p.slug ?? p.id;
            const title = p.title ?? p.name ?? "Product";
            // Price / compare-at price for the strikethrough display.
            const meta = (p as unknown as { metadata?: { compareAtPrice?: number | string } }).metadata;
            const compare = meta?.compareAtPrice ? parseFloat(String(meta.compareAtPrice)) : 0;
            const base = p.basePrice ? parseFloat(String(p.basePrice)) : 0;
            const isCustom = !!p.isCustomizable;
            // CTA label reflects the product intent — personalisation vs. direct buy
            const ctaLabel = isCustom ? "Customise now →" : "Buy now →";

            return (
              <Link
                key={p.id}
                href={`/b2c/products/${slug}`}
                className="group relative shrink-0 w-[45vw] sm:w-40 md:w-48 snap-start flex flex-col rounded-lg overflow-hidden bg-card transition-all duration-300 hover:-translate-y-1 border border-border hover:shadow-md"
              >
                {/* Image */}
                <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Gift className="w-10 h-10 text-muted-foreground/30 stroke-[1.25]" aria-hidden />
                    </div>
                  )}

                  {/* PERSONALIZE pin — top-left, only for customisable products.
                      Replaces the "% OFF" badge that felt generic. Pulse dot
                      gives it a subtle "live/interactive" feel. */}
                  {isCustom && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white text-pink-600 text-[9px] font-black px-2 py-0.5 shadow-sm border border-pink-100">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                      CUSTOMISE
                    </span>
                  )}

                  {/* Hover overlay + intent-aware CTA pill
                      Customisable → pink "Customise now" (links user into editor)
                      Not customisable → white "Buy now" (direct purchase intent) */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className={`pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap shadow-lg ${
                    isCustom
                      ? "text-white bg-gradient-to-r from-pink-500 to-pink-700"
                      : "text-pink-600 bg-white"
                  }`}>
                    {ctaLabel}
                  </span>
                </div>

                {/* Body */}
                <div className="p-2.5 md:p-3 flex flex-col gap-1 flex-1">
                  <p className="text-[11px] md:text-[12px] font-semibold text-foreground line-clamp-2 leading-snug min-h-[2.4em]">
                    {title}
                  </p>
                  <div className="flex items-baseline gap-1.5 mt-auto">
                    {price && (
                      <p className="text-[15px] md:text-base font-black text-foreground">{price}</p>
                    )}
                    {compare > base && base > 0 && (
                      <p className="text-[11px] text-muted-foreground line-through">
                        ₹{compare.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Soft pink ring on hover */}
                <span className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-transparent group-hover:ring-pink-500/30 transition-colors duration-300" />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Custom HTML block ───────────────────────────────────────────────────
function CustomHtmlBlock({ cfg }: { cfg: Record<string, unknown> }) {
  const html = (cfg.html as string) ?? "";
  const css = (cfg.css as string) ?? "";
  if (!html.trim() && !css.trim()) return null;
  return (
    <section className="py-4">
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}

// ─── How It Works block ──────────────────────────────────────────────────
function HowItWorksBlock({ sec }: { sec: HomepageSection }) {
  const steps = (sec.config.steps as Array<{ id: string; icon?: string; title: string; description?: string }> | undefined) ?? [];
  if (!steps.length) return null;
  return (
    <section className="py-6 px-4">
      {sec.title && <h2 className="text-lg md:text-xl font-bold text-center mb-4">{sec.title}</h2>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
        {steps.map((s, i) => (
          <div key={s.id} className="rounded-xl border border-border/40 bg-card p-4 text-center">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-black mb-2">
              {i + 1}
            </div>
            <h3 className="text-sm font-bold">{s.title}</h3>
            {s.description && <p className="text-xs text-muted-foreground mt-1.5">{s.description}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Features Grid block ─────────────────────────────────────────────────
function FeaturesGridBlock({ sec }: { sec: HomepageSection }) {
  const items = (sec.config.items as Array<{ id: string; icon?: string; label: string; description?: string }> | undefined) ?? [];
  if (!items.length) return null;
  return (
    <section className="py-4 px-2">
      {sec.title && <h2 className="text-sm md:text-base font-bold text-center mb-3 text-muted-foreground uppercase tracking-widest">{sec.title}</h2>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-xl border border-border/40 bg-card px-3 py-2 flex items-center gap-2">
            <Star className="w-4 h-4 shrink-0 text-primary stroke-[1.5]" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold truncate">{it.label}</p>
              {it.description && <p className="text-[10px] text-muted-foreground truncate">{it.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Gifteeng Difference block ───────────────────────────────────────────
function GifteengDifferenceBlock({ sec }: { sec: HomepageSection }) {
  const pts = (sec.config.points as Array<{ id: string; icon?: string; title: string; description?: string }> | undefined) ?? [];
  if (!pts.length) return null;
  return (
    <section className="py-6 px-4 bg-gradient-to-br from-pink-50 to-pink-100/60 dark:from-pink-950/20 dark:to-pink-950/10 rounded-lg my-3">
      {sec.title && <h2 className="text-lg md:text-xl font-bold text-center mb-4">{sec.title}</h2>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
        {pts.map((p) => (
          <div key={p.id} className="rounded-xl bg-white/70 dark:bg-white/5 p-4 text-center">
            <Gem className="w-5 h-5 mx-auto mb-1.5 text-primary stroke-[1.5]" aria-hidden />
            <h3 className="text-sm font-bold">{p.title}</h3>
            {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── CTA blocks (Design-with-AI, Make Someone Happy) ─────────────────────
function CtaBlock({ sec, accent }: { sec: HomepageSection; accent?: string }) {
  const cfg = sec.config as { headline?: string; subheadline?: string; ctaText?: string; ctaLink?: string; imageUrl?: string };
  if (!cfg.headline && !sec.title) return null;
  return (
    <section className="my-4 rounded-lg overflow-hidden relative"
      style={{
        background: accent ?? "hsl(351 85% 58%)",
        minHeight: 160,
      }}>
      {cfg.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cfg.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
      )}
      <div className="relative px-5 py-6 text-white">
        <h2 className="text-lg md:text-xl font-black leading-tight">{cfg.headline ?? sec.title}</h2>
        {cfg.subheadline && <p className="text-xs md:text-sm mt-1 opacity-90">{cfg.subheadline}</p>}
        {cfg.ctaText && cfg.ctaLink && (
          <Link href={cfg.ctaLink} className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-white text-primary px-4 py-1.5 text-xs font-bold hover:opacity-90">
            {cfg.ctaText} <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}

// ─── Smart Reminders block ───────────────────────────────────────────────
function SmartRemindersBlock({ sec }: { sec: HomepageSection }) {
  const headline = (sec.config.headline as string) ?? sec.title ?? "Never miss a special date";
  return (
    <section className="my-4 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-white px-5 py-6 relative overflow-hidden">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
          <Clock className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-base md:text-lg font-bold">{headline}</h2>
          <p className="text-xs opacity-80 mt-0.5">Birthdays, anniversaries, festivals — we&apos;ll remind you.</p>
        </div>
        <Link href="/account" className="hidden md:inline-flex items-center gap-1 rounded-full bg-white text-indigo-700 px-3 py-1.5 text-xs font-bold hover:opacity-90">
          Set reminder <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}

// ─── Return Gifts block (calls back to ProductRow with category filter) ──
function ReturnGiftsBlock({ sec }: { sec: HomepageSection }) {
  const rowSec: HomepageSection = {
    ...sec, type: "product-row", title: sec.title ?? (sec.config.title as string) ?? "Return Gifts",
    config: { source: "category", categoryName: (sec.config.categoryName as string) ?? "Return Gifts", limit: 12, pinnedProductIds: [], appendAuto: true },
  };
  return <ProductRow sec={rowSec} />;
}

// ─── Testimonials block ──────────────────────────────────────────────────
interface Review { id: string; rating: number; comment?: string; customerName?: string; }
function TestimonialsBlock({ sec }: { sec: HomepageSection }) {
  const limit = Number(sec.config.limit ?? 10);
  const [reviews, setReviews] = useState<Review[]>([]);
  useEffect(() => {
    fetch(`${API}/api/reviews?limit=${limit}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setReviews(Array.isArray(d) ? d : d.items ?? []))
      .catch(() => { });
  }, [limit]);
  if (!reviews.length) return null;
  return (
    <section className="py-5">
      {sec.title && <h2 className="text-base md:text-lg font-bold text-center mb-3">{sec.title}</h2>}
      <div className="flex gap-3 overflow-x-auto scrollbar-hide px-1 pb-1">
        {reviews.map((r) => (
          <div key={r.id} className="shrink-0 w-64 rounded-xl border border-border/40 bg-card p-3">
            <div className="flex items-center gap-0.5 mb-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < r.rating ? "text-amber-400" : "text-muted-foreground/30"}>★</span>
              ))}
            </div>
            {r.comment && <p className="text-xs text-foreground/80 line-clamp-4">{r.comment}</p>}
            {r.customerName && <p className="text-[11px] font-semibold mt-2 text-muted-foreground">— {r.customerName}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── App coming soon block ───────────────────────────────────────────────
function AppComingSoonBlock({ sec }: { sec: HomepageSection }) {
  const cfg = sec.config as { headline?: string; subheadline?: string; appStoreLink?: string; playStoreLink?: string; imageUrl?: string };
  return (
    <section className="my-4 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-white px-5 py-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Coming Soon</p>
          <h2 className="text-lg md:text-xl font-bold mt-0.5">{cfg.headline ?? "Our app is on its way"}</h2>
          {cfg.subheadline && <p className="text-xs opacity-80 mt-1">{cfg.subheadline}</p>}
          <div className="flex gap-2 mt-3">
            {cfg.appStoreLink && <Link href={cfg.appStoreLink} className="text-[11px] font-bold rounded bg-white text-black px-3 py-1.5"> App Store</Link>}
            {cfg.playStoreLink && <Link href={cfg.playStoreLink} className="text-[11px] font-bold rounded bg-white text-black px-3 py-1.5">Google Play</Link>}
          </div>
        </div>
        {cfg.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cfg.imageUrl} alt="" className="h-28 w-auto hidden md:block" />
        )}
      </div>
    </section>
  );
}

// ─── Gamification widget block (Goins + spin teaser) ─────────────────────
function GamificationBlock() {
  return (
    <section className="my-4 rounded-lg bg-gradient-to-br from-pink-500 to-pink-700 text-white px-5 py-5">
      <div className="flex items-center gap-4">
        <Gift className="w-8 h-8" />
        <div className="flex-1 min-w-0">
          <h2 className="text-base md:text-lg font-bold">Earn Goins, play daily games</h2>
          <p className="text-[11px] opacity-80 mt-0.5">Spin the wheel, scratch cards, win discounts & free gifts.</p>
        </div>
        <Link href="/play" className="inline-flex items-center gap-1 rounded-full bg-white text-pink-600 px-3 py-1.5 text-xs font-bold hover:opacity-90">
          Play <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}

// ─── Spin wheel teaser block ─────────────────────────────────────────────
function SpinWheelBlock({ sec }: { sec: HomepageSection }) {
  const h = (sec.config.headline as string) ?? "Daily spin — win up to 200 Goins";
  return (
    <section className="my-4 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white px-5 py-5">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <RotateCw className="w-5 h-5 text-white stroke-[1.5]" aria-hidden />
        </div>
        <div className="flex-1">
          <h2 className="text-base md:text-lg font-bold">{h}</h2>
          <p className="text-[11px] opacity-80 mt-0.5">Come back every 24 hours.</p>
        </div>
        <Link href="/account?tab=spin" className="inline-flex items-center gap-1 rounded-full bg-white text-amber-600 px-3 py-1.5 text-xs font-bold hover:opacity-90">
          Spin <Sparkles className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}

// ─── Design with AI ──────────────────────────────────────────────────────
function DesignWithAiBlock({ sec }: { sec: HomepageSection }) {
  const cfg = sec.config as { headline?: string; subheadline?: string; ctaText?: string; ctaLink?: string; imageUrl?: string };
  return (
    <section className="my-4 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800 text-white px-5 py-6 relative overflow-hidden">
      <div className="absolute top-3 right-3 opacity-30"><Wand2 className="w-20 h-20" /></div>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">AI Studio</p>
      <h2 className="text-lg md:text-xl font-black mt-0.5 max-w-md">{cfg.headline ?? "Design your gift with AI"}</h2>
      {cfg.subheadline && <p className="text-xs opacity-90 mt-1 max-w-md">{cfg.subheadline}</p>}
      {cfg.ctaText && cfg.ctaLink && (
        <Link href={cfg.ctaLink} className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-white text-indigo-700 px-4 py-1.5 text-xs font-bold hover:opacity-90">
          {cfg.ctaText} <Sparkles className="w-3.5 h-3.5" />
        </Link>
      )}
    </section>
  );
}

// ─── Make someone happy ─────────────────────────────────────────────────
function MakeSomeoneHappyBlock({ sec }: { sec: HomepageSection }) {
  return <CtaBlock sec={sec} accent="hsl(351 85% 58%)" />;
}

// ─── Shop-by-Category block ──────────────────────────────────────────────
// Big tactile category tiles — the main way users navigate the catalog.
// Optimised for mobile: 2-up grid on phones, 4-up on desktop, with a hover
// zoom + gradient overlay so each card feels clickable.
function ShopByCategoryBlock({ sec }: { sec: HomepageSection }) {
  const tiles = (sec.config.tiles as Array<{ id: string; categoryName: string; label?: string; imageUrl?: string; emoji?: string }> | undefined) ?? [];
  if (!tiles.length) return null;

  // Per-tile palette — picked from the Gifteeng brand ramp so each category
  // gets its own identity but the row still reads as one system.
  const palettes: Array<{ from: string; to: string; ring: string }> = [
    { from: "from-rose-100",    to: "to-rose-50",     ring: "ring-rose-300/40" },
    { from: "from-emerald-100", to: "to-emerald-50",  ring: "ring-emerald-300/40" },
    { from: "from-sky-100",     to: "to-sky-50",      ring: "ring-sky-300/40" },
    { from: "from-amber-100",   to: "to-amber-50",    ring: "ring-amber-300/40" },
    { from: "from-violet-100",  to: "to-violet-50",   ring: "ring-violet-300/40" },
    { from: "from-lime-100",    to: "to-lime-50",     ring: "ring-lime-300/40" },
    { from: "from-fuchsia-100", to: "to-fuchsia-50",  ring: "ring-fuchsia-300/40" },
    { from: "from-cyan-100",    to: "to-cyan-50",     ring: "ring-cyan-300/40" },
    { from: "from-orange-100",  to: "to-orange-50",   ring: "ring-orange-300/40" },
  ];

  return (
    <section className="py-6">
      <div className="flex items-end justify-between mb-4 px-1">
        <div>
          {sec.title && (
            <h2 className="text-lg md:text-2xl font-black tracking-tight flex items-center gap-2">
              <span className="inline-block h-5 w-1 rounded-full bg-gradient-to-b from-pink-500 to-pink-700" />
              {sec.title}
            </h2>
          )}
          {sec.subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5 ml-3">{sec.subtitle}</p>}
        </div>
        <Link href="/b2c/products" className="shrink-0 ml-3 inline-flex items-center gap-1 rounded-full bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-300 px-3 py-1 text-[11px] font-bold hover:bg-pink-100 dark:hover:bg-pink-950/50 transition-colors">
          View all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Always horizontal-scroll on mobile for that app-shelf feel; grid on desktop. */}
      <div className="flex sm:grid gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-1 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 sm:overflow-visible">
        {tiles.map((t, i) => {
          const href = `/b2c/products?category=${encodeURIComponent(t.categoryName)}`;
          const label = t.label || t.categoryName;
          const palette = palettes[i % palettes.length];
          return (
            <Link
              key={t.id}
              href={href}
              className="group relative shrink-0 snap-start w-[28vw] min-w-[96px] max-w-[130px] sm:w-auto sm:max-w-none flex flex-col items-center transition-transform duration-300 hover:-translate-y-1"
            >
              {/* Icon tile — soft gradient bg, rounded-3xl for that premium app-icon look */}
              <div
                className={`relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br ${palette.from} ${palette.to} dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.14)] group-hover:shadow-[0_4px_16px_rgba(236,72,153,0.12),0_16px_48px_-12px_rgba(236,72,153,0.18)] transition-shadow duration-300`}
              >
                {t.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.imageUrl}
                      alt={label}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  </>
                ) : (
                  <>
                    {/* Subtle inner glow + emoji icon */}
                    <div className="absolute inset-3 rounded-full bg-white/40 dark:bg-white/5 blur-xl" />
                    <span className="relative text-4xl md:text-5xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 drop-shadow-sm">
                      {t.emoji || "🎁"}
                    </span>
                  </>
                )}
                {/* Inner highlight */}
                <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/50 dark:ring-white/5" />
                {/* Hover ring */}
                <span className={`pointer-events-none absolute inset-0 rounded-xl ring-0 ${palette.ring} group-hover:ring-4 transition-all duration-300`} />
              </div>

              {/* Label below tile — centred, two-line safe */}
              <span className="mt-2 text-[11px] md:text-[13px] font-bold text-foreground/90 group-hover:text-pink-600 dark:group-hover:text-pink-400 text-center line-clamp-2 leading-tight transition-colors">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Visibility helper ───────────────────────────────────────────────────
function visibleClass(v?: { mobile?: boolean; desktop?: boolean }): string {
  if (!v) return "";
  const cls: string[] = [];
  if (v.mobile === false) cls.push("hidden md:block");
  if (v.desktop === false) cls.push("md:hidden");
  return cls.join(" ");
}

// ─── Main dispatcher ─────────────────────────────────────────────────────
export default function HomepageBlocks({ config, legacySections }: {
  config: HomepageConfig | null;
  legacySections?: unknown[];
}) {
  if (!config) {
    return <HomepageSections sections={legacySections as Parameters<typeof HomepageSections>[0]["sections"]} />;
  }
  const sections = [...config.sections]
    .filter((s) => s.active)
    .sort((a, b) => a.order - b.order);
  return (
    <>
      {sections.map((sec) => {
        const wrapperCls = visibleClass(sec.visibility);
        const inner = (() => {
          switch (sec.type) {
            case "announcement-bar":    return <AnnouncementBar cfg={sec.config} />;
            case "hero":                return <HeroBlock cfg={sec.config} />;
            case "product-row":         return <ProductRow sec={sec} />;
            case "shop-by-category":    return <ShopByCategoryBlock sec={sec} />;
            case "custom-html":         return <CustomHtmlBlock cfg={sec.config} />;
            case "how-it-works":        return <HowItWorksBlock sec={sec} />;
            case "features-grid":       return <FeaturesGridBlock sec={sec} />;
            case "gifteeng-difference": return <GifteengDifferenceBlock sec={sec} />;
            case "design-with-ai":      return <DesignWithAiBlock sec={sec} />;
            case "smart-reminders":     return <SmartRemindersBlock sec={sec} />;
            case "return-gifts":        return <ReturnGiftsBlock sec={sec} />;
            case "testimonials":        return <TestimonialsBlock sec={sec} />;
            case "app-coming-soon":     return <AppComingSoonBlock sec={sec} />;
            case "make-someone-happy":  return <MakeSomeoneHappyBlock sec={sec} />;
            case "gamification-widget": return <GamificationBlock />;
            case "spin-wheel":          return <SpinWheelBlock sec={sec} />;
            default: return null;
          }
        })();
        if (!inner) return null;
        return <div key={sec.id} className={wrapperCls}>{inner}</div>;
      })}
    </>
  );
}

// Suppress unused-import warnings
void ShoppingBag;

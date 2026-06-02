"use client";

/**
 * HomepageBlocks — new public renderer for the Deploy 100 unified config.
 * Takes a HomepageConfig with 15 section types and dispatches each to the
 * right React block. Falls back to the legacy HomepageSections component
 * when config is null (during the pre-save migration period).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Sparkles, Clock, Gem, Star, RotateCw, Gift, Wand2 } from "lucide-react";
import HomepageSections from "./HomepageSections";
import ProductCard from "./ProductCard";
import { sanitizeHtml, sanitizeCss } from "../../../../lib/sanitize-html";
import { normaliseMediaUrl } from "../../../../lib/media";

// Browser calls go same-origin so `fetch("/api/...")` works from any host
// the user lands on (admin.gifteeng.com, new.gifteeng.com, direct IP, etc.)
// without being baked to a loopback URL at build time.
const API = typeof window === "undefined"
  ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000")
  : "";

// Some files uploaded via the admin (e.g. category icons from ChatGPT)
// land with raw spaces and commas in the filename — "ChatGPT Image May 14,
// 2026, 09_32_21 PM.png". React renders the URL into `src` verbatim and
// some browsers / proxies refuse to load it. encodeURI() percent-encodes
// the unsafe chars but leaves the path structure (`/`, `:`) intact. We
// also guard against double-encoding — if `%XX` is already present we
// assume the URL is already escaped and skip.
function safeEncodeImageUrl(url: string): string {
  if (!url) return "";
  if (/%[0-9A-Fa-f]{2}/.test(url)) return url; // already encoded
  try { return encodeURI(url); } catch { return url; }
}

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
  inventory?: number;
  createdAt?: string;
  ratingAvg?: number | null;
  reviewCount?: number;
  metadata?: Record<string, unknown>;
  _count?: { variantOptions?: number; orderItems?: number };
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
function ProductRow({ sec, preloaded }: { sec: HomepageSection; preloaded?: ApiProduct[] }) {
  const cfg = sec.config as {
    source?: string; categoryName?: string; collectionSlug?: string;
    limit?: number; pinnedProductIds?: string[]; appendAuto?: boolean;
  };
  // Use server-pre-fetched products immediately so the first paint shows real
  // products without a client-side waterfall. The useEffect still runs to
  // refresh stale data, but users see content on first load.
  const [products, setProducts] = useState<ApiProduct[]>(preloaded ?? []);
  const [loading, setLoading] = useState(!preloaded?.length);
  useEffect(() => {
    setLoading(true);
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
      setLoading(false);
    })();
  }, [cfg.source, cfg.categoryName, cfg.collectionSlug, cfg.limit, JSON.stringify(cfg.pinnedProductIds), cfg.appendAuto]);

  if (!loading && !products.length) return null;

  const viewAll = cfg.source === "best-selling" ? "/products?sort=popular"
    : cfg.source === "new-arrivals" ? "/products?sort=newest"
    : cfg.source === "category" && cfg.categoryName ? `/products?category=${encodeURIComponent(cfg.categoryName)}`
    : cfg.source === "collection" && cfg.collectionSlug ? `/collections/${cfg.collectionSlug}`
    : "/products";

  return (
    <section className="py-5">
      {/* Heading — centered, no top-right "View all" */}
      <div className="text-center mb-3 px-1">
        {sec.title && (
          <h2 className="text-lg md:text-xl font-black tracking-tight">{sec.title}</h2>
        )}
        {sec.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{sec.subtitle}</p>}
      </div>

      {/* Horizontal scroller — shimmer skeletons while loading */}
      <div className="relative">
        <div
          className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-1 pr-6"
        >
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="shrink-0 w-[45vw] sm:w-40 md:w-48 snap-start flex flex-col gap-2">
                  <div className="aspect-square rounded-xl bg-muted/40 animate-pulse" />
                  <div className="h-3 rounded-full bg-muted/40 animate-pulse w-4/5 mx-1" />
                  <div className="h-3 rounded-full bg-muted/40 animate-pulse w-2/5 mx-1" />
                  <div className="h-8 rounded-xl bg-muted/30 animate-pulse mx-1" />
                </div>
              ))
            : products.map((p) => {
            const img = pickImage(p);
            const allImgs: string[] = (() => {
              const imgs = p.images;
              if (Array.isArray(imgs) && imgs.length > 0) {
                return imgs.map((i: unknown) => {
                  const u = typeof i === "string" ? i : (i as { url?: string })?.url ?? "";
                  return u ? (u.startsWith("http") ? u : `${API}${u}`) : "";
                }).filter(Boolean);
              }
              return img ? [img] : [];
            })();
            const meta = p.metadata;
            const compare = meta?.compareAtPrice ? parseFloat(String(meta.compareAtPrice)) : 0;
            const base = p.basePrice ? parseFloat(String(p.basePrice)) : 0;

            return (
              <div key={p.id} className="shrink-0 w-[45vw] sm:w-40 md:w-48 snap-start h-full">
                <ProductCard
                  name={p.title ?? p.name ?? "Product"}
                  image={img}
                  images={allImgs}
                  price={base}
                  originalPrice={compare > base ? compare : undefined}
                  customizable={!!p.isCustomizable}
                  productId={p.id}
                  slug={p.slug}
                  inventory={p.inventory}
                  createdAt={p.createdAt}
                  variants={p._count?.variantOptions}
                  soldCount={p._count?.orderItems}
                  ratingAvg={p.ratingAvg}
                  reviews={p.reviewCount}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* "See all products" bottom strip — single CTA */}
      <Link
        href={viewAll}
        className="mt-3 flex items-center justify-center gap-2 w-full rounded-2xl border border-border bg-muted/40 py-2.5 text-[12px] font-bold text-foreground hover:bg-muted/70 transition-colors"
      >
        <span className="flex -space-x-2">
          {products.slice(0, 3).map((p) => {
            const img = pickImage(p);
            return img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={img} alt="" className="w-6 h-6 rounded-full object-cover border-2 border-background" />
            ) : null;
          })}
        </span>
        See all products <ChevronRight className="w-3.5 h-3.5 text-primary" />
      </Link>
    </section>
  );
}

// ─── Custom HTML block ───────────────────────────────────────────────────
function CustomHtmlBlock({ cfg }: { cfg: Record<string, unknown> }) {
  // Admin-supplied content — run through DOMPurify before injecting so a
  // compromised content_editor can't ship inline <script> tags to every
  // customer. See docs/SECURITY_AUDIT.md finding H-1.
  const html = sanitizeHtml((cfg.html as string) ?? "");
  const css  = sanitizeCss((cfg.css as string) ?? "");
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
      {sec.title && <h2 className="text-lg md:text-xl font-black tracking-tight text-center mb-4">{sec.title}</h2>}
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
      {sec.title && <h2 className="text-lg md:text-xl font-black tracking-tight text-center mb-4">{sec.title}</h2>}
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
          <h2 className="text-base md:text-lg font-black">{headline}</h2>
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
      {sec.title && <h2 className="text-lg md:text-xl font-black tracking-tight text-center mb-3">{sec.title}</h2>}
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
          <h2 className="text-base md:text-lg font-black">Earn Goins, play daily games</h2>
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
          <h2 className="text-base md:text-lg font-black">{h}</h2>
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

  // Auto-resolve icons uploaded via /super-admin/categories. Tile rows only
  // carry `categoryName` + `label`; the icon image lives on the Category
  // row's `image` field. We pull the public category list once on mount
  // and build a name → image lookup with multiple fallbacks because the
  // admin sometimes labels tiles differently from the category name
  // (e.g. tile.label "Stationery", tile.categoryName "Stationeries",
  // DB category "Desk & Daily Use").
  // Each row also carries `product_count` (set by the API's
  // categories.service — counts products keyed by category name).
  // We use it to hide tiles whose category has 0 products so the row
  // doesn't show empty dead-ends on the homepage.
  const [catRows, setCatRows] = useState<Array<{ name: string; image: string; productCount: number }>>([]);
  useEffect(() => {
    if (!tiles.length) return;
    let cancelled = false;
    fetch(`${API}/api/categories?pageSize=500`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: Array<{ name: string; image?: string; product_count?: number }> } | Array<{ name: string; image?: string; product_count?: number }>) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : data.items ?? [];
        setCatRows(
          rows
            .filter((c): c is { name: string; image?: string; product_count?: number } => Boolean(c.name))
            .map((c) => ({
              name: c.name,
              image: c.image ?? "",
              productCount: c.product_count ?? 0,
            })),
        );
      })
      .catch(() => { /* keep emoji fallback */ });
    return () => { cancelled = true; };
  }, [tiles.length]);

  // Resolve to the DB row matching a tile (for both icon AND product_count).
  // Mirrors resolveCategoryIcon's lenient matching: exact-on-name-or-label
  // first, then prefix-stem in either direction.
  const resolveCategoryRow = (categoryName: string, label?: string) => {
    if (!catRows.length) return null;
    const candidates = [categoryName, label].filter(Boolean).map((s) => s!.trim().toLowerCase());
    for (const k of candidates) {
      const exact = catRows.find((c) => c.name.trim().toLowerCase() === k);
      if (exact) return exact;
    }
    for (const k of candidates) {
      const stem = catRows.find((c) => {
        const cn = c.name.trim().toLowerCase();
        return cn.startsWith(k) || k.startsWith(cn);
      });
      if (stem) return stem;
    }
    return null;
  };

  const resolveCategoryIcon = (categoryName: string, label?: string): string => {
    return resolveCategoryRow(categoryName, label)?.image ?? "";
  };

  // Hide tiles whose category has zero products. Render the tile while the
  // category list is still loading (catRows empty) so we don't briefly show
  // an empty grid during the hydration window — once the rows arrive, tiles
  // with no products fade out. If the catalog has 0 categories matched (e.g.
  // first-run install), we KEEP showing the tiles so admins aren't confused
  // by a disappeared row while curating.
  const visibleTiles = catRows.length === 0
    ? tiles
    : tiles.filter((t) => {
        const row = resolveCategoryRow(t.categoryName, t.label);
        if (!row) return false;           // matched no DB category → hide
        return row.productCount > 0;       // hide if 0 products
      });

  if (!tiles.length || (catRows.length > 0 && visibleTiles.length === 0)) return null;

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
      <div className="text-center mb-4 px-1">
        {sec.title && (
          <h2 className="text-lg md:text-2xl font-black tracking-tight">{sec.title}</h2>
        )}
        {sec.subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{sec.subtitle}</p>}
      </div>

      {/* Mobile: horizontal scroll row (app-shelf feel). Desktop: a
          CENTERED flex-wrap — not a fixed 8-col grid. The grid left tiles
          hugging the left edge with a wide empty gap whenever there were
          fewer than 8 categories (the common case). Centered wrap keeps
          any tile count visually balanced under the centered heading. */}
      <div className="flex flex-nowrap sm:flex-wrap sm:justify-center gap-3 md:gap-5 overflow-x-auto sm:overflow-visible scrollbar-hide snap-x snap-mandatory pb-2 px-1">
        {visibleTiles.map((t, i) => {
          const href = `/products?category=${encodeURIComponent(t.categoryName)}`;
          const label = t.label || t.categoryName;
          const palette = palettes[i % palettes.length];
          // Resolution order: explicit tile imageUrl → uploaded category icon
          // (matched by categoryName OR label, exact-then-stem) → emoji.
          // The middle step is what makes uploads in /super-admin/categories
          // Just Work on the homepage without re-pasting URLs into the
          // homepage-content block config.
          const resolvedIcon =
            t.imageUrl ||
            resolveCategoryIcon(t.categoryName, t.label) ||
            "";
          // When showing an uploaded icon we want it INSCRIBED on the
          // pastel tile (object-contain, padded), not edge-to-edge — the
          // uploaded assets are flat illustrations meant to sit on the
          // tile background, not full-bleed photos.
          const iconIsIcon = Boolean(resolvedIcon);
          return (
            <Link
              key={t.id}
              href={href}
              className="group relative shrink-0 snap-start w-[28vw] min-w-[96px] max-w-[130px] sm:w-[116px] sm:max-w-none flex flex-col items-center transition-transform duration-300 hover:-translate-y-1"
            >
              {/* Icon tile — soft gradient bg, rounded-3xl for that premium app-icon look */}
              <div
                className={`relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br ${palette.from} ${palette.to} dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.14)] group-hover:shadow-[0_4px_16px_rgba(236,72,153,0.12),0_16px_48px_-12px_rgba(236,72,153,0.18)] transition-shadow duration-300`}
              >
                {iconIsIcon ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={safeEncodeImageUrl(normaliseMediaUrl(resolvedIcon))}
                    alt={label}
                    loading="lazy"
                    className="relative w-3/5 h-3/5 object-contain transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 drop-shadow-sm"
                  />
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
// preloadedProducts: map of source-key → products array, pre-fetched server-side.
// Keys: "best-selling", "new-arrivals" (the two most common product-row sources).
// Typed as any[] so page.tsx (which doesn't import ApiProduct) can pass the raw
// fetch result without a redundant cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PreloadedProducts = Record<string, any[]>;

export default function HomepageBlocks({ config, legacySections, preloadedProducts }: {
  config: HomepageConfig | null;
  legacySections?: unknown[];
  preloadedProducts?: PreloadedProducts;
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
            // The chrome-level <AnnouncementBar /> mounted in Navbar.tsx is
            // the single source of truth for the promo marquee. Old
            // homepage-content rows of type "announcement-bar" used to
            // render a second identical strip mid-page, which customers
            // saw as duplicate noise. Suppressed here so legacy rows
            // become a no-op.
            case "announcement-bar":    return null;
            // "hero" section type was a legacy block that rendered its own
            // mini-carousel from sec.config.slides. It's now redundant —
            // hero banners are managed via /super-admin/banners and rendered
            // by the dedicated HeroSlider component on the homepage. Showing
            // both surfaces produced two stacked carousels and confused
            // admins ("which one do I edit?"). Suppressed here so legacy
            // homepage-content rows with type="hero" become a no-op.
            case "hero":                return null;
            case "product-row": {
              const src = (sec.config as { source?: string }).source ?? "new-arrivals";
              return <ProductRow sec={sec} preloaded={preloadedProducts?.[src]} />;
            }
            case "shop-by-category":    return <ShopByCategoryBlock sec={sec} />;
            case "custom-html":         return <CustomHtmlBlock cfg={sec.config} />;
            // The following legacy block types were auto-seeded with default
            // copy ("Design your gift with AI", "Why Gifteeng", "Never miss
            // a special date", "Make someone happy today", "Our app is
            // coming soon", "Personalised, not generic / Fast pan-India
            // delivery / Quality you can trust") that surfaced unwanted on
            // every fresh install. Suppressing them here keeps the legacy
            // homepage_content rows in the DB (so the admin can clean them
            // up if they want) but renders nothing — homepage stays focused
            // on Hero → Trust strip → Occasions → Stats → Picks → Products.
            // If you ever want any of these blocks back, re-enable the
            // corresponding case below.
            case "features-grid":       return null;
            case "gifteeng-difference": return null;
            case "design-with-ai":      return null;
            case "smart-reminders":     return null;
            case "return-gifts":        return null;
            case "make-someone-happy":  return null;
            case "app-coming-soon":     return null;
            // Additional legacy seeded blocks the operator wanted removed:
            //   - "Earn Goins, play daily games"  → gamification-widget
            //   - "How it works" 3-step block      → how-it-works
            //   - "Loved by customers" carousel    → testimonials
            // Suppressed at render-time only — rows stay in homepage_content
            // DB so the admin can clean them up if they ever want them back.
            case "how-it-works":        return null;
            case "testimonials":        return null;
            case "gamification-widget": return null;
            case "spin-wheel":          return null;
            default: return null;
          }
        })();
        if (!inner) return null;
        return <div key={sec.id} className={wrapperCls}>{inner}</div>;
      })}
    </>
  );
}


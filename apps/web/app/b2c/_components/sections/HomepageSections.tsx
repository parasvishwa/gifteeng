"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Package, Wand2, ShoppingCart } from "lucide-react";
import { ProductBadges } from "../ProductBadges";

// In the browser we fetch same-origin so it works from any host the user
// lands on (admin.gifteeng.com, new.gifteeng.com, direct IP, …) without the
// loopback URL being baked into the production bundle at build time.
const API = typeof window === "undefined"
  ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000")
  : "";

// ── Types ─────────────────────────────────────────────────────────────────────

type SectionType =
  | "best-selling"
  | "new-arrivals"
  | "featured"
  | "collection-row"
  | "category-row"
  | "business-needs"
  | "kids-zone";

interface HomeSection {
  id: string;
  type: SectionType;
  title: string;
  subtitle?: string;
  collectionSlug?: string;
  categoryName?: string;
  active: boolean;
  order: number;
}

interface ApiProduct {
  isCustomizable?: boolean;
  id: string;
  slug?: string;
  title?: string;
  name?: string;
  basePrice?: number | string;
  currency?: string;
  image?: unknown;
  images?: unknown;
  imageUrl?: string;
  inventory?: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  _count?: { variantOptions?: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function pickImages(p: ApiProduct): string[] {
  const imgs = p.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    return imgs.map((i) => {
      const u = typeof i === "string" ? i : (i as { url?: string })?.url ?? "";
      return u ? (u.startsWith("http") ? u : `${API}${u}`) : "";
    }).filter(Boolean);
  }
  const single = pickImage(p);
  return single ? [single] : [];
}

function priceLabel(p: ApiProduct): string {
  if (p.basePrice !== undefined) {
    const n = parseFloat(String(p.basePrice));
    const sym = p.currency === "INR" ? "₹" : "₹";
    return `${sym}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  return "";
}

async function fetchProducts(sec: HomeSection): Promise<ApiProduct[]> {
  let url = `${API}/api/products?pageSize=10`;
  switch (sec.type) {
    case "best-selling":   url += "&sort=popular"; break;
    case "new-arrivals":   url += "&sort=newest"; break;
    case "kids-zone":      url += `&category=${encodeURIComponent("Kids Zone")}`; break;
    case "business-needs": url += `&category=${encodeURIComponent("Business & Office")}`; break;
    case "collection-row":
      if (sec.collectionSlug) url += `&collection=${encodeURIComponent(sec.collectionSlug)}`;
      break;
    case "category-row":
      if (sec.categoryName) url += `&category=${encodeURIComponent(sec.categoryName)}`;
      break;
    default: url += "&sort=newest";
  }
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d) ? d : d.items ?? []).slice(0, 10);
  } catch { return []; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── StripCard — PLP-style card adapted for horizontal scroll strip ────────────
function StripCard({ p }: { p: ApiProduct }) {
  const [imgFailed, setImgFailed] = useState(false);
  const img = pickImage(p);
  const allImages = pickImages(p);
  const [imgIdx, setImgIdx] = useState(0);
  const touchStartX = useRef<number>(0);
  const currentImg = allImages[imgIdx] ?? img;
  const price = priceLabel(p);
  const slug = p.slug ?? p.id;
  const title = p.title ?? p.name ?? "Product";
  const meta = (p as unknown as { metadata?: { compareAtPrice?: number | string } }).metadata;
  const compare = meta?.compareAtPrice ? parseFloat(String(meta.compareAtPrice)) : 0;
  const base = p.basePrice ? parseFloat(String(p.basePrice)) : 0;
  const isCustom = !!p.isCustomizable;
  const variants = p._count?.variantOptions;

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 25) setImgIdx((i) => Math.max(0, Math.min(allImages.length - 1, i + (dx < 0 ? 1 : -1))));
  };

  return (
    <Link
      href={`/b2c/products/${slug}`}
      className="group relative shrink-0 w-[42vw] sm:w-40 md:w-48 snap-start flex flex-col rounded-[18px] overflow-hidden bg-card transition-all duration-300 hover:-translate-y-1 border border-border hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] active:scale-[0.98]"
    >
      {/* Image */}
      <div
        className="relative aspect-square w-full overflow-hidden bg-muted/40 shrink-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {currentImg && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentImg}
            alt={title}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground/20 bg-muted/30">
            <Package className="h-8 w-8" />
          </div>
        )}

        {/* Badges — ProductBadges for consistency */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none z-10">
          <ProductBadges
            product={{ inventory: p.inventory, isCustomizable: isCustom, createdAt: p.createdAt, metadata: p.metadata }}
            size="card" max={2}
          />
        </div>

        {/* Low-stock pill — bottom left */}
        {typeof p.inventory === "number" && p.inventory > 0 && p.inventory <= 5 && (
          <div className="absolute bottom-10 left-2 z-20 pointer-events-none">
            <span className="text-[9px] font-black bg-orange-50 text-orange-600 border border-orange-200 px-1.5 py-0.5 rounded-full">
              🔥 {p.inventory} left
            </span>
          </div>
        )}

        {/* Swipe dot indicators — mobile only */}
        {allImages.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-20 pointer-events-none md:hidden">
            {allImages.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "bg-white w-3" : "bg-white/50 w-1.5"}`}
              />
            ))}
          </div>
        )}

        {/* CTA — always visible on mobile, slide-up on desktop hover */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="absolute inset-x-2 bottom-2 z-20 md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 transition-all duration-200">
          <span className="w-full flex items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] font-bold text-white bg-[#EF3752]">
            {isCustom ? <><Wand2 className="w-3 h-3" /> Customise</> : <><ShoppingCart className="w-3 h-3" /> ADD</>}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 md:p-3 flex flex-col gap-0.5 flex-1">
        <p className="text-[11px] md:text-[12px] font-semibold text-foreground line-clamp-2 leading-snug min-h-[2.4em]">
          {title}
        </p>
        <div className="flex items-baseline gap-1.5 mt-auto">
          {price && (
            <p className="text-[14px] md:text-[15px] font-black text-foreground">{price}</p>
          )}
          {compare > base && base > 0 && (
            <p className="text-[10px] text-muted-foreground line-through">
              ₹{compare.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
        <p className="text-[10px] text-emerald-600 font-semibold">Free delivery</p>
        {variants !== undefined && variants > 1 && (
          <p className="text-[9px] text-muted-foreground leading-none mt-0.5">
            {variants} options
          </p>
        )}
      </div>
    </Link>
  );
}

function ProductStrip({ products, viewAllHref }: { products: ApiProduct[]; viewAllHref?: string }) {
  if (products.length === 0) return null;
  return (
    <div className="relative">
      <div className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-1 pr-6">
        {products.map(p => <StripCard key={p.id} p={p} />)}
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="shrink-0 w-24 snap-start flex flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-pink-300/60 bg-pink-50/50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-300 text-[11px] font-bold hover:bg-pink-100/60 dark:hover:bg-pink-950/40 hover:border-pink-400 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
            View all
          </Link>
        )}
      </div>

      {/* "See all products" strip */}
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="mt-3 flex items-center justify-center gap-2 w-full rounded-2xl border border-border bg-muted/40 py-2.5 text-[12px] font-bold text-foreground hover:bg-muted/70 transition-colors"
        >
          {/* tiny product thumbnails as social proof */}
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
      )}
    </div>
  );
}

// Section heading — pink accent bar + pill "View all" button to match the
// new HomepageBlocks renderer so legacy + new look identical.
function SectionHeader({ sec }: { sec: HomeSection }) {
  const isKids = sec.type === "kids-zone";
  return (
    <div className="flex items-end justify-between mb-3 px-1">
      <div className="min-w-0">
        {isKids && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-[10px] font-bold uppercase tracking-wide mb-1">
            🧸 Kids Zone
          </div>
        )}
        <h2 className={`text-lg md:text-xl font-black tracking-tight flex items-center gap-2 ${isKids ? "text-yellow-700 dark:text-yellow-300" : ""}`}>
          <span className="inline-block h-5 w-1 rounded-full bg-[#EF3752]" />
          {sec.title}
        </h2>
        {sec.subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 ml-3">{sec.subtitle}</p>
        )}
      </div>
      <Link
        href={viewAllLink(sec)}
        className="shrink-0 ml-3 inline-flex items-center gap-1 rounded-full bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-300 px-3 py-1 text-[11px] font-bold hover:bg-pink-100 dark:hover:bg-pink-950/50 transition-colors"
      >
        View all <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function viewAllLink(sec: HomeSection): string {
  switch (sec.type) {
    case "best-selling":   return "/b2c/products?sort=popular";
    case "new-arrivals":   return "/b2c/products?sort=newest";
    case "kids-zone":      return "/b2c/products?category=Kids+Zone";
    case "business-needs": return "/b2c/products?category=Business+%26+Office";
    case "collection-row": return sec.collectionSlug ? `/b2c/collections/${sec.collectionSlug}` : "/b2c/products";
    case "category-row":   return sec.categoryName ? `/b2c/products?category=${encodeURIComponent(sec.categoryName)}` : "/b2c/products";
    default: return "/b2c/products";
  }
}

// Kids zone has a special themed wrapper
function KidsWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-yellow-200/40 dark:border-yellow-800/30 bg-yellow-50/40 dark:bg-[#12131A] p-4">
      {children}
    </div>
  );
}

// Business needs has a professional dark wrapper
function BusinessWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-border/40 bg-card p-4">
      {children}
    </div>
  );
}

// ── Section loader ─────────────────────────────────────────────────────────────

function SectionRow({ sec }: { sec: HomeSection }) {
  const [products, setProducts] = useState<ApiProduct[]>([]);

  useEffect(() => {
    fetchProducts(sec).then(setProducts);
  }, [sec]);

  if (products.length === 0) return null;

  const inner = (
    <>
      <SectionHeader sec={sec} />
      <ProductStrip products={products} viewAllHref={viewAllLink(sec)} />
    </>
  );

  if (sec.type === "kids-zone") return <section className="py-3"><KidsWrapper>{inner}</KidsWrapper></section>;
  if (sec.type === "business-needs") return <section className="py-3"><BusinessWrapper>{inner}</BusinessWrapper></section>;
  return <section className="py-4">{inner}</section>;
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HomepageSections({ sections }: { sections: HomeSection[] }) {
  const active = sections.filter(s => s.active).sort((a, b) => a.order - b.order);
  return (
    <>
      {active.map(sec => <SectionRow key={sec.id} sec={sec} />)}
    </>
  );
}

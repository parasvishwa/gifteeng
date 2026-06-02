"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";

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
  ratingAvg?: number | null;
  reviewCount?: number;
  _count?: { variantOptions?: number; orderItems?: number };
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

// ── StripCard — wraps ProductCard with section-scroll sizing ─────────────────
function StripCard({ p }: { p: ApiProduct }) {
  const img = pickImage(p);
  const allImages = pickImages(p);
  const meta = (p as unknown as { metadata?: { compareAtPrice?: number | string } }).metadata;
  const compare = meta?.compareAtPrice ? parseFloat(String(meta.compareAtPrice)) : 0;
  const base = p.basePrice ? parseFloat(String(p.basePrice)) : 0;

  return (
    <div className="shrink-0 w-[42vw] sm:w-40 md:w-48 snap-start h-full">
      <ProductCard
        name={p.title ?? p.name ?? "Product"}
        image={img}
        images={allImages}
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
}

function ProductStrip({ products, viewAllHref }: { products: ApiProduct[]; viewAllHref?: string }) {
  if (products.length === 0) return null;
  return (
    <div className="relative">
      <div className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-1 pr-6">
        {products.map(p => <StripCard key={p.id} p={p} />)}
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
    <div className="text-center mb-3 px-1">
      {isKids && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-[10px] font-bold uppercase tracking-wide mb-1">
          🧸 Kids Zone
        </div>
      )}
      <h2 className={`text-lg md:text-xl font-black tracking-tight ${isKids ? "text-yellow-700 dark:text-yellow-300" : ""}`}>
        {sec.title}
      </h2>
      {sec.subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{sec.subtitle}</p>
      )}
    </div>
  );
}

function viewAllLink(sec: HomeSection): string {
  switch (sec.type) {
    case "best-selling":   return "/products?sort=popular";
    case "new-arrivals":   return "/products?sort=newest";
    case "kids-zone":      return "/products?category=Kids+Zone";
    case "business-needs": return "/products?category=Business+%26+Office";
    case "collection-row": return sec.collectionSlug ? `/collections/${sec.collectionSlug}` : "/products";
    case "category-row":   return sec.categoryName ? `/products?category=${encodeURIComponent(sec.categoryName)}` : "/products";
    default: return "/products";
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

"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  SlidersHorizontal,
  Grid3X3,
  List,
  X,
  ChevronDown,
  Package,
  Heart,
  Sparkles,
  Search,
  Wand2,
  ShoppingCart,
  Star,
  Zap,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { normaliseMediaUrl } from "@/lib/media";
import { Skeleton, Switch } from "@gifteeng/ui";
import { SearchBox } from "./_SearchBox";
import CategoryTabBar from "../_components/sections/CategoryTabBar";
import VideoStoriesSection from "../_components/sections/VideoStoriesSection";
import { ProductBadges } from "../_components/ProductBadges";

// ── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  slug: string;
  title: string;
  priceLabel?: string;
  basePrice?: number | string;
  currency?: string;
  imageUrl?: string;
  images?: string[];
  _apiImages?: { url: string; alt?: string }[];
  category?: string;
  isCustomizable?: boolean;
  inventory?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  _count?: { variantOptions?: number };
};

type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Browser → same-origin (Next.js rewrites /api/* to the internal API server).
// Server  → direct internal call to the API process.
const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

// Image URLs: /uploads/* paths are proxied through Next.js rewrites to the API
// server, so we can safely use window.location.origin in the browser. The
// next.config.mjs rewrite rule handles the forwarding.
const API_IMAGE_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");
const PAGE_SIZE = 12;

const FALLBACK_CATEGORIES = [
  "Home Decor", "Apparel", "Accessories",
  "Corporate Gifts", "Festive", "Weddings", "Birthdays",
];

// "Personalised" / "Customisable" are the same thing on Gifteeng — any of these
// category names should redirect to the unified Customisable filter.
const PERSONALISED_ALIASES = new Set([
  "personalized gifts", "personalised gifts",
  "personalized gift", "personalised gift",
  "customizable", "customisable",
  "customized gifts", "customised gifts",
]);

const SORT_OPTIONS = [
  { label: "Newest",           value: "newest"     },
  { label: "Price: Low → High", value: "price_asc"  },
  { label: "Price: High → Low", value: "price_desc" },
  { label: "Popular",          value: "popular"    },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const PRICE_CHIPS = [
  { label: "Under ₹199", min: "0",  max: "199" },
  { label: "₹199–₹499", min: "199", max: "499" },
  { label: "₹499+",     min: "499", max: ""    },
] as const;

const OCCASION_CHIPS = [
  { label: "Birthday",     tag: "occasion:birthday"     },
  { label: "Anniversary",  tag: "occasion:anniversary"  },
  { label: "Corporate",    tag: "occasion:corporate"    },
  { label: "Just Because", tag: "occasion:just-because" },
] as const;

// ── Client-side filter safety net ────────────────────────────────────────────
// Applied after every API response. If the API supports the filter param the
// result is a no-op (all products already match). If not, it catches leakage.

function applyClientFilters(
  items: Product[],
  { isCustomizable, minPrice, maxPrice, tag }: {
    isCustomizable?: boolean;
    minPrice?: string;
    maxPrice?: string;
    tag?: string;
  },
): Product[] {
  let out = items;
  if (isCustomizable) {
    out = out.filter((p) => p.isCustomizable === true);
  }
  if (minPrice) {
    const min = parseFloat(minPrice);
    out = out.filter((p) => {
      const bp = parseFloat(String(p.basePrice ?? "0"));
      return !isNaN(bp) && bp >= min;
    });
  }
  if (maxPrice) {
    const max = parseFloat(maxPrice);
    out = out.filter((p) => {
      const bp = parseFloat(String(p.basePrice ?? "0"));
      return !isNaN(bp) && bp <= max;
    });
  }
  if (tag) {
    // Tags are stored in metadata.tags[] or product.tags[]
    out = out.filter((p) => {
      const meta = p.metadata ?? {};
      const tags = Array.isArray(meta.tags) ? meta.tags as string[] : [];
      return tags.some((t) => t.toLowerCase().includes(tag.replace("occasion:", "")));
    });
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function priceLabel(product: Product): string {
  if (product.priceLabel) return product.priceLabel;
  if (product.basePrice !== undefined) {
    const num = parseFloat(String(product.basePrice));
    const sym = product.currency === "INR" ? "₹" : (product.currency ?? "₹");
    return `${sym}${num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return "";
}

/** Extract a URL string from a DB image entry (string OR {url,alt} object). */
function extractImgUrl(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const u = (entry as { url?: unknown }).url;
    if (typeof u === "string") return u;
  }
  return "";
}

function imageUrl(product: Product): string | undefined {
  if (product.imageUrl) return normaliseMediaUrl(product.imageUrl);
  const img = product.images?.[0];
  if (!img) return undefined;
  const url = extractImgUrl(img);
  return url ? normaliseMediaUrl(url) : undefined;
}

function normaliseListProduct(raw: Product): Product {
  const images: string[] = raw._apiImages
    ? raw._apiImages.map((img) => normaliseMediaUrl(img.url))
    : (raw.images ?? []).map((img) => normaliseMediaUrl(extractImgUrl(img)));
  return { ...raw, images, _apiImages: undefined, _count: raw._count };
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchProducts(params: {
  search?: string; category?: string; sort?: string;
  minPrice?: string; maxPrice?: string; isCustomizable?: boolean;
  tag?: string;
  page?: number; signal?: AbortSignal;
}): Promise<ProductListResponse> {
  const q = new URLSearchParams();
  if (params.search)        q.set("search", params.search);
  if (params.category)      q.set("category", params.category);
  if (params.sort)          q.set("sort", params.sort);
  if (params.minPrice)      q.set("minPrice", params.minPrice);
  if (params.maxPrice)      q.set("maxPrice", params.maxPrice);
  if (params.isCustomizable) q.set("isCustomizable", "true");
  if (params.tag)           q.set("tag", params.tag);
  q.set("page", String(params.page ?? 1));
  q.set("pageSize", String(PAGE_SIZE));

  try {
    const res = await fetch(`${API_BASE}/api/products?${q.toString()}`, { signal: params.signal });
    if (!res.ok) return { items: [], total: 0, page: params.page ?? 1, pageSize: PAGE_SIZE };
    const raw = (await res.json()) as
      | { items: Record<string, unknown>[]; total: number; page: number; pageSize: number }
      | Record<string, unknown>[];
    const rawItems: Record<string, unknown>[] = Array.isArray(raw) ? raw : (raw.items ?? []);
    const total = Array.isArray(raw) ? raw.length : (raw.total ?? 0);
    const items = rawItems.map((p) =>
      normaliseListProduct({
        ...(p as Product),
        _apiImages: Array.isArray(p.images) ? (p.images as { url: string; alt?: string }[]) : undefined,
        images: undefined,
        inventory: typeof p.inventory === "number" ? (p.inventory as number) : undefined,
        metadata: (p.metadata ?? undefined) as Record<string, unknown> | undefined,
        createdAt: typeof p.createdAt === "string" ? (p.createdAt as string) : undefined,
        _count: (p as unknown as { _count?: { variantOptions?: number } })._count,
      }),
    );
    return { items, total: total as number, page: params.page ?? 1, pageSize: PAGE_SIZE };
  } catch {
    return { items: [], total: 0, page: params.page ?? 1, pageSize: PAGE_SIZE };
  }
}

async function fetchCategories(): Promise<string[]> {
  try {
    // Note: API route is `/products/categories/list` — using plain
    // `/categories` matches the `:slug` route and 404s.
    const res = await fetch(`${API_BASE}/api/products/categories/list`);
    if (!res.ok) return FALLBACK_CATEGORIES;
    const data = (await res.json()) as string[] | { items: string[] };
    if (Array.isArray(data)) return data.length > 0 ? data : FALLBACK_CATEGORIES;
    if (Array.isArray(data.items) && data.items.length > 0) return data.items;
    return FALLBACK_CATEGORIES;
  } catch {
    return FALLBACK_CATEGORIES;
  }
}

type CatNode = { name: string; children: string[] };

async function fetchCategoryTree(): Promise<CatNode[]> {
  try {
    const res = await fetch(`${API_BASE}/api/categories?pageSize=500`);
    if (!res.ok) return [];
    const raw = (await res.json()) as
      | { id: string; name: string; parent_id?: string | null; is_active?: boolean }[]
      | { items?: { id: string; name: string; parent_id?: string | null; is_active?: boolean }[] };
    const items = Array.isArray(raw) ? raw : (raw.items ?? []);
    const active = items.filter((c) => c.is_active !== false);
    const parents = active.filter((c) => !c.parent_id);
    return parents.map((p) => ({
      name: p.name,
      children: active.filter((c) => c.parent_id === p.id).map((c) => c.name),
    }));
  } catch {
    return [];
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard({ list }: { list?: boolean }) {
  if (list) {
    return (
      <div className="flex gap-4 rounded-2xl bg-card p-4">
        <Skeleton className="h-28 w-28 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2.5 py-1">
          <Skeleton className="h-4 w-3/4 rounded-lg" />
          <Skeleton className="h-3 w-1/4 rounded-lg" />
          <Skeleton className="h-3 w-1/3 rounded-lg" />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-card overflow-hidden">
      <Skeleton className="aspect-square w-full" />
      <div className="p-3.5 space-y-2">
        <Skeleton className="h-3.5 w-3/4 rounded-lg" />
        <Skeleton className="h-3.5 w-1/2 rounded-lg" />
      </div>
    </div>
  );
}

// ── Product Cards ─────────────────────────────────────────────────────────────

function ProductGridCard({ product, wishlisted, onWishlist }: {
  product: Product; wishlisted: boolean; onWishlist: () => void;
}) {
  const img   = imageUrl(product);
  const allImages = product.images && product.images.length > 0 ? product.images : (img ? [img] : []);
  const [imgIdx, setImgIdx] = useState(0);
  const touchStartX = useRef<number>(0);
  const currentImg = allImages[imgIdx] ?? img;
  const price = priceLabel(product);
  const [imgFailed, setImgFailed] = useState(false);
  const variants = product._count?.variantOptions;

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 25) setImgIdx((i) => Math.max(0, Math.min(allImages.length - 1, i + (dx < 0 ? 1 : -1))));
  };

  // Stable pseudo-random "sold today" count derived from product id
  const soldToday = useMemo(() => {
    const hash = product.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return 8 + (hash % 47);
  }, [product.id]);

  return (
    <div className="group relative rounded-[18px] bg-card overflow-hidden flex flex-col transition-all duration-300 border border-border hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] hover:-translate-y-1 active:scale-[0.98]">
      <Link href={`/b2c/products/${product.slug}`} className="flex flex-col flex-1">

        {/* Square image — 100% width */}
        <div
          className="relative aspect-square w-full overflow-hidden bg-muted/40 shrink-0"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {currentImg && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentImg} alt={product.title}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.07]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/20 bg-muted/30">
              <Package className="h-10 w-10" />
            </div>
          )}

          {/* Badge rail */}
          <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none flex flex-col gap-1">
            <ProductBadges product={product} size="card" max={2} />
          </div>

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

          {/* Scrim for action buttons */}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          {/* CTA — always visible on mobile, slide-up on desktop */}
          <div className="absolute inset-x-2 bottom-2 z-20 md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 transition-all duration-200">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-[11px] font-bold text-white bg-[#EF3752] hover:bg-[#d42f48] transition-colors active:scale-95 shadow-sm"
            >
              {product.isCustomizable
                ? <><Wand2 className="h-3.5 w-3.5" /> Customise</>
                : <><ShoppingCart className="h-3.5 w-3.5" /> ADD</>
              }
            </button>
          </div>
        </div>

        {/* Card body */}
        <div className="p-3 flex flex-col flex-1">
          <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-foreground">
            {product.title}
          </p>

          {/* Trust micro-row */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500 font-bold">
              <Star className="h-2.5 w-2.5 fill-amber-500" /> 4.8
            </span>
            <span className="text-muted-foreground/30 text-[10px]">·</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {soldToday} sold today
            </span>
          </div>

          {/* Price row */}
          {price && (
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[15px] font-black text-foreground">{price}</span>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                Free delivery
              </span>
            </div>
          )}

          {/* Variant options indicator */}
          {variants !== undefined && variants > 1 && (
            <p className="text-center text-[9px] text-muted-foreground leading-none mt-0.5">
              {variants} options
            </p>
          )}
        </div>
      </Link>

      {/* Wishlist */}
      <button
        onClick={onWishlist}
        className={cn(
          "absolute right-2.5 top-2.5 z-10 h-8 w-8 rounded-full flex items-center justify-center shadow-sm border backdrop-blur-md transition-all duration-200 hover:scale-110",
          wishlisted
            ? "text-rose-500 bg-rose-50/90 border-rose-200/60"
            : "text-white/80 bg-black/25 border-white/20 hover:text-rose-400 hover:bg-white/90 hover:border-rose-200/60",
        )}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
      >
        <Heart className={cn("h-3.5 w-3.5", wishlisted && "fill-rose-500")} />
      </button>
    </div>
  );
}

function ProductListCard({ product, wishlisted, onWishlist }: {
  product: Product; wishlisted: boolean; onWishlist: () => void;
}) {
  const img   = imageUrl(product);
  const price = priceLabel(product);

  return (
    <div className="group relative flex gap-4 rounded-2xl bg-card overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/5">
      <Link href={`/b2c/products/${product.slug}`} className="flex gap-4 flex-1 p-4">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-muted/40">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={product.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
              <Package className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1.5 min-w-0">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{product.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {product.category && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {product.category}
              </span>
            )}
            <ProductBadges product={product} size="card" max={2} />
          </div>
          {price && <p className="text-base font-black text-foreground">{price}</p>}
        </div>
      </Link>

      <button
        onClick={onWishlist}
        className={cn(
          "absolute right-3.5 top-3.5 h-7 w-7 rounded-full bg-background/80 backdrop-blur-md flex items-center justify-center shadow-sm border border-border/20 transition-all duration-200 hover:scale-110",
          wishlisted ? "text-rose-500 bg-rose-50 border-rose-200/60" : "text-muted-foreground hover:text-rose-400",
        )}
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
      >
        <Heart className={cn("h-3.5 w-3.5", wishlisted && "fill-rose-500")} />
      </button>
    </div>
  );
}

// ── Quick Filter Bar ───────────────────────────────────────────────────────────

function QuickFilterBar({
  urlMinPrice, urlMaxPrice, urlTag, urlCustomizable,
  onPrice, onTag, onCustomizable,
}: {
  urlMinPrice: string; urlMaxPrice: string; urlTag: string; urlCustomizable: boolean;
  onPrice: (min: string, max: string) => void;
  onTag:   (tag: string)             => void;
  onCustomizable: (v: boolean)       => void;
}) {
  return (
    <div className="sticky top-[80px] md:top-[88px] z-30 bg-background/95 backdrop-blur-md border-b border-border/40">
      <div className="mx-auto max-w-7xl">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none items-center">

          {/* Customisable toggle chip */}
          <button
            onClick={() => onCustomizable(!urlCustomizable)}
            className={cn(
              "shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold border transition-all",
              urlCustomizable
                ? "bg-[#EF3752] text-white border-[#EF3752] shadow-sm"
                : "bg-card text-foreground border-border hover:border-primary/50",
            )}
          >
            <Wand2 className="h-3 w-3" /> Customisable
          </button>

          <span className="h-5 w-px bg-border/50 shrink-0" />

          {/* Price chips */}
          {PRICE_CHIPS.map((chip) => {
            const active = urlMinPrice === chip.min && urlMaxPrice === chip.max;
            return (
              <button
                key={chip.label}
                onClick={() => active ? onPrice("", "") : onPrice(chip.min, chip.max)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold border transition-all",
                  active
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-card text-foreground border-border hover:border-primary/50",
                )}
              >
                {chip.label}
              </button>
            );
          })}

          <span className="h-5 w-px bg-border/50 shrink-0" />

          {/* Occasion chips */}
          {OCCASION_CHIPS.map((chip) => {
            const active = urlTag === chip.tag;
            return (
              <button
                key={chip.tag}
                onClick={() => active ? onTag("") : onTag(chip.tag)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold border transition-all",
                  active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-card text-foreground border-border hover:border-primary/50",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar label ─────────────────────────────────────────────────────────────
function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">{children}</p>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ProductsPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlSearch      = searchParams.get("search")   ?? "";
  const urlCategory    = searchParams.get("category") ?? "";
  const urlSort        = (searchParams.get("sort") ?? "") as SortValue | "";
  const urlMinPrice    = searchParams.get("minPrice") ?? "";
  const urlMaxPrice    = searchParams.get("maxPrice") ?? "";
  const urlCustomizable = searchParams.get("customizable") === "true";
  const urlTag         = searchParams.get("tag")      ?? "";

  const [products, setProducts]       = useState<Product[]>([]);
  const [total, setTotal]             = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [viewMode, setViewMode]             = useState<"grid" | "list">("grid");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [categories, setCategories]         = useState<string[]>(FALLBACK_CATEGORIES);
  const [catTree, setCatTree]               = useState<CatNode[]>([]);
  const [minPriceInput, setMinPriceInput]   = useState(urlMinPrice);
  const [maxPriceInput, setMaxPriceInput]   = useState(urlMaxPrice);

  const [wishlist, setWishlist] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("gifteeng.wishlist");
        return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
      } catch { return new Set(); }
    }
    return new Set();
  });

  const abortRef    = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMinPriceInput(urlMinPrice); setMaxPriceInput(urlMaxPrice); }, [urlMinPrice, urlMaxPrice]);

  const toggleWishlist = (id: string) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("gifteeng.wishlist", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const pushUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(overrides)) {
        if (val === undefined || val === "") params.delete(key); else params.set(key, val);
      }
      params.delete("page");
      startTransition(() => { router.push(`/b2c/products?${params.toString()}`, { scroll: false }); });
    },
    [router, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    setMinPriceInput(""); setMaxPriceInput("");
    startTransition(() => { router.push("/b2c/products", { scroll: false }); });
  }, [router]);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setInitialLoading(true);
    setCurrentPage(1);
    fetchProducts({
      search: urlSearch || undefined, category: urlCategory || undefined,
      sort: urlSort || undefined, minPrice: urlMinPrice || undefined,
      maxPrice: urlMaxPrice || undefined, isCustomizable: urlCustomizable || undefined,
      tag: urlTag || undefined,
      page: 1, signal: abortRef.current.signal,
    }).then((data) => {
      const filtered = applyClientFilters(data.items, {
        isCustomizable: urlCustomizable || undefined,
        minPrice: urlMinPrice || undefined,
        maxPrice: urlMaxPrice || undefined,
        tag: urlTag || undefined,
      });
      setProducts(filtered);
      setTotal(data.total);
      setInitialLoading(false);
    });
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch, urlCategory, urlSort, urlMinPrice, urlMaxPrice, urlCustomizable, urlTag]);

  useEffect(() => {
    fetchCategories().then((fetched) => {
      // Drop any "Personalized Gifts"-like categories — they're merged into the Customisable toggle.
      setCategories(fetched.filter((c) => !PERSONALISED_ALIASES.has(c.trim().toLowerCase())));
    });
    fetchCategoryTree().then(setCatTree);
  }, []);

  // If the URL specifies a "Personalized/Customisable" category, auto-redirect to the
  // unified Customisable filter so both paths show the same products.
  useEffect(() => {
    if (urlCategory && PERSONALISED_ALIASES.has(urlCategory.trim().toLowerCase())) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("category");
      params.set("customizable", "true");
      params.delete("page");
      router.replace(`/b2c/products?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCategory]);

  const handleLoadMore = async () => {
    const nextPage = currentPage + 1;
    setLoadingMore(true);
    const data = await fetchProducts({
      search: urlSearch || undefined, category: urlCategory || undefined,
      sort: urlSort || undefined, minPrice: urlMinPrice || undefined,
      maxPrice: urlMaxPrice || undefined, isCustomizable: urlCustomizable || undefined,
      tag: urlTag || undefined,
      page: nextPage,
    });
    const filtered = applyClientFilters(data.items, {
      isCustomizable: urlCustomizable || undefined,
      minPrice: urlMinPrice || undefined,
      maxPrice: urlMaxPrice || undefined,
      tag: urlTag || undefined,
    });
    setProducts((prev) => [...prev, ...filtered]);
    setCurrentPage(nextPage);
    setLoadingMore(false);
  };

  // ── Infinite scroll — auto-load when sentinel enters viewport ───────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !loadingMore && !initialLoading) {
          void handleLoadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, initialLoading, products.length, total, currentPage]);

  const activeFilters: Array<{ key: string; label: string; clear: () => void }> = [];
  if (urlSearch)    activeFilters.push({ key: "search",   label: `"${urlSearch}"`,    clear: () => pushUrl({ search: "" }) });
  if (urlCategory)  activeFilters.push({ key: "category", label: urlCategory,          clear: () => pushUrl({ category: "" }) });
  if (urlSort) {
    const sl = SORT_OPTIONS.find((o) => o.value === urlSort)?.label ?? urlSort;
    activeFilters.push({ key: "sort", label: sl, clear: () => pushUrl({ sort: "" }) });
  }
  if (urlMinPrice || urlMaxPrice) {
    const rl = urlMinPrice && urlMaxPrice ? `₹${urlMinPrice}–₹${urlMaxPrice}` : urlMinPrice ? `≥₹${urlMinPrice}` : `≤₹${urlMaxPrice}`;
    activeFilters.push({ key: "price", label: rl, clear: () => pushUrl({ minPrice: "", maxPrice: "" }) });
  }
  if (urlCustomizable) activeFilters.push({ key: "customizable", label: "Customisable", clear: () => pushUrl({ customizable: "" }) });
  if (urlTag) {
    // Pretty-print "occasion:birthday" → "Occasion · Birthday"
    const [ns, val] = urlTag.includes(":") ? urlTag.split(":") : ["", urlTag];
    const pretty = val ? val.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : urlTag;
    const nsPretty = ns ? ns.charAt(0).toUpperCase() + ns.slice(1) + " · " : "";
    activeFilters.push({ key: "tag", label: `${nsPretty}${pretty}`, clear: () => pushUrl({ tag: "" }) });
  }

  const hasFilters    = activeFilters.length > 0;
  const showingCount  = products.length;
  const hasMore       = showingCount < total;

  // Subcategory chips — shown when urlCategory matches a parent that has children
  const activeSubcats = useMemo(() => {
    if (!urlCategory) return [];
    const node = catTree.find(
      (n) => n.name.toLowerCase() === urlCategory.toLowerCase(),
    );
    return node?.children ?? [];
  }, [urlCategory, catTree]);

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const SidebarContent = (
    <div className="space-y-5">

      {/* Customizable toggle — top priority filter */}
      <div className={cn(
        "flex items-center justify-between rounded-xl px-3.5 py-3 transition-all",
        urlCustomizable
          ? "bg-[#EF3752]/10 border border-[#EF3752]/30"
          : "bg-white dark:bg-muted border border-pink-200 dark:border-border shadow-sm"
      )}>
        <div>
          <p className="text-[13px] font-bold text-foreground flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5 text-primary shrink-0" /> Customisable</p>
          <p className="text-[10px] text-muted-foreground/60">Products you can design yourself</p>
        </div>
        <Switch
          checked={urlCustomizable}
          onCheckedChange={(checked) => pushUrl({ customizable: checked ? "true" : "" })}
          className="data-[state=unchecked]:bg-gray-300 dark:data-[state=unchecked]:bg-gray-600"
        />
      </div>

      {/* Divider */}
      <div className="h-px bg-border/40" />

      {/* Search */}
      <div>
        <SidebarLabel>Search</SidebarLabel>
        <SearchBox defaultValue={urlSearch} />
      </div>

      {/* Categories */}
      <div>
        <SidebarLabel>Categories</SidebarLabel>
        <div className="space-y-0.5">
          <button
            onClick={() => pushUrl({ category: "" })}
            className={cn(
              "w-full rounded-md px-3 py-2 text-left text-[13px] transition-all duration-150",
              !urlCategory
                ? "bg-primary/10 font-bold text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            All Products
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => pushUrl({ category: c })}
              className={cn(
                "w-full rounded-md px-3 py-2 text-left text-[13px] transition-all duration-150",
                urlCategory === c
                  ? "bg-primary/10 font-bold text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/40" />

      {/* Sort */}
      <div>
        <SidebarLabel>Sort by</SidebarLabel>
        <div className="space-y-0.5">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => pushUrl({ sort: o.value })}
              className={cn(
                "w-full rounded-md px-3 py-1.5 text-left text-[13px] transition-all duration-150",
                urlSort === o.value
                  ? "bg-primary/10 font-bold text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border/40" />

      {/* Price range */}
      <div>
        <SidebarLabel>Price Range (₹)</SidebarLabel>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} placeholder="Min"
            value={minPriceInput} onChange={(e) => setMinPriceInput(e.target.value)}
            className="w-full rounded-xl border border-pink-200 dark:border-border bg-white dark:bg-muted px-3 py-2 text-sm outline-none focus:border-[#EF3752] transition-all"
          />
          <span className="shrink-0 text-muted-foreground/40 text-xs">–</span>
          <input
            type="number" min={0} placeholder="Max"
            value={maxPriceInput} onChange={(e) => setMaxPriceInput(e.target.value)}
            className="w-full rounded-xl border border-pink-200 dark:border-border bg-white dark:bg-muted px-3 py-2 text-sm outline-none focus:border-[#EF3752] transition-all"
          />
        </div>
        <button
          onClick={() => pushUrl({ minPrice: minPriceInput || undefined, maxPrice: maxPriceInput || undefined })}
          disabled={!minPriceInput && !maxPriceInput}
          className="mt-2.5 w-full rounded-xl py-2 text-sm font-bold text-white bg-[#EF3752] transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Apply Price
        </button>
      </div>

      {/* Clear all */}
      {hasFilters && (
        <>
          <div className="h-px bg-border/40" />
          <button
            onClick={clearAllFilters}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border/50 px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-all hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50/50"
          >
            <X className="h-3.5 w-3.5" /> Clear all filters
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ── Video story carousel — admin-curated short-form videos tagged with products ── */}
      <VideoStoriesSection />

      {/* ── Page hero header ─────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 pt-4 md:pt-5 pb-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">
                  {urlCategory || "All Products"}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                {urlCategory ? (
                  <>
                    {urlCategory.split(" ").slice(0, -1).join(" ")}{" "}
                    <span className="text-[#EF3752]">
                      {urlCategory.split(" ").slice(-1)[0]}
                    </span>
                  </>
                ) : (
                  <>
                    All{" "}
                    <span className="text-[#EF3752]">
                      Products
                    </span>
                  </>
                )}
              </h1>
              {!initialLoading && (
                <p className="mt-1 text-[12px] text-muted-foreground/60">
                  {total} item{total !== 1 ? "s" : ""} found
                </p>
              )}
            </div>

            {/* Active filter pills */}
            {activeFilters.length > 0 && (
              <div className="hidden md:flex flex-wrap items-center gap-1.5 justify-end">
                {activeFilters.map((f) => (
                  <span key={f.key}
                    className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                    {f.label}
                    <button onClick={f.clear}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted/80 transition-colors" aria-label="Remove">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <button onClick={clearAllFilters}
                  className="text-[11px] text-muted-foreground/60 hover:text-rose-500 transition-colors">
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Sticky quick-filter chip bar ──────────────────────────────── */}
      <QuickFilterBar
        urlMinPrice={urlMinPrice}
        urlMaxPrice={urlMaxPrice}
        urlTag={urlTag}
        urlCustomizable={urlCustomizable}
        onPrice={(min, max) => pushUrl({ minPrice: min, maxPrice: max })}
        onTag={(tag) => pushUrl({ tag })}
        onCustomizable={(v) => pushUrl({ customizable: v ? "true" : "" })}
      />

      {/* ── Subcategory chips — only when a parent with children is active ── */}
      {activeSubcats.length > 0 && (
        <div className="sticky top-[122px] md:top-[130px] z-20 bg-background/95 backdrop-blur-md border-b border-border/30">
          <div className="mx-auto max-w-7xl">
            <div className="flex gap-2 overflow-x-auto px-4 py-2.5 scrollbar-none items-center">
              <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 pr-1">
                {urlCategory}:
              </span>
              {activeSubcats.map((sub) => (
                <button
                  key={sub}
                  onClick={() => pushUrl({ category: sub })}
                  className="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold border border-border bg-card text-foreground hover:border-primary/50 hover:text-primary transition-all"
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-10 pb-24">

        {/* Mobile active filters */}
        {activeFilters.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-1.5 md:hidden">
            {activeFilters.map((f) => (
              <span key={f.key}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/60 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {f.label}
                <button onClick={f.clear} className="ml-0.5 rounded-full p-0.5 hover:bg-muted/80">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">

          {/* ── Desktop sidebar ─────────────────────────────────────────── */}
          <aside className="hidden md:block md:sticky md:top-[96px] md:self-start">
            <div className="rounded-2xl bg-card p-5">
              {SidebarContent}
            </div>
          </aside>

          {/* ── Products panel ──────────────────────────────────────────── */}
          <div>

            {/* Category tab bar — mobile only (desktop uses sidebar) */}
            <div className="md:hidden -mx-4 mb-3">
              <CategoryTabBar />
            </div>

            {/* Toolbar */}
            <div className="mb-6 flex items-center justify-between gap-3">
              {/* Mobile: Filters */}
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="flex items-center gap-2 rounded-md border border-border/50 bg-card px-3.5 py-2 text-sm font-semibold text-foreground md:hidden transition-all hover:border-border hover:shadow-sm"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {hasFilters && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[9px] font-black text-primary-foreground">
                    {activeFilters.length}
                  </span>
                )}
              </button>

              {/* Showing counter */}
              <p className="hidden text-[12px] text-muted-foreground md:block">
                {initialLoading ? (
                  <Skeleton className="h-4 w-44 rounded-lg" />
                ) : (
                  `Showing ${showingCount} of ${total}`
                )}
              </p>

              {/* Grid/List toggle */}
              <div className="ml-auto flex items-center rounded-md border border-border/50 bg-card p-1 gap-0.5">
                {(["grid", "list"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "rounded-lg p-1.5 transition-all duration-200",
                      viewMode === mode
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                    aria-label={mode === "grid" ? "Grid view" : "List view"}
                  >
                    {mode === "grid" ? <Grid3X3 className="h-4 w-4" /> : <List className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Skeleton */}
            {(initialLoading || isPending) && (
              <div className={viewMode === "grid" ? "grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-col gap-3"}>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} list={viewMode === "list"} />)}
              </div>
            )}

            {/* Products */}
            {!initialLoading && !isPending && (
              <>
                {products.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="mb-6 w-20 h-20 rounded-2xl bg-muted/50 border border-border/50 flex items-center justify-center">
                      <Package className="h-10 w-10 text-muted-foreground/25" />
                    </div>
                    <h2 className="text-xl font-black text-foreground mb-2">No gifts found</h2>
                    <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-7">
                      Try adjusting your filters or explore all our premium personalised gifts.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {hasFilters && (
                        <button
                          onClick={clearAllFilters}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#EF3752] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all"
                        >
                          <X className="h-4 w-4" /> Clear filters
                        </button>
                      )}
                      <Link
                        href="/b2c/products"
                        className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/60 active:scale-95 transition-all"
                      >
                        Browse all gifts
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    {viewMode === "grid" && (
                      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                        {products.map((p) => (
                          <ProductGridCard key={p.id} product={p} wishlisted={wishlist.has(p.id)} onWishlist={() => toggleWishlist(p.id)} />
                        ))}
                      </div>
                    )}
                    {viewMode === "list" && (
                      <div className="flex flex-col gap-3">
                        {products.map((p) => (
                          <ProductListCard key={p.id} product={p} wishlisted={wishlist.has(p.id)} onWishlist={() => toggleWishlist(p.id)} />
                        ))}
                      </div>
                    )}

                    {/* Infinite scroll footer */}
                    <div className="mt-10 flex flex-col items-center gap-3">
                      <p className="text-[12px] text-muted-foreground/60">
                        Showing <span className="font-bold text-foreground">{showingCount}</span> of{" "}
                        <span className="font-bold text-foreground">{total}</span> products
                      </p>
                      {/* Sentinel — IntersectionObserver triggers auto-load */}
                      {hasMore && (
                        <div ref={sentinelRef} className="w-full h-10 flex items-center justify-center">
                          {loadingMore && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <svg className="h-4 w-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              Loading more…
                            </div>
                          )}
                        </div>
                      )}
                      {!hasMore && products.length > 0 && (
                        <p className="text-[11px] text-muted-foreground/40 font-medium">You&apos;ve seen all products</p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile filter drawer ─────────────────────────────────────────── */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-background p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-black text-foreground">Filters & Sort</h2>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="h-8 w-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {SidebarContent}
            <button
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-6 w-full rounded-xl py-3 text-sm font-black text-white bg-[#EF3752] transition-all hover:opacity-90"
            >
              View {total} results
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile sticky filters button ─────────────────────────────────── */}
      <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 md:hidden">
        <button
          onClick={() => setMobileFiltersOpen(true)}
          className="flex items-center gap-2 rounded-full border border-border/50 bg-background/95 backdrop-blur-xl px-5 py-2.5 text-sm font-bold shadow-xl text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {hasFilters && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[9px] font-black text-primary-foreground">
              {activeFilters.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm text-muted-foreground/60">Loading products…</p>
      </div>
    }>
      <ProductsPageInner />
    </Suspense>
  );
}

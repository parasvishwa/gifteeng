"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Star, Users, Package, MapPin, CalendarDays,
  Heart, UserPlus, UserMinus, Loader2, Search,
  ShoppingCart, ChevronDown, SlidersHorizontal, X, ShoppingBag,
} from "lucide-react";

const B2C_TOKEN_KEY = "gifteeng.b2c.token";
const ITEMS_PER_PAGE = 20;
const PAGE_BG = "oklch(0.995 0.003 245)";

interface StoreProduct {
  sellerProductId: string;
  price: number;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  viewCount: number;
  product: {
    id: string;
    title: string;
    slug: string;
    category: string | null;
    images: { url: string; alt?: string }[];
    basePrice: number;
  };
}

interface StoreData {
  id: string;
  brandName: string;
  slug: string;
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  city: string | null;
  state: string | null;
  createdAt: string;
  productCount: number;
  totalSold: number;
  isFollowing: boolean;
  products: StoreProduct[];
}

// ── Wishlist cache ──────────────────────────────────────────────────────────
let cachedWishedIds: Set<string> | null = null;
let wishCachePromise: Promise<Set<string>> | null = null;

function fetchWishedIds(token: string): Promise<Set<string>> {
  if (cachedWishedIds) return Promise.resolve(cachedWishedIds);
  if (wishCachePromise) return wishCachePromise;
  wishCachePromise = fetch("/api/wishlist", { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => r.json() as Promise<{ productId: string }[]>)
    .then((data) => {
      const ids = new Set<string>(Array.isArray(data) ? data.map((d) => d.productId) : []);
      cachedWishedIds = ids;
      wishCachePromise = null;
      return ids;
    })
    .catch(() => { wishCachePromise = null; return new Set<string>(); });
  return wishCachePromise;
}

function invalidateWishCache() { cachedWishedIds = null; wishCachePromise = null; }

function plural(n: number, singular: string, pluralForm?: string) {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? singular : (pluralForm ?? singular + "s")}`;
}

const SORT_OPTIONS = [
  { v: "popular",    label: "Most viewed" },
  { v: "price-asc",  label: "Price: low to high" },
  { v: "price-desc", label: "Price: high to low" },
  { v: "rating",     label: "Top rated" },
];

const RATING_OPTIONS = [
  { v: 0, label: "All ratings" },
  { v: 4, label: "4★ and above" },
  { v: 3, label: "3★ and above" },
  { v: 2, label: "2★ and above" },
];

// ── Cover mosaic ────────────────────────────────────────────────────────────
function StoreCover({ products }: { products: StoreProduct[] }) {
  const images = products
    .filter((p) => p.product.images?.[0]?.url)
    .slice(0, 6)
    .map((p) => ({ url: p.product.images[0].url, title: p.product.title }));

  if (images.length === 0) {
    return (
      <div className="h-40 w-full" style={{
        background: "oklch(0.94 0.016 14)",
        backgroundImage: [
          "radial-gradient(circle at 20% 60%, oklch(0.89 0.030 14 / 0.55) 0%, transparent 55%)",
          "radial-gradient(circle at 78% 35%, oklch(0.96 0.012 30 / 0.65) 0%, transparent 50%)",
        ].join(", "),
      }} />
    );
  }

  const slots = [...images, ...Array<null>(6 - images.length).fill(null)];

  return (
    <div className="relative h-40 w-full overflow-hidden">
      <div className="grid h-full grid-cols-3 grid-rows-2 gap-px" style={{ background: "oklch(0.91 0.006 245)" }}>
        {slots.map((img, i) =>
          img ? (
            <div key={i} className="overflow-hidden" style={{ background: "oklch(0.96 0.004 245)" }}>
              <img src={img.url} alt={img.title} className="h-full w-full object-cover" loading="eager" />
            </div>
          ) : (
            <div key={i} style={{ background: "oklch(0.96 0.004 245)" }} />
          )
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
        style={{ background: `linear-gradient(to bottom, transparent, ${PAGE_BG})` }} />
    </div>
  );
}

// ── Product card ────────────────────────────────────────────────────────────
function ProductCard({
  sp, wished, inCart, onToggleWish,
}: {
  sp: StoreProduct;
  wished: boolean;
  inCart: boolean;
  onToggleWish: (productId: string, current: boolean) => void;
}) {
  const img = sp.product.images?.[0]?.url;
  const router = useRouter();

  const handleClick = () => {
    fetch(`/api/store/products/${sp.sellerProductId}/view`, { method: "POST" }).catch(() => {});
    router.push(`/b2c/products/${sp.product.slug}`);
  };

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-card transition-shadow duration-[220ms]"
      style={{ boxShadow: "0 1px 3px hsl(230 20% 0% / 0.08), 0 1px 6px -1px hsl(230 20% 0% / 0.06)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px -4px hsl(230 20% 0% / 0.14), 0 2px 8px -2px hsl(230 20% 0% / 0.10)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px hsl(230 20% 0% / 0.08), 0 1px 6px -1px hsl(230 20% 0% / 0.06)"; }}
      onClick={handleClick}
    >
      <div className="relative aspect-square overflow-hidden" style={{ background: "oklch(0.97 0.004 245)" }}>
        {img ? (
          <img src={img} alt={sp.product.title} loading="lazy"
            className="h-full w-full object-cover transition-transform duration-[350ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-[1.05]" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-10 w-10 text-muted-foreground/20" />
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onToggleWish(sp.product.id, wished); }}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 ${
            wished ? "bg-primary/15 text-primary" : "bg-white/85 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          }`}
        >
          <Heart className={`h-4 w-4 ${wished ? "fill-current" : ""}`} />
        </button>

        {inCart && (
          <span className="absolute left-2 top-2 z-10 flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-white">
            <ShoppingCart className="h-2.5 w-2.5" /> In cart
          </span>
        )}

        {sp.stock === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/65 backdrop-blur-[1px]">
            <span className="rounded-full bg-foreground/80 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white">Out of stock</span>
          </div>
        )}
      </div>

      <div className="px-3 pb-3 pt-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{sp.product.title}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[15px] font-black tabular-nums text-primary">₹{sp.price.toLocaleString("en-IN")}</span>
          {sp.ratingCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground">{sp.ratingAvg.toFixed(1)}</span>
              <span className="text-[10px]">({sp.ratingCount})</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar filter panel (desktop + mobile shared markup) ───────────────────
function FilterPanel({
  categories,
  category, setCategory,
  minPrice, setMinPrice,
  maxPrice, setMaxPrice,
  minRating, setMinRating,
  activeFilterCount,
  onClear,
}: {
  categories: string[];
  category: string; setCategory: (v: string) => void;
  minPrice: string; setMinPrice: (v: string) => void;
  maxPrice: string; setMaxPrice: (v: string) => void;
  minRating: number; setMinRating: (v: number) => void;
  activeFilterCount: number;
  onClear: () => void;
}) {
  const sectionHead = "mb-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-foreground";
  const divider = "my-4 border-t";

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13px] font-black text-foreground">Filters</span>
        {activeFilterCount > 0 && (
          <button onClick={onClear} className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline underline-offset-2">
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      {/* Category */}
      {categories.length > 1 && (
        <>
          <p className={sectionHead}>Category</p>
          <div className="space-y-1.5">
            {categories.map((c) => {
              const active = category === c;
              return (
                <label key={c} className="flex cursor-pointer items-center gap-2.5 py-0.5">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      active ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"
                    }`}
                    onClick={() => setCategory(c)}
                  >
                    {active && (
                      <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-white stroke-[1.5]">
                        <polyline points="1,4 4,7 9,1" />
                      </svg>
                    )}
                  </span>
                  <span
                    className={`text-[13px] transition-colors ${active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setCategory(c)}
                  >
                    {c === "all" ? "All" : c}
                  </span>
                </label>
              );
            })}
          </div>
          <div className={divider} style={{ borderColor: "oklch(0.92 0.006 245)" }} />
        </>
      )}

      {/* Price range */}
      <p className={sectionHead}>Price Range</p>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">₹</span>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Min"
            min={0}
            className="w-full rounded-lg border py-1.5 pl-6 pr-2 text-[12px] outline-none"
            style={{ borderColor: "oklch(0.90 0.006 245)", background: "oklch(1 0 0)" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "oklch(0.58 0.22 14 / 0.4)"; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "oklch(0.90 0.006 245)"; }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">to</span>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">₹</span>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Max"
            min={0}
            className="w-full rounded-lg border py-1.5 pl-6 pr-2 text-[12px] outline-none"
            style={{ borderColor: "oklch(0.90 0.006 245)", background: "oklch(1 0 0)" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "oklch(0.58 0.22 14 / 0.4)"; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = "oklch(0.90 0.006 245)"; }}
          />
        </div>
      </div>

      <div className={divider} style={{ borderColor: "oklch(0.92 0.006 245)" }} />

      {/* Rating */}
      <p className={sectionHead}>Rating</p>
      <div className="space-y-1.5">
        {RATING_OPTIONS.map((opt) => {
          const active = minRating === opt.v;
          return (
            <label key={opt.v} className="flex cursor-pointer items-center gap-2.5 py-0.5" onClick={() => setMinRating(opt.v)}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                active ? "border-primary" : "border-muted-foreground/30"
              }`}>
                {active && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className={`flex items-center gap-1 text-[13px] transition-colors ${active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {opt.v > 0 ? (
                  <>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {opt.label}
                  </>
                ) : opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function SellerStorePage() {
  const { slug } = useParams<{ slug: string }>();
  const router   = useRouter();

  const [store,   setStore]   = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  // Filter state
  const [search,    setSearch]    = useState("");
  const [sort,      setSort]      = useState("popular");
  const [category,  setCategory]  = useState("all");
  const [minPrice,  setMinPrice]  = useState("");
  const [maxPrice,  setMaxPrice]  = useState("");
  const [minRating, setMinRating] = useState(0);
  const [page,      setPage]      = useState(1);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Social state
  const [following,  setFollowing]  = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  // Wishlist + cart
  const [wishedIds, setWishedIds] = useState<Set<string>>(new Set());
  const [cartIds,   setCartIds]   = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Reset page when any filter changes
  useEffect(() => { setPage(1); }, [search, sort, category, minPrice, maxPrice, minRating]);

  // Load store
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem(B2C_TOKEN_KEY) : null;
    fetch(`/api/store/sellers/${slug}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => { if (!r.ok) throw new Error(); return r.json() as Promise<StoreData>; })
      .then((data) => {
        if (!mountedRef.current) return;
        setStore(data);
        setFollowing(data.isFollowing);
        setLoading(false);
      })
      .catch(() => { if (mountedRef.current) { setError(true); setLoading(false); } });
  }, [slug]);

  // Load wishlist + cart
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem(B2C_TOKEN_KEY) : null;
    if (!token) return;
    fetchWishedIds(token).then((ids) => { if (mountedRef.current) setWishedIds(new Set(ids)); });
    fetch("/api/cart", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { items?: { productId: string }[] } | null) => {
        if (!mountedRef.current || !data?.items) return;
        setCartIds(new Set(data.items.map((i) => i.productId)));
      })
      .catch(() => {});
  }, []);

  const toggleFollow = useCallback(async () => {
    const token = localStorage.getItem(B2C_TOKEN_KEY);
    if (!token) { router.push("/auth?next=" + encodeURIComponent(window.location.pathname)); return; }
    setFollowBusy(true);
    try {
      const res = await fetch(`/api/store/sellers/${slug}/follow`, {
        method: following ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFollowing((f) => !f);
        setStore((s) => s ? { ...s, followerCount: s.followerCount + (following ? -1 : 1) } : s);
      }
    } finally { setFollowBusy(false); }
  }, [slug, following, router]);

  const toggleWish = useCallback(async (productId: string, current: boolean) => {
    const token = localStorage.getItem(B2C_TOKEN_KEY);
    if (!token) { router.push("/auth"); return; }
    setWishedIds((prev) => { const n = new Set(prev); current ? n.delete(productId) : n.add(productId); return n; });
    invalidateWishCache();
    try {
      if (!current) {
        await fetch("/api/wishlist", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });
      } else {
        await fetch(`/api/wishlist/${productId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      }
    } catch {
      setWishedIds((prev) => { const n = new Set(prev); current ? n.add(productId) : n.delete(productId); return n; });
    }
  }, [router]);

  // ── Loading / error ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: PAGE_BG }}>
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: PAGE_BG }}>
        <ShoppingBag className="h-14 w-14 text-muted-foreground/20" />
        <p className="text-lg font-black text-foreground">Store not found</p>
        <p className="text-sm text-muted-foreground">This seller store doesn&apos;t exist or has been removed.</p>
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const initials = store.brandName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const sellerSince = new Date(store.createdAt).getFullYear();

  const categories = ["all", ...Array.from(
    new Set(store.products.map((p) => p.product.category).filter(Boolean) as string[])
  )];

  // Price bounds for placeholder hints
  const prices = store.products.map((p) => p.price);
  const priceMin = prices.length ? Math.min(...prices) : 0;
  const priceMax = prices.length ? Math.max(...prices) : 0;

  // Apply all filters
  const filtered = store.products
    .filter((p) => {
      const q = search.toLowerCase();
      const mn = minPrice ? Number(minPrice) : 0;
      const mx = maxPrice ? Number(maxPrice) : Infinity;
      return (
        (!q || p.product.title.toLowerCase().includes(q) || p.product.category?.toLowerCase().includes(q)) &&
        (category === "all" || p.product.category === category) &&
        p.price >= mn &&
        p.price <= mx &&
        (minRating === 0 || p.ratingAvg >= minRating)
      );
    })
    .sort((a, b) => {
      if (sort === "price-asc")  return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      if (sort === "rating")     return b.ratingAvg - a.ratingAvg;
      return b.viewCount - a.viewCount;
    });

  const totalFiltered = filtered.length;
  const visible = filtered.slice(0, page * ITEMS_PER_PAGE);
  const hasMore = visible.length < totalFiltered;

  const activeFilterCount =
    (category !== "all" ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (minRating > 0 ? 1 : 0);

  const clearFilters = () => {
    setCategory("all");
    setMinPrice("");
    setMaxPrice("");
    setMinRating(0);
    setSearch("");
  };

  const filterPanelProps = {
    categories,
    category, setCategory,
    minPrice, setMinPrice,
    maxPrice, setMaxPrice,
    minRating, setMinRating,
    activeFilterCount,
    onClear: clearFilters,
  };

  return (
    <div className="min-h-screen" style={{ background: PAGE_BG }}>

      {/* ── Cover ────────────────────────────────────────────────────────── */}
      <StoreCover products={store.products} />

      {/* ── Store identity ────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4">
        <div className="relative -mt-8 mb-1 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {/* Avatar overlaps cover */}
            <div
              className="relative z-10 flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-lg font-black text-primary"
              style={{ background: "oklch(0.95 0.020 14)", boxShadow: `0 0 0 4px ${PAGE_BG}` }}
            >
              {initials}
            </div>

            {/* Name + stats below cover */}
            <div className="mt-10">
              <h1 className="text-[19px] font-black leading-tight tracking-tight text-foreground">
                {store.brandName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                {store.ratingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="font-bold text-foreground">{store.ratingAvg.toFixed(1)}</span>
                    <span>({store.ratingCount.toLocaleString("en-IN")} ratings)</span>
                  </span>
                )}
                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{plural(store.followerCount, "follower")}</span>
                <span className="flex items-center gap-1"><Package className="h-3 w-3" />{plural(store.productCount, "product")}</span>
                {(store.city || store.state) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{[store.city, store.state].filter(Boolean).join(", ")}
                  </span>
                )}
                <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />Since {sellerSince}</span>
              </div>
            </div>
          </div>

          {/* Follow button */}
          <button
            onClick={toggleFollow}
            disabled={followBusy}
            className={`mt-10 flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition-all duration-150 active:scale-[0.97] ${
              following
                ? "border border-border bg-card text-foreground hover:bg-muted/50"
                : "bg-primary text-white hover:opacity-90"
            }`}
          >
            {followBusy ? <Loader2 className="h-4 w-4 animate-spin" /> :
              following ? <><UserMinus className="h-4 w-4" /><span className="hidden sm:inline">Following</span></> :
                          <><UserPlus className="h-4 w-4" /><span className="hidden sm:inline">Follow</span></>}
          </button>
        </div>

        <div className="mb-0 mt-4 border-t" style={{ borderColor: "oklch(0.92 0.006 245)" }} />
      </div>

      {/* ── Products section ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="flex gap-6">

          {/* ── Desktop sidebar ─────────────────────────────────────────── */}
          <aside className="hidden w-56 shrink-0 md:block">
            {/* Search */}
            <div className="relative mb-5">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-xl border py-2 pl-8 pr-3 text-[13px] outline-none transition-colors"
                style={{ borderColor: "oklch(0.90 0.006 245)", background: "oklch(1 0 0)" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "oklch(0.58 0.22 14 / 0.4)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "oklch(0.90 0.006 245)"; }}
              />
            </div>

            <FilterPanel {...filterPanelProps} />
          </aside>

          {/* ── Main content ────────────────────────────────────────────── */}
          <div className="min-w-0 flex-1">

            {/* Section header + sort row */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-black text-foreground">All Products</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {totalFiltered === store.productCount
                    ? plural(store.productCount, "product")
                    : `${totalFiltered.toLocaleString("en-IN")} of ${plural(store.productCount, "product")}`}
                  {activeFilterCount > 0 && " filtered"}
                </p>
              </div>

              {/* Sort — desktop right-aligned */}
              <div className="relative hidden shrink-0 md:block">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="appearance-none rounded-xl border py-1.5 pl-3 pr-7 text-[12px] font-semibold outline-none"
                  style={{ borderColor: "oklch(0.88 0.006 245)", background: "oklch(1 0 0)" }}
                >
                  {SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Mobile: search + filter toggle + sort */}
            <div className="mb-4 space-y-2 md:hidden">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search in this store…"
                  className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none"
                  style={{ borderColor: "oklch(0.90 0.006 245)", background: "oklch(1 0 0)" }}
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowMobileFilters((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    showMobileFilters || activeFilterCount > 0
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-foreground hover:bg-muted/50"
                  }`}
                  style={{ borderColor: showMobileFilters || activeFilterCount > 0 ? undefined : "oklch(0.88 0.006 245)" }}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <div className="relative ml-auto">
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="appearance-none rounded-xl border py-1.5 pl-3 pr-7 text-[12px] font-semibold outline-none"
                    style={{ borderColor: "oklch(0.88 0.006 245)", background: "oklch(1 0 0)" }}
                  >
                    {SORT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              {/* Mobile filter panel (expandable) */}
              {showMobileFilters && (
                <div className="rounded-2xl border p-4" style={{ borderColor: "oklch(0.90 0.006 245)", background: "oklch(1 0 0)" }}>
                  <FilterPanel {...filterPanelProps} />
                </div>
              )}
            </div>

            {/* Product grid */}
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                <Package className="h-14 w-14 text-muted-foreground/20" />
                <p className="font-semibold text-foreground">No products match your filters</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="text-sm font-semibold text-primary hover:underline underline-offset-2">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  {visible.map((sp) => (
                    <ProductCard
                      key={sp.sellerProductId}
                      sp={sp}
                      wished={wishedIds.has(sp.product.id)}
                      inCart={cartIds.has(sp.product.id)}
                      onToggleWish={toggleWish}
                    />
                  ))}
                </div>

                {/* Load more */}
                {hasMore && (
                  <div className="mt-8 flex flex-col items-center gap-2">
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-full border px-6 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-muted/50 active:scale-[0.97]"
                      style={{ borderColor: "oklch(0.88 0.006 245)" }}
                    >
                      Load more ({(totalFiltered - visible.length).toLocaleString("en-IN")} remaining)
                    </button>
                    <p className="text-[11px] text-muted-foreground">
                      Showing {visible.length} of {totalFiltered.toLocaleString("en-IN")}
                    </p>
                  </div>
                )}
              </>
            )}

            {store.totalSold > 0 && (
              <p className="mt-10 text-center text-xs text-muted-foreground">
                {store.totalSold.toLocaleString("en-IN")} orders delivered from this store
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

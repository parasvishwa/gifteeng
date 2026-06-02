"use client";

import { ShoppingBag, Heart, Eye, Wand2, Bell, Flame, Sparkles, Trophy, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiB2c, getB2cToken } from "@/lib/api";
import { SameDayBadge } from "../SameDayBadge";

interface ProductCardProps {
  name: string;
  image: string;
  price: number;
  originalPrice?: number;
  customizable?: boolean;
  onCustomize?: () => void;
  productId?: string;
  slug?: string;
  /** When passed explicitly (e.g. from wishlist page), skip the self-fetch */
  isWished?: boolean;
  /** Legacy callback — still honoured but the card now manages its own state */
  onToggleWish?: (e: React.MouseEvent) => void;
  description?: string;
  rating?: number;
  reviews?: number;
  /** Stock count — shows "X left" urgency badge when 1–5 */
  inventory?: number;
  /** Promo badge label e.g. "Top Rated", "New", "Best Seller" */
  badge?: string;
  /** Created date ISO string — used to auto-detect "New" */
  createdAt?: string;
  /** Total variant count from API `_count.variantOptions` */
  variants?: number;
  /** All product images for mobile swipe */
  images?: string[];
  /** Total orders for this product — shown as social proof "X sold" */
  soldCount?: number | null;
  /** Average rating 1-5 (1 decimal) */
  ratingAvg?: number | null;
}

// ─── Lightweight wishlist hook ────────────────────────────────────────────────
// A module-level cache so all cards on the same page share one fetch.
let cachedWishedIds: Set<string> | null = null;
let cachePromise: Promise<Set<string>> | null = null;

function fetchWishedIds(): Promise<Set<string>> {
  if (cachedWishedIds) return Promise.resolve(cachedWishedIds);
  if (cachePromise) return cachePromise;

  type WishlistEntry = { productId: string };

  cachePromise = apiB2c()
    .get<WishlistEntry[]>("/api/wishlist")
    .then((data) => {
      const ids = new Set<string>(
        Array.isArray(data) ? data.map((d) => d.productId) : [],
      );
      cachedWishedIds = ids;
      cachePromise = null;
      return ids;
    })
    .catch(() => {
      cachePromise = null;
      return new Set<string>();
    });

  return cachePromise;
}

function invalidateWishCache() {
  cachedWishedIds = null;
  cachePromise = null;
}

// ─── Component ────────────────────────────────────────────────────────────────
const ProductCard = ({
  name,
  image,
  price,
  originalPrice,
  customizable = true,
  onCustomize,
  productId,
  slug,
  isWished: isWishedProp,
  onToggleWish,
  description,
  rating,
  reviews,
  inventory,
  badge,
  createdAt,
  variants,
  images,
  soldCount,
  ratingAvg,
}: ProductCardProps) => {
  const router = useRouter();
  const discount =
    originalPrice && originalPrice > price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

  // Derive auto-badge when no explicit one is passed
  const autoBadge = badge ?? (() => {
    if (typeof inventory === "number" && inventory === 0) return "Sold Out";
    if (createdAt) {
      const ageDays = (Date.now() - Date.parse(createdAt)) / 86_400_000;
      if (ageDays >= 0 && ageDays <= 30) return "New";
    }
    return undefined;
  })();
  const lowStock = typeof inventory === "number" && inventory > 0 && inventory <= 5;
  const [quickView, setQuickView] = useState(false);

  // Image swipe state
  const allImages = images && images.length > 0 ? images : [image];
  const [imgIdx, setImgIdx] = useState(0);
  const touchStartX = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 25) {
      setImgIdx((i) => Math.max(0, Math.min(allImages.length - 1, i + (dx < 0 ? 1 : -1))));
    }
  };

  const currentImage = allImages[imgIdx] ?? image;

  // Wishlist state — uses prop when provided (e.g. wishlist page), otherwise
  // self-fetches once on mount.
  const [wished, setWished] = useState<boolean>(isWishedProp ?? false);
  const [wishBusy, setWishBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // If the parent explicitly passed isWished, respect it.
    if (isWishedProp !== undefined) {
      setWished(isWishedProp);
      return;
    }
    // Only fetch if logged in and we have a productId.
    if (!productId || !getB2cToken()) return;
    void fetchWishedIds().then((ids) => {
      if (mountedRef.current) setWished(ids.has(productId));
    });
  }, [productId, isWishedProp]);

  const handleToggleWish = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Legacy callback path
    if (onToggleWish) {
      onToggleWish(e);
      return;
    }

    if (!productId) return;

    // Redirect if not logged in
    if (!getB2cToken()) {
      router.push("/auth");
      return;
    }

    const next = !wished;
    setWished(next); // optimistic
    setWishBusy(true);
    invalidateWishCache();

    try {
      if (next) {
        await apiB2c().post("/api/wishlist", { productId });
      } else {
        await apiB2c().delete(`/api/wishlist/${productId}`);
      }
    } catch {
      // Revert on failure
      if (mountedRef.current) setWished(!next);
    } finally {
      if (mountedRef.current) setWishBusy(false);
    }
  };

  const showHeartButton = Boolean(productId);

  const handleCardClick = () => {
    if (onCustomize) { onCustomize(); return; }
    if (slug) { router.push(`/products/${slug}`); return; }
    if (productId) { router.push(`/customize/${productId}`); }
  };

  return (
    <>
      <div className="card-product group cursor-pointer h-full flex flex-col focus-within:ring-1 focus-within:ring-primary/30" onClick={handleCardClick} role="article">
        <div
          className="aspect-square overflow-hidden bg-muted/30 relative"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {currentImage ? (
            <img
              src={typeof currentImage === "string" && currentImage.includes('unsplash.com') ? `${currentImage}&w=400&q=75` : (typeof currentImage === "string" ? currentImage : "")}
              alt={name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-[350ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105"
              width={400}
              height={400}
            />
          ) : (
            /* Gradient placeholder when no product image is available */
            <div className="w-full h-full flex flex-col items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #fff5f7 0%, #ffe8ee 50%, #ffd6e0 100%)" }}>
              <span className="text-5xl opacity-40">🎁</span>
              <span className="text-[9px] font-semibold text-rose-300 tracking-wide uppercase">No Image</span>
            </div>
          )}
          {/* Badge rail — top-left. SVG icons only, no emoji (UI/UX Pro Max rule) */}
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
            {discount > 0 && (
              <span className="bg-[#EF3752] text-white text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-wide shadow-sm">
                {discount}% OFF
              </span>
            )}
            {autoBadge && autoBadge !== "Sold Out" && (
              <span className={`inline-flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm ${
                autoBadge === "New"         ? "bg-emerald-500 text-white" :
                autoBadge === "Top Rated"  ? "bg-amber-500 text-white" :
                autoBadge === "Best Seller"? "bg-amber-400 text-white" :
                "bg-primary text-white"
              }`}>
                {autoBadge === "New"        ? <Sparkles className="w-2.5 h-2.5" aria-hidden /> :
                 autoBadge === "Top Rated"  ? <Trophy   className="w-2.5 h-2.5" aria-hidden /> :
                 null}
                {autoBadge}
              </span>
            )}
            {/* Low-stock urgency badge */}
            {lowStock && (
              <span className="inline-flex items-center gap-0.5 bg-orange-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm">
                <Flame className="w-2.5 h-2.5" aria-hidden />
                {inventory} left
              </span>
            )}
          </div>

          {/* Wishlist heart — 44×44 touch target (UI/UX Pro Max §2 critical) */}
          {showHeartButton && (
            <button
              onClick={(e) => { void handleToggleWish(e); }}
              disabled={wishBusy}
              className={`absolute top-1 right-1 z-10 w-11 h-11 rounded-full flex items-center justify-center transition-[background-color,transform,color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-90 disabled:opacity-60 cursor-pointer ${
                wished
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary"
              }`}
              aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart className={`w-4 h-4 drop-shadow-sm ${wished ? "fill-current" : "fill-none stroke-current [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.3))]"}`} />
            </button>
          )}

          {/* Quick View button — appears on hover (desktop only) */}
          <button
            onClick={(e) => { e.stopPropagation(); setQuickView(true); }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card/95 backdrop-blur-xl text-foreground text-[10px] font-semibold px-3 py-1.5 rounded-full shadow-lg border border-border/20 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-[opacity,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hidden md:flex items-center gap-1.5 hover:bg-card active:scale-95"
          >
            <Eye className="w-3 h-3" /> Quick View
          </button>

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

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
        </div>
        {/* ── Info area — reordered to match mobile design ─────────────────
           Order: Price+CTA row (top) → Title → Rating → Variation pill.
           Matches HomeProductCard in apps/mobile/.../home_product_card.dart */}
        <div className="p-2.5 md:p-3 flex flex-col flex-1 gap-1.5">
          {/* Price (left) + ADD / CUSTOMISE / NOTIFY button (right) */}
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
              <span className="text-[#EF3752] font-black text-base md:text-lg tracking-tight leading-none">
                ₹{price}
              </span>
              {originalPrice != null && originalPrice > 0 && originalPrice > price && (
                <>
                  <span className="text-muted-foreground text-[10px] md:text-[11px] line-through">
                    ₹{originalPrice}
                  </span>
                  <span className="text-[9px] font-bold text-emerald-600 hidden md:inline">
                    {Math.round((1 - price / originalPrice) * 100)}% off
                  </span>
                </>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
              className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black tracking-wide
                          inline-flex items-center gap-1
                          transition-[background-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]
                          active:scale-95 shadow-sm
                          ${inventory === 0
                            ? "bg-foreground text-background"
                            : "bg-[#EF3752] text-white hover:opacity-90"}`}
            >
              {inventory === 0
                ? <><Bell className="w-3 h-3" /> NOTIFY</>
                : customizable
                  ? <><Wand2 className="w-3 h-3" /> CUSTOMISE</>
                  : <><ShoppingBag className="w-3 h-3" /> ADD</>}
            </button>
          </div>

          {/* Title — Rubik for Vibrant energy, 2 lines max */}
          <h3 className="font-display font-semibold text-foreground text-[11.5px] md:text-[13px] leading-snug line-clamp-2 tracking-tight">
            {name}
          </h3>

          {/* Same-day delivery badge (Mumbai metro only) */}
          <SameDayBadge />

          {/* Rating + sold count */}
          {(ratingAvg != null || (soldCount != null && soldCount > 0)) && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground leading-none">
              {ratingAvg != null && (
                <span className="font-bold text-amber-500">★ {ratingAvg.toFixed(1)}</span>
              )}
              {soldCount != null && soldCount > 0 && (
                <>
                  {ratingAvg != null && <span className="opacity-40">·</span>}
                  <span>{soldCount.toLocaleString("en-IN")} sold</span>
                </>
              )}
            </div>
          )}

          {/* Variation pill — small badge with N options. Lucide icon, no emoji */}
          {variants !== undefined && variants > 1 && (
            <div className="inline-flex self-start items-center gap-1 px-1.5 py-0.5 rounded
                            bg-muted/60 border border-border/40 text-[9.5px]
                            font-bold text-foreground/75">
              <Palette className="w-2.5 h-2.5 shrink-0" aria-hidden />
              {variants} options
            </div>
          )}
        </div>
      </div>

      {/* Quick View Modal */}
      {quickView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setQuickView(false)}
        >
          <div
            className="relative bg-card rounded-xl shadow-2xl border border-border/20 max-w-lg w-[92vw] overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setQuickView(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-muted/80 backdrop-blur-md flex items-center justify-center text-foreground transition-[background-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-muted active:scale-90"
            >
              ✕
            </button>

            <div className="flex flex-col sm:flex-row">
              {/* Image */}
              <div className="sm:w-1/2 aspect-square bg-muted overflow-hidden">
                <img src={image} alt={name} className="w-full h-full object-contain" />
              </div>

              {/* Info */}
              <div className="sm:w-1/2 p-5 sm:p-6 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <h3 className="font-display font-bold text-base sm:text-lg leading-tight tracking-tight text-foreground">{name}</h3>

                  {rating != null && reviews != null && reviews > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-success/10 text-success px-2 py-0.5 rounded-full flex items-center gap-1">
                        ★ {rating}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">{reviews} reviews</span>
                    </div>
                  )}

                  {/* Price */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-display font-black text-foreground tracking-tight">₹{price}</span>
                    {originalPrice != null && originalPrice > price && (
                      <>
                        <span className="text-xs text-muted-foreground/40 line-through">₹{originalPrice}</span>
                        {discount > 0 && (
                          <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
                            {discount}% OFF
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {description && (
                    <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-3">{description}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => { setQuickView(false); handleCardClick(); }}
                    className="w-full btn-primary flex items-center justify-center gap-2 text-xs py-3 font-bold rounded-xl shadow-[0_6px_20px_-4px_hsl(var(--primary)/0.3)]"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    {customizable ? "Customize & Buy" : "View Product"}
                  </button>
                  <p className="text-[9px] text-center text-muted-foreground/40">Free delivery · Easy returns</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProductCard;

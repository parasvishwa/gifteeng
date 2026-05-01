"use client";

import { ShoppingBag, Heart, Eye, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiB2c, getB2cToken } from "@/lib/api";

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
    if (slug) { router.push(`/p/${slug}`); return; }
    if (productId) { router.push(`/customize/${productId}`); }
  };

  return (
    <>
      <div className="card-product group cursor-pointer h-full flex flex-col" onClick={handleCardClick}>
        <div
          className="aspect-square overflow-hidden bg-muted/30 relative"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <img
            src={typeof currentImage === "string" && currentImage.includes('unsplash.com') ? `${currentImage}&w=400&q=75` : (typeof currentImage === "string" ? currentImage : "")}
            alt={name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-108"
            width={400}
            height={400}
          />
          {/* Badge rail — top-left */}
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
            {discount > 0 && (
              <span className="bg-[#EF3752] text-white text-[8px] font-black px-1.5 py-0.5 rounded-full tracking-wide shadow-sm">
                {discount}% OFF
              </span>
            )}
            {autoBadge && autoBadge !== "Sold Out" && (
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm ${
                autoBadge === "New" ? "bg-emerald-100 text-emerald-700" :
                autoBadge === "Top Rated" ? "bg-amber-100 text-amber-700" :
                autoBadge === "Best Seller" ? "bg-amber-50 text-amber-800" :
                "bg-primary/10 text-primary"
              }`}>
                {autoBadge === "New" ? "✨ " : autoBadge === "Top Rated" ? "🏆 " : ""}{autoBadge}
              </span>
            )}
            {/* Low-stock urgency badge */}
            {lowStock && (
              <span className="bg-orange-50 text-orange-600 border border-orange-200 text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
                🔥 {inventory} left
              </span>
            )}
          </div>

          {/* Wishlist heart — always shown when productId present */}
          {showHeartButton && (
            <button
              onClick={(e) => { void handleToggleWish(e); }}
              disabled={wishBusy}
              className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-60 ${
                wished
                  ? "bg-primary/15 text-primary"
                  : "bg-background/70 text-muted-foreground hover:text-primary hover:bg-primary/10"
              }`}
              aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            >
              <Heart className={`w-3.5 h-3.5 ${wished ? "fill-current" : ""}`} />
            </button>
          )}

          {/* Quick View button — appears on hover (desktop only) */}
          <button
            onClick={(e) => { e.stopPropagation(); setQuickView(true); }}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-xl text-foreground text-[10px] font-semibold px-3 py-1.5 rounded-full shadow-lg border border-border/20 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hidden md:flex items-center gap-1.5 hover:bg-card hover:scale-105"
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
        <div className="p-2.5 md:p-3.5 flex flex-col flex-1 gap-1">
          <h3 className="font-body font-medium text-foreground text-[11px] md:text-[13px] leading-snug line-clamp-2">{name}</h3>
          <div className="flex items-baseline gap-1.5 mt-auto">
            <span className="text-foreground font-bold text-sm md:text-base tracking-tight">₹{price}</span>
            {originalPrice != null && originalPrice > 0 && originalPrice > price && (
              <span className="text-muted-foreground text-[9px] md:text-[10px] line-through">₹{originalPrice}</span>
            )}
          </div>
          {/* ADD button — desktop only. On mobile the whole card is tappable so
              we skip this button to avoid an accidental double-action tap. */}
          <button
            onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
            className="hidden md:flex w-full rounded-xl border-2 border-[#EF3752] text-[#EF3752] bg-white font-black text-[11px] py-2 transition-all duration-200 hover:bg-[#EF3752] hover:text-white items-center justify-center gap-1.5 mt-1 active:scale-95"
          >
            {customizable
              ? <><Wand2 className="w-3.5 h-3.5" /> Customise</>
              : <><ShoppingBag className="w-3.5 h-3.5" /> ADD</>
            }
          </button>
          {variants !== undefined && variants > 1 && (
            <p className="text-center text-[9px] text-muted-foreground leading-none mt-0.5">
              {variants} options
            </p>
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
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-muted/80 backdrop-blur-md flex items-center justify-center text-foreground hover:bg-muted transition-colors hover:scale-110"
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
                    className="w-full btn-primary flex items-center justify-center gap-2 text-xs py-3 font-bold rounded-xl shadow-[0_6px_20px_-4px_hsl(var(--primary)/0.3)] hover:-translate-y-0.5 transition-all duration-300"
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

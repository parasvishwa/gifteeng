"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Share2,
  Dot,
  ChevronLeft,
  ChevronRight,
  Heart,
  ShoppingCart,
  Zap,
  AlertTriangle,
  Wand2,
  Check,
} from "lucide-react";
import { useCartStore } from "@/lib/stores/cart";
import { apiB2c } from "@/lib/api";
import MultiVariantGrid from "./MultiVariantGrid";
import { PincodeChecker } from "./PincodeChecker";
import { SellerPicker, type SellerOffer } from "./SellerPicker";
import { ProductBadges } from "../../_components/ProductBadges";

// If any variant option group has at least this many values, render the
// Amazon-style grid picker instead of the pills.
const GRID_THRESHOLD = 12;
import type { Product } from "./page";

// ── Auto-generated variant thumbnail ──────────────────────────────────────
// When a ProductVariantOption has no uploaded image, we render a stylish
// "name card" SVG as a data-URL so every variant has a visual. Colors are
// deterministically hashed from the value so the same name always gets the
// same colour — e.g. "America" stays blue-red, "New York" stays purple.
const VARIANT_PALETTES: [string, string][] = [
  ["#ec4899", "#a855f7"], // pink → purple
  ["#f59e0b", "#ef4444"], // amber → red
  ["#06b6d4", "#8b5cf6"], // cyan → violet
  ["#10b981", "#059669"], // emerald
  ["#f97316", "#facc15"], // orange → gold
  ["#3b82f6", "#1d4ed8"], // blue
  ["#db2777", "#be185d"], // rose
  ["#14b8a6", "#0ea5e9"], // teal → sky
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function autoVariantThumb(value: string): string {
  const safe = (value || "?").trim();
  const [c1, c2] = VARIANT_PALETTES[hashCode(safe) % VARIANT_PALETTES.length]!;
  // Show only initials — the variant name is already rendered as the label
  // below the thumbnail, so repeating it inside the card is redundant.
  const initials = safe
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || safe.slice(0, 2).toUpperCase();
  const fontSize = initials.length === 1 ? 90 : 74;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="h" cx="30%" cy="25%" r="60%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="160" height="160" rx="16" fill="url(#g)"/>
  <rect width="160" height="160" rx="16" fill="url(#h)"/>
  <text x="80" y="96" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="${fontSize}" font-weight="900" fill="rgba(255,255,255,0.98)" style="letter-spacing:-3px">${initials}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function Toast({ visible }: { visible: boolean }) {
  return (
    <div
      aria-live="polite"
      className={
        "pointer-events-none fixed left-1/2 top-5 z-50 -translate-x-1/2 transition-all duration-300 " +
        (visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-4 opacity-0")
      }
    >
      <div className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
        <span>Added to cart</span>
        <span>✓</span>
      </div>
    </div>
  );
}

// ── Variant option group ────────────────────────────────────────────────────

const DESKTOP_PER_ROW = 5;
const DESKTOP_MAX_ROWS = 3;
const DESKTOP_PAGE_SIZE = DESKTOP_PER_ROW * DESKTOP_MAX_ROWS; // 15 items per page
const MOBILE_INITIAL = 4;

interface VariantOpt { value: string; image?: string; priceDelta?: number; inventory?: number }

function VariantOptionGroup({
  group, opts, selected, currencySymbol, onSelect,
}: {
  group: string;
  opts: VariantOpt[];
  selected: string | undefined;
  currencySymbol: string;
  onSelect: (val: string) => void;
}) {
  const [desktopPage, setDesktopPage] = useState(0);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const totalDesktopPages = Math.ceil(opts.length / DESKTOP_PAGE_SIZE);
  const desktopItems = opts.slice(
    desktopPage * DESKTOP_PAGE_SIZE,
    (desktopPage + 1) * DESKTOP_PAGE_SIZE,
  );
  const mobileItems = mobileExpanded ? opts : opts.slice(0, MOBILE_INITIAL);

  const label = group.charAt(0).toUpperCase() + group.slice(1);

  function OptionBtn({ opt, isMobile }: { opt: VariantOpt; isMobile: boolean }) {
    const active = selected === opt.value;
    // Auto-generate a stylish named card when no image is uploaded so every
    // variant has a visual thumbnail (fixes "America/New York text-only" UX).
    // Falls back through: explicit image → first image in images[] → auto-card.
    const thumb = opt.image ?? autoVariantThumb(opt.value);
    return (
      <button
        type="button"
        title={opt.value}
        onClick={() => onSelect(opt.value)}
        className={`group relative flex flex-col items-center gap-0.5 rounded-md border-2 p-0.5 [transition:border-color_150ms_cubic-bezier(0.23,1,0.32,1),transform_150ms_cubic-bezier(0.23,1,0.32,1)] focus:outline-none w-full active:scale-[0.97] ${
          active
            ? "border-primary scale-[1.03]"
            : "border-border hover:border-primary/50"
        }`}
      >
        <div className={`relative overflow-hidden rounded bg-muted ${isMobile ? "w-full aspect-square" : "w-full aspect-square"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumb}
            alt={opt.value}
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          {active && (
            <span className="absolute inset-0 bg-primary/10 flex items-center justify-center">
              <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            </span>
          )}
        </div>
        <span className={`text-center leading-tight truncate w-full px-0.5 py-0.5 ${isMobile ? "text-[10px]" : "text-[11px]"} ${active ? "font-semibold text-primary" : "text-foreground/80"}`}>
          {opt.value}
          {opt.priceDelta ? (
            <span className="ml-1 text-[9px] text-muted-foreground">{currencySymbol}{opt.priceDelta}</span>
          ) : null}
        </span>
      </button>

    );
  }

  return (
    <div>
      {/* Label */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {selected && (
          <span className="text-xs text-muted-foreground">
            — <span className="font-medium text-foreground">{selected}</span>
          </span>
        )}
      </div>

      {/* Desktop grid (≥ md) */}
      <div className="hidden md:block">
        <div className="grid gap-1.5 grid-cols-5">
          {desktopItems.map((opt) => (
            <OptionBtn key={opt.value} opt={opt} isMobile={false} />
          ))}
        </div>
        {totalDesktopPages > 1 && (
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => setDesktopPage((p) => Math.max(0, p - 1))}
              disabled={desktopPage === 0}
              className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-muted-foreground">
              {desktopPage + 1} / {totalDesktopPages}
            </span>
            <button
              type="button"
              onClick={() => setDesktopPage((p) => Math.min(totalDesktopPages - 1, p + 1))}
              disabled={desktopPage === totalDesktopPages - 1}
              className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-all"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Mobile grid (< md) */}
      <div className="md:hidden">
        <div className="grid grid-cols-4 gap-1.5">
          {mobileItems.map((opt) => (
            <OptionBtn key={opt.value} opt={opt} isMobile={true} />
          ))}
        </div>
        {!mobileExpanded && opts.length > MOBILE_INITIAL && (
          <button
            type="button"
            onClick={() => setMobileExpanded(true)}
            className="mt-2.5 w-full rounded-lg bg-muted border border-border py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            View All ({opts.length} options)
          </button>
        )}
        {mobileExpanded && opts.length > MOBILE_INITIAL && (
          <button
            type="button"
            onClick={() => setMobileExpanded(false)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

// ── Bullets "Why you'll love it" with View More toggle ────────────────────
const BULLETS_PREVIEW = 3;
function BulletsSection({ bullets }: { bullets: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? bullets : bullets.slice(0, BULLETS_PREVIEW);
  const extra = bullets.length - BULLETS_PREVIEW;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground mb-3">
        Why you&apos;ll love it
      </p>
      <ul className="space-y-2.5">
        {visible.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-foreground/90">
            <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center bg-primary">
              <Check size={10} strokeWidth={3} className="text-white" />
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 w-full text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? "Show less ↑" : `View ${extra} more ↓`}
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ProductDetailClient({ product }: { product: Product }) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  // Variant + quantity
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // Marketplace — the seller offer the buyer picked (null = house product).
  const [sellerOffer, setSellerOffer] = useState<SellerOffer | null>(null);

  // Fire product_view analytics once per mount + track for personalised
  // recommendations on the homepage (anonymous-friendly localStorage).
  useEffect(() => {
    const slug = (product as { slug?: string }).slug;
    if (typeof window !== "undefined" && window.gifteengTrack) {
      window.gifteengTrack("product_view", {
        productId: product.id,
        title:     product.title,
        slug,
      });
    }
    if (slug) {
      // Lazy import to avoid pulling localStorage util into SSR bundles.
      import("@/lib/viewHistory").then((m) => m.trackView(slug)).catch(() => { /* ignore */ });
    }
  }, [product.id, product.title]);

  // Wishlist
  const [wished, setWished] = useState(false);
  const [wishBusy, setWishBusy] = useState(false);
  useEffect(() => {
    apiB2c()
      .get<{ productId: string }[]>("/api/wishlist")
      .then((data) => {
        if (Array.isArray(data)) {
          setWished(data.some((d) => d.productId === product.id));
        }
      })
      .catch(() => {});
  }, [product.id]);
  const toggleWishlist = useCallback(async () => {
    if (wishBusy) return;
    setWishBusy(true);
    const next = !wished;
    setWished(next);
    try {
      if (next) {
        await apiB2c().post("/api/wishlist", { productId: product.id });
      } else {
        await apiB2c().delete(`/api/wishlist/${product.id}`);
      }
    } catch {
      setWished(!next); // revert on error
    } finally {
      setWishBusy(false);
    }
  }, [wished, wishBusy, product.id]);

  // Sticky CTA visibility
  const mainCtaRef = useRef<HTMLButtonElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  // IntersectionObserver for sticky bar
  useEffect(() => {
    const el = mainCtaRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Variant groups
  // We dedupe by (value + image + sku) rather than value alone so that when
  // an admin uploads 6 rows with identical long titles but different images
  // (classic Amazon-merge aftermath) they all still appear as 6 selectable
  // options on the PDP. If two rows are truly identical value+image+sku we
  // collapse them. When values collide but images differ, we auto-suffix
  // the displayed value with "(1)", "(2)"… so the user sees distinct labels.
  const variantGroups = useMemo(() => {
    const groups: Record<string, { value: string; image?: string; images?: string[]; priceDelta?: number; inventory?: number }[]> = {};
    const seen = new Map<string, string>(); // dedup key → assigned display value
    for (const v of product.variantOptions ?? []) {
      if (!groups[v.name]) groups[v.name] = [];
      const imageKey = v.image ?? (Array.isArray((v as any).images) ? (v as any).images[0] ?? "" : "");
      const dedupKey = `${v.name}|${v.value}|${imageKey}|${(v as any).sku ?? ""}`;
      if (seen.has(dedupKey)) continue;
      // If another entry with the same value already exists in this group
      // but from a different image/sku, suffix a counter so labels differ.
      const sameValueCount = groups[v.name]!.filter((x) => x.value === v.value || x.value.startsWith(v.value + " (")).length;
      const displayValue = sameValueCount > 0 ? `${v.value} (${sameValueCount + 1})` : v.value;
      seen.set(dedupKey, displayValue);
      groups[v.name].push({
        value: displayValue,
        priceDelta: v.priceDelta,
        image: v.image,
        images: (v as any).images,
        inventory: v.inventory,
      });
    }
    return groups;
  }, [product.variantOptions]);

  // ── Variant → image swap: dispatch to <ImageGallery /> ──────────────────
  // When the user selects a variant that has its own image/images (e.g. the
  // "America" / "New York" designs on the Owl Key Holder), we swap the main
  // gallery. Prefer the largest `images[]` array across all selected groups.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let bestImages: string[] | null = null;
    for (const k of Object.keys(selected)) {
      const val = selected[k];
      if (!val) continue;
      const opt = variantGroups[k]?.find((o) => o.value === val);
      if (!opt) continue;
      const imgs = opt.images && opt.images.length > 0
        ? opt.images
        : opt.image
          ? [opt.image]
          : null;
      if (imgs && (!bestImages || imgs.length > bestImages.length)) {
        bestImages = imgs;
      }
    }
    window.dispatchEvent(
      new CustomEvent("gifteeng:variant-swap", { detail: { images: bestImages } }),
    );
  }, [selected, variantGroups]);

  const groupKeys = Object.keys(variantGroups);
  const allSelected = groupKeys.every((k) => selected[k]);

  // Price calculation
  const basePrice = useMemo(() => {
    const raw = (product.priceLabel ?? "0").replace(/[^\d.]/g, "");
    return parseFloat(raw) || 0;
  }, [product.priceLabel]);

  const currencySymbol = useMemo(() => {
    const match = (product.priceLabel ?? "").match(/^[^\d]+/);
    return match ? match[0].trim() : "₹";
  }, [product.priceLabel]);

  const selectedDeltas = useMemo(() => {
    return groupKeys
      .map((k) => {
        const val = selected[k];
        if (!val) return null;
        const opt = variantGroups[k].find((o) => o.value === val);
        return opt && opt.priceDelta ? { name: k, value: val, delta: opt.priceDelta } : null;
      })
      .filter(Boolean) as { name: string; value: string; delta: number }[];
  }, [groupKeys, selected, variantGroups]);

  // priceDelta is now the absolute variant price (not an additive delta).
  // When a variant with a price is selected, use that directly; otherwise fall back to basePrice.
  const totalPrice = selectedDeltas.length > 0
    ? selectedDeltas.reduce((sum, d) => sum + d.delta, 0)
    : basePrice;

  // ── Per-variant inventory ─────────────────────────────────────────────────
  // If the product has variant groups, use the selected variant's inventory.
  // "All OOS" is true when every option across every group has inventory === 0
  // (i.e. the product is completely sold out regardless of what the user picks).
  const allVariantsOos = useMemo(() => {
    if (groupKeys.length === 0) return false;
    return groupKeys.every((k) =>
      (variantGroups[k] ?? []).every((opt) => opt.inventory === 0),
    );
  }, [groupKeys, variantGroups]);

  // Inventory of the currently selected variant combo (undefined = unknown / no variants)
  const selectedVariantInventory = useMemo(() => {
    if (groupKeys.length === 0) return undefined;
    if (!allSelected) return undefined;
    let minInv: number | undefined = undefined;
    for (const k of groupKeys) {
      const val = selected[k];
      if (!val) return undefined;
      const opt = variantGroups[k]?.find((o) => o.value === val);
      if (opt?.inventory !== undefined) {
        minInv = minInv === undefined ? opt.inventory : Math.min(minInv, opt.inventory);
      }
    }
    return minInv;
  }, [groupKeys, allSelected, selected, variantGroups]);

  // Effective inventory: per-variant when variants exist, product-level otherwise
  const inventory = groupKeys.length > 0 ? selectedVariantInventory : product.inventory;
  const maxQty = Math.min(10, inventory ?? 10);

  // Stock indicator
  const stockEl = useMemo(() => {
    if (inventory === undefined) return null;
    if (inventory === 0) {
      return (
        <div className="flex items-center gap-1.5 text-sm text-red-600">
          <Dot className="text-red-500" size={20} />
          Out of Stock
        </div>
      );
    }
    if (inventory > 10) {
      return (
        <div className="flex items-center gap-1.5 text-sm text-green-600">
          <Dot className="text-green-500" size={20} />
          In Stock
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-sm text-green-600">
        <Dot className="text-green-500" size={20} />
        In Stock ({inventory} left)
      </div>
    );
  }, [inventory]);

  // Share
  const handleShare = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: product.title, url });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
  }, [product.title]);

  // Add to cart
  const onAdd = useCallback(async () => {
    if (allVariantsOos || !allSelected || adding || inventory === 0) return;
    setAdding(true);
    try {
      // Pick the variant-specific image when a variant is selected so the
      // cart thumbnail reflects the actual design the customer chose,
      // not the parent product's first image. Falls back to product.imageUrl
      // if the selected variant has no uploaded image.
      let cartImage: string | undefined = product.imageUrl;
      if (groupKeys.length > 0) {
        for (const k of groupKeys) {
          const val = selected[k];
          if (!val) continue;
          const opt = variantGroups[k]?.find((o) => o.value === val);
          const variantImg = opt?.images?.[0] ?? opt?.image;
          if (variantImg) { cartImage = variantImg; break; }
        }
      }
      // Marketplace lines are billed at the chosen seller's offer price.
      const effectivePrice = sellerOffer ? sellerOffer.price : totalPrice;
      await addItem({
        productId: product.id,
        ...(sellerOffer ? { sellerProductId: sellerOffer.sellerProductId } : {}),
        title: product.title,
        priceLabel: `${currencySymbol}${effectivePrice}`,
        quantity: qty,
        image: cartImage,
        slug: product.slug,
        variantOptions: groupKeys.length > 0 ? selected : undefined,
      });
      // Analytics
      if (typeof window !== "undefined" && window.gifteengTrack) {
        window.gifteengTrack("add_to_cart", {
          productId: product.id,
          title:     product.title,
          qty,
          price:     effectivePrice,
        });
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 2200);
    } finally {
      setAdding(false);
    }
  }, [
    allVariantsOos,
    allSelected,
    adding,
    inventory,
    addItem,
    product.id,
    product.title,
    product.slug,
    product.imageUrl,
    currencySymbol,
    totalPrice,
    sellerOffer,
    qty,
    groupKeys,
    selected,
    variantGroups,
  ]);

  const ctaDisabled = allVariantsOos || !allSelected || adding || inventory === 0;

  // Fake MRP / savings for the premium price display. If the platform later
  // stores a real MRP on the product we'll swap this in — for now we show a
  // consistent ~20% markup so the "You save X%" badge feels natural without
  // being arbitrary per refresh.
  const mrpMultiplier = 1.2;
  const mrp = Math.round(basePrice * mrpMultiplier);
  const mrpTotal = Math.round(totalPrice * mrpMultiplier);
  const savings = mrpTotal - totalPrice;
  const savingsPct = mrpTotal > 0 ? Math.round((savings / mrpTotal) * 100) : 0;

  return (
    <>
      {/* Toast notification */}
      <Toast visible={added} />

      {/* Right-rail vertical rhythm: 16px between blocks. Was space-y-6
          (24px) applied uniformly to ~9 stacked blocks, which left the
          column feeling airy and padded-out. 16px matches the DESIGN.md
          component-gap scale and tightens the buy box without crowding. */}
      <div className="space-y-4">
        {/* ── Badges (TRENDING / NEW / BESTSELLER / SOLD OUT / …) ────── */}
        <ProductBadges
          product={{
            inventory: product.inventory,
            isCustomizable: product.isCustomizable,
            createdAt: (product as any).createdAt,
            metadata: (product as any).metadata,
          }}
          size="detail"
          max={3}
        />

        {/* Urgency / fake "viewing now" strip removed — violates brand principle:
            "Confidence, not desperation. No dark patterns." (PRODUCT.md §4) */}

        {/* ── Variants — switch to Amazon-style grid when group has many values */}
        {groupKeys.map((group) => {
          const opts = variantGroups[group];
          const useGrid = opts.length >= GRID_THRESHOLD;
          if (useGrid) {
            return (
              <MultiVariantGrid
                key={group}
                groupName={group}
                options={opts}
                basePrice={basePrice}
                currency={currencySymbol}
                selectedValue={selected[group]}
                isCustomizable={!!product.isCustomizable}
                onSelect={(val) => setSelected((s) => ({ ...s, [group]: val }))}
                onBulkAdd={async (items) => {
                  for (const it of items) {
                    const opt = opts.find((o) => o.value === it.value);
                    const unitPrice = (opt?.priceDelta ?? 0) > 0 ? (opt?.priceDelta ?? 0) : basePrice;
                    await addItem({
                      productId: product.id,
                      title: `${product.title} — ${it.value}`,
                      priceLabel: `${currencySymbol}${unitPrice}`,
                      quantity: it.qty,
                      image: opt?.image ?? opt?.images?.[0] ?? product.imageUrl,
                      variantOptions: { [group]: it.value },
                    });
                  }
                  setAdded(true);
                  setTimeout(() => setAdded(false), 2500);
                }}
              />
            );
          }
          return (
            <VariantOptionGroup
              key={group}
              group={group}
              opts={opts}
              selected={selected[group]}
              currencySymbol={currencySymbol}
              onSelect={(val) => setSelected((s) => ({ ...s, [group]: val }))}
            />
          );
        })}

        {/* ── Quantity + stock indicator + Wishlist + Share ───────────── */}
        <div className="flex items-center gap-2">
          {/* Qty stepper only for non-customizable products — for customizable
              products the quantity is determined by the number of design tabs
              in the customizer, so showing a stepper here is misleading. */}
          {!product.isCustomizable ? (
            <div className="flex-1 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Quantity
              </p>
              <div className="flex items-center gap-3">
                {/* Stepper */}
                <div className="inline-flex items-center rounded-xl bg-card border border-border overflow-hidden">
                  <button
                    type="button"
                    className="w-9 h-10 flex items-center justify-center text-lg hover:bg-muted/50 disabled:opacity-40 transition-colors"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="min-w-10 text-center text-sm font-black tabular-nums">{qty}</span>
                  <button
                    type="button"
                    className="w-9 h-10 flex items-center justify-center text-lg hover:bg-muted/50 disabled:opacity-40 transition-colors"
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                {/* Inline stock indicator */}
                {stockEl}
              </div>
            </div>
          ) : (
            /* For customizable products just show the stock indicator inline */
            <div className="flex-1 flex items-center gap-2">{stockEl}</div>
          )}

          <div className="flex items-end gap-2 pb-0.5">
            <button
              type="button"
              onClick={toggleWishlist}
              disabled={wishBusy}
              aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
              className={`w-10 h-10 rounded-full border transition-colors flex items-center justify-center ${
                wished
                  ? "border-rose-500/50 bg-rose-500/10 text-rose-500"
                  : "border-border bg-card text-muted-foreground hover:text-rose-500 hover:border-rose-500/50 hover:bg-rose-500/5"
              }`}
            >
              <Heart className={`w-4 h-4 ${wished ? "fill-current" : ""}`} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share product"
              className="w-10 h-10 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors flex items-center justify-center"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Price + MRP + savings ───────────────────────────────────── */}
        <div className="rounded-2xl bg-card p-5">
          <div className="flex items-end flex-wrap gap-x-3 gap-y-1">
            <p className="font-display text-3xl md:text-4xl font-black leading-none text-primary tabular-nums">
              {currencySymbol}{totalPrice.toLocaleString("en-IN")}
            </p>
            {savings > 0 && (
              <>
                <p className="text-base text-muted-foreground line-through tabular-nums">
                  {currencySymbol}{mrpTotal.toLocaleString("en-IN")}
                </p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black text-white bg-emerald-600">
                  {savingsPct}% OFF
                </span>
              </>
            )}
          </div>
          {savings > 0 && (
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              You save {currencySymbol}{savings.toLocaleString("en-IN")}
            </p>
          )}
          {/* The "Base ₹X + ₹Y (Variant)" breakdown was confusing — it reads as
              an additive total when designs are actually flat-rate per pick.
              Now we just show the flat price; the variant labels already
              carry their own ₹X chip next to each design tile. */}
          <p className="text-[10px] text-muted-foreground mt-1">Inclusive of all taxes</p>
        </div>

        {/* ── Marketplace seller picker (renders only when sellers exist) */}
        <SellerPicker
          productSlug={product.slug}
          currency={currencySymbol}
          onSelect={setSellerOffer}
        />

        {/* ── Primary CTA(s) ──────────────────────────────────────────── */}
        {product.isCustomizable === true ? (
          // Customizable products: single CTA that goes straight into the
          // customizer. "Add to Cart" is intentionally removed — qty and
          // cart-add happen inside the customizer after designing.
          <button
            ref={mainCtaRef}
            type="button"
            disabled={ctaDisabled}
            onClick={() => router.push(`/customize/${product.slug}`)}
            className="w-full rounded-xl px-5 py-4 text-base font-black text-white bg-primary disabled:opacity-50 [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1),transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            {allVariantsOos || inventory === 0
              ? "Out of Stock"
              : <><Wand2 className="w-5 h-5" />Customise &amp; Add to Cart</>}
          </button>
        ) : (allVariantsOos || inventory === 0) ? (
          // ── Out-of-stock state ───────────────────────────────────────────
          // Cart actions don't make sense, so we collapse to a single
          // ENABLED "Notify Me when available" button. Previously this was
          // styled as Buy Now but inherited the same `disabled={ctaDisabled}`
          // as Add-to-Cart, so the user couldn't actually tap it — clicking
          // a "notify me" label that does nothing is worse than no button.
          //
          // Tap opens a tiny inline email-capture flow (no Navigator route,
          // so no Samsung-dialog black-screen risk if this lands on mobile).
          <button
            type="button"
            onClick={() => {
              const email = window.prompt(
                "Email us when it's back in stock?\n\nEnter your email:",
              );
              if (email && /^\S+@\S+\.\S+$/.test(email)) {
                fetch("/api/notify-me", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    productId: product.id,
                    email: email.trim(),
                  }),
                }).catch(() => { /* best-effort */ });
                alert("Thanks — we'll email you when it's back.");
              } else if (email !== null) {
                alert("Please enter a valid email.");
              }
            }}
            className="w-full rounded-xl px-5 py-3 text-sm font-black text-white bg-primary [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1),transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Notify Me when available
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              ref={mainCtaRef}
              type="button"
              disabled={ctaDisabled}
              onClick={onAdd}
              className="py-2.5 rounded-xl text-sm font-black bg-muted border border-border text-foreground disabled:opacity-50 [transition:background-color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
            >
              {adding ? "Adding…" : <><ShoppingCart className="w-4 h-4 mr-1.5 inline-block" />Add to Cart</>}
            </button>
            <button
              type="button"
              disabled={ctaDisabled}
              onClick={async () => {
                await onAdd();
                setTimeout(() => router.push("/checkout"), 400);
              }}
              className="py-2.5 rounded-xl text-sm font-black text-white bg-primary disabled:opacity-50 [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1),transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
            >
              <Zap className="w-4 h-4 mr-1.5 inline-block" />Buy Now
            </button>
          </div>
        )}

        {!allSelected && groupKeys.length > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold text-center">
            <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1" />Please select: {groupKeys.filter((k) => !selected[k]).join(", ")}
          </p>
        ) : null}

        {/* ── How customisation works (3-step flow) ───────────────────────
            Sits directly under the "Customise & Add to Cart" CTA so the
            user immediately understands what tapping it kicks off. Only
            shown for customisable products. Previously lived further down
            below the description, which buried the explainer. */}
        {product.isCustomizable && (
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] to-primary/[0.02] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-primary mb-4">
              How customisation works
            </p>
            <div className="flex items-start gap-0">
              {[
                { n: "1", label: "Upload Photo", sub: "Your photo + custom message" },
                { n: "2", label: "Live Preview", sub: "See it exactly as printed" },
                { n: "3", label: "Order", sub: "Delivered in 5–7 days" },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center text-center gap-1.5 flex-1 min-w-0 px-1">
                    <div className="w-10 h-10 rounded-full bg-primary text-white text-sm font-black flex items-center justify-center shrink-0 shadow-md shadow-primary/25">
                      {s.n}
                    </div>
                    <p className="text-[11px] font-black text-foreground leading-tight">{s.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{s.sub}</p>
                  </div>
                  {i < 2 && (
                    <span className="text-primary/30 text-lg font-black shrink-0 -mt-1">›</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Delivery & returns strip ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { emoji: "🚚", label: "Free delivery", sub: "On orders ₹199+" },
            { emoji: "🎁", label: "Gift wrap", sub: "Add at checkout" },
            { emoji: "↩️", label: "Easy returns", sub: "7-day policy" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-0.5 rounded-xl bg-card border border-border p-2.5">
              <span className="text-lg leading-none">{item.emoji}</span>
              <p className="text-[10px] font-black text-foreground mt-0.5">{item.label}</p>
              <p className="text-[9px] text-muted-foreground">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Description / product highlights ────────────────────────── */}
        {product.bullets && product.bullets.length > 0 ? (
          <BulletsSection bullets={product.bullets} />
        ) : product.description ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className={`text-sm leading-relaxed text-muted-foreground ${descExpanded ? "" : "line-clamp-3"}`}>
              {product.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
            </p>
            {product.description.length > 160 && (
              <button
                type="button"
                onClick={() => setDescExpanded((e) => !e)}
                className="mt-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                {descExpanded ? "Show less ↑" : "Read more ↓"}
              </button>
            )}
          </div>
        ) : null}

        {/* "How customisation works" now lives directly under the CTA above. */}

        {/* ── Pincode delivery checker (auto-fills from geolocation / saved address) */}
        <PincodeChecker />

      </div>

      {/* Sticky mobile CTA */}
      <div
        className={
          "fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden transition-transform duration-300 " +
          (showStickyBar ? "translate-y-0" : "translate-y-full")
        }
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] text-muted-foreground">{product.title}</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-base font-black tabular-nums text-foreground">
                {currencySymbol}{totalPrice > 0 ? totalPrice.toLocaleString("en-IN") : product.priceLabel}
              </p>
              {savings > 0 && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {savingsPct}% OFF
                </span>
              )}
            </div>
          </div>
          {product.isCustomizable === true ? (
            <button
              type="button"
              disabled={ctaDisabled}
              onClick={() => router.push(`/customize/${product.slug}`)}
              className="shrink-0 flex-1 px-4 py-2.5 rounded-xl text-[11px] font-black text-white bg-primary disabled:opacity-50 [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1),transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] flex items-center justify-center gap-1"
            >
              <Wand2 className="w-3.5 h-3.5" />Customise Now →
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={ctaDisabled}
                onClick={onAdd}
                className="shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black bg-muted border border-border text-foreground disabled:opacity-50"
              >
                {adding ? "…" : "Add"}
              </button>
              <button
                type="button"
                disabled={ctaDisabled}
                onClick={async () => {
                  await onAdd();
                  setTimeout(() => router.push("/checkout"), 400);
                }}
                className="shrink-0 px-4 py-2.5 rounded-xl text-[11px] font-black text-white bg-primary disabled:opacity-50 [transition:background-color_160ms_cubic-bezier(0.23,1,0.32,1),transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
              >
                Buy Now
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

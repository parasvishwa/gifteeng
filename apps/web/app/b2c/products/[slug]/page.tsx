import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck, Truck, RotateCcw, Award, Star, Sparkles } from "lucide-react";
import { ProductCard } from "@gifteeng/ui";
import { ProductDetailClient } from "./ProductDetailClient";
import { ReviewsSection } from "./ReviewsSection";
import { ImageGallery } from "./ImageGallery";
import { ProductTabs } from "./ProductTabs";

export const revalidate = 600;

type VariantOption = {
  name: string;
  value: string;
  priceDelta?: number;
  image?: string;
  images?: string[];
  inventory?: number; // per-variant stock (0 = OOS)
};

export type Product = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  priceLabel?: string;
  imageUrl?: string;
  imageUrls?: string[];
  category?: string;
  variantOptions?: VariantOption[];
  isCustomizable?: boolean;
  inventory?: number;
  brand?: string;
  bullets?: string[];
  specs?: Record<string, string>;
  // Passed through for the client panel so badges + social proof can react to
  // admin-set metadata (trending/bestseller/featured flags, tag[]), and the
  // "NEW" badge can check createdAt.
  metadata?: Record<string, unknown>;
  createdAt?: string;
  basePrice?: string | number;
  currency?: string;
};

// ── Raw API shape (what the server actually returns) ──────────────────────

type ApiProduct = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  basePrice?: string | number;
  currency?: string;
  images?: { url: string; alt?: string }[];
  imageUrl?: string;          // legacy fallback
  imageUrls?: string[];       // legacy fallback
  category?: string;
  variantOptions?: { name: string; value: string; priceDelta?: string | number; image?: string; images?: string[]; inventory?: number }[];
  isCustomizable?: boolean;
  inventory?: number;
  priceLabel?: string;        // legacy fallback (if API ever returns it directly)
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

type ProductListResponse = {
  items: ApiProduct[];
  total: number;
  page: number;
  pageSize: number;
};

/** Map raw API response → normalised Product shape used by the UI */
function normaliseProduct(raw: ApiProduct, apiBase: string): Product {
  // Price label: prefer legacy priceLabel, else build from basePrice + currency
  let priceLabel = raw.priceLabel;
  if (!priceLabel && raw.basePrice !== undefined) {
    const num = parseFloat(String(raw.basePrice));
    const sym = raw.currency === "INR" ? "₹" : (raw.currency ?? "₹");
    priceLabel = `${sym}${num.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  // Media base: use the public-facing API URL so image URLs are browser-accessible.
  // apiBase may be an internal address (http://127.0.0.1:4000) used only for
  // server-side fetches — images must resolve to a URL the browser can reach.
  const mediaBase =
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    (apiBase.startsWith("http://127.") || apiBase.startsWith("http://localhost")
      ? "https://new-api.gifteeng.com"
      : apiBase);

  // Images: prefer API images[] array, else legacy fields
  let imageUrls: string[] = raw.imageUrls ?? [];
  if (imageUrls.length === 0 && raw.images && raw.images.length > 0) {
    imageUrls = raw.images.map((img) =>
      img.url.startsWith("http") ? img.url : `${mediaBase}${img.url}`,
    );
  }

  // Variant options: priceDelta is string from DB → coerce to number
  const variantOptions = (raw.variantOptions ?? []).map((v) => ({
    name: v.name,
    value: v.value,
    priceDelta: v.priceDelta !== undefined ? Number(v.priceDelta) : undefined,
    image: v.image,
    images: Array.isArray(v.images) ? v.images : undefined,
    inventory: v.inventory,
  }));

  // Surface rich metadata fields (from Amazon enrichment)
  const meta = raw.metadata ?? {};
  const brand = typeof meta.brand === "string" ? meta.brand : undefined;
  // Flatten bullets — handle stringified JSON arrays stored as single strings
  function normaliseBullets(raw: unknown[]): string[] {
    const out: string[] = [];
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed) as unknown[];
          if (Array.isArray(parsed)) {
            for (const p of parsed) { if (typeof p === "string" && p.trim()) out.push(p.trim()); }
            continue;
          }
        } catch { /* not JSON — fall through */ }
      }
      if (trimmed) out.push(trimmed);
    }
    return out;
  }
  const bullets = Array.isArray(meta.bullets) ? normaliseBullets(meta.bullets as unknown[]) : undefined;
  const specsRaw = meta.specs;
  const specs =
    specsRaw && typeof specsRaw === "object" && !Array.isArray(specsRaw)
      ? (Object.fromEntries(
          Object.entries(specsRaw as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string" && v.length > 0,
          ),
        ) as Record<string, string>)
      : undefined;

  // Resolve legacy raw.imageUrl (may be a relative path like /uploads/…)
  const legacyImageUrl = raw.imageUrl
    ? (raw.imageUrl.startsWith("http") ? raw.imageUrl : `${mediaBase}${raw.imageUrl}`)
    : undefined;

  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    priceLabel,
    imageUrl: imageUrls[0] ?? legacyImageUrl,
    imageUrls: imageUrls.length > 0 ? imageUrls : (legacyImageUrl ? [legacyImageUrl] : []),
    category: raw.category,
    variantOptions,
    isCustomizable: raw.isCustomizable,
    inventory: raw.inventory,
    brand,
    bullets,
    specs,
    metadata: (raw.metadata ?? undefined) as Record<string, unknown> | undefined,
    createdAt: raw.createdAt,
    basePrice: raw.basePrice,
    currency: raw.currency,
  };
}

/**
 * Fetch the aggregated review stats — combined native + external average so
 * the small rating pill near the title shows the SAME number as the
 * "Customer Reviews" section below. If the stats endpoint is unreachable we
 * leave the pill blank rather than showing a fake hardcoded number.
 */
async function fetchReviewStats(productId: string): Promise<{
  totalReviews: number; averageRating: number;
} | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/reviews/stats?productId=${productId}`, {
      next: { revalidate: 60, tags: ["reviews-stats:" + productId] },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchProduct(slug: string): Promise<Product | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/products/${slug}`, {
      next: { revalidate: 600, tags: ["product:" + slug] },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as ApiProduct;
    return normaliseProduct(raw, base);
  } catch {
    return null;
  }
}

/**
 * Fetch the AI-ranked "you may also like" rail from the API. This mirrors
 * the mobile `you_may_also_like` widget — same endpoint, same product shape —
 * so web and app see the same recommendations for a given product.
 *
 * Falls back to category-based listing if the recommendations endpoint
 * isn't reachable for some reason (older API, transient error).
 */
async function fetchRecommendations(slug: string, category?: string): Promise<Product[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(
      `${base}/api/products/${encodeURIComponent(slug)}/recommendations?limit=8`,
      { next: { revalidate: 600 } },
    );
    if (res.ok) {
      const data = (await res.json()) as ProductListResponse | ApiProduct[];
      const items = Array.isArray(data) ? data : (data.items ?? []);
      if (items.length > 0) return items.map((p) => normaliseProduct(p, base));
    }
  } catch {
    // swallow → fall through to category fallback
  }
  // Fallback: category listing (legacy behaviour)
  if (!category) return [];
  try {
    const res = await fetch(
      `${base}/api/products?category=${encodeURIComponent(category)}&pageSize=8`,
      { next: { revalidate: 600 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as ProductListResponse | ApiProduct[];
    const items = Array.isArray(data) ? data : (data.items ?? []);
    return items.map((p) => normaliseProduct(p, base));
  } catch {
    return [];
  }
}

// SEO metadata: admin-set seo.title/seo.description override product values.
// OpenGraph + Twitter card tags make rich link previews on WhatsApp / FB /
// iMessage. Canonical URL kills duplicate-content issues from UTM params.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://new.gifteeng.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchProduct(slug);
  if (!product) {
    return { title: "Product | Gifteeng", description: "Gifteeng product" };
  }
  const meta = ((product as { metadata?: unknown }).metadata ?? {}) as { seo?: { title?: string; description?: string; keywords?: string[] } };
  const seoTitle = meta.seo?.title || `${product.title} | Gifteeng`;
  const plainDesc = (product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const seoDesc = meta.seo?.description || plainDesc.slice(0, 155) || "Personalized gifts from Gifteeng — shop now.";
  const url = `${SITE}/products/${product.slug}`;
  const img = product.imageUrl || (product.imageUrls?.[0] ?? "");
  return {
    title: seoTitle,
    description: seoDesc,
    keywords: meta.seo?.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: seoTitle,
      description: seoDesc,
      url,
      siteName: "Gifteeng",
      type: "website",  // "product" is not a standard OG type in Next types
      images: img ? [{ url: img, alt: product.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: seoDesc,
      images: img ? [img] : undefined,
    },
  };
}

// ── Trust signals ──────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "Secure Checkout", sub: "256-bit SSL" },
  { icon: Truck, label: "Free Delivery ₹999+", sub: "Pan-India" },
  { icon: RotateCcw, label: "Easy Returns", sub: "7-day returns" },
  { icon: Award, label: "Quality Assured", sub: "Curated picks" },
] as const;

// ── Page ───────────────────────────────────────────────────────────────────

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await fetchProduct(slug);

  if (!product) {
    notFound();
  }

  const [related, reviewStats] = await Promise.all([
    fetchRecommendations(product.slug, product.category),
    fetchReviewStats(product.id),
  ]);

  // Filter out variant-owned images from the main gallery. Previously the
  // gallery rendered every design variant's hero as a "product image", which
  // made the thumbnail strip look like the variant picker below it. We now
  // only show images that are NOT already tied to a variant; variant-specific
  // shots swap in via the "gifteeng:variant-swap" event when the user picks
  // a variant.
  const variantImgs = new Set<string>();
  for (const v of product.variantOptions ?? []) {
    for (const u of v.images ?? []) variantImgs.add(u);
  }
  const rawImages = product.imageUrls && product.imageUrls.length > 0
    ? product.imageUrls
    : product.imageUrl
      ? [product.imageUrl]
      : [];
  const filtered = rawImages.filter((u) => !variantImgs.has(u));
  // If filtering emptied the gallery (all product-level shots happened to
  // also be variant covers), fall back to the full list so the page is
  // never imageless.
  const images: string[] = filtered.length > 0 ? filtered : rawImages;

  const bullets = product.bullets ?? [];
  const specs = product.specs ?? {};
  const specEntries = Object.entries(specs);

  // JSON-LD Product schema — gives Google's rich results (price, stars,
  // availability) on the SERP. Includes Breadcrumb schema so the search
  // snippet shows the category trail. Browser parses inline <script
  // type="application/ld+json"> and ignores anything else.
  const rawProduct = product as unknown as { basePrice?: string | number; currency?: string; sku?: string | null; inventory?: number };
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: (product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000),
    image: images,
    sku: rawProduct.sku ?? undefined,
    brand: { "@type": "Brand", name: "Gifteeng" },
    url: `${SITE}/products/${product.slug}`,
    ...(typeof rawProduct.basePrice !== "undefined" && rawProduct.basePrice !== null ? {
      offers: {
        "@type": "Offer",
        url: `${SITE}/products/${product.slug}`,
        priceCurrency: rawProduct.currency || "INR",
        price: String(rawProduct.basePrice),
        availability: (rawProduct.inventory ?? product.inventory ?? 0) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    } : {}),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",     item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Products", item: `${SITE}/products` },
      ...(product.category
        ? [{ "@type": "ListItem", position: 3, name: product.category, item: `${SITE}/products?category=${encodeURIComponent(product.category)}` }]
        : []),
      { "@type": "ListItem", position: product.category ? 4 : 3, name: product.title, item: `${SITE}/products/${product.slug}` },
    ],
  };

  return (
    // Tight top spacing — earlier pt-28/md:pt-32 left a visible void
    // between the sticky navbar and breadcrumbs. Navbar (~60px) +
    // announcement bar (~30px) + small breathing room (~20px) ≈ pt-20.
    <div className="mx-auto max-w-7xl px-4 pt-6 md:pt-8 pb-24 md:pb-12 overflow-x-hidden">
      {/* Structured data for Google / Bing rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground overflow-hidden flex-nowrap">
        <Link href="/b2c/products" className="hover:text-foreground transition-colors shrink-0">
          Products
        </Link>
        <span className="text-muted-foreground/40 shrink-0 mx-0.5">/</span>
        {product.category ? (
          <>
            <Link
              href={`/b2c/products?category=${encodeURIComponent(product.category)}`}
              className="capitalize hover:text-foreground transition-colors shrink-0 max-w-[110px] truncate"
            >
              {product.category}
            </Link>
            <span className="text-muted-foreground/40 shrink-0 mx-0.5">/</span>
          </>
        ) : null}
        <span className="truncate min-w-0 text-foreground/80">{product.title}</span>
      </nav>

      {/* Title + Tags — sit ABOVE the gallery/panel grid so on mobile the
          reading order is: title → tags → image → reviews → … which matches
          the desired PDP hierarchy. On desktop they occupy the full width
          above the two-column grid. */}
      <div className="mb-6 space-y-2">
        {/* Tags row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {product.category ? (
            <Link
              href={`/b2c/products?category=${encodeURIComponent(product.category)}`}
              className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              {product.category}
            </Link>
          ) : null}
          {product.brand ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
              {product.brand}
            </span>
          ) : null}
        </div>
        {/* Title */}
        <h1 className={`font-display font-black leading-snug tracking-tight text-foreground break-words hyphens-auto ${
          product.title.length > 70
            ? "text-base md:text-xl"
            : product.title.length > 45
            ? "text-xl md:text-2xl"
            : "text-2xl md:text-3xl"
        }`}>
          {product.title}
        </h1>
      </div>

      {/* Hero grid — sticky gallery (left) + info panel (right) */}
      <div className="grid gap-8 lg:gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Sticky gallery — dark-theme aware card */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-3 md:p-4 shadow-sm relative overflow-hidden">
            <ImageGallery images={images} title={product.title} />
            {product.isCustomizable && (
              <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-12 bg-gradient-to-t from-[#12131A]/85 to-transparent pointer-events-none">
                <span className="inline-flex items-center gap-1.5 bg-[#EF3752] text-white text-[11px] font-black px-3 py-1.5 rounded-full shadow-xl">
                  <Sparkles className="w-3 h-3" />
                  Make it personal in seconds
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info panel — reviews → buy panel (variants/qty/price/CTA/desc/how-to/pincode) → trust */}
        <div className="space-y-5">
          {/* Rating + reviews link row — pulls live stats from the same
              aggregated source the Customer Reviews section uses, so this
              number always matches the average shown further down the page.
              Falls back to a "no reviews yet" treatment when the product has
              none — no fake hardcoded stars. */}
          <div className="flex flex-wrap items-center gap-3">
            {reviewStats && reviewStats.totalReviews > 0 ? (
              <>
                <div className="inline-flex items-center gap-1 rounded-lg bg-amber-400/15 px-2 py-1">
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                  <span className="font-black text-sm text-amber-700 dark:text-amber-400 tabular-nums">
                    {reviewStats.averageRating.toFixed(1)}
                  </span>
                </div>
                <a href="#reviews" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                  Read {reviewStats.totalReviews} review{reviewStats.totalReviews === 1 ? "" : "s"}
                </a>
              </>
            ) : (
              <a href="#reviews" className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                Be the first to review
              </a>
            )}
            <span className="text-xs text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-3 h-3" /> Curated by Gifteeng
            </span>
          </div>

          {/* Buy panel — variants, qty, price, CTAs, description, how-to, pincode */}
          <ProductDetailClient product={product} />

          {/* Trust signals — compact 4-icon row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 rounded-md border border-border bg-card p-3">
            {TRUST_BADGES.map(({ icon: Icon, label, sub }) => (
              <div key={label} className="flex items-center gap-2.5 p-1.5">
                <div
                  className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-white"
                  style={{ background: "hsl(351 85% 58%)" }}
                >
                  <Icon size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black leading-tight text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* "Perfect gift for" tile-grid was here; removed per product feedback —
          it's a generic homepage-style block that doesn't add value on the
          PDP and pushes the Description / Specs / Reviews tabs further down. */}

      {/* Details section — tabs for Description / Specs / Reviews */}
      <ProductTabs
        description={product.description}
        bullets={bullets}
        specs={specEntries}
      />

      {/* Reviews */}
      <ReviewsSection productId={product.id} />

      {/* Related products */}
      {related.length > 0 ? (
        <section className="mt-14">
          <h2 className="mb-6 text-xl font-black tracking-tight text-foreground">You may also like</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related
              .filter((r) => r.id !== product.id)
              .slice(0, 4)
              .map((p) => (
                <ProductCard
                  key={p.id}
                  title={p.title}
                  priceLabel={p.priceLabel ?? ""}
                  imageUrl={p.imageUrl}
                  href={`/b2c/products/${p.slug}`}
                />
              ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

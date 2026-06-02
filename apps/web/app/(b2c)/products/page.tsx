/**
 * Products listing page — Server Component wrapper
 *
 * Exports generateMetadata so Next.js can render correct <title> and <meta>
 * tags server-side before any JavaScript runs. Category/occasion/filter params
 * are read from searchParams to produce unique, keyword-rich titles per URL.
 *
 * The actual interactive UI (filters, infinite scroll, wishlist) lives in
 * _ProductsPageClient.tsx which is a "use client" component.
 */
import type { Metadata } from "next";
import ProductsPageClient from "./_ProductsPageClient";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

// ── Dynamic metadata per filter state ──────────────────────────────────────
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}): Promise<Metadata> {
  const params = await searchParams;

  const category    = params.category     ?? "";
  const tag         = params.tag          ?? "";
  const search      = params.search       ?? "";
  const customizable = params.customizable === "true";

  // Canonical URL strips sort / page — only meaningful filter dimensions
  const canonical = new URLSearchParams();
  if (category)    canonical.set("category",    category);
  if (tag)         canonical.set("tag",         tag);
  if (customizable) canonical.set("customizable", "true");
  const canonicalUrl = `${SITE}/products${canonical.toString() ? `?${canonical.toString()}` : ""}`;

  // ── Build title + description dynamically ────────────────────────────
  let title       = "All Personalized Gifts Online India | Gifteeng";
  let description = "Browse 500+ personalized gifts in India — photo frames, mugs, keychains, name plates & more. Filter by occasion, price or recipient. Starting ₹99.";
  let indexPage   = true;

  if (search) {
    // Free-text search — keyword in title, but don't index (too volatile)
    const trimQ = search.trim();
    title       = `${trimQ} Gifts — Shop Online | Gifteeng`;
    description = `Find personalized ${trimQ} gifts on Gifteeng. Custom options starting ₹99 with free India-wide delivery.`;
    indexPage   = false; // avoid duplicate / thin content for random queries
  } else if (category) {
    const cap   = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
    title       = `${cap} Gifts Online | Buy ${cap} Gifts India | Gifteeng`;
    description = `Buy the best ${category.toLowerCase()} gifts in India. Personalized ${category.toLowerCase()} options — custom photo frames, mugs, keychains & more. Starting ₹99. Fast delivery.`;
  } else if (tag) {
    // "occasion:birthday" → "Birthday · Occasion Gifts"
    const [ns, val] = tag.includes(":") ? tag.split(":") : ["", tag];
    const displayVal = (val || tag).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const nsLabel    = ns ? ns.charAt(0).toUpperCase() + ns.slice(1) + " " : "";
    title            = `${displayVal} ${nsLabel}Gifts Online India | Gifteeng`;
    description      = `Personalized ${displayVal.toLowerCase()} gifts in India — custom options starting ₹99. Browse the full collection and order with fast delivery.`;
  } else if (customizable) {
    title       = "Customizable & Personalized Gifts India | Design Your Own | Gifteeng";
    description = "Design your own personalized gifts online. Custom photo frames, mugs, keychains & more — add a name, photo or message. Starting ₹99. Free delivery ₹499+.";
  }

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url:      canonicalUrl,
      type:     "website",
      siteName: "Gifteeng",
      images:   [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
    twitter: {
      card:        "summary_large_image",
      title,
      description,
      images:      ["/opengraph-image"],
    },
    robots: {
      index:  indexPage,
      follow: true,
    },
  };
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  return <ProductsPageClient />;
}

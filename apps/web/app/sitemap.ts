/**
 * Dynamic sitemap — Google / Bing crawl feed.
 *
 * All B2C routes live under /b2c/ (products, search, detail pages).
 * Rebuilt once an hour (`revalidate = 3600`) so newly-published products
 * show up in Google's index without a redeploy.
 *
 * URL priority guide:
 *  1.0  → homepage (the money page)
 *  0.9  → products listing (intent: browse)
 *  0.85 → product detail pages (intent: buy)
 *  0.75 → category + occasion filtered pages (intent: gifting context)
 *  0.7  → collections
 *  0.5–0.6 → editorial / marketing pages
 *  0.3  → legal / policy pages
 */
import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";
const API  = process.env.INTERNAL_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "http://127.0.0.1:4000";

export const revalidate = 3600;

type ApiProduct    = { slug?: string; updatedAt?: string; createdAt?: string };
type ApiCollection = { slug?: string; updatedAt?: string };

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

// Popular occasion tags — generates dedicated indexed URLs so gift-occasion
// searches ("birthday gift ideas India") land on a pre-filtered page.
const OCCASION_TAGS = [
  "occasion:birthday",
  "occasion:anniversary",
  "occasion:valentine",
  "occasion:friendship",
  "occasion:farewell",
  "occasion:housewarming",
  "occasion:corporate",
  "occasion:wedding",
  "recipient:him",
  "recipient:her",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // ── Static pages ─────────────────────────────────────────────────────────
  // Static page dates — real dates, not build-time `now`, so Google trusts lastModified.
  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,                 lastModified: now,                            changeFrequency: "daily",   priority: 1.0 },
    { url: `${SITE}/b2c/products`,     lastModified: now,                            changeFrequency: "daily",   priority: 0.9 },
    { url: `${SITE}/b2c/collections`,  lastModified: now,                            changeFrequency: "daily",   priority: 0.7 },
    { url: `${SITE}/b2c/ai-design`,    lastModified: now,                            changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/b2c/gift-quiz`,    lastModified: new Date("2025-01-01"),          changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/b2c/gift-cards`,   lastModified: new Date("2025-01-01"),          changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/corporate`,        lastModified: new Date("2025-01-01"),          changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/about`,            lastModified: new Date("2025-01-01"),          changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/contact`,          lastModified: new Date("2025-01-01"),          changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/privacy`,          lastModified: new Date("2025-01-01"),          changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/terms`,            lastModified: new Date("2025-01-01"),          changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/returns`,          lastModified: new Date("2025-01-01"),          changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/shipping`,         lastModified: new Date("2025-01-01"),          changeFrequency: "yearly",  priority: 0.3 },
    // /account-deletion intentionally excluded — utility page, no SEO value
  ];

  // ── Occasion / recipient tag pages ─────────────────────────────────────
  const occasionUrls: MetadataRoute.Sitemap = OCCASION_TAGS.map((tag) => ({
    url: `${SITE}/b2c/products?tag=${encodeURIComponent(tag)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.75,
  }));

  // ── Product pages — paginate in batches of 100 ─────────────────────────
  const productUrls: MetadataRoute.Sitemap = [];
  let page = 1;
  while (page <= 50) {
    const data = await safeJson<{ items?: ApiProduct[] }>(
      `${API}/api/products?page=${page}&pageSize=100`,
    );
    const items = data?.items ?? [];
    if (!items.length) break;
    for (const p of items) {
      if (!p.slug) continue;
      productUrls.push({
        url: `${SITE}/b2c/products/${p.slug}`,
        lastModified: p.updatedAt
          ? new Date(p.updatedAt)
          : p.createdAt
          ? new Date(p.createdAt)
          : now,
        changeFrequency: "weekly",
        priority: 0.85,
      });
    }
    if (items.length < 100) break;
    page += 1;
  }

  // ── Category pages — only active categories ─────────────────────────────
  const categoryList = await safeJson<
    Array<{ name?: string; isActive?: boolean; is_active?: boolean }>
  >(`${API}/api/categories?pageSize=500`);

  const categoryUrls: MetadataRoute.Sitemap = (
    Array.isArray(categoryList) ? categoryList : []
  )
    .filter((c) => c?.name && c.isActive !== false && c.is_active !== false)
    .map((c) => ({
      url: `${SITE}/b2c/products?category=${encodeURIComponent(c.name!)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.75,
    }));

  // ── Collections ─────────────────────────────────────────────────────────
  const collections = await safeJson<ApiCollection[]>(`${API}/api/collections`);
  const collectionUrls: MetadataRoute.Sitemap = (
    Array.isArray(collections) ? collections : []
  )
    .filter((c) => c.slug && c.slug !== "undefined") // guard against broken slugs
    .map((c) => ({
      url: `${SITE}/b2c/collections/${c.slug}`,
      lastModified: c.updatedAt ? new Date(c.updatedAt) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [
    ...staticUrls,
    ...occasionUrls,
    ...productUrls,
    ...categoryUrls,
    ...collectionUrls,
  ];
}

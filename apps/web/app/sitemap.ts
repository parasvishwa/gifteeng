/**
 * Dynamic sitemap — Google / Bing crawl feed.
 *
 * Lists every public B2C route: the static pages + every product slug +
 * every collection + every category query. Rebuilt once an hour
 * (`revalidate = 3600`) so newly-published products show up quickly
 * without a deploy.
 */
import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://new.gifteeng.com";
const API  = process.env.INTERNAL_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "http://127.0.0.1:4000";

export const revalidate = 3600;

type ApiProduct = { slug?: string; updatedAt?: string; createdAt?: string };
type ApiCollection = { slug?: string; updatedAt?: string };

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,            lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${SITE}/products`,    lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${SITE}/about`,       lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/contact`,     lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/privacy`,     lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/terms`,       lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/returns`,     lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/shipping`,    lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE}/gift-cards`,  lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/ai-design`,   lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${SITE}/corporate`,   lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/gift-quiz`,   lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/collections`, lastModified: now, changeFrequency: "daily",   priority: 0.7 },
  ];

  // Products — paginate in case we have >100
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
        url: `${SITE}/products/${p.slug}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : (p.createdAt ? new Date(p.createdAt) : now),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    if (items.length < 100) break;
    page += 1;
  }

  // Categories — single DB source via /api/categories. Only active categories
  // are indexed (inactive ones stay out of Google's radar entirely).
  const categoryList = await safeJson<Array<{ name?: string; isActive?: boolean }>>(`${API}/api/categories?pageSize=500`);
  const categoryUrls: MetadataRoute.Sitemap = (Array.isArray(categoryList) ? categoryList : [])
    .filter((c) => c && c.name && c.isActive !== false)
    .map((c) => ({
      url: `${SITE}/products?category=${encodeURIComponent(c.name!)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  // Collections
  const collections = await safeJson<ApiCollection[]>(`${API}/api/collections`);
  const collectionUrls: MetadataRoute.Sitemap = (Array.isArray(collections) ? collections : []).map((c) => ({
    url: `${SITE}/collections/${c.slug}`,
    lastModified: c.updatedAt ? new Date(c.updatedAt) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticUrls, ...productUrls, ...categoryUrls, ...collectionUrls];
}

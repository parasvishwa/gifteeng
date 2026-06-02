import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AiService } from "../ai/ai.service";

// Server-side cache for anonymous lookups keyed by view-history hash. The
// LLM call is the only expensive piece and the same anonymous browser fires
// the same query on every page load — so we keep responses for 1 hour.
const ANON_CACHE_TTL_MS = 60 * 60 * 1000;
const anonCache = new Map<string, { tags: string[]; categories: string[]; at: number }>();

const PROFILE_TTL_DAYS = 7;

interface ShopperProfile {
  summary: string;
  tags: string[];
  categories: string[];
  version: number;
}

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(private prisma: PrismaService, private ai: AiService) {}

  // ── Public surface ──────────────────────────────────────────────────────────

  async getRecommendations(input: {
    customerId?: string;
    viewedSlugs?: string[];
    limit: number;
  }) {
    const limit = Math.min(Math.max(input.limit, 1), 24);

    // Logged-in path: use cached profile if fresh; rebuild in background if stale.
    if (input.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { aiProfile: true, aiProfileComputedAt: true },
      });
      const profile = customer?.aiProfile as ShopperProfile | null;
      const fresh =
        customer?.aiProfileComputedAt &&
        Date.now() - customer.aiProfileComputedAt.getTime() < PROFILE_TTL_DAYS * 24 * 60 * 60 * 1000;

      if (profile && fresh && profile.tags?.length) {
        const items = await this.queryByTags(profile.tags, profile.categories ?? [], limit);
        if (items.length >= Math.min(6, limit)) return { source: "profile", items };
      }
      // Trigger a background rebuild so the next request gets fresh data.
      void this.buildProfile(input.customerId).catch((err) => {
        this.logger.warn(`buildProfile failed for ${input.customerId}: ${err.message}`);
      });
      return { source: "trending", items: await this.getTrending(limit) };
    }

    // Anonymous with browsing history: ad-hoc LLM cohort, cached by hash.
    if (input.viewedSlugs && input.viewedSlugs.length >= 3) {
      const key = [...input.viewedSlugs].sort().join("|");
      const cached = anonCache.get(key);
      let tags: string[] = [];
      let categories: string[] = [];
      if (cached && Date.now() - cached.at < ANON_CACHE_TTL_MS) {
        tags = cached.tags;
        categories = cached.categories;
      } else {
        const inferred = await this.inferCohortFromViews(input.viewedSlugs).catch(() => null);
        if (inferred) {
          tags = inferred.tags;
          categories = inferred.categories;
          anonCache.set(key, { tags, categories, at: Date.now() });
        }
      }
      if (tags.length) {
        const items = await this.queryByTags(tags, categories, limit);
        if (items.length >= Math.min(6, limit)) return { source: "viewed", items };
      }
    }

    // Cold start: trending.
    return { source: "trending", items: await this.getTrending(limit) };
  }

  // ── Profile builder (logged-in customer) ────────────────────────────────────

  /**
   * Builds the customer's shopper profile from order history + wishlist using
   * the configured AI provider. Writes the result back to the customer row.
   * Idempotent — safe to call on every login or order placement.
   */
  async buildProfile(customerId: string): Promise<ShopperProfile | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        orders: {
          take: 20,
          orderBy: { placedAt: "desc" },
          select: {
            items: {
              select: {
                product: { select: { title: true, category: true } },
              },
            },
          },
        },
        wishlists: {
          take: 1,
          select: {
            items: {
              take: 20,
              select: { product: { select: { title: true, category: true } } },
            },
          },
        },
      },
    });
    if (!customer) return null;

    const orderedTitles = customer.orders.flatMap((o) =>
      o.items.map((i) => `${i.product.title}${i.product.category ? ` (${i.product.category})` : ""}`),
    );
    const wishedTitles = (customer.wishlists[0]?.items ?? []).map(
      (i) => `${i.product.title}${i.product.category ? ` (${i.product.category})` : ""}`,
    );

    if (orderedTitles.length === 0 && wishedTitles.length === 0) {
      // Not enough signal yet — leave profile empty so we fall back to trending.
      return null;
    }

    const categoriesAvailable = await this.allCategories();

    const prompt = [
      "You are profiling a personalized-gifting customer for product recommendations.",
      "",
      orderedTitles.length ? `Past purchases:\n- ${orderedTitles.slice(0, 30).join("\n- ")}` : "Past purchases: (none)",
      "",
      wishedTitles.length ? `Wishlist:\n- ${wishedTitles.slice(0, 20).join("\n- ")}` : "",
      "",
      `Available product categories: ${categoriesAvailable.slice(0, 80).join(", ")}`,
      "",
      "Return STRICT JSON only (no markdown, no commentary):",
      `{"summary": "<1 short sentence describing this shopper>", "tags": ["6-10 lowercase keyword tags"], "categories": ["3-6 categories from the available list"]}`,
    ].join("\n");

    const aiResp = await this.ai.write({ prompt });
    const profile = parseProfile(aiResp.text);
    if (!profile) {
      this.logger.warn(`Could not parse profile JSON for customer ${customerId}: ${aiResp.text.slice(0, 200)}`);
      return null;
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        aiProfile: profile as unknown as any,
        aiProfileComputedAt: new Date(),
      },
    });
    return profile;
  }

  // ── Anonymous cohort (no customer ID, just viewed slugs) ────────────────────

  private async inferCohortFromViews(slugs: string[]): Promise<{ tags: string[]; categories: string[] } | null> {
    const products = await this.prisma.product.findMany({
      where: { slug: { in: slugs.slice(0, 12) }, b2cEnabled: true },
      select: { title: true, category: true },
    });
    if (products.length < 3) return null;

    const titles = products.map((p) => `${p.title}${p.category ? ` (${p.category})` : ""}`);
    const categoriesAvailable = await this.allCategories();

    const prompt = [
      "An anonymous shopper has been browsing these products on a personalized-gifting store:",
      `- ${titles.join("\n- ")}`,
      "",
      `Available product categories: ${categoriesAvailable.slice(0, 80).join(", ")}`,
      "",
      "Pick 6-10 keyword tags + 3-5 categories that best describe what they're shopping for.",
      "Return STRICT JSON only (no markdown, no commentary):",
      `{"tags": ["lowercase", "keyword", "tags"], "categories": ["from the available list"]}`,
    ].join("\n");

    const aiResp = await this.ai.write({ prompt });
    const parsed = parseTagsCategories(aiResp.text);
    return parsed;
  }

  // ── Catalog queries ─────────────────────────────────────────────────────────

  /**
   * Fetches products matching the inferred tags/categories. Strategy:
   *   1. Score each candidate product by overlap with categories (strong)
   *      and tag-substring matches in title/description (weak).
   *   2. Within the same score, order by recent popularity (last-30-day
   *      order count) so we surface real movers, not dead inventory.
   */
  private async queryByTags(tags: string[], categories: string[], limit: number) {
    // Pull a candidate pool: anything in the matching categories + a popular
    // tail to mix in if categories are empty.
    const where: any = { b2cEnabled: true };
    if (categories.length) where.category = { in: categories };

    const candidates = await this.prisma.product.findMany({
      where,
      take: limit * 4,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, slug: true, title: true, description: true, category: true,
        basePrice: true, images: true, isCustomizable: true,
      },
    });

    const lowercaseTags = tags.map((t) => t.toLowerCase());

    const scored = candidates.map((p) => {
      const haystack = `${p.title} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase();
      const tagHits = lowercaseTags.reduce((n, t) => (t && haystack.includes(t) ? n + 1 : n), 0);
      const catHit = p.category && categories.includes(p.category) ? 5 : 0;
      return { p, score: catHit + tagHits };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit).map((s) => s.p);
    if (top.length >= limit) return shapeForCard(top);

    // If categories were too narrow, fill the rest with trending so the row is
    // never short.
    const extra = await this.getTrending(limit - top.length, top.map((p) => p.id));
    return shapeForCard(top).concat(extra);
  }

  private async getTrending(limit: number, exclude: string[] = []) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const popular = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: { placedAt: { gte: since } },
        product: { b2cEnabled: true, ...(exclude.length ? { id: { notIn: exclude } } : {}) },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: "desc" } },
      take: limit * 2,
    });
    const ids = popular.map((p) => p.productId);
    const soldMap = new Map(popular.map((p) => [p.productId, p._count.productId]));
    let products: any[] = [];
    if (ids.length) {
      products = await this.prisma.product.findMany({
        where: { id: { in: ids }, b2cEnabled: true },
        select: {
          id: true, slug: true, title: true, description: true, category: true,
          basePrice: true, images: true, isCustomizable: true,
        },
      });
      const order = new Map(ids.map((id, i) => [id, i]));
      products.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    }
    if (products.length < limit) {
      const filler = await this.prisma.product.findMany({
        where: {
          b2cEnabled: true,
          ...(exclude.length || products.length
            ? { id: { notIn: [...exclude, ...products.map((p) => p.id)] } }
            : {}),
        },
        take: limit - products.length,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, slug: true, title: true, description: true, category: true,
          basePrice: true, images: true, isCustomizable: true,
        },
      });
      products = products.concat(filler);
    }
    return shapeForCard(products.slice(0, limit), soldMap);
  }

  private async allCategories(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { b2cEnabled: true, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      take: 200,
    });
    return rows.map((r) => r.category!).filter(Boolean);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function shapeForCard(
  rows: Array<{ id: string; slug: string; title: string; basePrice: any; images: any; category: string | null; isCustomizable: boolean }>,
  soldCounts?: Map<string, number>,
) {
  return rows.map((p) => {
    const imgs = Array.isArray(p.images) ? p.images : [];
    const first = imgs[0] as { url?: string } | undefined;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      category: p.category,
      basePrice: Number(p.basePrice ?? 0),
      image: first?.url ?? null,
      isCustomizable: p.isCustomizable,
      soldCount: soldCounts?.get(p.id) ?? null,
    };
  });
}

function extractJson(text: string): unknown | null {
  if (!text) return null;
  // Models sometimes wrap JSON in ```json fences. Strip and then find the
  // first balanced object.
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseProfile(text: string): ShopperProfile | null {
  const obj = extractJson(text) as Record<string, unknown> | null;
  if (!obj) return null;
  const tags = Array.isArray(obj.tags) ? (obj.tags as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const categories = Array.isArray(obj.categories)
    ? (obj.categories as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (tags.length === 0 && categories.length === 0) return null;
  return {
    summary: typeof obj.summary === "string" ? obj.summary : "",
    tags,
    categories,
    version: 1,
  };
}

function parseTagsCategories(text: string): { tags: string[]; categories: string[] } | null {
  const obj = extractJson(text) as Record<string, unknown> | null;
  if (!obj) return null;
  const tags = Array.isArray(obj.tags) ? (obj.tags as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const categories = Array.isArray(obj.categories)
    ? (obj.categories as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  if (tags.length === 0 && categories.length === 0) return null;
  return { tags, categories };
}

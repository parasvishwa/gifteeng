import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CacheService } from "../cache/cache.service";

const CACHE_TTL = 120; // seconds — categories rarely change
const CACHE_PREFIX = "categories:";

export type CategoryCreateInput = {
  name: string;
  image?: string;
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type CategoryUpdateInput = Partial<CategoryCreateInput>;

export interface ListOpts {
  pageSize?: number;
  /** When true, include up to N product previews per category in a `previews` array. */
  withPreviews?: boolean;
  previewsPerCategory?: number;
}

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private cache: CacheService,
  ) {}

  async list(opts: number | ListOpts = {}): Promise<unknown[]> {
    // Backward-compat: old callers pass a bare number (pageSize).
    const o: ListOpts = typeof opts === "number" ? { pageSize: opts } : opts;
    const cacheKey = `${CACHE_PREFIX}list:${JSON.stringify({
      pageSize: o.pageSize ?? null,
      withPreviews: !!o.withPreviews,
      previewsPerCategory: o.previewsPerCategory ?? null,
    })}`;
    return this.cache.getOrSet(cacheKey, CACHE_TTL, () => this.listUncached(o));
  }

  private async listUncached(o: ListOpts): Promise<unknown[]> {
    // Pull categories + a product count per category name. Product.category is
    // a free-form string (historical — not a FK) so we group by the string.
    const [rows, counts] = await Promise.all([
      this.prisma.category.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: o.pageSize ?? undefined,
      }),
      this.prisma.product.groupBy({
        by: ["category"],
        _count: { _all: true },
      }),
    ]);
    // Map: category name (lowercased) → count
    const countMap = new Map<string, number>();
    for (const c of counts) {
      if (!c.category) continue;
      countMap.set(c.category.trim().toLowerCase(), c._count._all);
    }

    const base = rows.map((r) => ({
      ...r,
      product_count: countMap.get(r.name.trim().toLowerCase()) ?? 0,
    }));

    // Bail out early if caller didn't ask for previews.
    if (!o.withPreviews) return base;

    // ── Batched preview fetch ──────────────────────────────────────────────
    // Fire ONE query for all products across all categories, then bucket
    // client-side. Saves the mobile home screen from making N parallel
    // `/products?category=X&pageSize=3` calls (previously ~6 requests;
    // now the caller makes a single /categories?withPreviews=true call).
    const perCat = clampInt(o.previewsPerCategory ?? 3, 1, 6);
    const names  = rows.map((r) => r.name);

    if (names.length === 0) return base;

    const products = await this.prisma.product.findMany({
      where: {
        category: { in: names },
        b2cEnabled: true,
      },
      orderBy: { createdAt: "desc" },
      // Over-fetch a bit so each category can get its top N after bucketing.
      take: names.length * perCat * 3,
      select: {
        id: true,
        title: true,
        slug: true,
        images: true,
        category: true,
        createdAt: true,
      },
    });

    // Bucket by category name (case-insensitive).
    const buckets = new Map<string, Array<{ url: string; productId: string; title: string; slug: string }>>();
    for (const p of products) {
      if (!p.category) continue;
      const key = p.category.trim().toLowerCase();
      const bucket = buckets.get(key) ?? [];
      if (bucket.length >= perCat) continue;

      // Extract first image URL (supports both [{url, alt}] and [string] shapes)
      let url = "";
      const imgs = p.images as any;
      if (Array.isArray(imgs) && imgs.length > 0) {
        const first = imgs[0];
        url = typeof first === "string" ? first : first?.url ?? "";
      }
      if (!url) continue; // skip previews without an image

      bucket.push({ url, productId: p.id, title: p.title, slug: p.slug });
      buckets.set(key, bucket);
    }

    return base.map((cat: any) => ({
      ...cat,
      previews: buckets.get(cat.name.trim().toLowerCase()) ?? [],
    }));
  }

  // Drop every cached `categories:list:…` key so the next public read pulls
  // fresh data from Postgres. Without this, deletes / creates / updates
  // looked "regenerated" on refresh because the list endpoint was still
  // serving the 120-second-old cached payload that included the deleted row.
  private async invalidateListCache(): Promise<void> {
    try { await this.cache.delByPattern?.(`${CACHE_PREFIX}list:*`); } catch { /* best-effort */ }
  }

  async create(input: CategoryCreateInput): Promise<unknown> {
    const row = await this.prisma.category.create({
      data: {
        name: input.name,
        image: input.image,
        parentId: input.parent_id ?? null,
        sortOrder: input.sort_order ?? 0,
        isActive: input.is_active ?? true,
      },
    });
    await this.invalidateListCache();
    this.realtime.publishGlobal("categories");
    return row;
  }

  async update(id: string, input: CategoryUpdateInput): Promise<unknown> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Category not found");
    try {
      const row = await this.prisma.category.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.image !== undefined ? { image: input.image } : {}),
          ...(input.parent_id !== undefined ? { parentId: input.parent_id } : {}),
          ...(input.sort_order !== undefined ? { sortOrder: input.sort_order } : {}),
          ...(input.is_active !== undefined ? { isActive: input.is_active } : {}),
        },
      });
      await this.invalidateListCache();
      this.realtime.publishGlobal("categories");
      return row;
    } catch (err) {
      // Surface Prisma / runtime errors as a 500 with a clear log line so
      // we can debug client-reported "Couldn't move category" toasts. The
      // most likely cause for drag-to-reparent failures is a missing
      // realtime publish dep or a Prisma FK quirk.
      const message = (err as Error)?.message ?? String(err);
      // eslint-disable-next-line no-console
      console.error(`[categories.update] id=${id} input=${JSON.stringify(input)} err=${message}`);
      throw err;
    }
  }

  async remove(id: string): Promise<unknown> {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Category not found");
    const row = await this.prisma.category.delete({ where: { id } });
    await this.invalidateListCache();
    this.realtime.publishGlobal("categories");
    return row;
  }
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

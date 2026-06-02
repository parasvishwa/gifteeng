import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";
import type { ProductListQuery } from "@gifteeng/shared";
import { SpApiService } from "../amazon-sp/sp-api.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CacheService } from "../cache/cache.service";
import { SeoEnrichmentService } from "../seo/seo-enrichment.service";
import { sanitizeHtml } from "../../common/sanitize-html";

const CACHE_TTL_LIST = 60;     // seconds — catalog list pages
const CACHE_PREFIX = "products:";

// Brand prefix used for auto-generated image alt text. Kept as a constant
// rather than reading from settings on every write — site brand changes
// rarely and an env override (BRAND_NAME) is enough for white-label deploys.
const BRAND_NAME = (process.env.BRAND_NAME ?? "Gifteeng").trim() || "Gifteeng";

/**
 * Auto-populate `alt` text on every image of a product that doesn't already
 * have one. Format: "<brand> – <product title>"; if multiple images, appends
 * a 1-based index so screen readers + Google can distinguish them. Accepts
 * both shapes the storefront persists historically:
 *   - string[]          → coerces each entry to `{ url, alt }`
 *   - {url, alt?}[]     → fills in missing `alt`
 *   - {url}[]           → adds `alt`
 *
 * Caller-supplied alts are NEVER overwritten — only blanks get filled.
 * Without this, search engines + accessibility audits flag every product
 * image as "image missing alt text" (the admin upload UI doesn't capture
 * one). See ALT-text task in admin feedback.
 */
function autoFillAltText(
  images: unknown,
  productTitle: string,
  brand?: string | null,
): unknown {
  const brandPrefix = (brand ?? BRAND_NAME).trim();
  const title = (productTitle ?? "").trim();
  if (!Array.isArray(images) || images.length === 0) return images;

  const base = brandPrefix && title
    ? `${brandPrefix} – ${title}`
    : title || brandPrefix || "Product image";

  const total = images.length;
  return images.map((img, i) => {
    const suffix = total > 1 ? ` (image ${i + 1})` : "";
    if (typeof img === "string") {
      return { url: img, alt: `${base}${suffix}` };
    }
    if (img && typeof img === "object") {
      const o = img as { url?: string; src?: string; alt?: string; order?: number };
      const existing = (o.alt ?? "").trim();
      // Don't overwrite a meaningful caption admins typed themselves.
      if (existing) return img;
      return { ...o, alt: `${base}${suffix}` };
    }
    return img;
  });
}

/**
 * Strip HTML tags and clip to ~200 chars for the card-view description
 * teaser. Cards never render the full rich-text body; product detail
 * pages (`/products/:slug`) fetch the untrimmed copy. This keeps the
 * `/products` list response light: full descriptions are 30-40 KB each
 * and at pageSize=24 ballooned the response to ~1 MB pre-trim.
 */
function trimDescriptionForCard(html: string | null): string | null {
  if (!html) return html;
  // Strip tags + collapse whitespace. Cheap and good enough for cards.
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= 200) return text;
  // Clip on word boundary so we don't break a word in half.
  const cut = text.slice(0, 200);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Drop base64-data-URL image entries from a product's `images` JSON. A few
 * legacy admin saves pasted raw image data into the URL field, which inflates
 * the list payload from ~150 KB to multi-MB and breaks Next.js's data cache.
 * Real uploads always live under /uploads/... or a CDN host, never `data:`.
 *
 * Applied at the response boundary so the DB stays unchanged — admins can
 * still see and clean up the offending row in the dashboard, but normal
 * shoppers and the sitemap crawler never pay for it.
 */
function sanitizeImagesForList(images: unknown): unknown {
  if (!Array.isArray(images)) return images;
  const cleaned = images.filter((it) => {
    if (!it || typeof it !== "object") return false;
    const url = (it as { url?: unknown }).url;
    if (typeof url !== "string") return false;
    if (url.startsWith("data:")) return false;
    return true;
  });
  return cleaned;
}

function computeDiscountPct(basePrice: number | string, mrp?: number | string | null): number | null {
  if (!mrp) return null;
  const b = Number(basePrice);
  const m = Number(mrp);
  if (m <= 0 || b >= m) return null;
  return Math.round(((m - b) / m) * 100);
}

export type AdminProductCreateInput = {
  slug?: string;
  title: string;
  description?: string;
  category?: string;
  brandName?: string;
  basePrice: number | string;
  mrp?: number | string | null;
  currency?: string;
  sku?: string;
  inventory?: number;
  isCustomizable?: boolean;
  images?: unknown;
  mockupTemplates?: unknown;
  b2cEnabled?: boolean;
  b2bEnabled?: boolean;
  ownerCompanyId?: string | null;
  metadata?: unknown;
  fbtProductIds?: string[];
};

export type AdminProductUpdateInput = Partial<AdminProductCreateInput>;

export type AdminVariantInput = {
  name: string;
  value: string;
  priceDelta?: number | string;
  sku?: string;
  inventory?: number;
  image?: string;
  customizationMode?: string | null;
  images?: unknown;
};

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private spApi: SpApiService,
    private realtime: RealtimeService,
    private cache: CacheService,
    private seo: SeoEnrichmentService,
  ) {}

  /**
   * Catalog mutations call this to drop every cached B2C product list +
   * detail entry, so the next page render re-fetches fresh data. We use
   * `delByPattern` (cursor-based SCAN) rather than DEL on a known key
   * list because the cache key includes the full query, which we can't
   * easily enumerate.
   *
   * Called by every mutation entry point on this service AND by any
   * other service that updates product visibility / variants / pricing.
   */
  async invalidateCatalogCache(): Promise<void> {
    await this.cache.delByPattern(`${CACHE_PREFIX}*`);
  }

  /**
   * Re-enrich an existing product's metadata by re-fetching its data from the
   * Amazon SP-API using the sellerSku + accountId stored in its metadata on
   * initial import. Used to fix drafts that were imported sparsely (e.g.
   * before the rich Listings-Items mapping was wired up).
   */
  async enrichFromAmazon(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException();

    const meta = (product.metadata ?? {}) as Record<string, unknown>;
    const sellerSku = typeof meta.sellerSku === "string" ? meta.sellerSku : null;
    const accountId = typeof meta.accountId === "string" ? meta.accountId : undefined;

    if (!sellerSku) {
      throw new BadRequestException(
        "Product metadata does not contain a sellerSku — cannot enrich from Amazon. This product may not have been imported from Amazon, or was imported before accountId/sellerSku were stored.",
      );
    }
    if (!accountId) {
      throw new BadRequestException(
        "Product metadata does not contain an accountId — cannot enrich from Amazon. Re-import this product after the accountId fix (fix43l) was deployed.",
      );
    }

    const preview = await this.spApi.fetchListingBySku(accountId, sellerSku);

    const images =
      preview.images && preview.images.length > 0
        ? preview.images.map((url, i) => ({ url, alt: preview.title, order: i }))
        : (product.images as unknown) ?? undefined;

    const descRaw =
      preview.descriptionHtml ||
      (preview.features.length > 0
        ? `<ul>${preview.features.map((f) => `<li>${f}</li>`).join("")}</ul>`
        : null);

    const mergedMeta: Record<string, unknown> = {
      ...meta,
      source: meta.source ?? "amazon",
      asin: preview.asin || meta.asin,
      brand: preview.brand ?? meta.brand ?? null,
      bullets: preview.features,
      specs: preview.specs ?? {},
      sellerSku,
      accountId,
      previewEnriched: true,
      enrichedAt: new Date().toISOString(),
    };

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        title: preview.title || product.title,
        description: descRaw ?? product.description,
        basePrice:
          preview.price !== undefined && preview.price !== null
            ? new Prisma.Decimal(preview.price as any)
            : undefined,
        images: images as Prisma.InputJsonValue,
        metadata: mergedMeta as Prisma.InputJsonValue,
      },
    });
    return updated;
  }

  async listB2c(q: ProductListQuery & { tag?: string }) {
    // Cache key is the full query shape — different filters / pagination
    // get distinct entries. 60 s TTL: catalog edits also fire
    // invalidateCatalogCache() so updates show up immediately, the TTL
    // is just an upper bound for the rare case a mutation path missed
    // calling invalidate.
    const cacheKey = `${CACHE_PREFIX}b2c:list:${JSON.stringify({
      page: q.page, pageSize: q.pageSize, sort: q.sort,
      category: q.category ?? "", search: q.search ?? "",
      collection: q.collection ?? "", tag: q.tag ?? "",
      deals: (q as any).deals ?? false,
    })}`;
    return this.cache.getOrSet(cacheKey, CACHE_TTL_LIST, () => this.listB2cUncached(q));
  }

  private async listB2cUncached(q: ProductListQuery & { tag?: string }) {
    // ── Search-driven path ────────────────────────────────────────────────
    // When `q.search` is non-empty, we go through pg_trgm trigram
    // similarity ranking instead of plain ILIKE. This:
    //   - tolerates typos: "hammre" still surfaces "hammer"
    //   - ranks title matches above description matches above sku
    //   - stays fast (GIN trigram index in the migration)
    //
    // We score only when search is set; the no-search path stays
    // identical to before to avoid regressing the catalog browse.
    if (q.search?.trim()) {
      return this.searchB2cByTrigram(q);
    }

    // Base filter. `collection` is an N:M lookup through ProductCollection,
    // so it becomes a nested `some` on `collectionLinks` rather than a plain
    // column equality. Previously this param was silently ignored, which is
    // why homepage "By Collection" sections always came back empty.
    //
    // `tag` — matches against `metadata.tags` (string[]) stored as JSONB.
    // Tags use the convention "<namespace>:<value>" (e.g. "occasion:birthday")
    // so multiple intent families can coexist in the same array.
    // Category match is case-insensitive AND tolerant of mismatched separators
    // ("Personalised Gift" vs "personalised-gift" vs "Personalised gift").
    // Admins frequently type the category at product-create time slightly
    // differently than what's stored on the Category row — without this guard
    // freshly-added products silently fail to appear on the category page.
    const where: Prisma.ProductWhereInput = {
      b2cEnabled: true,
      ...((q as any).deals
        ? { discountPct: { gte: 60 }, mrp: { not: null }, b2cEnabled: true }
        : {}),
      ...(q.category
        ? {
            category: {
              // Postgres ILIKE-equivalent — case-insensitive exact match.
              equals: q.category,
              mode: "insensitive",
            },
          }
        : {}),
      ...(q.collection
        ? { collectionLinks: { some: { collection: { slug: q.collection } } } }
        : {}),
      ...(q.tag
        ? {
            metadata: {
              path: ["tags"],
              array_contains: [q.tag],
            } as any, // Prisma JsonNullableFilter — cast needed for path/array_contains operators
          }
        : {}),
    };

    // Sort selector. "popular" ranks by number of OrderItems referencing
    // the product (rough best-seller heuristic). "newest" matches existing
    // default behaviour. Price sorts fall through to Prisma columns.
    let orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] =
      { createdAt: "desc" };
    if (q.sort === "popular") {
      orderBy = [{ orderItems: { _count: "desc" } }, { createdAt: "desc" }];
    } else if (q.sort === "price_asc") {
      orderBy = { basePrice: "asc" };
    } else if (q.sort === "price_desc") {
      orderBy = { basePrice: "desc" };
    }

    // PERF: explicit `select` to keep response under ~200 KB even for
    // pageSize=100. The full Product row carries `metadata` + `mockupTemplates`
    // which include the customizer canvas config (zone arrays, mask images,
    // base64 fragments, etc.) — typically 30-100 KB per product. Times 100
    // = >3 MB response, breaks Next.js data cache, slows mobile cold starts.
    //
    // We send ONLY card-level fields here. Detail page (/products/:slug) still
    // returns full data including metadata for the customizer to consume.
    //
    // Description: stored as HTML (rich-text editor output) and frequently
    // reaches 30-40 KB per product. The card UI shows at most a 2-line
    // teaser, so we strip tags + clip to 200 chars server-side. k6 baseline
    // showed list p95 was payload-bound at ~488 ms with full descriptions;
    // trimming drops the response from ~1 MB to ~120 KB at pageSize=24.
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy,
        select: {
          id:             true,
          slug:           true,
          title:          true,
          description:    true,
          category:       true,
          basePrice:      true,
          mrp:            true,
          discountPct:    true,
          currency:       true,
          inventory:      true,
          isCustomizable: true,
          images:         true,
          b2cEnabled:     true,
          createdAt:      true,
          updatedAt:      true,
          _count: { select: { variantOptions: true, orderItems: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    // Batch-fetch approved ratings for the fetched product set in one query.
    const ratings = items.length
      ? await this.prisma.review.groupBy({
          by: ["productId"],
          where: { productId: { in: items.map((i) => i.id) }, isApproved: true },
          _avg: { rating: true },
          _count: { rating: true },
        })
      : [];
    const ratingMap = new Map(
      ratings.map((r) => [r.productId, {
        avg: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null,
        count: r._count.rating,
      }]),
    );

    const trimmed = items.map((it) => ({
      ...it,
      description: trimDescriptionForCard(it.description),
      images: sanitizeImagesForList(it.images),
      ratingAvg: ratingMap.get(it.id)?.avg ?? null,
      reviewCount: ratingMap.get(it.id)?.count ?? 0,
    }));
    return { items: trimmed, total, page: q.page, pageSize: q.pageSize };
  }

  /**
   * Trigram-similarity ranked search. Used when q.search is non-empty.
   *
   * Scoring (all values 0..1, higher = better match):
   *   3.0 × similarity(lower(title),       lower(query))
   * + 1.0 × similarity(lower(description), lower(query))
   * + 2.0 × similarity(lower(sku),         lower(query))
   *
   * Title gets 3× weight because customers usually search by name;
   * description is a tie-breaker; sku at 2× catches admins / B2B
   * looking up a specific code.
   *
   * We use a single raw SQL CTE that filters by similarity_threshold
   * (default 0.2 set in the migration), pulls the top page-worth of
   * IDs, then loads the full rows by id. This way Prisma's `select`
   * still drives the column shape so the response stays card-sized.
   *
   * Other filters (category, collection, tag) are applied as AND
   * conditions inside the CTE.
   */
  private async searchB2cByTrigram(q: ProductListQuery & { tag?: string }) {
    const search = q.search!.trim();
    const offset = (q.page - 1) * q.pageSize;
    const limit = q.pageSize;

    // Build optional WHERE fragments. Each fragment is added only when
    // the corresponding filter is present so we don't pay for empty
    // joins. Bound parameters via Prisma's tagged template literals so
    // we never concatenate user input into SQL.
    const collectionFilter = q.collection
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "product_collections" pc
          INNER JOIN "collections" c ON c.id = pc."collectionId"
          WHERE pc."productId" = p.id AND c.slug = ${q.collection}
        )`
      : Prisma.empty;

    const categoryFilter = q.category
      ? Prisma.sql`AND p.category = ${q.category}`
      : Prisma.empty;

    // metadata->'tags' is JSONB; @> checks "contains" on array values.
    const tagFilter = q.tag
      ? Prisma.sql`AND p.metadata -> 'tags' @> ${JSON.stringify([q.tag])}::jsonb`
      : Prisma.empty;

    // Match query — runs with similarity_threshold=0.2 set on the DB.
    // We multiply title-similarity by 3 to bias toward name matches,
    // sku & category by 2, and add description as a tie-breaker.
    //
    // Category match lets users find products by typing the category name
    // (e.g. "kitchen" → all products tagged Kitchen). Tags inside
    // metadata.tags JSON are also matched as text so collection-like labels
    // surface in results (collections themselves are a separate table with
    // many-to-many membership; we accept tag-based collections here since
    // every Gifteeng product carries collection slugs in metadata.tags
    // for SEO-friendly URLs).
    type Row = { id: string; rank: number; total_count: bigint };
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH scored AS (
        SELECT
          p.id,
          (
            3.0 * similarity(lower(coalesce(p.title, '')),       lower(${search})) +
            2.0 * similarity(lower(coalesce(p.category, '')),    lower(${search})) +
            1.5 * similarity(lower(coalesce(p.metadata->>'tags', '')), lower(${search})) +
            1.0 * similarity(lower(coalesce(p.description, '')), lower(${search})) +
            2.0 * similarity(lower(coalesce(p.sku, '')),         lower(${search}))
          ) AS rank
        FROM "products" p
        WHERE p."b2cEnabled" = true
          AND (
            lower(p.title)                 % lower(${search}) OR
            lower(p.category)              % lower(${search}) OR
            lower(p.metadata->>'tags')     % lower(${search}) OR
            lower(p.description)           % lower(${search}) OR
            lower(p.sku)                   % lower(${search})
          )
          ${collectionFilter}
          ${categoryFilter}
          ${tagFilter}
      ),
      total AS (SELECT count(*)::bigint AS c FROM scored)
      SELECT s.id, s.rank, t.c AS total_count
      FROM scored s, total t
      ORDER BY s.rank DESC, s.id
      OFFSET ${offset}
      LIMIT  ${limit}
    `;

    if (rows.length === 0) {
      return { items: [], total: 0, page: q.page, pageSize: q.pageSize };
    }

    const ids = rows.map((r) => r.id);
    const total = Number(rows[0]!.total_count);

    // Hydrate the actual columns. Prisma can't preserve our raw ORDER BY
    // when we go through `findMany`, so we re-sort client-side using the
    // rank vector we already have.
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, slug: true, title: true, description: true, category: true,
        basePrice: true, currency: true, inventory: true, isCustomizable: true,
        images: true, b2cEnabled: true, createdAt: true, updatedAt: true,
        _count: { select: { variantOptions: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof products;
    // Same response-boundary cleanup as the browse path: trim long descriptions
    // and strip base64-data-URL image entries that bloat list responses.
    const items = ordered.map((it) => ({
      ...it,
      description: trimDescriptionForCard(it.description),
      images: sanitizeImagesForList(it.images),
    }));

    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /**
   * Admin listing — returns ALL products regardless of visibility flags
   * (published + drafts). Supports an optional status filter:
   *   - "published": at least one of b2cEnabled/b2bEnabled is true
   *   - "draft":     both b2cEnabled and b2bEnabled are false
   *   - undefined:   return everything
   */
  async listAdmin(
    q: ProductListQuery & { status?: "draft" | "published" },
  ) {
    const statusFilter =
      q.status === "draft"
        ? { b2cEnabled: false, b2bEnabled: false }
        : q.status === "published"
          ? { OR: [{ b2cEnabled: true }, { b2bEnabled: true }] }
          : {};

    const where: Prisma.ProductWhereInput = {
      ...statusFilter,
      // Case-insensitive category filter so admins searching "Personalised
      // gift" still find rows stored as "Personalised Gift".
      ...(q.category
        ? { category: { equals: q.category, mode: "insensitive" } }
        : {}),
      ...(q.search
        ? { title: { contains: q.search, mode: "insensitive" } }
        : {}),
      // Hide the Shopify-migration placeholder from the admin list. The
      // row exists purely so historical Shopify orders have a Product to
      // foreign-key against; deleting it from the UI tombstones it (FK
      // conflict prevents hard delete) but the row stays in the table and
      // we don't want it cluttering the admin grid.
      //
      // We match by slug ONLY (not also by metadata.shopify_placeholder)
      // because Prisma's JSON-path filter does NOT coalesce NULL → "no
      // shopify_placeholder key" became NULL, `NULL OR <slug-mismatch>`
      // became NULL, and `NOT NULL` is NULL (not TRUE) — Postgres
      // then dropped EVERY product from the admin list. The slug is
      // unique and stable, so this single-field check is sufficient.
      slug: { not: "shopify-migrated-line-item" },
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  // listB2b() removed — the corporate per-company product catalog was
  // dropped with the corporate offering.

  async getBySlug(slug: string) {
    // Cached at the slug level — product detail is the hottest read in
    // the catalog. 60 s TTL with cache invalidation on every Product
    // mutation (Prisma middleware → realtime → cache.delByPattern).
    return this.cache.getOrSet(
      `${CACHE_PREFIX}slug:${slug}`,
      CACHE_TTL_LIST,
      async () => {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const where = UUID_RE.test(slug) ? { id: slug } : { slug };
        const product = await this.prisma.product.findUnique({
          where,
          include: {
            variantOptions: true,
            collectionLinks: { include: { collection: true } },
            frequentlyBoughtWith: {
              where: { b2cEnabled: true },
              select: { id: true, slug: true, title: true, basePrice: true, mrp: true, discountPct: true, images: true },
              take: 4,
            },
          },
        });
        if (!product || !product.b2cEnabled) throw new NotFoundException();
        return product;
      },
    );
  }

  /**
   * Admin-only lookup — returns product regardless of b2c/b2b visibility flags,
   * so drafts can be opened in the full editor.
   */
  async getAdminBySlug(slugOrId: string) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const where = UUID_RE.test(slugOrId) ? { id: slugOrId } : { slug: slugOrId };
    const product = await this.prisma.product.findUnique({
      where,
      include: { variantOptions: true, collectionLinks: { include: { collection: true } } },
    });
    if (!product) throw new NotFoundException();
    return product;
  }

  async listCategories(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    });
    return rows.map((r) => r.category!).filter(Boolean);
  }

  async listVariantTypes(): Promise<
    { name: string; values: string[]; valueMeta?: Record<string, { imageUrl?: string | null; hexColor?: string | null }> }[]
  > {
    // Pre-list defaults + values from both sources:
    //   1. productVariantOption  — per-product variant rows already saved
    //   2. productVariantTemplate — admin-defined global list (Variant Options admin)
    //
    // For templates we also return a `valueMeta` sidecar map keyed by value so
    // the admin UI can pre-fill per-value thumbnails (imageUrl) and swatches
    // (hexColor) when the admin picks a template value on a new product.
    const DEFAULTS = ["color", "size", "material", "style", "finish"];

    const [rows, templates] = await Promise.all([
      this.prisma.productVariantOption.findMany({
        distinct: ["name", "value"],
        select: { name: true, value: true },
        orderBy: [{ name: "asc" }, { value: "asc" }],
      }),
      this.prisma.productVariantTemplate.findMany({
        where: { isActive: true },
        select: { variantType: true, value: true, imageUrl: true, hexColor: true },
        orderBy: [{ variantType: "asc" }, { sortOrder: "asc" }],
      }),
    ]);

    const map = new Map<string, Set<string>>();
    const meta = new Map<string, Record<string, { imageUrl?: string | null; hexColor?: string | null }>>();
    for (const name of DEFAULTS) map.set(name, new Set());
    for (const r of rows) {
      if (!map.has(r.name)) map.set(r.name, new Set());
      map.get(r.name)!.add(r.value);
    }
    for (const t of templates) {
      if (!map.has(t.variantType)) map.set(t.variantType, new Set());
      map.get(t.variantType)!.add(t.value);
      if (!meta.has(t.variantType)) meta.set(t.variantType, {});
      meta.get(t.variantType)![t.value] = {
        imageUrl: t.imageUrl ?? null,
        hexColor: t.hexColor ?? null,
      };
    }

    return Array.from(map.entries()).map(([name, vs]) => ({
      name,
      values: Array.from(vs),
      valueMeta: meta.get(name) ?? undefined,
    }));
  }

  async setCollections(productId: string, collectionIds: string[]) {
    await this.prisma.productCollection.deleteMany({ where: { productId } });
    if (collectionIds.length > 0) {
      await this.prisma.productCollection.createMany({
        data: collectionIds.map((collectionId, i) => ({
          productId,
          collectionId,
          sortOrder: i,
        })),
      });
    }
    return { ok: true };
  }

  async createAdmin(input: AdminProductCreateInput) {
    const slug = input.slug?.trim() || (await this.generateSlug(input.title));
    // Pre-write image normalisation:
    //   1. Coerce string entries into `{ url, alt }`
    //   2. Fill missing alts with "<brand> – <product title>" so screen
    //      readers + Google never see blank-alt product images.
    const brandFromMeta =
      (typeof (input.metadata as any)?.brand === "string"
        ? ((input.metadata as any).brand as string)
        : null) ?? null;
    const imagesWithAlts = autoFillAltText(
      input.images,
      input.title ?? "",
      brandFromMeta,
    );

    const discountPct = computeDiscountPct(input.basePrice, input.mrp ?? null);
    const row = await this.prisma.product.create({
      data: {
        slug,
        title: input.title,
        // Sanitize on the write path so a content_editor with products.edit
        // can't store executable script. The product page renders this
        // through dangerouslySetInnerHTML; H-1 mitigation.
        description: input.description !== undefined ? sanitizeHtml(input.description) : input.description,
        category: input.category,
        brandName: input.brandName?.trim() || null,
        basePrice: new Prisma.Decimal(input.basePrice as any),
        mrp: input.mrp != null ? new Prisma.Decimal(input.mrp as any) : null,
        discountPct,
        currency: input.currency ?? "INR",
        sku: input.sku,
        inventory: input.inventory ?? 0,
        isCustomizable: input.isCustomizable ?? false,
        images: (imagesWithAlts as Prisma.InputJsonValue) ?? undefined,
        mockupTemplates: (input.mockupTemplates as Prisma.InputJsonValue) ?? undefined,
        b2cEnabled: input.b2cEnabled ?? true,
        b2bEnabled: input.b2bEnabled ?? false,
        ownerCompanyId: input.ownerCompanyId,
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
    // Broadcast to every connected client — a new product is now visible
    // on web + Flutter without a page reload.
    this.realtime.publishGlobal("products");

    // Fire-and-forget SEO enrichment — runs rule-based instantly + AI
    // asynchronously if configured. Never blocks the HTTP response.
    this.seo.enrichProductAsync({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      category: row.category,
      basePrice: row.basePrice ? Number(row.basePrice) : null,
      currency: row.currency,
      images: row.images,
      isCustomizable: row.isCustomizable,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    });

    return row;
  }

  async updateAdmin(id: string, input: AdminProductUpdateInput) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    // If the customizer config (mockupTemplates / metadata) changed, we
    // also fan a "customizer" event so any open customizer screen
    // refreshes its zone configuration.
    const customizerTouched =
      input.mockupTemplates !== undefined || input.metadata !== undefined;

    // Auto-fill image alt text if the caller is updating images. Use
    // whichever title is being saved (or fall back to the existing row's
    // title) so a re-upload with a fresh title doesn't keep the stale alt.
    const brandFromMeta =
      (typeof (input.metadata as any)?.brand === "string"
        ? ((input.metadata as any).brand as string)
        : null) ??
      (typeof (existing.metadata as any)?.brand === "string"
        ? ((existing.metadata as any).brand as string)
        : null);
    const imagesToWrite =
      input.images !== undefined
        ? autoFillAltText(input.images, input.title ?? existing.title, brandFromMeta)
        : undefined;

    // Recompute discountPct if mrp or basePrice is being updated
    let discountPctUpdate: number | null | undefined = undefined;
    if (input.mrp !== undefined || input.basePrice !== undefined) {
      const effectiveMrp = input.mrp !== undefined ? input.mrp : (existing.mrp != null ? Number(existing.mrp) : null);
      const effectiveBasePrice = input.basePrice !== undefined ? input.basePrice : Number(existing.basePrice);
      discountPctUpdate = computeDiscountPct(effectiveBasePrice, effectiveMrp);
    }

    const row = await this.prisma.product.update({
      where: { id },
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description !== undefined ? sanitizeHtml(input.description) : undefined,
        category: input.category,
        brandName:
          input.brandName !== undefined ? (input.brandName.trim() || null) : undefined,
        basePrice:
          input.basePrice !== undefined ? new Prisma.Decimal(input.basePrice as any) : undefined,
        mrp: input.mrp !== undefined ? (input.mrp != null ? new Prisma.Decimal(input.mrp as any) : null) : undefined,
        discountPct: discountPctUpdate !== undefined ? discountPctUpdate : undefined,
        currency: input.currency,
        sku: input.sku,
        inventory: input.inventory,
        isCustomizable: input.isCustomizable,
        images: imagesToWrite !== undefined ? (imagesToWrite as Prisma.InputJsonValue) : undefined,
        mockupTemplates:
          input.mockupTemplates !== undefined
            ? (input.mockupTemplates as Prisma.InputJsonValue)
            : undefined,
        b2cEnabled: input.b2cEnabled,
        b2bEnabled: input.b2bEnabled,
        ownerCompanyId: input.ownerCompanyId,
        metadata:
          input.metadata !== undefined ? (input.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
    this.realtime.publishGlobal("products");
    if (customizerTouched) this.realtime.publishGlobal("customizer", { productSlug: row.slug });

    // Re-enrich SEO if any content that affects search ranking changed.
    // Skips enrichment for inventory-only / price-only updates to reduce
    // unnecessary AI calls.
    const seoRelevantChanged =
      input.title !== undefined ||
      input.description !== undefined ||
      input.category !== undefined ||
      input.images !== undefined ||
      input.isCustomizable !== undefined;

    if (seoRelevantChanged) {
      this.seo.enrichProductAsync({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        category: row.category,
        basePrice: row.basePrice ? Number(row.basePrice) : null,
        currency: row.currency,
        images: row.images,
        isCustomizable: row.isCustomizable,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      });
    }

    return row;
  }

  async softDeleteAdmin(id: string) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    // Try a real DELETE first. Most relations cascade (variants, cart items,
    // wishlist, reviews). The one that doesn't is `order_items` — which is
    // intentional so past orders keep their product reference. When that
    // blocks us we tombstone the product instead (metadata.__deleted = true)
    // and the admin list filter hides it.
    try {
      return await this.prisma.product.delete({ where: { id } });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "P2003" || code === "P2014") {
        const meta = (existing.metadata as Record<string, unknown> | null) ?? {};
        return this.prisma.product.update({
          where: { id },
          data: {
            b2cEnabled: false,
            b2bEnabled: false,
            metadata: { ...meta, __deleted: true, __deletedAt: new Date().toISOString() },
          },
        });
      }
      throw err;
    }
  }

  async bulkDeleteAdmin(ids: string[]) {
    const result = { deleted: 0, tombstoned: 0, errors: [] as Array<{ id: string; message: string }> };
    for (const id of ids) {
      try {
        await this.softDeleteAdmin(id);
        // After softDeleteAdmin: if the row still exists it was tombstoned, else it was hard-deleted.
        const still = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
        if (still) result.tombstoned += 1; else result.deleted += 1;
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? "delete failed";
        result.errors.push({ id, message: msg });
      }
    }
    return result;
  }

  async addVariant(productId: string, input: AdminVariantInput) {
    const existing = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!existing) throw new NotFoundException();
    return this.prisma.productVariantOption.create({
      data: {
        productId,
        name: input.name,
        value: input.value,
        priceDelta:
          input.priceDelta !== undefined
            ? new Prisma.Decimal(input.priceDelta as any)
            : new Prisma.Decimal(0),
        sku: input.sku,
        inventory: input.inventory ?? 0,
        image: input.image,
        images: input.images !== undefined ? (input.images as Prisma.InputJsonValue) : undefined,
        customizationMode: input.customizationMode ?? null,
      },
    });
  }

  async updateVariant(variantId: string, input: Partial<AdminVariantInput>) {
    const existing = await this.prisma.productVariantOption.findUnique({ where: { id: variantId } });
    if (!existing) throw new NotFoundException();
    return this.prisma.productVariantOption.update({
      where: { id: variantId },
      data: {
        ...(input.priceDelta !== undefined ? { priceDelta: Number(input.priceDelta) || 0 } : {}),
        ...(input.sku !== undefined ? { sku: input.sku } : {}),
        ...(input.inventory !== undefined ? { inventory: input.inventory } : {}),
        ...(input.image !== undefined ? { image: input.image } : {}),
        ...(input.images !== undefined ? { images: input.images as Prisma.InputJsonValue } : {}),
        ...("customizationMode" in input ? { customizationMode: input.customizationMode ?? null } : {}),
      },
    });
  }

  async removeVariant(variantId: string) {
    const existing = await this.prisma.productVariantOption.findUnique({ where: { id: variantId } });
    if (!existing) throw new NotFoundException();
    return this.prisma.productVariantOption.delete({ where: { id: variantId } });
  }

  private async generateSlug(title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product";
    // Ensure uniqueness
    let candidate = base;
    let n = 1;
    while (await this.prisma.product.findUnique({ where: { slug: candidate } })) {
      n++;
      candidate = `${base}-${n}`;
    }
    return candidate;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Recommendations
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Products related to a given product — same category first, then same
   * category siblings, newest first. Excludes the input product itself and
   * out-of-stock items. Used by the "You may also like" product-detail rail
   * and the "Based on your recent view" home hint.
   *
   * Contract (consumed by web + mobile identically):
   *   GET /api/products/:slug/recommendations?limit=8
   *   → Product[] (same shape as /products list)
   */
  async getRecommendationsFor(slug: string, limit = 8) {
    const take = Math.min(Math.max(limit, 1), 20);
    const src = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, category: true },
    });
    if (!src) return [];

    const items = await this.prisma.product.findMany({
      where: {
        id:         { not: src.id },
        b2cEnabled: true,
        inventory:  { gt: 0 },
        ...(src.category ? { category: src.category } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: {
        variantOptions: true,
        priceSlabs:     { orderBy: { minQty: "asc" } },
      },
    });

    // If same-category didn't yield enough, pad with recent products from
    // elsewhere so users always see something.
    if (items.length < take) {
      const haveIds = new Set(items.map((i) => i.id));
      haveIds.add(src.id);
      const pad = await this.prisma.product.findMany({
        where: {
          id:         { notIn: Array.from(haveIds) },
          b2cEnabled: true,
          inventory:  { gt: 0 },
        },
        orderBy: [{ createdAt: "desc" }],
        take:    take - items.length,
        include: {
          variantOptions: true,
          priceSlabs:     { orderBy: { minQty: "asc" } },
        },
      });
      items.push(...pad);
    }
    return items;
  }

  async setFbtProducts(productId: string, fbtIds: string[]) {
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        frequentlyBoughtWith: {
          set: fbtIds.map((id) => ({ id })),
        },
      },
    });
    await this.invalidateCatalogCache();
    return { ok: true };
  }

  /**
   * Recommendations for an entire order — unions categories across all order
   * items then returns the freshest in-stock products NOT in the order.
   * Drives the "People who bought these also love…" section on the order
   * success screen and in order-detail pages.
   */
  async getOrderRecommendations(orderId: string, limit = 8) {
    const take = Math.min(Math.max(limit, 1), 20);

    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: {
        productId: true,
        product:   { select: { category: true } },
      },
    });
    if (items.length === 0) return [];

    const excludeIds = Array.from(
      new Set(items.map((it) => it.productId).filter(Boolean)),
    ) as string[];
    const categories = Array.from(
      new Set(
        items
          .map((it) => it.product?.category)
          .filter((c): c is string => !!c),
      ),
    );

    const recs = await this.prisma.product.findMany({
      where: {
        id:         { notIn: excludeIds },
        b2cEnabled: true,
        inventory:  { gt: 0 },
        ...(categories.length > 0 ? { category: { in: categories } } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: {
        variantOptions: true,
        priceSlabs:     { orderBy: { minQty: "asc" } },
      },
    });

    if (recs.length < take) {
      const haveIds = new Set(recs.map((r) => r.id));
      const excluded = new Set([...excludeIds, ...recs.map((r) => r.id)]);
      const pad = await this.prisma.product.findMany({
        where: {
          id:         { notIn: Array.from(excluded) },
          b2cEnabled: true,
          inventory:  { gt: 0 },
        },
        orderBy: [{ createdAt: "desc" }],
        take:    take - recs.length,
        include: {
          variantOptions: true,
          priceSlabs:     { orderBy: { minQty: "asc" } },
        },
      });
      recs.push(...pad.filter((p) => !haveIds.has(p.id)));
    }
    return recs;
  }
}

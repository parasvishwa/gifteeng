import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// Reviews shown on the public /reviews page must clear this rating bar.
// Surface this in the UI as a small note: "Showing reviews rated 4 stars or higher."
export const MIN_VISIBLE_RATING = 4;

const KNOWN_SOURCES = new Set([
  "gifteeng",   // native — own customers via Review model
  "amazon",
  "flipkart",
  "myntra",
  "google",
  "meesho",
  "ajio",
  "trustpilot",
  "manual",     // admin-typed (no specific marketplace)
]);

export interface ExternalReviewInput {
  source?:       string;
  sourceLogo?:   string | null;
  sourceUrl?:    string | null;
  rating?:       number;
  title?:        string | null;
  body?:         string;
  author?:       string | null;
  authorAvatar?: string | null;
  reviewDate?:   string | null;
  productId?:    string | null;
  isApproved?:   boolean;
  sortOrder?:    number;
}

/**
 * Unified shape returned by the aggregated public endpoint. Both native
 * `Review` rows and `ExternalReview` rows project into this shape so the
 * frontend doesn't need to special-case sources.
 */
export interface AggregatedReview {
  id:           string;
  source:       string;          // "gifteeng" | "amazon" | "flipkart" | …
  sourceLogo:   string | null;   // optional override URL — frontend has built-in icons for known sources
  sourceUrl:    string | null;   // link to original review on source site (null for native)
  rating:       number;
  title:        string | null;
  body:         string;
  author:       string | null;
  authorAvatar: string | null;
  reviewDate:   string | null;
  photoUrls:    string[];        // ALWAYS an array — empty when no photos
  videoUrl:     string | null;
  product:      { id: string; slug: string; title: string; imageUrl: string | null } | null;
  isNative:     boolean;         // true → submitted on Gifteeng (web/app) by a real customer
  createdAt:    string;
}

@Injectable()
export class ExternalReviewsService {
  private readonly logger = new Logger(ExternalReviewsService.name);
  constructor(private prisma: PrismaService) {}

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  async listAll(opts: {
    source?: string;
    productId?: string;
    isApproved?: boolean;
    limit?: number;
  } = {}) {
    return this.prisma.externalReview.findMany({
      where: {
        ...(opts.source     ? { source:    opts.source }     : {}),
        ...(opts.productId  ? { productId: opts.productId }  : {}),
        ...(opts.isApproved !== undefined ? { isApproved: opts.isApproved } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: Math.min(opts.limit ?? 200, 1000),
      include: {
        product: { select: { id: true, slug: true, title: true, images: true } },
      },
    });
  }

  async getOne(id: string) {
    const r = await this.prisma.externalReview.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("Review not found");
    return r;
  }

  /**
   * Bulk-import — used by the Chrome extension that scrapes reviews from
   * Amazon/Flipkart/Myntra/Google and POSTs an array. Each review goes in
   * isApproved=true (admin already curated via the extension's checkbox UI),
   * with the same source/productId tag applied to all rows.
   *
   * Returns counts so the extension can show "Imported 12 reviews".
   */
  async bulkImport(data: {
    source:    string;
    productId?: string | null;
    reviews:   Array<Omit<ExternalReviewInput, "source" | "productId">>;
  }) {
    // ── Outer try/catch — bulk-import MUST NEVER return HTTP 500. The Chrome
    //    extension treats 5xx as a generic failure with no actionable detail,
    //    so we always return 200 and surface the failure in the body.
    try {
      this.logger.log(`bulkImport called: source=${data?.source} productId=${data?.productId} count=${data?.reviews?.length}`);

      if (!data || !Array.isArray(data.reviews) || data.reviews.length === 0) {
        return { ok: true, imported: 0, skipped: 0 };
      }
      const source = (data.source ?? "manual").toLowerCase();
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const r of data.reviews) {
        try {
          const body = (r?.body ?? "").trim();
          if (!body || !r?.rating) { skipped++; continue; }

          const safeRating = Math.max(1, Math.min(5, Math.round(Number(r.rating))));

          const photoUrls = Array.isArray((r as any).photoUrls)
            ? ((r as any).photoUrls as unknown[])
                .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u as string))
                .slice(0, 8)
            : [];
          const videoUrl = typeof (r as any).videoUrl === "string"
                          && /^https?:\/\//i.test((r as any).videoUrl)
            ? (r as any).videoUrl as string
            : null;

          let reviewDate: Date | null = null;
          if (r.reviewDate) {
            try {
              const d = new Date(r.reviewDate);
              if (!isNaN(d.getTime())) reviewDate = d;
            } catch { /* keep null */ }
          }

          const blank = (s: string | null | undefined) =>
            s === undefined || s === null || String(s).trim() === "" ? null : String(s).trim();

          await this.prisma.externalReview.create({
            data: {
              source,
              sourceLogo:   blank(r.sourceLogo as string | null | undefined),
              sourceUrl:    blank(r.sourceUrl as string | null | undefined),
              rating:       safeRating,
              title:        blank(r.title as string | null | undefined),
              body,
              author:       blank(r.author as string | null | undefined),
              authorAvatar: blank(r.authorAvatar as string | null | undefined),
              reviewDate,
              ...(photoUrls.length > 0 ? { photoUrls: photoUrls as any } : {}),
              ...(videoUrl ? { videoUrl } : {}),
              productId:    data.productId ?? null,
              isApproved:   r.isApproved ?? true,
              sortOrder:    r.sortOrder  ?? 0,
            },
          });
          imported++;
        } catch (rowErr) {
          skipped++;
          const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
          this.logger.warn(`bulkImport row failed: ${msg}`);
          errors.push(msg.slice(0, 300));
        }
      }
      return {
        ok: true,
        imported,
        skipped,
        ...(errors.length > 0 ? { errors: errors.slice(0, 10) } : {}),
      };
    } catch (outerErr) {
      // Catch-all: nothing past this point can produce a 5xx response.
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      const stack = outerErr instanceof Error ? outerErr.stack : undefined;
      this.logger.error(`bulkImport OUTER FAIL: ${msg}`, stack);
      return {
        ok: false,
        imported: 0,
        skipped: data?.reviews?.length ?? 0,
        error: msg.slice(0, 500),
      };
    }
  }

  async create(data: ExternalReviewInput) {
    if (!data.body) throw new BadRequestException("body is required");
    if (!data.rating) throw new BadRequestException("rating is required");
    const source = (data.source ?? "manual").toLowerCase();
    if (!KNOWN_SOURCES.has(source) && source !== "manual") {
      // Unknown source → store as-is (admin may type a niche one); no enum constraint
    }
    return this.prisma.externalReview.create({
      data: {
        source,
        sourceLogo:   data.sourceLogo   ?? null,
        sourceUrl:    data.sourceUrl    ?? null,
        rating:       Math.max(1, Math.min(5, data.rating)),
        title:        data.title        ?? null,
        body:         data.body,
        author:       data.author       ?? null,
        authorAvatar: data.authorAvatar ?? null,
        reviewDate:   data.reviewDate ? new Date(data.reviewDate) : null,
        productId:    data.productId    ?? null,
        isApproved:   data.isApproved   ?? false,
        sortOrder:    data.sortOrder    ?? 0,
      },
    });
  }

  async update(id: string, data: ExternalReviewInput) {
    await this.getOne(id);
    return this.prisma.externalReview.update({
      where: { id },
      data: {
        source:       data.source?.toLowerCase(),
        sourceLogo:   data.sourceLogo,
        sourceUrl:    data.sourceUrl,
        rating:       data.rating !== undefined ? Math.max(1, Math.min(5, data.rating)) : undefined,
        title:        data.title,
        body:         data.body,
        author:       data.author,
        authorAvatar: data.authorAvatar,
        reviewDate:   data.reviewDate === undefined ? undefined
                       : data.reviewDate ? new Date(data.reviewDate) : null,
        productId:    data.productId,
        isApproved:   data.isApproved,
        sortOrder:    data.sortOrder,
      },
    });
  }

  async remove(id: string) {
    await this.getOne(id);
    await this.prisma.externalReview.delete({ where: { id } });
    return { ok: true };
  }

  async approve(id: string, isApproved = true) {
    return this.prisma.externalReview.update({
      where: { id },
      data: { isApproved },
    });
  }

  /**
   * Tag many external reviews to a single product (or untag with null).
   * Used by the admin page's bulk action bar after multi-selecting rows.
   */
  async bulkAssignProduct(ids: string[], productId: string | null) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return { ok: true, updated: 0 };
    }
    const result = await this.prisma.externalReview.updateMany({
      where: { id: { in: ids } },
      data:  { productId },
    });
    return { ok: true, updated: result.count };
  }

  // ── Public aggregated feed ────────────────────────────────────────────────

  /**
   * Returns reviews from BOTH the native `Review` table (gifteeng-tagged)
   * AND `ExternalReview` (every marketplace), filtered to rating >= 4 and
   * approved-only. Optional productId filter. Sorted by reviewDate/createdAt
   * desc with manual sortOrder as the primary key.
   *
   * Designed to power the dedicated /reviews page (web + Flutter) and the
   * product detail page's reviews tab.
   */
  async getPublicAggregated(opts: {
    productId?: string;
    page?:      number;
    pageSize?:  number;
    minRating?: number;
    source?:    string;            // optional filter — "amazon", "gifteeng", etc.
  } = {}): Promise<{ items: AggregatedReview[]; total: number; page: number; pageSize: number }> {
    const page     = Math.max(1, opts.page ?? 1);
    const pageSize = Math.max(1, Math.min(50, opts.pageSize ?? 20));
    const minRating = Math.max(1, Math.min(5, opts.minRating ?? MIN_VISIBLE_RATING));

    // Pull both sources up to a sane cap, merge, sort, paginate.
    // We oversample by 5x then trim to keep merge cheap without N+1.
    const oversample = pageSize * page * 5;

    const wantNative   = !opts.source || opts.source === "gifteeng";
    const wantExternal = !opts.source || opts.source !== "gifteeng";

    const [native, external] = await Promise.all([
      wantNative
        ? this.prisma.review.findMany({
            where: {
              isApproved: true,
              rating:     { gte: minRating },
              ...(opts.productId ? { productId: opts.productId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take:    oversample,
            include: {
              product:  { select: { id: true, slug: true, title: true, images: true } },
              customer: { select: { id: true, fullName: true, avatarUrl: true } },
              photos:   true,    // for photoUrls / videoUrl projection
            },
          })
        : Promise.resolve([]),
      wantExternal
        ? this.prisma.externalReview.findMany({
            where: {
              isApproved: true,
              rating:     { gte: minRating },
              ...(opts.productId ? { productId: opts.productId } : {}),
              ...(opts.source && opts.source !== "gifteeng" ? { source: opts.source } : {}),
            },
            orderBy: [{ sortOrder: "asc" }, { reviewDate: "desc" }, { createdAt: "desc" }],
            take:    oversample,
            include: {
              product: { select: { id: true, slug: true, title: true, images: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    // Project into the unified shape
    const projectImg = (images: unknown): string | null => {
      if (!Array.isArray(images) || images.length === 0) return null;
      const first = images[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object" && "url" in first) {
        return (first as { url?: string }).url ?? null;
      }
      return null;
    };

    // Helper: native reviews store photos in CustomerPhoto rows referenced by
    // reviewId. We pre-fetched them inline via include. Project to URL[].
    const nativePhotos = (r: any): string[] => {
      const photos = (r.photos as Array<{ url?: string; caption?: string }> | undefined) ?? [];
      return photos
        .filter((p) => p?.url && p.caption !== "__video__")
        .map((p) => p.url as string);
    };
    const nativeVideo = (r: any): string | null => {
      const photos = (r.photos as Array<{ url?: string; caption?: string }> | undefined) ?? [];
      const v = photos.find((p) => p?.caption === "__video__");
      return v?.url ?? null;
    };

    const nativeProjected: AggregatedReview[] = native.map((r: any) => ({
      id:           r.id,
      source:       "gifteeng",
      sourceLogo:   null,                 // frontend renders Gifteeng logo built-in
      sourceUrl:    null,
      rating:       r.rating,
      title:        r.title ?? null,
      body:         r.body  ?? "",
      author:       r.customer?.fullName ?? null,
      authorAvatar: r.customer?.avatarUrl ?? null,
      reviewDate:   r.createdAt?.toISOString?.() ?? null,
      photoUrls:    nativePhotos(r),
      videoUrl:     nativeVideo(r),
      product:      r.product ? {
        id: r.product.id, slug: r.product.slug, title: r.product.title,
        imageUrl: projectImg(r.product.images),
      } : null,
      isNative:     true,
      createdAt:    r.createdAt?.toISOString?.() ?? new Date().toISOString(),
    }));

    // Drop avatar / profile / placeholder URLs that older scrapes may have
    // captured before the extension started filtering them out client-side.
    // Pattern covers: amazon-avatars-global/, .../avatars/, profile_pic, etc.
    const isAvatarish = (url: string): boolean =>
      /avatars?[-_/]?global|amazon-avatars|\/avatars?\/|profile[-_]?pic|\/profile\/|default[-_]?avatar|default\.png$|default\.jpg$/i
        .test(url);
    // Upgrade Amazon thumbnail URLs — `61abc._SY88.jpg` (or `_SY88_.jpg`)
    // → `61abc.jpg` so the lightbox can show the original-resolution photo
    // instead of an 88px thumb. Safe no-op for non-Amazon URLs.
    const upgradeAmazonThumb = (url: string): string =>
      /(media-amazon|images-amazon|ssl-images-amazon)/i.test(url)
        ? url.replace(/\._[A-Z0-9_,]+_?\./i, ".")
        : url;
    const cleanPhotos = (urls: unknown): string[] => {
      if (!Array.isArray(urls)) return [];
      return (urls as unknown[])
        .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
        .filter((u) => !isAvatarish(u))
        .map(upgradeAmazonThumb);
    };

    const externalProjected: AggregatedReview[] = external.map((r: any) => ({
      id:           r.id,
      source:       r.source,
      sourceLogo:   r.sourceLogo,
      sourceUrl:    r.sourceUrl,
      rating:       r.rating,
      title:        r.title,
      body:         r.body,
      author:       r.author,
      authorAvatar: r.authorAvatar,
      reviewDate:   r.reviewDate?.toISOString?.() ?? null,
      photoUrls:    cleanPhotos(r.photoUrls),
      videoUrl:     r.videoUrl ?? null,
      product:      r.product ? {
        id: r.product.id, slug: r.product.slug, title: r.product.title,
        imageUrl: projectImg(r.product.images),
      } : null,
      isNative:     false,
      createdAt:    r.createdAt?.toISOString?.() ?? new Date().toISOString(),
    }));

    const combined = [...nativeProjected, ...externalProjected].sort((a, b) => {
      const ta = new Date(a.reviewDate ?? a.createdAt).getTime();
      const tb = new Date(b.reviewDate ?? b.createdAt).getTime();
      return tb - ta; // newest first
    });

    const total = combined.length;
    const start = (page - 1) * pageSize;
    return {
      items: combined.slice(start, start + pageSize),
      total, page, pageSize,
    };
  }

  /**
   * Aggregate stats for the /reviews page header — average rating across all
   * approved reviews (>= minRating) and per-source counts.
   */
  async getStats(productId?: string) {
    const minRating = MIN_VISIBLE_RATING;
    const [native, external, perSource] = await Promise.all([
      this.prisma.review.aggregate({
        where: {
          isApproved: true,
          rating:     { gte: minRating },
          ...(productId ? { productId } : {}),
        },
        _avg:   { rating: true },
        _count: { _all:   true },
      }),
      this.prisma.externalReview.aggregate({
        where: {
          isApproved: true,
          rating:     { gte: minRating },
          ...(productId ? { productId } : {}),
        },
        _avg:   { rating: true },
        _count: { _all:   true },
      }),
      this.prisma.externalReview.groupBy({
        by: ["source"],
        where: {
          isApproved: true,
          rating:     { gte: minRating },
          ...(productId ? { productId } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const nativeCount   = native._count._all;
    const externalCount = external._count._all;
    const totalCount    = nativeCount + externalCount;
    const weightedAvg = totalCount === 0
      ? 0
      : ((native._avg.rating ?? 0) * nativeCount + (external._avg.rating ?? 0) * externalCount) / totalCount;

    const sources = [
      { source: "gifteeng", count: nativeCount },
      ...perSource.map((s) => ({ source: s.source, count: s._count._all })),
    ].filter((s) => s.count > 0);

    return {
      totalReviews:    totalCount,
      averageRating:   Math.round(weightedAvg * 10) / 10,
      minVisibleRating: minRating,
      sources,
    };
  }
}

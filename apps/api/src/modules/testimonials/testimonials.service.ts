import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type TestimonialStatus = "pending" | "approved" | "rejected";

export interface ListOpts {
  status?: TestimonialStatus | "all";
  pageSize?: number;
  page?: number;
}

export interface UpsertInput {
  name: string;
  avatar?: string | null;
  location?: string | null;
  rating?: number;
  text: string;
  verified?: boolean;
  featured?: boolean;
  status?: TestimonialStatus;
  productId?: string | null;
  productTitle?: string | null;
  productImage?: string | null;
  productSlug?: string | null;
  order?: number;
}

/**
 * Testimonials service — curated editorial quotes shown on the home page.
 *
 * Unlike product Reviews, Testimonials are manually seeded by the super
 * admin: they're promotional content, not user-submitted feedback. The
 * service caches product title/image/slug at save-time so the home carousel
 * doesn't need a join on every request — fast and CDN-friendly.
 */
@Injectable()
export class TestimonialsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public list (home page, approved only by default) ────────────────────

  async listPublic(opts: ListOpts = {}) {
    const pageSize = clampInt(opts.pageSize ?? 10, 1, 50);
    const page     = Math.max(0, opts.page ?? 0);

    const status = opts.status && opts.status !== "all" ? opts.status : "approved";

    const items = await (this.prisma as any).testimonial.findMany({
      where: { status },
      orderBy: [
        { featured: "desc" },
        { order:    "desc" },
        { createdAt:"desc" },
      ],
      skip: page * pageSize,
      take: pageSize,
    });

    return {
      items: items.map(serialize),
      pageSize,
      page,
    };
  }

  // ─── Admin list (any status) ──────────────────────────────────────────────

  async listAdmin(opts: ListOpts = {}) {
    const pageSize = clampInt(opts.pageSize ?? 50, 1, 200);
    const page     = Math.max(0, opts.page ?? 0);

    const where = opts.status && opts.status !== "all"
      ? { status: opts.status }
      : {};

    const [items, total] = await Promise.all([
      (this.prisma as any).testimonial.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: page * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).testimonial.count({ where }),
    ]);

    return {
      items: items.map(serialize),
      total,
      pageSize,
      page,
    };
  }

  // ─── Admin CRUD ───────────────────────────────────────────────────────────

  async create(input: UpsertInput) {
    const data = await this.resolveProductCache(input);
    const row  = await (this.prisma as any).testimonial.create({ data });
    return serialize(row);
  }

  async update(id: string, input: Partial<UpsertInput>) {
    // If product is changing, refresh the cached product fields.
    const dataPatch = input.productId !== undefined
      ? await this.resolveProductCache(input as UpsertInput, /* isUpdate */ true)
      : input;

    try {
      const row = await (this.prisma as any).testimonial.update({
        where: { id },
        data: dataPatch,
      });
      return serialize(row);
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Testimonial not found");
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await (this.prisma as any).testimonial.delete({ where: { id } });
      return { deleted: true };
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Testimonial not found");
      throw e;
    }
  }

  async approve(id: string) {
    return this.update(id, { status: "approved" });
  }

  async reject(id: string) {
    return this.update(id, { status: "rejected" });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * If the admin passed a `productId` but no cached fields, fetch the
   * product and denormalize title/image/slug onto the testimonial so the
   * public list endpoint doesn't need a join.
   */
  private async resolveProductCache(input: UpsertInput, _isUpdate = false) {
    const data: any = { ...input };

    if (data.productId) {
      const needCache =
        data.productTitle == null ||
        data.productImage == null ||
        data.productSlug  == null;

      if (needCache) {
        const product = await this.prisma.product.findUnique({
          where: { id: data.productId },
          select: { title: true, slug: true, images: true },
        });
        if (product) {
          data.productTitle = data.productTitle ?? product.title;
          data.productSlug  = data.productSlug  ?? product.slug;
          if (data.productImage == null) {
            const imgs = product.images as any;
            if (Array.isArray(imgs) && imgs.length > 0) {
              const first = imgs[0];
              data.productImage = typeof first === "string"
                ? first
                : first?.url ?? null;
            }
          }
        }
      }
    } else if (data.productId === null) {
      // Explicit null → clear cached fields
      data.productTitle = null;
      data.productImage = null;
      data.productSlug  = null;
    }

    return data;
  }
}

// ─── Serialization ──────────────────────────────────────────────────────────

function serialize(row: any) {
  return {
    id:           row.id,
    name:         row.name,
    avatar:       row.avatar,
    location:     row.location,
    rating:       row.rating,
    text:         row.text,
    verified:     row.verified,
    featured:     row.featured,
    status:       row.status,
    productId:    row.productId,
    productTitle: row.productTitle,
    productImage: row.productImage,
    productSlug:  row.productSlug,
    order:        row.order,
    createdAt:    row.createdAt,
    updatedAt:    row.updatedAt,
  };
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

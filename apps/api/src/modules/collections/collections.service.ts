import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";

const CACHE_TTL = 120;
const CACHE_PREFIX = "collections:";

export type CollectionCreateInput = {
  slug?: string;
  title: string;
  description?: string;
  heroImage?: string;
  isPublished?: boolean;
  sortOrder?: number;
};

export type CollectionUpdateInput = Partial<CollectionCreateInput>;

@Injectable()
export class CollectionsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async list(all: boolean): Promise<unknown[]> {
    return this.cache.getOrSet(
      `${CACHE_PREFIX}list:${all ? "all" : "pub"}`,
      CACHE_TTL,
      async () => {
        const rows = await this.prisma.collection.findMany({
          where: all ? undefined : { isPublished: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          include: { _count: { select: { products: true } } },
        });
        return rows.map((r: any) => ({
          id: r.id,
          name: r.title,
          description: r.description,
          image: r.heroImage,
          is_active: r.isPublished,
          sort_order: r.sortOrder,
          created_at: r.createdAt,
          product_count: r._count?.products ?? 0,
        }));
      },
    );
  }

  async getBySlug(slug: string): Promise<unknown> {
    return this.cache.getOrSet(
      `${CACHE_PREFIX}slug:${slug}`,
      CACHE_TTL,
      async () => {
        const c = await this.prisma.collection.findUnique({
          where: { slug },
          include: {
            products: {
              orderBy: { sortOrder: "asc" },
              include: { product: true },
            },
          },
        });
        if (!c) throw new NotFoundException("Collection not found");
        return c;
      },
    );
  }

  private async generateSlug(title: string): Promise<string> {
    const base =
      title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "collection";
    let candidate = base;
    let n = 1;
    while (await this.prisma.collection.findUnique({ where: { slug: candidate } })) {
      n++;
      candidate = `${base}-${n}`;
    }
    return candidate;
  }

  async create(input: CollectionCreateInput): Promise<unknown> {
    const slug = input.slug?.trim() || (await this.generateSlug(input.title));
    return this.prisma.collection.create({
      data: {
        slug,
        title: input.title,
        description: input.description,
        heroImage: input.heroImage,
        isPublished: input.isPublished ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, input: CollectionUpdateInput): Promise<unknown> {
    const existing = await this.prisma.collection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Collection not found");
    return this.prisma.collection.update({
      where: { id },
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        heroImage: input.heroImage,
        isPublished: input.isPublished,
        sortOrder: input.sortOrder,
      },
    });
  }

  async remove(id: string): Promise<unknown> {
    const existing = await this.prisma.collection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Collection not found");
    return this.prisma.collection.delete({ where: { id } });
  }

  async listProducts(collectionId: string): Promise<unknown[]> {
    const links = await this.prisma.productCollection.findMany({
      where: { collectionId },
      orderBy: { sortOrder: "asc" },
      include: { product: true },
    });
    return links.map((l) => l.product);
  }

  async addProducts(collectionId: string, productIds: string[]): Promise<unknown> {
    if (!productIds.length) return { ok: true, added: 0 };
    // Skip existing links
    const existing = await this.prisma.productCollection.findMany({
      where: { collectionId, productId: { in: productIds } },
      select: { productId: true },
    });
    const existingSet = new Set(existing.map((e) => e.productId));
    const fresh = productIds.filter((id) => !existingSet.has(id));
    const lastSort = await this.prisma.productCollection.findFirst({
      where: { collectionId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let next = (lastSort?.sortOrder ?? -1) + 1;
    if (fresh.length) {
      await this.prisma.productCollection.createMany({
        data: fresh.map((productId) => ({
          collectionId,
          productId,
          sortOrder: next++,
        })),
      });
    }
    return { ok: true, added: fresh.length };
  }

  async removeProduct(collectionId: string, productId: string): Promise<unknown> {
    await this.prisma.productCollection
      .delete({
        where: {
          productId_collectionId: { productId, collectionId },
        },
      })
      .catch(() => null);
    return { ok: true };
  }
}

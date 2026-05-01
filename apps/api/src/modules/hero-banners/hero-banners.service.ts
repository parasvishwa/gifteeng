import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";

const MAX_BANNERS_PER_PLACEMENT = 10;
const CACHE_TTL = 120;
const CACHE_PREFIX = "banners:";

export interface HeroBannerInput {
  imageUrl?:  string;
  linkUrl?:   string;
  placement?: string;
  altText?:   string | null;
  startsAt?:  string | null;
  endsAt?:    string | null;
  sortOrder?: number;
  isActive?:  boolean;
}

@Injectable()
export class HeroBannersService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /**
   * Public list — used by web HeroSlider + Flutter home banner carousel.
   * Filters out inactive + time-windowed-out banners server-side so clients
   * just render whatever they receive. 120 s cache (banners change rarely).
   *
   * NOTE: the time-window filter means a banner that goes live mid-cache
   * waits up to TTL seconds to surface unless an admin save invalidates.
   * Acceptable for marketing collateral; if we later need <1 s precision
   * we can drop the cache here and rely on Postgres directly.
   */
  async listActive(placement = "home") {
    return this.cache.getOrSet(
      `${CACHE_PREFIX}active:${placement}`,
      CACHE_TTL,
      async () => {
        const now = new Date();
        return this.prisma.heroBanner.findMany({
          where: {
            placement,
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt:   null }, { endsAt:   { gte: now } }] },
            ],
          },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true, imageUrl: true, linkUrl: true,
            placement: true, altText: true, sortOrder: true,
          },
        });
      },
    );
  }

  /** Admin list — returns ALL banners regardless of active/time window. */
  async listAll(placement?: string) {
    return this.prisma.heroBanner.findMany({
      where: placement ? { placement } : {},
      orderBy: [{ placement: "asc" }, { sortOrder: "asc" }],
    });
  }

  async getOne(id: string) {
    const b = await this.prisma.heroBanner.findUnique({ where: { id } });
    if (!b) throw new NotFoundException("Banner not found");
    return b;
  }

  async create(data: HeroBannerInput) {
    if (!data.imageUrl) throw new BadRequestException("imageUrl is required");

    // Enforce per-placement cap so the carousel stays curated.
    const placement = data.placement ?? "home";
    const existing = await this.prisma.heroBanner.count({ where: { placement } });
    if (existing >= MAX_BANNERS_PER_PLACEMENT) {
      throw new BadRequestException(
        `Maximum of ${MAX_BANNERS_PER_PLACEMENT} banners allowed per placement. Delete an old one first.`,
      );
    }

    return this.prisma.heroBanner.create({
      data: {
        imageUrl:  data.imageUrl,
        linkUrl:   data.linkUrl ?? "/shop",
        placement,
        altText:   data.altText ?? null,
        startsAt:  data.startsAt ? new Date(data.startsAt) : null,
        endsAt:    data.endsAt   ? new Date(data.endsAt)   : null,
        sortOrder: data.sortOrder ?? existing, // append at end by default
        isActive:  data.isActive ?? true,
      },
    });
  }

  async update(id: string, data: HeroBannerInput) {
    await this.getOne(id);
    return this.prisma.heroBanner.update({
      where: { id },
      data: {
        imageUrl:  data.imageUrl,
        linkUrl:   data.linkUrl,
        placement: data.placement,
        altText:   data.altText,
        startsAt:  data.startsAt === undefined
                     ? undefined
                     : data.startsAt ? new Date(data.startsAt) : null,
        endsAt:    data.endsAt === undefined
                     ? undefined
                     : data.endsAt   ? new Date(data.endsAt)   : null,
        sortOrder: data.sortOrder,
        isActive:  data.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.getOne(id);
    await this.prisma.heroBanner.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Reorder all banners in a placement in one call. Pass an ordered array of
   * banner IDs; sortOrder gets reassigned 0,1,2… in that exact sequence.
   * Wrapped in a transaction so the reorder is atomic.
   */
  async reorder(placement: string, ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException("ids[] required");
    }
    await this.prisma.$transaction(
      ids.map((id, idx) =>
        this.prisma.heroBanner.update({
          where: { id },
          data:  { placement, sortOrder: idx },
        }),
      ),
    );
    return { ok: true, count: ids.length };
  }
}

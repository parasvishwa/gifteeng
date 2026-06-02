import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";

const MAX_BANNERS_PER_PLACEMENT = 10;
const CACHE_TTL = 120;
const CACHE_PREFIX = "banners:";

export interface HeroBannerInput {
  imageUrl?:      string;
  mobileImageUrl?: string | null;
  linkUrl?:       string;
  placement?:     string;
  altText?:       string | null;
  startsAt?:      string | null;
  endsAt?:        string | null;
  sortOrder?:     number;
  isActive?:      boolean;
  // Per-banner text overlay — empty/null = image-only legacy render.
  tagline?:       string | null;
  heading?:       string | null;
  headingAccent?: string | null;
  subtitle?:      string | null;
  button1Text?:   string | null;
  button1Link?:   string | null;
  button2Text?:   string | null;
  button2Link?:   string | null;
  // Per-banner color overrides — CSS color or gradient strings.
  textBgColor?:   string | null;
  textColor?:     string | null;
  accentColor?:   string | null;
  buttonColor?:   string | null;
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
            id: true, imageUrl: true, mobileImageUrl: true, linkUrl: true,
            placement: true, altText: true, sortOrder: true,
            tagline: true, heading: true, headingAccent: true, subtitle: true,
            button1Text: true, button1Link: true,
            button2Text: true, button2Link: true,
            textBgColor: true, textColor: true,
            accentColor: true, buttonColor: true,
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

  /**
   * Drop the public-list cache for a placement. Called after every write so
   * admin edits surface within the next request instead of waiting up to
   * CACHE_TTL (120 s) for the cached value to expire. Without this the
   * symptom was "I uploaded a banner but it's not on the homepage" for
   * up to two minutes after each save.
   */
  private async invalidate(placement?: string) {
    if (placement) {
      await this.cache.del(`${CACHE_PREFIX}active:${placement}`);
    } else {
      // Conservative blanket purge when we don't know the placement.
      await this.cache.delByPattern?.(`${CACHE_PREFIX}*`);
    }
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

    const row = await this.prisma.heroBanner.create({
      data: {
        imageUrl:      data.imageUrl,
        mobileImageUrl: data.mobileImageUrl ?? null,
        linkUrl:       data.linkUrl ?? "/shop",
        placement,
        altText:   data.altText ?? null,
        startsAt:  data.startsAt ? new Date(data.startsAt) : null,
        endsAt:    data.endsAt   ? new Date(data.endsAt)   : null,
        sortOrder: data.sortOrder ?? existing, // append at end by default
        isActive:  data.isActive ?? true,
        tagline:       data.tagline       ?? null,
        heading:       data.heading       ?? null,
        headingAccent: data.headingAccent ?? null,
        subtitle:      data.subtitle      ?? null,
        button1Text:   data.button1Text   ?? null,
        button1Link:   data.button1Link   ?? null,
        button2Text:   data.button2Text   ?? null,
        button2Link:   data.button2Link   ?? null,
        textBgColor:   data.textBgColor   ?? null,
        textColor:     data.textColor     ?? null,
        accentColor:   data.accentColor   ?? null,
        buttonColor:   data.buttonColor   ?? null,
      },
    });
    await this.invalidate(placement);
    return row;
  }

  async update(id: string, data: HeroBannerInput) {
    const before = await this.getOne(id);
    const row = await this.prisma.heroBanner.update({
      where: { id },
      data: {
        imageUrl:       data.imageUrl,
        mobileImageUrl: data.mobileImageUrl,
        linkUrl:        data.linkUrl,
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
        // Text-overlay fields — `undefined` = "leave alone", null = "clear".
        tagline:       data.tagline,
        heading:       data.heading,
        headingAccent: data.headingAccent,
        subtitle:      data.subtitle,
        button1Text:   data.button1Text,
        button1Link:   data.button1Link,
        button2Text:   data.button2Text,
        button2Link:   data.button2Link,
        textBgColor:   data.textBgColor,
        textColor:     data.textColor,
        accentColor:   data.accentColor,
        buttonColor:   data.buttonColor,
      },
    });
    // Invalidate both old and new placement in case it changed.
    await this.invalidate(before.placement);
    if (data.placement && data.placement !== before.placement) {
      await this.invalidate(data.placement);
    }
    return row;
  }

  async remove(id: string) {
    const before = await this.getOne(id);
    await this.prisma.heroBanner.delete({ where: { id } });
    await this.invalidate(before.placement);
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
    await this.invalidate(placement);
    return { ok: true, count: ids.length };
  }
}

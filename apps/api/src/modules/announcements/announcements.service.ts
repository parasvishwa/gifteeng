import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type Placement = "home" | "shop" | "checkout" | "all";

export interface UpsertInput {
  title: string;
  subtitle?: string | null;
  emoji?: string | null;
  // Slug for /shop?occasion=<slug> deep-linking. When set, the mobile
  // banner uses this to scope the shop view to products matching the
  // matching occasion tag / collection / category mappings below.
  slug?: string | null;
  placement?: Placement;
  link?: string;
  eventDate?: string | Date | null;
  startsAt?:  string | Date | null;
  endsAt?:    string | Date | null;
  gradient?:  unknown;
  bannerImage?: string | null;
  // Occasion → catalog mapping. Either / both can be set; the consumer
  // (shop screen, banner Shop-Now CTA) builds the appropriate filtered
  // query from these.
  collectionSlugs?: string[];
  categoryNames?:   string[];
  active?: boolean;
  order?:  number;
}

/**
 * Announcements service — admin-editable home-screen banners.
 *
 * Public list filters out entries whose time-window hasn't started or has
 * already ended, so admins can pre-schedule Valentine's/Diwali banners
 * months ahead without them showing early.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public feed ──────────────────────────────────────────────────────────

  async listPublic(opts: {
    placement?: string;
    active?: string | boolean;
    pageSize?: number;
  } = {}) {
    const pageSize = clampInt(opts.pageSize ?? 10, 1, 50);

    const now = new Date();
    const where: any = {
      // Time-window gate — if startsAt/endsAt are set they bound visibility.
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt:   null }, { endsAt:   { gt:  now } }] },
      ],
    };

    // Active default = true unless explicitly overridden to a falsy value.
    const activeRaw = typeof opts.active === "string"
      ? opts.active !== "false" && opts.active !== "0"
      : opts.active !== false;
    where.active = activeRaw;

    // Placement: default 'home'; 'all' passes through any value.
    if (opts.placement && opts.placement !== "all") {
      where.OR = [
        { placement: opts.placement },
        { placement: "all" },
      ];
    } else if (!opts.placement) {
      where.OR = [{ placement: "home" }, { placement: "all" }];
    }

    const items = await (this.prisma as any).announcement.findMany({
      where,
      orderBy: [
        { order: "desc" },
        { eventDate: "asc" },
        { createdAt: "desc" },
      ],
      take: pageSize,
    });

    return {
      items: items.map(serialize),
      pageSize,
    };
  }

  // ─── Admin list ───────────────────────────────────────────────────────────

  async listAdmin(opts: { pageSize?: number; page?: number } = {}) {
    const pageSize = clampInt(opts.pageSize ?? 50, 1, 200);
    const page     = Math.max(0, opts.page ?? 0);

    const [items, total] = await Promise.all([
      (this.prisma as any).announcement.findMany({
        orderBy: [{ createdAt: "desc" }],
        skip: page * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).announcement.count(),
    ]);

    return { items: items.map(serialize), total, pageSize, page };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(input: UpsertInput) {
    const row = await (this.prisma as any).announcement.create({
      data: normalize(input),
    });
    return serialize(row);
  }

  async update(id: string, input: Partial<UpsertInput>) {
    try {
      const row = await (this.prisma as any).announcement.update({
        where: { id },
        data: normalize(input),
      });
      return serialize(row);
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Announcement not found");
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await (this.prisma as any).announcement.delete({ where: { id } });
      return { deleted: true };
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Announcement not found");
      throw e;
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalize(input: Partial<UpsertInput>): any {
  const out: any = { ...input };
  for (const k of ["eventDate", "startsAt", "endsAt"] as const) {
    const v = out[k];
    if (v == null) continue;
    if (v instanceof Date) continue;
    out[k] = new Date(v);
  }
  return out;
}

function serialize(row: any) {
  return {
    id:           row.id,
    title:        row.title,
    subtitle:     row.subtitle,
    emoji:        row.emoji,
    slug:         row.slug ?? null,
    placement:    row.placement,
    link:         row.link,
    eventDate:    row.eventDate,
    startsAt:     row.startsAt,
    endsAt:       row.endsAt,
    gradient:     row.gradient,
    bannerImage:  row.bannerImage,
    collectionSlugs: Array.isArray(row.collectionSlugs) ? row.collectionSlugs : [],
    categoryNames:   Array.isArray(row.categoryNames)   ? row.categoryNames   : [],
    active:       row.active,
    order:        row.order,
    createdAt:    row.createdAt,
    updatedAt:    row.updatedAt,
  };
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

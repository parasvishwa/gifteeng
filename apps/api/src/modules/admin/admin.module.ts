import { Module, Controller, Get, Query, UseGuards, Param, NotFoundException } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Prisma } from "@gifteeng/db";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsController } from "./settings.controller";
import { AiModule } from "../ai/ai.module";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("admin")
class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get("stats")
  async stats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      products,
      activeProducts,
      customers,
      totalOrders,
      confirmedOrders,
      pendingOrders,
      deliveredOrders,
      todayOrders,
      revenueAgg,
      categories,
      collections,
      discounts,
      stockImages,
      variantOptions,
      reviews,
      avgRatingAgg,
      pageViews,
      todayViews,
      topPagesRaw,
      recentOrdersRaw,
      recentCustomersRaw,
      topProductsRaw,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.product.count({ where: { b2cEnabled: true } }),
      this.prisma.customer.count(),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: "confirmed" } }),
      this.prisma.order.count({ where: { status: { in: ["new_order", "in_production", "ready_to_ship", "shipped"] } } }),
      this.prisma.order.count({ where: { status: "delivered" } }),
      this.prisma.order.count({ where: { placedAt: { gte: todayStart } } }),
      this.prisma.order.aggregate({ _sum: { grandTotal: true } }),
      this.prisma.category.count(),
      this.prisma.collection.count(),
      this.prisma.discount.count(),
      this.prisma.stockImage.count(),
      this.prisma.productVariantOption.count(),
      this.prisma.review.count(),
      this.prisma.review.aggregate({ _avg: { rating: true } }),
      this.prisma.pageView.count(),
      this.prisma.pageView.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.pageView.groupBy({
        by: ["path"],
        _count: { path: true },
        orderBy: { _count: { path: "desc" } },
        take: 5,
      }),
      this.prisma.order.findMany({
        take: 6,
        orderBy: { placedAt: "desc" },
        select: { orderNumber: true, grandTotal: true, status: true, placedAt: true, customer: { select: { fullName: true, email: true } } },
      }),
      this.prisma.customer.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { fullName: true, email: true, createdAt: true },
      }),
      this.prisma.product.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        where: { b2cEnabled: true },
        select: { title: true, basePrice: true },
      }),
    ]);

    // Weekly page views (last 7 days) – 7 parallel queries
    const weeklyViews = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const start = new Date(now);
        start.setDate(start.getDate() - (6 - i));
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return this.prisma.pageView.count({ where: { createdAt: { gte: start, lt: end } } });
      }),
    );

    return {
      // Catalog
      products,
      activeProducts,
      sections: 0,
      categories,
      collections,
      discounts,
      stockImages,
      variantOptions,
      // Customers & reviews
      customers,
      reviews,
      avgRating: +(avgRatingAgg._avg?.rating?.toFixed?.(1) ?? 0),
      // Traffic
      pageViews,
      todayViews,
      weeklyViews,
      topPages: topPagesRaw.map((p) => ({ page_path: p.path, count: p._count.path })),
      // Revenue & orders
      totalRevenue: +(revenueAgg._sum.grandTotal ?? 0),
      totalOrders,
      confirmedOrders,
      pendingOrders,
      deliveredOrders,
      todayOrders,
      // Lists for dashboard cards
      recentOrders: recentOrdersRaw.map((o) => ({
        order_number: o.orderNumber,
        customer_name: o.customer?.fullName || o.customer?.email || "Guest",
        total: +(o.grandTotal ?? 0),
        status: o.status,
        created_at: o.placedAt.toISOString(),
      })),
      recentCustomers: recentCustomersRaw.map((c) => ({
        name: c.fullName ?? "",
        email: c.email ?? "",
        created_at: c.createdAt.toISOString(),
      })),
      topProducts: topProductsRaw.map((p) => ({
        name: p.title,
        price: +(p.basePrice ?? 0),
        rating: 0,
        reviews: 0,
      })),
    };
  }

  @Get("stats-extended")
  async statsExtended(): Promise<{
    companies: number;
    customers: number;
    products: number;
    orders: number;
    activeCompanies: number;
    activeCampaigns: number;
    totalWalletBalance: string;
    totalLockedBalance: string;
    ordersLast7Days: number;
    revenueLast7Days: string;
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      companies,
      customers,
      products,
      orders,
      activeCompanies,
      activeCampaigns,
      walletAgg,
      ordersLast7Days,
      revenueAgg,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.customer.count(),
      this.prisma.product.count(),
      this.prisma.order.count(),
      this.prisma.company.count({ where: { status: "active" } }),
      this.prisma.campaign.count({ where: { status: "active" } }),
      this.prisma.wallet.aggregate({
        _sum: { balance: true, lockedBalance: true },
      }),
      this.prisma.order.count({ where: { placedAt: { gte: sevenDaysAgo } } }),
      this.prisma.order.aggregate({
        _sum: { grandTotal: true },
        where: { placedAt: { gte: sevenDaysAgo } },
      }),
    ]);
    return {
      companies,
      customers,
      products,
      orders,
      activeCompanies,
      activeCampaigns,
      totalWalletBalance: (walletAgg._sum.balance ?? new Prisma.Decimal(0)).toString(),
      totalLockedBalance: (walletAgg._sum.lockedBalance ?? new Prisma.Decimal(0)).toString(),
      ordersLast7Days,
      revenueLast7Days: (revenueAgg._sum.grandTotal ?? new Prisma.Decimal(0)).toString(),
    };
  }

  @Get("page-views-summary")
  async pageViews(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("path") path?: string,
    @Query("limit") limit?: string,
  ): Promise<{
    totalViews: number;
    uniqueSessions: number;
    topPaths: Array<{ path: string; count: number }>;
    timeline: Array<{ day: string; count: number }>;
  }> {
    const where: Prisma.PageViewWhereInput = {};
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
    }
    if (path) where.path = path;

    const topLimit = Math.min(100, limit ? Number(limit) : 10);

    const [totalViews, uniqueCustomers, grouped, rows] = await Promise.all([
      this.prisma.pageView.count({ where }),
      this.prisma.pageView.findMany({
        where,
        distinct: ["customerId"],
        select: { customerId: true },
      }),
      this.prisma.pageView.groupBy({
        by: ["path"],
        where,
        _count: { path: true },
        orderBy: { _count: { path: "desc" } },
        take: topLimit,
      }),
      this.prisma.pageView.findMany({
        where,
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const timelineMap = new Map<string, number>();
    for (const r of rows) {
      const day = r.createdAt.toISOString().slice(0, 10);
      timelineMap.set(day, (timelineMap.get(day) ?? 0) + 1);
    }

    return {
      totalViews,
      uniqueSessions: uniqueCustomers.length,
      topPaths: grouped.map((g) => ({ path: g.path, count: g._count.path })),
      timeline: Array.from(timelineMap.entries()).map(([day, count]) => ({
        day,
        count,
      })),
    };
  }
}

// ── Public controller — no auth required ──────────────────────────────────────
// Exposes homepage config (hero slides + product sections) for the customer site.
@Controller("homepage")
class HomepageConfigController {
  constructor(private prisma: PrismaService) {}

  @Get("config")
  async config() {
    // New unified page builder config (Deploy 100). Stored under the single
    // settings key `homepage_config`. Contains the ordered section list.
    // Falls back to the pre-Deploy-100 two-key setup so existing installs
    // keep working until the admin saves once in the new builder.
    const KEYS = ["homepage_config", "homepage_hero_slides", "homepage_sections"];
    const rows = await this.prisma.siteSetting.findMany({ where: { key: { in: KEYS } } });
    const map: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        map[r.key] = typeof r.value === "string" ? JSON.parse(r.value as string) : r.value;
      } catch {
        map[r.key] = r.value;
      }
    }

    // Default hero slides for old renderer fallback.
    const DEFAULT_SLIDES = [
      {
        id: "default-1", active: true, order: 0,
        imageUrl: "https://images.unsplash.com/photo-1513201099705-a9746072f418?w=1200&q=80",
        title: "Gifts That Speak From The Heart",
        subtitle: "Personalised photo frames, mugs & more — starting ₹99",
        ctaText: "Shop Now", ctaLink: "/products",
      },
      {
        id: "default-2", active: true, order: 1,
        imageUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1200&q=80",
        title: "Design Your Gift with AI ✨",
        subtitle: "Describe the occasion — AI creates the perfect personalised message",
        ctaText: "Try AI Design", ctaLink: "/ai-design",
      },
      {
        id: "default-3", active: true, order: 2,
        imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80",
        title: "Bulk & Corporate Gifts",
        subtitle: "Special pricing for 50+ pieces · Delivered pan-India",
        ctaText: "Get a Quote", ctaLink: "/contact",
      },
    ];

    // Default product sections (used when admin hasn't configured any)
    const DEFAULT_SECTIONS = [
      { id: "ds1", type: "best-selling",   title: "Best Sellers",     subtitle: "Our most-loved gifts",         active: true, order: 0 },
      { id: "ds2", type: "new-arrivals",   title: "New Arrivals",     subtitle: "Fresh from our collection",    active: true, order: 1 },
      { id: "ds3", type: "kids-zone",      title: "Kids Zone",        subtitle: "Fun gifts for little ones 🧸", active: true, order: 2 },
      { id: "ds4", type: "business-needs", title: "Corporate Gifts",  subtitle: "For teams & businesses",       active: true, order: 3 },
    ];

    // Prefer the new unified config when present.
    const newCfg = map["homepage_config"] as
      | { sections?: unknown[]; version?: number }
      | undefined;
    if (newCfg && Array.isArray(newCfg.sections) && newCfg.sections.length > 0) {
      // Derive legacy `heroSlides` and `sections` arrays so the current
      // public homepage still renders during the renderer migration.
      const s = newCfg.sections as Array<{ type?: string; config?: { slides?: unknown[] } }>;
      const heroSection = s.find((x) => x.type === "hero");
      const heroSlides = heroSection?.config?.slides ?? DEFAULT_SLIDES;
      const legacySections = s
        .filter((x) => x.type === "product-row")
        .map((sec, i) => {
          const cfg = (sec as { config?: Record<string, unknown> }).config ?? {};
          const src = (cfg.source as string) ?? "new-arrivals";
          return {
            id: (sec as { id?: string }).id ?? `ls${i}`,
            type: src === "category" ? "category-row"
              : src === "collection" ? "collection-row"
              : src,
            title: (sec as { title?: string }).title ?? "",
            subtitle: (sec as { subtitle?: string }).subtitle,
            collectionSlug: cfg.collectionSlug as string | undefined,
            categoryName: cfg.categoryName as string | undefined,
            active: (sec as { active?: boolean }).active !== false,
            order: (sec as { order?: number }).order ?? i,
          };
        });
      return {
        heroSlides,
        sections: legacySections.length > 0 ? legacySections : DEFAULT_SECTIONS,
        config: newCfg,  // new unified payload for the new public renderer
      };
    }

    const heroSlides = (map["homepage_hero_slides"] as unknown[]) ?? [];
    const sections   = (map["homepage_sections"]   as unknown[]) ?? [];

    return {
      heroSlides: heroSlides.length > 0 ? heroSlides : DEFAULT_SLIDES,
      sections:   sections.length   > 0 ? sections   : DEFAULT_SECTIONS,
      config: null,  // signals to new public renderer to fall back to legacy shape
    };
  }
}

// ── Public settings — no auth required ────────────────────────────────────────
// Returns a safe, whitelisted subset of site settings needed by the storefront
// (COD fee, Razorpay toggle, delivery thresholds, etc.)
@Controller("settings")
class PublicSettingsController {
  constructor(private prisma: PrismaService) {}

  @Get("public")
  async public() {
    const WHITELIST = [
      "cod_enabled",
      "cod_charge",
      "razorpay_enabled",
      "razorpay_key_id",          // public key — safe to expose
      "delivery_charge",
      "free_delivery_above",
      "legal_links",              // policy URLs for mobile app
    ];
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: WHITELIST } },
    });
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      out[r.key] = r.value;
    }
    // Parse legal_links JSON if stored as string
    let legalLinks: Record<string, string> | null = null;
    try {
      const raw = out["legal_links"];
      legalLinks = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, string> ?? null;
    } catch { /* use null */ }

    const str = (k: string, def: string) => {
      const v = out[k];
      return (typeof v === "string" ? v : String(v ?? "")) || def;
    };
    // Sensible defaults so the storefront never crashes on a fresh install
    return {
      cod_enabled:          str("cod_enabled",       "true"),
      cod_charge:           str("cod_charge",         "50"),
      razorpay_enabled:     str("razorpay_enabled",  "false"),
      razorpay_key_id:      str("razorpay_key_id",   ""),
      delivery_charge:      str("delivery_charge",   "0"),
      free_delivery_above:  str("free_delivery_above","499"),
      legal_links: legalLinks ?? {
        privacy_policy: "https://gifteeng.com/privacy-policy",
        terms:          "https://gifteeng.com/terms-and-conditions",
        shipping:       "https://gifteeng.com/shipping-policy",
        returns:        "https://gifteeng.com/return-policy",
      },
    };
  }

  /**
   * GET /api/settings/:key
   *
   * Single-key fetch for settings whitelisted as public-readable. Used by
   * components like AnnouncementBar that pull one specific setting without
   * loading the whole bundle. Returns { value: string|null }.
   *
   * Accepted keys: anything from PUBLIC_KEY_ALLOWLIST below. Unknown keys
   * return 404 to avoid leaking arbitrary settings.
   */
  @Get(":key")
  async getOne(@Param("key") key: string) {
    const PUBLIC_KEY_ALLOWLIST = new Set([
      "homepage_announcement_bar",
      "homepage_hero_message",
      "trust_strip_config",
      "footer_config",
      "shipping_policy_text",
      "return_policy_text",
      "marketing_consent_text",
      // Marketing / analytics tags. The web b2c layout reads these at
      // first paint and injects the corresponding tracker scripts (GTM,
      // GA4, Meta Pixel, Google Ads, Search Console verification).
      // Public keys only — secrets like the Meta CAPI access token live
      // server-side and are read by the API directly, never exposed.
      "marketing_config",
      // Extend as you add more publicly-readable settings.
    ]);
    if (!PUBLIC_KEY_ALLOWLIST.has(key)) {
      throw new NotFoundException(`Setting '${key}' is not publicly readable`);
    }
    const row = await this.prisma.siteSetting.findUnique({ where: { key } });
    if (!row) return { key, value: null };
    // Try to JSON-parse — frontend gets structured data when applicable.
    let value: unknown = row.value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { value = JSON.parse(trimmed); } catch { /* keep as string */ }
      }
    }
    return { key, value };
  }
}

@Module({
  imports: [AiModule],
  controllers: [AdminController, SettingsController, AiController, HomepageConfigController, PublicSettingsController],
})
export class AdminModule {}

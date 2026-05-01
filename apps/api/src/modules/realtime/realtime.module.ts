import { Global, Module, OnModuleInit } from "@nestjs/common";
import { RealtimeService } from "./realtime.service";
import { RealtimeController } from "./realtime.controller";
import { PrismaService } from "../../prisma/prisma.service";
import { CacheService } from "../cache/cache.service";

/**
 * Marked @Global so any feature module can inject RealtimeService
 * without re-importing this module — saves a 30-line module-graph diff
 * across cart / wishlist / coins / orders / checkout.
 *
 * On bootstrap we install a Prisma middleware that broadcasts every
 * mutation on a public-content table (Product, Category, Collection,
 * HeroBanner, Announcement, Testimonial, SiteSetting, DesignTemplate,
 * ThankYouCard) as a `publishGlobal(<scope>)` event — so admin edits
 * propagate to every connected client (web + Flutter) without each
 * service having to manually call publishGlobal().
 *
 * The same broadcast also drops the cached read-side for that scope so
 * the next listing render fetches fresh data instead of serving a
 * stale TTL.
 */

// Cache namespace each scope maps to. A mutation publishing scope `s`
// drops every key under `<prefix>*`. Keep these in sync with whatever
// the catalog services use as their CACHE_PREFIX.
const SCOPE_CACHE_PREFIXES: Record<string, string[]> = {
  products:      ["products:"],
  categories:    ["categories:"],
  collections:   ["collections:", "products:"], // collection moves shift list ordering
  banners:       ["banners:"],
  announcements: ["announcements:"],
  testimonials:  ["testimonials:"],
  settings:      ["settings:"],
  customizer:    ["customizer:"],
};

@Global()
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule implements OnModuleInit {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  onModuleInit() {
    this.prisma.setRealtimeBroadcast((scope) => {
      // Drop relevant cache namespaces FIRST so a client that pulls
      // fresh data immediately after the SSE invalidate gets the new
      // value, not a stale cache hit that races the cache TTL.
      const prefixes = SCOPE_CACHE_PREFIXES[scope] ?? [];
      for (const p of prefixes) {
        // Fire-and-forget — never block the mutation on cache I/O.
        void this.cache.delByPattern(`${p}*`);
      }
      this.realtime.publishGlobal(scope as any);
    });
  }
}

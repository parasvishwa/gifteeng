import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@gifteeng/db";

// Realtime broadcast hook — set lazily at runtime by RealtimeModule via
// `prisma.setRealtimeBroadcast(fn)` so we don't introduce a hard
// circular dependency between PrismaService and RealtimeService at
// module-construction time. Called from a single $use middleware below.
type BroadcastFn = (scope: string) => void;

// Maps Prisma model names → realtime scope names. Any model NOT in this
// map is treated as "private" and never broadcasts.
const MODEL_TO_SCOPE: Record<string, string> = {
  Product:        "products",
  Category:       "categories",
  Collection:     "collections",
  ProductCollection: "collections",
  HeroBanner:     "banners",
  Announcement:   "announcements",
  Testimonial:    "testimonials",
  SiteSetting:    "settings",
  DesignTemplate: "customizer",
  ThankYouCard:   "customizer",
};

const MUTATING_ACTIONS = new Set([
  "create",   "createMany",
  "update",   "updateMany",
  "upsert",
  "delete",   "deleteMany",
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);
  private broadcast: BroadcastFn | null = null;

  /**
   * Wires up the realtime broadcast hook. Called by RealtimeModule
   * during onModuleInit so every mutation on a public-content table
   * fans out a `publishGlobal(<scope>)` event.
   */
  setRealtimeBroadcast(fn: BroadcastFn) {
    this.broadcast = fn;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.log.log("Prisma connected");
    } catch (err) {
      this.log.warn(
        `Prisma $connect failed at startup — will retry on first query. ${(err as Error).message}`,
      );
    }
    // Install the broadcast middleware after $connect so it doesn't
    // block startup if the broadcast hook isn't wired yet.
    this.$use(async (params, next) => {
      const result = await next(params);
      if (params.model && MUTATING_ACTIONS.has(params.action)) {
        const scope = MODEL_TO_SCOPE[params.model];
        if (scope && this.broadcast) {
          try { this.broadcast(scope); } catch { /* never break the query */ }
        }
      }
      return result;
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

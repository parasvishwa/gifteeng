import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import { AnnouncementsService } from "./announcements.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const upsertSchema = z.object({
  title:       z.string().min(1).max(160),
  subtitle:    z.string().max(240).nullable().optional(),
  emoji:       z.string().max(12).nullable().optional(),
  // Slug used by the mobile banner to build /shop?occasion=<slug>. Lower-
  // case kebab so it round-trips cleanly through query strings and tags.
  slug:        z.string().max(80).regex(/^[a-z0-9-]*$/, "lowercase, digits, dashes only").nullable().optional(),
  placement:   z.enum(["home", "shop", "checkout", "all"]).optional(),
  link:        z.string().max(500).optional(),
  eventDate:   z.string().datetime().nullable().optional(),
  startsAt:    z.string().datetime().nullable().optional(),
  endsAt:      z.string().datetime().nullable().optional(),
  gradient:    z.array(z.string()).optional(),
  bannerImage: z.string().max(1024).nullable().optional(),
  // Occasion → catalog routing for the "Shop Now" CTA. Both are JSON
  // string-arrays — the schema accepts at most 50 entries each so admins
  // can't accidentally crash the row size.
  collectionSlugs: z.array(z.string().min(1).max(120)).max(50).optional(),
  categoryNames:   z.array(z.string().min(1).max(120)).max(50).optional(),
  active:      z.boolean().optional(),
  order:       z.number().int().optional(),
});

const patchSchema = upsertSchema.partial();

@ApiTags("announcements")
@Controller()
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  /**
   * GET /api/announcements?active=true&placement=home&pageSize=10
   *
   * Public home-screen banner feed. Respects the time-window (startsAt /
   * endsAt) so admins can pre-schedule festival banners without them
   * showing before their start date.
   *
   * No auth. Safe to cache at CDN for 60s.
   */
  @Get("announcements")
  // Public banner feed — cache at edge. Announcements are time-windowed so
  // a 5-min CDN TTL is safe: even if an admin pushes a new banner, the
  // `endsAt` gate will retire stale banners within seconds of TTL expiry.
  @Header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=30")
  @ApiQuery({ name: "placement", required: false })
  @ApiQuery({ name: "active",    required: false })
  @ApiQuery({ name: "pageSize",  required: false })
  listPublic(
    @Query("placement") placement?: string,
    @Query("active")    active?: string,
    @Query("pageSize")  pageSize?: string,
  ) {
    return this.service.listPublic({
      placement,
      active,
      pageSize: toInt(pageSize),
    });
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/announcements")
  listAdmin(
    @Query("pageSize") pageSize?: string,
    @Query("page")     page?: string,
  ) {
    return this.service.listAdmin({
      pageSize: toInt(pageSize),
      page:     toInt(page),
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/announcements")
  create(
    @Body(new ZodValidationPipe(upsertSchema))
    body: z.infer<typeof upsertSchema>,
  ) {
    return this.service.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch("admin/announcements/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(patchSchema))
    body: z.infer<typeof patchSchema>,
  ) {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete("admin/announcements/:id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}

function toInt(v?: string): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

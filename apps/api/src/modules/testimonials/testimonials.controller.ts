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

import { TestimonialsService, type TestimonialStatus } from "./testimonials.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

// ─── Validation schemas ─────────────────────────────────────────────────────

const upsertSchema = z.object({
  name:         z.string().min(1).max(80),
  avatar:       z.string().url().max(1024).nullable().optional(),
  location:     z.string().max(120).nullable().optional(),
  rating:       z.number().int().min(1).max(5).optional(),
  text:         z.string().min(4).max(2000),
  verified:     z.boolean().optional(),
  featured:     z.boolean().optional(),
  status:       z.enum(["pending", "approved", "rejected"]).optional(),
  productId:    z.string().uuid().nullable().optional(),
  productTitle: z.string().max(200).nullable().optional(),
  productImage: z.string().max(1024).nullable().optional(),
  productSlug:  z.string().max(200).nullable().optional(),
  order:        z.number().int().optional(),
});

const patchSchema = upsertSchema.partial();

@ApiTags("testimonials")
@Controller()
export class TestimonialsController {
  constructor(private readonly service: TestimonialsService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  /**
   * GET /api/testimonials?status=approved&pageSize=10&page=0
   *
   * Public home-carousel feed. Featured items sort to the top, then by
   * admin-set `order` (desc), then by recency. Default status is
   * `approved`; pass `status=all` to see everything (still public!).
   *
   * No auth. Safe to cache at CDN for 60s.
   */
  @Get("testimonials")
  // Public content — safe to cache at the edge. Browser TTL 60s, CDN TTL 5m.
  // `stale-while-revalidate` lets CDN serve stale for another 30s while
  // fetching a fresh copy in the background — no visible latency spikes.
  @Header("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=30")
  @ApiQuery({ name: "status",   required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @ApiQuery({ name: "page",     required: false })
  listPublic(
    @Query("status")   status?: string,
    @Query("pageSize") pageSize?: string,
    @Query("page")     page?: string,
  ) {
    return this.service.listPublic({
      status:   (status as TestimonialStatus | "all" | undefined) ?? "approved",
      pageSize: toInt(pageSize),
      page:     toInt(page),
    });
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** GET /api/admin/testimonials — list all (any status), paginated. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/testimonials")
  listAdmin(
    @Query("status")   status?: string,
    @Query("pageSize") pageSize?: string,
    @Query("page")     page?: string,
  ) {
    return this.service.listAdmin({
      status:   status as TestimonialStatus | "all" | undefined,
      pageSize: toInt(pageSize),
      page:     toInt(page),
    });
  }

  /** POST /api/admin/testimonials — create. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/testimonials")
  create(
    @Body(new ZodValidationPipe(upsertSchema))
    body: z.infer<typeof upsertSchema>,
  ) {
    return this.service.create(body);
  }

  /** PATCH /api/admin/testimonials/:id — partial update. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch("admin/testimonials/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(patchSchema))
    body: z.infer<typeof patchSchema>,
  ) {
    return this.service.update(id, body);
  }

  /** POST /api/admin/testimonials/:id/approve — quick approve. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/testimonials/:id/approve")
  approve(@Param("id") id: string) {
    return this.service.approve(id);
  }

  /** POST /api/admin/testimonials/:id/reject — quick reject. */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/testimonials/:id/reject")
  reject(@Param("id") id: string) {
    return this.service.reject(id);
  }

  /** DELETE /api/admin/testimonials/:id */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete("admin/testimonials/:id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}

function toInt(v?: string): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

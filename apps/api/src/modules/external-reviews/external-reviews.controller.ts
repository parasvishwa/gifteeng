import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ExternalReviewsService, ExternalReviewInput } from "./external-reviews.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const reviewSchema = z.object({
  source:       z.string().min(1).max(40).optional(),
  sourceLogo:   z.string().nullable().optional(),
  sourceUrl:    z.string().nullable().optional(),
  rating:       z.number().int().min(1).max(5).optional(),
  title:        z.string().nullable().optional(),
  body:         z.string().min(1).max(5000).optional(),
  author:       z.string().nullable().optional(),
  authorAvatar: z.string().nullable().optional(),
  reviewDate:   z.string().nullable().optional(),
  productId:    z.string().uuid().nullable().optional(),
  isApproved:   z.boolean().optional(),
  sortOrder:    z.number().int().optional(),
});

// PERMISSIVE schema — the service does row-by-row sanitisation + skip-on-fail.
// One badly-shaped row from a scraper (empty body, malformed URL, decimal
// rating like 4.5) must NOT kill the entire batch via Zod validation. The
// service skips bad rows individually and reports them in the response.
const bulkImportSchema = z.object({
  source:     z.string().min(1).max(40),
  productId:  z.string().uuid().nullable().optional(),
  reviews:    z.array(z.object({
    rating:       z.number().min(1).max(5),                       // float OK; service rounds
    title:        z.string().nullable().optional(),
    body:         z.string().max(5000).optional(),                // empty rows skipped in service
    author:       z.string().nullable().optional(),
    authorAvatar: z.string().nullable().optional(),
    reviewDate:   z.string().nullable().optional(),
    sourceUrl:    z.string().nullable().optional(),
    sourceLogo:   z.string().nullable().optional(),
    // Loose strings — service regex-validates URLs and drops invalid ones.
    photoUrls:    z.array(z.string()).max(20).optional(),
    videoUrl:     z.string().nullable().optional(),
    isApproved:   z.boolean().optional(),
    sortOrder:    z.number().int().optional(),
  })).min(1).max(200),
});

@ApiTags("external-reviews")
@Controller()
export class ExternalReviewsController {
  constructor(private readonly service: ExternalReviewsService) {}

  // ── Public — used by /b2c/reviews page (web + Flutter) ─────────────────

  /**
   * GET /api/reviews/aggregated?productId=&page=&pageSize=&source=
   *
   * Combined feed: native Gifteeng reviews + external marketplace reviews.
   * Always rating>=4 (admin moderates approval).
   */
  @Get("reviews/aggregated")
  publicAggregated(
    @Query("productId") productId?: string,
    @Query("page")      page?:      string,
    @Query("pageSize")  pageSize?:  string,
    @Query("source")    source?:    string,
  ) {
    return this.service.getPublicAggregated({
      productId,
      page:     page     ? Number(page)     : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      source,
    });
  }

  /**
   * GET /api/reviews/stats?productId=
   *
   * Header stats for the reviews page — total count, weighted average,
   * per-source breakdown.
   */
  @Get("reviews/stats")
  publicStats(@Query("productId") productId?: string) {
    return this.service.getStats(productId);
  }

  // ── Admin CRUD on external reviews ──────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/external-reviews")
  list(
    @Query("source")     source?:     string,
    @Query("productId")  productId?:  string,
    @Query("isApproved") isApproved?: string,
    @Query("limit")      limit?:      string,
  ) {
    return this.service.listAll({
      source,
      productId,
      isApproved: isApproved === undefined ? undefined : isApproved === "true",
      limit:      limit ? Number(limit) : 200,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/external-reviews")
  create(@Body(new ZodValidationPipe(reviewSchema)) body: ExternalReviewInput) {
    return this.service.create(body);
  }

  /**
   * POST /api/admin/external-reviews/bulk-import
   *
   * Used by the Chrome extension after the admin checks/unchecks reviews
   * scraped from Amazon/Flipkart/Myntra/Google. Imports all in one shot
   * with the same source + optional product tag.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/external-reviews/bulk-import")
  bulkImport(@Body(new ZodValidationPipe(bulkImportSchema)) body: any) {
    return this.service.bulkImport(body);
  }

  /**
   * POST /api/admin/external-reviews/bulk-assign
   *
   * Tag a batch of external reviews to the same product in one shot.
   * Used by the External Reviews admin page after the admin selects
   * multiple imported reviews and picks a product.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/external-reviews/bulk-assign")
  bulkAssign(@Body() body: { ids?: string[]; productId?: string | null }) {
    return this.service.bulkAssignProduct(
      Array.isArray(body?.ids) ? body.ids : [],
      body?.productId ?? null,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Patch("admin/external-reviews/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviewSchema)) body: ExternalReviewInput,
  ) {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/external-reviews/:id/approve")
  approve(@Param("id") id: string, @Body() body: { isApproved?: boolean }) {
    return this.service.approve(id, body?.isApproved ?? true);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete("admin/external-reviews/:id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}

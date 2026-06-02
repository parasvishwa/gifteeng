import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ProductsService } from "./products.service";
import { ProductListQuerySchema } from "@gifteeng/shared";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PermissionsGuard, RequirePermissions } from "../auth-b2b/permissions.guard";
import { PERMISSIONS } from "../auth-b2b/permissions";
import { SeoEnrichmentService } from "../seo/seo-enrichment.service";

const moneyLike = z.union([z.number(), z.string()]);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

const createProductSchema = z.object({
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  brandName: z.string().optional(),
  basePrice: moneyLike,
  mrp: moneyLike.nullish(),
  currency: z.string().optional(),
  sku: z.string().optional(),
  inventory: z.number().int().nonnegative().optional(),
  isCustomizable: z.boolean().optional(),
  images: z.any().optional(),
  mockupTemplates: z.any().optional(),
  b2cEnabled: z.boolean().optional(),
  b2bEnabled: z.boolean().optional(),
  ownerCompanyId: z.string().uuid().nullish(),
  metadata: z.any().optional(),
});

const updateProductSchema = createProductSchema.partial();

const variantSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
  priceDelta: moneyLike.optional(),
  sku: z.string().optional(),
  inventory: z.number().int().nonnegative().optional(),
  image: z.string().optional(),
  images: z.any().optional(),
  customizationMode: z.string().nullable().optional(),
});

const variantUpdateSchema = z.object({
  priceDelta: moneyLike.optional(),
  sku: z.string().optional(),
  inventory: z.number().int().nonnegative().optional(),
  image: z.string().optional(),
  images: z.any().optional(),
  customizationMode: z.string().nullable().optional(),
});

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(
    private service: ProductsService,
    private seo: SeoEnrichmentService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(ProductListQuerySchema)) q: any) {
    return this.service.listB2c(q);
  }

  // ---- Admin CRUD ----

  // Note: The three endpoints below pair the legacy RolesGuard with the new
  // PermissionsGuard so that a super-admin can grant fine-grained permissions
  // (e.g. "products.create" only) to teammates without giving them blanket
  // sales_admin privileges. RolesGuard still runs first as a coarse gate.

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  @Post("admin")
  @UsePipes(new ZodValidationPipe(createProductSchema))
  createAdmin(@Body() body: z.infer<typeof createProductSchema>) {
    return this.service.createAdmin(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  @Patch("admin/:id")
  updateAdmin(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductSchema))
    body: z.infer<typeof updateProductSchema>,
  ) {
    return this.service.updateAdmin(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.PRODUCTS_DELETE)
  @Delete("admin/:id")
  deleteAdmin(@Param("id") id: string) {
    return this.service.softDeleteAdmin(id);
  }

  // Multi-select delete — accepts { ids: string[] } and returns a summary.
  // Used by the admin products list "Delete selected" button.
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/bulk-delete")
  bulkDeleteAdmin(@Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    return this.service.bulkDeleteAdmin(ids);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/:id/variants")
  addVariant(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(variantSchema)) body: z.infer<typeof variantSchema>,
  ) {
    return this.service.addVariant(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch("admin/variants/:variantId")
  updateVariant(
    @Param("variantId") variantId: string,
    @Body(new ZodValidationPipe(variantUpdateSchema)) body: z.infer<typeof variantUpdateSchema>,
  ) {
    return this.service.updateVariant(variantId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Delete("admin/variants/:variantId")
  removeVariant(@Param("variantId") variantId: string) {
    return this.service.removeVariant(variantId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post()
  @UsePipes(new ZodValidationPipe(createProductSchema))
  createAlias(@Body() body: z.infer<typeof createProductSchema>) {
    return this.service.createAdmin(body as any);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch(":id")
  updateAlias(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductSchema))
    body: z.infer<typeof updateProductSchema>,
  ) {
    return this.service.updateAdmin(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch(":id/collections")
  setCollections(
    @Param("id") id: string,
    @Body() body: { collectionIds: string[] },
  ) {
    return this.service.setCollections(id, body.collectionIds ?? []);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/list")
  listAdmin(
    @Query(new ZodValidationPipe(ProductListQuerySchema)) q: any,
    @Query("status") status?: "draft" | "published",
  ) {
    return this.service.listAdmin({ ...q, status });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/by-slug/:slug")
  getAdminBySlug(@Param("slug") slug: string) {
    return this.service.getAdminBySlug(slug);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch("admin/:id/fbt")
  setFbt(
    @Param("id") id: string,
    @Body() body: { fbtIds?: string[] },
  ) {
    return this.service.setFbtProducts(id, body.fbtIds ?? []);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/:id/enrich-from-amazon")
  enrichFromAmazon(@Param("id") id: string) {
    return this.service.enrichFromAmazon(id);
  }

  // ── SEO endpoints ─────────────────────────────────────────────────────────

  /**
   * GET /api/products/admin/:id/seo
   * Returns current SEO data + score + improvement suggestions.
   * Read-only — does not modify the product.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Get("admin/:id/seo")
  async getSeoPreview(@Param("id") id: string) {
    const product = await this.service.getAdminBySlug(id);
    if (!product) return { error: "Product not found" };
    return this.seo.getSeoPreview({
      id: product.id,
      slug: (product as any).slug,
      title: (product as any).title,
      description: (product as any).description,
      category: (product as any).category,
      basePrice: (product as any).basePrice,
      currency: (product as any).currency,
      images: (product as any).images,
      isCustomizable: (product as any).isCustomizable,
      metadata: (product as any).metadata,
    });
  }

  /**
   * POST /api/products/admin/:id/seo/regenerate?ai=true
   * Regenerates SEO metadata for a single product.
   * ?ai=true forces AI enrichment even if auto-AI is disabled.
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin/:id/seo/regenerate")
  async regenerateSeo(
    @Param("id") id: string,
    @Query("ai") ai?: string,
  ) {
    const product = await this.service.getAdminBySlug(id);
    if (!product) return { error: "Product not found" };
    const forceAi = ai === "true" || ai === "1";
    const result = await this.seo.enrichProduct(
      {
        id: (product as any).id,
        slug: (product as any).slug,
        title: (product as any).title,
        description: (product as any).description,
        category: (product as any).category,
        basePrice: (product as any).basePrice,
        currency: (product as any).currency,
        images: (product as any).images,
        isCustomizable: (product as any).isCustomizable,
        metadata: { ...(((product as any).metadata) ?? {}), seo: undefined }, // force regen
      },
      forceAi,
    );
    return { success: true, seo: result };
  }

  /**
   * POST /api/products/admin/seo/bulk-regenerate
   * Bulk-regenerates SEO for all B2C products missing SEO metadata.
   * Body: { onlyMissing?: boolean; limit?: number; forceAi?: boolean }
   */
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post("admin/seo/bulk-regenerate")
  async bulkRegenerateSeo(
    @Body() body?: { onlyMissing?: boolean; limit?: number; forceAi?: boolean },
  ) {
    const result = await this.seo.bulkEnrich({
      onlyMissing: body?.onlyMissing ?? true,
      limit:       body?.limit       ?? 200,
      forceAi:     body?.forceAi     ?? false,
    });
    return { success: true, ...result };
  }

  @Get("categories/list")
  listCategories() {
    return this.service.listCategories();
  }

  @Get("variant-types/list")
  listVariantTypes() {
    return this.service.listVariantTypes();
  }

  /**
   * GET /api/products/:slug/recommendations?limit=8
   * Returns products related to :slug (same category, freshest, in-stock).
   * Public — consumed by mobile product-detail page + web "You may also like".
   * Must be declared BEFORE :slug (order matters in NestJS routing).
   */
  @Get(":slug/recommendations")
  recommendations(
    @Param("slug") slug: string,
    @Query("limit") limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 8;
    return this.service.getRecommendationsFor(
      slug,
      Number.isFinite(n) && n > 0 ? n : 8,
    );
  }

  @Get(":slug")
  get(@Param("slug") slug: string) {
    return this.service.getBySlug(slug);
  }
}

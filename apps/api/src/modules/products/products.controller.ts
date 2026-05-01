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
  basePrice: moneyLike,
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
  constructor(private service: ProductsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(ProductListQuerySchema)) q: any) {
    return this.service.listB2c(q);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard)
  @Get("b2b/catalog")
  b2bCatalog(@Req() req: any, @Query(new ZodValidationPipe(ProductListQuerySchema)) q: any) {
    return this.service.listB2b(req.user.companyId, q);
  }

  // ---- Admin CRUD ----

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin")
  @UsePipes(new ZodValidationPipe(createProductSchema))
  createAdmin(@Body() body: z.infer<typeof createProductSchema>) {
    return this.service.createAdmin(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch("admin/:id")
  updateAdmin(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProductSchema))
    body: z.infer<typeof updateProductSchema>,
  ) {
    return this.service.updateAdmin(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
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
  @Post("admin/:id/enrich-from-amazon")
  enrichFromAmazon(@Param("id") id: string) {
    return this.service.enrichFromAmazon(id);
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

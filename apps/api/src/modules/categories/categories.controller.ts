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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CategoriesService } from "./categories.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { PermissionsGuard, RequirePermissions } from "../auth-b2b/permissions.guard";
import { PERMISSIONS } from "../auth-b2b/permissions";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const createSchema = z.object({
  name: z.string().min(1),
  image: z.string().optional(),
  parent_id: z.string().uuid().nullish(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

@ApiTags("categories")
@Controller("categories")
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  /**
   * GET /api/categories
   *
   * Query params:
   *   pageSize               — cap list length
   *   withPreviews=true      — include up to N product thumbnails per category
   *   previewsPerCategory=3  — size of preview array (1..6)
   *
   * When `withPreviews=true`, each category row includes a `previews` field:
   *   [{ url, productId, title, slug }, …]
   *
   * This replaces the old N+1 pattern where the mobile home screen made one
   * /products?category=X&pageSize=3 call PER category card. Now the home
   * bento can load everything in a single request.
   */
  @Get()
  // Categories rarely change. 2-minute browser cache, 10-minute CDN cache,
  // with stale-while-revalidate for instant-feel even on edge misses.
  @Header("Cache-Control", "public, max-age=120, s-maxage=600, stale-while-revalidate=60")
  list(
    @Query("pageSize")            pageSize?: string,
    @Query("withPreviews")        withPreviews?: string,
    @Query("previewsPerCategory") previewsPerCategory?: string,
  ): Promise<unknown[]> {
    const size = pageSize ? parseInt(pageSize, 10) : undefined;
    const want = withPreviews === "true" || withPreviews === "1";
    const perCat = previewsPerCategory ? parseInt(previewsPerCategory, 10) : undefined;
    return this.service.list({
      pageSize: size,
      withPreviews: want,
      previewsPerCategory: perCat,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.CATEGORIES_CREATE)
  @Post("admin")
  create(
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ): Promise<unknown> {
    return this.service.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.CATEGORIES_EDIT)
  @Patch("admin/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<unknown> {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard, PermissionsGuard)
  @Roles("super_admin", "sales_admin", "hr_admin", "production", "employee")
  @RequirePermissions(PERMISSIONS.CATEGORIES_DELETE)
  @Delete("admin/:id")
  remove(@Param("id") id: string): Promise<unknown> {
    return this.service.remove(id);
  }
}

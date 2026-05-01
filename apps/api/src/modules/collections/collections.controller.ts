import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CollectionsService } from "./collections.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const createSchema = z.object({
  slug: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  heroImage: z.string().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const addProductsSchema = z.object({
  product_ids: z.array(z.string().uuid()).optional(),
  productIds: z.array(z.string().uuid()).optional(),
});

const removeProductSchema = z.object({
  product_id: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

const updateSchema = createSchema.partial();

@ApiTags("collections")
@Controller("collections")
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  @Get()
  list(@Query("all") all?: string): Promise<unknown[]> {
    return this.service.list(all === "true");
  }

  @Get(":slug")
  getBySlug(@Param("slug") slug: string): Promise<unknown> {
    return this.service.getBySlug(slug);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(@Body() body: z.infer<typeof createSchema>): Promise<unknown> {
    return this.service.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<unknown> {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Delete(":id")
  remove(@Param("id") id: string): Promise<unknown> {
    return this.service.remove(id);
  }

  // Aliases for legacy admin UI that uses POST-based actions.
  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post(":id/delete")
  removeViaPost(@Param("id") id: string): Promise<unknown> {
    return this.service.remove(id);
  }

  @Get(":id/products")
  listProducts(@Param("id") id: string): Promise<unknown[]> {
    return this.service.listProducts(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/products")
  addProducts(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addProductsSchema))
    body: z.infer<typeof addProductsSchema>,
  ): Promise<unknown> {
    const ids = body.product_ids ?? body.productIds ?? [];
    return this.service.addProducts(id, ids);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post(":id/products/remove")
  removeProduct(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(removeProductSchema))
    body: z.infer<typeof removeProductSchema>,
  ): Promise<unknown> {
    const pid = body.product_id ?? body.productId;
    if (!pid) return Promise.resolve({ ok: true });
    return this.service.removeProduct(id, pid);
  }
}

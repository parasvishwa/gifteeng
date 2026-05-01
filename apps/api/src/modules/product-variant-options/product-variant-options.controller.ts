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
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { ProductVariantOptionsService } from "./product-variant-options.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const createSchema = z.object({
  variant_type: z.string().min(1),
  value: z.string().min(1),
  sort_order: z.number().int().optional(),
  hex_color: z.string().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const updateSchema = z.object({
  value: z.string().min(1).optional(),
  sort_order: z.number().int().optional(),
  hex_color: z.string().optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

@ApiTags("product-variant-options")
@Controller("product-variant-options")
export class ProductVariantOptionsController {
  constructor(private readonly service: ProductVariantOptionsService) {}

  @Get()
  list(
    @Query("pageSize") pageSize?: string,
    @Query("variant_type") variantType?: string,
  ): Promise<unknown[]> {
    const size = pageSize ? parseInt(pageSize, 10) : undefined;
    return this.service.list(size, variantType);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post("admin")
  create(
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ): Promise<unknown> {
    return this.service.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch("admin/:id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<unknown> {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Delete("admin")
  removeByType(@Query("variant_type") variantType: string): Promise<unknown> {
    return this.service.removeByType(variantType);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Delete("admin/:id")
  remove(@Param("id") id: string): Promise<unknown> {
    return this.service.remove(id);
  }
}

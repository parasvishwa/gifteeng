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
import { StockImagesService } from "./stock-images.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

const createSchema = z.object({
  // Accept both camelCase (url) and snake_case (image_url) from the frontend
  url: z.string().url().optional(),
  image_url: z.string().url().optional(),
  alt: z.string().optional(),
  label: z.string().optional(),
  category: z.string().optional(),
  tags: z.any().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
}).refine((d) => d.url || d.image_url, { message: "url or image_url is required" });

const updateSchema = z.object({
  alt: z.string().optional(),
  label: z.string().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

@ApiTags("stock-images")
@Controller("stock-images")
export class StockImagesController {
  constructor(private readonly service: StockImagesService) {}

  @Get()
  list(
    @Query("category") category?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    return this.service.list({
      category,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<unknown> {
    return this.service.getById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(@Body() body: z.infer<typeof createSchema>): Promise<unknown> {
    return this.service.create({
      url: (body.image_url ?? body.url)!,
      alt: body.alt,
      label: body.label,
      category: body.category,
      tags: body.tags,
      width: body.width,
      height: body.height,
      isActive: body.is_active,
      sortOrder: body.sort_order,
    });
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin")
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
}

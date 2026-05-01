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
import { VideosService } from "./videos.service";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

// Accept both snake_case (frontend) and camelCase field names
const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  // url or video_url
  url: z.string().url().optional(),
  video_url: z.string().url().optional(),
  // thumbnailUrl or thumbnail_url
  thumbnailUrl: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  // productId or product_id
  productId: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  placement: z.string().optional(),
  // isActive or is_active
  isActive: z.boolean().optional(),
  is_active: z.boolean().optional(),
  // isFloating or show_floating
  isFloating: z.boolean().optional(),
  show_floating: z.boolean().optional(),
  // sortOrder or sort_order
  sortOrder: z.number().int().optional(),
  sort_order: z.number().int().optional(),
}).refine((d) => d.url || d.video_url, { message: "url or video_url is required" });

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  video_url: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  productId: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  placement: z.string().optional(),
  isActive: z.boolean().optional(),
  is_active: z.boolean().optional(),
  isFloating: z.boolean().optional(),
  show_floating: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  sort_order: z.number().int().optional(),
});

type CreateBody = z.infer<typeof createSchema>;
type UpdateBody = z.infer<typeof updateSchema>;

function toServiceInput(body: CreateBody | UpdateBody) {
  return {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.description !== undefined && { description: body.description }),
    ...((body.video_url ?? body.url) !== undefined && { url: (body.video_url ?? body.url)! }),
    ...((body.thumbnail_url ?? body.thumbnailUrl) !== undefined && { thumbnailUrl: (body.thumbnail_url ?? body.thumbnailUrl)! }),
    ...((body.product_id ?? body.productId) !== undefined && { productId: (body.product_id ?? body.productId)! }),
    ...(body.placement !== undefined && { placement: body.placement }),
    ...((body.is_active ?? body.isActive) !== undefined && { isActive: (body.is_active ?? body.isActive)! }),
    ...((body.show_floating ?? body.isFloating) !== undefined && { isFloating: (body.show_floating ?? body.isFloating)! }),
    ...((body.sort_order ?? body.sortOrder) !== undefined && { sortOrder: (body.sort_order ?? body.sortOrder)! }),
  };
}

@ApiTags("videos")
@Controller("videos")
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  list(
    @Query("placement") placement?: string,
    @Query("isActive") isActive?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    return this.videos.list({
      placement,
      isActive: isActive === undefined ? undefined : isActive === "true",
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<unknown> {
    return this.videos.getById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Post()
  @UsePipes(new ZodValidationPipe(createSchema))
  create(@Body() body: CreateBody): Promise<unknown> {
    return this.videos.create(toServiceInput(body) as any);
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateBody,
  ): Promise<unknown> {
    return this.videos.update(id, toServiceInput(body));
  }

  @ApiBearerAuth()
  @UseGuards(JwtB2bGuard, RolesGuard)
  @Roles("super_admin", "sales_admin")
  @Delete(":id")
  remove(@Param("id") id: string): Promise<unknown> {
    return this.videos.softDelete(id);
  }
}

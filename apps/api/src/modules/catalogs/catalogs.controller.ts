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
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { CatalogsService } from "./catalogs.service";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

const submitEnquirySchema = z.object({
  catalogSlug: z.string().min(1).optional(),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(3).optional(),
  companyName: z.string().min(1).optional(),
  message: z.string().optional(),
  requestedItems: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().int().positive().optional(),
        notes: z.string().optional(),
      }),
    )
    .optional(),
});

const statusSchema = z.object({
  status: z.enum(["new", "contacted", "quoted", "closed", "converted"]),
});

const createCatalogSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  heroImage: z.string().optional(),
  isPublished: z.boolean().optional(),
});

const updateCatalogSchema = createCatalogSchema.partial();

const addItemsSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1),
});

@ApiTags("catalogs")
@Controller("catalogs")
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get()
  list() {
    return this.catalogs.listPublished();
  }

  @Get(":slug")
  getBySlug(@Param("slug") slug: string) {
    return this.catalogs.getBySlug(slug);
  }

  @Post("enquiries")
  @UsePipes(new ZodValidationPipe(submitEnquirySchema))
  submitEnquiry(@Body() body: z.infer<typeof submitEnquirySchema>) {
    return this.catalogs.submitEnquiry(body);
  }
}

@ApiTags("catalogs-admin")
@Controller("catalogs/admin")
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
export class CatalogsAdminController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get("enquiries")
  listEnquiries(@Query("status") status?: string) {
    return this.catalogs.listEnquiries(status);
  }

  @Get("enquiries/:id")
  getEnquiry(@Param("id") id: string) {
    return this.catalogs.getEnquiry(id);
  }

  @Patch("enquiries/:id/status")
  @UsePipes(new ZodValidationPipe(statusSchema))
  markStatus(@Param("id") id: string, @Body() body: z.infer<typeof statusSchema>) {
    return this.catalogs.markStatus(id, body.status);
  }

  @Post("enquiries/:id/convert")
  convert(@Param("id") id: string, @Req() req: { user: { companyUserId: string } }) {
    return this.catalogs.convertToCompany(id, req.user.companyUserId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createCatalogSchema))
  createCatalog(@Body() body: z.infer<typeof createCatalogSchema>) {
    return this.catalogs.createCatalog(body);
  }

  @Patch(":id")
  updateCatalog(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCatalogSchema))
    body: z.infer<typeof updateCatalogSchema>,
  ) {
    return this.catalogs.updateCatalog(id, body);
  }

  @Post(":id/items")
  addItems(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addItemsSchema)) body: z.infer<typeof addItemsSchema>,
  ) {
    return this.catalogs.addCatalogItems(id, body.productIds);
  }

  @Delete("items/:itemId")
  removeItem(@Param("itemId") itemId: string) {
    return this.catalogs.removeCatalogItem(itemId);
  }
}

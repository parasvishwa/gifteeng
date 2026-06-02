import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post,
  Query, Req, Res, UseGuards, UseInterceptors, UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";
import { JwtSellerGuard } from "../../common/guards/jwt-seller.guard";
import { MarketplaceService } from "./marketplace.service";

type AuthedSellerRequest = Request & { user: { sellerId: string } };

const ownListingSchema = z.object({
  title:             z.string().min(2).max(160),
  description:       z.string().max(4000).optional(),
  category:          z.string().max(80).optional(),
  sku:               z.string().max(80).optional(),
  images:            z.array(z.object({ url: z.string(), alt: z.string().optional() })).optional(),
  isCustomizable:    z.boolean().optional(),
  customizationType: z.enum(["text", "photo", "design"]).optional(),
  variantOptions:    z.array(z.object({
    name:   z.string().min(1).max(80),
    values: z.array(z.string().min(1).max(80)).min(1),
  })).optional(),
  metadata:          z.record(z.unknown()).optional(),
  price:             z.number().positive(),
  stock:             z.number().int().min(0),
});

const existingRequestSchema = z.object({
  productId: z.string().uuid(),
  price:     z.number().positive(),
  stock:     z.number().int().min(0),
});

const fullUpdateSchema = z.object({
  // SellerProduct fields
  price:             z.number().positive().optional(),
  stock:             z.number().int().min(0).optional(),
  // Product fields — only applied to own listings
  title:             z.string().min(2).max(160).optional(),
  description:       z.string().max(4000).optional().nullable(),
  category:          z.string().max(80).optional().nullable(),
  sku:               z.string().max(80).optional().nullable(),
  images:            z.array(z.object({ url: z.string(), alt: z.string().optional() })).optional(),
  isCustomizable:    z.boolean().optional(),
  basePrice:         z.number().positive().optional(),
  inventory:         z.number().int().min(0).optional(),
  metadata:          z.record(z.unknown()).optional(),
});

const variantSchema = z.object({
  name:              z.string().min(1).max(80),
  value:             z.string().min(1).max(200),
  priceDelta:        z.number().optional(),
  sku:               z.string().max(80).optional().nullable(),
  inventory:         z.number().int().min(0).optional(),
  image:             z.string().optional().nullable(),
  images:            z.array(z.string()).optional(),
  customizationMode: z.string().optional().nullable(),
});

const variantPatchSchema = z.object({
  priceDelta:        z.number().optional(),
  sku:               z.string().max(80).optional().nullable(),
  inventory:         z.number().int().min(0).optional(),
  image:             z.string().optional().nullable(),
  images:            z.array(z.string()).optional(),
  customizationMode: z.string().optional().nullable(),
});

/**
 * Seller-facing product management. A seller may list a brand-new product
 * (own listing) or request to also sell an existing catalogue product.
 * Every offer is verified by a super-admin before going live.
 */
@ApiTags("seller-products")
@ApiBearerAuth()
@UseGuards(JwtSellerGuard)
@Controller("seller/products")
export class SellerProductsController {
  constructor(private readonly service: MarketplaceService) {}

  @Get()
  list(@Req() req: AuthedSellerRequest) {
    return this.service.listSellerProducts(req.user.sellerId);
  }

  /** Browse catalogue products the seller can request to also sell. */
  @Get("catalog")
  catalog(@Req() req: AuthedSellerRequest, @Query("search") search?: string) {
    return this.service.browseCatalog(req.user.sellerId, search);
  }

  /** List available template categories. */
  @Get("bulk-categories")
  bulkCategories() {
    return { categories: Object.keys(MarketplaceService.CATEGORY_EXTRA) };
  }

  /** Download a CSV template for bulk product upload. */
  @Get("bulk-template")
  bulkTemplate(@Res() res: Response, @Query("category") category?: string) {
    const csv  = this.service.generateBulkTemplate(category);
    const slug = category ? category.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "generic";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gifteeng-template-${slug}.csv"`);
    res.send("﻿" + csv);
  }

  /** Upload a filled CSV to bulk-create product listings. Max 200 rows. */
  @Post("bulk-upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async bulkUpload(
    @Req() req: AuthedSellerRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Missing file in form-data field 'file'.");
    const text = file.buffer.toString("utf-8");
    return this.service.bulkCreateListings(req.user.sellerId, text);
  }

  /** Get a single seller product offer with full product data. */
  @Get(":id")
  getOne(@Req() req: AuthedSellerRequest, @Param("id") id: string) {
    return this.service.getSellerProduct(req.user.sellerId, id);
  }

  /** Create a brand-new product owned by the seller. */
  @Post()
  createOwn(
    @Req() req: AuthedSellerRequest,
    @Body(new ZodValidationPipe(ownListingSchema)) body: z.infer<typeof ownListingSchema>,
  ) {
    return this.service.createOwnListing(req.user.sellerId, body);
  }

  /** Request to also sell an existing catalogue product. */
  @Post("request")
  requestExisting(
    @Req() req: AuthedSellerRequest,
    @Body(new ZodValidationPipe(existingRequestSchema)) body: z.infer<typeof existingRequestSchema>,
  ) {
    return this.service.requestExistingProduct(req.user.sellerId, body);
  }

  /** Add a variant to an own listing. */
  @Post(":id/variants")
  addVariant(
    @Req() req: AuthedSellerRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(variantSchema)) body: z.infer<typeof variantSchema>,
  ) {
    return this.service.addSellerVariant(req.user.sellerId, id, body);
  }

  /** Update a variant on an own listing. */
  @Patch(":id/variants/:variantId")
  updateVariant(
    @Req() req: AuthedSellerRequest,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body(new ZodValidationPipe(variantPatchSchema)) body: z.infer<typeof variantPatchSchema>,
  ) {
    return this.service.updateSellerVariant(req.user.sellerId, id, variantId, body);
  }

  /** Full update of an offer — updates SellerProduct and (for own listings) the Product. */
  @Patch(":id")
  update(
    @Req() req: AuthedSellerRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(fullUpdateSchema)) body: z.infer<typeof fullUpdateSchema>,
  ) {
    return this.service.updateSellerProductFull(req.user.sellerId, id, body);
  }

  /** Delete a variant from an own listing. */
  @Delete(":id/variants/:variantId")
  deleteVariant(
    @Req() req: AuthedSellerRequest,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
  ) {
    return this.service.deleteSellerVariant(req.user.sellerId, id, variantId);
  }

  /** Resubmit a rejected listing for review after the seller has corrected it. */
  @Post(":id/resubmit")
  resubmit(@Req() req: AuthedSellerRequest, @Param("id") id: string) {
    return this.service.resubmitSellerProduct(req.user.sellerId, id);
  }

  @Delete(":id")
  remove(@Req() req: AuthedSellerRequest, @Param("id") id: string) {
    return this.service.deleteSellerProduct(req.user.sellerId, id);
  }
}

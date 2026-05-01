/**
 * ImportsController — unified product import surface.
 *
 * This controller replaces six legacy B2C admin pages that each hit their own
 * endpoints (AdminAmazonImport, AdminShopifyImport, AdminProductImport,
 * AdminImportData, AdminUniversalImport, AdminMarketplace). All product
 * ingestion now flows through /api/imports/* guarded by super_admin +
 * sales_admin roles.
 */

import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

import { ImportsService } from "./imports.service";
import {
  AmazonImportSchema,
  type AmazonImportBody,
  type AmazonPreviewResult,
  CommitDraftsSchema,
  type CommitDraftsBody,
  ShopifyImportSchema,
  type ShopifyImportBody,
  UrlImportSchema,
  type UrlImportBody,
  type ImportResult,
} from "./imports.schemas";

type B2bAuthedRequest = Request & {
  user?: {
    companyUserId?: string;
    sub?: string;
    id?: string;
    userId?: string;
  };
};

function actorIdFrom(req: B2bAuthedRequest): string {
  const u = req.user;
  const id = u?.companyUserId ?? u?.sub ?? u?.id ?? u?.userId;
  if (!id) {
    throw new BadRequestException("Missing authenticated actor id");
  }
  return id;
}

@ApiTags("imports")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin", "sales_admin")
@Controller("imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post("amazon")
  async amazon(
    @Body(new ZodValidationPipe(AmazonImportSchema)) body: AmazonImportBody,
  ): Promise<ImportResult> {
    return this.imports.importFromAmazon(body.asinOrUrl);
  }

  @Post("amazon/preview")
  async amazonPreview(
    @Body(new ZodValidationPipe(AmazonImportSchema)) body: AmazonImportBody,
  ): Promise<AmazonPreviewResult> {
    return this.imports.previewAmazon(body.asinOrUrl);
  }

  @Post("shopify")
  async shopify(
    @Body(new ZodValidationPipe(ShopifyImportSchema)) body: ShopifyImportBody,
  ): Promise<ImportResult> {
    return this.imports.importFromShopify(body.handleOrUrl);
  }

  @Post("url")
  async url(
    @Body(new ZodValidationPipe(UrlImportSchema)) body: UrlImportBody,
  ): Promise<ImportResult> {
    return this.imports.importFromUrl(body.url);
  }

  @Post("csv")
  @UseInterceptors(FileInterceptor("file"))
  async csv(
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ): Promise<{ results: ImportResult[] }> {
    if (!file || !file.buffer) {
      throw new BadRequestException("CSV file upload required (field: 'file')");
    }
    const results = await this.imports.importFromCsv(file.buffer);
    return { results };
  }

  @Post("commit")
  async commit(
    @Body(new ZodValidationPipe(CommitDraftsSchema)) body: CommitDraftsBody,
    @Req() req: B2bAuthedRequest,
  ): Promise<{ committed: { id: string; slug: string }[] }> {
    const actorId = actorIdFrom(req);
    const committed: { id: string; slug: string }[] = [];
    for (const draft of body.drafts) {
      committed.push(await this.imports.commitDraft(draft, actorId));
    }
    return { committed };
  }
}

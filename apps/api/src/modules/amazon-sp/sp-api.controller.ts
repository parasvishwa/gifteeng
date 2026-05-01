import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

import { JwtB2bGuard } from "../../common/guards/jwt-b2b.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod.pipe";

import { SpApiService } from "./sp-api.service";
import {
  ExchangeCodeSchema,
  ListingPreviewQuerySchema,
  ListingsQuerySchema,
  PreviewQuerySchema,
  UpsertAccountSchema,
  type ExchangeCodeBody,
  type ListingPreviewQuery,
  type ListingsQuery,
  type ListingSummary,
  type PreviewQuery,
  type SpAccount,
  type UpsertAccountBody,
} from "./sp-api.schemas";
import type { AmazonPreviewResult } from "../imports/imports.schemas";

// ---------------------------------------------------------------------------
// Helper — mask sensitive fields before returning account data to clients
// ---------------------------------------------------------------------------

function maskAccount(account: SpAccount): SpAccount {
  return {
    ...account,
    clientSecret: "***",
    refreshToken: "***",
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@ApiTags("amazon-sp")
@ApiBearerAuth()
@UseGuards(JwtB2bGuard, RolesGuard)
@Roles("super_admin")
@Controller("amazon-sp")
export class SpApiController {
  constructor(private readonly spApi: SpApiService) {}

  /** List all configured SP accounts with secrets masked. */
  @Get("accounts")
  async getAccounts(): Promise<SpAccount[]> {
    const accounts = await this.spApi.getAccounts();
    return accounts.map(maskAccount);
  }

  /** Create or update a seller account. Returns the saved account (masked). */
  @Post("accounts")
  async saveAccount(
    @Body(new ZodValidationPipe(UpsertAccountSchema)) body: UpsertAccountBody,
  ): Promise<SpAccount> {
    const saved = await this.spApi.saveAccount(body);
    return maskAccount(saved);
  }

  /** Remove a seller account by id. */
  @Delete("accounts/:id")
  async deleteAccount(@Param("id") id: string): Promise<{ ok: true }> {
    await this.spApi.deleteAccount(id);
    return { ok: true };
  }

  /**
   * Exchange an LWA authorization code for tokens.
   * Returns refreshToken and accessToken so the caller can store the refreshToken.
   */
  @Post("exchange")
  async exchangeCode(
    @Body(new ZodValidationPipe(ExchangeCodeSchema)) body: ExchangeCodeBody,
  ): Promise<{ refreshToken: string; accessToken: string }> {
    const data = await this.spApi.exchangeCode(
      body.code,
      body.clientId,
      body.clientSecret,
      body.redirectUri,
    );
    return { refreshToken: data.refresh_token, accessToken: data.access_token };
  }

  /** Fetch a single product from the SP-API Catalog by ASIN. */
  @Get("preview/:asin")
  async fetchProductByAsin(
    @Param("asin") asin: string,
    @Query(new ZodValidationPipe(PreviewQuerySchema)) query: PreviewQuery,
  ): Promise<AmazonPreviewResult> {
    return this.spApi.fetchProductByAsin(asin, query.accountId);
  }

  /** List seller's own inventory (Listings Items API, client-side filter). */
  @Get("listings")
  async listProducts(
    @Query(new ZodValidationPipe(ListingsQuerySchema)) query: ListingsQuery,
  ): Promise<{ items: ListingSummary[]; nextPageToken?: string }> {
    return this.spApi.listProducts(query.accountId, query.pageToken);
  }

  /**
   * Fetch a single seller listing by SKU (Listings Items API, full attrs).
   * Returns the same shape as /preview/:asin so the import UI can consume it.
   */
  @Get("listing-preview")
  async fetchListingBySku(
    @Query(new ZodValidationPipe(ListingPreviewQuerySchema))
    query: ListingPreviewQuery,
  ): Promise<AmazonPreviewResult> {
    return this.spApi.fetchListingBySku(query.accountId, query.sku);
  }
}

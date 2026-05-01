import { z } from "zod";

/**
 * Zod schemas and TypeScript types for the Amazon SP-API module.
 * Admin-only: guarded by JwtB2bGuard + RolesGuard + Roles("super_admin").
 */

// ---------------------------------------------------------------------------
// SpAccount — one persisted seller account stored in SiteSetting
// ---------------------------------------------------------------------------

export interface SpAccount {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string;
  marketplace: string;
  isActive: boolean;
  addedAt: string; // ISO date string
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const UpsertAccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  sellerId: z.string().min(1),
  marketplace: z.string().default("in"),
  isActive: z.boolean().default(true),
});
export type UpsertAccountBody = z.infer<typeof UpsertAccountSchema>;

export const ExchangeCodeSchema = z.object({
  code: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
});
export type ExchangeCodeBody = z.infer<typeof ExchangeCodeSchema>;

export const ListingsQuerySchema = z.object({
  accountId: z.string().min(1),
  pageToken: z.string().optional(),
});
export type ListingsQuery = z.infer<typeof ListingsQuerySchema>;

export const PreviewQuerySchema = z.object({
  accountId: z.string().optional(),
});
export type PreviewQuery = z.infer<typeof PreviewQuerySchema>;

export const ListingPreviewQuerySchema = z.object({
  accountId: z.string().min(1),
  sku: z.string().min(1),
});
export type ListingPreviewQuery = z.infer<typeof ListingPreviewQuerySchema>;

// ---------------------------------------------------------------------------
// ListingSummary — shape returned from /listings endpoint
// ---------------------------------------------------------------------------

export interface ListingSummary {
  sku: string;
  asin: string;
  title: string;
  status: string[];
  price?: number;
  currency: string;
  quantity: number;
  productType: string;
  imageUrl?: string;
  /**
   * SKU of the parent listing if this item is a child variation (e.g. a
   * specific color/size). Absent for standalone listings and parents.
   */
  parentSku?: string;
  /**
   * If this listing is a parent, the SKUs of its child variants.
   */
  childSkus?: string[];
  /**
   * Human-readable variation theme (e.g. "Color", "Size", "Push/Pull Type").
   * Present on parent + child listings belonging to a variation family.
   */
  variationTheme?: string;
  /**
   * For child variants: label→value pairs that distinguish this variant from
   * siblings (e.g. { "Color": "Red", "Size": "Large" }).
   */
  variantAxes?: Record<string, string>;
}

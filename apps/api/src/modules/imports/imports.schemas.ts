import { z } from "zod";

/**
 * Zod schemas for the unified ImportsModule. Admin-only: NOT exported through
 * @gifteeng/shared. This file defines request-body shapes and the
 * ProductDraft contract used both at the controller boundary and internally
 * by imports.service.ts.
 */

export const ImportImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional().default(""),
});

// Variant for import
export const VariantDraftSchema = z.object({
  name: z.string(),   // "color", "size", "material"
  value: z.string(),  // "Red", "Large"
  priceDelta: z.number().default(0),
  image: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
});
export type VariantDraft = z.infer<typeof VariantDraftSchema>;

export const ProductDraftSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  basePrice: z.number().nonnegative(),
  currency: z.string().default("INR"),
  sku: z.string().nullable().optional(),
  inventory: z.number().int().nonnegative().default(0),
  isCustomizable: z.boolean().default(false),
  b2cEnabled: z.boolean().default(false),
  b2bEnabled: z.boolean().default(false),
  ownerCompanyId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
  images: z.array(ImportImageSchema).default([]),
  variants: z.array(VariantDraftSchema).default([]),
});
export type ProductDraft = z.infer<typeof ProductDraftSchema>;

export const AmazonImportSchema = z.object({
  asinOrUrl: z.string().min(1),
});
export type AmazonImportBody = z.infer<typeof AmazonImportSchema>;

export const ShopifyImportSchema = z.object({
  handleOrUrl: z.string().min(1),
});
export type ShopifyImportBody = z.infer<typeof ShopifyImportSchema>;

export const UrlImportSchema = z.object({
  url: z.string().url(),
});
export type UrlImportBody = z.infer<typeof UrlImportSchema>;

export const CommitDraftsSchema = z.object({
  drafts: z.array(ProductDraftSchema).min(1),
});
export type CommitDraftsBody = z.infer<typeof CommitDraftsSchema>;

export type ImportSource = "amazon" | "shopify" | "url" | "csv";

export type ImportResult = {
  source: ImportSource;
  draft: ProductDraft;
  warnings: string[];
};

export type AmazonVariant = {
  asin: string;
  dimensions: Record<string, string>; // { color: "Red", size: "L" }
  price?: number;
  image?: string;
};

export type AmazonPreviewResult = {
  asin: string;
  parentAsin?: string;
  title: string;
  features: string[];
  price?: number;
  images: string[];
  category?: string;
  brand?: string;
  variants: AmazonVariant[];
  hasVariants: boolean;
  descriptionHtml?: string;
  /**
   * Label → value map of structured product specs (color, material, weight,
   * dimensions, warranty, etc.) pulled from Amazon attributes. Surfaces on
   * the B2C product detail page as a specs table.
   */
  specs?: Record<string, string>;
};

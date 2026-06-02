import { z } from "zod";

export const ProductImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
});

export const ProductSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  basePrice: z.string(), // Decimal serialized as string
  currency: z.string().default("INR"),
  inventory: z.number().int(),
  isCustomizable: z.boolean(),
  images: z.array(ProductImageSchema).nullable().optional(),
  b2cEnabled: z.boolean(),
  b2bEnabled: z.boolean(),
  ownerCompanyId: z.string().uuid().nullable().optional(),
});
export type Product = z.infer<typeof ProductSchema>;

// Accept tolerant query strings — Flutter and web both build query maps from
// optional UI filters and frequently send extra keys that the service layer
// either ignores or applies opportunistically. Without `.passthrough()` an
// unknown key (e.g. `status=active` from older clients) used to bubble up as
// 400 "Validation failed" once anything in the global pipe chain tightened.
export const ProductListQuerySchema = z
  .object({
    category: z.string().optional(),
    // Collection slug — filters products that belong to a ProductCollection
    // with matching slug. Used by homepage "By Collection" sections.
    collection: z.string().optional(),
    // Tag filter — matches values in metadata.tags[] (e.g. "occasion:birthday",
    // "bestseller", "trending"). Drives Shop-by-Occasion chips on web + mobile.
    tag: z.string().optional(),
    search: z.string().optional(),
    // Sort order used by homepage sections.
    //   "newest"  → createdAt desc (default, used by "New Arrivals")
    //   "popular" → order count desc (used by "Best-Selling")
    //   "price_asc" / "price_desc" → filter UI on Shop screen.
    // Accept any string and fall back to default in the service if unknown.
    sort: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(24),
    // Optional shop-screen filters — declared so the schema doesn't strip
    // them before the service can read them.
    minPrice: z.coerce.number().optional(),
    maxPrice: z.coerce.number().optional(),
    isCustomizable: z.union([z.boolean(), z.string()]).optional(),
    // Admin-only filter; passed through harmlessly for B2C calls.
    status: z.string().optional(),
    // Filter for products with ≥60% discount (mrp set + discountPct >= 60)
    deals: z.coerce.boolean().optional(),
    // Include FBT products in product detail response
    fbt: z.coerce.boolean().optional(),
  })
  .passthrough();
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

/**
 * Homepage builder — unified schema for the Shopify-style page builder
 * at /b2b/super-admin/homepage-content.
 *
 * One config document describes the entire homepage. It's stored as a
 * single JSON blob under the settings key `homepage_config`. Every section
 * has a discriminated `type` + its own `config` shape.
 *
 * Admins can add, reorder, duplicate, hide, and inline-edit any section.
 * Each product-row section supports pinning specific products AND auto-
 * filling the rest from a category / collection / best-seller query.
 */
import { z } from "zod";

// ─── Announcement bar (top marquee) ───────────────────────────────────────
export const AnnouncementMessageSchema = z.object({
  id: z.string(),
  icon: z.string().optional(),         // emoji or short glyph
  text: z.string(),
  link: z.string().optional(),
});
export type AnnouncementMessage = z.infer<typeof AnnouncementMessageSchema>;

// ─── Hero banner ──────────────────────────────────────────────────────────
export const HeroSlideSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  active: z.boolean().optional(),
  order: z.number().optional(),
  // Visual customisation — used by the admin hero editor and read by mobile.
  // accentColor: pill/badge accent. bgColor1/bgColor2: gradient start/end
  // (shown when no imageUrl is set). Stored as CSS hex strings e.g. "#EF3752".
  accentColor: z.string().optional(),
  bgColor1: z.string().optional(),
  bgColor2: z.string().optional(),
});
export type HeroSlide = z.infer<typeof HeroSlideSchema>;

// ─── Product row — 5 sub-sources ──────────────────────────────────────────
// "best-selling" → ranks by order count
// "new-arrivals" → ranks by createdAt desc
// "featured"     → only pinned products (no auto fill)
// "category"     → products in a given category (categoryName required)
// "collection"   → products in a given collection (collectionSlug required)
export const ProductRowSourceEnum = z.enum([
  "best-selling", "new-arrivals", "featured", "category", "collection",
]);
export type ProductRowSource = z.infer<typeof ProductRowSourceEnum>;

export const ProductRowConfigSchema = z.object({
  source: ProductRowSourceEnum,
  categoryName: z.string().optional(),
  collectionSlug: z.string().optional(),
  limit: z.number().int().min(1).max(40).default(12),
  pinnedProductIds: z.array(z.string()).default([]),
  appendAuto: z.boolean().default(true),  // fill remaining slots automatically
});

// ─── Custom HTML (admin can drop anything in between) ─────────────────────
export const CustomHtmlConfigSchema = z.object({
  html: z.string().default(""),
  css: z.string().default(""),
});

// ─── How it works ─────────────────────────────────────────────────────────
export const HowItWorksStepSchema = z.object({
  id: z.string(),
  icon: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
});
export const HowItWorksConfigSchema = z.object({
  steps: z.array(HowItWorksStepSchema).default([]),
});

// ─── Features grid / trust bar ────────────────────────────────────────────
export const FeatureItemSchema = z.object({
  id: z.string(),
  icon: z.string().optional(),
  label: z.string(),
  description: z.string().optional(),
});
export const FeaturesGridConfigSchema = z.object({
  items: z.array(FeatureItemSchema).default([]),
});

// ─── Gifteeng Difference ──────────────────────────────────────────────────
export const DifferencePointSchema = z.object({
  id: z.string(),
  icon: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
});
export const GifteengDifferenceConfigSchema = z.object({
  points: z.array(DifferencePointSchema).default([]),
});

// ─── Simple CTA-shape configs ────────────────────────────────────────────
export const DesignWithAiConfigSchema = z.object({
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  imageUrl: z.string().optional(),
});
export const SmartRemindersConfigSchema = z.object({
  headline: z.string().optional(),
});
export const ReturnGiftsConfigSchema = z.object({
  categoryName: z.string().optional(),
  title: z.string().optional(),
});
export const TestimonialsConfigSchema = z.object({
  title: z.string().optional(),
  limit: z.number().int().min(1).max(40).default(10),
});
export const AppComingSoonConfigSchema = z.object({
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  appStoreLink: z.string().optional(),
  playStoreLink: z.string().optional(),
  imageUrl: z.string().optional(),
});
export const MakeSomeoneHappyConfigSchema = z.object({
  headline: z.string().optional(),
  subheadline: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  imageUrl: z.string().optional(),
});
export const GamificationWidgetConfigSchema = z.object({
  // "full" = Goins + spin + scratch cards; "spin-only" / "scratch-only" = single game
  variant: z.enum(["full", "spin-only", "scratch-only"]).default("full"),
});
export const SpinWheelConfigSchema = z.object({
  // Reserved for future tuning; the block is self-contained today.
  headline: z.string().optional(),
});

// ─── The section union ────────────────────────────────────────────────────
export const SectionTypeEnum = z.enum([
  "announcement-bar",
  "hero",
  "product-row",
  "shop-by-category",  // Deploy 105 — admin-managed category grid
  "custom-html",
  "how-it-works",
  "features-grid",
  "gifteeng-difference",
  "design-with-ai",
  "smart-reminders",
  "return-gifts",
  "testimonials",
  "app-coming-soon",
  "make-someone-happy",
  "gamification-widget",
  "spin-wheel",
]);

// ─── Shop-by-Category tile ──────────────────────────────────────────────
export const CategoryTileSchema = z.object({
  id: z.string(),
  categoryName: z.string(),   // must match a Product.category value
  label: z.string().optional(),      // override display label; fallback to categoryName
  imageUrl: z.string().optional(),   // custom tile image
  emoji: z.string().optional(),      // emoji fallback when no image
});
export type CategoryTile = z.infer<typeof CategoryTileSchema>;

export const ShopByCategoryConfigSchema = z.object({
  tiles: z.array(CategoryTileSchema).default([]),
  layout: z.enum(["grid", "scroll"]).default("grid"),
});
export type SectionType = z.infer<typeof SectionTypeEnum>;

// Base fields every section has. The `config` field is a flexible JSON so
// the admin UI can store type-specific settings without a discriminated
// union hell. Runtime validators do the per-type parse.
export const HomepageSectionSchema = z.object({
  id: z.string(),
  type: SectionTypeEnum,
  title: z.string().optional(),
  subtitle: z.string().optional(),
  active: z.boolean().default(true),
  // per-breakpoint visibility for mobile / desktop only
  visibility: z.object({
    mobile: z.boolean().default(true),
    desktop: z.boolean().default(true),
  }).default({ mobile: true, desktop: true }),
  order: z.number().int().default(0),
  config: z.record(z.string(), z.any()).default({}),
});
export type HomepageSection = z.infer<typeof HomepageSectionSchema>;

// ─── Full homepage config ─────────────────────────────────────────────────
export const HomepageConfigSchema = z.object({
  version: z.literal(1).default(1),
  sections: z.array(HomepageSectionSchema).default([]),
  updatedAt: z.string().optional(),
});
export type HomepageConfig = z.infer<typeof HomepageConfigSchema>;

// ─── Helper: quick id generator (for section / slide / step ids) ──────────
export function genSectionId(): string {
  return "sec_" + Math.random().toString(36).slice(2, 10);
}

// ─── Default page so a fresh install has a functional homepage ────────────
export function defaultHomepageConfig(): HomepageConfig {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sections: [
      {
        id: genSectionId(), type: "announcement-bar", active: true, order: 0,
        visibility: { mobile: true, desktop: true },
        config: {
          messages: [
            { id: "m1", icon: "🎉", text: "Free shipping on orders above ₹499" },
            { id: "m2", icon: "✨", text: "Use code WELCOME10 for 10% off your first order" },
            { id: "m3", icon: "📦", text: "7-day easy returns" },
            { id: "m4", icon: "⭐", text: "1L+ happy customers across India" },
          ],
        },
      },
      {
        id: genSectionId(), type: "hero", active: true, order: 1,
        visibility: { mobile: true, desktop: true },
        config: { slides: [] },
      },
      {
        id: genSectionId(), type: "product-row", title: "Best Sellers", active: true, order: 2,
        visibility: { mobile: true, desktop: true },
        config: { source: "best-selling", limit: 12, pinnedProductIds: [], appendAuto: true },
      },
      {
        id: genSectionId(), type: "product-row", title: "New Arrivals", active: true, order: 3,
        visibility: { mobile: true, desktop: true },
        config: { source: "new-arrivals", limit: 12, pinnedProductIds: [], appendAuto: true },
      },
      {
        id: genSectionId(), type: "gamification-widget", active: true, order: 4,
        visibility: { mobile: true, desktop: true },
        config: { variant: "full" },
      },
      {
        id: genSectionId(), type: "how-it-works", title: "How it works", active: true, order: 5,
        visibility: { mobile: true, desktop: true },
        config: { steps: [] },
      },
    ],
  };
}

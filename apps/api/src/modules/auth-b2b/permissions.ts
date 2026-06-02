// ─── Permission catalog ──────────────────────────────────────────────────────
//
// Single source of truth for every fine-grained permission a CompanyUser can
// hold. Stored as plain strings on `CompanyUser.permissions` (text[]) so we
// don't need a migration every time we add one.
//
// Naming: <resource>.<action>
//   Resources: products, categories, collections, hero_banners, orders,
//              customers, discounts, settings, reviews, testimonials,
//              users, files, analytics, b2b, marketing
//   Actions:   view, create, edit, delete, publish, export, import
//
// The `super_admin` role bypasses these checks entirely — full access. Other
// roles get the per-user `permissions` array merged with their role defaults
// (see ROLE_DEFAULTS below).
// ─────────────────────────────────────────────────────────────────────────────

import type { UserRole } from "@gifteeng/shared";

export const PERMISSIONS = {
  // ── Catalog ────────────────────────────────────────────────────────────
  PRODUCTS_VIEW:    "products.view",
  PRODUCTS_CREATE:  "products.create",
  PRODUCTS_EDIT:    "products.edit",
  PRODUCTS_DELETE:  "products.delete",
  PRODUCTS_PUBLISH: "products.publish",
  PRODUCTS_IMPORT:  "products.import",
  PRODUCTS_EXPORT:  "products.export",

  CATEGORIES_VIEW:   "categories.view",
  CATEGORIES_CREATE: "categories.create",
  CATEGORIES_EDIT:   "categories.edit",
  CATEGORIES_DELETE: "categories.delete",

  COLLECTIONS_VIEW:   "collections.view",
  COLLECTIONS_CREATE: "collections.create",
  COLLECTIONS_EDIT:   "collections.edit",
  COLLECTIONS_DELETE: "collections.delete",

  VARIANTS_VIEW: "variants.view",
  VARIANTS_EDIT: "variants.edit",

  STOCK_IMAGES_VIEW:   "stock_images.view",
  STOCK_IMAGES_UPLOAD: "stock_images.upload",
  STOCK_IMAGES_DELETE: "stock_images.delete",

  // ── Storefront content ─────────────────────────────────────────────────
  HERO_BANNERS_VIEW:   "hero_banners.view",
  HERO_BANNERS_EDIT:   "hero_banners.edit",

  HOMEPAGE_EDIT:       "homepage.edit",

  TESTIMONIALS_VIEW:   "testimonials.view",
  TESTIMONIALS_EDIT:   "testimonials.edit",

  ANNOUNCEMENTS_EDIT:  "announcements.edit",

  PAGES_EDIT:          "pages.edit",     // custom CMS pages (about, terms, etc.)
  NAVIGATION_EDIT:     "navigation.edit",

  // ── Orders & customers ─────────────────────────────────────────────────
  ORDERS_VIEW:   "orders.view",
  ORDERS_EDIT:   "orders.edit",
  ORDERS_CANCEL: "orders.cancel",
  ORDERS_REFUND: "orders.refund",
  ORDERS_EXPORT: "orders.export",

  SHIPMENTS_VIEW:  "shipments.view",
  SHIPMENTS_EDIT:  "shipments.edit",
  SHIPMENTS_LABEL: "shipments.label",  // create / print shipping labels

  CUSTOMERS_VIEW: "customers.view",
  CUSTOMERS_EDIT: "customers.edit",
  CUSTOMERS_EXPORT: "customers.export",

  REVIEWS_VIEW:   "reviews.view",
  REVIEWS_MODERATE: "reviews.moderate",  // approve / reject

  RETURNS_VIEW:   "returns.view",
  RETURNS_PROCESS: "returns.process",

  // ── Marketing ──────────────────────────────────────────────────────────
  DISCOUNTS_VIEW:   "discounts.view",
  DISCOUNTS_EDIT:   "discounts.edit",

  CAMPAIGNS_VIEW:   "campaigns.view",
  CAMPAIGNS_EDIT:   "campaigns.edit",

  REFERRALS_VIEW:   "referrals.view",
  REFERRALS_EDIT:   "referrals.edit",

  COINS_VIEW: "coins.view",
  COINS_EDIT: "coins.edit",   // adjust balances, set rules

  GAMES_VIEW: "games.view",
  GAMES_EDIT: "games.edit",

  // ── Settings & administration ──────────────────────────────────────────
  SETTINGS_VIEW: "settings.view",
  SETTINGS_EDIT: "settings.edit",

  /// View list of team members.
  USERS_VIEW:    "users.view",
  /// Invite new team member.
  USERS_INVITE:  "users.invite",
  /// Edit role / permissions / deactivate.
  USERS_EDIT:    "users.edit",
  USERS_DELETE:  "users.delete",

  FILES_VIEW:   "files.view",
  FILES_UPLOAD: "files.upload",
  FILES_DELETE: "files.delete",

  // ── Analytics & reporting ──────────────────────────────────────────────
  ANALYTICS_VIEW: "analytics.view",

  // ── B2B-specific ───────────────────────────────────────────────────────
  B2B_COMPANIES_VIEW: "b2b.companies.view",
  B2B_COMPANIES_EDIT: "b2b.companies.edit",
  B2B_CATALOGS_EDIT:  "b2b.catalogs.edit",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/// Flat array of every permission string — used to drive the admin UI grid.
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/// Grouping used by the admin UI so the permission matrix is readable.
export const PERMISSION_GROUPS: Array<{
  label: string;
  permissions: Permission[];
}> = [
  {
    label: "Catalog",
    permissions: [
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCTS_CREATE,
      PERMISSIONS.PRODUCTS_EDIT,
      PERMISSIONS.PRODUCTS_DELETE,
      PERMISSIONS.PRODUCTS_PUBLISH,
      PERMISSIONS.PRODUCTS_IMPORT,
      PERMISSIONS.PRODUCTS_EXPORT,
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.CATEGORIES_CREATE,
      PERMISSIONS.CATEGORIES_EDIT,
      PERMISSIONS.CATEGORIES_DELETE,
      PERMISSIONS.COLLECTIONS_VIEW,
      PERMISSIONS.COLLECTIONS_CREATE,
      PERMISSIONS.COLLECTIONS_EDIT,
      PERMISSIONS.COLLECTIONS_DELETE,
      PERMISSIONS.VARIANTS_VIEW,
      PERMISSIONS.VARIANTS_EDIT,
      PERMISSIONS.STOCK_IMAGES_VIEW,
      PERMISSIONS.STOCK_IMAGES_UPLOAD,
      PERMISSIONS.STOCK_IMAGES_DELETE,
    ],
  },
  {
    label: "Storefront content",
    permissions: [
      PERMISSIONS.HERO_BANNERS_VIEW,
      PERMISSIONS.HERO_BANNERS_EDIT,
      PERMISSIONS.HOMEPAGE_EDIT,
      PERMISSIONS.TESTIMONIALS_VIEW,
      PERMISSIONS.TESTIMONIALS_EDIT,
      PERMISSIONS.ANNOUNCEMENTS_EDIT,
      PERMISSIONS.PAGES_EDIT,
      PERMISSIONS.NAVIGATION_EDIT,
    ],
  },
  {
    label: "Orders & customers",
    permissions: [
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.ORDERS_EDIT,
      PERMISSIONS.ORDERS_CANCEL,
      PERMISSIONS.ORDERS_REFUND,
      PERMISSIONS.ORDERS_EXPORT,
      PERMISSIONS.SHIPMENTS_VIEW,
      PERMISSIONS.SHIPMENTS_EDIT,
      PERMISSIONS.SHIPMENTS_LABEL,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_EDIT,
      PERMISSIONS.CUSTOMERS_EXPORT,
      PERMISSIONS.REVIEWS_VIEW,
      PERMISSIONS.REVIEWS_MODERATE,
      PERMISSIONS.RETURNS_VIEW,
      PERMISSIONS.RETURNS_PROCESS,
    ],
  },
  {
    label: "Marketing",
    permissions: [
      PERMISSIONS.DISCOUNTS_VIEW,
      PERMISSIONS.DISCOUNTS_EDIT,
      PERMISSIONS.CAMPAIGNS_VIEW,
      PERMISSIONS.CAMPAIGNS_EDIT,
      PERMISSIONS.REFERRALS_VIEW,
      PERMISSIONS.REFERRALS_EDIT,
      PERMISSIONS.COINS_VIEW,
      PERMISSIONS.COINS_EDIT,
      PERMISSIONS.GAMES_VIEW,
      PERMISSIONS.GAMES_EDIT,
    ],
  },
  {
    label: "Settings & team",
    permissions: [
      PERMISSIONS.SETTINGS_VIEW,
      PERMISSIONS.SETTINGS_EDIT,
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_INVITE,
      PERMISSIONS.USERS_EDIT,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.FILES_VIEW,
      PERMISSIONS.FILES_UPLOAD,
      PERMISSIONS.FILES_DELETE,
    ],
  },
  {
    label: "Analytics & B2B",
    permissions: [
      PERMISSIONS.ANALYTICS_VIEW,
      PERMISSIONS.B2B_COMPANIES_VIEW,
      PERMISSIONS.B2B_COMPANIES_EDIT,
      PERMISSIONS.B2B_CATALOGS_EDIT,
    ],
  },
];

// ─── Role defaults ────────────────────────────────────────────────────────────
//
// `super_admin` bypasses the check entirely (returns true for any permission).
// Other roles get a sensible default permission set even before the super-admin
// hand-picks extras for them.
export const ROLE_DEFAULTS: Record<UserRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS, // bypassed in code, listed here for completeness
  sales_admin: [
    PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_EDIT, PERMISSIONS.ORDERS_EXPORT,
    PERMISSIONS.SHIPMENTS_VIEW, PERMISSIONS.SHIPMENTS_LABEL,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.DISCOUNTS_VIEW, PERMISSIONS.DISCOUNTS_EDIT,
    PERMISSIONS.ANALYTICS_VIEW,
  ],
  hr_admin: [
    PERMISSIONS.B2B_COMPANIES_VIEW, PERMISSIONS.B2B_COMPANIES_EDIT,
    PERMISSIONS.B2B_CATALOGS_EDIT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
  ],
  production: [
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.SHIPMENTS_VIEW, PERMISSIONS.SHIPMENTS_EDIT, PERMISSIONS.SHIPMENTS_LABEL,
    PERMISSIONS.PRODUCTS_VIEW,
  ],
  employee: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
  ],
};

/// Compute effective permissions for a user — role defaults ∪ per-user grants.
/// super_admin always returns ALL_PERMISSIONS.
export function effectivePermissions(
  role: UserRole, userGrants: string[] | null | undefined,
): Permission[] {
  if (role === "super_admin") return ALL_PERMISSIONS;
  const base = ROLE_DEFAULTS[role] ?? [];
  const extra = (userGrants ?? []).filter((p): p is Permission =>
    ALL_PERMISSIONS.includes(p as Permission),
  );
  return Array.from(new Set([...base, ...extra]));
}

/// True if a user with the given role + grants is allowed to perform `needed`.
export function hasPermission(
  role: UserRole,
  userGrants: string[] | null | undefined,
  needed: Permission,
): boolean {
  if (role === "super_admin") return true;
  if (ROLE_DEFAULTS[role]?.includes(needed)) return true;
  return (userGrants ?? []).includes(needed);
}

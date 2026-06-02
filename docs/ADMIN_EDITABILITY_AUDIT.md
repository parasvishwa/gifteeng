# Admin Editability Audit — Gifteeng

**Purpose:** Catalogue every visible string / image / setting on the web storefront and Flutter app, and confirm whether the value is editable from the super-admin panel. Anything marked **HARDCODED** is a follow-up task — make it admin-editable and load it from `/api/settings/public` or its module-specific endpoint so updates flow to both web and mobile automatically.

The api already powers most dynamic content; this doc lives next to the codebase so adding a new section means adding a row here too.

---

## ✅ Already admin-editable (web + Flutter both consume the same API)

| Surface | Admin page | Backend endpoint |
|---|---|---|
| Home hero slider | `/super-admin/banners` | `GET /api/banners?placement=home` |
| Homepage sections | `/super-admin/sections` + `/super-admin/homepage-content` | `GET /api/admin/homepage-config` |
| Categories | `/super-admin/categories` | `GET /api/categories` |
| Collections list + slug | `/super-admin/collections` | `GET /api/collections` |
| Products + variants | `/super-admin/products` + `/super-admin/variants` | `GET /api/products` |
| Testimonials | `/super-admin/testimonials` | `GET /api/testimonials` |
| Reviews & external reviews | `/super-admin/reviews` + `/super-admin/external-reviews` | `GET /api/reviews` |
| Discounts (coupons) | `/super-admin/discounts` | `GET /api/discounts` |
| Hero announcement banner | `/super-admin/announcements` | `GET /api/announcements` |
| Custom CMS pages | `/super-admin/pages` | `GET /api/pages/:slug` |
| Video stories on Shop | `/super-admin/videos` | `GET /api/videos?placement=shop_story` |
| Stock images library | `/super-admin/stock-images` | `GET /api/stock-images` |
| Coins / loyalty rules | `/super-admin/coins` | `GET /api/coins/settings` |
| Cart recovery emails | `/super-admin/cart-recovery` | `GET /api/cart-recovery/rules` |
| Free gifts | `/super-admin/free-gifts` | `GET /api/free-gifts` |
| Inactivity rewards | `/super-admin/inactivity-rewards` | `GET /api/inactivity-rewards` |
| Milestone rewards | `/super-admin/milestone-rewards` | `GET /api/milestone-rewards` |
| Referrals | `/super-admin/referrals` | `GET /api/referrals/config` |
| Site settings (delivery charge, COD, free-shipping threshold, Razorpay key, legal-policy URLs) | `/super-admin/settings` | `GET /api/settings/public` |
| Hero banners + product preview images | `/super-admin/banners` + product files | `GET /api/banners`, `GET /api/files` |
| Marketing pixels (GTM, GA4, Meta Pixel) | `/super-admin/marketing` | `GET /api/settings/public` |
| Theme / festival theme | `/super-admin/theme`, `/super-admin/festival-theme` | `GET /api/settings/public` (CSS variables) |
| Navigation menu | `/super-admin/navigation` | `GET /api/settings/public` (`navigation` key) |
| Thank-you cards | `/super-admin/thank-you-cards` | `GET /api/thank-you-cards` |
| Sticker album / games | `/super-admin/stickers` + `/super-admin/games` | `GET /api/stickers`, `GET /api/games` |
| Product drops | `/super-admin/product-drops` | `GET /api/product-drops` |
| Variants templates | `/super-admin/variants` | `GET /api/variants` |
| Contact messages | `/super-admin/contact-messages` | `GET /api/contact-messages` |
| Reminders cron | `/super-admin/reminders` | `GET /api/reminders` |
| Broadcast push notifications | `/super-admin/broadcast` | `POST /api/broadcast` |
| Customers list + detail | `/super-admin/customers` | `GET /api/customers` |
| Companies (B2B) | `/super-admin/companies` | `GET /api/companies` |
| Catalogs (B2B) | `/super-admin/catalogs` | `GET /api/catalogs` |
| Production queue | `/super-admin/production-queue` | `GET /api/orders?production=true` |
| Marketplace integrations | `/super-admin/marketplace` + `/super-admin/amazon` | `GET /api/marketplace-links` |
| SEO command centre (per-product metadata, sitemap regen) | `/super-admin/seo` | `POST /api/products/admin/:id/seo/regenerate` |
| AI settings | `/super-admin/ai-settings` | `GET /api/settings/public` |
| Files / uploads | `/super-admin/files` | `GET /api/files` |
| **Team members + per-user permissions (NEW)** | `/super-admin/users` | `GET /api/b2b/team`, `POST /api/b2b/team/invite`, etc. |

---

## ⚠️ HARDCODED — needs admin editing wired up

These strings/images live in code and currently require a redeploy to change. Listed in rough priority order.

### Web

| Where | What's hardcoded | Suggested admin path |
|---|---|---|
| `apps/web/app/b2c/_components/sections/HowItWorksSection.tsx` | Step labels & descriptions ("Upload / Personalize / Delivered"), addon card labels ("Gift Wraps / Thank You Cards / Message Cards") | New "How it Works" widget in `/super-admin/homepage-content` (already has the modular block system — just add a `howItWorks` block type) |
| `apps/web/app/b2c/_components/sections/CompactStatsBar.tsx` | "4.5★ Rating", "Free Delivery", "Secure Checkout", "7-Day Returns", "500+ Designs" | Reuse `/super-admin/settings` → `trust_badges` JSON array |
| `apps/web/app/b2c/_components/Footer.tsx` | Footer links + copyright + social handles | New `/super-admin/navigation` "Footer" section (sibling of header nav) |
| `apps/web/app/b2c/about/page.tsx` | About-us body copy | Make CMS-editable via `/super-admin/pages` (already supports custom slugs) |
| `apps/web/app/b2c/contact/page.tsx` | Email address, WhatsApp number, contact-form mailto | Already partially wired (admin settings) — verify all instances pull from `/api/settings/public` |
| `apps/web/app/b2c/shipping/page.tsx` | Shipping zone matrix (Metro / Tier-2 / Tier-3 days) | Already exists at `/super-admin/delivery` (`pincode_rules` JSON in settings) — just ensure shipping page reads from API not constants |
| `apps/web/app/b2c/returns/page.tsx` | Return policy bullets ("30 days", "Free pickup", etc.) | CMS via `/super-admin/pages?slug=returns-policy` |
| `apps/web/app/b2c/privacy/page.tsx`, `terms/page.tsx` | Long policy bodies | CMS-editable via `/super-admin/pages` (or keep code-managed and just track versions) |
| `apps/web/app/b2c/_HomePageShell.tsx` | "Popular searches" trending terms inside `<HeroSlider />` if admin sets none | Already pulls from admin; verify fallback list is removed in production |

### Flutter

| Where | What's hardcoded | Suggested admin path |
|---|---|---|
| `apps/mobile/lib/features/home/presentation/widgets/home_sections.dart` | Best Sellers + Corporate Gifts strip copy ("FOR BUSINESSES", "Bulk orders, custom branding, GST invoicing", chip labels) | New homepage-section block (mirror web's homepage-config) |
| `apps/mobile/lib/features/home/presentation/widgets/category_bento.dart` | Per-category emoji fallback + gradient swatches (`_emojiFor`, `_gradientFor`) | Add `iconEmoji` + `gradient` columns to `Category` model in Prisma; admin form already has icon picker for some categories |
| `apps/mobile/lib/features/shop/presentation/screens/shop_screen.dart` | Trust strip copy in shimmer fallback | Same `trust_badges` setting as web |
| `apps/mobile/lib/features/account/presentation/screens/account_screen.dart` | Goins balance card subtitle "Earn G with every order" | Add `coins_subtitle` to coins settings |
| `apps/mobile/lib/features/auth/...` | "Verify your phone" copy on OTP screen | Add to settings_public.app_strings |
| `apps/mobile/lib/features/home/presentation/widgets/home_product_card.dart` | "Same-day delivery" / "Out of stock" / "NOTIFY" / "Only N left" / "+N options" microcopy | Add to settings_public.app_strings |

### Backend rules also worth surfacing in admin

| Where | What | Suggested move |
|---|---|---|
| `apps/api/src/modules/shipping/shipping.service.ts` | `PINCODE_RULES` array — Mumbai same-day, zone ETAs, COD availability | Move to `pincode_rules` JSONB column on Settings (admin can edit zones without code deploy) |
| `apps/api/src/modules/auth-b2b/permissions.ts` | Permission catalog + role defaults | Keep code-managed (changes need TypeScript types anyway); only the **per-user grants** are admin-editable, which is the right boundary |

---

## How to wire a new hardcoded string to admin

1. **Add column on `SiteSetting`** (key/value JSONB pattern) or extend the `homepage-config` block schema.
2. **Backend endpoint**: usually `GET /api/settings/public` already returns the bag — just add the key.
3. **Web**: replace the hardcoded literal in TSX with `const value = settings?.<key> ?? "<fallback>";`. The `<HomePageShell>` already pre-fetches settings server-side so it's a one-line swap.
4. **Flutter**: read the same key from `/api/settings/public` via the existing `publicSettingsProvider`.
5. **Admin form**: drop a `<TextField>` or color picker in `/super-admin/settings` pointed at the new key.

Since both surfaces consume the same `/api/settings/public` blob, updating one place flows to both.

---

## RBAC checkpoints (added this session)

Every admin endpoint can now be gated with `@RequirePermissions(PERMISSIONS.<KEY>)`. Already wired:

- `products.create / edit / delete` → `/api/products/admin/*`
- `categories.create / edit / delete` → `/api/categories/admin/*`
- `collections.create / edit / delete` → `/api/collections/*`
- `hero_banners.view / edit` → `/api/admin/banners/*`
- `discounts.view / edit` → `/api/discounts/*`

**Follow-up**: roll out the same pattern to the remaining 30+ admin controllers (testimonials, reviews, customers, orders, files, settings, etc.). Each is a 3-line change: import permission, add `@RequirePermissions`, import `AuthB2bModule` in that feature's `*.module.ts`. The shape is identical to `apps/api/src/modules/products/products.controller.ts`.

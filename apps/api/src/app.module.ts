import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";

import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./common/health.controller";

import { AuthB2cModule } from "./modules/auth-b2c/auth-b2c.module";
import { AuthB2bModule } from "./modules/auth-b2b/auth-b2b.module";
import { ProductsModule } from "./modules/products/products.module";
import { CartModule } from "./modules/cart/cart.module";
import { CheckoutModule } from "./modules/checkout/checkout.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { ShippingModule } from "./modules/shipping/shipping.module";
import { WalletModule } from "./modules/wallet/wallet.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { CatalogsModule } from "./modules/catalogs/catalogs.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { DiscountsModule } from "./modules/discounts/discounts.module";
import { FilesModule } from "./modules/files/files.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AdminModule } from "./modules/admin/admin.module";
import { ImportsModule } from "./modules/imports/imports.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { VideosModule } from "./modules/videos/videos.module";
import { StockImagesModule } from "./modules/stock-images/stock-images.module";
import { CollectionsModule } from "./modules/collections/collections.module";
import { ReferralsModule } from "./modules/referrals/referrals.module";
import { ContactMessagesModule } from "./modules/contact-messages/contact-messages.module";
import { AmazonReviewsModule } from "./modules/amazon-reviews/amazon-reviews.module";
import { SpApiModule } from "./modules/amazon-sp/sp-api.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { ProductVariantOptionsModule } from "./modules/product-variant-options/product-variant-options.module";
import { MarketplaceLinksModule } from "./modules/marketplace-links/marketplace-links.module";
import { CartRecoveryModule } from "./modules/cart-recovery/cart-recovery.module";
import { HeroBannersModule } from "./modules/hero-banners/hero-banners.module";
import { InactivityRewardsModule } from "./modules/inactivity-rewards/inactivity-rewards.module";
import { MilestoneRewardsModule } from "./modules/milestone-rewards/milestone-rewards.module";
import { ExternalReviewsModule } from "./modules/external-reviews/external-reviews.module";
import { CoinsModule } from "./modules/coins/coins.module";
import { AiModule } from "./modules/ai/ai.module";
import { CustomPagesModule } from "./modules/custom-pages/custom-pages.module";
import { GstModule } from "./modules/gst/gst.module";
import { DesignTemplatesModule } from "./modules/design-templates/design-templates.module";
import { ThankYouCardsModule } from "./modules/thank-you-cards/thank-you-cards.module";
import { PageViewsModule } from "./modules/page-views/page-views.module";
import { GamesModule } from "./modules/games/games.module";
import { RewardsModule } from "./modules/rewards/rewards.module";
import { BidsModule } from "./modules/bids/bids.module";
import { FlashJackpotModule } from "./modules/flash-jackpot/flash-jackpot.module";
import { StickersModule } from "./modules/stickers/stickers.module";
import { DuetModule } from "./modules/duet/duet.module";
import { TestimonialsModule } from "./modules/testimonials/testimonials.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { WishlistModule } from "./modules/wishlist/wishlist.module";
import { GiftRemindersModule } from "./modules/gift-reminders/gift-reminders.module";
import { ShopifyMigrateModule } from "./modules/shopify-migrate/shopify-migrate.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { AiTargetingModule } from "./modules/ai-targeting/ai-targeting.module";
import { CacheModule } from "./modules/cache/cache.module";
import { ReturnsModule } from "./modules/returns/returns.module";
import { PrivacyModule } from "./modules/privacy/privacy.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    CacheModule,
    AuthB2cModule,
    AuthB2bModule,
    ProductsModule,
    CartModule,
    CheckoutModule,
    OrdersModule,
    ReturnsModule,
    PrivacyModule,
    ShippingModule,
    WalletModule,
    CampaignsModule,
    CompaniesModule,
    CatalogsModule,
    ReviewsModule,
    DiscountsModule,
    FilesModule,
    NotificationsModule,
    AdminModule,
    ImportsModule,
    CustomersModule,
    VideosModule,
    StockImagesModule,
    CollectionsModule,
    ReferralsModule,
    ContactMessagesModule,
    AmazonReviewsModule,
    SpApiModule,
    CategoriesModule,
    ProductVariantOptionsModule,
    MarketplaceLinksModule,
    CartRecoveryModule,
    HeroBannersModule,
    InactivityRewardsModule,
    MilestoneRewardsModule,
    ExternalReviewsModule,
    CoinsModule,
    AiModule,
    CustomPagesModule,
    GstModule,
    DesignTemplatesModule,
    ThankYouCardsModule,
    PageViewsModule,
    GamesModule,
    RewardsModule,
    BidsModule,
    FlashJackpotModule,
    StickersModule,
    DuetModule,
    TestimonialsModule,
    AnnouncementsModule,
    GiftRemindersModule,
    WishlistModule,
    ShopifyMigrateModule,
    RealtimeModule,
    AiTargetingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

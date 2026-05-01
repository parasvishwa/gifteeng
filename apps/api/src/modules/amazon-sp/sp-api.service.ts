import { randomUUID } from "crypto";

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";
import type { AmazonPreviewResult } from "../imports/imports.schemas";
import type {
  ListingSummary,
  SpAccount,
  UpsertAccountBody,
} from "./sp-api.schemas";

// ---------------------------------------------------------------------------
// Marketplace map
// ---------------------------------------------------------------------------

const MARKETPLACE_MAP: Record<
  string,
  { id: string; endpoint: string }
> = {
  in: {
    id: "A21TJRUUN4KGV",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
  },
  com: {
    id: "ATVPDKIKX0DER",
    endpoint: "https://sellingpartnerapi-na.amazon.com",
  },
  "co.uk": {
    id: "A1F83G8C2ARO7P",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
  },
  de: {
    id: "A1PA6795UKMFR9",
    endpoint: "https://sellingpartnerapi-eu.amazon.com",
  },
  "co.jp": {
    id: "A1VC38T7YXB528",
    endpoint: "https://sellingpartnerapi-fe.amazon.com",
  },
  "com.au": {
    id: "A39IBJ37TRP1C6",
    endpoint: "https://sellingpartnerapi-fe.amazon.com",
  },
  ca: {
    id: "A2EUQ1WTGCTBG2",
    endpoint: "https://sellingpartnerapi-na.amazon.com",
  },
};

// ---------------------------------------------------------------------------
// Raw SP-API response types (internal, not exported)
// ---------------------------------------------------------------------------

interface CatalogImage {
  link: string;
  height: number;
  width: number;
  variant: string;
}

interface CatalogItem {
  asin: string;
  parentAsin?: string;
  summaries?: Array<{
    itemName?: string;
    brandName?: string;
    browseClassification?: { displayName: string };
  }>;
  attributes?: Record<string, Array<{ value?: unknown; language_tag?: string }>>;
  images?: Array<{ images: CatalogImage[] }>;
  relationships?: Array<{
    relationships: Array<{
      type: string;
      childAsins?: string[];
    }>;
  }>;
}

interface ListingsApiItem {
  sku: string;
  summaries?: Array<{
    asin?: string;
    itemName?: string;
    status?: string[];
    productType?: string;
    brand?: string;
    mainImage?: { link?: string };
  }>;
  attributes?: Record<string, Array<{ value?: unknown; language_tag?: string }>>;
  offers?: Array<{
    price?: { amount?: number; currency?: string };
  }>;
  fulfillmentAvailability?: Array<{
    quantity?: number;
  }>;
  relationships?: Array<{
    marketplaceId?: string;
    relationships?: Array<{
      type?: string;
      parentSkus?: Array<{ sku?: string }>;
      childSkus?: Array<{ sku?: string }>;
      variationTheme?: { attributes?: string[]; theme?: string };
    }>;
  }>;
  productTypes?: Array<{ productType?: string; marketplaceId?: string }>;
}

// ---------------------------------------------------------------------------
// Attribute → "spec" label map
// Keys = Listings-Items attribute names we care about for product-detail pages.
// Value = human-friendly label used in the UI spec table.
// ---------------------------------------------------------------------------
const SPEC_ATTRIBUTE_LABELS: Record<string, string> = {
  brand: "Brand",
  brand_name: "Brand",
  manufacturer: "Manufacturer",
  model_number: "Model",
  model_name: "Model Name",
  part_number: "Part Number",
  item_type_name: "Item Type",
  material: "Material",
  material_type: "Material",
  color: "Color",
  color_name: "Color",
  size: "Size",
  size_name: "Size",
  style: "Style",
  style_name: "Style",
  pattern: "Pattern",
  pattern_name: "Pattern",
  finish_type: "Finish",
  shape: "Shape",
  theme: "Theme",
  occasion_type: "Occasion",
  target_gender: "Gender",
  age_range_description: "Age Range",
  department_name: "Department",
  fabric_type: "Fabric",
  item_weight: "Weight",
  item_package_weight: "Package Weight",
  item_dimensions: "Dimensions",
  item_package_dimensions: "Package Dimensions",
  number_of_items: "Items in Pack",
  number_of_pieces: "Pieces",
  capacity: "Capacity",
  volume_capacity_name: "Volume",
  wattage: "Wattage",
  voltage: "Voltage",
  power_source_type: "Power Source",
  battery: "Battery",
  included_components: "Included",
  special_feature: "Special Features",
  warranty_description: "Warranty",
  warranty_type: "Warranty Type",
  country_of_origin: "Country of Origin",
  care_instructions: "Care",
  assembly_required: "Assembly Required",
  is_assembly_required: "Assembly Required",
  batteries_required: "Batteries Required",
  recommended_uses_for_product: "Recommended Uses",
  usage: "Usage",
  fulfillment_availability: "Fulfillment",
};

// ---------------------------------------------------------------------------
// Token cache entry
// ---------------------------------------------------------------------------

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// LWA token response
// ---------------------------------------------------------------------------

interface LwaTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const SITE_SETTING_KEY = "amazon_sp_accounts";

@Injectable()
export class SpApiService {
  private readonly logger = new Logger(SpApiService.name);
  private readonly tokenCache = new Map<string, TokenCacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Account management
  // -------------------------------------------------------------------------

  async getAccounts(): Promise<SpAccount[]> {
    const setting = await this.prisma.siteSetting.findUnique({
      where: { key: SITE_SETTING_KEY },
    });
    if (!setting || !setting.value) return [];
    return setting.value as unknown as SpAccount[];
  }

  async saveAccount(data: UpsertAccountBody): Promise<SpAccount> {
    const accounts = await this.getAccounts();

    const id = data.id ?? randomUUID();
    const existing = accounts.findIndex((a) => a.id === id);

    const account: SpAccount = {
      id,
      name: data.name,
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      refreshToken: data.refreshToken,
      sellerId: data.sellerId,
      marketplace: data.marketplace,
      isActive: data.isActive,
      addedAt: existing >= 0 ? (accounts[existing]?.addedAt ?? new Date().toISOString()) : new Date().toISOString(),
    };

    if (existing >= 0) {
      accounts[existing] = account;
      this.logger.log(
        `Updated SP account id=${id} name=${data.name} clientId=${data.clientId} secret=*** refreshToken=***`,
      );
    } else {
      accounts.push(account);
      this.logger.log(
        `Added SP account id=${id} name=${data.name} clientId=${data.clientId} secret=*** refreshToken=***`,
      );
    }

    await this.prisma.siteSetting.upsert({
      where: { key: SITE_SETTING_KEY },
      create: {
        key: SITE_SETTING_KEY,
        value: accounts as unknown as Prisma.InputJsonValue,
      },
      update: { value: accounts as unknown as Prisma.InputJsonValue },
    });

    return account;
  }

  async deleteAccount(id: string): Promise<void> {
    const accounts = await this.getAccounts();
    const filtered = accounts.filter((a) => a.id !== id);
    await this.prisma.siteSetting.upsert({
      where: { key: SITE_SETTING_KEY },
      create: {
        key: SITE_SETTING_KEY,
        value: filtered as unknown as Prisma.InputJsonValue,
      },
      update: { value: filtered as unknown as Prisma.InputJsonValue },
    });
    this.tokenCache.delete(id);
    this.logger.log(`Deleted SP account id=${id}`);
  }

  // -------------------------------------------------------------------------
  // OAuth / token helpers
  // -------------------------------------------------------------------------

  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BadGatewayException(
        `Amazon LWA token exchange failed (${res.status}): ${text}`,
      );
    }

    const data = (await res.json()) as LwaTokenResponse;
    if (!data.access_token || !data.refresh_token) {
      throw new BadGatewayException(
        "Amazon LWA response missing access_token or refresh_token",
      );
    }

    return { access_token: data.access_token, refresh_token: data.refresh_token };
  }

  async getAccessToken(account: SpAccount): Promise<string> {
    const cached = this.tokenCache.get(account.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
      client_id: account.clientId,
      client_secret: account.clientSecret,
    });

    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BadGatewayException(
        `Failed to refresh Amazon SP-API access token for account "${account.name}" (${res.status}): ${text}`,
      );
    }

    const data = (await res.json()) as LwaTokenResponse;
    if (!data.access_token) {
      throw new BadGatewayException(
        `Amazon LWA refresh response for account "${account.name}" is missing access_token`,
      );
    }

    const ttlMs = (data.expires_in - 60) * 1000;
    this.tokenCache.set(account.id, {
      token: data.access_token,
      expiresAt: Date.now() + ttlMs,
    });

    return data.access_token;
  }

  // -------------------------------------------------------------------------
  // Catalog / product fetch
  // -------------------------------------------------------------------------

  async fetchProductByAsin(
    asin: string,
    accountId?: string,
  ): Promise<AmazonPreviewResult> {
    const account = await this.resolveAccount(accountId);
    const token = await this.getAccessToken(account);
    const { id: marketplaceId, endpoint } = this.resolveMarketplace(account);

    const url =
      `${endpoint}/catalog/2022-04-01/items/${encodeURIComponent(asin)}` +
      `?marketplaceIds=${marketplaceId}` +
      `&includedData=attributes,images,summaries,relationships`;

    const res = await fetch(url, {
      headers: { "x-amz-access-token": token },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BadGatewayException(
        `SP-API catalog lookup for ASIN "${asin}" failed (${res.status}): ${text}`,
      );
    }

    const item = (await res.json()) as CatalogItem;
    return this.mapCatalogItem(item, account.marketplace);
  }

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  async listProducts(
    accountId: string,
    pageToken?: string,
  ): Promise<{ items: ListingSummary[]; nextPageToken?: string }> {
    const account = await this.resolveAccount(accountId);
    const token = await this.getAccessToken(account);
    const { id: marketplaceId, endpoint } = this.resolveMarketplace(account);

    // Listings Items API — returns the seller's own active inventory.
    // Keyword filtering is handled client-side after fetching.
    // `relationships` is included so we can group child SKUs under their
    // parent ASIN (variation families like color/size/PushPullType).
    const params = new URLSearchParams({
      marketplaceIds: marketplaceId,
      includedData:
        "attributes,summaries,offers,fulfillmentAvailability,relationships",
      // Amazon SP-API default is 10 / page. Max allowed is 20. Doubles the
      // effective catalog cap from ~5,000 to ~10,000 SKUs on "Load ALL".
      pageSize: "20",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url =
      `${endpoint}/listings/2021-08-01/items/${encodeURIComponent(account.sellerId)}` +
      `?${params.toString()}`;

    const res = await fetch(url, {
      headers: { "x-amz-access-token": token },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BadGatewayException(
        `SP-API listings failed for account "${account.name}" (${res.status}): ${text}`,
      );
    }

    const body = (await res.json()) as {
      items: ListingsApiItem[];
      pagination?: { nextToken?: string };
    };

    const items: ListingSummary[] = (body.items ?? []).map((item) =>
      this.mapListingsItem(item),
    );

    return {
      items,
      nextPageToken: body.pagination?.nextToken,
    };
  }

  /**
   * Fetch a single seller listing by SKU via Listings Items API and map it to
   * the same shape that the Amazon import preview flow expects. Used when the
   * user selects an item from "My Amazon Listings" — we already know the SKU
   * and account, so we can pull full attributes (title, description, bullets,
   * images, price) without relying on the Catalog Items API (which Draft apps
   * can't call) or the HTML scraper (which can be blocked/misparsed).
   */
  async fetchListingBySku(
    accountId: string,
    sku: string,
  ): Promise<AmazonPreviewResult> {
    const account = await this.resolveAccount(accountId);
    const token = await this.getAccessToken(account);
    const { id: marketplaceId, endpoint } = this.resolveMarketplace(account);

    // NOTE: `images` is NOT a valid `includedData` value for Listings Items
    // API v2021-08-01 — Amazon returns 400 InvalidInput if we include it.
    // Image URLs come through the `*_image_locator` attributes instead, which
    // the mapper resolves. `relationships` and `productTypes` ARE valid and
    // give us parent/child SKU info + variation themes for deep enrichment.
    const params = new URLSearchParams({
      marketplaceIds: marketplaceId,
      includedData:
        "attributes,summaries,offers,fulfillmentAvailability,relationships,productTypes",
    });

    const url =
      `${endpoint}/listings/2021-08-01/items/${encodeURIComponent(account.sellerId)}/${encodeURIComponent(sku)}` +
      `?${params.toString()}`;

    const res = await fetch(url, {
      headers: { "x-amz-access-token": token },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BadGatewayException(
        `SP-API listing lookup for SKU "${sku}" failed (${res.status}): ${text}`,
      );
    }

    const item = (await res.json()) as ListingsApiItem;
    const preview = this.mapListingsItemToPreview(item);
    this.logger.log(
      `listing-preview SKU=${sku} ASIN=${preview.asin || "?"} images(listing)=${preview.images.length}`,
    );

    // Fallback: when the seller only uploaded a hero image (or none), pull
    // Amazon's public catalog carousel for the same ASIN so admins get the
    // full gallery. Bumped threshold 2 → 5 because many listings have ONLY
    // the square thumbnail; the catalog almost always has more angles.
    // ALSO copies bullets + description over when the listing had none,
    // because "product_description" / "bullet_point" attributes are often
    // empty on seller-side inventory even when Amazon's catalog has rich copy.
    if (preview.asin && (preview.images.length < 5 || preview.features.length === 0 || !preview.descriptionHtml)) {
      try {
        const catalog = await this.fetchProductByAsin(preview.asin, account.id);
        this.logger.log(
          `catalog-fallback ASIN=${preview.asin} images(catalog)=${catalog.images?.length ?? 0} features(catalog)=${catalog.features?.length ?? 0} desc=${!!catalog.descriptionHtml}`,
        );
        if (catalog.images?.length) {
          const merged = new Set<string>(preview.images);
          for (const u of catalog.images) merged.add(u);
          preview.images = Array.from(merged).slice(0, 15);
        }
        if (preview.features.length === 0 && catalog.features?.length) {
          preview.features = catalog.features;
        }
        if (!preview.descriptionHtml && catalog.descriptionHtml) {
          preview.descriptionHtml = catalog.descriptionHtml;
        }
        if (!preview.brand && catalog.brand) {
          preview.brand = catalog.brand;
        }
        if (!preview.category && catalog.category) {
          preview.category = catalog.category;
        }
      } catch (err) {
        this.logger.warn(
          `Catalog fallback for ASIN=${preview.asin} failed: ${(err as Error).message}`,
        );
      }
    }

    // Second fallback — scrape Amazon's public product page when we still
    // have < 3 images OR when bullets/description are still empty. Works
    // even when Catalog API is 403'd for the seller account. Non-fatal.
    if (preview.asin && (preview.images.length < 3 || preview.features.length === 0 || !preview.descriptionHtml)) {
      try {
        const scraped = await this.scrapePublicAmazon(preview.asin, account.marketplace);
        this.logger.log(
          `public-scrape ASIN=${preview.asin} images(scrape)=${scraped.images.length} bullets=${scraped.features.length} desc=${!!scraped.descriptionHtml}`,
        );
        if (scraped.images.length) {
          const merged = new Set<string>(preview.images);
          for (const u of scraped.images) merged.add(u);
          preview.images = Array.from(merged).slice(0, 15);
        }
        if (preview.features.length === 0 && scraped.features.length) {
          preview.features = scraped.features;
        }
        if (!preview.descriptionHtml && scraped.descriptionHtml) {
          preview.descriptionHtml = scraped.descriptionHtml;
        }
      } catch (err) {
        this.logger.warn(
          `Public scrape for ASIN=${preview.asin} failed: ${(err as Error).message}`,
        );
      }
    }

    return preview;
  }

  /**
   * Lightweight public-page scrape — used as a LAST-RESORT image fallback
   * when both Listings Items and Catalog Items return a sparse gallery.
   * Amazon's product page HTML embeds a `colorImages` JSON blob with every
   * hiRes URL in the carousel, which is way richer than either API gives us.
   */
  private async scrapePublicAmazon(asin: string, marketplace: string): Promise<{
    images: string[];
    features: string[];
    descriptionHtml?: string;
  }> {
    const host = marketplace === "in" ? "www.amazon.in"
      : marketplace === "us" ? "www.amazon.com"
      : marketplace === "uk" ? "www.amazon.co.uk"
      : "www.amazon.com";
    const url = `https://${host}/dp/${encodeURIComponent(asin)}`;
    const res = await fetch(url, {
      headers: {
        // Mimic a real Chrome / Windows request — bot-lite User-Agents get
        // thin HTML without the imageGalleryData / colorImages JSON blocks.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": marketplace === "in" ? "en-IN,en;q=0.9" : "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
      },
    });
    if (!res.ok) {
      this.logger.warn(`public-scrape ASIN=${asin} HTTP ${res.status}`);
      return { images: [], features: [] };
    }
    const html = await res.text();
    // Short-body detection — when Amazon serves a bot/captcha interstitial
    // the response is usually < 5 KB and lacks product HTML. Log so we can
    // tell this from "product exists but no carousel".
    if (html.length < 8000) {
      this.logger.warn(`public-scrape ASIN=${asin} short body ${html.length}B — likely captcha/blocked`);
    }

    const out: string[] = [];
    const seen = new Set<string>();
    const addImg = (u?: string) => {
      if (!u) return;
      // Strip size modifier to get full-res (e.g. ._AC_SL1500_. → .)
      const full = u.replace(/\._[A-Z0-9,_]+_\./g, ".");
      if (full.startsWith("http") && !seen.has(full)) { seen.add(full); out.push(full); }
    };

    // Strategy 1 — the `colorImages.initial` JSON (main + angle shots)
    const ciMatch = html.match(/"colorImages"\s*:\s*\{\s*"initial"\s*:\s*(\[[\s\S]*?\])\s*\}/);
    if (ciMatch?.[1]) {
      try {
        const arr = JSON.parse(ciMatch[1].replace(/\\'/g, "'")) as Array<{ hiRes?: string; large?: string; thumb?: string }>;
        for (const img of arr) addImg(img.hiRes || img.large || img.thumb);
      } catch { /* fall through */ }
    }

    // Strategy 2 — the `imageGalleryData` array (used on newer product pages)
    if (out.length < 3) {
      const galleryMatch = html.match(/'imageGalleryData'\s*:\s*(\[[\s\S]*?\])/) ?? html.match(/"imageGalleryData"\s*:\s*(\[[\s\S]*?\])/);
      if (galleryMatch?.[1]) {
        try {
          const arr = JSON.parse(galleryMatch[1].replace(/\\'/g, "'")) as Array<{ mainUrl?: string; thumbUrl?: string }>;
          for (const img of arr) addImg(img.mainUrl || img.thumbUrl);
        } catch { /* fall through */ }
      }
    }

    // Strategy 3 — `data-old-hires` attribute on landingImage
    if (out.length < 2) {
      const lm = html.match(/<img[^>]*id="landingImage"[^>]*data-old-hires="([^"]+)"/)
        ?? html.match(/<img[^>]*id="landingImage"[^>]*src="([^"]+)"/);
      if (lm?.[1]) addImg(lm[1]);
    }

    // Strategy 4 — generic Amazon CDN image scan across the full HTML
    if (out.length < 3) {
      const genRe = /https?:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|images-eu\.ssl-images-amazon\.com)\/images\/I\/[A-Za-z0-9_.+-]+\.(?:jpg|jpeg|png)/g;
      let m;
      while ((m = genRe.exec(html)) !== null && out.length < 15) addImg(m[0]);
    }

    // ── Bullets — extract from #feature-bullets ul li span ──────────────
    const features: string[] = [];
    // Match <li ... ><span class="a-list-item">TEXT</span></li>
    const featureRe = /<li[^>]*?>\s*<span[^>]*class="[^"]*a-list-item[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi;
    // Only look inside the feature-bullets div to avoid grabbing unrelated lists
    const fbIdx = html.indexOf("feature-bullets");
    if (fbIdx >= 0) {
      const scope = html.slice(fbIdx, fbIdx + 20000); // window after the marker
      let fm;
      while ((fm = featureRe.exec(scope)) !== null && features.length < 10) {
        const raw = fm[1] ?? "";
        const text = raw
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text && text.length > 2 && text.length < 500) features.push(text);
      }
    }

    // ── Description — A+ content block and productDescription div ───────
    let descriptionHtml: string | undefined;
    // Preferred: productDescription div (plain HTML paragraphs)
    const pdMatch = html.match(/<div[^>]*id="productDescription"[^>]*>([\s\S]*?)<\/div>/i);
    if (pdMatch?.[1]) {
      // Strip scripts/styles but keep basic formatting
      const cleaned = pdMatch[1]
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<a\s+/gi, "<span ")
        .replace(/<\/a>/gi, "</span>")
        .trim();
      if (cleaned.length > 20) descriptionHtml = cleaned;
    }

    return { images: out.slice(0, 15), features, descriptionHtml };
  }

  private mapListingsItemToPreview(item: ListingsApiItem): AmazonPreviewResult {
    const summary = item.summaries?.[0] ?? {};
    const attrs = item.attributes ?? {};

    const asin: string = summary.asin ?? "";

    const title: string =
      summary.itemName ??
      (attrs["item_name"]?.[0]?.value as string | undefined) ??
      "";

    // Description: product_description is usually plain text / light HTML.
    const descriptionRaw =
      (attrs["product_description"]?.[0]?.value as string | undefined) ?? "";
    const descriptionHtml = descriptionRaw
      ? /<\w/.test(descriptionRaw)
        ? descriptionRaw
        : `<p>${descriptionRaw}</p>`
      : undefined;

    // Bullet features
    const features: string[] = (attrs["bullet_point"] ?? [])
      .map((b) => b.value as string | undefined)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    // Brand
    const brand: string | undefined =
      summary.brand ??
      (attrs["brand"]?.[0]?.value as string | undefined) ??
      (attrs["brand_name"]?.[0]?.value as string | undefined);

    // Price: offers[0].price.amount, fallback to purchasable_offer
    let price: number | undefined = item.offers?.[0]?.price?.amount;
    if (price === undefined) {
      const purchasableOffer = attrs["purchasable_offer"];
      if (purchasableOffer?.[0]) {
        const ourPrice = (
          purchasableOffer[0] as {
            our_price?: Array<{ schedule?: Array<{ value_with_tax?: number }> }>;
          }
        ).our_price;
        price = ourPrice?.[0]?.schedule?.[0]?.value_with_tax;
      }
    }

    // Category — listings payloads don't reliably expose one; leave undefined.
    const category: string | undefined = undefined;

    // Images come from `*_image_locator` attributes (main_product_image_locator,
    // other_product_image_locator_1..N, swatch_product_image_locator) — each
    // entry's value is an object with `media_location` pointing to the CDN URL.
    const imageSet = new Set<string>();
    const locatorKeys = Object.keys(attrs).filter((k) =>
      /image_locator/i.test(k),
    );
    for (const key of locatorKeys) {
      const entries = attrs[key];
      if (!entries) continue;
      for (const entry of entries) {
        const v = entry.value;
        if (
          v &&
          typeof v === "object" &&
          "media_location" in (v as object)
        ) {
          const loc = (v as { media_location?: string }).media_location;
          if (loc && loc.startsWith("http")) imageSet.add(loc);
        } else if (typeof v === "string" && v.startsWith("http")) {
          imageSet.add(v);
        }
      }
    }
    // Fallback: summary.mainImage.link if no locator attributes found
    if (imageSet.size === 0 && summary.mainImage?.link) {
      imageSet.add(summary.mainImage.link);
    }
    const images: string[] = Array.from(imageSet).slice(0, 12);

    // Specs: walk known attribute keys and stringify their values into a
    // clean label→value map. Skips empty/null entries.
    const specs: Record<string, string> = {};
    for (const [key, label] of Object.entries(SPEC_ATTRIBUTE_LABELS)) {
      const rawEntries = attrs[key];
      if (!rawEntries || rawEntries.length === 0) continue;
      const joined = rawEntries
        .map((e) => this.specValueToString(e.value))
        .filter((s) => s && s.length > 0)
        .join(", ");
      if (joined) specs[label] = joined;
    }

    // Relationships: parent ASIN + whether this listing has variants
    let parentAsin: string | undefined;
    let hasVariants = false;
    const rels = item.relationships?.[0]?.relationships ?? [];
    for (const r of rels) {
      if ((r.type ?? "").toUpperCase() === "VARIATION") {
        if (r.parentSkus && r.parentSkus.length > 0) {
          // There's a parent — this is a child variant. Can't directly map to ASIN
          // without another lookup, but we flag the existence.
          hasVariants = true;
        }
        if (r.childSkus && r.childSkus.length > 0) {
          hasVariants = true;
        }
      }
    }
    void parentAsin; // reserved for future enrichment via secondary fetch

    return {
      asin,
      parentAsin: undefined,
      title,
      descriptionHtml,
      features,
      brand,
      price,
      category,
      images,
      variants: [],
      hasVariants,
      specs,
    };
  }

  /**
   * Best-effort stringifier for a Listings-Items attribute value. Handles the
   * common shapes we've seen in practice: plain strings, numbers, objects with
   * { value, unit } (weight/dimensions), { language_tag, value } locales, and
   * arrays thereof.
   */
  private specValueToString(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) {
      return v
        .map((x) => this.specValueToString(x))
        .filter((s) => s.length > 0)
        .join(", ");
    }
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      // weight/dimension shape: { value, unit }
      if ("value" in obj && "unit" in obj) {
        const val = obj.value;
        const unit = obj.unit;
        return `${val ?? ""} ${unit ?? ""}`.trim();
      }
      // { length: { value, unit }, width: { value, unit }, height: { value, unit } }
      if ("length" in obj || "width" in obj || "height" in obj) {
        const parts: string[] = [];
        for (const k of ["length", "width", "height"]) {
          const sub = obj[k];
          if (sub) {
            const s = this.specValueToString(sub);
            if (s) parts.push(s);
          }
        }
        if (parts.length > 0) return parts.join(" × ");
      }
      // localized value: { language_tag, value }
      if ("value" in obj) return this.specValueToString(obj.value);
      // fallback: first non-empty string-ish value in the object
      for (const key of Object.keys(obj)) {
        const s = this.specValueToString(obj[key]);
        if (s) return s;
      }
    }
    return "";
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async resolveAccount(accountId?: string): Promise<SpAccount> {
    const accounts = await this.getAccounts();

    if (accountId) {
      const found = accounts.find((a) => a.id === accountId);
      if (!found) {
        throw new BadRequestException(
          `SP account with id "${accountId}" not found`,
        );
      }
      return found;
    }

    const active = accounts.find((a) => a.isActive);
    if (!active) {
      throw new BadRequestException(
        "No active Amazon SP account configured. Add one via POST /amazon-sp/accounts.",
      );
    }
    return active;
  }

  private resolveMarketplace(account: SpAccount): { id: string; endpoint: string } {
    const mp = MARKETPLACE_MAP[account.marketplace];
    if (!mp) {
      throw new BadRequestException(
        `Unknown marketplace "${account.marketplace}" for account "${account.name}"`,
      );
    }
    return mp;
  }

  private mapCatalogItem(item: CatalogItem, marketplace: string): AmazonPreviewResult {
    const summaries = item.summaries ?? [];
    const attrs = item.attributes ?? {};
    const summary = summaries[0] ?? {};

    const title: string =
      summary.itemName ??
      (attrs["item_name"]?.[0]?.value as string | undefined) ??
      "";

    const descriptionRaw =
      (attrs["product_description"]?.[0]?.value as string | undefined) ?? "";
    const descriptionHtml = descriptionRaw ? `<p>${descriptionRaw}</p>` : undefined;

    const features: string[] = (attrs["bullet_point"] ?? [])
      .map((b) => b.value as string | undefined)
      .filter((v): v is string => typeof v === "string");

    const brand: string | undefined =
      summary.brandName ??
      (attrs["brand"]?.[0]?.value as string | undefined);

    // Price: try list_price first, then purchasable_offer
    let price: number | undefined;
    const listPrice = attrs["list_price"]?.[0]?.value;
    if (
      listPrice !== null &&
      typeof listPrice === "object" &&
      "amount" in (listPrice as object)
    ) {
      price = (listPrice as { amount: number }).amount;
    } else {
      const purchasableOffer = attrs["purchasable_offer"];
      if (purchasableOffer?.[0]) {
        const ourPrice = (
          purchasableOffer[0] as {
            our_price?: Array<{ schedule?: Array<{ value_with_tax?: number }> }>;
          }
        ).our_price;
        price = ourPrice?.[0]?.schedule?.[0]?.value_with_tax;
      }
    }

    const category: string | undefined =
      summary.browseClassification?.displayName?.toLowerCase();

    // Images — Amazon catalog returns MULTIPLE copies of each physical image
    // at different sizes. We want the UNIQUE set, one biggest copy each.
    // Was capped at 8 → bumped to 15 so the import carousel is complete.
    const rawImages: CatalogImage[] =
      (item.images?.[0]?.images ?? []).filter((img) =>
        img.link?.startsWith("http"),
      );
    rawImages.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    // Dedupe on the basename (Amazon's hash before the size suffix) so we
    // don't return 8 copies of the same main image at different resolutions.
    const basenameSeen = new Set<string>();
    const uniqueBest: string[] = [];
    for (const img of rawImages) {
      const m = img.link.match(/\/I\/([A-Za-z0-9_.+-]+?)\._/);
      const key = m?.[1] ?? img.link;
      if (basenameSeen.has(key)) continue;
      basenameSeen.add(key);
      uniqueBest.push(img.link);
      if (uniqueBest.length >= 15) break;
    }
    const images: string[] = uniqueBest;

    // Variants placeholder; populated separately
    const variants: AmazonPreviewResult["variants"] = [];

    const hasVariants: boolean =
      (item.relationships?.[0]?.relationships ?? []).some(
        (r) => r.type === "VARIATION" && (r.childAsins?.length ?? 0) > 0,
      );

    void marketplace; // used by callers when they need marketplace-specific logic

    // Specs: same extraction pass as the Listings mapper
    const specs: Record<string, string> = {};
    for (const [key, label] of Object.entries(SPEC_ATTRIBUTE_LABELS)) {
      const rawEntries = attrs[key];
      if (!rawEntries || rawEntries.length === 0) continue;
      const joined = rawEntries
        .map((e) => this.specValueToString(e.value))
        .filter((s) => s && s.length > 0)
        .join(", ");
      if (joined) specs[label] = joined;
    }

    return {
      asin: item.asin,
      parentAsin: item.parentAsin,
      title,
      descriptionHtml,
      features,
      brand,
      price,
      category,
      images,
      variants,
      hasVariants,
      specs,
    };
  }

  private mapListingsItem(item: ListingsApiItem): ListingSummary {
    const summary = item.summaries?.[0] ?? {};
    const attrs = item.attributes ?? {};

    const asin: string = summary.asin ?? "";
    const title: string =
      summary.itemName ??
      (attrs["item_name"]?.[0]?.value as string | undefined) ??
      "";

    const offer = item.offers?.[0];
    const rawPrice = offer?.price?.amount;
    const price: number | undefined =
      rawPrice === undefined || rawPrice === null
        ? undefined
        : Number.isFinite(Number(rawPrice))
          ? Number(rawPrice)
          : undefined;
    const currency: string = offer?.price?.currency ?? "INR";

    const quantity: number = Number(
      item.fulfillmentAvailability?.[0]?.quantity ?? 0,
    );

    const productType: string = summary.productType ?? "";
    const status: string[] = summary.status ?? [];

    // ── Relationships (parent/child variation family) ───────────────────
    let parentSku: string | undefined;
    let childSkus: string[] | undefined;
    let variationTheme: string | undefined;
    for (const rel of item.relationships ?? []) {
      for (const r of rel.relationships ?? []) {
        if ((r.type ?? "").toUpperCase() !== "VARIATION") continue;
        if (r.parentSkus && r.parentSkus.length > 0) {
          parentSku = r.parentSkus[0]?.sku;
        }
        if (r.childSkus && r.childSkus.length > 0) {
          childSkus = r.childSkus
            .map((x) => x.sku)
            .filter((s): s is string => Boolean(s));
        }
        if (r.variationTheme?.theme) {
          variationTheme = this.prettifyThemeName(r.variationTheme.theme);
        }
      }
    }

    // ── Variant axes (the specific color/size/type values for THIS child) ─
    const variantAxes = this.extractVariantAxes(attrs);

    // Image: try attribute locator first, then summary.mainImage.link, then
    // scan any *_image_locator attribute as a last-resort fallback.
    let imageUrl: string | undefined;
    const imageLocationValue = attrs["main_product_image_locator"]?.[0]?.value;
    if (
      imageLocationValue &&
      typeof imageLocationValue === "object" &&
      "media_location" in (imageLocationValue as object)
    ) {
      imageUrl = (imageLocationValue as { media_location: string }).media_location;
    }
    if (!imageUrl && summary.mainImage?.link) {
      imageUrl = summary.mainImage.link;
    }
    if (!imageUrl) {
      for (const key of Object.keys(attrs)) {
        if (!/image_locator/i.test(key)) continue;
        for (const entry of attrs[key] ?? []) {
          const v = entry.value;
          if (v && typeof v === "object" && "media_location" in (v as object)) {
            const loc = (v as { media_location?: string }).media_location;
            if (loc && loc.startsWith("http")) {
              imageUrl = loc;
              break;
            }
          }
        }
        if (imageUrl) break;
      }
    }

    return {
      sku: item.sku,
      asin,
      title,
      status,
      price,
      currency,
      quantity,
      productType,
      imageUrl,
      parentSku,
      childSkus,
      variationTheme,
      variantAxes,
    };
  }

  /**
   * Convert Amazon's raw variation-theme keys (SCREAMING_SNAKE or camelCase
   * like "PUSH_PULL_TYPE", "COLOR_SIZE", "ColorName") to a friendly label.
   */
  private prettifyThemeName(raw: string): string {
    if (!raw) return "";
    // Split SCREAMING_SNAKE or kebab
    const parts = raw
      .replace(/[_-]+/g, " ")
      // insert space between camelCase
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    // Merge "Name"/"Type" suffixes back with the preceding word for compactness
    const joined = parts.join(" ");
    return joined
      .replace(/\bPush Pull\b/gi, "Push/Pull")
      .replace(/ Name$/i, "")
      .trim();
  }

  /**
   * Look at a child-listing's attribute bag and pick out the variation-axis
   * values (color, size, style, PushPullType, etc.) to display as a readable
   * label map.
   */
  private extractVariantAxes(
    attrs: Record<string, Array<{ value?: unknown; language_tag?: string }>>,
  ): Record<string, string> | undefined {
    const AXIS_KEYS: Record<string, string> = {
      color_name: "Color",
      color: "Color",
      size_name: "Size",
      size: "Size",
      style_name: "Style",
      style: "Style",
      pattern_name: "Pattern",
      pattern: "Pattern",
      material_type: "Material",
      material: "Material",
      push_pull_type: "Push/Pull",
      finish_type: "Finish",
      flavor_name: "Flavor",
      flavor: "Flavor",
      scent_name: "Scent",
      scent: "Scent",
      model_number: "Model",
      item_shape: "Shape",
    };
    const axes: Record<string, string> = {};
    for (const [key, label] of Object.entries(AXIS_KEYS)) {
      const entries = attrs[key];
      if (!entries || entries.length === 0) continue;
      const raw = entries[0]?.value;
      const s = this.specValueToString(raw);
      if (s) axes[label] = s;
    }
    return Object.keys(axes).length > 0 ? axes : undefined;
  }
}

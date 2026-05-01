/**
 * ImportsService — unified product import surface.
 *
 * Amazon import: scrapes product pages directly (no PA API, no credentials).
 * Extracts everything our product listing needs — title, bullets, price, main
 * images, brand, and variant dimensions with per-variant images/prices.
 * The admin UI lets the user AI-enhance title/description and AI-generate
 * fresh images before committing as a draft.
 *
 * Legacy importers (Shopify, URL, CSV) are unchanged.
 */

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  AmazonPreviewResult,
  AmazonVariant,
  ImportResult,
  ImportSource,
  ProductDraft,
} from "./imports.schemas";

const FETCH_TIMEOUT_MS = 15_000;

const AMAZON_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
];

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new BadGatewayException(
      `Upstream fetch failed for ${url}: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extractAsin(asinOrUrl: string): string | null {
  const trimmed = asinOrUrl.trim();
  if (/^[A-Z0-9]{10}$/i.test(trimmed)) return trimmed.toUpperCase();
  const m =
    trimmed.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i) ??
    trimmed.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return m && m[1] ? m[1].toUpperCase() : null;
}

function extractAmazonDomain(asinOrUrl: string): string {
  const m = asinOrUrl.match(
    /amazon\.(in|com|co\.uk|de|fr|es|it|co\.jp|ca|com\.au|com\.mx)/i,
  );
  return m?.[1]?.toLowerCase() ?? "in";
}

function decodeHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the full innerHTML of a div by id, using depth counting.
 * Regex can't handle nested divs — this walks the string with a counter.
 */
function extractDivContent(html: string, id: string): string {
  const idAttr = `id="${id}"`;
  const idIdx = html.indexOf(idAttr);
  if (idIdx === -1) return "";
  // Walk back to the opening <
  let tagStart = idIdx;
  while (tagStart > 0 && html[tagStart] !== "<") tagStart--;
  if (html.slice(tagStart, tagStart + 4).toLowerCase() !== "<div") return "";
  // Find the end > of the opening tag
  const tagEnd = html.indexOf(">", idIdx);
  if (tagEnd === -1) return "";
  // Count div depth to find matching close tag
  let depth = 1;
  let i = tagEnd + 1;
  while (i < html.length && depth > 0) {
    if (html.slice(i, i + 4).toLowerCase() === "<div") depth++;
    else if (html.slice(i, i + 5).toLowerCase() === "</div") {
      depth--;
      if (depth === 0) return html.slice(tagEnd + 1, i);
    }
    i++;
  }
  return "";
}

/**
 * Extract a JSON object or array for a given key using bracket counting.
 * Far more reliable than regex for nested structures.
 */
function extractJsonValue(
  html: string,
  key: string,
  type: "{" | "[" = "{",
): string | null {
  const closeChar = type === "{" ? "}" : "]";
  const searchKey = `"${key}"`;
  let searchFrom = 0;
  while (searchFrom < html.length) {
    const keyIdx = html.indexOf(searchKey, searchFrom);
    if (keyIdx === -1) return null;
    // Skip whitespace, colon, single quotes after key
    let p = keyIdx + searchKey.length;
    while (p < html.length && /[\s:'"]/.test(html[p]!)) {
      // Stop at the bracket type we're looking for
      if (html[p] === type) break;
      p++;
    }
    if (html[p] !== type) {
      searchFrom = keyIdx + 1;
      continue;
    }
    // Bracket-count scan
    let depth = 0;
    let inStr = false;
    let escaped = false;
    let i = p;
    while (i < html.length) {
      const c = html[i]!;
      if (escaped) {
        escaped = false;
        i++;
        continue;
      }
      if (c === "\\" && inStr) {
        escaped = true;
        i++;
        continue;
      }
      if (c === '"') {
        inStr = !inStr;
        i++;
        continue;
      }
      if (inStr) {
        i++;
        continue;
      }
      if (c === type) depth++;
      else if (c === closeChar) {
        depth--;
        if (depth === 0) return html.slice(p, i + 1);
      }
      i++;
    }
    searchFrom = keyIdx + 1;
  }
  return null;
}

function extractShopifyHandle(handleOrUrl: string): string | null {
  const trimmed = handleOrUrl.trim();
  if (/^[a-z0-9-]+$/i.test(trimmed)) return trimmed.toLowerCase();
  const m = trimmed.match(/\/products\/([a-z0-9-]+)/i);
  return m && m[1] ? m[1].toLowerCase() : null;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Amazon preview — direct scraper, no credentials
  // ---------------------------------------------------------------------------

  async previewAmazon(asinOrUrl: string): Promise<AmazonPreviewResult> {
    const asin = extractAsin(asinOrUrl);
    if (!asin) {
      throw new BadRequestException(
        "Could not extract ASIN. Paste a 10-char ASIN (e.g. B09N5WRWNW) or a full amazon.* product URL.",
      );
    }
    const domain = extractAmazonDomain(asinOrUrl);

    // Strategy A — desktop product page
    const desktopUrl = `https://www.amazon.${domain}/dp/${asin}?th=1&psc=1`;
    let lastErr: Error | null = null;
    let html: string | null = null;
    try {
      html = await this.fetchAmazonPage(desktopUrl, "desktop");
    } catch (e) {
      lastErr = e as Error;
      this.logger.warn(`[amazon-scrape] desktop fetch failed: ${lastErr.message}`);
    }

    let result: AmazonPreviewResult | null = null;
    if (html) {
      result = this.parseAmazonProductPage(html, asin);
      const empty = !result.title && result.images.length === 0 && !result.price;
      if (empty) {
        this.logger.warn(
          `[amazon-scrape] desktop parse returned empty (html=${html.length}b) for ${asin}; trying mobile`,
        );
        result = null;
      } else {
        this.logger.log(
          `[amazon-scrape] OK desktop asin=${asin} title="${result.title.slice(0, 60)}" imgs=${result.images.length} price=${result.price ?? "?"}`,
        );
      }
    }

    // Strategy B — mobile page (simpler markup, often passes bot checks)
    if (!result) {
      const mobileUrl = `https://www.amazon.${domain}/gp/aw/d/${asin}`;
      try {
        const mHtml = await this.fetchAmazonPage(mobileUrl, "mobile");
        result = this.parseAmazonProductPage(mHtml, asin);
        this.logger.log(
          `[amazon-scrape] mobile asin=${asin} title="${result.title.slice(0, 60)}" imgs=${result.images.length}`,
        );
      } catch (e) {
        lastErr = e as Error;
        this.logger.warn(`[amazon-scrape] mobile fetch failed: ${lastErr.message}`);
      }
    }

    // Final validation — if everything empty, throw a clear error so the UI
    // shows "try manual entry" instead of a blank preview.
    if (!result || (!result.title && result.images.length === 0 && !result.price)) {
      throw new BadGatewayException(
        lastErr?.message ||
          `Amazon returned a page we couldn't extract anything from (likely a soft bot-block). You can still paste the title manually below and use the AI Enhance + AI Generate Image buttons to fill in the rest.`,
      );
    }
    return result;
  }

  private async fetchAmazonPage(
    url: string,
    mode: "desktop" | "mobile" = "desktop",
  ): Promise<string> {
    // Use a mobile UA when fetching the mobile URL — Amazon serves different
    // (simpler) markup there and is less aggressive about blocking.
    const pool =
      mode === "mobile"
        ? [AMAZON_USER_AGENTS[2]!] // iPhone Safari
        : AMAZON_USER_AGENTS;
    const ua = pool[Math.floor(Math.random() * pool.length)]!;

    const resp = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": ua,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/avif,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (!resp.ok) {
      throw new BadGatewayException(
        `Amazon returned HTTP ${resp.status}. The product may be unavailable, removed, or the URL is wrong.`,
      );
    }
    const html = await resp.text();

    // Detect CAPTCHA / bot-block pages
    if (
      html.length < 5000 ||
      html.includes("Enter the characters you see below") ||
      html.includes("Type the characters you see in this image") ||
      html.includes("Sorry, we just need to make sure you&#39;re not a robot") ||
      /<title>[^<]*Robot Check[^<]*<\/title>/i.test(html)
    ) {
      throw new BadGatewayException(
        "Amazon blocked the request (bot detection on server IP). Try again in a few minutes. If it keeps failing, you can paste the product details manually into the editor after importing.",
      );
    }
    return html;
  }

  private parseAmazonProductPage(
    html: string,
    asin: string,
  ): AmazonPreviewResult {
    // ── Title (8 patterns, first non-empty wins) ──────────────────────
    let title = "";
    const titlePatterns = [
      /<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/,
      /<h1[^>]*id="title"[^>]*>([\s\S]*?)<\/h1>/,
      /<h1[^>]*class="[^"]*a-size-large[^"]*"[^>]*>([\s\S]*?)<\/h1>/,
      /<span[^>]*class="[^"]*a-size-large product-title[^"]*"[^>]*>([\s\S]*?)<\/span>/,
      /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/,
      /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/,
      /<title>([^<]+?)(?:\s*[:|-]\s*Amazon\.[a-z.]+)?<\/title>/i,
    ];
    for (const pat of titlePatterns) {
      const m = html.match(pat);
      if (m?.[1]) {
        const candidate = decodeHtml(m[1])
          .replace(/\s*:\s*Amazon\.[a-z.]+.*$/i, "")
          .trim();
        if (candidate.length > 3) {
          title = candidate;
          break;
        }
      }
    }

    // ── Brand ─────────────────────────────────────────────────────────
    let brand: string | undefined;
    const brandLink = html.match(/<a[^>]*id="bylineInfo"[^>]*>([\s\S]*?)<\/a>/);
    if (brandLink?.[1]) {
      const b = decodeHtml(brandLink[1])
        .replace(/^(Visit the|Brand:|Visit )\s*/i, "")
        .replace(/\s*(Store|Brand)$/i, "")
        .trim();
      if (b) brand = b;
    }

    // ── Category (breadcrumb — use depth-counter div extract) ─────────
    let category: string | undefined;
    const bcContent = extractDivContent(html, "wayfinding-breadcrumbs_feature_div");
    if (bcContent) {
      const crumbs: string[] = [];
      const crumbRe =
        /<a[^>]*class="a-link-normal a-color-tertiary"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = crumbRe.exec(bcContent)) !== null) {
        crumbs.push(decodeHtml(m[1]!));
      }
      if (crumbs.length > 0)
        category = crumbs[crumbs.length - 1]?.toLowerCase();
    }

    // ── Feature bullets ───────────────────────────────────────────────
    const bullets: string[] = [];
    const fbContent = extractDivContent(html, "feature-bullets");
    if (fbContent) {
      const liRe =
        /<li(?![^>]*class="[^"]*aok-hidden)[^>]*>[\s\S]*?<span[^>]*class="[^"]*a-list-item[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
      let m;
      while ((m = liRe.exec(fbContent)) !== null) {
        const t = decodeHtml(m[1]!);
        if (
          t.length > 3 &&
          !t.toLowerCase().includes("make sure this fits") &&
          !bullets.includes(t)
        ) {
          bullets.push(t);
        }
      }
    }

    // ── Description ───────────────────────────────────────────────────
    // Strategy 1: productDescription — full content via depth counter,
    // then grab <p> tags inside (regex previously stopped at first </div>)
    let descriptionHtml: string | undefined;
    const descContent = extractDivContent(html, "productDescription");
    if (descContent) {
      const pTags: string[] = [];
      const pRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
      let m;
      while ((m = pRe.exec(descContent)) !== null) {
        const t = decodeHtml(m[1]!).trim();
        if (t.length > 10) pTags.push(`<p>${t}</p>`);
      }
      if (pTags.length) descriptionHtml = pTags.join("\n");
    }
    // Strategy 2: A+ content areas
    if (!descriptionHtml) {
      for (const aplusId of [
        "aplus",
        "dpx-aplus-product-description_feature_div",
        "aplus3p_feature_div",
      ]) {
        const ac = extractDivContent(html, aplusId);
        if (!ac) continue;
        const bits: string[] = [];
        const headRe = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g;
        const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
        let m;
        while ((m = headRe.exec(ac)) !== null && bits.length < 3) {
          const t = decodeHtml(m[1]!).trim();
          if (t.length > 5) bits.push(`<strong>${t}</strong>`);
        }
        while ((m = paraRe.exec(ac)) !== null && bits.length < 8) {
          const t = decodeHtml(m[1]!).trim();
          if (t.length > 20) bits.push(`<p>${t}</p>`);
        }
        if (bits.length) {
          descriptionHtml = bits.join("\n");
          break;
        }
      }
    }
    // Strategy 3: og:description meta fallback
    if (!descriptionHtml) {
      const ogDesc = html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{30,})["']/,
      );
      if (ogDesc?.[1]) descriptionHtml = `<p>${decodeHtml(ogDesc[1])}</p>`;
    }

    // ── Price ─────────────────────────────────────────────────────────
    let price: number | undefined;
    for (const pat of [
      /<span[^>]*class="[^"]*priceToPay[^"]*"[\s\S]*?<span[^>]*class="a-offscreen"[^>]*>\s*[^\d]*([\d,]+(?:\.\d+)?)/,
      /<span[^>]*class="a-offscreen"[^>]*>\s*[^\d]*([\d,]+(?:\.\d+)?)/,
    ]) {
      const m = html.match(pat);
      if (m?.[1]) {
        const n = Number(m[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) {
          price = n;
          break;
        }
      }
    }
    if (!price) {
      const whole = html.match(/<span[^>]*class="a-price-whole"[^>]*>([\d,]+)/);
      if (whole?.[1]) {
        const n = Number(whole[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) price = n;
      }
    }

    // ── Images ────────────────────────────────────────────────────────
    const images: string[] = [];
    const seen = new Set<string>();
    const addImg = (u?: string) => {
      if (!u) return;
      // Strip size modifier to get full-res (e.g. ._AC_SL1500_. → .)
      const full = u.replace(/\._[A-Z0-9,_]+_\./g, ".");
      if (full.startsWith("http") && !seen.has(full)) {
        seen.add(full);
        images.push(full);
      }
    };

    // Strategy 1: colorImages — bracket-counter JSON extract (reliable)
    const ciStr = extractJsonValue(html, "colorImages");
    if (ciStr) {
      try {
        const ci = JSON.parse(
          ciStr.replace(/\\'/g, "'").replace(/'/g, '"'),
        ) as Record<
          string,
          Array<{ hiRes?: string; large?: string; thumb?: string }>
        >;
        for (const img of ci["initial"] ?? []) {
          addImg(img.hiRes || img.large);
        }
      } catch {
        /* ignore */
      }
    }

    // Strategy 2: landingImage (single main product image element)
    if (images.length === 0) {
      const lm =
        html.match(/<img[^>]*id="landingImage"[^>]*data-old-hires="([^"]+)"/) ??
        html.match(/<img[^>]*id="landingImage"[^>]*src="([^"]+)"/);
      if (lm?.[1]) addImg(lm[1]);
    }

    // Strategy 3: generic Amazon CDN URLs as last resort
    if (images.length < 2) {
      const genRe =
        /https?:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\/images\/I\/[A-Za-z0-9_.+-]+\.(?:jpg|jpeg|png)/g;
      let mm;
      while ((mm = genRe.exec(html)) !== null && images.length < 8)
        addImg(mm[0]);
    }

    // ── Variants ──────────────────────────────────────────────────────
    const variants = this.extractAmazonVariants(html);

    return {
      asin,
      title,
      features: bullets,
      price,
      images,
      category,
      brand,
      variants,
      hasVariants: variants.length > 0,
      descriptionHtml,
    };
  }

  private extractAmazonVariants(html: string): AmazonVariant[] {
    // Amazon's twister widget embeds variant data in JS variables.
    // We use the bracket-counter extractor (not regex) to reliably parse
    // nested JSON, then map ASIN → { dimensions, price, image }.
    try {
      // ── 1. Dimension names ────────────────────────────────────────────
      let dims: string[] = [];
      const dimsStr =
        extractJsonValue(html, "dimensionsDisplay", "[") ??
        extractJsonValue(html, "dimensions", "[");
      if (dimsStr) {
        try {
          dims = (JSON.parse(dimsStr) as string[]).map((d) =>
            String(d)
              .toLowerCase()
              .replace(/_name$/, "")
              .replace(/_/g, " ")
              .trim(),
          );
        } catch {
          /* ignore */
        }
      }

      // ── 2. ASIN → [dim value, ...] map ───────────────────────────────
      const dvStr = extractJsonValue(html, "dimensionValuesDisplayData");
      if (!dvStr || !dims.length) return [];
      let dimValues: Record<string, string[]> = {};
      try {
        dimValues = JSON.parse(dvStr) as Record<string, string[]>;
      } catch {
        return [];
      }

      // ── 3. Per-ASIN price map from twisterSlotDivData ─────────────────
      const priceMap: Record<string, number> = {};
      const twsStr = extractJsonValue(html, "twisterSlotDivData");
      if (twsStr) {
        try {
          const raw = JSON.parse(twsStr) as Record<
            string,
            { priceAmount?: number; buyingPrice?: string; price?: string }
          >;
          for (const [a, info] of Object.entries(raw)) {
            const n =
              info.priceAmount ??
              (info.buyingPrice
                ? Number(info.buyingPrice.replace(/[^\d.]/g, ""))
                : undefined) ??
              (info.price
                ? Number(info.price.replace(/[^\d.]/g, ""))
                : undefined);
            if (n != null && Number.isFinite(n) && n > 0)
              priceMap[a.toUpperCase()] = n;
          }
        } catch {
          /* ignore */
        }
      }

      // ── 4. Per-color image map from colorImages ───────────────────────
      const colorImgMap: Record<string, string> = {};
      const ciStr = extractJsonValue(html, "colorImages");
      if (ciStr) {
        try {
          const ci = JSON.parse(
            ciStr.replace(/\\'/g, "'").replace(/'/g, '"'),
          ) as Record<
            string,
            Array<{ hiRes?: string; large?: string }>
          >;
          for (const [k, arr] of Object.entries(ci)) {
            if (k === "initial" || !Array.isArray(arr)) continue;
            const best = arr[0]?.hiRes || arr[0]?.large;
            if (best)
              colorImgMap[k.toLowerCase()] = best.replace(
                /\._[A-Z0-9,_]+_\./g,
                ".",
              );
          }
        } catch {
          /* ignore */
        }
      }

      // ── 5. Build variant objects ──────────────────────────────────────
      const variants: AmazonVariant[] = [];
      for (const [rawAsin, dimValsArr] of Object.entries(dimValues)) {
        if (!Array.isArray(dimValsArr) || dimValsArr.length === 0) continue;
        const varAsin = rawAsin.toUpperCase();
        const dimensions: Record<string, string> = {};
        dims.forEach((name, i) => {
          const v = dimValsArr[i];
          if (v != null && String(v).trim()) dimensions[name] = String(v).trim();
        });

        // Image: look up by color/style key in colorImages
        const colorKey = (
          dimensions["color"] ??
          dimensions["colour"] ??
          dimensions["style"] ??
          ""
        ).toLowerCase();
        const img = colorKey ? colorImgMap[colorKey] : undefined;

        variants.push({
          asin: varAsin,
          dimensions,
          price: priceMap[varAsin],
          image: img,
        });
      }

      this.logger.log(
        `[amazon-scrape] variants=${variants.length} dims=[${dims.join(",")}]`,
      );
      return variants;
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // importFromAmazon — legacy method, now just wraps scraper
  // ---------------------------------------------------------------------------

  async importFromAmazon(asinOrUrl: string): Promise<ImportResult> {
    const preview = await this.previewAmazon(asinOrUrl);
    const title = preview.title || `Amazon product ${preview.asin}`;
    const warnings: string[] = [];
    if (!preview.price) {
      warnings.push("No price returned by upstream — defaulted to 0");
    }
    return {
      source: "amazon",
      draft: {
        slug: slugify(`amazon-${preview.asin}-${title}`),
        title,
        description: preview.descriptionHtml ?? null,
        category: preview.category ?? "imported",
        basePrice: preview.price ?? 0,
        currency: "INR",
        sku: preview.asin,
        inventory: 0,
        isCustomizable: false,
        b2cEnabled: false,
        b2bEnabled: false,
        ownerCompanyId: null,
        metadata: {
          source: "amazon",
          asin: preview.asin,
          brand: preview.brand ?? null,
          bullets: preview.features,
        },
        // Pull the full carousel — previously capped at 8 which dropped
        // angled/lifestyle shots admins wanted to keep. 15 is enough headroom.
        images: preview.images.slice(0, 15).map((url, i) => ({
          url,
          alt: title,
          order: i,
        })) as never,
        variants: [],
      },
      warnings,
    };
  }

  async importFromShopify(handleOrUrl: string): Promise<ImportResult> {
    const handle = extractShopifyHandle(handleOrUrl);
    if (!handle) {
      throw new BadRequestException(
        "Could not extract Shopify handle — provide a product handle or /products/<handle> URL.",
      );
    }

    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    if (!shopDomain) {
      return {
        source: "shopify",
        draft: this.buildStubDraft(
          `shopify-${handle}`,
          `Shopify product ${handle}`,
          "imported",
        ),
        warnings: ["Shopify lookup not configured — returning stub draft"],
      };
    }

    const res = await fetchWithTimeout(
      `https://${shopDomain}/products/${handle}.json`,
    );
    if (!res.ok) {
      throw new BadGatewayException(
        `Shopify lookup failed with status ${res.status}`,
      );
    }
    const json = (await res.json()) as {
      product?: {
        title?: string;
        body_html?: string;
        variants?: { price?: string; sku?: string }[];
        images?: { src?: string; alt?: string | null }[];
        product_type?: string;
      };
    };
    const p = json.product ?? {};
    const title = p.title ?? `Shopify ${handle}`;
    const firstVariant = p.variants?.[0];
    const warnings: string[] = [];
    if (!firstVariant?.price) {
      warnings.push("No price returned from Shopify — defaulted to 0");
    }
    return {
      source: "shopify",
      draft: {
        slug: slugify(`shopify-${handle}`),
        title,
        description: p.body_html ? p.body_html.replace(/<[^>]+>/g, "") : null,
        category: p.product_type ?? "imported",
        basePrice: firstVariant?.price ? Number(firstVariant.price) : 0,
        currency: "INR",
        sku: firstVariant?.sku ?? null,
        inventory: 0,
        isCustomizable: false,
        b2cEnabled: false,
        b2bEnabled: false,
        ownerCompanyId: null,
        metadata: { source: "shopify", handle },
        images:
          p.images
            ?.map((img) => ({ url: img.src ?? "", alt: img.alt ?? title }))
            .filter((i) => i.url) ?? [],
        variants: [],
      },
      warnings,
    };
  }

  async importFromUrl(url: string): Promise<ImportResult> {
    let html = "";
    const warnings: string[] = [];
    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GifteengImporter/1.0)",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
      });
      if (!res.ok) {
        warnings.push(
          `URL fetch returned status ${res.status} — using URL as title`,
        );
      } else {
        html = await res.text();
      }
    } catch {
      warnings.push("Could not fetch URL — using URL as title fallback");
    }

    const ogTitle =
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
        html,
      ) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(
        html,
      );
    const ogDesc =
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(
        html,
      ) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i.exec(
        html,
      );
    const ogImage =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
        html,
      ) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
        html,
      );
    const titleTag = /<title>([^<]+)<\/title>/i.exec(html);
    const title = ogTitle?.[1] ?? titleTag?.[1] ?? new URL(url).hostname;

    if (!ogTitle) warnings.push("No og:title found — using <title> or hostname");
    if (!ogImage) warnings.push("No og:image found — draft has no image");

    return {
      source: "url",
      draft: {
        slug: slugify(`url-${title}`),
        title,
        description: ogDesc?.[1] ?? null,
        category: "imported",
        basePrice: 0,
        currency: "INR",
        sku: null,
        inventory: 0,
        isCustomizable: false,
        b2cEnabled: false,
        b2bEnabled: false,
        ownerCompanyId: null,
        metadata: { source: "url", sourceUrl: url },
        images: ogImage?.[1] ? [{ url: ogImage[1], alt: title }] : [],
        variants: [],
      },
      warnings,
    };
  }

  async importFromCsv(buffer: Buffer): Promise<ImportResult[]> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException("Empty CSV upload");
    }
    const text = buffer.toString("utf-8").replace(/\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new BadRequestException(
        "CSV must contain a header row and at least one data row",
      );
    }

    const header = this.splitCsvLine(lines[0]!).map((h) =>
      h.trim().toLowerCase(),
    );
    const required = [
      "title",
      "slug",
      "category",
      "base_price",
      "sku",
      "description",
      "image_url",
      "b2c_enabled",
      "b2b_enabled",
    ];
    for (const col of required) {
      if (!header.includes(col)) {
        throw new BadRequestException(`CSV missing required column: ${col}`);
      }
    }

    const idx: Record<string, number> = {};
    header.forEach((h, i) => (idx[h] = i));

    const results: ImportResult[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      const cols = this.splitCsvLine(line);
      const pick = (key: string): string => {
        const j = idx[key];
        if (j === undefined) return "";
        return (cols[j] ?? "").trim();
      };
      const warnings: string[] = [];
      const title = pick("title");
      if (!title) {
        warnings.push(`Row ${i + 1}: missing title — skipped`);
        continue;
      }
      const rawPrice = pick("base_price");
      const priceNum = Number(rawPrice);
      if (Number.isNaN(priceNum)) {
        warnings.push(
          `Row ${i + 1}: base_price "${rawPrice}" is not a number`,
        );
      }
      const imageUrl = pick("image_url");
      const slugVal = pick("slug") || slugify(`csv-${title}`);

      results.push({
        source: "csv",
        draft: {
          slug: slugVal,
          title,
          description: pick("description") || null,
          category: pick("category") || "imported",
          basePrice: Number.isNaN(priceNum) ? 0 : priceNum,
          currency: "INR",
          sku: pick("sku") || null,
          inventory: 0,
          isCustomizable: false,
          b2cEnabled: this.parseBool(pick("b2c_enabled"), false),
          b2bEnabled: this.parseBool(pick("b2b_enabled"), false),
          ownerCompanyId: null,
          metadata: { source: "csv", row: i + 1 },
          images: imageUrl ? [{ url: imageUrl, alt: title }] : [],
          variants: [],
        },
        warnings,
      });
    }
    return results;
  }

  async commitDraft(
    draft: ProductDraft,
    actorId: string,
  ): Promise<{ id: string; slug: string }> {
    if (!draft.slug || !draft.title) {
      throw new BadRequestException("Draft requires slug and title");
    }

    const data = {
      slug: draft.slug,
      title: draft.title,
      description: draft.description ?? null,
      category: draft.category ?? null,
      basePrice: draft.basePrice,
      currency: draft.currency ?? "INR",
      sku: draft.sku ?? null,
      inventory: draft.inventory ?? 0,
      isCustomizable: draft.isCustomizable ?? false,
      b2cEnabled: draft.b2cEnabled ?? false,
      b2bEnabled: draft.b2bEnabled ?? false,
      ownerCompanyId: draft.ownerCompanyId ?? null,
      metadata: draft.metadata ?? undefined,
      images: draft.images ?? [],
    };

    const product = await this.prisma.product.upsert({
      where: { slug: draft.slug },
      create: data as never,
      update: {
        title: data.title,
        description: data.description,
        category: data.category,
        basePrice: data.basePrice,
        currency: data.currency,
        sku: data.sku,
        inventory: data.inventory,
        isCustomizable: data.isCustomizable,
        b2cEnabled: data.b2cEnabled,
        b2bEnabled: data.b2bEnabled,
        ownerCompanyId: data.ownerCompanyId,
        metadata: data.metadata,
        images: data.images as never,
      } as never,
    });

    if (draft.variants && draft.variants.length > 0) {
      await this.prisma.productVariantOption.deleteMany({
        where: { productId: product.id },
      });
      await this.prisma.productVariantOption.createMany({
        data: draft.variants.map((v) => ({
          productId: product.id,
          name: v.name,
          value: v.value,
          priceDelta: v.priceDelta ?? 0,
          image: v.image ?? null,
          sku: v.sku ?? null,
          inventory: 0,
        })),
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: "company_user",
        actorId,
        action: "product.import.commit",
        entityType: "product",
        entityId: product.id,
        payload: {
          slug: product.slug,
          source:
            (draft.metadata as { source?: string } | null)?.source ??
            "unknown",
        },
      },
    });

    return { id: product.id, slug: product.slug };
  }

  private buildStubDraft(
    slug: string,
    title: string,
    category: string,
  ): ProductDraft {
    return {
      slug: slugify(slug),
      title,
      description: null,
      category,
      basePrice: 0,
      currency: "INR",
      sku: null,
      inventory: 0,
      isCustomizable: false,
      b2cEnabled: false,
      b2bEnabled: false,
      ownerCompanyId: null,
      metadata: { stub: true },
      images: [],
      variants: [],
    };
  }

  private parseBool(val: string | undefined, fallback: boolean): boolean {
    if (val == null) return fallback;
    const v = val.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(v)) return true;
    if (["0", "false", "no", "n"].includes(v)) return false;
    return fallback;
  }

  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === ",") {
          out.push(cur);
          cur = "";
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          cur += ch;
        }
      }
    }
    out.push(cur);
    return out;
  }
}

export type { AmazonPreviewResult, ImportResult, ImportSource, ProductDraft };

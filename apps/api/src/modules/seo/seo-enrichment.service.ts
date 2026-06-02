/**
 * SeoEnrichmentService
 *
 * Automatically generates comprehensive, keyword-rich SEO metadata for
 * every product the moment it is created or updated. Two tiers:
 *
 *   Tier 1 — Rule-based  (instant, always runs, zero API cost)
 *     Deterministic templates that produce solid SEO immediately.
 *     Covers: title · meta-description · 15 long-tail keywords ·
 *             image alt-texts · 4 FAQ schema items.  Executes in < 1 ms.
 *
 *   Tier 2 — AI-enhanced  (async, optional, driven by ai_seo_enabled setting)
 *     Single LLM call (Claude or GPT) returning a fully formed JSON object
 *     with ALL SEO fields — search-intent targeting, semantic keyword
 *     clusters, local India SEO, People-Also-Ask style FAQs, and E-E-A-T
 *     signals. Overwrites tier-1 output. Completes in ~3-8 s.
 *
 * Stored shape (product.metadata.seo):
 * {
 *   title          : string      — ≤60 chars, starts with primary keyword
 *   description    : string      — 130-155 chars, CTA + price anchor
 *   keywords       : string[]    — 20 terms across 4 intent clusters
 *   altTexts       : string[]    — one per image, position-differentiated
 *   faq            : {q,a}[]     — 5 rich-snippet FAQ items
 *   score          : number      — 0-100 quality/completeness score
 *   method         : "rule"|"ai"|"manual"
 *   lastEnrichedAt : string      — ISO timestamp
 *   version        : number      — bump forces full re-enrichment
 * }
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService }      from "@nestjs/config";
import Anthropic              from "@anthropic-ai/sdk";
import { PrismaService }      from "../../prisma/prisma.service";

// ── Algorithm version — bump to force re-enrichment of entire catalog ─────────
const SEO_VERSION = 3;

// ── Sitemap endpoints to ping after bulk operations ───────────────────────────
const SITEMAP_PING_URLS = [
  "https://www.google.com/ping?sitemap=https://gifteeng.com/sitemap.xml",
  "https://www.bing.com/ping?sitemap=https://gifteeng.com/sitemap.xml",
];

// ── Occasion ↔ keyword map ────────────────────────────────────────────────────
const OCCASION_MAP: Record<string, string[]> = {
  birthday:     ["birthday gift India", "birthday gift ideas", "bday gift online", "birthday personalised gift"],
  anniversary:  ["anniversary gift India", "anniversary gift ideas", "couple gifts online", "personalised anniversary gift"],
  wedding:      ["wedding gift India", "wedding gift ideas", "marriage gift online", "unique wedding gift India"],
  valentine:    ["valentines day gift India", "valentine gift ideas", "romantic gift online India"],
  corporate:    ["corporate gift India", "office gift ideas", "employee gift online", "bulk corporate gifts India"],
  housewarming: ["housewarming gift India", "new home gift ideas", "griha pravesh gift online"],
  farewell:     ["farewell gift India", "goodbye gift ideas", "leaving gift online India"],
  friendship:   ["friendship day gift India", "best friend gift ideas", "friend gift online"],
  diwali:       ["diwali gift India", "festive gift ideas", "diwali hamper online India"],
  baby:         ["baby shower gift India", "newborn gift ideas", "baby gift online India"],
  teacher:      ["teachers day gift India", "gift for teacher online", "personalised teacher gift"],
};

// ── Indian metros for geo-targeting ──────────────────────────────────────────
const METRO_KEYWORDS = [
  "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune",
];

// ── Price tier labels ─────────────────────────────────────────────────────────
function getPriceTier(price: number): string {
  if (price <  200)  return "under ₹200";
  if (price <  500)  return "under ₹500";
  if (price < 1000)  return "under ₹1000";
  if (price < 2000)  return "under ₹2000";
  return "premium";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function truncateWords(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut       = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.7 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

// ── SEO score (0-100) ─────────────────────────────────────────────────────────
function calcScore(seo: ProductSeoOutput, product: ProductInput): number {
  let score = 0;

  // Title quality (25 pts)
  if (seo.title) {
    score += 15;
    if (seo.title.length >= 30 && seo.title.length <= 60) score += 5;
    const lw = seo.title.toLowerCase();
    if (lw.includes("gift") || lw.includes("personali") || lw.includes("custom")) score += 3;
    if (lw.includes("india") || lw.includes("online"))                             score += 2;
  }

  // Description quality (25 pts)
  if (seo.description) {
    score += 15;
    if (seo.description.length >= 120 && seo.description.length <= 160) score += 5;
    const ld = seo.description.toLowerCase();
    if (ld.includes("free delivery") || ld.includes("free shipping")) score += 2;
    if (/shop|buy|order|get|gift/i.test(ld))                          score += 3;
  }

  // Keyword coverage (20 pts)
  if (seo.keywords?.length) {
    score += 10;
    if (seo.keywords.length >= 12) score += 5;
    if (seo.keywords.length >= 18) score += 5;
  }

  // Alt text coverage (15 pts)
  const imageCount = Array.isArray(product.images)
    ? product.images.length
    : (product.imageUrl ? 1 : 0);
  if (seo.altTexts?.length) {
    score += 8;
    if (seo.altTexts.length >= imageCount && imageCount > 0) score += 7;
  }

  // FAQ schema (15 pts)
  if (seo.faq?.length) {
    score += 8;
    if (seo.faq.length >= 4) score += 4;
    if (seo.faq.length >= 5) score += 3;
  }

  // Product data completeness (bonus, up to 10 pts)
  if (product.description && product.description.length > 100) score += 5;
  else if (product.description)                                 score += 2;
  if (product.category)                                         score += 3;
  if (product.basePrice)                                        score += 2;

  return Math.min(100, score);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProductInput {
  id:             string;
  slug:           string;
  title:          string;
  description?:   string | null;
  category?:      string | null;
  basePrice?:     number | string | null;
  currency?:      string | null;
  images?:        unknown;
  imageUrl?:      string | null;
  isCustomizable?: boolean | null;
  metadata?:      Record<string, unknown> | null;
}

export interface ProductSeoOutput {
  title:          string;
  description:    string;
  keywords:       string[];
  altTexts:       string[];
  faq:            Array<{ q: string; a: string }>;
  score:          number;
  method:         "rule" | "ai" | "manual";
  lastEnrichedAt: string;
  version:        number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SeoEnrichmentService {
  private readonly logger = new Logger(SeoEnrichmentService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Fire-and-forget wrapper. Errors are caught and logged, never thrown. */
  enrichProductAsync(product: ProductInput): void {
    this.enrichProduct(product).catch((err: unknown) => {
      this.logger.error(
        `SEO enrichment failed for ${product.slug}: ` +
        (err instanceof Error ? err.message : String(err)),
      );
    });
  }

  /** Enrich one product and persist. Returns the generated SEO data. */
  async enrichProduct(product: ProductInput, forceAi = false): Promise<ProductSeoOutput> {
    const existingMeta = (product.metadata ?? {}) as Record<string, unknown>;
    const existingSeo  = (existingMeta.seo   ?? {}) as Partial<ProductSeoOutput>;

    // Skip if already on the current algorithm version (unless forced)
    if (
      !forceAi &&
      existingSeo.version === SEO_VERSION &&
      existingSeo.method  !== "manual"
    ) {
      return existingSeo as ProductSeoOutput;
    }

    // Tier 1 — always generate rule-based first
    let seo = this.generateRuleBased(product);

    // Tier 2 — attempt AI upgrade
    const aiEnabled = await this.isAiEnabled();
    if (aiEnabled || forceAi) {
      try {
        const aiSeo = await this.generateWithAi(product);
        if (aiSeo) {
          seo = {
            ...aiSeo,
            method:         "ai",
            score:          calcScore(aiSeo, product),
            lastEnrichedAt: new Date().toISOString(),
            version:        SEO_VERSION,
          };
        }
      } catch (err) {
        this.logger.warn(
          `AI SEO fell back to rule-based for ${product.slug}: ` +
          (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // Persist into metadata.seo
    await this.prisma.product.update({
      where: { id: product.id },
      data: { metadata: { ...existingMeta, seo } as any },
    });

    this.logger.debug(
      `SEO enriched: ${product.slug} | score=${seo.score} | method=${seo.method}`,
    );
    return seo;
  }

  /**
   * Bulk-enrich products missing SEO or on an old version.
   * Adds a 200 ms pause between AI calls to avoid rate-limiting.
   */
  async bulkEnrich(opts?: {
    onlyMissing?: boolean;
    limit?:       number;
    forceAi?:     boolean;
  }): Promise<{ processed: number; updated: number; errors: number }> {
    const limit  = opts?.limit ?? 200;
    const result = { processed: 0, updated: 0, errors: 0 };

    const products = await this.prisma.product.findMany({
      take: limit,
      where: { b2cEnabled: true },
      select: {
        id: true, slug: true, title: true, description: true, category: true,
        basePrice: true, currency: true, images: true, isCustomizable: true,
        metadata: true,
      },
    });

    for (const p of products) {
      result.processed++;
      const meta       = (p.metadata ?? {}) as Record<string, unknown>;
      const existing   = meta.seo as Partial<ProductSeoOutput> | undefined;

      // Skip up-to-date products when onlyMissing is set
      if (opts?.onlyMissing && existing?.version === SEO_VERSION) continue;

      try {
        await this.enrichProduct(
          { ...p, basePrice: p.basePrice ? Number(p.basePrice) : null, metadata: meta },
          opts?.forceAi ?? false,
        );
        result.updated++;

        // Throttle AI calls to avoid hitting rate limits
        if (opts?.forceAi) {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        result.errors++;
      }
    }

    return result;
  }

  /** Read-only preview with improvement suggestions (used by admin panel). */
  getSeoPreview(product: ProductInput): ProductSeoOutput & { suggestions: string[] } {
    const existingMeta = (product.metadata ?? {}) as Record<string, unknown>;
    const existing     = (existingMeta.seo   ?? {}) as Partial<ProductSeoOutput>;

    const seo: ProductSeoOutput = existing.title
      ? (existing as ProductSeoOutput)
      : this.generateRuleBased(product);

    const suggestions: string[] = [];
    if (!product.description || product.description.length < 80)
      suggestions.push("Add a detailed description (80+ words) — Google surfaces richer snippets for well-described products.");
    if (!product.category)
      suggestions.push("Set a category to enable category-page indexing and topic clustering.");
    if ((seo.faq?.length ?? 0) < 4)
      suggestions.push("FAQ schema is sparse — AI regeneration adds 5 rich-snippet FAQ items.");
    if (seo.score < 55)
      suggestions.push("SEO score below 55 — click AI Regenerate to auto-improve all fields.");
    if (seo.method === "rule")
      suggestions.push("Still on rule-based tier — AI upgrade will significantly improve rankings.");
    const imgLen  = (Array.isArray(product.images) ? product.images : []).length;
    const altLen  = seo.altTexts?.length ?? 0;
    if (altLen < imgLen)
      suggestions.push(`${imgLen - altLen} image(s) missing alt text — regenerate to fix accessibility + image SEO.`);

    return { ...seo, suggestions };
  }

  /**
   * Ping Google and Bing sitemap endpoints to accelerate crawler discovery
   * after bulk enrichment or major catalog changes.
   */
  async pingSitemaps(): Promise<void> {
    for (const url of SITEMAP_PING_URLS) {
      try {
        const r = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8_000) });
        this.logger.log(`Sitemap ping ${r.ok ? "✓" : "✗"}: ${url} (${r.status})`);
      } catch (err) {
        this.logger.warn(`Sitemap ping failed: ${url} — ${String(err)}`);
      }
    }
  }

  // ── Tier 1: Rule-based ─────────────────────────────────────────────────────

  generateRuleBased(product: ProductInput): ProductSeoOutput {
    const price      = product.basePrice ? Number(product.basePrice) : 0;
    const cat        = (product.category ?? "").toLowerCase().trim();
    const capCat     = cap(cat || "Gift");
    const title      = product.title ?? "";
    const custom     = product.isCustomizable === true;
    const images     = Array.isArray(product.images) ? product.images : [];
    const imageCount = images.length || (product.imageUrl ? 1 : 0);
    const lowerTitle = title.toLowerCase();
    const priceTier  = price > 0 ? getPriceTier(price) : null;

    // ── SEO Title (≤60 chars) ──────────────────────────────────────────────
    // Pattern: "Buy [Short Name] | [Category] Gifts India | Gifteeng"
    const shortTitle = truncateWords(title, 30);
    let seoTitle = `Buy ${shortTitle} | ${capCat} Gifts India | Gifteeng`;
    if (seoTitle.length > 60) {
      const veryShort = truncateWords(title, 35);
      seoTitle = `${veryShort} | Gifteeng India`;
      if (seoTitle.length > 60) seoTitle = truncateWords(seoTitle, 57) + "…";
    }

    // ── Meta Description (130-155 chars) ──────────────────────────────────
    const customLine = custom ? "Fully customizable with your name or photo." : "";
    const priceStr   = price > 0 ? `Starting ₹${price}.` : "";
    const parts      = [
      `Shop ${title} at Gifteeng — India's personalized gift store.`,
      customLine,
      `${capCat} gift ${priceStr}`,
      "Free delivery on ₹499+.",
    ].filter(Boolean);
    let seoDesc = parts.join(" ");
    if (seoDesc.length > 160) seoDesc = truncateWords(seoDesc, 157) + "…";
    if (seoDesc.length < 120) {
      seoDesc += " 3 lakh+ happy customers across India.";
      if (seoDesc.length > 160) seoDesc = truncateWords(seoDesc, 157) + "…";
    }

    // ── Keyword clusters (≤20 terms) ──────────────────────────────────────
    const keywords = new Set<string>([
      // Primary (exact-match)
      lowerTitle,
      `${lowerTitle} India`,
      // Transactional (buy-intent)
      `buy ${lowerTitle} online`,
      `buy ${lowerTitle} online India`,
      // Category-level
      `${cat || "gift"} gifts India`,
      `personalized ${cat || "gift"} India`,
      `custom ${cat || "gift"} online India`,
      // Customization intent
      ...(custom ? [`customizable ${cat || "gift"}`, `personalize ${lowerTitle}`] : []),
      // Price-anchored
      ...(priceTier ? [`${cat || "gift"} ${priceTier}`, `gifts ${priceTier} India`] : []),
      // Brand
      "gifteeng",
      "personalized gifts India",
      "custom gifts online India",
      // Occasion cross-sell
      `birthday ${cat || "gift"} India`,
      `anniversary ${cat || "gift"} India`,
      // Geo-specific (one metro to avoid spamming)
      `personalized ${cat || "gift"} online`,
    ]);

    // Add occasion-specific terms if title/category matches
    for (const [occasion, terms] of Object.entries(OCCASION_MAP)) {
      if (cat.includes(occasion) || lowerTitle.includes(occasion)) {
        terms.slice(0, 3).forEach((t) => keywords.add(t));
        break;
      }
    }

    // ── Image alt texts (position-differentiated) ─────────────────────────
    const altSuffixes = [
      `${title} — personalized ${cat || "gift"} by Gifteeng India`,
      `${title} close-up — custom ${cat || "gift"} gift online India`,
      `${title} lifestyle photo — ${cap(cat || "gift")} gifts India`,
      `${title} unboxing — premium ${cat || "gift"} gift Gifteeng`,
      `${title} detail view — buy ${cat || "gift"} gift online India`,
    ];
    const altTexts = Array.from({ length: Math.max(imageCount, 1) }).map(
      (_, i) =>
        altSuffixes[i] ??
        `${title} — image ${i + 1}, personalized ${cat || "gift"} by Gifteeng`,
    );

    // ── FAQ schema (4 items, People-Also-Ask style) ───────────────────────
    const faq: Array<{ q: string; a: string }> = [
      {
        q: `Can I personalize the ${title}?`,
        a: custom
          ? `Yes! The ${title} is fully customizable — add a name, photo, or personal message at checkout. Preview your design before ordering.`
          : `Yes, we offer custom gift messaging and premium packaging. Contact us on WhatsApp for engraving or printing options specific to this product.`,
      },
      {
        q: `How long does delivery take for the ${title}?`,
        a: `Orders are processed within 24–48 hours. Standard delivery across India takes 3–7 business days. Express delivery options (1–3 days) are available at checkout for most pincodes.`,
      },
      {
        q: `What occasions is the ${title} suitable for?`,
        a: `The ${title} is perfect for birthdays, anniversaries, weddings, housewarmings, and corporate gifting. It comes in premium Gifteeng gift packaging — ready to give straight from the box.`,
      },
      {
        q: price > 0
          ? `What is the price of the ${title}?`
          : `Is the ${title} available at a discount?`,
        a: price > 0
          ? `The ${title} starts at ₹${price}. Pricing may vary based on customization options or selected variants. We also offer bulk discounts for 10+ units.`
          : `Prices start from ₹99 on Gifteeng. Check the product page for the latest price. Subscribe to our newsletter for exclusive discount codes.`,
      },
    ];

    const seo: ProductSeoOutput = {
      title:          seoTitle,
      description:    seoDesc,
      keywords:       Array.from(keywords).slice(0, 20),
      altTexts,
      faq,
      score:          0,
      method:         "rule",
      lastEnrichedAt: new Date().toISOString(),
      version:        SEO_VERSION,
    };
    seo.score = calcScore(seo, product);
    return seo;
  }

  // ── Tier 2: AI-enhanced ────────────────────────────────────────────────────

  private async isAiEnabled(): Promise<boolean> {
    try {
      const setting = await this.prisma.siteSetting.findUnique({
        where: { key: "ai_seo_enabled" },
      });
      if (!setting) return true; // Default enabled
      const v = String(setting.value ?? "true").replace(/^"|"$/g, "");
      return v !== "false" && v !== "0";
    } catch {
      return false;
    }
  }

  private getApiConfig(): {
    apiKey:   string;
    model:    string;
    provider: "anthropic" | "openai";
  } | null {
    const anthropicKey = this.config.get<string>("ANTHROPIC_API_KEY") ?? "";
    const openaiKey    = this.config.get<string>("OPENAI_API_KEY")    ?? "";
    const customModel  = this.config.get<string>("SEO_AI_MODEL")      ?? "";

    if (anthropicKey.startsWith("sk-ant-")) {
      return {
        apiKey:   anthropicKey,
        model:    customModel || "claude-haiku-3-5",
        provider: "anthropic",
      };
    }
    if (openaiKey.startsWith("sk-")) {
      return {
        apiKey:   openaiKey,
        model:    customModel || "gpt-4o-mini",
        provider: "openai",
      };
    }
    return null;
  }

  private async generateWithAi(product: ProductInput): Promise<ProductSeoOutput | null> {
    const cfg = this.getApiConfig();
    if (!cfg) {
      this.logger.debug("No AI key configured — skipping AI SEO tier");
      return null;
    }

    const price       = product.basePrice ? Number(product.basePrice) : 0;
    const descText    = stripHtml(product.description).slice(0, 800);
    const images      = Array.isArray(product.images) ? product.images : [];
    const imageCount  = images.length || (product.imageUrl ? 1 : 0);
    const cat         = (product.category ?? "Gift").trim();
    const custom      = product.isCustomizable === true;
    const priceTier   = price > 0 ? getPriceTier(price) : null;

    // ── System prompt: domain expert + output contract ───────────────────
    const systemPrompt = `You are India's leading e-commerce SEO strategist, specializing in personalized gift products.

Your SEO output must:
• Rank on the first page of Google India for transactional queries ("buy X online India")
• Capture "People Also Ask" featured snippets with natural-language FAQ questions
• Cover 4 intent clusters: exact-match, phrase-match, long-tail, and local India
• Apply E-E-A-T signals: mention brand trust indicators (3 lakh+ customers, free delivery, 7-day returns)
• Use Indian English naturally (₹ not $, "lakh" not "hundred thousand", "pincode" not "zip code")
• Target voice-search phrasing in FAQ answers
• ALWAYS return raw JSON only — no markdown fences, no explanatory text, no code blocks`;

    // ── User prompt: precise spec with quality guardrails ────────────────
    const userPrompt = `Generate world-class SEO metadata for this Gifteeng product.

═══ PRODUCT BRIEF ═══
Title:         "${product.title}"
Category:      "${cat}"
Price:         ${price > 0 ? `₹${price} (${priceTier ?? ""})` : "not set"}
Customizable:  ${custom ? "Yes — buyers add name / photo / message at checkout" : "No"}
Description:   "${descText || "(none — infer from title and category)"}"
Image count:   ${imageCount}
Brand context: Gifteeng — India's #1 personalised gift platform, 3 lakh+ orders delivered, free delivery ₹499+, 7-day returns, COD available

═══ OUTPUT CONTRACT ═══
Return ONLY this JSON structure (no markdown, no code fences):
{
  "title": "<REQUIRED: ≤60 chars. MUST start with primary keyword. MUST contain 'India' or 'Online'. NO ₹ in title>",
  "description": "<REQUIRED: 130-155 chars exactly. MUST include: Gifteeng brand name, price anchor if available, 'free delivery', and a CTA verb like Shop/Buy/Order>",
  "keywords": [
    "<5 exact-match: product title variants + India suffix>",
    "<5 phrase-match: buy X online, X gift for [person], personalized X India>",
    "<5 long-tail: question/occasion/price combos — 'best X under ₹500 India', 'X gift for wife birthday India'>",
    "<5 local-intent: city-name combos for Mumbai/Delhi/Bangalore + category>"
  ],
  "altTexts": [
    "<REQUIRED: exactly ${imageCount} items — each different, each 10-15 words, each mentioning product type + benefit + 'Gifteeng'>",
    "... (must have exactly ${imageCount} items)"
  ],
  "faq": [
    {"q": "<Natural buyer question about customization>", "a": "<Answer with feature detail, 30-60 words, mention checkout flow>"},
    {"q": "<Natural question about delivery/shipping>", "a": "<Specific answer: processing time + delivery days + express option>"},
    {"q": "<Natural question about occasions/gifting>", "a": "<List 4-5 occasions, mention packaging>"},
    {"q": "<Natural question about price/value>", "a": "<Mention starting price, bulk discount, value proposition>"},
    {"q": "<Natural question unique to this specific product type>", "a": "<Product-specific helpful answer with material/quality detail>"}
  ]
}

═══ QUALITY RULES ═══
1. Title: keyword first, brand last, never truncated at 60 chars
2. Description: open with a verb (Shop/Buy/Order), close with "gifteeng.com" or "Gifteeng"
3. Keywords: ZERO duplicates across the 20 items — each must be a distinct search query
4. Alt texts: array length MUST equal ${imageCount} — vary perspective (main shot, detail, lifestyle, packaging)
5. FAQ: question phrasing must match how real buyers type in Google India
6. All content in Indian English — use ₹, "personalised" (British spelling), "pincode"`;

    try {
      let raw = "";

      if (cfg.provider === "anthropic") {
        const client = new Anthropic({ apiKey: cfg.apiKey });
        const msg    = await client.messages.create({
          model:      cfg.model,
          max_tokens: 1800,
          system:     systemPrompt,
          messages:   [{ role: "user", content: userPrompt }],
        });
        raw = (msg.content[0] as { text?: string })?.text?.trim() ?? "";
      } else {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model:      cfg.model,
            max_tokens: 1800,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: userPrompt },
            ],
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          raw = data.choices?.[0]?.message?.content?.trim() ?? "";
        }
      }

      // Strip markdown code fences if model added them despite instructions
      raw = raw
        .replace(/^```(?:json)?\s*/im, "")
        .replace(/\s*```\s*$/m, "")
        .trim();

      // Extract JSON even if model prepended a sentence
      const jsonStart = raw.indexOf("{");
      if (jsonStart > 0) raw = raw.slice(jsonStart);

      const parsed = JSON.parse(raw) as Partial<ProductSeoOutput>;

      // Flatten keywords: model may return [[...],[...]] or [...]
      let kws: string[] = [];
      if (Array.isArray(parsed.keywords)) {
        for (const item of parsed.keywords) {
          if (Array.isArray(item)) kws.push(...item.map(String));
          else kws.push(String(item));
        }
      }
      kws = [...new Set(kws.filter(Boolean))].slice(0, 20);

      // Validate alt-text count — pad with fallbacks if AI returned wrong count
      let alts: string[] = Array.isArray(parsed.altTexts)
        ? parsed.altTexts.map(String).slice(0, imageCount)
        : [];
      while (alts.length < Math.max(imageCount, 1)) {
        alts.push(`${product.title} — personalised gift by Gifteeng India`);
      }

      // Validate + sanitize all fields
      return {
        title:       typeof parsed.title       === "string" ? parsed.title.slice(0, 60)  : "",
        description: typeof parsed.description === "string" ? parsed.description.slice(0, 160) : "",
        keywords:    kws,
        altTexts:    alts,
        faq: Array.isArray(parsed.faq)
          ? parsed.faq.slice(0, 5).map((f: any) => ({
              q: String(f.q ?? f.question ?? "").slice(0, 200),
              a: String(f.a ?? f.answer   ?? "").slice(0, 500),
            }))
          : [],
        score:          0, // caller recalculates
        method:         "ai",
        lastEnrichedAt: new Date().toISOString(),
        version:        SEO_VERSION,
      };
    } catch (err) {
      this.logger.warn(
        `AI SEO parse error for ${product.slug}: ` +
        (err instanceof Error ? err.message : String(err)),
      );
      return null;
    }
  }
}

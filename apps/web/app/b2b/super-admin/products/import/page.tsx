"use client";

/**
 * Unified product-import admin page.
 *
 * Amazon tab (fix37): NO PA API. Just paste ASIN or URL → server scrapes the
 * public product page → preview shows title, bullets, price, per-variant
 * images/sizes. Title & description have AI Enhance buttons. Image gallery
 * has AI Generate Image button. All fields map directly to product editor
 * format (metadata.bullets, etc.).
 *
 * Other tabs (Shopify, URL, CSV): unchanged legacy flow.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  ClipboardPaste,
  ImagePlus,
  X,
} from "lucide-react";
import { apiB2b } from "../../../../../lib/api";
import { AmazonListingsTab } from "./AmazonListingsTab";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductDraft = {
  slug: string;
  title: string;
  description?: string | null;
  category?: string | null;
  basePrice: number;
  currency?: string;
  sku?: string | null;
  inventory?: number;
  isCustomizable?: boolean;
  b2cEnabled?: boolean;
  b2bEnabled?: boolean;
  ownerCompanyId?: string | null;
  metadata?: Record<string, unknown> | null;
  images?: { url: string; alt?: string; order?: number }[];
  variants?: {
    name: string;
    value: string;
    priceDelta: number;
    image?: string | null;
    sku?: string | null;
  }[];
};

type ImportResult = {
  source: "amazon" | "shopify" | "url" | "csv";
  draft: ProductDraft;
  warnings: string[];
};

type AmazonVariant = {
  asin: string;
  dimensions: Record<string, string>;
  price?: number;
  image?: string;
};

type AmazonPreviewResult = {
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
};

type TabKey = "amazon" | "listings" | "shopify" | "url" | "csv";
type AmazonStep = "input" | "preview" | "done";

const TABS: { key: TabKey; label: string }[] = [
  { key: "amazon", label: "Amazon (ASIN)" },
  { key: "listings", label: "My Amazon Listings" },
  { key: "shopify", label: "Shopify" },
  { key: "url", label: "URL" },
  { key: "csv", label: "CSV Upload" },
];

// ---------------------------------------------------------------------------
// Amazon tab — preview → edit → import flow
// ---------------------------------------------------------------------------

function AmazonTab({
  client,
  initialAsin,
}: {
  client: ReturnType<typeof apiB2b>;
  initialAsin?: string;
}) {
  const [step, setStep] = useState<AmazonStep>("input");
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<AmazonPreviewResult | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrice, setEditPrice] = useState(0);
  const [editCategory, setEditCategory] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [aiLoadingTitle, setAiLoadingTitle] = useState(false);
  const [aiLoadingDesc, setAiLoadingDesc] = useState(false);
  const [aiLoadingImage, setAiLoadingImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedSlug, setImportedSlug] = useState<string | null>(null);
  const [mainImageIdx, setMainImageIdx] = useState(0);
  const [scrapeWarning, setScrapeWarning] = useState<string | null>(null);

  // Auto-fetch when navigating here from My Listings tab
  useEffect(() => {
    if (initialAsin && step === "input") {
      setInput(initialAsin);
      // Slight delay so input state is set before fetch runs
      setTimeout(() => void fetchPreviewForAsin(initialAsin), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsin]);

  async function fetchPreviewForAsin(asinOrUrl: string) {
    setLoading(true);
    setError(null);
    setScrapeWarning(null);

    // Extract ASIN for SP-API (it needs a bare ASIN, not a URL)
    const asin =
      asinOrUrl.trim().match(/[A-Z0-9]{10}/i)?.[0]?.toUpperCase() ??
      asinOrUrl.trim();

    // Try SP-API first — zero bot-detection risk, returns full structured data
    try {
      const r = await client.get<AmazonPreviewResult>(
        `/api/amazon-sp/preview/${encodeURIComponent(asin)}`,
      );
      applyPreview(r);
      return;
    } catch {
      // No SP-API account configured, or ASIN not in seller's catalog — fall through
    }

    // Scraper fallback
    try {
      const r = await client.post<AmazonPreviewResult>(
        "/api/imports/amazon/preview",
        { asinOrUrl: asinOrUrl.trim() },
      );
      applyPreview(r);
    } catch (e) {
      const err = e as { status?: number; body?: unknown; message?: string };
      let detail = err.message ?? "Failed to fetch product";
      if (err.body && typeof err.body === "object") {
        const b = err.body as { message?: string; error?: string };
        if (b.message) detail = b.message;
        else if (b.error) detail = b.error;
      }
      setError(detail);
    } finally {
      setLoading(false);
    }
  }

  function applyPreview(r: AmazonPreviewResult) {
    setPreview(r);
    setEditTitle(r.title);
    setEditDesc(
      r.descriptionHtml && r.descriptionHtml.length > 20
        ? r.descriptionHtml
        : r.features.join("\n"),
    );
    setEditPrice(r.price ?? 0);
    setEditCategory(r.category ?? "gifts");
    setImages(r.images ?? []);
    setSelectedVariants(new Set(r.variants.map((v) => v.asin)));
    setMainImageIdx(0);
    setStep("preview");
    setLoading(false);
  }

  async function fetchPreview() {
    if (!input.trim()) return;
    return fetchPreviewForAsin(input.trim());
  }



  /**
   * Manual-entry fallback when Amazon blocks the scrape. Drops user into the
   * preview step with empty fields + the ASIN populated as SKU, so they can
   * type the title and use AI Enhance / AI Generate Image to fill everything.
   */
  function proceedManually() {
    const asin = input.trim().match(/[A-Z0-9]{10}/i)?.[0]?.toUpperCase() ?? input.trim();
    const stub: AmazonPreviewResult = {
      asin,
      title: "",
      features: [],
      images: [],
      variants: [],
      hasVariants: false,
    };
    setPreview(stub);
    setEditTitle("");
    setEditDesc("");
    setEditPrice(0);
    setEditCategory("gifts");
    setImages([]);
    setSelectedVariants(new Set());
    setMainImageIdx(0);
    setScrapeWarning(
      "Amazon blocked the scrape from our server. Type the title below and use the AI Enhance + AI Generate Image buttons to fill the rest.",
    );
    setStep("preview");
    setError(null);
  }

  async function aiEnhanceTitle() {
    setAiLoadingTitle(true);
    try {
      const res = await client.post<{ text?: string }>("/api/ai/write", {
        prompt: `Rewrite this product title for gifting context, keep under 80 chars, title case, no filler words: ${editTitle}`,
        field: "title",
      });
      if (res.text && !res.text.startsWith("⚠️")) setEditTitle(res.text);
    } catch {
      // surfaced in AI diagnostic page
    }
    setAiLoadingTitle(false);
  }

  async function aiEnhanceDesc() {
    setAiLoadingDesc(true);
    try {
      const contextStr = `Product: ${editTitle}\nBrand: ${preview?.brand ?? "n/a"}\nFeatures:\n${preview?.features.join("\n") ?? "n/a"}`;
      const res = await client.post<{ text?: string }>("/api/ai/write", {
        prompt:
          "Write a compelling product description in HTML using <p> and <ul><li> tags. 150-200 words. Focus on the gifting occasion, emotional appeal, and key benefits. Do NOT mention Amazon or any other marketplace.",
        field: "description",
        context: contextStr,
      });
      if (res.text && !res.text.startsWith("⚠️")) setEditDesc(res.text);
    } catch {
      // silent
    }
    setAiLoadingDesc(false);
  }

  async function aiGenerateImage() {
    setAiLoadingImage(true);
    try {
      const res = await client.post<{ url?: string }>(
        "/api/ai/generate-image",
        {
          prompt: `Professional product photography of: ${editTitle}. Clean white background, soft studio lighting, high detail, premium gifting presentation.`,
          context: preview?.brand ? `Brand: ${preview.brand}` : undefined,
        },
      );
      if (res.url) {
        setImages((prev) => [res.url!, ...prev]);
        setMainImageIdx(0);
      }
    } catch (e) {
      const err = e as { body?: { message?: string }; message?: string };
      const msg = err.body?.message ?? err.message ?? "AI image generation failed";
      setError(msg);
    }
    setAiLoadingImage(false);
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setMainImageIdx((i) => (i >= idx && i > 0 ? i - 1 : 0));
  }

  async function importProduct() {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      // --- sanitize URLs so z.string().url() on the server doesn't reject ---
      //  * Amazon sometimes returns protocol-relative "//m.media-amazon.com/..."
      //  * decode HTML entities like &amp;
      //  * drop empty / obviously-bad strings
      const sanitizeUrl = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        let u = String(raw).trim();
        if (!u) return null;
        // Decode common entities
        u = u.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/");
        // Protocol-relative → https
        if (u.startsWith("//")) u = "https:" + u;
        // Bare "www.xxx" → https
        if (/^www\./i.test(u)) u = "https://" + u;
        // Accept only http/https/data
        if (!/^(https?:|data:)/i.test(u)) return null;
        try {
          // Validate it parses
          new URL(u);
          return u;
        } catch {
          return null;
        }
      };

      // Build variants from selected ASINs. Each variant carries its own
      // dimension map (color/size/etc.), its own image, and its own price
      // delta relative to the base price the user set.
      const variants = preview.variants
        .filter((v) => selectedVariants.has(v.asin))
        .map((v) => {
          const dimEntries = Object.entries(v.dimensions);
          const primaryName = dimEntries[0]?.[0] ?? "variant";
          const primaryValue =
            dimEntries.length > 1
              ? dimEntries.map(([, val]) => val).join(" / ")
              : dimEntries[0]?.[1] ?? "";
          return {
            name: primaryName,
            value: primaryValue,
            priceDelta: v.price && editPrice ? v.price - editPrice : 0,
            image: sanitizeUrl(v.image ?? null),
            sku: v.asin,
          };
        });

      const imgPayload = images
        .slice(0, 8)
        .map((url) => sanitizeUrl(url))
        .filter((u): u is string => !!u)
        .map((url, i) => ({ url, alt: editTitle, order: i }));

      const slug =
        editTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) +
        "-" +
        Math.random().toString(36).slice(2, 6);

      const draft: ProductDraft = {
        slug,
        title: editTitle,
        description: editDesc || null,
        category: editCategory || "gifts",
        basePrice: editPrice || 0,
        currency: "INR",
        sku: preview.asin,
        b2cEnabled: false,
        b2bEnabled: false,
        images: imgPayload,
        variants,
        metadata: {
          source: "amazon",
          asin: preview.asin,
          parentAsin: preview.parentAsin,
          brand: preview.brand ?? null,
          // Store original feature bullets so the product editor's Bullets
          // field is pre-filled — the editor reads metadata.bullets.
          bullets: preview.features,
          importedAt: new Date().toISOString(),
        },
      };

      const res = await client.post<{ committed?: { slug: string }[] }>(
        "/api/imports/commit",
        { drafts: [draft] },
      );
      setImportedSlug(res.committed?.[0]?.slug ?? null);
      setStep("done");
    } catch (e) {
      // ApiError from @gifteeng/shared carries { status, body }. The server's
      // Zod validator returns `{ message, errors: { fieldErrors, formErrors } }`.
      // Surface that instead of the useless default "API 400".
      const err = e as {
        status?: number;
        body?: unknown;
        message?: string;
      };
      let detail = err.message ?? "Import failed";
      if (err.body && typeof err.body === "object") {
        const b = err.body as {
          message?: string;
          errors?: {
            fieldErrors?: Record<string, string[]>;
            formErrors?: string[];
          };
          error?: string;
        };
        const parts: string[] = [];
        if (b.message) parts.push(b.message);
        if (b.errors?.fieldErrors) {
          for (const [field, msgs] of Object.entries(b.errors.fieldErrors)) {
            if (Array.isArray(msgs) && msgs.length) {
              parts.push(`${field}: ${msgs.join(", ")}`);
            }
          }
        }
        if (b.errors?.formErrors?.length) {
          parts.push(b.errors.formErrors.join(", "));
        }
        if (parts.length) detail = parts.join(" — ");
      }
      setError(detail);
    } finally {
      setImporting(false);
    }
  }

  function resetFlow() {
    setStep("input");
    setInput("");
    setPreview(null);
    setError(null);
    setImportedSlug(null);
    setSelectedVariants(new Set());
    setImages([]);
  }

  function toggleVariant(asin: string) {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  }

  // ---- Render: step "input" ------------------------------------------------
  if (step === "input") {
    return (
      <div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold mb-1">Import from Amazon</h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste any amazon.* product URL or the 10-char ASIN (e.g.{" "}
            <span className="font-mono bg-gray-100 px-1 rounded">B09N5WRWNW</span>
            ). No credentials needed — we scrape the public product page.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchPreview()}
              placeholder="B09N5WRWNW or https://www.amazon.in/dp/..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setInput(text.trim());
                } catch {
                  /* clipboard not accessible */
                }
              }}
              title="Paste from clipboard"
              className="px-3 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600"
            >
              <ClipboardPaste className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <p className="font-medium mb-1">Couldn't fetch from Amazon</p>
              <p className="text-xs">{error}</p>
              <button
                onClick={proceedManually}
                className="mt-3 px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 text-xs font-medium hover:bg-red-100"
              >
                Proceed with manual entry →
              </button>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={fetchPreview}
              disabled={loading || !input.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-black text-white text-sm font-medium disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Fetching..." : "Fetch Product"}
            </button>
            {input.trim() && !loading && (
              <button
                onClick={proceedManually}
                className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Skip scrape — enter manually
              </button>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Tip: after import you'll land in the preview with AI-enhance buttons
            for title, description, and images — nothing is posted publicly
            until you click <span className="font-medium">Import as Draft</span>.
          </p>
        </div>
      </div>
    );
  }

  // ---- Render: step "done" -------------------------------------------------
  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <CheckCircle2 className="h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-semibold">Product imported as draft!</h2>
        <p className="text-sm text-gray-500">
          It&apos;s saved as a draft — not visible on the site until you publish
          it.
        </p>
        {importedSlug && (
          <a
            href={`/super-admin/products/${importedSlug}`}
            className="mt-2 px-5 py-2.5 rounded-lg bg-black text-white text-sm font-medium"
          >
            Edit &amp; Publish Product
          </a>
        )}
        <button
          onClick={resetFlow}
          className="text-sm text-gray-500 hover:underline mt-1"
        >
          Import Another
        </button>
      </div>
    );
  }

  // ---- Render: step "preview" ----------------------------------------------
  return (
    <div>
      <button
        onClick={() => setStep("input")}
        className="text-sm text-gray-500 hover:underline mb-5 flex items-center gap-1"
      >
        ← Back to input
      </button>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap break-words">
          <p className="font-medium mb-1">Import failed</p>
          {error}
        </div>
      )}

      {scrapeWarning && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium mb-0.5">Manual entry mode</p>
          <p className="text-xs">{scrapeWarning}</p>
        </div>
      )}

      <div className="flex gap-6">
        {/* Left: image gallery (40%) */}
        <div className="w-2/5 shrink-0">
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 aspect-square flex items-center justify-center">
            {images[mainImageIdx] ? (
              <img
                src={images[mainImageIdx]}
                alt={editTitle}
                className="object-contain w-full h-full p-4"
              />
            ) : (
              <span className="text-sm text-gray-400">No image</span>
            )}
          </div>

          {images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {images.slice(0, 8).map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className={`relative w-14 h-14 rounded-lg border-2 overflow-hidden flex-shrink-0 group ${
                    i === mainImageIdx
                      ? "border-black"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setMainImageIdx(i)}
                    className="w-full h-full block"
                  >
                    <img
                      src={url}
                      alt=""
                      className="object-contain w-full h-full p-1"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    title="Remove image"
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-600 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={aiGenerateImage}
            disabled={aiLoadingImage}
            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 disabled:opacity-50"
          >
            {aiLoadingImage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            {aiLoadingImage ? "Generating image..." : "AI Generate Image"}
          </button>

          {preview?.brand && (
            <p className="mt-3 text-xs text-gray-500">
              Brand:{" "}
              <span className="font-medium text-gray-700">{preview.brand}</span>
            </p>
          )}
          {preview?.asin && (
            <p className="text-xs text-gray-400 font-mono mt-1">
              ASIN: {preview.asin}
            </p>
          )}
        </div>

        {/* Right: edit fields (60%) */}
        <div className="flex-1 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <button
                onClick={aiEnhanceTitle}
                disabled={aiLoadingTitle}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 disabled:opacity-50"
              >
                {aiLoadingTitle ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI Enhance
              </button>
            </div>
          </div>

          {/* Price & Category */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Price (INR)
              </label>
              <input
                type="number"
                value={editPrice}
                onChange={(e) => setEditPrice(Number(e.target.value))}
                min={0}
                step={0.01}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Category
              </label>
              <input
                type="text"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">
                Description
              </label>
              <button
                onClick={aiEnhanceDesc}
                disabled={aiLoadingDesc}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 disabled:opacity-50"
              >
                {aiLoadingDesc ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI Enhance
              </button>
            </div>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-y font-mono"
            />
            <p className="mt-1 text-xs text-gray-400">
              Accepts plain text or HTML. The product page will render HTML
              tags such as &lt;p&gt; and &lt;ul&gt;&lt;li&gt;.
            </p>
          </div>

          {/* Feature bullets (read-only preview, stored in metadata.bullets) */}
          {(preview?.features?.length ?? 0) > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Scraped Feature Bullets{" "}
                <span className="text-gray-400 font-normal">
                  (saved to metadata.bullets — editable later in product editor)
                </span>
              </label>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-40 overflow-y-auto">
                <ul className="text-xs text-gray-700 list-disc pl-5 space-y-1">
                  {preview!.features.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Variants */}
          {preview?.hasVariants && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-800">
                  Variations{" "}
                  <span className="text-gray-400 text-xs">
                    ({selectedVariants.size} of {preview.variants.length}{" "}
                    selected)
                  </span>
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setSelectedVariants(
                        new Set(preview.variants.map((v) => v.asin)),
                      )
                    }
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => setSelectedVariants(new Set())}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {preview.variants.map((v) => {
                  const dimLabel = Object.entries(v.dimensions)
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(", ");
                  const isSelected = selectedVariants.has(v.asin);
                  return (
                    <button
                      key={v.asin}
                      onClick={() => toggleVariant(v.asin)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? "border-black bg-gray-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleVariant(v.asin)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded"
                      />
                      {v.image && (
                        <img
                          src={v.image}
                          alt=""
                          className="w-10 h-10 object-contain rounded border border-gray-100 flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">
                          {dimLabel}
                        </p>
                        {v.price != null && (
                          <p className="text-xs text-gray-500">₹{v.price}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import button */}
      <div className="mt-6 border-t border-gray-100 pt-5">
        <button
          onClick={importProduct}
          disabled={importing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-black text-white text-sm font-semibold disabled:opacity-50"
        >
          {importing && <Loader2 className="h-4 w-4 animate-spin" />}
          {importing ? "Importing..." : "Import as Draft"}
        </button>
        <p className="text-center text-xs text-gray-400 mt-2">
          Product will be saved as draft — not visible on site until you publish
          it.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy import flow (Shopify, URL, CSV)
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const [tab, setTab] = useState<TabKey>("amazon");
  const [pendingAsin, setPendingAsin] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<ImportResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const client = useMemo(() => apiB2b(), []);

  async function runImport() {
    setLoading(true);
    setError(null);
    setFlash(null);
    try {
      if (tab === "shopify") {
        const r = await client.post<ImportResult>("/api/imports/shopify", {
          handleOrUrl: input,
        });
        setDrafts((prev) => [...prev, r]);
      } else if (tab === "url") {
        let normalizedUrl = input.trim();
        if (normalizedUrl && !/^https?:\/\//i.test(normalizedUrl)) {
          normalizedUrl = `https://${normalizedUrl}`;
        }
        const r = await client.post<ImportResult>("/api/imports/url", {
          url: normalizedUrl,
        });
        setDrafts((prev) => [...prev, r]);
      } else if (tab === "csv") {
        if (!csvFile) throw new Error("Please choose a CSV file");
        const fd = new FormData();
        fd.append("file", csvFile);
        const token =
          typeof window !== "undefined"
            ? window.localStorage.getItem("gifteeng.b2b.token")
            : null;
        const baseUrl =
          typeof window !== "undefined"
            ? window.location.origin
            : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");
        const res = await fetch(`${baseUrl}/api/imports/csv`, {
          method: "POST",
          body: fd,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "X-Audience": "b2b",
          },
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(`CSV upload failed: ${res.status} ${msg}`);
        }
        const payload = (await res.json()) as { results: ImportResult[] };
        setDrafts((prev) => [...prev, ...payload.results]);
      }
      setInput("");
      setCsvFile(null);
    } catch (err) {
      setError((err as Error).message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === drafts.length) setSelected(new Set());
    else setSelected(new Set(drafts.map((_, i) => i)));
  }

  async function commitSelected() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    setFlash(null);
    try {
      const toCommit = drafts
        .filter((_, i) => selected.has(i))
        .map((d) => d.draft);
      const res = await client.post<{ committed: { id: string; slug: string }[] }>(
        "/api/imports/commit",
        { drafts: toCommit },
      );
      setDrafts((prev) => prev.filter((_, i) => !selected.has(i)));
      setSelected(new Set());
      setFlash(`Committed ${res.committed.length} product(s)`);
    } catch (err) {
      setError((err as Error).message ?? "Commit failed");
    } finally {
      setLoading(false);
    }
  }

  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setSelected((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold mb-1">Product Import</h1>
      <p className="text-sm text-gray-500 mb-6">
        Import from Amazon (SP-API or scraper), Shopify, URL, or CSV. Use{" "}
        <strong>My Amazon Listings</strong> to browse your entire seller catalog.
      </p>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
              tab === t.key
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Amazon ASIN tab — SP-API first, scraper fallback */}
      {tab === "amazon" && <AmazonTab client={client} initialAsin={pendingAsin} />}

      {/* My Amazon Listings — browse seller catalog via SP-API */}
      {tab === "listings" && (
        <AmazonListingsTab
          client={client}
          onEditFirst={(asin) => {
            setPendingAsin(asin);
            setTab("amazon");
          }}
        />
      )}

      {/* Other tabs — legacy import flow */}
      {tab !== "amazon" && tab !== "listings" && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
            {tab === "shopify" && (
              <label className="block text-sm font-medium text-gray-700">
                Shopify handle or product URL
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="my-product-handle or https://shop.example.com/products/..."
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            )}
            {tab === "url" && (
              <label className="block text-sm font-medium text-gray-700">
                Source URL
                <input
                  type="url"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="https://example.com/product"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            )}
            {tab === "csv" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CSV File
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Headers: title, slug, category, base_price, sku, description,
                  image_url, b2c_enabled, b2b_enabled
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={runImport}
                disabled={
                  loading ||
                  (tab !== "csv" && !input) ||
                  (tab === "csv" && !csvFile)
                }
                className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Working..." : "Import"}
              </button>
              {error && <span className="text-sm text-red-600">{error}</span>}
              {flash && <span className="text-sm text-green-700">{flash}</span>}
            </div>
          </div>

          {/* Drafts table */}
          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">
                Drafts <span className="text-gray-400">({drafts.length})</span>
              </h2>
              <button
                onClick={commitSelected}
                disabled={loading || selected.size === 0}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50"
              >
                Commit selected ({selected.size})
              </button>
            </div>

            {drafts.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No drafts yet. Use one of the tabs above to import products.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          drafts.length > 0 && selected.size === drafts.length
                        }
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Slug</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Warnings</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((r, idx) => (
                    <tr
                      key={`${r.draft.slug}-${idx}`}
                      className="border-t border-gray-100"
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(idx)}
                          onChange={() => toggleSelect(idx)}
                        />
                      </td>
                      <td className="p-3">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-xs uppercase">
                          {r.source}
                        </span>
                      </td>
                      <td className="p-3 font-medium">{r.draft.title}</td>
                      <td className="p-3 text-gray-500">{r.draft.slug}</td>
                      <td className="p-3">
                        {r.draft.currency ?? "INR"} {r.draft.basePrice}
                      </td>
                      <td className="p-3">
                        {r.warnings.length === 0 ? (
                          <span className="text-xs text-gray-400">none</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.warnings.map((w, i) => (
                              <span
                                key={i}
                                className="inline-block px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs"
                                title={w}
                              >
                                {w.length > 40 ? `${w.slice(0, 40)}...` : w}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => removeDraft(idx)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

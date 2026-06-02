/**
 * opengraph-image.tsx — Product OG Image (auto-generated, zero config)
 *
 * Next.js automatically serves this as the og:image and twitter:image for
 * every product page at /b2c/products/[slug]. No manual work needed — every
 * new product instantly gets a branded 1200×630 social card.
 *
 * Runs on the Edge Runtime so it is generated on-demand and cached by CDN.
 * Falls back gracefully if the API is unreachable.
 */

import { ImageResponse } from "next/og";

export const runtime     = "edge";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";
// Cache each card for 24 h at the CDN layer
export const revalidate  = 86_400;

const BRAND_RED  = "#EF3752";
const API_BASE   = process.env.INTERNAL_API_BASE_URL
                ?? process.env.NEXT_PUBLIC_API_BASE_URL
                ?? "http://127.0.0.1:4000";

interface ProductOgData {
  title:          string;
  category?:      string | null;
  basePrice?:     number | string | null;
  imageUrl?:      string | null;
  imageUrls?:     string[];
  isCustomizable?: boolean;
}

export default async function Image({
  params,
}: {
  params: { slug: string };
}) {
  let product: ProductOgData | null = null;

  try {
    const r = await fetch(
      `${API_BASE}/api/products/slug/${params.slug}`,
      { next: { revalidate: 3600 } },
    );
    if (r.ok) product = (await r.json()) as ProductOgData;
  } catch {
    // Silently fall back — product will be null, defaults kick in
  }

  const title         = product?.title    ?? "Personalized Gift";
  const category      = product?.category ?? "Gift";
  const price         = product?.basePrice ? Number(product.basePrice) : null;
  const imageUrl      = product?.imageUrl ?? product?.imageUrls?.[0] ?? null;
  const isCustom      = product?.isCustomizable ?? false;
  const shortTitle    = title.length > 52 ? title.slice(0, 49) + "…" : title;
  const categoryLabel = String(category)
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return new ImageResponse(
    (
      <div
        style={{
          display:        "flex",
          width:          1200,
          height:         630,
          background:     "linear-gradient(145deg,#fff7f8 0%,#fce7ec 55%,#fff0f4 100%)",
          fontFamily:     "'Helvetica Neue',Arial,sans-serif",
          position:       "relative",
          overflow:       "hidden",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: 7,
            background: BRAND_RED,
            display: "flex",
          }}
        />

        {/* Decorative background circles */}
        <div
          style={{
            position: "absolute", top: -100, right: -100,
            width: 380, height: 380, borderRadius: "50%",
            background: "rgba(239,55,82,0.05)", display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute", bottom: -70, left: -70,
            width: 280, height: 280, borderRadius: "50%",
            background: "rgba(239,55,82,0.04)", display: "flex",
          }}
        />

        {/* ── Left: product image ─────────────────────────────────────── */}
        {imageUrl && (
          <div
            style={{
              width: 520, height: 630,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "48px 28px 48px 52px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              width={440}
              height={440}
              style={{
                width: 440, height: 440, objectFit: "cover",
                borderRadius: 28,
                boxShadow:
                  "0 32px 80px rgba(239,55,82,0.2), 0 8px 24px rgba(0,0,0,0.1)",
              }}
            />
          </div>
        )}

        {/* ── Right: text ─────────────────────────────────────────────── */}
        <div
          style={{
            flex:           1,
            display:        "flex",
            flexDirection:  "column",
            justifyContent: "center",
            padding:        imageUrl ? "48px 56px 48px 20px" : "56px 80px",
          }}
        >
          {/* Category + customizable badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div
              style={{
                background: "rgba(239,55,82,0.10)", borderRadius: 20,
                padding: "6px 18px", fontSize: 15, fontWeight: 700,
                color: BRAND_RED, letterSpacing: 1.4,
                textTransform: "uppercase", display: "flex",
              }}
            >
              {categoryLabel} Gifts
            </div>
            {isCustom && (
              <div
                style={{
                  background: "rgba(139,92,246,0.10)", borderRadius: 20,
                  padding: "6px 16px", fontSize: 14, fontWeight: 700,
                  color: "#7c3aed", display: "flex",
                }}
              >
                ✦ Customizable
              </div>
            )}
          </div>

          {/* Product title */}
          <div
            style={{
              fontSize:      imageUrl ? 46 : 58,
              fontWeight:    900,
              color:         "#1a1a2e",
              lineHeight:    1.1,
              marginBottom:  22,
              letterSpacing: -0.5,
              display:       "flex",
            }}
          >
            {shortTitle}
          </div>

          {/* Price */}
          {price && (
            <div
              style={{
                display: "flex", alignItems: "baseline", gap: 8,
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 38, fontWeight: 900, color: BRAND_RED }}>
                ₹{price}
              </span>
              <span style={{ fontSize: 16, fontWeight: 500, color: "#999" }}>
                onwards
              </span>
            </div>
          )}

          {/* Free delivery trust signal */}
          <div
            style={{
              fontSize: 17, color: "#16a34a", fontWeight: 600,
              marginBottom: 30, display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            Free delivery on orders ₹499+  ·  Pan-India
          </div>

          {/* CTA button */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                background:   BRAND_RED,
                color:        "#fff",
                padding:      "14px 38px",
                borderRadius: 50,
                fontSize:     18,
                fontWeight:   800,
                boxShadow:    "0 8px 28px rgba(239,55,82,0.38)",
                display:      "flex",
              }}
            >
              Shop Now →
            </div>
          </div>

          {/* Domain */}
          <div
            style={{
              marginTop: 28, fontSize: 15, color: "#bbb",
              fontWeight: 600, letterSpacing: 1.2,
              display: "flex",
            }}
          >
            gifteeng.com
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

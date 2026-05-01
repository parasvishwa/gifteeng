// Dynamically-generated 1200×630 Open Graph image for the home page.
//
// Next.js 15 picks this up at the route segment level: when a crawler
// (Slack / WhatsApp / Twitter / iMessage / Facebook) requests
// /opengraph-image, we render this React tree to a PNG via the Edge
// runtime. No design tool / static asset to keep in sync.
//
// Child route segments can shadow this file with their own
// opengraph-image.tsx — e.g. product pages get a custom card with the
// product photo + title automatically.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt    = "Gifteeng — India's Premium Personalized Gifts";
export const size   = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width:  "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems:    "center",
          justifyContent:"center",
          background: "linear-gradient(135deg, #ffffff 0%, #fff5f7 50%, #ffeef1 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 80,
        }}
      >
        <div style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 3,
          color: "#EF3752",
          textTransform: "uppercase",
          marginBottom: 18,
        }}>
          Gifteeng
        </div>
        <div style={{
          fontSize: 88,
          fontWeight: 900,
          color: "#0a0a0f",
          lineHeight: 1.05,
          textAlign: "center",
          letterSpacing: "-0.03em",
          maxWidth: 1000,
        }}>
          The Gift They&apos;ll{" "}
          <span style={{ color: "#EF3752", fontStyle: "italic" }}>Remember Forever</span>
        </div>
        <div style={{
          fontSize: 28,
          color: "#52525b",
          marginTop: 26,
          textAlign: "center",
          maxWidth: 900,
        }}>
          India&apos;s premium personalized gifting platform · Free shipping over ₹499
        </div>
        <div style={{
          marginTop: 44,
          padding: "12px 28px",
          background: "#EF3752",
          borderRadius: 999,
          color: "#fff",
          fontSize: 20,
          fontWeight: 700,
        }}>
          1 Lakh+ Happy Customers · 4.8★
        </div>
      </div>
    ),
    { ...size },
  );
}

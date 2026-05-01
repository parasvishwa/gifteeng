/**
 * robots.txt — tells crawlers what's allowed. Points them at sitemap.xml
 * so new products get discovered without manual Search Console work.
 */
import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://new.gifteeng.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/b2b/",          // Admin and business portal — never index
          "/account/",      // User-specific pages
          "/cart",
          "/checkout",
          "/orders/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}

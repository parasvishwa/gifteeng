/**
 * robots.txt — tells crawlers what to index. Points at sitemap.xml so new
 * products get discovered without manual Search Console submissions.
 *
 * Key rules:
 *  • All user-account, checkout, and API routes are blocked (they produce
 *    no unique content and may expose private data).
 *  • The entire /b2b/ tree is blocked — that's the admin / business portal.
 *  • Individual product and category pages under /b2c/ are fully allowed.
 */
import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/b2c/",
          "/about",
          "/contact",
          "/privacy",
          "/terms",
          "/returns",
          "/shipping",
          "/corporate",
          "/sell",
        ],
        disallow: [
          "/api/",            // backend API — never index
          "/b2b/",            // admin / business portal
          "/b2c/account/",    // user-specific pages (orders, profile, wishlist)
          "/b2c/cart",
          "/b2c/checkout",
          "/b2c/orders/",
          // /_next/ intentionally NOT blocked — Google needs CSS/JS to render pages
          "/super-admin/",
          "/lander/",         // trailing slash blocks the subtree correctly
          "/account-deletion",
        ],
      },
      // Be extra explicit for Googlebot — helpful for eligibility in rich results
      {
        userAgent: "Googlebot",
        allow: ["/b2c/", "/about", "/contact"],
        disallow: [
          "/api/",
          "/b2b/",
          "/b2c/account/",
          "/b2c/cart",
          "/b2c/checkout",
          "/b2c/orders/",
          "/super-admin/",
        ],
      },
      // Allow AI crawlers — GEO / AI Overviews benefit
      { userAgent: "GPTBot",        allow: ["/"] },
      { userAgent: "Claude-Web",    allow: ["/"] },
      { userAgent: "PerplexityBot", allow: ["/"] },
      { userAgent: "Applebot",      allow: ["/"] },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host:    SITE,
  };
}

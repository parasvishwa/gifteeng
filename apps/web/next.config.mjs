/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gifteeng/ui", "@gifteeng/shared"],
  // Strip the "X-Powered-By: Next.js" header — discloses framework
  // version unnecessarily, which security scanners flag.
  poweredByHeader: false,
  // Trailing-slash off keeps canonical URLs unambiguous for Google.
  trailingSlash: false,
  // Compress responses (gzip/brotli) at the Next.js layer. nginx in
  // front re-compresses anyway, but this ensures parity for direct hits.
  compress: true,
  // Don't ship the source-map sidecars to production — they leak the
  // pre-minified codebase to anyone who knows where to look.
  productionBrowserSourceMaps: false,

  // ── Image optimisation ─────────────────────────────────────────────────────
  // Next.js auto-converts to WebP/AVIF; cached at CDN level via Cache-Control.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http",  hostname: "**" },
    ],
    // Serve modern formats — browser picks best it supports
    formats: ["image/avif", "image/webp"],
    // Cache optimised images for 30 days (default is 60s)
    minimumCacheTTL: 2592000,
    // Breakpoints cover mobile 1x/2x through wide desktop
    deviceSizes: [375, 640, 750, 828, 1080, 1200, 1920],
    imageSizes:  [16, 32, 48, 64, 96, 128, 256],
    // Disable inline SVG rendering through next/image — not needed and
    // historically a small XSS surface (Next.js patched in 13.x but we
    // keep it off for defence-in-depth).
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // ── Security + cache headers ─────────────────────────────────────────────
  async headers() {
    // Best-practice headers applied to every page response. CSP is
    // permissive enough to keep GTM / GA4 / Meta Pixel / Razorpay /
    // Google Maps working but tight enough to block <iframe> and
    // foreign script injection. If you add a new third-party script,
    // append its host to script-src + connect-src below.
    const SECURITY_HEADERS = [
      {
        // HSTS — force HTTPS for 2 years across all subdomains. Only
        // safe when ALL subdomains terminate TLS, which gifteeng.com
        // does (handled by the Contabo nginx + Let's Encrypt setup).
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      // Block click-jacking by disallowing iframe embeds entirely.
      { key: "X-Frame-Options",        value: "DENY" },
      // Stops MIME-sniffing tricks that turn .txt into executable JS.
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Don't leak the user's previous URL to third-party trackers.
      { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
      // Disable browser features we never use — camera, USB, MIDI, etc.
      // Geolocation is allowed for the address-fill flow.
      {
        key: "Permissions-Policy",
        value: [
          "camera=()",
          "microphone=()",
          "usb=()",
          "midi=()",
          "magnetometer=()",
          "gyroscope=()",
          "accelerometer=()",
          "payment=(self)",
          "geolocation=(self)",
        ].join(", "),
      },
      // Modern replacement for X-XSS-Protection. CSP locks down where
      // scripts / styles / connections may originate.
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          // Inline scripts unavoidable for Razorpay + GTM bootstrap.
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googletagmanager.com https://www.google-analytics.com https://*.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://connect.facebook.net https://checkout.razorpay.com https://api.razorpay.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          // Permit images from any HTTPS host since user-uploaded
          // product photos can come from external CDNs.
          "img-src 'self' data: blob: https: http:",
          "connect-src 'self' https://*.gifteeng.com https://*.googletagmanager.com https://www.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.facebook.com https://connect.facebook.net https://api.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com https://nominatim.openstreetmap.org",
          "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.googletagmanager.com",
          "media-src 'self' https: blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "upgrade-insecure-requests",
        ].join("; "),
      },
    ];

    return [
      {
        // Apply the security headers to every route.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // Immutable static chunks (hashed filenames)
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Optimised images — long cache, the URL itself is hashed by
        // the loader so a content change produces a new URL.
        source: "/_next/image/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" },
        ],
      },
      {
        // OG images, manifest, icons — long cache, low churn.
        source: "/og/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" },
        ],
      },
      {
        // API proxy — never cache (responses already vary by token).
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // Sitemap + robots — let crawlers cache for an hour, no longer.
        source: "/(sitemap.xml|robots.txt)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, must-revalidate" },
        ],
      },
    ];
  },

  // ── 301 redirects for canonical SEO ───────────────────────────────────────
  // Old / non-canonical paths get permanent redirects so Google
  // consolidates link equity onto a single URL per page. The actual
  // product detail lives at /b2c/products/<slug>; redirect any of the
  // legacy variants there.
  async redirects() {
    return [
      { source: "/shop",            destination: "/b2c/products",        permanent: true },
      { source: "/shop/:slug",      destination: "/b2c/products/:slug", permanent: true },
      { source: "/product/:slug",   destination: "/b2c/products/:slug", permanent: true },
      { source: "/products/:slug",  destination: "/b2c/products/:slug", permanent: true },
    ];
  },

  // ── API proxy: browser hits same origin — no CORS, no port exposure ─────────
  async rewrites() {
    const apiBase = process.env.API_INTERNAL_URL || "http://localhost:4000";
    return [
      {
        source:      "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
      // ── Media / uploads proxy ─────────────────────────────────────────────
      // Product images are stored with relative paths like /uploads/... on the
      // API server. We rewrite them through the web origin so browsers don't
      // need direct access to the API server or its internal IP.
      {
        source:      "/uploads/:path*",
        destination: `${apiBase}/uploads/:path*`,
      },
    ];
  },

  experimental: {
    serverActions: { allowedOrigins: ["www.gifteeng.com", "business.gifteeng.com"] },
    // Optimise package imports to reduce bundle size
    optimizePackageImports: ["lucide-react", "@gifteeng/ui"],
  },
};

export default nextConfig;

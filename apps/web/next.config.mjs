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
  // NOTE: CSP itself is set in middleware.ts so a per-request nonce can be
  // injected. The static security headers (HSTS, X-Frame-Options, etc.) stay
  // here since they don't vary by request. See docs/SECURITY_AUDIT.md M-3.
  //
  // Next 15 automatically propagates the nonce from the response CSP header
  // onto its own framework-generated script tags (__NEXT_DATA__, hydration
  // scripts) provided the header contains a `'nonce-<value>'` token — which
  // middleware.ts emits. No experimental flag is required in 15.x.
  async headers() {
    const STATIC_SECURITY_HEADERS = [
      {
        // HSTS — force HTTPS for 2 years across all subdomains. Only safe
        // when every subdomain terminates TLS (gifteeng.com does).
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
      // Block click-jacking by disallowing iframe embeds entirely.
      { key: "X-Frame-Options",        value: "DENY" },
      // Stops MIME-sniffing tricks that turn .txt into executable JS.
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Don't leak the user's previous URL to third-party trackers.
      { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
      // Disable browser features we never use.
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
    ];

    return [
      {
        // Apply the static security headers to every route.
        source: "/:path*",
        headers: STATIC_SECURITY_HEADERS,
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
  // product detail lives at /products/<slug>; redirect any of the
  // legacy variants there.
  async redirects() {
    return [
      { source: "/shop",            destination: "/products",        permanent: true },
      { source: "/shop/:slug",      destination: "/products/:slug", permanent: true },
      { source: "/product/:slug",   destination: "/products/:slug", permanent: true },
      // Legacy /b2c/* URLs — permanent redirect to clean paths
      { source: "/b2c",             destination: "/",               permanent: true },
      { source: "/b2c/:path*",      destination: "/:path*",         permanent: true },
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

  // ── Webpack: stub canvas native binary ───────────────────────────────────
  // isomorphic-dompurify → jsdom → canvas. The canvas native addon is not
  // available on Windows dev machines. Aliasing to false gives webpack an
  // empty module so the page still builds and DOMPurify works server-side
  // (jsdom has its own HTML parser; canvas is only needed for <canvas> APIs).
  webpack(config) {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },

  // ── Server-side externals ─────────────────────────────────────────────────
  // isomorphic-dompurify → jsdom. When webpack bundles jsdom, __dirname
  // resolves to Next.js's output dir instead of the jsdom package dir, so
  // jsdom can't find its own browser/default-stylesheet.css on Windows.
  // Marking these packages as external means Node.js resolves them natively
  // at runtime (correct __dirname), while the browser build is unaffected.
  serverExternalPackages: ["isomorphic-dompurify", "jsdom", "canvas"],

  experimental: {
    serverActions: { allowedOrigins: ["www.gifteeng.com", "business.gifteeng.com"] },
    // Optimise package imports to reduce bundle size
    optimizePackageImports: ["lucide-react", "@gifteeng/ui"],
  },
};

export default nextConfig;

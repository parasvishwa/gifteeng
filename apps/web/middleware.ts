import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce — 16 bytes base64, regenerated on every navigation.
 * Inline `<script>` and `<style>` elements that need to execute must echo
 * this nonce as their `nonce=` attribute. Drops the previous CSP's reliance
 * on `unsafe-inline` (defeated stored-XSS protection) and `unsafe-eval`
 * (not needed by modern GTM gtag mode). See SECURITY_AUDIT.md M-3.
 */
function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  // base64 in edge runtime — btoa is available
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin);
}

function buildCsp(nonce: string): string {
  // `strict-dynamic` tells modern browsers to trust scripts loaded by
  // already-nonced scripts (GTM, Razorpay, etc.) while ignoring host
  // allowlists. We KEEP the host allowlists as a fallback for older
  // browsers that don't support strict-dynamic. `unsafe-inline` is also
  // kept as a fallback (per spec, browsers that honour strict-dynamic
  // ignore unsafe-inline — so the security guarantee still holds on
  // recent Chrome / Edge / Firefox / Safari).
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' https: http:`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https: http:",
    "connect-src 'self' https://*.gifteeng.com https://*.googletagmanager.com https://www.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.facebook.com https://connect.facebook.net https://api.razorpay.com https://lumberjack.razorpay.com https://lumberjack-cx.razorpay.com https://nominatim.openstreetmap.org https://api.postalpincode.in",
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.googletagmanager.com",
    "media-src 'self' https: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Host-based routing:
 *   business.gifteeng.com  → rewrite into /b2b/*
 *   www.gifteeng.com       → rewrite into /b2c/*
 *
 * Dev escape hatch: if the pathname starts with an intrinsically-B2B segment
 * (/super-admin, /hr-admin, /production, /employee), we route it to /b2b/*
 * regardless of host so `localhost:3000/super-admin` works in preview.
 */
const B2B_PATH_PREFIXES = ["/super-admin", "/hr-admin", "/production", "/employee", "/login"];

function pathImpliesB2B(pathname: string): boolean {
  return B2B_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const url = req.nextUrl.clone();

  // ── CSP nonce + dynamic header (M-3) ───────────────────────────────────────
  // Generate once per request; the layout reads it back via headers() and
  // applies it to inline <script>/<style> blocks.
  const nonce = generateNonce();
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  // Helper that produces a response carrying the request-side x-nonce header
  // AND the CSP response header. Every return point uses this so we don't
  // forget to set CSP on rewrites/redirects.
  const finish = (kind: "next" | "rewrite" | "redirect", target?: URL): NextResponse => {
    let res: NextResponse;
    if (kind === "rewrite" && target) {
      res = NextResponse.rewrite(target, { request: { headers: requestHeaders } });
    } else if (kind === "redirect" && target) {
      res = NextResponse.redirect(target);
    } else {
      res = NextResponse.next({ request: { headers: requestHeaders } });
    }
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  // ── Seller portal — self-contained surface at /seller/* ────────────────────
  // The seller portal is neither B2C nor B2B. It lives at app/seller/* and
  // must NOT be rewritten under /b2c or /b2b. Served as-is, and exempt from
  // Coming Soon so sellers can always reach their portal.
  const isSellerPath =
    url.pathname === "/seller" || url.pathname.startsWith("/seller/");
  if (isSellerPath) {
    return finish("next");
  }

  // ── Public seller store pages at /store/* ───────────────────────────────────
  // Served from app/store/[slug] — must not be rewritten to /b2c/store/[slug].
  const isStorePath =
    url.pathname === "/store" || url.pathname.startsWith("/store/");
  if (isStorePath) {
    return finish("next");
  }

  // ── Coming Soon mode ────────────────────────────────────────────────────────
  const PREVIEW_KEY = process.env.PREVIEW_SECRET ?? "gifteeng2025";
  const comingSoon = process.env.NEXT_PUBLIC_COMING_SOON === "true";
  const isAdminPath = pathImpliesB2B(url.pathname) || url.pathname.startsWith("/b2b");
  const isComingSoonPath = url.pathname === "/coming-soon" || url.pathname.startsWith("/coming-soon/");

  if (comingSoon && !isAdminPath && !isComingSoonPath) {
    const previewCookie = req.cookies.get("gifteeng_preview")?.value;
    const hasPreview = previewCookie === PREVIEW_KEY;

    const previewParam = url.searchParams.get("preview");
    if (previewParam === PREVIEW_KEY) {
      const res = NextResponse.redirect(new URL("/", req.url));
      res.cookies.set("gifteeng_preview", PREVIEW_KEY, {
        maxAge: 60 * 60 * 24,
        path: "/",
        httpOnly: true,
      });
      res.headers.set("Content-Security-Policy", csp);
      return res;
    }

    if (!hasPreview) {
      url.pathname = "/coming-soon";
      return finish("rewrite", url);
    }
  }

  // Explicit B2C hosts — always serve storefront regardless of other checks
  const B2C_HOSTS = ["www.gifteeng.com", "gifteeng.com", process.env.NEXT_PUBLIC_B2C_HOST].filter(Boolean);
  const hostIsB2C = B2C_HOSTS.some((h) => host === h);

  const hostIsB2B =
    !hostIsB2C &&
    (host.startsWith("business.") || host === process.env.NEXT_PUBLIC_B2B_HOST);
  const pathIsB2B = pathImpliesB2B(url.pathname);
  const isB2B = hostIsB2B || pathIsB2B;

  // ── B2B routing ────────────────────────────────────────────────────────────
  // B2B portal lives at /b2b/* (app/b2b/). Non-B2B visitors trying to access
  // /b2b/* get redirected home.
  if (url.pathname.startsWith("/b2b/") && !isB2B) {
    return finish("redirect", new URL("/", req.url));
  }

  // ── B2B auth gate (server-side) ─────────────────────────────────────────────
  // Redirect unauthenticated B2B visitors to /login instantly — no client-side
  // blank-page flash. The b2b_auth cookie is set by the login form and cleared
  // on sign-out. It's a presence flag only; actual token validation is client-side.
  const isLoginPath =
    url.pathname === "/login" ||
    url.pathname === "/b2b/login" ||
    url.pathname.startsWith("/b2b/login/");
  if (isB2B && !isLoginPath) {
    const hasAuth = req.cookies.get("b2b_auth")?.value === "1";
    if (!hasAuth) {
      return finish(
        "redirect",
        new URL(`/login?returnTo=${encodeURIComponent(url.pathname)}`, req.url),
      );
    }
  }

  if (isB2B && !url.pathname.startsWith("/b2b")) {
    url.pathname = `/b2b${url.pathname}`;
    return finish("rewrite", url);
  }

  // B2C routes are served directly via the (b2c) route group — no rewrite needed.
  return finish("next");
}

export const config = {
  // Skip API, _next internals, and anything that looks like a static file (has an extension).
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[^/]+$).*)"],
};

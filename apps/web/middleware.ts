import { NextResponse, type NextRequest } from "next/server";

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

  // ── Coming Soon mode ────────────────────────────────────────────────────────
  // Set NEXT_PUBLIC_COMING_SOON=true in .env to enable.
  // Admin panel (/b2b/*) always accessible.
  // Secret preview: visit /?preview=gifteeng2025 to bypass for 24h via cookie.
  const PREVIEW_KEY = process.env.PREVIEW_SECRET ?? "gifteeng2025";
  const comingSoon = process.env.NEXT_PUBLIC_COMING_SOON === "true";
  const isAdminPath = pathImpliesB2B(url.pathname) || url.pathname.startsWith("/b2b");
  const isComingSoonPath = url.pathname === "/coming-soon" || url.pathname.startsWith("/coming-soon/");

  if (comingSoon && !isAdminPath && !isComingSoonPath) {
    // Check for preview cookie
    const previewCookie = req.cookies.get("gifteeng_preview")?.value;
    const hasPreview = previewCookie === PREVIEW_KEY;

    // Check for preview query param — set cookie and redirect to home
    const previewParam = url.searchParams.get("preview");
    if (previewParam === PREVIEW_KEY) {
      const res = NextResponse.redirect(new URL("/", req.url));
      res.cookies.set("gifteeng_preview", PREVIEW_KEY, {
        maxAge: 60 * 60 * 24, // 24 hours
        path: "/",
        httpOnly: true,
      });
      return res;
    }

    if (!hasPreview) {
      url.pathname = "/coming-soon";
      return NextResponse.rewrite(url);
    }
  }

  const hostIsB2B =
    host.startsWith("business.") || host === process.env.NEXT_PUBLIC_B2B_HOST;
  const pathIsB2B = pathImpliesB2B(url.pathname);
  const isB2B = hostIsB2B || pathIsB2B;

  // Block cross-group direct access via internal /b2b or /b2c prefixes.
  if (url.pathname.startsWith("/b2b/") && !isB2B) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (url.pathname.startsWith("/b2c/") && isB2B) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isB2B && !url.pathname.startsWith("/b2b")) {
    url.pathname = `/b2b${url.pathname}`;
    return NextResponse.rewrite(url);
  }
  if (!isB2B && !url.pathname.startsWith("/b2c")) {
    url.pathname = `/b2c${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip API, _next internals, and anything that looks like a static file (has an extension).
  matcher: ["/((?!api|_next/static|_next/image|.*\\.[^/]+$).*)"],
};

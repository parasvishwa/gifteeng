/**
 * Normalise a product / media image URL so it always resolves correctly in the
 * browser.
 *
 * The API stores images as either:
 *   - Relative paths:          /uploads/foo.jpg
 *   - Bare filenames:          foo.jpg  (legacy — prefix with /uploads/)
 *   - Absolute with raw IP:    http://217.216.59.87/uploads/foo.jpg
 *   - Absolute https internal: https://217.216.59.87/uploads/foo.jpg
 *   - Absolute external CDN:   https://images.unsplash.com/photo-...
 *
 * Next.js rewrites  /uploads/*  →  API server internally (see next.config.mjs).
 * So relative `/uploads/` paths work in all browser contexts.
 *
 * We strip the host from any URL pointing to the internal server so the
 * browser always hits the Next.js rewrite proxy instead of the raw IP.
 */

/** Internal IP / hostname patterns — these must be rewritten via the proxy. */
const INTERNAL_HOSTS = ["217.216.59.87", "localhost", "127.0.0.1"];

function isInternalHost(hostname: string): boolean {
  return INTERNAL_HOSTS.some(h => hostname === h || hostname.startsWith(h + ":"));
}

export function normaliseMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  // Guard against non-string values leaking from untyped API responses
  if (typeof url !== "string") return "";

  const trimmed = url.trim();
  if (!trimmed) return "";

  // Absolute URL (http or https)
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      // Internal host → strip to relative path so Next.js rewrite handles it
      if (isInternalHost(parsed.hostname)) {
        return parsed.pathname + (parsed.search ?? "");
      }
      // External CDN (Unsplash, S3, etc.) — leave untouched
      return trimmed;
    } catch {
      return trimmed;
    }
  }

  // Already a relative path starting with /
  if (trimmed.startsWith("/")) return trimmed;

  // Bare filename (e.g. "product-123.jpg") — assume /uploads/
  if (trimmed.includes(".") && !trimmed.includes("/")) {
    return `/uploads/${trimmed}`;
  }

  // Everything else — return as-is
  return trimmed;
}

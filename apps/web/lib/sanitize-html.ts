// ─── HTML / CSS sanitizer (zero external dependencies) ───────────────────────
//
// isomorphic-dompurify was removed: it pulls jsdom (a Node.js-only package)
// which crashes the browser bundle whenever this module is imported by any
// "use client" component. (See docs/SECURITY_AUDIT.md finding H-1.)
//
// Strategy:
//   • Browser  — use the native DOMParser + element-walk allowlist strip.
//   • Server   — use conservative regex strip. CSP headers are the primary
//                XSS defense layer; regex is defense-in-depth for the most
//                obvious injection vectors in admin-authored content.
//
// Admin access is gated behind authentication + role checks, so the threat
// model for this sanitizer is a *compromised* admin account rather than
// arbitrary public input. Belt-and-suspenders, not the last line of defense.

// ─── Shared allowlists ───────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set([
  // structure
  "p", "br", "hr", "div", "span", "section", "article", "header", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6",
  // emphasis
  "strong", "b", "em", "i", "u", "small", "sub", "sup", "mark", "del", "ins",
  // lists
  "ul", "ol", "li", "dl", "dt", "dd",
  // tables
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  // links + media
  "a", "img", "figure", "figcaption", "picture", "source",
  // misc
  "blockquote", "pre", "code", "kbd", "samp", "abbr", "cite", "q",
]);

const ALLOWED_ATTR = new Set([
  "href", "title", "alt", "src", "srcset", "sizes", "width", "height",
  "loading", "decoding", "target", "rel", "class", "id", "role",
  "aria-label", "aria-hidden", "colspan", "rowspan",
]);

// ─── Browser path (DOMParser + element walk) ─────────────────────────────────

function sanitizeBrowser(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Collect forbidden nodes first (avoid mutating while walking)
  const forbidden: Element[] = [];
  doc.body.querySelectorAll("*").forEach((el) => {
    if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
      forbidden.push(el);
    }
  });
  // Remove from deepest first so parents don't disappear before children
  for (let i = forbidden.length - 1; i >= 0; i--) {
    forbidden[i].remove();
  }

  // Strip disallowed attributes + dangerous values on surviving nodes
  doc.body.querySelectorAll("*").forEach((el) => {
    const attrNames = Array.from(el.attributes).map((a) => a.name);
    attrNames.forEach((name) => {
      const lower = name.toLowerCase();
      const value = el.getAttribute(name) ?? "";
      const isDangerous =
        !ALLOWED_ATTR.has(lower) &&
        !lower.startsWith("data-") &&
        !lower.startsWith("aria-");
      const isEventHandler = /^on/i.test(lower);
      const isJsUrl = /^\s*javascript:/i.test(value);

      if (isDangerous || isEventHandler || isJsUrl) {
        el.removeAttribute(name);
      }
    });

    // Enforce noopener / noreferrer on any _blank anchor
    if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
      el.setAttribute("rel", "noopener noreferrer");
    }
  });

  return doc.body.innerHTML;
}

// ─── Server path (regex strip) ───────────────────────────────────────────────

function sanitizeServer(html: string): string {
  return (
    html
      // Strip script / style blocks (with their contents)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
      // Remove entire forbidden tags (self-closing or open/close)
      .replace(
        /<\/?\s*(iframe|object|embed|form|link|meta|base|noscript|template)\b[^>]*\/?>/gi,
        ""
      )
      // Strip all event-handler attributes  onclick="…"  onload='…'  etc.
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
      // Kill javascript: in href / src / action
      .replace(
        /(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
        '$1="#"'
      )
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Sanitize admin-authored HTML before rendering in the browser. */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";

  // typeof window check keeps jsdom (and any future heavy polyfill) out of the
  // client bundle entirely: the browser path only runs in the browser.
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    return sanitizeBrowser(html);
  }

  return sanitizeServer(html);
}

// ─── CSS sanitizer ───────────────────────────────────────────────────────────

// Strip CSS tricks that could execute code in legacy browsers. The CSP already
// blocks inline-style eval, but belt-and-suspenders.
const CSS_FORBIDDEN =
  /@import|expression\s*\(|behavior\s*:|javascript\s*:|url\s*\(\s*['"]?\s*javascript/gi;

/** Sanitize CSS supplied by admins for homepage style blocks. */
export function sanitizeCss(css: string | null | undefined): string {
  if (!css) return "";
  return css.replace(CSS_FORBIDDEN, "/* removed for security */");
}

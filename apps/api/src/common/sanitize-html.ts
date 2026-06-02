// ─── Server-side admin-HTML sanitizer ────────────────────────────────────────
//
// Companion to apps/web/lib/sanitize-html.ts. We sanitize on BOTH sides so:
//   - Front-end render-time sanitization (web/lib/sanitize-html.ts) protects
//     legacy rows whose content was created before this guard shipped.
//   - This module sanitizes on the WRITE path so new content can never even
//     enter the database in a form that contains executable script.
//
// Why: if anyone disables the client-render sanitizer (e.g. a future refactor
// strips the wrapping call), the DB itself is still clean. Defense in depth
// for the stored-XSS class of bug (docs/SECURITY_AUDIT.md finding H-1).
// ─────────────────────────────────────────────────────────────────────────────

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span", "section", "article", "header", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "small", "sub", "sup", "mark", "del", "ins",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "a", "img", "figure", "figcaption", "picture", "source",
  "blockquote", "pre", "code", "kbd", "samp", "abbr", "cite", "q",
];

const ALLOWED_ATTR = [
  "href", "title", "alt", "src", "srcset", "sizes", "width", "height",
  "loading", "decoding", "target", "rel", "class", "id", "role",
  "aria-label", "aria-hidden",
  "colspan", "rowspan",
];

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  FORBID_ATTR: [
    "onerror", "onload", "onclick", "onmouseover", "onmouseout", "onkeydown",
    "onkeyup", "onfocus", "onblur", "onsubmit", "onreset", "onchange",
    "onunload", "onabort", "onbeforeunload", "onstart", "onfinish",
  ],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style", "link", "meta", "base"],
  ALLOW_DATA_ATTR: true,
} as const;

/** Strip script, event-handlers, and dangerous tags before persisting. */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  return DOMPurify.sanitize(input, CONFIG as unknown as Parameters<typeof DOMPurify.sanitize>[1]) as unknown as string;
}

const CSS_FORBIDDEN = /@import|expression\s*\(|behavior\s*:|javascript\s*:|url\s*\(\s*['"]?\s*javascript/gi;

/** Tighten admin-supplied CSS for homepage style blocks. */
export function sanitizeCss(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(CSS_FORBIDDEN, "/* removed */");
}

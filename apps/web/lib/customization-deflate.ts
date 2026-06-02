// ────────────────────────────────────────────────────────────────────────────
// Customization de-flate — strip embedded base64 images from a cart-bound
// customization payload by uploading each `data:image/…` blob to /api/files
// and substituting the returned URL.
//
// Why this exists:
//   The canvas customizer (Fabric.js + simple-zone fills) generally uploads
//   user images to /api/files when `fileUploadUrl` is configured, so the
//   serialized canvasJSON references URLs, not base64. But there are paths
//   that can still slip a base64 through:
//     - Built-in SVG templates embedded as `data:image/svg+xml;utf8,…`
//       (tiny, but still data URIs)
//     - Clipboard paste / drag-drop when network upload errors silently
//     - Older customizations restored from cart edit
//     - Simple-zone-customizer's `catch` block which falls back to base64
//       when uploadToServer rejects
//
//   Without this de-flate, a single customised cart item can balloon to
//   tens of MB and either trip the API body-parser or bloat /cart fetches
//   for every device. With it, every persisted customization is guaranteed
//   to reference URLs only.
//
// Behaviour:
//   - Walks the entire customization (any depth) and finds any string field
//     whose value starts with `data:image/`.
//   - For each unique data-URI it encounters, fires a single upload to
//     `/api/files/upload` and replaces every occurrence with the URL.
//   - Uploads in parallel (capped at 4 concurrent) so a 4-image canvas
//     serializes in one round-trip latency.
//   - If an upload fails, the data: URI is left in place and the function
//     resolves — caller decides what to do (we surface an error in the UI
//     when the eventual POST is too large, but at least the user can see
//     what they're trying to send).
// ────────────────────────────────────────────────────────────────────────────

const UPLOAD_PATH = "/api/files/upload";
const MAX_CONCURRENT = 4;

/**
 * True if `s` is a `data:image/…` URI we should hoist.
 *
 * NOTE: returns plain `boolean` (NOT a `s is string` type predicate),
 * because the predicate would narrow `node` to `never` in callers that
 * have already established `typeof node === "string"` — `Exclude<string,
 * string> = never`. Callers do their own narrowing via `typeof`.
 */
function isImageDataUrl(s: unknown): boolean {
  return typeof s === "string" && s.startsWith("data:image/");
}

/** Convert a base64 data URI to a Blob without going through fetch(). */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma); // drop "data:" prefix
  const isBase64 = meta.endsWith(";base64");
  const mime = (isBase64 ? meta.slice(0, -7) : meta) || "application/octet-stream";
  const payload = dataUrl.slice(comma + 1);
  if (isBase64) {
    const bin = atob(payload);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

/** Upload one Blob to /api/files/upload, return the persisted URL. */
async function uploadOne(dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = extFromMime(blob.type);
  const file = new File([blob], `customization-${Date.now()}.${ext}`, { type: blob.type });
  const form = new FormData();
  form.append("file", file);
  form.append("ownerType", "customization");

  // Attach auth so /api/files/upload accepts the call. Session79 locked
  // that endpoint after the audit (was previously open to the world,
  // disk-fill / anon-hosting risk). The customizer flow needs uploads
  // to work for both:
  //   - Logged-in customers → bearer JWT (Authorization)
  //   - Guests doing first-time checkout → X-Cart-Session (a UUID
  //     scoped to their cart, also enforced by the upload guard so
  //     orphaned guest uploads can be cleaned up by ownerType tag)
  // We send whichever is available without going through lib/api.ts to
  // avoid a circular import (cart store → deflate → api → cart).
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("gifteeng.b2c.token");
    if (token) headers.Authorization = `Bearer ${token}`;
    const sessionKey = window.localStorage.getItem("gifteeng.cart.session");
    if (sessionKey) headers["X-Cart-Session"] = sessionKey;
  }

  const res = await fetch(UPLOAD_PATH, { method: "POST", body: form, headers });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const data = await res.json() as { url?: string };
  if (!data.url) throw new Error("missing url in upload response");
  return data.url;
}

/**
 * Run promises with at most `n` in flight at a time. Faster than
 * Promise.all when each upload is heavy + we want backpressure.
 */
async function pMapLimit<T, R>(
  items: T[],
  n: number,
  fn: (it: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Walk a JSON-ish value and collect every distinct `data:image/…` string.
 */
function collectDataUrls(node: unknown, into: Set<string>): void {
  if (typeof node === "string") {
    if (node.startsWith("data:image/")) into.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectDataUrls(v, into);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectDataUrls(v, into);
  }
}

/**
 * Walk + replace, returning a deep-cloned copy where every data: URI has
 * been substituted with `lookup.get(it)`. Strings missing from the lookup
 * (e.g. failed uploads) are left as-is.
 */
function replaceDataUrls(node: unknown, lookup: Map<string, string>): unknown {
  if (typeof node === "string") {
    return node.startsWith("data:image/") ? (lookup.get(node) ?? node) : node;
  }
  if (Array.isArray(node)) return node.map((v) => replaceDataUrls(v, lookup));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = replaceDataUrls(v, lookup);
    }
    return out;
  }
  return node;
}

/**
 * Special-case: many canvases store the canvasJSON as a JSON-encoded STRING
 * inside the customization (because Fabric's `canvas.toJSON()` is then
 * `JSON.stringify`'d once more by our save path). We must parse the string,
 * walk it, replace, and re-stringify so embedded `data:image/…` URIs inside
 * canvasJSON also get hoisted.
 */
function deflateMaybeStringifiedJson(s: string, lookup: Map<string, string>): string {
  try {
    const parsed = JSON.parse(s);
    const next = replaceDataUrls(parsed, lookup);
    return JSON.stringify(next);
  } catch {
    return s;
  }
}

/** Walk + replace including embedded JSON-string fields named like canvasJSON. */
function replaceDataUrlsDeep(node: unknown, lookup: Map<string, string>): unknown {
  if (typeof node === "string") {
    if (node.startsWith("data:image/")) return lookup.get(node) ?? node;
    // Heuristic: a JSON-stringified canvas typically starts with '{"' and is
    // long. Cheap check, then parse-replace-stringify only if it succeeds.
    if (node.length > 64 && node.charCodeAt(0) === 123 /* "{" */ && node.includes("data:image/")) {
      return deflateMaybeStringifiedJson(node, lookup);
    }
    return node;
  }
  if (Array.isArray(node)) return node.map((v) => replaceDataUrlsDeep(v, lookup));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = replaceDataUrlsDeep(v, lookup);
    }
    return out;
  }
  return node;
}

function collectDataUrlsDeep(node: unknown, into: Set<string>): void {
  if (typeof node === "string") {
    if (node.startsWith("data:image/")) { into.add(node); return; }
    if (node.length > 64 && node.charCodeAt(0) === 123 && node.includes("data:image/")) {
      try {
        const parsed = JSON.parse(node);
        collectDataUrlsDeep(parsed, into);
      } catch { /* not JSON, ignore */ }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectDataUrlsDeep(v, into);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) collectDataUrlsDeep(v, into);
  }
}

/**
 * Public entry point. Returns a customization deep-clone where every
 * embedded `data:image/…` URI has been uploaded and replaced with a URL.
 *
 * Idempotent: a customization that already has zero data URIs round-trips
 * to itself (no network calls).
 */
export async function deflateCustomization(c: unknown): Promise<unknown> {
  if (!c) return c;
  const found = new Set<string>();
  collectDataUrlsDeep(c, found);
  if (found.size === 0) return c;

  const dataUrls = [...found];
  const uploads = await pMapLimit(dataUrls, MAX_CONCURRENT, async (du) => {
    try {
      const url = await uploadOne(du);
      return [du, url] as const;
    } catch {
      return [du, null] as const;
    }
  });
  const lookup = new Map<string, string>();
  for (const [du, url] of uploads) {
    if (url) lookup.set(du, url);
  }
  if (lookup.size === 0) return c; // nothing usable; caller still posts as-is
  return replaceDataUrlsDeep(c, lookup);
}

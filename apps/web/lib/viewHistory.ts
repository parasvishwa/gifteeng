/**
 * Anonymous product-view tracking. Powers the homepage "Picked for you" row
 * for visitors who haven't logged in yet — we send the most recent slugs as
 * a query param, the API runs an LLM cohort on them, and returns matched
 * products. Once the user logs in their server-side aiProfile takes over.
 *
 * Stored in localStorage as a slug list (newest first, deduped, capped).
 */

const KEY = "gifteeng.viewHistory";
const MAX = 20;

export function trackView(slug: string): void {
  if (typeof window === "undefined" || !slug) return;
  try {
    const cur = readSlugs();
    const next = [slug, ...cur.filter((s) => s !== slug)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

export function getViewHistory(): string[] {
  return readSlugs();
}

function readSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

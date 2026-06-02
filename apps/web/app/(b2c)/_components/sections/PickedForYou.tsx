/**
 * PickedForYou — Server Component
 *
 * Fetches the anonymous trending fallback server-side so the carousel renders
 * product cards in the initial HTML (crawlable by Google, no skeleton flash
 * for cold visitors). After hydration, _PickedForYouClient re-fetches with
 * personalisation signals (view history + auth token) and swaps in the results.
 *
 * The `initialItems` prop accepted from page.tsx (legacy pre-fetch path) is
 * still supported so the two code paths are compatible during the transition.
 */
import PickedForYouClient, { type RecItem } from "./_PickedForYouClient";

async function safeJson<T>(url: string, opts?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

interface PickedForYouProps {
  /** Pre-fetched items supplied by a parent server component (e.g. page.tsx).
   *  When provided, the component skips its own internal fetch and uses these
   *  directly — avoids a duplicate network call during SSR. */
  initialItems?: RecItem[];
}

export default async function PickedForYou({ initialItems }: PickedForYouProps) {
  let items: RecItem[] = initialItems ?? [];

  // Only fetch internally if the parent didn't supply pre-fetched data.
  if (items.length === 0) {
    const api =
      process.env.INTERNAL_API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://127.0.0.1:4000";

    const data = await safeJson<{ items?: RecItem[] }>(
      `${api}/api/recommendations?limit=12`,
      { next: { revalidate: 300 } }, // anonymous trending; re-check every 5 min
    );
    items = data?.items ?? [];
  }

  return <PickedForYouClient initialItems={items} />;
}

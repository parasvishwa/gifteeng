import Link from "next/link";
import { normaliseMediaUrl } from "@/lib/media";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type ApiProduct = {
  id: string;
  slug?: string;
  title?: string;
  name?: string;
  priceLabel?: string;
  basePrice?: number | string;
  currency?: string;
  imageUrl?: string;
  image?: string | unknown;
  images?: unknown;
};

type ProductListResponse = {
  items: ApiProduct[];
  total: number;
  page: number;
  pageSize: number;
};

function resolveImage(p: ApiProduct): string {
  // Try direct imageUrl first
  if (p.imageUrl && typeof p.imageUrl === "string") {
    return normaliseMediaUrl(p.imageUrl);
  }
  // images: [{url:"..."}] array
  const imgs = p.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs[0];
    const u = typeof first === "string" ? first : (first as { url?: string })?.url ?? "";
    if (u) return normaliseMediaUrl(u);
  }
  // image: "..." or image: {url:"..."}
  if (p.image) {
    if (typeof p.image === "string") {
      return normaliseMediaUrl(p.image);
    }
    const u = (p.image as { url?: string })?.url ?? "";
    if (u) return normaliseMediaUrl(u);
  }
  return "";
}

function priceLabel(p: ApiProduct): string {
  if (p.priceLabel) return p.priceLabel;
  if (p.basePrice !== undefined) {
    const n = parseFloat(String(p.basePrice));
    const sym = p.currency === "INR" ? "₹" : (p.currency ?? "₹");
    return `${sym}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  return "";
}

async function search(q?: string): Promise<ProductListResponse> {
  if (!q) return { items: [], total: 0, page: 1, pageSize: 20 };
  try {
    const res = await fetch(
      `${API_BASE}/api/products?search=${encodeURIComponent(q)}&pageSize=40`,
      { cache: "no-store" },
    );
    if (!res.ok) return { items: [], total: 0, page: 1, pageSize: 20 };
    const data = await res.json() as ProductListResponse | ApiProduct[];
    if (Array.isArray(data)) return { items: data, total: data.length, page: 1, pageSize: 20 };
    return data;
  } catch {
    return { items: [], total: 0, page: 1, pageSize: 20 };
  }
}

const POPULAR = ["birthday", "wedding", "corporate", "chocolate", "hamper", "mug", "keychain", "frame"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const data = await search(q);

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-12">
      {/* ── Sticky search header ── */}
      <div className="sticky top-0 z-30 border-b border-border/40 bg-background/95 backdrop-blur-lg">
        <div className="mx-auto max-w-4xl px-4 py-3">
          <form action="/search" method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search gifts, occasions, names…"
              autoComplete="off"
              className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:border-[#EF3752] transition-all"
            />
            <button
              type="submit"
              className="rounded-xl bg-[#EF3752] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-5">
        {q ? (
          <>
            {/* Result summary */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold">
                  Results for &ldquo;<span className="text-primary">{q}</span>&rdquo;
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.total} product{data.total !== 1 ? "s" : ""} found
                </p>
              </div>
            </div>

            {data.items.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {data.items.map((p) => {
                  const img = resolveImage(p);
                  const price = priceLabel(p);
                  const slug = p.slug ?? p.id;
                  const title = p.title ?? p.name ?? "Product";
                  return (
                    <Link
                      key={p.id}
                      href={`/products/${slug}`}
                      className="group flex flex-col rounded-2xl bg-card overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    >
                      {/* Image */}
                      <div className="relative aspect-square w-full bg-muted overflow-hidden">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={img}
                            alt={title}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-4xl">
                            🎁
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex flex-col flex-1 p-3 gap-1">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug flex-1">
                          {title}
                        </p>
                        {price && (
                          <p className="text-sm font-bold text-foreground mt-1">{price}</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              /* No results */
              <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                <div className="text-6xl">🔍</div>
                <div>
                  <h2 className="text-lg font-semibold">No matches for &ldquo;{q}&rdquo;</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try a different keyword or browse popular searches below.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {POPULAR.map((term) => (
                    <Link
                      key={term}
                      href={`/search?q=${encodeURIComponent(term)}`}
                      className="rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm font-medium capitalize hover:border-primary hover:text-primary transition-colors"
                    >
                      {term}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Landing — no query yet */
          <div className="flex flex-col items-center justify-center py-16 text-center gap-6">
            <div className="text-5xl">✨</div>
            <div>
              <h1 className="text-2xl font-bold">Find the perfect gift</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Search by occasion, recipient, or product name.
              </p>
            </div>
            <div className="w-full max-w-md">
              <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide flex items-center justify-center gap-1.5">
                <span className="text-orange-500">🔥</span> Trending searches
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {POPULAR.map((term) => (
                  <Link
                    key={term}
                    href={`/search?q=${encodeURIComponent(term)}`}
                    className="rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm font-medium capitalize hover:border-primary hover:text-primary transition-colors"
                  >
                    {term}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

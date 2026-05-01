import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { normaliseMediaUrl } from "@/lib/media";

export const revalidate = 60;

// ── Raw API shape ─────────────────────────────────────────────────────────────
type RawProduct = {
  id: string;
  slug?: string;
  title?: string;
  name?: string;
  basePrice?: number | string;
  currency?: string;
  imageUrl?: string;
  images?: Array<{ url?: string; alt?: string } | string>;
  image?: { url?: string } | string;
  isCustomizable?: boolean;
  metadata?: { compareAtPrice?: number | string };
};

type DisplayProduct = {
  id: string;
  slug: string;
  title: string;
  priceLabel: string;
  compareLabel: string;
  imageUrl: string;
  isCustomizable: boolean;
};

type CollectionMeta = {
  id?: string;
  name?: string;
  title?: string;
  slug?: string;
  description?: string;
  heroImage?: string;
  image?: string;
};

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function pickImageUrl(p: RawProduct): string {
  const raw =
    (typeof p.imageUrl === "string" && p.imageUrl ? p.imageUrl : null) ??
    (Array.isArray(p.images) && p.images.length > 0
      ? (typeof p.images[0] === "string"
          ? p.images[0]
          : ((p.images[0] as { url?: string })?.url ?? ""))
      : null) ??
    (p.image
      ? typeof p.image === "string" ? p.image : ((p.image as { url?: string })?.url ?? "")
      : null) ??
    "";
  return normaliseMediaUrl(raw);
}

function mapProduct(p: RawProduct): DisplayProduct {
  const base = parseFloat(String(p.basePrice ?? 0));
  const compare = p.metadata?.compareAtPrice
    ? parseFloat(String(p.metadata.compareAtPrice))
    : 0;
  return {
    id: p.id,
    slug: p.slug ?? p.id,
    title: p.title ?? p.name ?? "Product",
    priceLabel: base > 0
      ? `₹${base.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : "",
    compareLabel: compare > base && base > 0
      ? `₹${compare.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      : "",
    imageUrl: pickImageUrl(p),
    isCustomizable: !!p.isCustomizable,
  };
}

async function fetchCollectionMeta(slug: string): Promise<CollectionMeta | null> {
  try {
    const res = await fetch(`${BASE}/api/collections/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as CollectionMeta;
  } catch {
    return null;
  }
}

async function fetchCollectionProducts(slug: string): Promise<DisplayProduct[]> {
  const tryUrls = [
    `${BASE}/api/products?collection=${encodeURIComponent(slug)}&pageSize=48`,
    `${BASE}/api/products?category=${encodeURIComponent(slug)}&pageSize=48`,
  ];
  for (const url of tryUrls) {
    try {
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown> | RawProduct[];
      const raw: RawProduct[] = Array.isArray(data)
        ? data
        : ((data.items as RawProduct[]) ?? []);
      if (raw.length > 0) return raw.map(mapProduct);
    } catch { /* try next */ }
  }
  return [];
}

function titleize(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── PLP-style card (matches homepage strips & PLP exactly) ────────────────────
function CollectionCard({ p }: { p: DisplayProduct }) {
  return (
    <Link
      href={`/b2c/products/${p.slug}`}
      className="group relative flex flex-col rounded-[18px] overflow-hidden bg-card border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] active:scale-[0.98]"
    >
      {/* Image */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted/40 shrink-0">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt={p.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted/30">
            <Package className="h-10 w-10 text-muted-foreground/20" />
          </div>
        )}

        {/* Badge */}
        {p.isCustomizable && (
          <div className="absolute top-2 left-2 z-10 pointer-events-none">
            <span className="inline-flex items-center gap-1 rounded-full bg-white text-pink-600 text-[9px] font-black px-2 py-0.5 shadow-sm border border-pink-100">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
              CUSTOMISE
            </span>
          </div>
        )}

        {/* Slide-up CTA */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="absolute inset-x-2 bottom-2 z-20 translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200">
          <span className="w-full flex items-center justify-center rounded-xl py-1.5 text-[10px] font-bold text-white bg-[#EF3752]">
            {p.isCustomizable ? "✦ Customise" : "→ Buy Now"}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-2.5 md:p-3 flex flex-col gap-0.5 flex-1">
        <p className="text-[11px] md:text-[12px] font-semibold text-foreground line-clamp-2 leading-snug min-h-[2.4em]">
          {p.title}
        </p>
        <div className="flex items-baseline gap-1.5 mt-auto">
          {p.priceLabel && (
            <p className="text-[14px] font-black text-foreground">{p.priceLabel}</p>
          )}
          {p.compareLabel && (
            <p className="text-[10px] text-muted-foreground line-through">{p.compareLabel}</p>
          )}
        </div>
        <p className="text-[10px] text-emerald-600 font-semibold">Free delivery</p>
      </div>
    </Link>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = await fetchCollectionMeta(slug);
  const name = meta?.title ?? meta?.name ?? titleize(slug);
  return {
    title: `${name} | Collections | Gifteeng`,
    description: meta?.description ?? `Browse the ${name} collection at Gifteeng.`,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [meta, items] = await Promise.all([
    fetchCollectionMeta(slug),
    fetchCollectionProducts(slug),
  ]);

  const name = meta?.title ?? meta?.name ?? titleize(slug);
  const desc = meta?.description ?? `Curated picks from our ${name} collection.`;
  const hero = meta?.heroImage ?? meta?.image;

  return (
    <div>
      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{
          background: hero
            ? undefined
            : "linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--card)) 100%)",
        }}
      >
        {hero && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero} alt={name} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/50" />
          </>
        )}
        <div className="relative mx-auto max-w-7xl px-4 py-7 md:py-10">
          <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/b2c" className="hover:text-foreground transition-colors">Home</Link>
            <span>/</span>
            <Link href="/b2c/collections" className="hover:text-foreground transition-colors">Collections</Link>
            <span>/</span>
            <span className={hero ? "text-white/80" : "text-foreground font-medium"}>{name}</span>
          </nav>
          <h1 className={`text-3xl md:text-4xl font-black tracking-tight ${hero ? "text-white" : "text-foreground"}`}>
            {name}
          </h1>
          <p className={`mt-2 text-sm max-w-lg ${hero ? "text-white/80" : "text-muted-foreground"}`}>{desc}</p>
          {items.length > 0 && (
            <p className={`mt-3 text-[11px] font-bold uppercase tracking-wider ${hero ? "text-white/60" : "text-muted-foreground/60"}`}>
              {items.length} product{items.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </section>

      {/* Product grid */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        {items.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-12 text-center">
            <div className="text-4xl mb-3">🎁</div>
            <p className="text-base font-bold">Collection coming soon</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&rsquo;re curating this collection. Check back soon.
            </p>
            <Link
              href="/b2c/products"
              className="mt-4 inline-flex rounded-xl border border-border bg-card text-foreground px-4 py-2 text-sm font-bold hover:bg-muted transition-colors"
            >
              Browse all products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <CollectionCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

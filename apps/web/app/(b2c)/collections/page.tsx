import type { Metadata } from "next";
import Link from "next/link";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "Gift Collections",  // template appends " | Gifteeng" → "Gift Collections | Gifteeng"
  description: "Discover curated gift collections for every occasion, recipient and budget.",
  alternates: { canonical: `${SITE}/collections` },
  openGraph: {
    title:       "Gift Collections | Gifteeng",
    description: "Curated personalised gift sets for every occasion.",
    url:         `${SITE}/collections`,
    type:        "website",
  },
  twitter: {
    card:        "summary",
    title:       "Gift Collections | Gifteeng",
    description: "Curated personalised gift sets for every occasion.",
  },
};

export const revalidate = 300;

type Collection = {
  id: string;
  name?: string;
  title?: string;
  slug: string;
  description?: string;
  image?: string;
  heroImage?: string;
  product_count?: number;
  isPublished?: boolean;
  is_active?: boolean;
};

async function fetchCollections(): Promise<Collection[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/collections`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as Collection[] | { items?: Collection[] };
    return Array.isArray(data) ? data : (data.items ?? []);
  } catch {
    return [];
  }
}

const GROUP_EMOJIS: Record<string, string> = {
  "By Relation":   "❤️",
  "By Occasion":   "🎉",
  "By Theme":      "🎨",
  "By Profession": "👨‍⚕️",
  "By Use Case":   "🛍️",
};

export default async function CollectionsPage() {
  const all = await fetchCollections();
  const published = all.filter((c) => c.isPublished !== false && c.is_active !== false);

  // Group by the description field (same key used in MobileBottomNav)
  const groups: Record<string, Collection[]> = {};
  for (const c of published) {
    const g = c.description || "Collections";
    groups[g] = [...(groups[g] ?? []), c];
  }
  const groupNames = Object.keys(groups);

  // ── JSON-LD: BreadcrumbList + ItemList ────────────────────────────────────
  // Google uses these to render breadcrumb trails in SERPs and to understand
  // that this is a category-like index page (helps with category-result
  // rich snippets).
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",        item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Collections", item: `${SITE}/collections` },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type":    "ItemList",
    name:       "Gifteeng Collections",
    itemListElement: published.slice(0, 50).map((c, i) => ({
      "@type":    "ListItem",
      position:   i + 1,
      url:        `${SITE}/collections/${encodeURIComponent(c.slug ?? c.id)}`,
      name:       c.title ?? c.name ?? c.slug,
    })),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 md:pt-28 pb-24 md:pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      {/* Breadcrumb + heading */}
      <div className="mb-10">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>/</span>
          <span className="font-medium text-foreground">Collections</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Collections</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Curated gift sets for every occasion, relationship and budget.
        </p>
      </div>

      {published.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-16 text-center">
          <div className="text-5xl mb-4">🎁</div>
          <p className="font-semibold text-muted-foreground">Collections coming soon</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            We&rsquo;re curating amazing gift collections. Check back soon.
          </p>
          <Link
            href="/products"
            className="mt-5 inline-flex rounded-xl bg-[#EF3752] text-white px-5 py-2.5 text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Browse all products
          </Link>
        </div>
      ) : (
        <div className="space-y-12">
          {groupNames.map((group) => (
            <section key={group}>
              {/* Group header */}
              <div className="flex items-center gap-2.5 mb-5">
                <span className="text-2xl leading-none">{GROUP_EMOJIS[group] ?? "📌"}</span>
                <h2 className="text-xl font-black">{group}</h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {groups[group]!.length} collection{groups[group]!.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups[group]!.map((col) => {
                  const name = col.title ?? col.name ?? col.slug;
                  const slug = col.slug ?? name.toLowerCase().replace(/\s+/g, "-");
                  const img  = col.heroImage ?? col.image;
                  return (
                    <Link
                      key={col.id}
                      href={`/collections/${encodeURIComponent(slug)}`}
                      className="group relative rounded-2xl overflow-hidden border border-border/40 bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200"
                    >
                      {/* Image / placeholder */}
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={name}
                          className="w-full aspect-[4/3] object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="w-full aspect-[4/3] bg-gradient-to-br from-primary/8 via-primary/5 to-transparent flex items-center justify-center">
                          <span className="text-5xl opacity-60">{GROUP_EMOJIS[group] ?? "🎁"}</span>
                        </div>
                      )}

                      {/* Info */}
                      <div className="p-3.5">
                        <p className="font-bold text-[13px] leading-snug text-foreground group-hover:text-primary transition-colors">
                          {name}
                        </p>
                        {col.product_count != null && col.product_count > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {col.product_count} products
                          </p>
                        )}
                      </div>

                      {/* Arrow hint */}
                      <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xs font-bold">→</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

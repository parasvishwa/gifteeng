import Link from "next/link";

export const revalidate = 300;

type CatalogItem = {
  id: string;
  productId: string;
  product?: { id: string; title?: string };
};

type Catalog = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  heroImage?: string | null;
  isPublished: boolean;
  items?: CatalogItem[];
};

async function fetchCatalogs(): Promise<Catalog[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/catalogs`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return (await res.json()) as Catalog[];
  } catch {
    return [];
  }
}

export default async function CatalogsPage() {
  const catalogs = await fetchCatalogs();
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Corporate Gifting Catalogs</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Curated collections for teams, clients, and special occasions.
        </p>
      </header>
      {catalogs.length === 0 ? (
        <p className="text-center text-muted-foreground">No catalogs available right now.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {catalogs.map((c) => (
            <Link
              key={c.id}
              href={`/catalogs/${c.slug}`}
              className="group overflow-hidden rounded-2xl bg-card transition hover:opacity-90"
            >
              {c.heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.heroImage}
                  alt={c.title}
                  className="h-48 w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="h-48 w-full bg-muted" />
              )}
              <div className="p-4">
                <h2 className="text-xl font-semibold">{c.title}</h2>
                {c.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  {c.items?.length ?? 0} products
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

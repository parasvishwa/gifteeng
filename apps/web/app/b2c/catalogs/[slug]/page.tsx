import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 600;

type Product = {
  id: string;
  slug?: string;
  title?: string;
  priceLabel?: string;
  imageUrl?: string | null;
};

type CatalogItem = {
  id: string;
  productId: string;
  sortOrder: number;
  product?: Product;
};

type Catalog = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  heroImage?: string | null;
  isPublished: boolean;
  items: CatalogItem[];
};

async function fetchCatalog(slug: string): Promise<Catalog | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/catalogs/${slug}`, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    return (await res.json()) as Catalog;
  } catch {
    return null;
  }
}

export default async function CatalogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalog = await fetchCatalog(slug);
  if (!catalog) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="mb-10">
        {catalog.heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={catalog.heroImage}
            alt={catalog.title}
            className="mb-6 h-72 w-full rounded-2xl object-cover"
          />
        )}
        <h1 className="text-4xl font-bold">{catalog.title}</h1>
        {catalog.description && (
          <p className="mt-3 text-lg text-muted-foreground">{catalog.description}</p>
        )}
        <div className="mt-6">
          <Link
            href={`/catalogs/${catalog.slug}/enquire`}
            className="inline-block rounded-xl bg-[#EF3752] px-6 py-3 text-sm font-bold text-white hover:opacity-90"
          >
            Request a quote
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-semibold">Products</h2>
        {catalog.items.length === 0 ? (
          <p className="text-muted-foreground">No products in this catalog yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {catalog.items.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-2xl bg-card">
                {item.product?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.product.imageUrl}
                    alt={item.product.title ?? ""}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="h-40 w-full bg-muted" />
                )}
                <div className="p-3">
                  <h3 className="text-sm font-semibold">{item.product?.title ?? "Product"}</h3>
                  {item.product?.priceLabel && (
                    <p className="mt-1 text-xs text-muted-foreground">{item.product.priceLabel}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const revalidate = 300;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

export const metadata: Metadata = {
  title: "Premium Personalized Gifts Above ₹999 — Gifteeng",
  description:
    "Luxury personalized gifts above ₹999 — premium photo books, custom jewellery, engraved gift sets, and curated hampers. For those who deserve the best.",
  alternates: { canonical: `${SITE}/premium-gifts` },
  openGraph: {
    title: "Premium Personalized Gifts Above ₹999 — Gifteeng",
    description: "Luxury personalized gifts above ₹999 — delivered pan-India.",
    url: `${SITE}/premium-gifts`,
    type: "website",
  },
};

type Product = {
  id: string;
  slug?: string;
  title: string;
  price?: number;
  basePrice?: number;
  images?: { url: string }[] | string[];
};

async function getProducts(): Promise<Product[]> {
  const api =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://127.0.0.1:4000";
  const data = await fetch(
    `${api}/api/products?minPrice=999&pageSize=12&sort=popular`,
    { next: { revalidate: 300 } }
  )
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .catch(() => ({ items: [] }));
  return data?.items ?? [];
}

function imageUrl(p: Product): string {
  const first = p.images?.[0];
  if (!first) return "/placeholder-product.jpg";
  if (typeof first === "string") return first;
  return (first as { url: string }).url ?? "/placeholder-product.jpg";
}

function price(p: Product): string {
  const v = p.price ?? p.basePrice ?? 0;
  return `₹${v.toLocaleString("en-IN")}`;
}

export default async function PremiumGiftsPage() {
  const products = await getProducts();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="bg-gradient-to-br from-[#EF3752]/10 via-background to-background py-14 text-center">
        <div className="mx-auto max-w-2xl px-4">
          <div className="mb-4 inline-block rounded-full border border-[#EF3752]/30 bg-[#EF3752]/10 px-4 py-1 text-sm font-medium text-[#EF3752]">
            Premium Collection
          </div>
          <h1 className="font-display mb-4 text-4xl font-bold">
            Premium Personalized Gifts
          </h1>
          <p className="text-muted-foreground">
            For moments that deserve the extraordinary. Our premium collection
            features luxury custom gifts — from hand-crafted photo books to
            engraved keepsakes — all above ₹999 and worth every rupee.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4">
          {products.length === 0 ? (
            <p className="text-center text-muted-foreground">Loading products&hellip;</p>
          ) : (
            <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <Link
                  key={p.id}
                  href={`/products/${p.slug ?? p.id}`}
                  className="group rounded-xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl(p)}
                      alt={p.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-2 text-foreground">{p.title}</p>
                    <p className="mt-1 text-sm font-bold text-[#EF3752]">{price(p)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-10 text-center">
            <Link
              href="/products?minPrice=999"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors"
            >
              See All Premium Gifts
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

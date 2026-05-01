import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 300;

type CmsPage = {
  title: string;
  body: string;
  updated_at?: string | null;
};

async function fetchCmsPage(slug: string): Promise<CmsPage | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/admin/settings/page_${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { value?: CmsPage | string } | null;
    if (!json || json.value == null) return null;
    if (typeof json.value === "string") {
      try {
        return JSON.parse(json.value) as CmsPage;
      } catch {
        return { title: slug, body: json.value };
      }
    }
    return json.value;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchCmsPage(slug);
  if (!page) {
    return { title: "Page Not Found — Gifteeng" };
  }
  return {
    title: `${page.title} — Gifteeng`,
    description: page.body.slice(0, 160),
  };
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await fetchCmsPage(slug);
  if (!page) notFound();

  // TODO: render markdown via `marked` once it lands in the monorepo. For now
  // render as pre-formatted text to preserve whitespace and line breaks.
  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-4xl px-4">
        <h1 className="font-display text-3xl md:text-5xl font-black mb-6 tracking-tight">{page.title}</h1>
        {page.updated_at ? (
          <p className="text-xs text-muted-foreground mb-8">
            Last updated: {new Date(page.updated_at).toLocaleDateString()}
          </p>
        ) : null}
        <div className="prose prose-slate max-w-none whitespace-pre-wrap">{page.body}</div>
      </div>
    </section>
  );
}

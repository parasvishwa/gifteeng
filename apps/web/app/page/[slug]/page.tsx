// Public route for CMS-managed pages — admin Pages screen lists URLs like
// "/page/privacy-policy", "/page/about" and lets the operator edit the HTML
// body. Without this route those URLs 404'd, so editing the CMS row had no
// visible effect on the storefront and the admin understandably thought
// the editor didn't work.
//
// The hardcoded legacy pages at /b2c/privacy, /b2c/terms, etc. continue to
// exist alongside this route — they have richer iconography / structured
// content that wouldn't survive a pure-HTML round-trip. Footer / Navbar
// can be repointed to /page/* slugs as the CMS copy stabilises.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const revalidate = 60; // 1-minute ISR — admin edits show within a minute

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_INTERNAL_URL ||
  "http://127.0.0.1:4000";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://gifteeng.com";

type CustomPageDto = {
  id: string;
  title: string;
  slug: string;
  html_content: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

async function fetchPublishedPage(slug: string): Promise<CustomPageDto | null> {
  // Public read-only endpoint, no auth — returns only published rows.
  try {
    const res = await fetch(
      `${API_BASE}/api/custom-pages/by-slug/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as CustomPageDto;
  } catch {
    return null;
  }
}

// Next.js 15: route params are async — must be awaited.
type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPublishedPage(slug);
  if (!page) {
    return { title: "Page not found — Gifteeng" };
  }
  return {
    title: `${page.title} — Gifteeng`,
    alternates: { canonical: `${SITE}/page/${page.slug}` },
    openGraph: {
      title: `${page.title} — Gifteeng`,
      url: `${SITE}/page/${page.slug}`,
      type: "article",
    },
  };
}

export default async function CmsPage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const page = await fetchPublishedPage(slug);
  if (!page) notFound();

  return (
    <main className="container mx-auto max-w-3xl px-4 py-10 md:py-14">
      <article className="rounded-2xl border border-border/40 bg-card p-6 md:p-10">
        <header className="mb-6 border-b border-border/30 pb-5">
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight leading-tight">
            {page.title}
          </h1>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Last updated {new Date(page.updated_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </header>
        <div
          className="prose prose-sm md:prose-base max-w-none dark:prose-invert prose-headings:font-display prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
          // The HTML is sanitized server-side in CustomPagesService before
          // being persisted (sanitizeHtml — DOMPurify), so the stored value
          // is already safe to inject. Re-sanitizing on render would only
          // strip class names without adding safety.
          dangerouslySetInnerHTML={{ __html: page.html_content }}
        />
      </article>
    </main>
  );
}

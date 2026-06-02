"use client";

// ─── Shop by Category — uniform square grid ───────────────────────────────────
// 2 cols on mobile, 4 cols on md+. Every card identical size (aspect-square).
// Shows product thumbnail, category name, product count.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Gift } from "lucide-react";
import { normaliseMediaUrl } from "@/lib/media";

interface Preview { url: string; productId: string; title: string; slug: string }
interface Category {
  id: string;
  name: string;
  emoji?: string;
  image?: string;
  parentId?: string | null;
  isActive?: boolean;
  active?: boolean;
  showOnHome?: boolean;
  featured?: boolean;
  sortOrder?: number;
  homeOrder?: number;
  product_count?: number;
  previews?: Preview[];
}

function apiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

export default function CategoryBento() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `${apiBase()}/api/categories?withPreviews=true&previewsPerCategory=1`,
          { cache: "no-store" },
        );
        if (!r.ok) { setLoading(false); return; }
        const data = await r.json();
        const list: Category[] = Array.isArray(data)
          ? data
          : (data.items ?? data.data ?? []);

        const topLevel = list.filter(
          (c) => (c.parentId == null) && (c.isActive === true || c.active === true),
        );
        const flagged = topLevel.filter(
          (c) => c.showOnHome === true || c.featured === true,
        );
        const filtered = flagged.length > 0 ? flagged : topLevel;
        filtered.sort((a, b) => {
          const ao = a.homeOrder ?? a.sortOrder ?? 99;
          const bo = b.homeOrder ?? b.sortOrder ?? 99;
          return ao - bo;
        });
        if (alive) setCats(filtered.slice(0, 8));
      } catch { /* swallow */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <GridSkeleton />;
  if (cats.length === 0) return null;

  return (
    <section className="mt-8 mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base md:text-lg font-black tracking-tight text-foreground">
          Shop by Category
        </h2>
        <Link
          href="/products"
          className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
        >
          See all <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cats.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({ cat }: { cat: Category }) {
  const thumb = cat.previews?.[0]?.url
    ? normaliseMediaUrl(cat.previews[0].url)
    : cat.image
    ? normaliseMediaUrl(cat.image)
    : null;

  const count = cat.product_count ?? 0;

  return (
    <Link
      href={`/products?category=${encodeURIComponent(cat.name)}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200"
    >
      {/* Square image area */}
      <div className="aspect-square w-full overflow-hidden bg-muted/30">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={cat.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gift className="w-10 h-10 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Label */}
      <div className="px-3 py-2.5">
        <p className="text-sm font-bold text-foreground leading-snug line-clamp-1">
          {cat.name}
        </p>
        {count > 0 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {count} product{count !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <section className="mt-8 mb-10">
      <div className="h-6 w-40 rounded bg-muted/40 mb-4 animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border border-border">
            <div className="aspect-square bg-muted/40" />
            <div className="px-3 py-2.5 space-y-1.5">
              <div className="h-3.5 w-3/4 rounded bg-muted/40" />
              <div className="h-2.5 w-1/2 rounded bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

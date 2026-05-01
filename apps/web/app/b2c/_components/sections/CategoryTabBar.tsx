"use client";

// ─── Category Tab Bar — icon-on-top + full label below ───────────────────────
//
// Renders a horizontal strip of top-level categories. Each chip is a 44px
// circle with an emoji and a 2-line label below — same visual language as
// the mobile Browse Categories strip so web + Flutter feel consistent.
//
// Earlier this rendered text-only pills and truncated the category name to
// the first word, producing duplicates like "Key" appearing twice (one for
// "Key Chains", one for "Key Holders") and dropping the "& Decor" half of
// "Home & Decor". Both fixed.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  emoji?: string;
  isActive?: boolean;
  active?: boolean;
  showOnHome?: boolean;
  featured?: boolean;
  sortOrder?: number;
  homeOrder?: number;
  parentId?: string | null;
}

function apiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

// Emoji fallback when the admin hasn't set one on the category itself.
function emojiFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("key"))                                   return "🗝️";
  if (n.includes("mug") || n.includes("drink"))            return "☕";
  if (n.includes("desk"))                                  return "✒️";
  if (n.includes("home") || n.includes("decor"))           return "🏠";
  if (n.includes("fashion") || n.includes("apparel"))      return "👜";
  if (n.includes("car") || n.includes("auto"))             return "🚗";
  if (n.includes("kid") || n.includes("baby"))             return "🧸";
  if (n.includes("business") || n.includes("corporate"))   return "💼";
  if (n.includes("fridge") || n.includes("magnet"))        return "🧲";
  if (n.includes("return") || n.includes("favor"))         return "🎁";
  if (n.includes("photo") || n.includes("frame"))          return "🖼️";
  if (n.includes("personal"))                              return "✨";
  return "🎁";
}

export default function CategoryTabBar() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `${apiBase()}/api/categories?pageSize=50`,
          { cache: "no-store" },
        );
        if (!r.ok) { setLoading(false); return; }
        const data = await r.json();
        const list: Category[] = Array.isArray(data)
          ? data
          : (data.items ?? data.data ?? []);

        const topLevel = list.filter(
          (c) => !c.parentId && (c.isActive === true || c.active === true),
        );
        const flagged = topLevel.filter(c => c.showOnHome === true || c.featured === true);
        const filtered = flagged.length > 0 ? flagged : topLevel;
        filtered.sort((a, b) => (a.homeOrder ?? a.sortOrder ?? 99) - (b.homeOrder ?? b.sortOrder ?? 99));
        if (alive) setCats(filtered.slice(0, 12));
      } catch { /* swallow */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Dedupe by name in case the backend returns "Key" both as a parent and
  // as some other slug-collision side-effect — first occurrence wins.
  const dedupedCats = useMemo(() => {
    const seen = new Set<string>();
    return cats.filter(c => {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [cats]);

  if (!loading && dedupedCats.length === 0) return null;

  return (
    <div className="mb-3 -mx-4">
      {/* Center the strip on wide screens; fall back to natural scroll
          when the row overflows on narrow viewports. The inner div uses
          `mx-auto` so a short list of pills sits in the middle, while
          the outer overflow-x lets long lists scroll horizontally. */}
      <div className="flex justify-center overflow-x-auto scrollbar-hide px-4 py-2">
        <div className="flex gap-3 mx-auto">
        {/* "All" chip — primary brand circle */}
        <Link
          href="/b2c/products"
          className="shrink-0 flex flex-col items-center gap-1.5 w-[68px] active:scale-95 transition-transform"
        >
          <div className="size-11 rounded-full bg-[#EF3752] flex items-center justify-center text-white text-lg shadow-sm ring-2 ring-[#EF3752]/15">
            🛍️
          </div>
          <span className="text-[10.5px] leading-tight font-bold text-[#EF3752] text-center">
            All Gifts
          </span>
        </Link>

        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shrink-0 flex flex-col items-center gap-1.5 w-[68px]">
                <div className="size-11 rounded-full bg-muted/50 animate-pulse" />
                <div className="h-2.5 w-12 rounded bg-muted/50 animate-pulse" />
              </div>
            ))
          : dedupedCats.map((cat) => {
              const icon = cat.emoji && cat.emoji.trim() ? cat.emoji : emojiFor(cat.name);
              return (
                <Link
                  key={cat.id}
                  href={`/b2c/products?category=${encodeURIComponent(cat.name)}`}
                  className="shrink-0 flex flex-col items-center gap-1.5 w-[68px] group active:scale-95 transition-transform"
                >
                  <div className="size-11 rounded-full bg-card border border-border flex items-center justify-center text-lg group-hover:border-primary/40 group-hover:bg-primary/5 transition-colors">
                    <span>{icon}</span>
                  </div>
                  <span
                    className="text-[10.5px] leading-tight font-semibold text-muted-foreground group-hover:text-primary text-center line-clamp-2"
                    title={cat.name}
                  >
                    {cat.name}
                  </span>
                </Link>
              );
            })
        }
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * MarketplaceStoresSection — "Visit Our Marketplace Stores"
 *
 * Pulls active marketplace links from /api/marketplace-links (admin-managed).
 * Renders horizontal cards linking out to Amazon, Flipkart, Meesho, etc.
 * Hidden when no active links exist.
 */

import { useEffect, useState } from "react";
import { ExternalLink, Store } from "lucide-react";
import { apiB2c } from "@/lib/api";

interface MarketplaceLink {
  id:        string;
  name:      string;
  iconUrl:   string | null;
  storeUrl:  string;
  isActive:  boolean;
  sortOrder: number;
}

// Heuristic colour-by-name for built-in marketplaces (so the cards look
// branded even when the admin hasn't uploaded an iconUrl).
function brandStyle(name: string): { bg: string; text: string; emoji: string } {
  const n = name.toLowerCase();
  if (n.includes("amazon"))   return { bg: "from-amber-500/15 to-orange-500/10",  text: "text-amber-700 dark:text-amber-300",  emoji: "📦" };
  if (n.includes("flipkart")) return { bg: "from-blue-500/15 to-yellow-500/10",   text: "text-blue-700 dark:text-blue-300",    emoji: "🛒" };
  if (n.includes("meesho"))   return { bg: "from-pink-500/15 to-purple-500/10",   text: "text-pink-700 dark:text-pink-300",    emoji: "🛍️" };
  if (n.includes("myntra"))   return { bg: "from-rose-500/15 to-pink-500/10",     text: "text-rose-700 dark:text-rose-300",    emoji: "👗" };
  if (n.includes("ajio"))     return { bg: "from-purple-500/15 to-indigo-500/10", text: "text-purple-700 dark:text-purple-300",emoji: "🛒" };
  return { bg: "from-slate-500/15 to-zinc-500/10", text: "text-slate-700 dark:text-slate-300", emoji: "🏪" };
}

export default function MarketplaceStoresSection() {
  const [links, setLinks] = useState<MarketplaceLink[]>([]);

  useEffect(() => {
    apiB2c().get<MarketplaceLink[]>("/api/marketplace-links").then((data) => {
      const list = Array.isArray(data) ? data : [];
      setLinks(list.filter((l) => l.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
    }).catch(() => {});
  }, []);

  if (links.length === 0) return null;

  return (
    <section className="container max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-[#EF3752]" />
            <h2 className="text-lg font-black">Visit Our Marketplace Stores</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Find Gifteeng on your favourite shopping platforms.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {links.map((link) => {
          const style = brandStyle(link.name);
          return (
            <a
              key={link.id}
              href={link.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`group relative rounded-xl bg-gradient-to-br ${style.bg} border border-border p-4 flex flex-col items-center justify-center text-center hover:scale-[1.02] transition-transform`}
            >
              <ExternalLink className="absolute top-2 right-2 w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              {link.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={link.iconUrl}
                  alt={link.name}
                  className="w-12 h-12 object-contain rounded-lg mb-2"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-card border border-border flex items-center justify-center text-2xl mb-2">
                  {style.emoji}
                </div>
              )}
              <span className={`text-sm font-bold ${style.text}`}>{link.name}</span>
              <span className="text-[10px] text-muted-foreground mt-1">Visit store →</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

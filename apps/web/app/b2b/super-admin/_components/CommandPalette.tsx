"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, CornerDownLeft } from "lucide-react";

export interface PaletteItem {
  label: string;
  href: string;
  icon: React.ElementType;
  section: string;
  keywords?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  recentHrefs: string[];
}

// Lightweight fuzzy match: every char of the query, in order, must appear
// somewhere in the haystack. Score is biased toward earlier and tighter
// matches so "ord" ranks "Orders" above "Product Drops".
function fuzzyScore(haystack: string, query: string): number {
  if (!query) return 1;
  const h = haystack.toLowerCase();
  const q = query.toLowerCase();
  if (h.startsWith(q)) return 1000;
  if (h.includes(q)) return 500 - h.indexOf(q);
  let hi = 0;
  let score = 0;
  let lastIdx = -2;
  for (const ch of q) {
    const found = h.indexOf(ch, hi);
    if (found < 0) return 0;
    score += found - lastIdx === 1 ? 5 : 1;
    lastIdx = found;
    hi = found + 1;
  }
  return score;
}

export function CommandPalette({ open, onClose, items, recentHrefs }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // When the query changes, reset the highlight to the first row so Enter
  // always picks the most relevant result rather than a stale selection.
  useEffect(() => { setActiveIdx(0); }, [query]);

  const ranked = useMemo(() => {
    if (!query) {
      // No query: surface recents first, then everything by section.
      const recents = recentHrefs
        .map((h) => items.find((i) => i.href === h))
        .filter((x): x is PaletteItem => Boolean(x));
      const recentSet = new Set(recents.map((r) => r.href));
      const rest = items.filter((i) => !recentSet.has(i.href));
      return [...recents.map((i) => ({ item: i, group: "Recent" as const })), ...rest.map((i) => ({ item: i, group: i.section }))];
    }
    return items
      .map((item) => {
        const labelScore = fuzzyScore(item.label, query) * 2;
        const kwScore = fuzzyScore(item.keywords ?? "", query);
        const sectionScore = fuzzyScore(item.section, query) * 0.5;
        const score = Math.max(labelScore, kwScore, sectionScore);
        return { item, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((r) => ({ item: r.item, group: r.item.section }));
  }, [query, items, recentHrefs]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, ranked.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = ranked[activeIdx]?.item;
        if (target) { router.push(target.href); onClose(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, ranked, activeIdx, onClose, router]);

  // Keep the highlighted row scrolled into view as the user arrows down a
  // long result list.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[12vh] px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border/40 bg-card shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b border-border/40 px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground/70" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, settings, customers…"
            className="w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <kbd className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/70">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1.5">
          {ranked.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground/60">
              No matches for &ldquo;{query}&rdquo;
            </div>
          ) : (
            ranked.map(({ item, group }, idx) => {
              const prevGroup = idx === 0 ? null : ranked[idx - 1]!.group;
              const showHeader = group !== prevGroup;
              const Icon = item.icon;
              const isActive = idx === activeIdx;
              return (
                <div key={item.href}>
                  {showHeader && (
                    <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50">
                      {group}
                    </div>
                  )}
                  <button
                    data-idx={idx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => { router.push(item.href); onClose(); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/70"}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground/50">{item.section}</span>
                    <ArrowRight className={`h-3 w-3 shrink-0 transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/40 bg-muted/30 px-3.5 py-2 text-[10px] text-muted-foreground/70">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/60 bg-background px-1 py-px text-[9px]">↑</kbd>
              <kbd className="rounded border border-border/60 bg-background px-1 py-px text-[9px]">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="h-2.5 w-2.5" /> open
            </span>
          </div>
          <span>{ranked.length} result{ranked.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

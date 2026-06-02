"use client";

import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

const API_BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

interface AutocompleteProduct {
  id: string;
  title: string;
  slug: string;
  images?: string[];
  basePrice?: number;
  category?: string;
}

interface SearchResult {
  items: AutocompleteProduct[];
}

export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<AutocompleteProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [hintCats, setHintCats] = useState<string[]>([]);
  const [hintIdx, setHintIdx] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch autocomplete results
  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: q, pageSize: "5" });
      const res = await fetch(
        `${API_BASE_URL}/api/products?${params.toString()}`,
        { signal: abortRef.current.signal },
      );
      if (!res.ok) throw new Error("API error");
      const data = (await res.json()) as SearchResult | AutocompleteProduct[];
      const items = Array.isArray(data) ? data : (data.items ?? []);
      setResults(items.slice(0, 6));
      setOpen(true);
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced onChange
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    setHighlightedIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(v);
      fetchResults(v);
    }, 300);
  };

  // Fetch category names for animated placeholder
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/categories?pageSize=20`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const items: { name?: string }[] = Array.isArray(d)
          ? d
          : ((d.items ?? d.data ?? []) as { name?: string }[]);
        const names = items
          .slice(0, 12)
          .map((c) => c.name ?? "")
          .filter(Boolean);
        if (names.length) setHintCats(names);
      })
      .catch(() => {});
  }, []);

  // Cycle hint text every 2.5 s with a fade transition
  useEffect(() => {
    if (!hintCats.length) return;
    const id = setInterval(() => {
      setHintVisible(false);
      const t = setTimeout(() => {
        setHintIdx((i) => (i + 1) % hintCats.length);
        setHintVisible(true);
      }, 250);
      return () => clearTimeout(t);
    }, 2500);
    return () => clearInterval(id);
  }, [hintCats]);

  // Re-show dropdown on focus if query present
  const handleFocus = () => {
    setIsFocused(true);
    if (query.length >= 2 && results.length > 0) setOpen(true);
  };

  const handleBlur = () => setIsFocused(false);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigate();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && results[highlightedIndex]) {
        router.push(`/products/${results[highlightedIndex].slug}`);
        setOpen(false);
      } else {
        navigate();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const navigate = () => {
    const params = new URLSearchParams();
    if (value.trim()) params.set("search", value.trim());
    router.push(`/products${params.toString() ? `?${params}` : ""}`);
    setOpen(false);
  };

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Cleanup debounce/abort on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const showDropdown = open && query.length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          navigate();
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={isFocused ? "Search products… ⌘K" : ""}
          className="w-full rounded-xl border border-pink-200 dark:border-border bg-white dark:bg-muted px-3 py-2 text-sm focus:outline-none focus:border-[#EF3752] transition-all"
          autoComplete="off"
        />
        {/* Animated cycling category hint — visible only when idle & empty */}
        {!value && !isFocused && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center px-3 pointer-events-none select-none overflow-hidden whitespace-nowrap",
              "text-sm text-muted-foreground transition-opacity duration-200",
              hintVisible ? "opacity-100" : "opacity-0",
            )}
          >
            Search for&nbsp;
            <span className="font-medium">
              {hintCats.length > 0 ? hintCats[hintIdx] : "gifts"}
            </span>
            …
          </span>
        )}
      </form>

      {/* Autocomplete Dropdown — pin to the input but allow it to grow wider
          than the (narrow) sidebar it sits in. min-w guarantees readable rows,
          max-w prevents overflow on very small screens. max-h makes the list
          scrollable instead of spilling past the page fold. */}
      <div
        className={cn(
          "absolute left-0 z-50 mt-1.5 bg-card border border-border shadow-sm rounded-xl overflow-hidden",
          "w-[min(380px,calc(100vw-2rem))] min-w-full max-h-[70vh] overflow-y-auto",
          "transition-all duration-200 origin-top",
          showDropdown
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none",
        )}
      >
        {/* Loading skeleton */}
        {loading && (
          <div className="px-3 py-2.5 flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
              <div className="h-2.5 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <ul>
            {results.map((product, i) => (
              <li key={product.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
                    highlightedIndex === i
                      ? "bg-primary/10"
                      : "hover:bg-accent",
                  )}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onMouseLeave={() => setHighlightedIndex(-1)}
                  onClick={() => {
                    router.push(`/products/${product.slug}`);
                    setOpen(false);
                  }}
                >
                  {/* Thumbnail — larger, square, with graceful fallback */}
                  {product.images && product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.title}
                      className="h-12 w-12 rounded-lg object-cover shrink-0 border border-border/40 bg-muted"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-muted shrink-0 flex items-center justify-center text-muted-foreground/40">
                      <Package className="h-5 w-5" />
                    </div>
                  )}

                  {/* Text — title wraps to 2 lines, category under */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold text-foreground leading-snug line-clamp-2"
                      title={product.title}
                    >
                      {product.title}
                    </p>
                    {product.category && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {product.category}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  {product.basePrice !== undefined && (
                    <span className="text-sm font-black text-foreground shrink-0 tabular-nums mt-0.5">
                      ₹{product.basePrice}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Empty state */}
        {!loading && results.length === 0 && query.length >= 2 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Footer — See all results */}
        {!loading && query.length >= 2 && (
          <div className="border-t border-border/30">
            <Link
              href={`/products?search=${encodeURIComponent(query)}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              See all results for &ldquo;{query}&rdquo; →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

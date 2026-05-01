"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";
import {
  ShoppingCart,
  Search,
  X,
  Gift,
  ChevronRight,
  Package,
  Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  slug: string;
  title: string;
  description?: string;
  priceLabel?: string;
  price?: number;
  imageUrl?: string;
  category?: string;
}

interface Allocation {
  id: string;
  amount?: number;
  redeemedAmount?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAT_EMOJI: Record<string, string> = {
  mugs: "☕", mug: "☕",
  apparel: "👕", clothing: "👕", tshirt: "👕",
  electronics: "📱", gadgets: "📱", tech: "💻",
  home: "🏠", homeware: "🏠", decor: "🏡",
  accessories: "⌚",
  bags: "👜",
  stationery: "📝", books: "📚",
  food: "🍫", sweets: "🍬",
  skincare: "✨", beauty: "💄",
  sports: "⚽",
  jewelry: "💎",
  custom: "🎨", personalized: "✏️",
};

function catEmoji(cat: string): string {
  return CAT_EMOJI[cat.toLowerCase()] ?? "🎁";
}

function fmt(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmployeeStorePage() {
  const [products, setProducts]     = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch]         = useState("");
  const [category, setCategory]     = useState("");
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const [budget, setBudget]               = useState<number | null>(null);
  const [totalBudget, setTotalBudget]     = useState<number>(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [selected, setSelected] = useState<Product | null>(null);
  const [addBusy, setAddBusy]   = useState(false);
  const [addedId, setAddedId]   = useState<string | null>(null);

  // ── Load products ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const params = new URLSearchParams();
      if (search)   params.set("search",   search);
      if (category) params.set("category", category);
      params.set("pageSize", "48");

      // Try B2B catalog first; fall back to the global product catalog
      let res: any;
      try {
        res = await api.get<any>(`/api/products/b2b/catalog?${params.toString()}`);
      } catch {
        res = null;
      }
      let raw: any[] = Array.isArray(res)
        ? res
        : (res?.products ?? res?.items ?? []);

      // If the B2B catalog is empty / unavailable, use the global catalog
      if (raw.length === 0) {
        const b2cRes = await api.get<any>(`/api/products?${params.toString()}`);
        raw = Array.isArray(b2cRes)
          ? b2cRes
          : (b2cRes?.products ?? b2cRes?.items ?? []);
      }
      const list: Product[] = raw.map((p) => {
        const imgs: { url?: string }[] = Array.isArray(p.images) ? p.images : [];
        const rawUrl = imgs[0]?.url ?? "";
        return {
          id:          p.id,
          slug:        p.slug,
          title:       p.title,
          description: p.description,
          price:
            p.basePrice != null ? Number(p.basePrice) : p.price,
          priceLabel: p.priceLabel,
          imageUrl:
            rawUrl && !rawUrl.startsWith("http")
              ? `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}${rawUrl}`
              : rawUrl || undefined,
          category: p.category ?? p.categorySlug,
        };
      });
      setProducts(list);
      setCategories((prev) => {
        const cats = Array.from(
          new Set(list.map((p) => p.category).filter(Boolean) as string[]),
        );
        return prev.length ? prev : cats;
      });
    } catch {
      setError("Failed to load catalog");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [search, category]);

  useEffect(() => { void load(); }, [load]);

  // ── Load financials ────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadFinancials() {
      try {
        const api = apiB2b();
        const [w, a] = await Promise.all([
          api.get<any>("/api/wallet/employee").catch(() => null),
          api.get<any>("/api/campaigns/me/allocations").catch(() => []),
        ]);
        if (w?.balance != null) setWalletBalance(Number(w.balance));
        const allocList: Allocation[] = Array.isArray(a)
          ? a
          : (a?.allocations ?? []);
        let total = 0, remaining = 0;
        for (const al of allocList) {
          const amt  = Number(al.amount ?? 0);
          const used = Number(al.redeemedAmount ?? 0);
          total     += amt;
          remaining += Math.max(0, amt - used);
        }
        setTotalBudget(total);
        setBudget(remaining);
      } catch {
        setBudget(0);
        setWalletBalance(0);
      }
    }
    void loadFinancials();
  }, []);

  // ── Add to cart ────────────────────────────────────────────────────────────

  async function addToCart(p: Product) {
    setAddBusy(true);
    try {
      await apiB2b().post("/api/cart/items", { productId: p.id, quantity: 1 });
      setAddedId(p.id);
      setTimeout(() => setAddedId(null), 2000);
      setSelected(null);
    } catch {
      setError("Failed to add to cart");
    } finally {
      setAddBusy(false);
    }
  }

  const spent    = totalBudget - (budget ?? 0);
  const spentPct = totalBudget > 0 ? Math.min(100, Math.round((spent / totalBudget) * 100)) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/60">

      {/* ─── Budget Hero ──────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-4 py-7 text-white">
        {/* dot grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/5" />

        <div className="relative mx-auto max-w-6xl flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-purple-200">
              <Gift className="h-3.5 w-3.5" />
              Your Gift Budget
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">
                {budget != null ? fmt(budget) : "..."}
              </span>
              <span className="text-sm text-purple-200">remaining</span>
            </div>

            {totalBudget > 0 && (
              <div className="mt-3 w-60">
                <div className="mb-1 flex justify-between text-[11px] text-purple-200">
                  <span>{fmt(spent)} used</span>
                  <span>{fmt(totalBudget)} total</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-700"
                    style={{ width: `${spentPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start">
            {walletBalance != null && (
              <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
                <p className="text-[11px] text-purple-200">Wallet balance</p>
                <p className="text-lg font-bold">{fmt(walletBalance)}</p>
              </div>
            )}
            <Link
              href="/employee/cart"
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 shadow-lg transition-all hover:scale-105 hover:bg-purple-50"
            >
              <ShoppingCart className="h-4 w-4" />
              View Cart
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">

        {/* ─── Search ─────────────────────────────────────────── */}
        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gifts, categories, occasions..."
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-10 text-sm shadow-sm focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ─── Category Pills ──────────────────────────────────── */}
        {categories.length > 0 && (
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
            <button
              type="button"
              onClick={() => setCategory("")}
              className={
                "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all " +
                (category === ""
                  ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-purple-200 hover:bg-purple-50")
              }
            >
              🎁 All Gifts
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={
                  "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium capitalize transition-all " +
                  (category === c
                    ? "bg-purple-600 text-white shadow-md shadow-purple-200"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-purple-200 hover:bg-purple-50")
                }
              >
                {catEmoji(c)} {c}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button
              className="ml-2 underline"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ─── Products Grid ───────────────────────────────────── */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse overflow-hidden rounded-xl bg-white shadow-sm">
                <div className="aspect-square bg-gray-200" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-3/4 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-medium text-gray-500">No gifts available</p>
            <p className="text-sm text-gray-400">
              {search
                ? `No results for "${search}" — try a different keyword`
                : "Check back soon for new additions!"}
            </p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="mt-3 text-sm text-purple-600 hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <div
                key={p.id}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-purple-100"
                onClick={() => setSelected(p)}
              >
                {/* Image */}
                <div className="relative aspect-square overflow-hidden bg-gray-50">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">🎁</div>
                  )}

                  {/* Category badge */}
                  {p.category && (
                    <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium capitalize text-gray-600 backdrop-blur-sm shadow-sm">
                      {catEmoji(p.category)} {p.category}
                    </div>
                  )}

                  {/* Added confirmation */}
                  {addedId === p.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-purple-600/90 text-white">
                      <div className="text-center">
                        <div className="text-2xl">✓</div>
                        <div className="mt-1 text-xs font-semibold">Added to cart!</div>
                      </div>
                    </div>
                  )}

                  {/* Hover overlay */}
                  {addedId !== p.id && (
                    <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-purple-900/90 via-purple-800/70 to-transparent py-3 text-center text-xs font-semibold text-white transition-transform duration-300 group-hover:translate-y-0">
                      View & Add to Cart →
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium text-gray-800 leading-snug">
                    {p.title}
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-purple-700">
                    {p.priceLabel ?? (p.price != null ? fmt(p.price) : "—")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Product Detail Drawer ────────────────────────────── */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 backdrop-blur-sm sm:items-stretch"
          onClick={() => setSelected(null)}
        >
          <div
            className="flex h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-white sm:h-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                {selected.category && (
                  <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-medium capitalize text-purple-600">
                    {catEmoji(selected.category)} {selected.category}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Product image */}
            <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-gray-50">
              {selected.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.imageUrl}
                  alt={selected.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-7xl">🎁</div>
              )}
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col p-5">
              <h2 className="text-xl font-bold leading-snug text-gray-900">
                {selected.title}
              </h2>
              <div className="mt-1 text-2xl font-bold text-purple-700">
                {selected.priceLabel ??
                  (selected.price != null ? fmt(selected.price) : "—")}
              </div>

              {selected.description && (
                <p className="mt-3 text-sm leading-relaxed text-gray-500">
                  {selected.description}
                </p>
              )}

              {/* Personalization hint */}
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-purple-50 p-3.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
                <p className="text-xs leading-relaxed text-purple-600">
                  This gift can be personalized with your name, a heartfelt message,
                  or custom branding from your company.
                </p>
              </div>

              {/* Budget check */}
              {budget != null && selected.price != null && (
                <div
                  className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium ${
                    budget >= selected.price
                      ? "bg-green-50 text-green-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {budget >= selected.price ? (
                    <>✓ Within your budget — {fmt(budget - selected.price)} will remain</>
                  ) : (
                    <>⚠ Exceeds allocation budget by {fmt(selected.price - budget)}</>
                  )}
                </div>
              )}

              <div className="mt-auto pt-5 space-y-3">
                <button
                  type="button"
                  disabled={addBusy}
                  onClick={() => void addToCart(selected)}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-200 transition-all hover:opacity-90 hover:shadow-xl disabled:opacity-50"
                >
                  {addBusy ? "Adding..." : "Add to Cart 🛒"}
                </button>
                <Link
                  href={`/employee/store/${selected.slug}`}
                  className="flex items-center justify-center gap-1 text-sm text-purple-600 hover:underline"
                >
                  View full details <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

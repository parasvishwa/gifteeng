"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Package,
  AlertCircle,
  RefreshCw,
  Search,
  Check,
  ExternalLink,
  Pencil,
  ChevronDown,
  Layers,
} from "lucide-react";
import { apiB2b } from "../../../../../lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AmazonAccount = {
  id: string;
  name: string;
  marketplace: string;
  isActive: boolean;
};

type ListingSummary = {
  sku: string;
  asin: string;
  title: string;
  status: string[];
  price?: number;
  currency: string;
  quantity: number;
  productType: string;
  imageUrl?: string;
  parentSku?: string;
  childSkus?: string[];
  variationTheme?: string;
  variantAxes?: Record<string, string>;
};

type ListingGroup = {
  /** stable key (parent SKU if child/parent known, else item sku) */
  key: string;
  parent: ListingSummary;
  children: ListingSummary[];
  /** axis-name the children vary on (e.g. "Color", "Size") */
  variationTheme?: string;
};

type CatalogResponse = {
  items: ListingSummary[];
  nextPageToken?: string;
};

type AmazonPreviewResult = {
  asin: string;
  parentAsin?: string;
  title: string;
  descriptionHtml?: string;
  features: string[];
  brand?: string;
  price?: number;
  category?: string;
  images: string[];
  variants: unknown[];
  hasVariants: boolean;
  specs?: Record<string, string>;
};

type ImportState =
  | { kind: "idle" }
  | { kind: "importing" }
  | { kind: "imported"; slug: string }
  | { kind: "error"; message: string };

export type ListingImportContext = {
  asin: string;
  sku: string;
  accountId: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: string[]): { label: string; className: string } {
  const s = status[0]?.toUpperCase() ?? "";
  if (s === "BUYABLE")
    return { label: "BUYABLE", className: "bg-green-50 text-green-700 border-green-200" };
  if (s === "SUPPRESSED")
    return { label: "SUPPRESSED", className: "bg-yellow-50 text-yellow-700 border-yellow-200" };
  return { label: s || "UNKNOWN", className: "bg-gray-100 text-gray-600 border-gray-200" };
}

function formatPrice(price?: number, currency = "INR"): string | null {
  if (price === undefined || price === null) return null;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}

function slugFromTitle(title: string, fallback: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback.toLowerCase();
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

function sanitizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;
  u = u.replace(/&amp;/g, "&").replace(/&#x2F;/g, "/");
  if (u.startsWith("//")) u = "https:" + u;
  if (/^www\./i.test(u)) u = "https://" + u;
  if (!/^(https?:|data:)/i.test(u)) return null;
  try {
    new URL(u);
    return u;
  } catch {
    return null;
  }
}

/**
 * Group a flat listings array into parent/child families using the
 * relationships metadata from SP-API. Standalone listings become groups with
 * no children. If a child's parent isn't on the current page (not loaded or
 * suppressed), we promote the first child as a synthetic parent.
 */
function groupListings(items: ListingSummary[]): ListingGroup[] {
  const groups = new Map<string, ListingGroup>();
  const bySku = new Map<string, ListingSummary>();
  for (const it of items) bySku.set(it.sku, it);

  for (const item of items) {
    // Case A: this item is a CHILD (has parentSku).
    if (item.parentSku) {
      const parentSku = item.parentSku;
      const existing = groups.get(parentSku);
      const realParent = bySku.get(parentSku);
      if (existing) {
        existing.children.push(item);
        if (!existing.variationTheme) existing.variationTheme = item.variationTheme;
      } else {
        const parent = realParent ?? {
          // synthetic parent — use the child as a placeholder
          ...item,
          sku: parentSku,
          title: item.title,
          price: undefined,
          quantity: 0,
        };
        groups.set(parentSku, {
          key: parentSku,
          parent,
          children: [item],
          variationTheme: item.variationTheme,
        });
      }
      continue;
    }

    // Case B: this item is a PARENT (has childSkus).
    if (item.childSkus && item.childSkus.length > 0) {
      const existing = groups.get(item.sku);
      if (existing) {
        existing.parent = item; // real parent replaces synthetic
        if (!existing.variationTheme) existing.variationTheme = item.variationTheme;
      } else {
        groups.set(item.sku, {
          key: item.sku,
          parent: item,
          children: [],
          variationTheme: item.variationTheme,
        });
      }
      continue;
    }

    // Case C: standalone listing (no parent, no children).
    groups.set(item.sku, {
      key: item.sku,
      parent: item,
      children: [],
    });
  }

  // Sort each group's children by title + enrich parent aggregates (price range, qty sum, image)
  const result: ListingGroup[] = [];
  for (const g of groups.values()) {
    g.children.sort((a, b) => a.title.localeCompare(b.title));
    // If parent has no image but a child does, use child's
    if (!g.parent.imageUrl && g.children.length > 0) {
      const withImg = g.children.find((c) => c.imageUrl);
      if (withImg) g.parent = { ...g.parent, imageUrl: withImg.imageUrl };
    }
    result.push(g);
  }
  return result;
}

/** "$X" or "$X – $Y" price-range label. */
// ── Category inference (keyword-based, no AI call) ─────────────────────────
// Maps an Amazon listing title to a Gifteeng-friendly category so we can
// group / filter long import lists without human tagging.
const CATEGORY_RULES: { cat: string; words: string[] }[] = [
  { cat: "Mugs & Drinkware",  words: ["mug", "cup", "tumbler", "sipper", "bottle", "flask"] },
  { cat: "Keychains",         words: ["keychain", "key chain", "key ring", "keyring"] },
  { cat: "Photo Frames",      words: ["photo frame", "picture frame", " frame "] },
  { cat: "Fridge Magnets",    words: ["magnet", "fridge magnet"] },
  { cat: "Wall Decor",        words: ["wall art", "wall decor", "wall hanging", "poster", "wall clock", "wall sticker", "wall piece"] },
  { cat: "Lamps & Lighting",  words: ["lamp", "light", "led"] },
  { cat: "Candles",           words: ["candle", "scented"] },
  { cat: "Pillows & Cushions", words: ["pillow", "cushion"] },
  { cat: "Stationery",        words: ["notebook", "journal", "diary", "planner", "notepad", "pen ", "pencil"] },
  { cat: "Apparel",           words: ["t-shirt", "tshirt", "hoodie", "apparel", "shirt"] },
  { cat: "Door Signs",        words: ["door sign", "name plate", "nameplate", "push pull"] },
  { cat: "Greeting Cards",    words: ["greeting card", "card ", "invitation"] },
  { cat: "Wooden Products",   words: ["wooden", "wood "] },
  { cat: "Acrylic Products",  words: ["acrylic"] },
  { cat: "Corporate Gifts",   words: ["corporate", "office gift", "desk"] },
  { cat: "Hampers & Sets",    words: ["hamper", "gift set", "combo", "set of"] },
  { cat: "Soft Toys",         words: ["teddy", "plush", "soft toy"] },
  { cat: "Calendars & Planners", words: ["calendar", "planner"] },
];

function cacheAge(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function inferCategory(title: string | null | undefined): string {
  const t = (title ?? "").toLowerCase();
  if (!t) return "Other";
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some((w) => t.includes(w))) return rule.cat;
  }
  return "Other";
}

function groupPriceLabel(group: ListingGroup): string | null {
  const prices = [group.parent, ...group.children]
    .map((c) => (typeof c.price === "number" && c.price > 0 ? c.price : null))
    .filter((p): p is number => p !== null);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const currency = group.parent.currency || group.children[0]?.currency || "INR";
  const lo = formatPrice(min, currency);
  if (min === max) return lo;
  const hi = formatPrice(max, currency);
  return `${lo} – ${hi}`;
}

function groupQty(group: ListingGroup): number {
  return [group.parent, ...group.children].reduce(
    (sum, c) => sum + (c.quantity ?? 0),
    0,
  );
}

// ---------------------------------------------------------------------------
// Skeleton cards
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden animate-pulse">
      <div className="h-40 bg-gray-100" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-4/5" />
        <div className="h-3 bg-gray-100 rounded w-1/3 mt-2" />
        <div className="h-7 bg-gray-200 rounded-lg mt-3" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

function GroupCard({
  group,
  state,
  onQuickImport,
  onEditFirst,
  selectMode,
  selected,
  onToggleSelect,
}: {
  group: ListingGroup;
  state: ImportState;
  onQuickImport: () => void;
  onEditFirst: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const parent = group.parent;
  const hasVariants = group.children.length > 0;
  const badge = statusBadge(parent.status);
  const priceLabel = groupPriceLabel(group);
  const totalQty = groupQty(group);

  return (
    <div
      className={`rounded-xl border overflow-hidden flex flex-col transition-all ${
        selected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-gray-200 bg-white"
      } ${selectMode ? "cursor-pointer" : ""}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      {/* Image */}
      <div className="h-40 bg-gray-50 flex items-center justify-center overflow-hidden relative">
        {parent.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={parent.imageUrl}
            alt={parent.title}
            className="h-full w-full object-contain"
          />
        ) : (
          <Package className="h-12 w-12 text-gray-300" />
        )}
        {selectMode && (
          <div
            className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 transition-all ${
              selected
                ? "bg-primary border-primary shadow-md"
                : "bg-white/80 border-gray-300 text-transparent"
            }`}
          >
            ✓
          </div>
        )}
        {hasVariants && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
            <Layers className="h-2.5 w-2.5" />
            {group.children.length} variants
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 gap-1.5">
        <p
          className="text-sm font-medium text-gray-900 leading-snug"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {parent.title}
        </p>

        <p className="font-mono text-xs text-gray-400">
          {hasVariants ? `SKU: ${parent.sku}` : parent.asin}
        </p>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          {priceLabel ? (
            <span className="text-sm font-semibold text-gray-800">{priceLabel}</span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
          <span className="text-xs text-gray-500">
            Qty: <span className="font-medium text-gray-700">{totalQty}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          {group.variationTheme && (
            <span className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
              {group.variationTheme}
            </span>
          )}
        </div>

        {/* Variants accordion */}
        {hasVariants && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-black"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
            {expanded ? "Hide" : "Show"} {group.children.length} variants
          </button>
        )}
        {expanded && hasVariants && (
          <ul className="mt-1 space-y-1 rounded-md border border-gray-100 bg-gray-50 p-2 text-xs">
            {group.children.map((c) => {
              const axes = c.variantAxes
                ? Object.entries(c.variantAxes)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : null;
              return (
                <li
                  key={c.sku}
                  className="flex items-center justify-between gap-2 border-b border-gray-100 py-1 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-gray-800">
                      {axes || c.title}
                    </p>
                    <p className="font-mono text-[10px] text-gray-400">
                      {c.sku}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] font-semibold text-gray-700">
                      {formatPrice(c.price, c.currency) ?? "—"}
                    </p>
                    <p className="text-[10px] text-gray-400">Qty {c.quantity}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Action row */}
        {state.kind === "imported" ? (
          <div className="mt-auto space-y-1 pt-1">
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              Imported as draft
            </div>
            <a
              href={`/super-admin/products/${state.slug}`}
              className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-3 w-3" />
              Open editor
            </a>
          </div>
        ) : state.kind === "importing" ? (
          <button
            disabled
            className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-black/80 px-3 py-1.5 text-xs font-medium text-white"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Importing…
          </button>
        ) : (
          <div className="mt-auto space-y-1 pt-1">
            <button
              onClick={(e) => { e.stopPropagation(); if (!selectMode) onQuickImport(); }}
              disabled={selectMode}
              className="w-full rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {hasVariants ? "Import product + variants" : "Import as draft"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); if (!selectMode) onEditFirst(); }}
              disabled={selectMode}
              className="w-full flex items-center justify-center gap-1 text-[11px] text-gray-500 hover:text-black hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Pencil className="h-2.5 w-2.5" />
              Edit before importing
            </button>
            {state.kind === "error" && (
              <p className="text-[10px] text-red-600">{state.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function AmazonListingsTab({
  client,
  onEditFirst,
}: {
  client: ReturnType<typeof apiB2b>;
  /** Callback when user clicks "Edit before importing" — routes to ASIN tab. */
  onEditFirst: (asin: string) => void;
}) {
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accounts, setAccounts] = useState<AmazonAccount[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // ── Persisted state (survives back/navigation AND tab close) ───────────
  // We keep items + fetched flag + filter + account + importStates in
  // localStorage so refreshing the browser or coming back tomorrow doesn't
  // force a full reload of the Amazon catalog.
  const PERSIST_KEY = "gifteeng.amazon-import.state.v2";
  // Auto-migrate from the old sessionStorage key (v1) for users upgrading
  if (typeof window !== "undefined") {
    try {
      const hasV2 = localStorage.getItem(PERSIST_KEY);
      const v1 = sessionStorage.getItem("gifteeng.amazon-import.state.v1");
      if (!hasV2 && v1) {
        localStorage.setItem(PERSIST_KEY, v1);
        sessionStorage.removeItem("gifteeng.amazon-import.state.v1");
      }
    } catch { /* no-op */ }
  }
  const loadPersisted = (): Partial<{
    selectedAccountId: string;
    filterText: string;
    items: ListingSummary[];
    nextPageToken?: string;
    hasFetched: boolean;
    importStates: Record<string, ImportState>;
    sortKey: "default" | "title" | "priceAsc" | "priceDesc" | "stockDesc" | "importedFirst";
    categoryFilter: string;
    statusFilter: "all" | "imported" | "not-imported";
    groupByCategory: boolean;
    loadedAt: number;
  }> => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch { return {}; }
  };
  const initialPersisted = loadPersisted();
  const [loadedAt, setLoadedAt] = useState<number | null>(initialPersisted.loadedAt ?? null);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialPersisted.selectedAccountId ?? "");
  const [filterText, setFilterText] = useState(initialPersisted.filterText ?? "");
  const [items, setItems] = useState<ListingSummary[]>(initialPersisted.items ?? []);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(initialPersisted.nextPageToken);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(!!initialPersisted.hasFetched);

  // Per-SKU import state (idle/importing/imported/error)
  const [importStates, setImportStates] = useState<Record<string, ImportState>>(
    initialPersisted.importStates ?? {},
  );

  // ── Sort / category / status filter state ─────────────────────────────
  type SortKey = "default" | "title" | "priceAsc" | "priceDesc" | "stockDesc" | "importedFirst";
  const [sortKey, setSortKey] = useState<SortKey>(initialPersisted.sortKey ?? "default");
  const [categoryFilter, setCategoryFilter] = useState<string>(initialPersisted.categoryFilter ?? "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "imported" | "not-imported">(initialPersisted.statusFilter ?? "all");
  const [groupByCategory, setGroupByCategory] = useState<boolean>(!!initialPersisted.groupByCategory);

  // ── Multi-select state ──────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  // Rich "Edit before importing" state — opens a modal where the admin picks
  // images, tweaks title/description/category/price before committing.
  const [editingGroup, setEditingGroup] = useState<ListingGroup | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [mergeDialog, setMergeDialog] = useState(false);
  const [mergeImporting, setMergeImporting] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ ok: boolean; message: string; slug?: string } | null>(null);

  // Persist important slices to localStorage (survives tab close + reload)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        selectedAccountId,
        filterText,
        items,
        nextPageToken,
        hasFetched,
        importStates,
        sortKey,
        categoryFilter,
        statusFilter,
        groupByCategory,
        loadedAt,
      }));
    } catch (err) {
      // Quota-exceeded on very large catalogs: strip heavy fields and retry
      try {
        const compact = items.map((it: any) => ({
          sku: it.sku, asin: it.asin, title: it.title, imageUrl: it.imageUrl,
          price: it.price, currency: it.currency, status: it.status,
          quantity: it.quantity, productType: it.productType,
          parentSku: it.parentSku, variantAxes: it.variantAxes,
        }));
        localStorage.setItem(PERSIST_KEY, JSON.stringify({
          selectedAccountId, filterText, items: compact, nextPageToken,
          hasFetched, importStates, sortKey, categoryFilter, statusFilter,
          groupByCategory, loadedAt,
        }));
      } catch { /* give up silently */ }
    }
  }, [selectedAccountId, filterText, items, nextPageToken, hasFetched, importStates, sortKey, categoryFilter, statusFilter, groupByCategory, loadedAt]);

  // Fetch accounts on mount
  useEffect(() => {
    let cancelled = false;
    setAccountsLoading(true);
    setAccountsError(null);

    client
      .get<AmazonAccount[]>("/api/amazon-sp/accounts")
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setAccounts(list);
        if (list.length > 0) setSelectedAccountId(list[0].id);
      })
      .catch((err: { body?: { message?: string }; message?: string }) => {
        if (cancelled) return;
        setAccountsError(err.body?.message ?? err.message ?? "Failed to load accounts");
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch a single page and return the raw response so callers can chain
  // pages (needed for "Load All" without relying on stale nextPageToken state).
  async function fetchPage(pageToken?: string): Promise<CatalogResponse | null> {
    if (!selectedAccountId) return null;
    const params = new URLSearchParams({ accountId: selectedAccountId });
    if (pageToken) params.set("pageToken", pageToken);
    return client.get<CatalogResponse>(`/api/amazon-sp/listings?${params.toString()}`);
  }

  async function loadCatalog(pageToken?: string) {
    if (!selectedAccountId) return;
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const data = await fetchPage(pageToken);
      if (!data) return;
      setItems((prev) => pageToken ? [...prev, ...(data.items ?? [])] : (data.items ?? []));
      setNextPageToken(data.nextPageToken);
      setHasFetched(true);
      setLoadedAt(Date.now());
    } catch (err) {
      const e = err as { body?: { message?: string }; message?: string };
      setCatalogError(e.body?.message ?? e.message ?? "Failed to load catalog");
    } finally {
      setCatalogLoading(false);
    }
  }

  // ── Load ALL pages at once (loops until no more pageToken) ────────────
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadAllProgress, setLoadAllProgress] = useState({ pages: 0, total: 0 });

  async function loadAll(fromToken?: string) {
    if (!selectedAccountId || loadingAll) return;
    setLoadingAll(true);
    setCatalogError(null);
    // Reset to start if no fromToken provided (user clicked "Load All" fresh)
    if (!fromToken) {
      setItems([]);
      setNextPageToken(undefined);
    }
    try {
      let token: string | undefined = fromToken;
      let pageNum = fromToken ? (loadAllProgress.pages || 1) : 0;
      let runningTotal = fromToken ? items.length : 0;
      let safetyGuard = 0;
      // 500 pages × typical 20/page = up to 10,000 SKUs. Amazon caps most
      // accounts well below this, so we will stop naturally when the API
      // returns no nextPageToken.
      const MAX_PAGES = 500;
      do {
        pageNum += 1;
        const data: CatalogResponse | null = await fetchPage(token);
        if (!data) break;
        const batch = data.items ?? [];
        runningTotal += batch.length;
        setItems((prev) =>
          pageNum === 1 && !fromToken ? batch : [...prev, ...batch],
        );
        setNextPageToken(data.nextPageToken);
        setHasFetched(true);
        setLoadAllProgress({ pages: pageNum, total: runningTotal });
        token = data.nextPageToken;
        safetyGuard += 1;
        if (safetyGuard >= MAX_PAGES) break;
        // Tiny delay to avoid SP-API throttling (Amazon allows ~10 req/s).
        if (token) await new Promise((r) => setTimeout(r, 120));
      } while (token);
      setLoadedAt(Date.now());
    } catch (err) {
      const e = err as { body?: { message?: string }; message?: string };
      setCatalogError(e.body?.message ?? e.message ?? "Load all failed");
    } finally {
      setLoadingAll(false);
    }
  }

  function handleLoadMore() {
    if (nextPageToken) loadCatalog(nextPageToken);
  }

  function handleRefresh() {
    setItems([]);
    setNextPageToken(undefined);
    setHasFetched(false);
    setFilterText("");
    setImportStates({});
    setLoadAllProgress({ pages: 0, total: 0 });
    loadCatalog();
  }

  /**
   * One-click quick import: fetches rich listing preview (title, description,
   * bullets, images, price) from Listings Items API and commits as a draft
   * product — no multi-step preview flow, no tab switch. When the group has
   * children, all variants are rolled into the product's variantOptions[].
   */
  async function quickImportGroup(
    group: ListingGroup,
    overrides?: {
      title?: string;
      description?: string | null;
      category?: string;
      images?: Array<{ url: string; alt?: string; order: number }>;
      basePrice?: number;
    },
  ) {
    if (!selectedAccountId) return;
    const item = group.parent;
    const key = group.key;
    setImportStates((s) => ({ ...s, [key]: { kind: "importing" } }));

    try {
      // 1. Try rich preview from Listings Items API (title/desc/bullets/images/price).
      //    If it fails, fall back to just the list-view summary we already have —
      //    we still create a usable draft that the user can enrich in the editor.
      let preview: AmazonPreviewResult | null = null;
      try {
        const params = new URLSearchParams({
          accountId: selectedAccountId,
          sku: item.sku,
        });
        preview = await client.get<AmazonPreviewResult>(
          `/api/amazon-sp/listing-preview?${params.toString()}`,
        );
      } catch {
        // Preview failed (SP-API 4xx, account mismatch, etc.) — proceed with
        // list-view data only. Better to import a sparse draft than to block
        // the user entirely.
        preview = null;
      }

      // 2. Build draft payload (prefer overrides → preview → list summary)
      const title = overrides?.title || preview?.title || item.title || item.asin;

      const descRaw =
        preview?.descriptionHtml ||
        (preview && preview.features.length > 0
          ? `<ul>${preview.features.map((f) => `<li>${f}</li>`).join("")}</ul>`
          : null);
      const description = overrides?.description !== undefined ? overrides.description : (descRaw || null);

      const cleanImages = overrides?.images ?? (preview?.images ?? [])
        // Allow the full carousel (angle/lifestyle/scale shots). Was 8.
        .slice(0, 15)
        .map((u) => sanitizeUrl(u))
        .filter((u): u is string => !!u)
        .map((url, i) => ({ url, alt: title, order: i }));

      // Fallback: if preview returned no images, use the thumbnail from list view
      if (cleanImages.length === 0 && item.imageUrl) {
        const u = sanitizeUrl(item.imageUrl);
        if (u) cleanImages.push({ url: u, alt: title, order: 0 });
      }

      // Force number coercion — SP-API sometimes returns price as a string
      // ("239.00") inside nested purchasable_offer shapes, and zod on the
      // server strictly rejects non-number types.
      // For groups with variants: basePrice = min child price (cheapest
      // variant is default); children with higher prices get priceDelta.
      const childPrices = group.children
        .map((c) => (typeof c.price === "number" ? c.price : null))
        .filter((p): p is number => p !== null && Number.isFinite(p));
      const minChildPrice = childPrices.length > 0 ? Math.min(...childPrices) : null;

      const rawPrice =
        overrides?.basePrice ?? minChildPrice ?? preview?.price ?? item.price ?? 0;
      const basePrice = Number(rawPrice);
      const safeBasePrice = Number.isFinite(basePrice) ? basePrice : 0;
      const totalQty = group.children.length > 0
        ? group.children.reduce((sum, c) => sum + (c.quantity ?? 0), 0)
        : Number(item.quantity ?? 0);
      const safeInventory = Number.isFinite(totalQty) ? Math.max(0, Math.trunc(totalQty)) : 0;

      // Build variantOptions[] from children axes. Each child contributes one
      // variant row per axis (e.g. Color=Red, Size=L → two rows). Dedup by
      // name+value across siblings.
      const variants: Array<{
        name: string;
        value: string;
        priceDelta: number;
        sku?: string;
        image?: string;
      }> = [];
      const seen = new Set<string>();
      for (const child of group.children) {
        const childPrice = Number(child.price ?? safeBasePrice);
        const delta = Number.isFinite(childPrice) ? childPrice - safeBasePrice : 0;
        const axes = child.variantAxes ?? {};
        // If no axes parsed, use the child title suffix as a fallback value
        if (Object.keys(axes).length === 0) {
          const fallbackName = group.variationTheme || "Variant";
          const fallbackValue = child.title.replace(/^.*\|\s*/, "").trim() || child.sku;
          const key = `${fallbackName}|${fallbackValue}`;
          if (!seen.has(key)) {
            seen.add(key);
            variants.push({
              name: fallbackName,
              value: fallbackValue,
              priceDelta: delta,
              sku: child.sku,
              image: child.imageUrl,
            });
          }
          continue;
        }
        for (const [axisName, axisValue] of Object.entries(axes)) {
          const key = `${axisName}|${axisValue}`;
          if (seen.has(key)) continue;
          seen.add(key);
          variants.push({
            name: axisName,
            value: axisValue,
            priceDelta: Math.round(delta),
            sku: child.sku,
            image: child.imageUrl,
          });
        }
      }

      const slug = slugFromTitle(title, item.asin || item.sku);

      // Coerce spec values to strings — server schema expects specs as
      // Record<string,string> but some raw values can be numbers/booleans.
      const rawSpecs = preview?.specs ?? {};
      const cleanSpecs: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawSpecs)) {
        if (v === null || v === undefined) continue;
        const s = String(v).trim();
        if (s) cleanSpecs[k] = s;
      }

      const draft = {
        slug,
        title,
        description,
        category: overrides?.category ?? preview?.category ?? "gifts",
        basePrice: safeBasePrice,
        currency: item.currency || "INR",
        // Prefer the seller's own SKU (the one they set up in Seller Central);
        // fall back to ASIN only when SKU is missing. Earlier we stored the
        // ASIN which made admin SKU lookups useless. The Amazon ASIN stays
        // on `metadata.asin` for cross-reference.
        sku: item.sku || preview?.asin || item.asin,
        inventory: safeInventory,
        isCustomizable: false,
        b2cEnabled: true,
        b2bEnabled: false,
        images: cleanImages,
        variants,
        metadata: {
          source: "amazon",
          asin: preview?.asin || item.asin,
          brand: preview?.brand ?? null,
          bullets: preview?.features ?? [],
          specs: cleanSpecs,
          sellerSku: item.sku,
          accountId: selectedAccountId,
          productType: item.productType,
          variationTheme: group.variationTheme ?? null,
          childSkus: group.children.map((c) => c.sku),
          previewEnriched: preview !== null,
          importedAt: new Date().toISOString(),
        },
      };

      // 3. Commit
      const res = await client.post<{ committed?: { slug: string }[] }>(
        "/api/imports/commit",
        { drafts: [draft] },
      );
      const committedSlug = res.committed?.[0]?.slug ?? slug;

      setImportStates((s) => ({
        ...s,
        [key]: { kind: "imported", slug: committedSlug },
      }));
    } catch (err) {
      const e = err as {
        status?: number;
        body?: { message?: string; errors?: { fieldErrors?: Record<string, string[]> } };
        message?: string;
      };
      const parts: string[] = [];
      if (e.body?.message) parts.push(e.body.message);
      if (e.body?.errors?.fieldErrors) {
        for (const [field, msgs] of Object.entries(e.body.errors.fieldErrors)) {
          if (Array.isArray(msgs) && msgs.length) parts.push(`${field}: ${msgs.join(", ")}`);
        }
      }
      const detail = parts.length ? parts.join(" — ") : e.message ?? "Import failed";
      setImportStates((s) => ({ ...s, [key]: { kind: "error", message: detail } }));
    }
  }

  // ── Multi-select helpers ────────────────────────────────────────────────
  function toggleSelectMode() {
    setSelectMode((m) => {
      const next = !m;
      if (!next) setSelectedKeys(new Set());
      return next;
    });
  }
  function toggleOne(key: string) {
    setSelectedKeys((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }
  function selectAllVisible() {
    setSelectedKeys(new Set(filteredGroupsLocal().map((g) => g.key)));
  }
  function clearSelection() {
    setSelectedKeys(new Set());
  }
  function filteredGroupsLocal(): ListingGroup[] {
    const groups = groupListings(items);
    if (!filterText.trim()) return groups;
    const q = filterText.toLowerCase();
    return groups.filter((g) => {
      const hay = [g.parent.title, g.parent.asin, g.parent.sku, ...g.children.map((c) => c.title), ...g.children.map((c) => c.asin), ...g.children.map((c) => c.sku)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  // ── Merge multiple Amazon products into ONE Gifteeng product ────────────
  async function mergeImportSelected(opts: {
    mode: "merge" | "separate";
    variantAttribute: string;  // e.g. "Design", "Color", "Style"
    brand: string;
    category: string;
    collection: string;
    title?: string;             // only for merge mode
    labels?: Record<string, string>; // groupKey → short variant label (merge mode)
  }) {
    if (!selectedAccountId) return;
    const groups = groupListings(items).filter((g) => selectedKeys.has(g.key));
    if (groups.length === 0) return;

    setMergeImporting(true);
    setMergeResult(null);

    try {
      if (opts.mode === "separate") {
        // Import each group as its own product, applying the shared brand /
        // category / collection metadata.
        for (const g of groups) {
          // Pre-set the importState so the card reflects progress
          setImportStates((s) => ({ ...s, [g.key]: { kind: "importing" } }));
        }
        const drafts: any[] = [];
        for (const g of groups) {
          const item = g.parent;
          const title = item.title || item.asin;
          const rawPrice = typeof item.price === "number" ? item.price : 0;
          const images = item.imageUrl
            ? [{ url: item.imageUrl, alt: title, order: 0 }]
            : [];
          drafts.push({
            slug: slugFromTitle(title, item.asin || item.sku),
            title,
            description: null,
            category: opts.category || "gifts",
            basePrice: Number(rawPrice) || 0,
            currency: item.currency || "INR",
            sku: item.asin || item.sku,
            inventory: Number(item.quantity ?? 0) || 0,
            isCustomizable: false,
            b2cEnabled: true,
            b2bEnabled: false,
            images,
            variants: [],
            metadata: {
              source: "amazon-bulk",
              asin: item.asin,
              brand: opts.brand || null,
              collection: opts.collection || null,
              sellerSku: item.sku,
              accountId: selectedAccountId,
              importedAt: new Date().toISOString(),
            },
          });
        }
        const res = await client.post<{ committed?: { slug: string }[] }>("/api/imports/commit", { drafts });
        const count = res.committed?.length ?? 0;
        for (const g of groups) {
          const committedSlug = res.committed?.find((c) => c.slug.startsWith(slugFromTitle(g.parent.title || g.parent.asin, g.parent.asin || g.parent.sku)))?.slug;
          setImportStates((s) => ({ ...s, [g.key]: { kind: "imported", slug: committedSlug ?? g.key } }));
        }
        setMergeResult({ ok: true, message: `Imported ${count} products` });
      } else {
        // MERGE mode: build ONE draft product with N variant rows — each
        // variant uses the source product's title as the variant value, the
        // source product's image as the variant image, and priceDelta from
        // the min base price.
        const prices = groups.map((g) => Number(g.parent.price ?? 0)).filter((p) => Number.isFinite(p) && p > 0);
        const basePrice = prices.length > 0 ? Math.min(...prices) : 0;

        const variants = groups.map((g, i) => {
          const p = g.parent;
          const unit = Number(p.price ?? basePrice);
          const delta = Number.isFinite(unit) ? unit - basePrice : 0;
          // Prefer the user-edited short label; fall back to auto-generated
          // "Design 1/2/3…" (never the long Amazon title).
          const userLabel = opts.labels?.[g.key]?.trim();
          const label = userLabel || `${opts.variantAttribute || "Design"} ${i + 1}`;
          return {
            name: opts.variantAttribute || "Design",
            value: label,
            priceDelta: Math.max(0, Math.round(delta)),
            sku: p.sku,
            image: sanitizeUrl(p.imageUrl) ?? undefined,
          };
        });

        // Hero images = the variant thumbnails so the main gallery cycles
        // through all variants (this is also the "main image as variation
        // design thumbnail" behaviour requested).
        const images = groups
          .map((g) => sanitizeUrl(g.parent.imageUrl))
          .filter((u): u is string => !!u)
          .map((url, i) => ({ url, alt: opts.title || groups[0]!.parent.title, order: i }));

        const mergedTitle =
          opts.title?.trim() ||
          `${opts.brand ? opts.brand + " — " : ""}${groups[0]!.parent.title?.split("—")[0]?.trim() || "Collection"}`;

        const totalInventory = groups.reduce((sum, g) => sum + (Number(g.parent.quantity ?? 0) || 0), 0);

        const draft = {
          slug: slugFromTitle(mergedTitle, groups[0]!.parent.asin || "merged"),
          title: mergedTitle,
          description: null,
          category: opts.category || "gifts",
          basePrice,
          currency: groups[0]!.parent.currency || "INR",
          sku: groups[0]!.parent.asin || groups[0]!.parent.sku,
          inventory: totalInventory,
          isCustomizable: false,
          b2cEnabled: true,
          b2bEnabled: false,
          images,
          variants,
          metadata: {
            source: "amazon-merge",
            brand: opts.brand || null,
            collection: opts.collection || null,
            mergedAsins: groups.map((g) => g.parent.asin),
            mergedSkus: groups.map((g) => g.parent.sku),
            variantAttribute: opts.variantAttribute || "Design",
            accountId: selectedAccountId,
            importedAt: new Date().toISOString(),
          },
        };

        const res = await client.post<{ committed?: { slug: string }[] }>("/api/imports/commit", { drafts: [draft] });
        const slug = res.committed?.[0]?.slug ?? draft.slug;

        for (const g of groups) {
          setImportStates((s) => ({ ...s, [g.key]: { kind: "imported", slug } }));
        }
        setMergeResult({ ok: true, message: `Merged into 1 product`, slug });
      }
      // Exit select mode on success
      setMergeDialog(false);
      setSelectMode(false);
      setSelectedKeys(new Set());
    } catch (err) {
      const e = err as { body?: { message?: string }; message?: string };
      setMergeResult({ ok: false, message: e.body?.message ?? e.message ?? "Import failed" });
      for (const key of selectedKeys) {
        setImportStates((s) => ({ ...s, [key]: { kind: "error", message: e.body?.message ?? "Merge failed" } }));
      }
    } finally {
      setMergeImporting(false);
    }
  }

  // Group into parent/child families + attach inferred category
  const groups = useMemo(() => {
    return groupListings(items).map((g) => ({
      ...g,
      _category: inferCategory(g.parent.title),
    }));
  }, [items]);

  // Available category chips + counts
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const g of groups) {
      map[g._category] = (map[g._category] ?? 0) + 1;
    }
    return map;
  }, [groups]);
  const categoryList = useMemo(
    () => Object.keys(categoryCounts).sort((a, b) => categoryCounts[b]! - categoryCounts[a]!),
    [categoryCounts],
  );

  // Apply search → category filter → status filter → sort
  const filteredGroups = useMemo(() => {
    let out = groups;

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      out = out.filter((g) => {
        const hay = [
          g.parent.title, g.parent.asin, g.parent.sku,
          ...g.children.map((c) => c.title),
          ...g.children.map((c) => c.asin),
          ...g.children.map((c) => c.sku),
        ].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }
    if (categoryFilter !== "all") {
      out = out.filter((g) => g._category === categoryFilter);
    }
    if (statusFilter !== "all") {
      out = out.filter((g) => {
        const imported = importStates[g.key]?.kind === "imported";
        return statusFilter === "imported" ? imported : !imported;
      });
    }

    // Sort
    const sorted = [...out];
    if (sortKey === "title") {
      sorted.sort((a, b) => (a.parent.title || "").localeCompare(b.parent.title || ""));
    } else if (sortKey === "priceAsc") {
      sorted.sort((a, b) => (Number(a.parent.price ?? Infinity)) - (Number(b.parent.price ?? Infinity)));
    } else if (sortKey === "priceDesc") {
      sorted.sort((a, b) => (Number(b.parent.price ?? -Infinity)) - (Number(a.parent.price ?? -Infinity)));
    } else if (sortKey === "stockDesc") {
      sorted.sort((a, b) => groupQty(b) - groupQty(a));
    } else if (sortKey === "importedFirst") {
      sorted.sort((a, b) => {
        const ai = importStates[a.key]?.kind === "imported" ? 0 : 1;
        const bi = importStates[b.key]?.kind === "imported" ? 0 : 1;
        return ai - bi;
      });
    }
    return sorted;
  }, [groups, filterText, categoryFilter, statusFilter, sortKey, importStates]);

  // Group filtered list by category for the "grouped" render mode
  const groupedByCategory = useMemo(() => {
    const map: Record<string, typeof filteredGroups> = {};
    for (const g of filteredGroups) {
      const k = g._category;
      if (!map[k]) map[k] = [];
      map[k]!.push(g);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [filteredGroups]);

  const importedCount = Object.values(importStates).filter(
    (s) => s.kind === "imported",
  ).length;

  // ------ Render states ------

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading accounts…</span>
      </div>
    );
  }

  if (accountsError) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
        <p className="text-sm text-red-700">{accountsError}</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center px-6">
        <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">No SP-API account connected.</p>
        <p className="text-xs text-gray-500 mt-1">
          Go to{" "}
          <a
            href="/b2b/super-admin/amazon/connect"
            className="underline text-gray-700 hover:text-black"
          >
            Amazon → Connections
          </a>{" "}
          to add one.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rich "Edit before importing" modal — cherry-pick images + tweak copy */}
      {editingGroup && (
        <EditBeforeImportModal
          client={client}
          accountId={selectedAccountId}
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onImport={async (overrides) => {
            const grp = editingGroup;
            setEditingGroup(null);
            if (grp) await quickImportGroup(grp, overrides);
          }}
        />
      )}

      {/* Account selector + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedAccountId}
          onChange={(e) => {
            setSelectedAccountId(e.target.value);
            setItems([]);
            setNextPageToken(undefined);
            setHasFetched(false);
            setFilterText("");
            setImportStates({});
          }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-shadow"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} (amazon.{acc.marketplace})
            </option>
          ))}
        </select>

        <button
          onClick={() => {
            setItems([]);
            setNextPageToken(undefined);
            setHasFetched(false);
            setFilterText("");
            setImportStates({});
            setLoadAllProgress({ pages: 0, total: 0 });
            setTimeout(() => loadCatalog(), 0);
          }}
          disabled={catalogLoading || loadingAll}
          className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {catalogLoading && !hasFetched && <Loader2 className="h-4 w-4 animate-spin" />}
          Load 1 page
        </button>

        <button
          onClick={() => loadAll()}
          disabled={catalogLoading || loadingAll}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          title="Fetch every page from Amazon until done"
        >
          {loadingAll ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading all… p{loadAllProgress.pages} · {loadAllProgress.total} SKUs
            </>
          ) : (
            <>⚡ Load ALL</>
          )}
        </button>

        {hasFetched && !loadingAll && (
          <button
            onClick={handleRefresh}
            disabled={catalogLoading || loadingAll}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        )}

        {/* Cache status — shown when we have cached listings */}
        {hasFetched && items.length > 0 && loadedAt && !loadingAll && !catalogLoading && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span>Cached · {cacheAge(loadedAt)}</span>
            <button
              onClick={() => {
                if (confirm("Clear cached Amazon listings? You'll need to re-load from Amazon.")) {
                  localStorage.removeItem(PERSIST_KEY);
                  setItems([]);
                  setNextPageToken(undefined);
                  setHasFetched(false);
                  setFilterText("");
                  setImportStates({});
                  setLoadAllProgress({ pages: 0, total: 0 });
                  setLoadedAt(null);
                }
              }}
              className="text-[10px] text-gray-400 hover:text-red-500 underline underline-offset-2"
            >
              Clear cache
            </button>
          </span>
        )}

        {/* Client-side filter — shown once items are loaded */}
        {hasFetched && items.length > 0 && (
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter loaded listings…"
              className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-shadow"
            />
          </div>
        )}

        {/* Multi-select toggle */}
        {hasFetched && items.length > 0 && (
          <button
            onClick={toggleSelectMode}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              selectMode
                ? "border-primary bg-primary text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            {selectMode ? "Cancel" : "Multi-select"}
          </button>
        )}
      </div>

      {/* ── Sort / filter toolbar (shown once items are loaded) ── */}
      {hasFetched && items.length > 0 && (
        <div className="space-y-2">
          {/* Top row: sort + group + status chips */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Sort:</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="default">Default (Amazon order)</option>
              <option value="title">Title A → Z</option>
              <option value="priceAsc">Price ↑ (low → high)</option>
              <option value="priceDesc">Price ↓ (high → low)</option>
              <option value="stockDesc">Stock ↓ (most first)</option>
              <option value="importedFirst">Imported first</option>
            </select>

            <span className="h-4 w-px bg-gray-200 mx-1" />

            <button
              onClick={() => setGroupByCategory((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                groupByCategory
                  ? "border-primary bg-primary text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Layers className="w-3 h-3" />
              Group by category
            </button>

            <span className="h-4 w-px bg-gray-200 mx-1" />

            {/* Status chips */}
            {(["all", "not-imported", "imported"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                  statusFilter === s
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s === "all" ? "All" : s === "imported" ? "✓ Imported" : "Not imported"}
              </button>
            ))}
          </div>

          {/* Category chip row */}
          {categoryList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                  categoryFilter === "all"
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All <span className="opacity-60 ml-0.5">({groups.length})</span>
              </button>
              {categoryList.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap ${
                    categoryFilter === c
                      ? "bg-primary text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {c} <span className="opacity-60 ml-0.5">({categoryCounts[c]})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Multi-select action bar */}
      {selectMode && (
        <div
          className="sticky top-4 z-20 flex items-center gap-3 rounded-xl border-2 border-primary bg-white px-4 py-2.5 shadow-md"
        >
          <span className="text-sm font-bold">{selectedKeys.size}</span>
          <span className="text-sm text-gray-600">selected</span>
          <button
            onClick={selectAllVisible}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Select all {filteredGroupsLocal().length}
          </button>
          {selectedKeys.size > 0 && (
            <button onClick={clearSelection} className="text-xs text-gray-500 hover:text-gray-700">
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => setMergeDialog(true)}
            disabled={selectedKeys.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            Import {selectedKeys.size} →
          </button>
        </div>
      )}

      {/* Merge dialog */}
      {mergeDialog && (
        <MergeImportDialog
          groups={groupListings(items).filter((g) => selectedKeys.has(g.key))}
          importing={mergeImporting}
          result={mergeResult}
          onClose={() => {
            setMergeDialog(false);
            setMergeResult(null);
          }}
          onConfirm={mergeImportSelected}
        />
      )}

      {/* Catalog error */}
      {catalogError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{catalogError}</p>
        </div>
      )}

      {/* Initial prompt */}
      {!hasFetched && !catalogLoading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center px-6">
          <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">Your Amazon inventory</p>
          <p className="text-xs text-gray-500 mt-1">
            Click <strong>Load Catalog</strong> to fetch your active listings from Amazon.
          </p>
        </div>
      )}

      {/* Loading skeleton — first load */}
      {catalogLoading && !hasFetched && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state after load */}
      {hasFetched && filteredGroups.length === 0 && !catalogLoading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center px-6">
          <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {filterText
              ? `No listings match "${filterText}".`
              : "No listings found for this account."}
          </p>
        </div>
      )}

      {/* Product grid — flat OR grouped by category */}
      {filteredGroups.length > 0 && (
        <>
          {groupByCategory ? (
            <div className="space-y-6">
              {groupedByCategory.map(([cat, list]) => (
                <section key={cat}>
                  <h3 className="text-sm font-black text-gray-900 mb-2 flex items-center gap-2">
                    {cat}
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                      {list.length}
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {list.map((group) => (
                      <GroupCard
                        key={group.key}
                        group={group}
                        state={importStates[group.key] ?? { kind: "idle" }}
                        onQuickImport={() => quickImportGroup(group)}
                        onEditFirst={() => setEditingGroup(group)}
                        selectMode={selectMode}
                        selected={selectedKeys.has(group.key)}
                        onToggleSelect={() => toggleOne(group.key)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredGroups.map((group) => (
                <GroupCard
                  key={group.key}
                  group={group}
                  state={importStates[group.key] ?? { kind: "idle" }}
                  onQuickImport={() => quickImportGroup(group)}
                  onEditFirst={() => setEditingGroup(group)}
                  selectMode={selectMode}
                  selected={selectedKeys.has(group.key)}
                  onToggleSelect={() => toggleOne(group.key)}
                />
              ))}
              {catalogLoading && hasFetched &&
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonCard key={`sk-${i}`} />
                ))}
            </div>
          )}

          {/* Load more */}
          {nextPageToken && !catalogLoading && !loadingAll && !filterText && (
            <div className="flex justify-center gap-2 pt-2">
              <button
                onClick={handleLoadMore}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Load 1 more page
              </button>
              <button
                onClick={() => loadAll(nextPageToken)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90 transition-colors"
              >
                ⚡ Load ALL remaining
              </button>
            </div>
          )}
          {loadingAll && (
            <div className="flex justify-center pt-2 text-gray-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Page {loadAllProgress.pages} · {loadAllProgress.total} SKUs fetched — still going…
            </div>
          )}

          {catalogLoading && hasFetched && (
            <div className="flex justify-center pt-2 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading more…</span>
            </div>
          )}

          {/* Summary line */}
          {!catalogLoading && (
            <p className="text-center text-xs text-gray-400">
              {filterText
                ? `${filteredGroups.length} of ${groups.length} products`
                : `${groups.length} product${groups.length !== 1 ? "s" : ""} · ${items.length} SKU${items.length !== 1 ? "s" : ""}`}
              {importedCount > 0 && ` · ${importedCount} imported`}
              {nextPageToken && !filterText && " · more available"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Merge / bulk import dialog ───────────────────────────────────────────
// Asks the admin: do you want to MERGE these selected Amazon products into
// ONE Gifteeng product with N variants, or IMPORT them as separate products?
// Plus common metadata: brand, category, collection, variant attribute name.
function MergeImportDialog({
  groups, importing, result, onClose, onConfirm,
}: {
  groups: ListingGroup[];
  importing: boolean;
  result: { ok: boolean; message: string; slug?: string } | null;
  onClose: () => void;
  onConfirm: (opts: {
    mode: "merge" | "separate";
    variantAttribute: string;
    brand: string;
    category: string;
    collection: string;
    title?: string;
    labels?: Record<string, string>;
  }) => Promise<void> | void;
}) {
  const count = groups.length;
  const [mode, setMode] = useState<"merge" | "separate">("merge");
  const [variantAttribute, setVariantAttribute] = useState("Design");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("gifts");
  const [collection, setCollection] = useState("");
  const [title, setTitle] = useState("");

  // Per-variant editable short label (merge mode only).
  // Default: "<Attribute> 1", "<Attribute> 2"… so the catalog stays clean.
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    groups.forEach((g, i) => {
      initial[g.key] = `${variantAttribute} ${i + 1}`;
    });
    return initial;
  });

  // ── Autocomplete suggestions from existing catalog ──────────────────────
  // Fetch distinct variant values already used in the catalog so the user
  // can reuse "America" / "Classic" / "Pattern A" etc. instead of inventing.
  type Suggestion = { value: string };
  const [allSuggestions, setAllSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [activeLabelKey, setActiveLabelKey] = useState<string | null>(null);

  useEffect(() => {
    // Fetch once per variantAttribute change. Uses the existing
    // /product-variant-options endpoint (GET, public list).
    const vt = variantAttribute.trim();
    if (!vt) return;
    if (allSuggestions[vt]) return; // already fetched
    (async () => {
      try {
        const base =
          typeof window !== "undefined"
            ? window.location.origin
            : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "");
        const res = await fetch(
          `${base}/api/product-variant-options?variant_type=${encodeURIComponent(vt)}&pageSize=200`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { value?: string }[];
        const values: Suggestion[] = (Array.isArray(data) ? data : [])
          .map((r) => ({ value: String(r.value ?? "").trim() }))
          .filter((r) => r.value.length > 0);
        setAllSuggestions((s) => ({ ...s, [vt]: values }));
      } catch { /* silent: no autocomplete available */ }
    })();
  }, [variantAttribute, allSuggestions]);

  function suggestionsFor(input: string): Suggestion[] {
    const list = allSuggestions[variantAttribute.trim()] ?? [];
    if (list.length === 0) return [];
    const q = input.trim().toLowerCase();
    if (!q) return list.slice(0, 8); // show top when empty-focus
    return list
      .filter((s) => s.value.toLowerCase().includes(q))
      .slice(0, 8);
  }

  // When the admin picks a different variantAttribute, auto-regen any labels
  // that still match the prior prefix pattern (so they're not stuck with "Design 1").
  useEffect(() => {
    setLabels((prev) => {
      const next: Record<string, string> = { ...prev };
      groups.forEach((g, i) => {
        const cur = next[g.key] ?? "";
        const looksAuto = /^(Design|Color|Size|Style|Material|Theme|Variant)\s+\d+$/.test(cur.trim()) || !cur.trim();
        if (looksAuto) next[g.key] = `${variantAttribute} ${i + 1}`;
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantAttribute]);

  const CATEGORIES = [
    "Personalized Gifts", "Home Decor", "Desk & Daily Use", "Car Accessories",
    "Fashion & Accessories", "Corporate Gifts", "Kids Zone", "Return Gifts",
    "Fridge Magnets", "Business & Office",
  ];
  const ATTRIBUTES = ["Design", "Color", "Size", "Style", "Material", "Theme", "Variant"];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={importing ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {!importing && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
            aria-label="Close"
          >
            ✕
          </button>
        )}

        <div className="p-5 md:p-6">
          {result ? (
            <ResultPanel result={result} onClose={onClose} />
          ) : (
            <>
              {/* Header */}
              <div className="mb-5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary mb-1">
                  Bulk import · {count} selected
                </p>
                <h2 className="text-xl font-black">How should we import these?</h2>
              </div>

              {/* Mode selector — two big cards */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <button
                  type="button"
                  onClick={() => setMode("merge")}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    mode === "merge"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm">Merge into one</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Creates <b>1 product</b> with <b>{count} variants</b>.
                    Each Amazon product becomes a design/color/etc. option.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("separate")}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    mode === "separate"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm">Import separate</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    Creates <b>{count} products</b> — each stands alone.
                    Applies the same brand, category, collection to all.
                  </p>
                </button>
              </div>

              {/* Variant attribute (merge only) */}
              {mode === "merge" && (
                <div className="mb-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5 block">
                    Merge as which variant attribute?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ATTRIBUTES.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setVariantAttribute(a)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                          variantAttribute === a
                            ? "border-primary bg-primary text-white"
                            : "border-gray-300 text-gray-700 hover:border-gray-400"
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                    <input
                      type="text"
                      value={variantAttribute}
                      onChange={(e) => setVariantAttribute(e.target.value)}
                      placeholder="Custom…"
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              {/* Per-variant editable short labels (merge only) */}
              {mode === "merge" && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                      Name each variant ({count})
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const reset: Record<string, string> = {};
                        groups.forEach((g, i) => {
                          reset[g.key] = `${variantAttribute} ${i + 1}`;
                        });
                        setLabels(reset);
                      }}
                      className="text-[10px] font-semibold text-primary hover:underline"
                    >
                      Reset to {variantAttribute} 1, 2, 3…
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {groups.map((g, i) => (
                      <div key={g.key} className="flex items-center gap-2">
                        <div className="shrink-0 w-10 h-10 rounded-md border border-gray-200 bg-white overflow-hidden">
                          {g.parent.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={g.parent.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 relative">
                          <input
                            type="text"
                            value={labels[g.key] ?? ""}
                            onFocus={() => setActiveLabelKey(g.key)}
                            onBlur={() => setTimeout(() => setActiveLabelKey((k) => (k === g.key ? null : k)), 150)}
                            onChange={(e) => setLabels((s) => ({ ...s, [g.key]: e.target.value }))}
                            placeholder={`${variantAttribute} ${i + 1}`}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            autoComplete="off"
                          />
                          {activeLabelKey === g.key && (() => {
                            const sugg = suggestionsFor(labels[g.key] ?? "");
                            if (sugg.length === 0) return null;
                            return (
                              <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                                <p className="px-2 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                  Used before · pick to reuse
                                </p>
                                {sugg.map((s) => (
                                  <button
                                    key={s.value}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setLabels((L) => ({ ...L, [g.key]: s.value }));
                                      setActiveLabelKey(null);
                                    }}
                                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-primary/5 hover:text-primary transition-colors"
                                  >
                                    {s.value}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          <p className="text-[9px] text-gray-400 truncate mt-0.5" title={g.parent.title}>
                            from: {g.parent.title}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-500 mt-2">
                    Tip: Short names like "America" or "Pattern 1" look best on the product page.
                  </p>
                </div>
              )}

              {/* Merged product title (merge only) */}
              {mode === "merge" && (
                <div className="mb-3">
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5 block">
                    Merged product title (optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Leave blank to auto-generate from first product"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              )}

              {/* Common meta: brand, category, collection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5 block">
                    Brand name
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Gifteeng Originals"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5 block">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="gifts">Gifts (default)</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mb-5">
                <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5 block">
                  Collection (optional)
                </label>
                <input
                  type="text"
                  value={collection}
                  onChange={(e) => setCollection(e.target.value)}
                  placeholder="e.g. Diwali 2026, Wedding Specials"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              {/* Preview hint */}
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 mb-5 text-xs text-gray-600">
                {mode === "merge" ? (
                  <>
                    <b>Preview:</b> 1 product named "{title || "auto"}" in category "{category}"
                    {brand && <> · brand "{brand}"</>}
                    {collection && <> · collection "{collection}"</>}
                    <> · {count} variants on "{variantAttribute}"</>
                  </>
                ) : (
                  <>
                    <b>Preview:</b> {count} products in category "{category}"
                    {brand && <> · brand "{brand}"</>}
                    {collection && <> · collection "{collection}"</>}
                  </>
                )}
              </div>

              {/* CTAs */}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={importing}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onConfirm({ mode, variantAttribute, brand, category, collection, title, labels })
                  }
                  disabled={importing || count === 0}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-black text-white bg-primary hover:bg-primary/90 disabled:opacity-50"
                >
                  {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {importing
                    ? "Importing…"
                    : mode === "merge"
                    ? `Merge into 1 product`
                    : `Import ${count} products`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Result panel shown after merge / bulk-import ────────────────────────
// On success we show a brief celebratory state and auto-redirect to the
// product edit page in 1.2s. The user can click "Open now" to skip the
// delay or "Stay here" to import more.
function ResultPanel({
  result, onClose,
}: {
  result: { ok: boolean; message: string; slug?: string };
  onClose: () => void;
}) {
  const [staying, setStaying] = useState(false);

  useEffect(() => {
    if (!result.ok || !result.slug || staying) return;
    const t = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.href = `/b2b/super-admin/products/${result.slug}`;
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [result, staying]);

  return (
    <div className="text-center py-4">
      <div className="text-5xl mb-3">{result.ok ? "🎉" : "😕"}</div>
      <p className="text-xl font-bold">
        {result.ok ? "Import complete!" : "Import failed"}
      </p>
      <p className="text-sm text-gray-600 mt-2">{result.message}</p>

      {result.ok && result.slug ? (
        <>
          <p className="text-xs text-gray-400 mt-3">
            {staying ? "Staying on import page" : "Opening product editor…"}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <a
              href={`/b2b/super-admin/products/${result.slug}`}
              className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-bold hover:bg-primary/90"
            >
              Open now →
            </a>
            <button
              onClick={() => { setStaying(true); onClose(); }}
              className="px-4 py-2.5 rounded-full border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
            >
              Stay here
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-600"
        >
          Close
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit-before-importing modal
// ---------------------------------------------------------------------------
// Loads the full Amazon preview (all carousel images, bullets, description,
// price) and lets the admin cherry-pick which images/text to commit. The
// onImport callback receives overrides and feeds them into quickImportGroup.
function EditBeforeImportModal({ client, accountId, group, onClose, onImport }: {
  client: ReturnType<typeof apiB2b>;
  accountId: string;
  group: ListingGroup;
  onClose: () => void;
  onImport: (overrides: {
    title?: string;
    description?: string | null;
    category?: string;
    images?: Array<{ url: string; alt?: string; order: number }>;
    basePrice?: number;
  }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<AmazonPreviewResult | null>(null);
  const [title, setTitle] = useState(group.parent.title);
  const [description, setDescription] = useState<string>("");
  const [price, setPrice] = useState<string>(String(group.parent.price ?? ""));
  const [category, setCategory] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ accountId, sku: group.parent.sku });
        const p = await client.get<AmazonPreviewResult>(
          `/api/amazon-sp/listing-preview?${params.toString()}`,
        ).catch(() => null);
        if (cancelled) return;
        setPreview(p);
        setTitle(p?.title || group.parent.title);
        const desc = p?.descriptionHtml
          || (p && p.features.length
            ? `<ul>${p.features.map((f) => `<li>${f}</li>`).join("")}</ul>`
            : "");
        setDescription(desc);
        setPrice(String(p?.price ?? group.parent.price ?? ""));
        setCategory(p?.category ?? "");
        const imgs = (p?.images ?? (group.parent.imageUrl ? [group.parent.imageUrl] : [])).slice(0, 15);
        setImageUrls(imgs);
        setSelectedIdx(new Set(imgs.map((_, i) => i)));
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    // Source of truth = DB Category model. Map to active names.
    client.get<Array<{ name: string; isActive?: boolean }>>("/api/categories?pageSize=500")
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        setCategories(list.filter((c) => c.isActive !== false).map((c) => c.name));
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [client, accountId, group]);

  const toggleImage = (i: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const commit = async () => {
    setSaving(true);
    const chosen = imageUrls
      .map((u, i) => ({ u, i }))
      .filter((x) => selectedIdx.has(x.i))
      .map((x, order) => ({ url: x.u, alt: title, order }));
    const parsedPrice = Number(price);
    onImport({
      title: title.trim() || undefined,
      description: description.trim() ? description : null,
      category: category.trim() || undefined,
      images: chosen,
      basePrice: Number.isFinite(parsedPrice) ? parsedPrice : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-3"
      onClick={() => { if (!saving) onClose(); }}>
      <div className="w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Edit before importing</p>
            <p className="text-sm font-semibold truncate">{group.parent.asin} · {group.parent.sku}</p>
          </div>
          <button onClick={onClose} disabled={saving}
            className="w-8 h-8 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading Amazon data…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Images · {selectedIdx.size}/{imageUrls.length} selected
                </p>
                <div className="flex gap-2 text-[11px]">
                  <button onClick={() => setSelectedIdx(new Set(imageUrls.map((_, i) => i)))} className="text-pink-600 hover:underline">All</button>
                  <button onClick={() => setSelectedIdx(new Set())} className="text-zinc-500 hover:underline">None</button>
                </div>
              </div>
              {imageUrls.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">Amazon returned no images for this product.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {imageUrls.map((u, i) => {
                    const sel = selectedIdx.has(i);
                    return (
                      <button key={i} type="button" onClick={() => toggleImage(i)}
                        className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${sel ? "border-pink-500 ring-2 ring-pink-500/30" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" className="w-full h-full object-cover" />
                        {sel && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-pink-500 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
            </label>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Description (HTML allowed)</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs font-mono" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Category</span>
                {/* Dropdown only — matches the master Category DB list. New
                    categories are added in /b2b/super-admin/categories. */}
                <select value={categories.includes(category) ? category : ""}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm">
                  <option value="">— Select a category —</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  {category && !categories.includes(category) && (
                    <option value={category} disabled>⚠ {category} (not in master list)</option>
                  )}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Base price (₹)</span>
                <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm" />
              </label>
            </div>

            {preview?.features && preview.features.length > 0 && (
              <details className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2">
                <summary className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 cursor-pointer">Bullets (kept in metadata)</summary>
                <ul className="mt-1.5 list-disc pl-5 text-xs text-zinc-700 dark:text-zinc-300 space-y-0.5">
                  {preview.features.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button onClick={commit} disabled={saving || loading || selectedIdx.size === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-pink-500 to-fuchsia-600 px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Import with these edits
          </button>
        </div>
      </div>
    </div>
  );
}

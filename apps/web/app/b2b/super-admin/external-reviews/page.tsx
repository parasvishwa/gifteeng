"use client";

/**
 * External Reviews — admin page.
 *
 * Manage marketplace-imported + manually-typed reviews from Amazon, Flipkart,
 * Myntra, Google, etc. Tag each to a product, attach a source logo, set
 * approval state. The /b2c/reviews page surfaces approved + rating>=4.
 */

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquareQuote, Plus, Edit2, Trash2, Check, X, Save,
  Star, Power, ChevronDown, Search, Download, Chrome, Sparkles,
  ChevronRight,
} from "lucide-react";
import { adminGet, adminPost, adminPatch } from "@/lib/admin-api";

const SOURCES = [
  { value: "manual",     label: "✓ Manual (verified)" },
  { value: "amazon",     label: "📦 Amazon" },
  { value: "flipkart",   label: "🛒 Flipkart" },
  { value: "myntra",     label: "👗 Myntra" },
  { value: "google",     label: "G Google" },
  { value: "meesho",     label: "🛍 Meesho" },
  { value: "ajio",       label: "🛒 Ajio" },
  { value: "trustpilot", label: "★ Trustpilot" },
];

const SOURCE_META: Record<string, { label: string; emoji: string }> = {
  amazon:     { label: "Amazon",     emoji: "📦" },
  flipkart:   { label: "Flipkart",   emoji: "🛒" },
  myntra:     { label: "Myntra",     emoji: "👗" },
  google:     { label: "Google",     emoji: "G" },
  meesho:     { label: "Meesho",     emoji: "🛍" },
  ajio:       { label: "Ajio",       emoji: "🛒" },
  trustpilot: { label: "Trustpilot", emoji: "★" },
  manual:     { label: "Verified",   emoji: "✓" },
};

interface Product {
  id: string; slug: string; title: string; images?: unknown;
}

interface ExternalReview {
  id:           string;
  source:       string;        // "amazon" | "flipkart" | "gifteeng" (native) | …
  sourceLogo:   string | null;
  sourceUrl:    string | null;
  rating:       number;
  title:        string | null;
  body:         string;
  author:       string | null;
  authorAvatar: string | null;
  reviewDate:   string | null;
  productId:    string | null;
  isApproved:   boolean;
  sortOrder:    number;
  createdAt:    string;
  product?:     Product | null;
  // Media — surfaced to the admin so they can verify the scrape captured
  // images/video before approving.
  photoUrls?:   string[] | null;
  videoUrl?:    string | null;
  // Marker for native (Gifteeng-customer-submitted) reviews when the admin
  // toggles "All views" — these are read-only here, edits go via /super-admin/reviews.
  isNative?:    boolean;
}

type SortKey   = "newest" | "oldest" | "rating-high" | "rating-low" | "source";
type ViewMode  = "all" | "external" | "native";

// Native review shape from /api/reviews/admin — projected into ExternalReview
// so the unified admin list can render both flavours through the same row.
interface NativeReviewApi {
  id:           string;
  rating:       number;
  title?:       string | null;
  body?:        string;
  text?:        string;
  authorName?:  string | null;
  customer?:    { fullName?: string | null; avatarUrl?: string | null } | null;
  productId?:   string | null;
  product?:     Product | null;
  isApproved?:  boolean;
  approved?:    boolean;
  createdAt?:   string;
  reviewDate?:  string | null;
  photos?:      Array<{ url?: string; caption?: string | null }>;
  photoUrls?:   string[];
  videoUrl?:    string | null;
}

function nativeToRow(n: NativeReviewApi): ExternalReview {
  // Native reviews store media in `photos` (CustomerPhoto rows) with caption
  // "__video__" marking the video. Project that into our flat shape.
  const photoArr = Array.isArray(n.photos) ? n.photos : [];
  const photoUrls = photoArr
    .filter((p) => p?.url && p.caption !== "__video__")
    .map((p) => p.url as string);
  const videoUrl = photoArr.find((p) => p?.caption === "__video__")?.url ?? n.videoUrl ?? null;
  return {
    id:           n.id,
    source:       "gifteeng",
    sourceLogo:   null,
    sourceUrl:    null,
    rating:       n.rating,
    title:        n.title ?? null,
    body:         n.body ?? n.text ?? "",
    author:       n.customer?.fullName ?? n.authorName ?? null,
    authorAvatar: n.customer?.avatarUrl ?? null,
    reviewDate:   n.reviewDate ?? n.createdAt ?? null,
    productId:    n.productId ?? null,
    isApproved:   n.isApproved ?? n.approved ?? false,
    sortOrder:    0,
    createdAt:    n.createdAt ?? new Date().toISOString(),
    product:      n.product ?? null,
    photoUrls:    photoUrls.length > 0 ? photoUrls : (Array.isArray(n.photoUrls) ? n.photoUrls : null),
    videoUrl,
    isNative:     true,
  };
}

export default function ExternalReviewsPage() {
  const [reviews, setReviews]   = useState<ExternalReview[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filterSource, setFilterSource] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "approved" | "pending">("");
  const [view, setView]         = useState<ViewMode>("all");
  const [sortBy, setSortBy]     = useState<SortKey>("newest");
  const [search, setSearch]     = useState("");
  const [editing, setEditing]   = useState<ExternalReview | "new" | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProductId, setBulkProductId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchAll = async () => {
    // External reviews — always pulled when view !== "native".
    const fetchExternal = async (): Promise<ExternalReview[]> => {
      if (view === "native") return [];
      const qs = new URLSearchParams({ limit: "300" });
      if (filterSource && filterSource !== "gifteeng") qs.set("source", filterSource);
      if (filterStatus) qs.set("isApproved", filterStatus === "approved" ? "true" : "false");
      const data = await adminGet<ExternalReview[]>(`/admin/external-reviews?${qs.toString()}`, []);
      return Array.isArray(data) ? data.map((r) => ({ ...r, isNative: false })) : [];
    };

    // Native reviews from /api/reviews/admin — included in "all" and "native"
    // views so super-admins can manage everything from one screen.
    const fetchNative = async (): Promise<ExternalReview[]> => {
      if (view === "external") return [];
      if (filterSource && filterSource !== "" && filterSource !== "gifteeng") return [];
      try {
        const raw = await adminGet<NativeReviewApi[] | { items?: NativeReviewApi[] }>(
          `/reviews/admin?pageSize=300`, [],
        );
        const arr = Array.isArray(raw) ? raw : ((raw as { items?: NativeReviewApi[] })?.items ?? []);
        let mapped = arr.map(nativeToRow);
        if (filterStatus === "approved") mapped = mapped.filter((r) => r.isApproved);
        if (filterStatus === "pending")  mapped = mapped.filter((r) => !r.isApproved);
        return mapped;
      } catch { return []; }
    };

    const [ext, nat] = await Promise.all([fetchExternal(), fetchNative()]);
    setReviews([...ext, ...nat]);
    setSelected(new Set()); // reset selection on filter change
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [filterSource, filterStatus, view]);

  // Bulk products list for product-select dropdowns
  useEffect(() => {
    fetch("/api/products?pageSize=100&page=1").then((r) => r.json()).then((d) => {
      const items = (d.items ?? d ?? []) as Product[];
      setProducts(Array.isArray(items) ? items : []);
    }).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let out = reviews;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        (r.body ?? "").toLowerCase().includes(q) ||
        (r.title ?? "").toLowerCase().includes(q) ||
        (r.author ?? "").toLowerCase().includes(q) ||
        (r.product?.title ?? "").toLowerCase().includes(q)
      );
    }
    // Sorting — the user can re-sort the merged list. We sort a shallow
    // copy so React state stays referentially stable when only the sort key
    // toggles.
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.reviewDate ?? a.createdAt).getTime()
               - new Date(b.reviewDate ?? b.createdAt).getTime();
        case "rating-high":
          return b.rating - a.rating;
        case "rating-low":
          return a.rating - b.rating;
        case "source":
          return (a.source ?? "").localeCompare(b.source ?? "");
        case "newest":
        default:
          return new Date(b.reviewDate ?? b.createdAt).getTime()
               - new Date(a.reviewDate ?? a.createdAt).getTime();
      }
    });
    return sorted;
  }, [reviews, search, sortBy]);

  const toggleApprove = async (r: ExternalReview) => {
    if (r.isNative) {
      // Native reviews approve via the /reviews module
      await adminPost(`/reviews/admin/${r.id}/approve`, { isApproved: !r.isApproved }, {});
    } else {
      await adminPost(`/admin/external-reviews/${r.id}/approve`, { isApproved: !r.isApproved }, {});
    }
    fetchAll();
  };

  const remove = async (r: ExternalReview) => {
    if (r.isNative) {
      alert("Delete native customer reviews from the Reviews admin page.");
      return;
    }
    if (!confirm("Delete this review? This cannot be undone.")) return;
    await fetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/admin/external-reviews/${r.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("gifteeng.b2b.token") ?? ""}` },
    });
    fetchAll();
  };

  // ── Bulk-select helpers ──────────────────────────────────────────────────
  // Selection only applies to external reviews — native ones are managed via
  // the Reviews admin page. We disable the checkbox for native rows.
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => {
    setSelected(new Set(filtered.filter((r) => !r.isNative).map((r) => r.id)));
  };
  const clearSelection = () => setSelected(new Set());

  const bulkAssign = async () => {
    if (selected.size === 0) return;
    if (!bulkProductId) {
      alert("Pick a product to assign to (or '— Untag —').");
      return;
    }
    setBulkBusy(true);
    try {
      await adminPost("/admin/external-reviews/bulk-assign", {
        ids: Array.from(selected),
        productId: bulkProductId === "__none__" ? null : bulkProductId,
      }, {});
      setBulkProductId("");
      await fetchAll();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <MessageSquareQuote className="w-6 h-6 text-[#EF3752]" />
            All Reviews
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Native Gifteeng reviews + imports from Amazon / Flipkart / Myntra / Google in one place.
            Approved reviews with rating ≥ 4 appear on /b2c/reviews and on each product page.
          </p>
        </div>
        <button onClick={() => setEditing("new")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#EF3752] text-white">
          <Plus className="w-3.5 h-3.5" /> New Review
        </button>
      </div>

      {/* ── Chrome extension banner — collapsible install + how-to flow ── */}
      <ExtensionInstallBanner />


      {/* View toggle — All / External / Native */}
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs font-bold">
        {([
          { v: "all",      label: `All (${reviews.length})` },
          { v: "external", label: `External (${reviews.filter((r) => !r.isNative).length})` },
          { v: "native",   label: `Gifteeng (${reviews.filter((r) =>  r.isNative).length})` },
        ] as Array<{ v: ViewMode; label: string }>).map((tab) => (
          <button key={tab.v} onClick={() => setView(tab.v)}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              view === tab.v ? "bg-[#EF3752] text-white" : "text-muted-foreground hover:bg-muted"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters + sort */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by author, title, body, product…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-border text-sm" />
        </div>
        <FilterSelect value={filterSource} onChange={setFilterSource}
          options={[
            { value: "",         label: "All sources" },
            { value: "gifteeng", label: "🎁 Gifteeng (native)" },
            ...SOURCES.map((s) => ({ value: s.value, label: s.label })),
          ]} />
        <FilterSelect value={filterStatus} onChange={(v) => setFilterStatus(v as "" | "approved" | "pending")}
          options={[
            { value: "",         label: "All statuses" },
            { value: "approved", label: "✓ Approved (live)" },
            { value: "pending",  label: "⏳ Pending review" },
          ]} />
        <FilterSelect value={sortBy} onChange={(v) => setSortBy(v as SortKey)}
          options={[
            { value: "newest",      label: "↓ Newest first" },
            { value: "oldest",      label: "↑ Oldest first" },
            { value: "rating-high", label: "★ Rating high → low" },
            { value: "rating-low",  label: "★ Rating low → high" },
            { value: "source",      label: "Source A → Z" },
          ]} />
      </div>

      {/* Bulk action bar — only shows when at least one external row is ticked */}
      {selected.size > 0 && (
        <div className="rounded-xl border-2 border-[#EF3752]/40 bg-[#EF3752]/5 p-3 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold">
            {selected.size} selected
          </span>
          <button onClick={clearSelection}
            className="text-xs underline text-muted-foreground hover:text-foreground">
            Clear
          </button>
          <span className="ml-2 text-xs text-muted-foreground">→ assign to:</span>
          <select value={bulkProductId} onChange={(e) => setBulkProductId(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-card border border-border text-sm">
            <option value="">— Pick a product —</option>
            <option value="__none__">— Untag (no product) —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button onClick={bulkAssign} disabled={bulkBusy || !bulkProductId}
            className="px-3 py-2 rounded-lg bg-[#EF3752] text-white text-xs font-black disabled:opacity-50">
            {bulkBusy ? "Assigning…" : `Assign ${selected.size}`}
          </button>
        </div>
      )}

      {/* Select-all helper above the list */}
      {filtered.some((r) => !r.isNative) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={selectAllVisible}
            className="font-semibold text-[#EF3752] hover:underline">
            Select all visible external ({filtered.filter((r) => !r.isNative).length})
          </button>
        </div>
      )}

      {/* List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {search ? "No reviews match your search." : "No reviews yet."}
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[75vh] overflow-y-auto">
            {filtered.map((r) => (
              <ReviewRow key={r.id} review={r}
                selected={selected.has(r.id)}
                onSelect={() => toggleSelected(r.id)}
                onEdit={() => setEditing(r)}
                onApprove={() => toggleApprove(r)}
                onDelete={() => remove(r)} />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ReviewEditor
          review={editing === "new" ? null : editing}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function ReviewRow({ review, selected, onSelect, onEdit, onApprove, onDelete }: {
  review: ExternalReview;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void; onApprove: () => void; onDelete: () => void;
}) {
  const meta = review.isNative
    ? { label: "Gifteeng", emoji: "🎁" }
    : (SOURCE_META[review.source] ?? { label: review.source, emoji: "★" });
  const photos = Array.isArray(review.photoUrls) ? review.photoUrls : [];
  const hasMedia = photos.length > 0 || !!review.videoUrl;
  return (
    <div className={`px-4 py-3 ${review.isApproved ? "" : "bg-amber-500/5"} ${selected ? "ring-2 ring-[#EF3752]/40" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Bulk-select checkbox — disabled for native rows */}
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          disabled={review.isNative}
          title={review.isNative ? "Native customer reviews — manage in Reviews admin" : "Select for bulk actions"}
          className="mt-1 w-4 h-4 accent-[#EF3752] disabled:opacity-30 disabled:cursor-not-allowed"
        />
        <div className="shrink-0">
          <button onClick={onApprove}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              review.isApproved
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-amber-500/15 text-amber-600"
            }`}
            title={review.isApproved ? "Approved — click to unapprove" : "Pending — click to approve"}>
            {review.isApproved ? <Check className="w-4 h-4" /> : <Power className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{review.author ?? "Anonymous"}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
              review.isNative ? "bg-[#EF3752]/15 text-[#EF3752]" : "bg-muted text-muted-foreground"
            }`}>
              {meta.emoji} {meta.label}
            </span>
            <span className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`w-3 h-3 ${i < review.rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"}`} />
              ))}
            </span>
            {!review.isApproved && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700">PENDING</span>
            )}
          </div>
          {review.title && <p className="font-bold text-sm mt-1">{review.title}</p>}
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{review.body}</p>

          {/* Media strip — review images + an inline video preview thumb */}
          {hasMedia && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {photos.slice(0, 8).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt=""
                    className="h-12 w-12 rounded border border-border object-cover hover:scale-105 transition-transform" />
                </a>
              ))}
              {photos.length > 8 && (
                <span className="text-[10px] text-muted-foreground font-semibold">
                  +{photos.length - 8} more
                </span>
              )}
              {review.videoUrl && (
                <a href={review.videoUrl} target="_blank" rel="noopener noreferrer"
                  className="h-12 w-16 rounded border border-border bg-black/80 text-white flex items-center justify-center text-[10px] font-bold hover:bg-black">
                  ▶ video
                </a>
              )}
            </div>
          )}

          {review.product && (
            <p className="text-[11px] text-muted-foreground mt-1">
              → <strong>{review.product.title}</strong>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={onEdit}
            className="w-8 h-8 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center"
            disabled={review.isNative}
            title={review.isNative ? "Edit native reviews from Reviews admin" : "Edit"}>
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="w-8 h-8 rounded hover:bg-red-500/15 text-red-600 flex items-center justify-center disabled:opacity-30"
            disabled={review.isNative}
            title={review.isNative ? "Delete native reviews from Reviews admin" : "Delete"}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewEditor({ review, products, onClose, onSaved }: {
  review: ExternalReview | null;
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    source:       review?.source       ?? "manual",
    sourceLogo:   review?.sourceLogo   ?? "",
    sourceUrl:    review?.sourceUrl    ?? "",
    rating:       review?.rating       ?? 5,
    title:        review?.title        ?? "",
    body:         review?.body         ?? "",
    author:       review?.author       ?? "",
    authorAvatar: review?.authorAvatar ?? "",
    reviewDate:   review?.reviewDate?.slice(0, 10) ?? "",
    productId:    review?.productId    ?? "",
    isApproved:   review?.isApproved   ?? true,
    sortOrder:    review?.sortOrder    ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.body.trim()) { alert("Body required"); return; }
    setSaving(true);
    const payload = {
      source:       form.source.trim().toLowerCase(),
      sourceLogo:   form.sourceLogo.trim() || null,
      sourceUrl:    form.sourceUrl.trim()  || null,
      rating:       Math.max(1, Math.min(5, form.rating)),
      title:        form.title.trim()        || null,
      body:         form.body.trim(),
      author:       form.author.trim()       || null,
      authorAvatar: form.authorAvatar.trim() || null,
      reviewDate:   form.reviewDate ? new Date(form.reviewDate).toISOString() : null,
      productId:    form.productId || null,
      isApproved:   form.isApproved,
      sortOrder:    form.sortOrder,
    };
    if (review) {
      await adminPatch(`/admin/external-reviews/${review.id}`, payload, {});
    } else {
      await adminPost("/admin/external-reviews", payload, {});
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-bold">{review ? "Edit review" : "Add review"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">

          <Field label="Source *" hint="Where the review came from">
            <select value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm">
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rating *">
              <input type="number" min={1} max={5} value={form.rating}
                onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
            <Field label="Review date">
              <input type="date" value={form.reviewDate}
                onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
          </div>

          <Field label="Author name">
            <input value={form.author}
              onChange={(e) => setForm({ ...form, author: e.target.value })}
              placeholder="e.g. Priya S."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>

          <Field label="Title (optional)">
            <input value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
          </Field>

          <Field label="Body *">
            <textarea value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={4} maxLength={5000}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm resize-none" />
          </Field>

          <Field label="Tag to product (optional)">
            <select value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm">
              <option value="">— None (general review) —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>

          <Field label="Source URL (optional)" hint="Direct link to original review on the source site">
            <input value={form.sourceUrl}
              onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
              placeholder="https://www.amazon.in/gp/customer-reviews/..."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono" />
          </Field>

          <Field label="Source logo URL (optional)" hint="Override the built-in source icon">
            <input value={form.sourceLogo}
              onChange={(e) => setForm({ ...form, sourceLogo: e.target.value })}
              placeholder="https://…/logo.png"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono" />
          </Field>

          <Field label="Author avatar URL (optional)">
            <input value={form.authorAvatar}
              onChange={(e) => setForm({ ...form, authorAvatar: e.target.value })}
              placeholder="https://…/avatar.jpg"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isApproved}
                onChange={(e) => setForm({ ...form, isApproved: e.target.checked })} />
              <span>Approved (visible on /reviews)</span>
            </label>
            <Field label="Sort order">
              <input type="number" value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </Field>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-bold hover:bg-muted">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-[1.5] py-2.5 rounded-lg bg-[#EF3752] text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? "Saving…" : <><Save className="w-4 h-4" /> {review ? "Save" : "Create"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5">
        {label}
        {hint && <span className="ml-1 text-muted-foreground font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function FilterSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-9 py-2 rounded-lg bg-card border border-border text-sm font-medium cursor-pointer">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

// ─── Chrome extension install banner ─────────────────────────────────────────
// Collapsible card explaining how to install the review-grabber extension +
// link to download the latest packaged ZIP. The ZIP lives in /public so it
// ships with the Next.js build.
function ExtensionInstallBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border-2 border-dashed border-[#EF3752]/30 bg-gradient-to-br from-[#EF3752]/5 to-amber-500/5 overflow-hidden">
      {/* Always-visible header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-[#EF3752]/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EF3752]/15 flex items-center justify-center shrink-0">
            <Chrome className="w-5 h-5 text-[#EF3752]" />
          </div>
          <div>
            <h2 className="font-black text-sm flex items-center gap-2">
              Gifteeng Review Grabber
              <span className="text-[9px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                CHROME EXTENSION
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Scrape reviews from Amazon / Flipkart / Myntra / Google in one click → import into Gifteeng
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/gifteeng-review-grabber.zip"
            download
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#EF3752] text-white hover:bg-[#d92d47]"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </a>
          <ChevronRight
            className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        </div>
      </button>

      {/* Expandable instructions */}
      {open && (
        <div className="px-4 pb-5 pt-1 space-y-5 border-t border-[#EF3752]/15">
          {/* Section 1: Install */}
          <Section title="1. Install the extension" icon={Chrome}>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground ml-2">
              <li>Click <strong>Download</strong> above — saves <code className="text-xs bg-card px-1 rounded">gifteeng-review-grabber.zip</code></li>
              <li><strong>Unzip</strong> it somewhere permanent on your computer (e.g. <code className="text-xs bg-card px-1 rounded">~/Desktop/gifteeng-review-grabber/</code>) — Chrome needs the unzipped folder, not the ZIP</li>
              <li>Open <code className="text-xs bg-card px-1 rounded">chrome://extensions</code> in your address bar (works on Edge/Brave too)</li>
              <li>Toggle <strong>Developer mode</strong> ON (top-right corner)</li>
              <li>Click <strong>Load unpacked</strong> → select the unzipped folder</li>
              <li>Pin the extension via the puzzle-piece icon in your toolbar so it's always one click away</li>
            </ol>
          </Section>

          {/* Section 2: First-time setup */}
          <Section title="2. Sign in (one time only)" icon={Star}>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground ml-2">
              <li>Make sure you're logged into <strong>this admin panel</strong> in another tab</li>
              <li>Click the extension icon → click <strong>🔍 Find token from open admin tab</strong></li>
              <li>Done — your admin token is saved (synced to your Chrome profile, not stored anywhere else)</li>
            </ol>
            <p className="text-[11px] text-muted-foreground mt-2 italic">
              The extension will use this token to import reviews directly to Gifteeng. You only need to do this once per device.
            </p>
          </Section>

          {/* Section 3: How to use */}
          <Section title="3. Grab reviews from a marketplace" icon={Sparkles}>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground ml-2">
              <li>Open the marketplace product page (e.g. <code className="text-xs bg-card px-1 rounded">amazon.in/dp/B0XXXX</code>)</li>
              <li>Scroll to the reviews section so they actually render</li>
              <li>For richer scrapes on Amazon, click <strong>"See all reviews"</strong> — gives you many more reviews per page</li>
              <li>Click the extension icon → set <strong>minimum rating</strong> (default 3.5★+) → click <strong>Fetch reviews</strong></li>
              <li>Each review has a checkbox — uncheck the ones you don't want</li>
              <li>(Optional) <strong>Tag to product</strong> — type your Gifteeng product name to link the review</li>
              <li>Click <strong>Import to Gifteeng</strong> — done. Imported reviews appear instantly on <code className="text-xs bg-card px-1 rounded">/b2c/reviews</code>.</li>
            </ol>
          </Section>

          {/* Supported sites */}
          <Section title="Supported sites" icon={Star}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { emoji: "📦", name: "Amazon (.in / .com)" },
                { emoji: "🛒", name: "Flipkart" },
                { emoji: "👗", name: "Myntra" },
                { emoji: "G",  name: "Google Maps" },
              ].map((s) => (
                <div key={s.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border text-xs">
                  <span className="text-base">{s.emoji}</span>
                  <span className="font-bold">{s.name}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              All reviews are filtered to ≥ 3.5★ by default (you can lower the bar in the popup). Photos &amp; videos
              attached to the original review are imported alongside the text.
            </p>
          </Section>

          {/* Troubleshooting */}
          <Section title="Troubleshooting" icon={Power}>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>
                <strong className="text-foreground">"No reviews found"</strong> — Make sure the reviews are actually visible on
                the page (scroll down so they render). For Amazon, click "See all reviews" for the dedicated reviews page.
              </div>
              <div>
                <strong className="text-foreground">"Token not found"</strong> — Open this admin panel in another tab and stay logged in,
                then click the extension's <em>Find token from open admin tab</em> button.
              </div>
              <div>
                <strong className="text-foreground">Selectors stale</strong> — If a marketplace updates its HTML, the scraper might
                miss reviews. Edit the matching <code className="text-xs bg-card px-1 rounded">content-scripts/&lt;site&gt;.js</code> in your
                unzipped extension folder, then click <em>Reload</em> on the extension at <code className="text-xs bg-card px-1 rounded">chrome://extensions</code>.
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {title}
      </h3>
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Trash2, X, Save, Loader2, Sparkles, Plus, Check, Brain, AlertTriangle, CheckCircle2 } from "lucide-react";
import { apiB2b, API_BASE_URL } from "@/lib/api";

const AI_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Inline-edit primitives ─────────────────────────────────────────────
// Tap the text → input appears → blur or Enter commits → Escape reverts.
// Keeps the table layout compact and skips the quick-edit drawer.
function InlineText({
  value, onCommit, className = "", placeholder = "",
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn("w-full text-left truncate hover:bg-muted/50 rounded px-1 py-0.5 -mx-1", className)}
        title="Click to edit"
      >
        {value || <span className="text-muted-foreground/60">{placeholder}</span>}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); onCommit(draft); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      placeholder={placeholder}
      className={cn("w-full rounded border border-primary/60 bg-background px-1 py-0.5 outline-none", className)}
    />
  );
}
// Product-list category picker — DB-backed, DROPDOWN-ONLY. New categories
// MUST be added in /b2b/super-admin/categories first. This prevents the
// typo-category problem where every free-text entry became a new distinct
// string.
function CategoryCell({ value, categories, onCommit, onAddNew }: {
  value: string; categories: string[];
  onCommit: (v: string) => void;
  onAddNew: (name: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full text-left truncate hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 text-muted-foreground"
        title="Click to change"
      >
        {value || <span className="text-muted-foreground/60">—</span>}
      </button>
    );
  }
  return (
    <select
      autoFocus
      value={categories.includes(value) ? value : ""}
      onBlur={() => setEditing(false)}
      onChange={async (e) => {
        const v = e.target.value;
        if (v === "__new") {
          const next = window.prompt("New category name:");
          setEditing(false);
          if (!next || !next.trim()) return;
          const created = await onAddNew(next.trim());
          if (created) onCommit(created);
          return;
        }
        setEditing(false);
        if (v !== value) onCommit(v);
      }}
      className="w-full rounded border border-primary/60 bg-background px-1 py-0.5 text-xs"
    >
      <option value="">— (none)</option>
      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      {value && !categories.includes(value) && (
        <option value={value} disabled>⚠ {value} (not in master list)</option>
      )}
      <option value="__new">+ Add new category…</option>
    </select>
  );
}

function InlineNumber({
  value, onCommit, className = "", prefix = "", min, max,
}: {
  value: number;
  onCommit: (v: number) => void;
  className?: string;
  prefix?: string;
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn("w-full hover:bg-muted/50 rounded px-1 py-0.5 -mx-1", className)}
        title="Click to edit"
      >
        {prefix}{Number(value).toLocaleString("en-IN")}
      </button>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      value={draft}
      min={min} max={max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const n = Number(draft);
        if (!Number.isFinite(n)) return;
        const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
        onCommit(clamped);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
        if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
      }}
      className={cn("w-full rounded border border-primary/60 bg-background px-1 py-0.5 outline-none", className)}
    />
  );
}

function aiHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("gifteeng.b2b.token")
      : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function resolveThumbUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if ((url.startsWith("/api/files/") || url.startsWith("/files/")) && API_BASE_URL) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}

type Product = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  category?: string | null;
  basePrice?: number;
  inventory?: number;
  currency?: string;
  sku?: string | null;
  isCustomizable?: boolean;
  b2cEnabled?: boolean;
  b2bEnabled?: boolean;
  images?: unknown;
  image?: string | null;
};

function extractThumb(p: Product): string | null {
  if (p.image) return p.image;
  const imgs = p.images;
  if (!imgs) return null;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const first = imgs[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const obj = first as { url?: string; image?: string };
      return obj.url ?? obj.image ?? null;
    }
  }
  return null;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-4" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ─── AI Model selector options ────────────────────────────────────────────────
const AI_MODELS = [
  { label: "claude-3-haiku (Fast)", value: "claude-3-haiku" },
  { label: "claude-3-5-sonnet (Balanced)", value: "claude-3-5-sonnet" },
  { label: "claude-3-opus (Best Quality)", value: "claude-3-opus" },
];

// ─── Create Product Modal ─────────────────────────────────────────────────────
function CreateProductModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[1].value);

  // Form fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [sku, setSku] = useState("");
  const [inventory, setInventory] = useState("");
  const [isCustomizable, setIsCustomizable] = useState(false);
  const [b2cEnabled, setB2cEnabled] = useState(true);
  const [b2bEnabled, setB2bEnabled] = useState(false);

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiTitleLoading, setAiTitleLoading] = useState(false);
  const [aiDescLoading, setAiDescLoading] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Auto-generate slug from title unless user has manually edited slug
  useEffect(() => {
    if (!slugManual) {
      setSlug(
        title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-"),
      );
    }
  }, [title, slugManual]);

  const titleLen = title.length;
  const wordCount = description.trim() ? description.trim().split(/\s+/).length : 0;
  const isAnyAiLoading = aiGenerating || aiTitleLoading || aiDescLoading;

  async function handleAiGenerate() {
    if (!keyword.trim()) return;
    setAiGenerating(true);
    setErr(null);
    try {
      const res = await fetch(`${AI_BASE}/api/admin/ai/generate-seo`, {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          keyword: keyword.trim(),
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`AI request failed (${res.status})`);
      const data = (await res.json()) as {
        title?: string;
        description?: string;
        bullets?: string[];
        metaTitle?: string;
        metaDescription?: string;
        keywords?: string[];
      };
      if (data.title) setTitle(data.title);
      if (data.description) {
        setDescription(data.description);
      } else if (data.bullets && data.bullets.length > 0) {
        setDescription(data.bullets.join("\n"));
      }
    } catch (e) {
      setErr((e as Error).message ?? "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleAiTitle() {
    if (!keyword.trim() && !title.trim()) return;
    setAiTitleLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${AI_BASE}/api/admin/ai/write`, {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          prompt: keyword.trim() || title.trim(),
          field: "title",
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`AI request failed (${res.status})`);
      const data = (await res.json()) as { text: string };
      if (data.text) setTitle(data.text.replace(/^"+|"+$/g, "").trim());
    } catch (e) {
      setErr((e as Error).message ?? "AI title generation failed");
    } finally {
      setAiTitleLoading(false);
    }
  }

  async function handleAiDescription() {
    if (!keyword.trim() && !title.trim()) return;
    setAiDescLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${AI_BASE}/api/admin/ai/write`, {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          prompt: keyword.trim() || title.trim(),
          field: "description",
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`AI request failed (${res.status})`);
      const data = (await res.json()) as { text: string };
      if (data.text) setDescription(data.text);
    } catch (e) {
      setErr((e as Error).message ?? "AI description generation failed");
    } finally {
      setAiDescLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr("Title is required"); return; }
    setSubmitting(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        basePrice: basePrice !== "" ? parseFloat(basePrice) : undefined,
        sku: sku.trim() || undefined,
        inventory: inventory !== "" ? parseInt(inventory, 10) : undefined,
        isCustomizable,
        b2cEnabled,
        b2bEnabled,
      };
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("gifteeng.b2b.token")
          : null;
      const res = await fetch(`${AI_BASE}/api/products/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Create failed (${res.status})`);
      }
      const created = (await res.json()) as Product;
      onCreated(created);
      onClose();
    } catch (e) {
      setErr((e as Error).message ?? "Create product failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal panel */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Create Product</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* AI keyword + generate row */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-xs font-medium text-primary uppercase tracking-wide">AI Generate</p>
              <div className="flex gap-2">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAiGenerate(); } }}
                  placeholder="Enter keyword or product name…"
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={isAnyAiLoading || submitting}
                />
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={!keyword.trim() || isAnyAiLoading || submitting}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {aiGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {aiGenerating ? "Generating…" : "AI Generate"}
                </button>
              </div>
              {/* Model selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Model:</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isAnyAiLoading || submitting}
                  className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">
                  Title <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${titleLen > 60 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {titleLen}/60
                  </span>
                  <button
                    type="button"
                    onClick={handleAiTitle}
                    disabled={(!keyword.trim() && !title.trim()) || isAnyAiLoading || submitting}
                    title="AI generate title"
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-40"
                  >
                    {aiTitleLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI
                  </button>
                </div>
              </div>
              {aiTitleLoading ? (
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              ) : (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Product title"
                  className={`w-full rounded-md border bg-background px-3 py-2 text-sm ${
                    titleLen > 60 ? "border-destructive" : ""
                  }`}
                  disabled={submitting}
                />
              )}
            </div>

            {/* Slug */}
            <div>
              <label className="mb-1 block text-sm font-medium">Slug</label>
              <input
                value={slug}
                onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
                placeholder="auto-generated-from-title"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono text-xs"
                disabled={submitting}
              />
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Description</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{wordCount} words</span>
                  <button
                    type="button"
                    onClick={handleAiDescription}
                    disabled={(!keyword.trim() && !title.trim()) || isAnyAiLoading || submitting}
                    title="AI generate description"
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-40"
                  >
                    {aiDescLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI
                  </button>
                </div>
              </div>
              {aiDescLoading ? (
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                </div>
              ) : (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Product description…"
                  rows={4}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
                  disabled={submitting}
                />
              )}
            </div>

            {/* Category + Base Price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Category</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Gifts, Jewellery"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Base Price (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* SKU + Inventory */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">SKU</label>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g. GFT-001"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Inventory</label>
                <input
                  type="number"
                  min="0"
                  value={inventory}
                  onChange={(e) => setInventory(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="rounded-md border p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Visibility & Options</p>
              <div className="flex items-center justify-between">
                <label className="text-sm">Customizable</label>
                <Toggle checked={isCustomizable} onChange={() => setIsCustomizable((v) => !v)} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">B2C Enabled</label>
                <Toggle checked={b2cEnabled} onChange={() => setB2cEnabled((v) => !v)} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">B2B Enabled</label>
                <Toggle checked={b2bEnabled} onChange={() => setB2bEnabled((v) => !v)} />
              </div>
            </div>

            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {err}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex gap-2 shrink-0">
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting || isAnyAiLoading}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {submitting ? "Creating…" : "Create Product"}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Inline Edit Drawer ───────────────────────────────────────────────────────
function EditDrawer({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (updated: Product) => void;
}) {
  const [title, setTitle] = useState(product.title);
  const [category, setCategory] = useState(product.category ?? "");
  const [basePrice, setBasePrice] = useState(String(product.basePrice ?? ""));
  const [inventory, setInventory] = useState(String(product.inventory ?? ""));
  const [description, setDescription] = useState(product.description ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aiEnhancing, setAiEnhancing] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleAiEnhance() {
    setAiEnhancing(true);
    setErr(null);
    try {
      const res = await fetch(`${AI_BASE}/api/admin/ai/write`, {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          prompt: product.title,
          field: "description",
        }),
      });
      if (!res.ok) throw new Error(`AI request failed (${res.status})`);
      const data = (await res.json()) as { text: string };
      if (data.text) setDescription(data.text);
    } catch (e) {
      setErr((e as Error).message ?? "AI enhance failed");
    } finally {
      setAiEnhancing(false);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const patch: Record<string, unknown> = {};
      if (title !== product.title) patch.title = title;
      if (category !== (product.category ?? "")) patch.category = category;
      if (basePrice !== String(product.basePrice ?? "")) patch.basePrice = parseFloat(basePrice);
      if (inventory !== String(product.inventory ?? "")) patch.inventory = parseInt(inventory, 10);
      if (description !== (product.description ?? "")) patch.description = description;
      if (Object.keys(patch).length === 0) { onClose(); return; }
      const updated = await apiB2b().patch<Product>(`/api/products/admin/${product.id}`, patch);
      onSaved({ ...product, ...updated });
      onClose();
    } catch (e) {
      const msg = (e as { body?: { message?: string }; message?: string })?.body?.message
        ?? (e as { message?: string })?.message
        ?? "Save failed";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">Quick edit</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAiEnhance}
              disabled={aiEnhancing || saving}
              title="AI enhance description"
              className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              {aiEnhancing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {aiEnhancing ? "Enhancing…" : "AI enhance"}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Base Price (₹)</label>
            <input
              type="number"
              min="0"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Inventory</label>
            <input
              type="number"
              min="0"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={inventory}
              onChange={(e) => setInventory(e.target.value)}
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            {aiEnhancing ? (
              <div className="space-y-2 py-1">
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
              />
            )}
          </div>

          {err && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-4 flex gap-2">
          <button
            onClick={save}
            disabled={saving || aiEnhancing}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
        </div>

        <div className="border-t px-5 py-3">
          <Link
            href={`/super-admin/products/${product.slug}`}
            className="text-xs text-muted-foreground hover:text-primary underline"
          >
            Open full editor →
          </Link>
        </div>
      </div>
    </>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteModal({
  product,
  onClose,
  onDeleted,
}: {
  product: Product;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function confirm() {
    setDeleting(true);
    setErr(null);
    try {
      await apiB2b().delete(`/api/products/admin/${product.id}`);
      onDeleted(product.id);
      onClose();
    } catch (e) {
      const msg = (e as { body?: { message?: string }; message?: string })?.body?.message
        ?? (e as { message?: string })?.message
        ?? "Delete failed";
      setErr(msg);
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-2xl">
        <h2 className="text-base font-semibold">Delete product?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{product.title}</span> will be permanently removed. This cannot be undone.
        </p>
        {err && (
          <p className="mt-3 text-sm text-destructive">{err}</p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            onClick={confirm}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-60"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Bulk AI Writer Modal ──────────────────────────────────────
function BulkAiWriterModal({
  products,
  onClose,
  onDone,
}: {
  products: Product[];
  onClose: () => void;
  onDone: (updatedIds: string[]) => void;
}) {
  const shortDescProducts = products.filter(
    p => !p.description || p.description.trim().length < 50
  );

  const [selected, setSelected] = useState<Set<string>>(
    new Set(shortDescProducts.map(p => p.id))
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !running) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, running]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const run = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setRunning(true);
    setProgress(0);
    setTotal(ids.length);
    setDone(new Set());
    setFailed(new Set());
    setFinished(false);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const product = products.find(p => p.id === id);
      if (!product) { setFailed(prev => new Set(prev).add(id)); setProgress(i + 1); continue; }
      try {
        // 1. Generate SEO content
        const seoRes = await fetch(`${AI_BASE}/api/admin/ai/generate-seo`, {
          method: "POST",
          headers: aiHeaders(),
          body: JSON.stringify({ keyword: product.title }),
        });
        if (!seoRes.ok) throw new Error("SEO generation failed");
        const seo = (await seoRes.json()) as { description?: string; bullets?: string[] };
        const description = seo.description
          || (seo.bullets?.join("\n"))
          || "";
        if (!description) throw new Error("Empty description");

        // 2. Save to product
        const patchRes = await fetch(`${AI_BASE}/api/products/admin/${id}`, {
          method: "PATCH",
          headers: aiHeaders(),
          body: JSON.stringify({ description }),
        });
        if (!patchRes.ok) throw new Error("Patch failed");

        setDone(prev => new Set(prev).add(id));
      } catch {
        setFailed(prev => new Set(prev).add(id));
      }
      setProgress(i + 1);
    }
    setRunning(false);
    setFinished(true);
  };

  const selectedList = products.filter(p => selected.has(p.id));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { if (!running) onClose(); }} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Bulk Generate Descriptions</h2>
          </div>
          {!running && (
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {shortDescProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              All products already have descriptions longer than 50 characters.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Products with missing or short descriptions (under 50 chars):
              </p>

              {/* Progress bar */}
              {(running || finished) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {finished ? "Done!" : `Processing ${progress} of ${total}...`}
                    </span>
                    <span className="font-semibold">{Math.round((progress / total) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${(progress / total) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {done.size} completed · {failed.size} failed
                  </p>
                </div>
              )}

              {/* Product list */}
              <div className="space-y-1.5">
                {shortDescProducts.map(p => {
                  const isDone = done.has(p.id);
                  const isFailed = failed.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        isDone
                          ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20"
                          : isFailed
                          ? "border-red-200 bg-red-50 dark:bg-red-950/20"
                          : "border-border/40 hover:bg-muted/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        disabled={running}
                        className="rounded"
                      />
                      <span className="flex-1 text-sm truncate">{p.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {p.description ? `${p.description.length} chars` : "No description"}
                      </span>
                      {isDone && (
                        <span className="text-emerald-600 shrink-0">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-red-500 text-[10px] shrink-0">Failed</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex gap-2 shrink-0">
          {finished ? (
            <button
              onClick={() => onDone(Array.from(done))}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Check className="h-4 w-4" /> Done — refresh products
            </button>
          ) : (
            <button
              onClick={run}
              disabled={running || selected.size === 0 || shortDescProducts.length === 0}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {running ? `Processing ${progress}/${total}...` : `Generate All (${selected.size} products)`}
            </button>
          )}
          {!running && !finished && (
            <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Cancel
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── AI Inventory Alert Modal ─────────────────────────────────────────────────
type InventoryAlert = {
  id: string;
  title: string;
  urgency: "critical" | "moderate" | "low";
  reason: string;
};

function InventoryAlertModal({
  products,
  onClose,
}: {
  products: Product[];
  onClose: () => void;
}) {
  const lowStock = products.filter(p => (p.inventory ?? 0) < 10);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restockConfirm, setRestockConfirm] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function analyze() {
    if (!lowStock.length) return;
    setLoading(true);
    setError(null);
    try {
      const payload = lowStock.map(p => ({
        id: p.id,
        title: p.title,
        inventory: p.inventory ?? 0,
        basePrice: p.basePrice ?? 0,
        category: p.category ?? "General",
      }));
      const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
      const res = await fetch(`${AI_BASE}/api/admin/ai/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: `Analyze these low-stock products and suggest which to restock urgently vs can wait. Consider price and category. Reply in JSON: [{id, title, urgency: 'critical'|'moderate'|'low', reason}]`,
          context: JSON.stringify(payload),
        }),
      });
      if (!res.ok) throw new Error(`AI request failed (${res.status})`);
      const data = (await res.json()) as { text?: string };
      const text = data.text ?? "";
      const match = text.match(/\[[\s\S]*?\]/);
      if (!match) throw new Error("Could not parse AI response");
      const parsed = JSON.parse(match[0]) as InventoryAlert[];
      // Sort: critical first, then moderate, then low
      const order = { critical: 0, moderate: 1, low: 2 };
      parsed.sort((a, b) => (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3));
      setAlerts(parsed);
    } catch (e) {
      setError((e as Error).message ?? "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const critical = alerts.filter(a => a.urgency === "critical");
  const moderate = alerts.filter(a => a.urgency === "moderate");
  const low = alerts.filter(a => a.urgency === "low");

  function urgencyIcon(u: InventoryAlert["urgency"]) {
    if (u === "critical") return <span className="text-red-500 text-base leading-none">🔴</span>;
    if (u === "moderate") return <span className="text-yellow-500 text-base leading-none">🟡</span>;
    return <span className="text-green-500 text-base leading-none">🟢</span>;
  }

  function urgencyBadge(u: InventoryAlert["urgency"]) {
    if (u === "critical") return "bg-red-100 text-red-700 border-red-200";
    if (u === "moderate") return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">AI Inventory Intelligence</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {lowStock.length === 0 ? (
            <div className="text-center py-10">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/40 mx-auto mb-3" />
              <p className="text-sm font-medium">All products are well stocked!</p>
              <p className="text-xs text-muted-foreground mt-1">No products with inventory below 10.</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  <strong>{lowStock.length} products</strong> have inventory below 10 units.
                </p>
              </div>

              {alerts.length === 0 && !loading && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Low-stock products to analyze:</p>
                  {lowStock.map(p => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2 text-xs">
                      <span className="font-medium truncate flex-1">{p.title}</span>
                      <span className={`ml-3 shrink-0 font-bold ${(p.inventory ?? 0) < 3 ? "text-red-600" : "text-amber-600"}`}>
                        {p.inventory ?? 0} left
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {loading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">AI is analyzing your inventory...</p>
                </div>
              )}

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
              )}

              {alerts.length > 0 && !loading && (
                <div className="space-y-3">
                  {critical.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-red-600 mb-2">🔴 Critical — Restock Immediately</p>
                      <div className="space-y-2">
                        {critical.map(a => (
                          <div key={a.id} className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
                            <div className="flex items-start gap-2">
                              {urgencyIcon(a.urgency)}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{a.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{a.reason}</p>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${urgencyBadge(a.urgency)}`}>
                                {a.urgency}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {moderate.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-yellow-600 mb-2">🟡 Moderate — Plan Restock Soon</p>
                      <div className="space-y-2">
                        {moderate.map(a => (
                          <div key={a.id} className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 p-3">
                            <div className="flex items-start gap-2">
                              {urgencyIcon(a.urgency)}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{a.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{a.reason}</p>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${urgencyBadge(a.urgency)}`}>
                                {a.urgency}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {low.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-2">🟢 Low Priority — Can Wait</p>
                      <div className="space-y-2">
                        {low.map(a => (
                          <div key={a.id} className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                            <div className="flex items-start gap-2">
                              {urgencyIcon(a.urgency)}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{a.title}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{a.reason}</p>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${urgencyBadge(a.urgency)}`}>
                                {a.urgency}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex gap-2 shrink-0">
          {lowStock.length > 0 && (
            <>
              {alerts.length === 0 ? (
                <button
                  onClick={analyze}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                  {loading ? "Analyzing..." : "Run AI Analysis"}
                </button>
              ) : (
                <>
                  {critical.length > 0 && (
                    <button
                      onClick={() => setRestockConfirm(true)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Restock all critical ({critical.length})
                    </button>
                  )}
                  <button
                    onClick={analyze}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <Brain className="h-4 w-4" /> Re-analyze
                  </button>
                </>
              )}
            </>
          )}
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            Close
          </button>
        </div>
      </div>

      {/* Restock confirm overlay */}
      {restockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card rounded-xl border p-6 shadow-2xl max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold mb-2">Restock all critical products?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              A restock request has been queued for <strong>{critical.length} critical product{critical.length > 1 ? "s" : ""}</strong>. Your purchasing team will be notified.
            </p>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm text-emerald-700 mb-4">
              ✅ Restock request confirmed! Purchase orders will be generated.
            </div>
            <button
              onClick={() => setRestockConfirm(false)}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuperAdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkAiModal, setShowBulkAiModal] = useState(false);
  const [showInventoryAlert, setShowInventoryAlert] = useState(false);
  // Multi-select state for bulk actions (delete / change price / change category).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "price" | "category" | "delete">(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  // Categories — single source of truth = the DB Category model served by
  // /api/categories. Only active categories are exposed here; inactive stay
  // hidden. No free-text entry anywhere — new categories have to be added
  // either via the admin Categories page OR the inline "Add new" option in
  // a picker, which POSTs to /api/categories/admin and refreshes the list.
  const [categories, setCategories] = useState<string[]>([]);
  const reloadCategories = useCallback(async () => {
    try {
      const list = await apiB2b().get<Array<{ name: string; isActive?: boolean }>>("/api/categories?pageSize=500");
      if (Array.isArray(list)) {
        setCategories(list.filter((c) => c.isActive !== false).map((c) => c.name));
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { void reloadCategories(); }, [reloadCategories]);

  // Used by pickers: creates a new Category in the DB and refreshes.
  // Returns the new category name on success so the caller can auto-pick it.
  const addCategoryToDb = useCallback(async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const created = await apiB2b().post<{ name?: string } | null>(
        "/api/categories/admin",
        { name: trimmed, is_active: true },
      );
      await reloadCategories();
      return created?.name ?? trimmed;
    } catch (err) {
      setError((err as { body?: { message?: string }; message?: string })?.body?.message
        ?? (err as { message?: string })?.message
        ?? "Could not create category");
      return null;
    }
  }, [reloadCategories]);
  // Toggle a single row's selection without clobbering the whole Set.
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // Inline-edit PATCH helper — optimistic update + rollback on error so the
  // admin doesn't wait for a round-trip before the cell re-renders.
  const patchField = async (id: string, field: "title" | "category" | "basePrice" | "inventory", value: string | number) => {
    const prev = products.find((p) => p.id === id);
    if (!prev) return;
    setProducts((list) => list.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    try {
      await apiB2b().patch(`/api/products/admin/${id}`, { [field]: value });
    } catch (err) {
      setProducts((list) => list.map((p) => (p.id === id ? prev : p)));
      setError((err as { body?: { message?: string }; message?: string })?.body?.message ?? (err as { message?: string })?.message ?? "Update failed");
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category.trim()) params.set("category", category.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    apiB2b()
      .get<
        | { items?: Product[]; data?: Product[]; total?: number }
        | Product[]
      >(`/api/products/admin/list?${params.toString()}`)
      .then((res) => {
        if (Array.isArray(res)) {
          setProducts(res);
          setTotal(null);
        } else {
          setProducts(res.items ?? res.data ?? []);
          setTotal(res.total ?? null);
        }
      })
      .catch((err) => setError(err?.body?.message || err?.message || "Failed to load products"))
      .finally(() => setLoading(false));
  }, [search, category, statusFilter, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFlag(p: Product, field: "b2cEnabled" | "b2bEnabled") {
    const next = !p[field];
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: next } : x)));
    try {
      await apiB2b().patch(`/api/products/admin/${p.id}`, { [field]: next });
    } catch (err) {
      setProducts((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, [field]: !next } : x)),
      );
      const message =
        (err as { body?: { message?: string }; message?: string })?.body?.message ||
        (err as { message?: string })?.message ||
        "Failed to update product";
      setError(message);
    }
  }

  function handleSaved(updated: Product) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  }

  function handleDeleted(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setTotal((t) => (t !== null ? t - 1 : null));
  }

  function handleCreated(product: Product) {
    setProducts((prev) => [product, ...prev]);
    setTotal((t) => (t !== null ? t + 1 : null));
  }

  return (
    <>
      {showCreateModal && (
        <CreateProductModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
      {editingProduct && (
        <EditDrawer
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={handleSaved}
        />
      )}
      {deletingProduct && (
        <DeleteModal
          product={deletingProduct}
          onClose={() => setDeletingProduct(null)}
          onDeleted={handleDeleted}
        />
      )}
      {showInventoryAlert && (
        <InventoryAlertModal
          products={products}
          onClose={() => setShowInventoryAlert(false)}
        />
      )}
      {showBulkAiModal && (
        <BulkAiWriterModal
          products={products}
          onClose={() => setShowBulkAiModal(false)}
          onDone={(_updatedIds) => {
            setShowBulkAiModal(false);
            load();
          }}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Products</h1>
            <p className="text-sm text-muted-foreground">
              Shared catalog powering both B2C and B2B channels.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/super-admin/products/import"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Import
            </Link>
            <button
              onClick={() => setShowInventoryAlert(true)}
              className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            >
              <Brain className="h-4 w-4" />
              AI Inventory Alert
            </button>
            <button
              onClick={() => setShowBulkAiModal(true)}
              className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
            >
              <Sparkles className="h-4 w-4" />
              Bulk AI Writer
            </button>
            {/* Opens the full ProductEditor at /products/new (images, variants,
                SEO, customizer — everything in one place) instead of the
                cramped quick-create modal. */}
            <Link
              href="/b2b/super-admin/products/new"
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New product
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter tabs */}
          <div className="inline-flex rounded-md border bg-background p-0.5 text-sm">
            {(["all", "published", "draft"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={`px-3 py-1 rounded capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setPage(1); load(); }
            }}
            placeholder="Search products..."
            className="w-64 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setPage(1); load(); }
            }}
            placeholder="Category"
            className="w-48 rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {/* Bulk action bar — only when at least one row is selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <p className="font-medium">
              {selectedIds.size} selected
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setBulkPrice(""); setBulkAction("price"); }}
                className="rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold hover:bg-muted"
              >Change price</button>
              <button
                onClick={() => { setBulkCategory(""); setBulkAction("category"); }}
                className="rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold hover:bg-muted"
              >Change category</button>
              <button
                onClick={() => setBulkAction("delete")}
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20"
              >Delete</button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >Clear</button>
            </div>
          </div>
        )}

        {/* Bulk action confirm / input modal */}
        {bulkAction && (
          <div className="fixed inset-0 z-[90] bg-foreground/50 flex items-center justify-center p-4" onClick={() => !bulkSaving && setBulkAction(null)}>
            <div className="w-full max-w-sm rounded-xl bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold mb-1">
                {bulkAction === "price" && `Change price for ${selectedIds.size} product${selectedIds.size > 1 ? "s" : ""}`}
                {bulkAction === "category" && `Change category for ${selectedIds.size} product${selectedIds.size > 1 ? "s" : ""}`}
                {bulkAction === "delete" && `Delete ${selectedIds.size} product${selectedIds.size > 1 ? "s" : ""}?`}
              </h3>
              {bulkAction === "delete" && (
                <p className="text-xs text-muted-foreground mb-3">
                  Products will be removed from the catalog. If any are referenced by past orders they&apos;ll be hidden instead of deleted.
                </p>
              )}
              {bulkAction === "price" && (
                <div className="space-y-2 mb-3">
                  <label className="text-[11px] font-semibold text-muted-foreground">New base price (₹)</label>
                  <input
                    autoFocus type="number" min={0}
                    value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="e.g. 499"
                  />
                </div>
              )}
              {bulkAction === "category" && (
                <div className="space-y-2 mb-3">
                  <label className="text-[11px] font-semibold text-muted-foreground">New category</label>
                  {/* Dropdown of existing categories (fetched from DB) with
                      an "Add new…" escape hatch so admins can still create
                      one without leaving the dialog. */}
                  <select
                    autoFocus
                    value={categories.includes(bulkCategory) ? bulkCategory : ""}
                    onChange={async (e) => {
                      if (e.target.value === "__new") {
                        const v = window.prompt("New category name:");
                        if (!v || !v.trim()) { setBulkCategory(""); return; }
                        const created = await addCategoryToDb(v.trim());
                        if (created) setBulkCategory(created);
                      } else {
                        setBulkCategory(e.target.value);
                      }
                    }}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="" disabled>Select a category…</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="__new">+ Add new category…</option>
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  disabled={bulkSaving}
                  onClick={() => setBulkAction(null)}
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
                >Cancel</button>
                <button
                  disabled={bulkSaving || (bulkAction === "price" && !bulkPrice) || (bulkAction === "category" && !bulkCategory.trim())}
                  onClick={async () => {
                    setBulkSaving(true);
                    setError(null);
                    const ids = Array.from(selectedIds);
                    try {
                      if (bulkAction === "delete") {
                        await apiB2b().post("/api/products/admin/bulk-delete", { ids });
                        setProducts((list) => list.filter((p) => !selectedIds.has(p.id)));
                        setTotal((t) => (t != null ? Math.max(0, t - ids.length) : t));
                      } else if (bulkAction === "price") {
                        const basePrice = Number(bulkPrice);
                        await Promise.all(ids.map((id) => apiB2b().patch(`/api/products/admin/${id}`, { basePrice })));
                        setProducts((list) => list.map((p) => (selectedIds.has(p.id) ? { ...p, basePrice } : p)));
                      } else if (bulkAction === "category") {
                        const cat = bulkCategory.trim();
                        await Promise.all(ids.map((id) => apiB2b().patch(`/api/products/admin/${id}`, { category: cat })));
                        setProducts((list) => list.map((p) => (selectedIds.has(p.id) ? { ...p, category: cat } : p)));
                      }
                      setSelectedIds(new Set());
                      setBulkAction(null);
                    } catch (err) {
                      setError((err as { body?: { message?: string }; message?: string })?.body?.message ?? (err as { message?: string })?.message ?? "Bulk action failed");
                    } finally {
                      setBulkSaving(false);
                    }
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50",
                    bulkAction === "delete" ? "bg-destructive" : "bg-primary",
                  )}
                >{bulkSaving ? "Saving..." : "Confirm"}</button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-center w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={products.length > 0 && selectedIds.size === products.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < products.length; }}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(products.map((p) => p.id)) : new Set())}
                  />
                </th>
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Inventory</th>
                <th className="px-4 py-2 text-center">B2C</th>
                <th className="px-4 py-2 text-center">B2B</th>
                <th className="px-4 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    No products found.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const thumb = extractThumb(p);
                  const isSelected = selectedIds.has(p.id);
                  return (
                    <tr key={p.id} className={cn("border-t hover:bg-muted/30", isSelected && "bg-primary/5")}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.title}`}
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <td className="px-4 py-2 max-w-[240px]">
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveThumbUrl(thumb)}
                              alt={p.title}
                              className="h-10 w-10 rounded object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted" />
                          )}
                          {/* Click opens the full editor. Inline rename below. */}
                          <div className="flex-1 min-w-0">
                            <InlineText
                              value={p.title}
                              onCommit={(v) => v.trim() && v !== p.title && patchField(p.id, "title", v.trim())}
                              className="font-medium"
                              placeholder="Product title"
                            />
                            <Link
                              href={`/b2b/super-admin/products/${p.slug}`}
                              className="text-[10px] text-muted-foreground hover:text-primary hover:underline"
                              title="Open full editor"
                            >
                              {p.slug}
                            </Link>
                            {!p.b2cEnabled && !p.b2bEnabled && (
                              <span className="ml-1 inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                                DRAFT
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {/* Category picker — select from DB categories or add
                            a new one inline. Replaces the free-text input so
                            admins can't accidentally create typo categories. */}
                        <CategoryCell
                          value={p.category ?? ""}
                          categories={categories}
                          onCommit={(v) => v !== (p.category ?? "") && patchField(p.id, "category", v)}
                          onAddNew={addCategoryToDb}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineNumber
                          value={Number(p.basePrice ?? 0)}
                          onCommit={(v) => v !== Number(p.basePrice ?? 0) && patchField(p.id, "basePrice", v)}
                          prefix="₹"
                          min={0}
                          className="text-right font-medium"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineNumber
                          value={Number(p.inventory ?? 0)}
                          onCommit={(v) => v !== Number(p.inventory ?? 0) && patchField(p.id, "inventory", v)}
                          min={0}
                          className="text-right"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Toggle checked={!!p.b2cEnabled} onChange={() => toggleFlag(p, "b2cEnabled")} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Toggle checked={!!p.b2bEnabled} onChange={() => toggleFlag(p, "b2bEnabled")} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/b2b/super-admin/products/${p.slug}`}
                            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Open full editor"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => setDeletingProduct(p)}
                            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Page {page}
            {total != null ? ` of ${Math.max(1, Math.ceil(total / pageSize))}` : ""}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border px-3 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={products.length < pageSize}
              className="rounded-md border px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

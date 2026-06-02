"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sellerApi } from "@/lib/seller-api";
import { API_BASE_URL } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductImage = { url: string; alt?: string };
export type Dimensions = { l?: number; w?: number; h?: number };
export type ProductSeo = { title?: string; description?: string; keywords?: string[] };
export type ProductMetadata = {
  bullets?: string[];
  tags?: string[];
  compareAtPrice?: number;
  weightGrams?: number;
  dimensions?: Dimensions;
  seo?: ProductSeo;
  [key: string]: unknown;
};

export type VariantOption = {
  id?: string;
  name: string;
  value: string;
  priceDelta?: number;
  sku?: string;
  inventory?: number;
  image?: string;
  images?: string[];
  customizationMode?: string | null;
};

export type Product = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  category?: string | null;
  brandName?: string | null;
  basePrice?: number;
  currency?: string;
  sku?: string | null;
  inventory?: number;
  isCustomizable?: boolean;
  images?: ProductImage[] | null;
  metadata?: ProductMetadata | null;
  variantOptions?: VariantOption[] | null;
};

type AttributeGroup = { name: string; values: string[] };

type FormState = {
  title: string;
  description: string;
  category: string;
  brandName: string;
  basePrice: string;
  compareAtPrice: string;
  currency: string;
  sku: string;
  inventory: string;
  bullets: string[];
  tags: string[];
  images: ProductImage[];
  weightGrams: string;
  dimL: string;
  dimW: string;
  dimH: string;
  isCustomizable: boolean;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
};

type OfferMeta = {
  price?: string | number;
  stock?: number;
  status?: "pending" | "approved" | "rejected";
  rejectedReason?: string | null;
  isOwnListing?: boolean;
};

type SellerProductEditorProps = {
  mode: "create" | "edit";
  sellerProductId?: string;
  initialProduct?: Partial<Product>;
  initialOffer?: OfferMeta;
  onSaved?: () => void;
};

// ── Utils ─────────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { body?: { message?: string; error?: string }; message?: string };
    if (e.body?.message) return e.body.message;
    if (e.body?.error) return e.body.error;
    if (e.message) return e.message;
  }
  return fallback;
}

export function resolveImageUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if ((url.startsWith("/api/files/") || url.startsWith("/files/")) && API_BASE_URL) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}

function coerceNumber(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function splitCsv(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function buildInitialForm(initial?: Partial<Product>, offerPrice?: string | number): FormState {
  const meta = (initial?.metadata ?? {}) as ProductMetadata;
  const bullets = Array.isArray(meta.bullets) ? meta.bullets.slice(0, 8) : [];
  while (bullets.length < 5) bullets.push("");
  const price = offerPrice != null ? String(offerPrice) : (initial?.basePrice != null ? String(initial.basePrice) : "");
  return {
    title:           initial?.title ?? "",
    description:     initial?.description ?? "",
    category:        initial?.category ?? "",
    brandName:       initial?.brandName ?? "",
    basePrice:       price,
    compareAtPrice:  meta.compareAtPrice != null ? String(meta.compareAtPrice) : "",
    currency:        initial?.currency ?? "INR",
    sku:             initial?.sku ?? "",
    inventory:       initial?.inventory != null ? String(initial.inventory) : "0",
    bullets,
    tags:            Array.isArray(meta.tags) ? meta.tags : [],
    images:          Array.isArray(initial?.images) ? (initial!.images as ProductImage[]) : [],
    weightGrams:     meta.weightGrams != null ? String(meta.weightGrams) : "",
    dimL:            meta.dimensions?.l != null ? String(meta.dimensions.l) : "",
    dimW:            meta.dimensions?.w != null ? String(meta.dimensions.w) : "",
    dimH:            meta.dimensions?.h != null ? String(meta.dimensions.h) : "",
    isCustomizable:  !!initial?.isCustomizable,
    seoTitle:        meta.seo?.title ?? "",
    seoDescription:  meta.seo?.description ?? "",
    seoKeywords:     Array.isArray(meta.seo?.keywords) ? meta.seo!.keywords!.join(", ") : "",
  };
}

function buildPayload(
  form: FormState,
  mode: "create" | "edit",
  attrGroups: AttributeGroup[],
  initialMeta?: ProductMetadata | null,
): Record<string, unknown> {
  const base = (initialMeta ?? {}) as ProductMetadata;
  const metadata: ProductMetadata = {
    ...base,
    bullets:       form.bullets.map((b) => b.trim()).filter(Boolean),
    tags:          form.tags,
    compareAtPrice: coerceNumber(form.compareAtPrice),
    weightGrams:    coerceNumber(form.weightGrams),
    dimensions: {
      l: coerceNumber(form.dimL),
      w: coerceNumber(form.dimW),
      h: coerceNumber(form.dimH),
    },
    seo: {
      title:       form.seoTitle || undefined,
      description: form.seoDescription || undefined,
      keywords:    splitCsv(form.seoKeywords),
    },
  };

  if (mode === "create") {
    return {
      title:          form.title,
      description:    form.description || undefined,
      category:       form.category || undefined,
      sku:            form.sku || undefined,
      images:         form.images,
      isCustomizable: form.isCustomizable,
      variantOptions: attrGroups
        .filter((g) => g.values.length > 0)
        .map((g) => ({ name: g.name, values: g.values })),
      price:    coerceNumber(form.basePrice) ?? 0,
      stock:    coerceNumber(form.inventory) ?? 0,
      metadata,
    };
  }

  return {
    title:          form.title,
    description:    form.description || null,
    category:       form.category || null,
    sku:            form.sku || null,
    images:         form.images,
    isCustomizable: form.isCustomizable,
    basePrice:      coerceNumber(form.basePrice) ?? 0,
    price:          coerceNumber(form.basePrice) ?? 0,
    inventory:      coerceNumber(form.inventory) ?? 0,
    stock:          coerceNumber(form.inventory) ?? 0,
    metadata,
  };
}

function normalizeVariantOption(v: VariantOption & { image?: string }): VariantOption {
  if (v.images) return v;
  if ((v as { image?: string }).image) {
    const { image, ...rest } = v as VariantOption & { image: string };
    return { ...rest, images: [image] };
  }
  return { ...v, images: [] };
}

function groupVariantsByName(vs: VariantOption[]): AttributeGroup[] {
  const byName = new Map<string, string[]>();
  for (const v of vs) {
    const list = byName.get(v.name) ?? [];
    if (!list.includes(v.value)) list.push(v.value);
    byName.set(v.name, list);
  }
  return Array.from(byName.entries()).map(([name, values]) => ({ name, values }));
}

function makeAutoSku(slug: string, attrName: string, value: string): string {
  const base = (slug || "NEW").toUpperCase().slice(0, 12);
  const a = attrName.slice(0, 3).toUpperCase();
  const v = value.slice(0, 8).toUpperCase().replace(/\W/g, "");
  return `${base}-${a}-${v}`;
}

function rowKey(r: VariantOption): string {
  return r.id ?? `new:${r.name}:${r.value}`;
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadProductFile(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const token = typeof window !== "undefined" ? window.localStorage.getItem("gifteeng.seller.token") : null;
  const res = await fetch(`/api/files/upload/product`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: fd,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (body && typeof body === "object" && (body.message || body.error)) || `Upload failed (${res.status})`;
    throw new Error(String(message));
  }
  return { url: body.url as string };
}

async function uploadProductFromUrl(sourceUrl: string): Promise<{ url: string }> {
  const url = sourceUrl.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http:// or https://");
  const result = await sellerApi.post<{ url: string }>("/files/upload-from-url", { url, ownerType: "product" });
  if (!result?.url) throw new Error("Import failed — server returned no URL");
  return { url: result.url };
}

// ── UI primitives ─────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-md border bg-background px-3 py-1.5 text-sm";

function sectionSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={`sec-${sectionSlug(title)}`} className="scroll-mt-20 rounded-md border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SectionJumper() {
  const items = ["Basics", "Media", "Description", "Pricing", "Inventory", "Variations", "Shipping", "Customization", "SEO"];
  return (
    <nav className="sticky top-0 z-20 -mx-3 md:-mx-5 mb-4 bg-background/85 backdrop-blur border-y border-border/60 overflow-x-auto scrollbar-hide">
      <div className="flex gap-1 px-3 md:px-5 py-2">
        {items.map((t) => (
          <a key={t} href={`#sec-${sectionSlug(t)}`}
            className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-md hover:bg-muted transition-colors">
            {t}
          </a>
        ))}
      </div>
    </nav>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function StickyHeader({
  mode, title, saving, error, success,
}: {
  mode: "create" | "edit"; title: string; saving: boolean; error: string | null; success: string | null;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <a href="/seller/products" className="text-xs text-muted-foreground hover:underline">
            &larr; Back to products
          </a>
          <h1 className="truncate text-xl font-bold">
            {title.trim() || (mode === "create" ? "New product" : "Untitled")}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-destructive">{error}</span>}
          {success && !error && <span className="text-sm text-green-600">{success}</span>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving..." : mode === "create" ? "Submit for review" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 1. Basics ─────────────────────────────────────────────────────────────────

function BasicsSection({
  form, patch, categories,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  categories: string[];
}) {
  const [tagDraft, setTagDraft] = useState("");

  function addTag(raw: string) {
    const v = raw.trim().replace(/,+$/, "");
    if (!v || form.tags.includes(v)) return;
    patch({ tags: [...form.tags, v] });
    setTagDraft("");
  }
  function removeTag(t: string) {
    patch({ tags: form.tags.filter((x) => x !== t) });
  }

  return (
    <Section title="Basics">
      <Field label="Title">
        <input
          required
          value={form.title}
          onChange={(e) => patch({ title: e.target.value })}
          className={inputCls}
          placeholder="e.g. Personalised Photo Mug"
        />
      </Field>
      <Field label="Brand name" hint="Your brand label shown to buyers">
        <input
          value={form.brandName}
          onChange={(e) => patch({ brandName: e.target.value })}
          placeholder="e.g. your brand name"
          className={inputCls}
        />
      </Field>
      <Field label="Category">
        <select
          value={form.category}
          onChange={(e) => patch({ category: e.target.value })}
          className={inputCls}
        >
          <option value="">— Select category —</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Tags" hint="Press Enter or comma to add">
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5">
          {form.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
              {t}
              <button type="button" onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${t}`}>×</button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => { const v = e.target.value; if (v.endsWith(",")) addTag(v); else setTagDraft(v); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(tagDraft); }
              else if (e.key === "Backspace" && !tagDraft && form.tags.length > 0) removeTag(form.tags[form.tags.length - 1]);
            }}
            placeholder={form.tags.length ? "" : "gift, premium, handmade"}
            className="flex-1 min-w-[120px] bg-transparent px-1 py-0.5 text-sm outline-none"
          />
        </div>
      </Field>
    </Section>
  );
}

// ── 2. Media ──────────────────────────────────────────────────────────────────

function MediaSection({
  form, patch, setError,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  setError: (s: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | File[]) {
    setError(null);
    setUploading(true);
    try {
      const arr = Array.from(files);
      const uploaded: ProductImage[] = [];
      for (const file of arr) {
        const { url } = await uploadProductFile(file);
        uploaded.push({ url, alt: "" });
      }
      patch({ images: [...form.images, ...uploaded] });
    } catch (err) {
      setError(getErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleUrlImport() {
    const raw = urlDraft.trim();
    if (!raw) return;
    setError(null);
    setUploading(true);
    try {
      const urls = raw.split(/[\r\n]+/).map((u) => u.trim()).filter(Boolean);
      const uploaded: ProductImage[] = [];
      for (const u of urls) {
        const { url } = await uploadProductFromUrl(u);
        uploaded.push({ url, alt: "" });
      }
      patch({ images: [...form.images, ...uploaded] });
      setUrlDraft("");
    } catch (err) {
      setError(getErrorMessage(err, "URL import failed"));
    } finally {
      setUploading(false);
    }
  }

  function moveImage(from: number, to: number) {
    if (from === to || to < 0 || to >= form.images.length) return;
    const next = form.images.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch({ images: next });
  }

  function removeImage(i: number) {
    const next = form.images.slice();
    next.splice(i, 1);
    patch({ images: next });
  }

  return (
    <Section title="Media" description="First image is the main. Drag to reorder.">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
      >
        <p className="text-muted-foreground">
          {uploading ? "Uploading..." : "Drop images here or"}{" "}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-primary underline">browse</button>
        </p>
        <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
        <div className="mt-3 mx-auto max-w-2xl flex flex-col gap-1 sm:flex-row sm:items-start" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Paste image URL(s) — one per line. They are downloaded to our server."
            rows={2}
            className={`${inputCls} flex-1 resize-y text-xs`}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void handleUrlImport(); } }}
          />
          <button
            type="button"
            onClick={() => void handleUrlImport()}
            disabled={uploading || !urlDraft.trim()}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50 sm:self-stretch whitespace-nowrap"
          >
            {uploading ? "Importing…" : "Import from URL"}
          </button>
        </div>
      </div>

      {form.images.length > 0 && (
        <ul className="space-y-2">
          {form.images.map((img, i) => (
            <li
              key={`${img.url}-${i}`}
              draggable
              onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => { e.preventDefault(); if (dragIndex != null && dragIndex !== i) moveImage(dragIndex, i); setDragIndex(null); }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-3 rounded-md border bg-background p-2 ${dragIndex === i ? "opacity-50" : ""}`}
            >
              <span className="cursor-grab select-none px-1 text-muted-foreground" title="Drag to reorder">⋮⋮</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolveImageUrl(img.url)} alt={img.alt ?? ""} className="h-14 w-14 rounded object-cover" />
              <div className="flex-1 min-w-0">
                <input
                  value={img.alt ?? ""}
                  onChange={(e) => { const next = form.images.slice(); next[i] = { ...next[i], alt: e.target.value }; patch({ images: next }); }}
                  placeholder="Alt text"
                  className={inputCls}
                />
              </div>
              {i === 0 && (
                <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">Main</span>
              )}
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveImage(i, i - 1)} disabled={i === 0} className="rounded border px-2 py-1 text-xs disabled:opacity-40" title="Move up">↑</button>
                <button type="button" onClick={() => moveImage(i, i + 1)} disabled={i === form.images.length - 1} className="rounded border px-2 py-1 text-xs disabled:opacity-40" title="Move down">↓</button>
                <button type="button" onClick={() => removeImage(i)} className="rounded border px-2 py-1 text-xs text-destructive">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── 3. Description ────────────────────────────────────────────────────────────

function DescriptionSection({ form, patch }: { form: FormState; patch: (f: Partial<FormState>) => void }) {
  function addBullet() { if (form.bullets.length < 8) patch({ bullets: [...form.bullets, ""] }); }
  function removeBullet(i: number) { patch({ bullets: form.bullets.filter((_, idx) => idx !== i) }); }

  return (
    <Section title="Description">
      <Field label="Key bullet points" hint="Up to 8 short selling points">
        <div className="space-y-2">
          {form.bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={b}
                onChange={(e) => { const next = form.bullets.slice(); next[i] = e.target.value; patch({ bullets: next }); }}
                placeholder={`Bullet ${i + 1}`}
                className={inputCls}
              />
              <button type="button" onClick={() => removeBullet(i)} className="rounded border px-2 py-1 text-xs">×</button>
            </div>
          ))}
          {form.bullets.length < 8 && (
            <button type="button" onClick={addBullet} className="rounded border px-3 py-1 text-xs">+ Add bullet</button>
          )}
        </div>
      </Field>
      <Field label="Long description">
        <textarea
          rows={6}
          value={form.description}
          onChange={(e) => patch({ description: e.target.value })}
          className={inputCls}
        />
      </Field>
    </Section>
  );
}

// ── 4. Pricing ────────────────────────────────────────────────────────────────

function PricingSection({ form, patch }: { form: FormState; patch: (f: Partial<FormState>) => void }) {
  return (
    <Section title="Pricing">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Selling price">
          <input type="number" step="0.01" min="0" value={form.basePrice}
            onChange={(e) => patch({ basePrice: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Compare-at price">
          <input type="number" step="0.01" min="0" value={form.compareAtPrice}
            onChange={(e) => patch({ compareAtPrice: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => patch({ currency: e.target.value })} className={inputCls}>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </Field>
      </div>
    </Section>
  );
}

// ── 5. Inventory ──────────────────────────────────────────────────────────────

function InventorySection({ form, patch }: { form: FormState; patch: (f: Partial<FormState>) => void }) {
  return (
    <Section title="Inventory">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU">
          <input value={form.sku} onChange={(e) => patch({ sku: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Stock">
          <input type="number" min="0" value={form.inventory}
            onChange={(e) => patch({ inventory: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </Section>
  );
}

// ── 6. Variations ─────────────────────────────────────────────────────────────

function VariationsSection({
  mode, sellerProductId, productSlug,
  attrGroups, setAttrGroups, variantRows, setVariantRows, initialVariants, setError,
}: {
  mode: "create" | "edit";
  sellerProductId?: string;
  productSlug: string;
  attrGroups: AttributeGroup[];
  setAttrGroups: React.Dispatch<React.SetStateAction<AttributeGroup[]>>;
  variantRows: VariantOption[];
  setVariantRows: React.Dispatch<React.SetStateAction<VariantOption[]>>;
  initialVariants: VariantOption[];
  setError: (s: string | null) => void;
}) {
  const [savingVariants, setSavingVariants] = useState(false);
  const [uploadingRowKey, setUploadingRowKey] = useState<string | null>(null);
  const [expandedCustRow, setExpandedCustRow] = useState<string | null>(null);
  const [newAttrName, setNewAttrName] = useState("");

  function addAttribute(name: string) {
    const n = name.trim();
    if (!n || attrGroups.some((g) => g.name.toLowerCase() === n.toLowerCase())) return;
    setAttrGroups((prev) => [...prev, { name: n, values: [] }]);
    setNewAttrName("");
  }

  function removeAttribute(name: string) {
    setAttrGroups((prev) => prev.filter((g) => g.name !== name));
    setVariantRows((prev) => prev.filter((r) => r.name !== name));
  }

  function addValueToGroup(groupName: string, value: string) {
    const v = value.trim();
    if (!v) return;
    setAttrGroups((prev) =>
      prev.map((g) => g.name === groupName && !g.values.includes(v) ? { ...g, values: [...g.values, v] } : g),
    );
    setVariantRows((prev) => {
      if (prev.some((r) => r.name === groupName && r.value === v)) return prev;
      return [...prev, { name: groupName, value: v, priceDelta: 0, sku: makeAutoSku(productSlug, groupName, v), inventory: 0, images: [] }];
    });
  }

  function removeValueFromGroup(groupName: string, value: string) {
    setAttrGroups((prev) => prev.map((g) => g.name === groupName ? { ...g, values: g.values.filter((x) => x !== value) } : g));
    setVariantRows((prev) => prev.filter((r) => !(r.name === groupName && r.value === value)));
  }

  function updateRow(key: string, p: Partial<VariantOption>) {
    setVariantRows((prev) => prev.map((r) => rowKey(r) === key ? { ...r, ...p } : r));
  }

  async function handleRowImageUpload(key: string, file: File) {
    setError(null);
    setUploadingRowKey(key);
    try {
      const { url } = await uploadProductFile(file);
      setVariantRows((prev) => prev.map((r) => rowKey(r) === key ? { ...r, images: [...(r.images ?? []), url] } : r));
    } catch (err) {
      setError(getErrorMessage(err, "Upload failed"));
    } finally {
      setUploadingRowKey(null);
    }
  }

  async function handleRowImageUrlImport(key: string, sourceUrl: string) {
    const u = sourceUrl.trim();
    if (!u) return;
    setError(null);
    setUploadingRowKey(key);
    try {
      const { url } = await uploadProductFromUrl(u);
      setVariantRows((prev) => prev.map((r) => rowKey(r) === key ? { ...r, images: [...(r.images ?? []), url] } : r));
    } catch (err) {
      setError(getErrorMessage(err, "URL import failed"));
    } finally {
      setUploadingRowKey(null);
    }
  }

  async function handleSaveAllVariants() {
    if (!sellerProductId) return;
    setSavingVariants(true);
    setError(null);
    try {
      const currentKeys = new Set(variantRows.map((r) => `${r.name}:::${r.value}`));
      const toDelete = initialVariants.filter((r) => r.id && !currentKeys.has(`${r.name}:::${r.value}`));
      for (const r of toDelete) {
        await sellerApi.del(`/seller/products/${sellerProductId}/variants/${r.id}`);
      }
      for (const r of variantRows) {
        if (!r.id) continue;
        await sellerApi.patch(`/seller/products/${sellerProductId}/variants/${r.id}`, {
          priceDelta: r.priceDelta ?? 0,
          sku: r.sku,
          inventory: r.inventory ?? 0,
          image: r.image ?? (r.images && r.images.length > 0 ? r.images[0] : undefined),
          images: r.images,
          customizationMode: r.customizationMode ?? null,
        });
      }
      for (const r of variantRows) {
        if (r.id) continue;
        await sellerApi.post(`/seller/products/${sellerProductId}/variants`, {
          name: r.name, value: r.value,
          priceDelta: r.priceDelta ?? 0, sku: r.sku, inventory: r.inventory ?? 0,
          image: r.image ?? (r.images && r.images.length > 0 ? r.images[0] : undefined),
          images: r.images, customizationMode: r.customizationMode ?? null,
        });
      }
      const fresh = await sellerApi.get<{ product: { variantOptions: VariantOption[] } }>(`/seller/products/${sellerProductId}`);
      const freshVariants = Array.isArray(fresh.product?.variantOptions)
        ? (fresh.product.variantOptions as (VariantOption & { image?: string })[]).map(normalizeVariantOption)
        : [];
      setVariantRows(freshVariants);
      setAttrGroups(groupVariantsByName(freshVariants));
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save variants"));
    } finally {
      setSavingVariants(false);
    }
  }

  return (
    <Section title="Variations" description="Add attribute types (Color, Size…), then add values. One row per value is created in the table below.">
      <div className="flex items-center gap-2">
        <input
          value={newAttrName}
          onChange={(e) => setNewAttrName(e.target.value)}
          placeholder="Attribute name (e.g. Color, Size)"
          className={inputCls + " max-w-xs"}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttribute(newAttrName); } }}
        />
        <button
          type="button"
          onClick={() => addAttribute(newAttrName)}
          disabled={!newAttrName.trim()}
          className="rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          + Add
        </button>
      </div>

      {attrGroups.length === 0 && <p className="text-xs text-muted-foreground">No attributes yet.</p>}

      {attrGroups.map((g) => (
        <AttributeGroupCard
          key={g.name}
          group={g}
          prelistedValues={[]}
          onRemove={() => removeAttribute(g.name)}
          onAddValue={(v) => addValueToGroup(g.name, v)}
          onRemoveValue={(v) => removeValueFromGroup(g.name, v)}
        />
      ))}

      {variantRows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">Variant</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-right">Price (₹)</th>
                <th className="px-3 py-2 text-right">Inventory</th>
                <th className="px-3 py-2 text-left">Image</th>
                <th className="px-3 py-2 text-left">Customise</th>
              </tr>
            </thead>
            <tbody>
              {variantRows.map((r) => {
                const key = rowKey(r);
                const custOpen = expandedCustRow === key;
                return (
                  <Fragment key={key}>
                    <tr className="border-t">
                      <td className="px-3 py-2 max-w-[340px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-muted-foreground shrink-0">{r.name}:</span>
                          <VariantValueCell
                            value={r.value}
                            onChange={(next) => {
                              const trimmed = next.trim();
                              if (!trimmed || trimmed === r.value) return;
                              setVariantRows((rows) => rows.map((row) => rowKey(row) === key ? { ...row, value: trimmed } : row));
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input value={r.sku ?? ""} onChange={(e) => updateRow(key, { sku: e.target.value })} className={inputCls} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="1" min="0" value={r.priceDelta ?? 0}
                          onChange={(e) => updateRow(key, { priceDelta: Math.max(0, Number(e.target.value)) })}
                          className={inputCls + " text-right"} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" value={r.inventory ?? 0}
                          onChange={(e) => updateRow(key, { inventory: Number(e.target.value) })}
                          className={inputCls + " text-right"} />
                      </td>
                      <td className="px-3 py-2">
                        <VariantImageCell
                          images={r.images ?? []}
                          uploading={uploadingRowKey === key}
                          onAdd={(file) => handleRowImageUpload(key, file)}
                          onAddUrl={(url) => handleRowImageUrlImport(key, url)}
                          onRemove={(url) => updateRow(key, { images: (r.images ?? []).filter((u) => u !== url) })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpandedCustRow(custOpen ? null : key)}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors ${r.customizationMode ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40"}`}
                        >
                          🎨 {r.customizationMode ?? "Inherit"}
                        </button>
                      </td>
                    </tr>
                    {custOpen && (
                      <tr className="bg-primary/5 border-t border-primary/10">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">
                              Customisation for <strong>{r.name}: {r.value}</strong>
                            </span>
                            <select
                              value={r.customizationMode ?? ""}
                              onChange={(e) => updateRow(key, { customizationMode: e.target.value || null })}
                              className="text-xs border rounded-md px-2 py-1.5 bg-background focus:ring-1 focus:ring-primary/30 focus:outline-none"
                            >
                              <option value="">Inherit from product</option>
                              <option value="full">Full Canvas</option>
                              <option value="simple">Simple (text / colour only)</option>
                              <option value="template">Template Only</option>
                              <option value="none">Disabled (not customisable)</option>
                            </select>
                            {r.customizationMode && (
                              <button type="button" onClick={() => updateRow(key, { customizationMode: null })} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                                Reset to inherit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {variantRows.length > 0 && (
        <div className="flex justify-end">
          {mode === "create" ? (
            <p className="text-xs text-muted-foreground italic">Variants will be saved when you click &ldquo;Submit for review&rdquo;.</p>
          ) : (
            <button
              type="button"
              onClick={handleSaveAllVariants}
              disabled={savingVariants}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {savingVariants ? "Saving variants..." : "Save all variants"}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

// ── 7. Shipping ───────────────────────────────────────────────────────────────

function ShippingSection({ form, patch }: { form: FormState; patch: (f: Partial<FormState>) => void }) {
  return (
    <Section title="Shipping">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Weight (g)">
          <input type="number" min="0" value={form.weightGrams} onChange={(e) => patch({ weightGrams: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Length (cm)">
          <input type="number" min="0" value={form.dimL} onChange={(e) => patch({ dimL: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Width (cm)">
          <input type="number" min="0" value={form.dimW} onChange={(e) => patch({ dimW: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Height (cm)">
          <input type="number" min="0" value={form.dimH} onChange={(e) => patch({ dimH: e.target.value })} className={inputCls} />
        </Field>
      </div>
    </Section>
  );
}

// ── 8. Customization ──────────────────────────────────────────────────────────

function CustomizationSection({
  form, patch, sellerProductId,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  sellerProductId?: string;
}) {
  return (
    <Section title="Customization">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isCustomizable} onChange={(e) => patch({ isCustomizable: e.target.checked })} />
          Allow buyers to customize this product
        </label>
        {form.isCustomizable && sellerProductId && (
          <a
            href={`/seller/products/${sellerProductId}/customizer`}
            className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-pink-700 transition-colors"
          >
            <span aria-hidden>✨</span>
            Configure customisation →
          </a>
        )}
        {form.isCustomizable && !sellerProductId && (
          <span className="text-[11px] text-muted-foreground italic">Save the product first, then configure zones &amp; masks here.</span>
        )}
      </div>
    </Section>
  );
}

// ── 9. SEO ────────────────────────────────────────────────────────────────────

function SeoSection({ form, patch }: { form: FormState; patch: (f: Partial<FormState>) => void }) {
  return (
    <Section title="SEO">
      <Field label="Meta title">
        <input value={form.seoTitle} onChange={(e) => patch({ seoTitle: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Meta description">
        <textarea rows={3} value={form.seoDescription} onChange={(e) => patch({ seoDescription: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Keywords" hint="Comma-separated">
        <input value={form.seoKeywords} onChange={(e) => patch({ seoKeywords: e.target.value })} className={inputCls} />
      </Field>
    </Section>
  );
}

// ── Sidebar: Review status ────────────────────────────────────────────────────

function ReviewStatusSidebar({
  status, rejectedReason, sellerProductId, onResubmitted,
}: {
  status?: string;
  rejectedReason?: string | null;
  sellerProductId?: string;
  onResubmitted?: () => void;
}) {
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  if (!status) return null;

  const cfgs: Record<string, { label: string; cls: string; desc: string }> = {
    pending:  { label: "In review",  cls: "border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200", desc: "Your listing is being reviewed by the Gifteeng team. You'll be notified once it goes live." },
    approved: { label: "Live",       cls: "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200", desc: "Your listing is approved and visible to buyers." },
    rejected: { label: "Rejected",   cls: "border-red-300 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200", desc: "Your listing was not approved. Correct the issue below, save your changes, then resubmit for review." },
  };
  const cfg = cfgs[status] ?? cfgs.pending;

  async function handleResubmit() {
    if (!sellerProductId) return;
    setResubmitting(true);
    setResubmitError(null);
    try {
      await sellerApi.post(`/seller/products/${sellerProductId}/resubmit`, {});
      onResubmitted?.();
    } catch (e) {
      setResubmitError((e as { message?: string })?.message ?? "Failed to resubmit");
    } finally {
      setResubmitting(false);
    }
  }

  return (
    <Section title="Review status">
      <div className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${cfg.cls}`}>
        {cfg.label}
      </div>
      <p className="text-xs text-muted-foreground">{cfg.desc}</p>
      {status === "rejected" && rejectedReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 px-2.5 py-2">
          <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">Reason from admin:</p>
          <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">{rejectedReason}</p>
        </div>
      )}
      {status === "rejected" && sellerProductId && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Once you've corrected the issue and saved, resubmit for another review.
          </p>
          {resubmitError && (
            <p className="text-xs text-destructive">{resubmitError}</p>
          )}
          <button
            type="button"
            onClick={handleResubmit}
            disabled={resubmitting}
            className="w-full rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {resubmitting ? "Resubmitting..." : "Resubmit for review"}
          </button>
        </div>
      )}
    </Section>
  );
}

// ── Variant helpers ───────────────────────────────────────────────────────────

function AttributeGroupCard({
  group, prelistedValues, onRemove, onAddValue, onRemoveValue,
}: {
  group: AttributeGroup; prelistedValues: string[];
  onRemove: () => void; onAddValue: (v: string) => void; onRemoveValue: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = `vt-values-${group.name}`;

  function commit(raw: string) {
    const v = raw.trim().replace(/,+$/, "");
    if (!v) return;
    onAddValue(v);
    setDraft("");
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{group.name}</h3>
        <button type="button" onClick={onRemove} className="rounded border px-2 py-0.5 text-xs text-destructive">Remove attribute</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5">
        {group.values.map((v) => {
          const MAX = 32;
          const display = v.length > MAX ? v.slice(0, MAX).trimEnd() + "…" : v;
          return (
            <span key={v} title={v} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs max-w-[260px]">
              <span className="truncate">{display}</span>
              <button type="button" onClick={() => onRemoveValue(v)} className="text-muted-foreground hover:text-foreground shrink-0" aria-label={`Remove ${v}`}>×</button>
            </span>
          );
        })}
        <input
          list={listId}
          value={draft}
          onChange={(e) => { const v = e.target.value; if (v.endsWith(",")) commit(v); else setDraft(v); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(draft); } }}
          placeholder={`Add ${group.name.toLowerCase()}...`}
          className="flex-1 min-w-[120px] bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        <datalist id={listId}>
          {prelistedValues.map((v) => <option key={v} value={v} />)}
        </datalist>
      </div>
    </div>
  );
}

function VariantImageCell({
  images, uploading, onAdd, onAddUrl, onRemove,
}: {
  images: string[]; uploading: boolean;
  onAdd: (file: File) => void; onAddUrl?: (url: string) => void; onRemove: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const promptForUrl = () => {
    if (!onAddUrl) return;
    const url = typeof window !== "undefined" ? window.prompt("Paste image URL") : null;
    if (url && url.trim()) onAddUrl(url.trim());
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {images.map((url, i) => (
        <div key={i} className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resolveImageUrl(url)} alt="" className="h-10 w-10 rounded border object-cover" />
          <button type="button" onClick={() => onRemove(url)}
            className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-destructive text-white items-center justify-center text-[9px]">×</button>
          {i === 0 && <span className="absolute -bottom-1 left-0 right-0 text-center text-[7px] text-muted-foreground">main</span>}
        </div>
      ))}
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
        className="h-10 w-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 text-lg"
        title="Add image">
        {uploading ? "…" : "+"}
      </button>
      {onAddUrl && (
        <button type="button" onClick={promptForUrl} disabled={uploading}
          className="h-10 w-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 text-sm"
          title="Add image from URL">🔗</button>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = ""; }} />
    </div>
  );
}

function VariantValueCell({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const MAX = 44;
  const display = value.length > MAX ? value.slice(0, MAX).trimEnd() + "…" : value;

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = () => { onChange(draft); setEditing(false); };

  if (editing) {
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className="flex-1 rounded border border-primary/40 bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
        placeholder="Short name (e.g. Red · Small · Design 1)"
      />
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} title={`${value}\n\nClick to rename`}
      className="flex-1 min-w-0 text-left text-xs truncate rounded px-1 py-0.5 hover:bg-muted/50 hover:text-primary transition-colors">
      <span className="truncate">{display}</span>
      <span className="ml-1 text-muted-foreground opacity-60 text-[10px]">✎</span>
    </button>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function SellerProductEditor({
  mode, sellerProductId, initialProduct, initialOffer, onSaved,
}: SellerProductEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(initialProduct, initialOffer?.price),
  );
  const initialVariantsArr = Array.isArray(initialProduct?.variantOptions)
    ? (initialProduct!.variantOptions as (VariantOption & { image?: string })[]).map(normalizeVariantOption)
    : [];
  const [initialVariants] = useState<VariantOption[]>(initialVariantsArr);
  const [attrGroups, setAttrGroups] = useState<AttributeGroup[]>(() => groupVariantsByName(initialVariantsArr));
  const [variantRows, setVariantRows] = useState<VariantOption[]>(initialVariantsArr);

  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const patch = useCallback(
    (fields: Partial<FormState>) => setForm((prev) => ({ ...prev, ...fields })),
    [],
  );

  useEffect(() => {
    fetch("/api/categories?pageSize=500")
      .then((r) => r.json())
      .then((list: Array<{ name?: string; isActive?: boolean; is_active?: boolean }>) => {
        if (!Array.isArray(list)) return;
        const names = list
          .filter((c) => c?.isActive !== false && c?.is_active !== false)
          .map((c) => c?.name)
          .filter((n): n is string => !!n && n.trim().length > 0);
        setCategories(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = buildPayload(form, mode, attrGroups, initialProduct?.metadata);

      if (mode === "create") {
        await sellerApi.post("/seller/products", payload);
        setSuccess("Product submitted for review");
        onSaved?.();
        router.push("/seller/products");
      } else {
        if (!sellerProductId) throw new Error("Missing listing id");
        await sellerApi.patch(`/seller/products/${sellerProductId}`, payload);
        setSuccess("Changes saved");
        onSaved?.();
      }
    } catch (err) {
      setError(getErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  const productSlug = initialProduct?.slug ?? "";

  return (
    <form onSubmit={handleSave} className="space-y-6 pb-16">
      <StickyHeader mode={mode} title={form.title} saving={saving} error={error} success={success} />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <SectionJumper />
          <BasicsSection form={form} patch={patch} categories={categories} />
          <MediaSection form={form} patch={patch} setError={setError} />
          <DescriptionSection form={form} patch={patch} />
          <PricingSection form={form} patch={patch} />
          <InventorySection form={form} patch={patch} />
          <VariationsSection
            mode={mode}
            sellerProductId={sellerProductId}
            productSlug={productSlug}
            attrGroups={attrGroups}
            setAttrGroups={setAttrGroups}
            variantRows={variantRows}
            setVariantRows={setVariantRows}
            initialVariants={initialVariants}
            setError={setError}
          />
          <ShippingSection form={form} patch={patch} />
          <CustomizationSection form={form} patch={patch} sellerProductId={sellerProductId} />
          <SeoSection form={form} patch={patch} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <ReviewStatusSidebar
            status={initialOffer?.status}
            rejectedReason={initialOffer?.rejectedReason}
            sellerProductId={sellerProductId}
            onResubmitted={() => {
              setSuccess("Resubmitted for review");
              onSaved?.();
            }}
          />
          {mode === "create" && (
            <Section title="Review">
              <p className="text-xs text-muted-foreground">
                New listings are reviewed by the Gifteeng team before going live. This typically takes 1–2 business days.
              </p>
            </Section>
          )}
        </aside>
      </div>
    </form>
  );
}

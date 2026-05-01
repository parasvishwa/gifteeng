"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";

// The admin panel runs on a separate host/subdomain (e.g. super-admin.gifteeng.com
// or an IP in dev), so a bare `/products/<slug>` link 404s there. Build an
// absolute URL to the public storefront. Order of preference:
//   1. NEXT_PUBLIC_SITE_URL (env-configured)
//   2. window.location.origin IFF it's the public storefront (no `super-admin`,
//      no `b2b` marker)
//   3. Fallback to https://gifteeng.com
function publicSiteOrigin(): string {
  const fromEnv = (typeof process !== "undefined"
    && process.env
    && (process.env as any).NEXT_PUBLIC_SITE_URL) as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (!/(super-admin|b2b|admin)/i.test(host)) return window.location.origin;
  }
  return "https://gifteeng.com";
}
function publicSiteProductUrl(slug: string): string {
  const clean = slug.replace(/^\/+/, "");
  return `${publicSiteOrigin()}/products/${clean}`;
}
import { apiB2b, API_BASE_URL } from "@/lib/api";

// ---------- Types ----------

export type ProductImage = {
  url: string;
  alt?: string;
};

export type Dimensions = { l?: number; w?: number; h?: number };

export type ProductSeo = {
  title?: string;
  description?: string;
  keywords?: string[];
};

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
  image?: string;              // single thumbnail (PDP variant swatch uses this)
  images?: string[];            // optional additional media (variant gallery)
  customizationMode?: string | null; // null=inherit | "full" | "simple" | "template" | "none"
};

export type CollectionRef = {
  id: string;
  slug?: string;
  title?: string;
  // The canonical /api/collections endpoint returns `name` (not title/slug).
  // Keep both shapes supported so the sidebar never falls through to a UUID.
  name?: string;
};

function collectionLabel(c: CollectionRef): string {
  return (c.name || c.title || c.slug || c.id || "").trim() || c.id;
}

export type CollectionLink = {
  collection: CollectionRef;
};

export type Product = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  category?: string | null;
  basePrice?: number;
  currency?: string;
  sku?: string | null;
  inventory?: number;
  isCustomizable?: boolean;
  images?: ProductImage[] | null;
  b2cEnabled?: boolean;
  b2bEnabled?: boolean;
  ownerCompanyId?: string | null;
  metadata?: ProductMetadata | null;
  variantOptions?: VariantOption[] | null;
  collectionLinks?: CollectionLink[] | null;
};

export type VariantTypeDef = {
  name: string;
  values: string[];
  // When a value comes from the global attribute templates (Variant Options
  // admin) it may carry a default thumbnail and/or swatch colour. Used to
  // auto-fill the product-level variant row on selection.
  valueMeta?: Record<string, { imageUrl?: string | null; hexColor?: string | null }>;
};

type FormState = {
  title: string;
  slug: string;
  description: string;
  category: string;
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
  b2cEnabled: boolean;
  b2bEnabled: boolean;
  ownerCompanyId: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
};

type ProductEditorProps = {
  mode: "create" | "edit";
  initial?: Partial<Product>;
  productId?: string;
  onSaved?: (p: Product) => void;
};

type AttributeGroup = {
  name: string;
  values: string[];
};

// ---------- Utils ----------

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

function buildInitialForm(initial?: Partial<Product>): FormState {
  const meta = (initial?.metadata ?? {}) as ProductMetadata;
  const bullets = Array.isArray(meta.bullets) ? meta.bullets.slice(0, 8) : [];
  while (bullets.length < 5) bullets.push("");
  return {
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "",
    basePrice:
      initial?.basePrice != null ? String(initial.basePrice) : "",
    compareAtPrice: meta.compareAtPrice != null ? String(meta.compareAtPrice) : "",
    currency: initial?.currency ?? "INR",
    sku: initial?.sku ?? "",
    inventory: initial?.inventory != null ? String(initial.inventory) : "0",
    bullets,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    images: Array.isArray(initial?.images) ? (initial!.images as ProductImage[]) : [],
    weightGrams: meta.weightGrams != null ? String(meta.weightGrams) : "",
    dimL: meta.dimensions?.l != null ? String(meta.dimensions.l) : "",
    dimW: meta.dimensions?.w != null ? String(meta.dimensions.w) : "",
    dimH: meta.dimensions?.h != null ? String(meta.dimensions.h) : "",
    isCustomizable: !!initial?.isCustomizable,
    b2cEnabled: initial?.b2cEnabled ?? true,
    b2bEnabled: initial?.b2bEnabled ?? true,
    ownerCompanyId: initial?.ownerCompanyId ?? "",
    seoTitle: meta.seo?.title ?? "",
    seoDescription: meta.seo?.description ?? "",
    seoKeywords: Array.isArray(meta.seo?.keywords) ? meta.seo!.keywords!.join(", ") : "",
  };
}

function splitCsv(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildPayload(form: FormState, initial?: Partial<Product>): Record<string, unknown> {
  const initialMeta = (initial?.metadata ?? {}) as ProductMetadata;
  const source = initialMeta.source;
  const hasCanvas = !!initialMeta.canvas || !!initialMeta.mockupTemplates;

  const metadata: ProductMetadata = {
    // Preserve any existing metadata keys we don't manage here (source, asin,
    // canvas, brand, bullets from import, etc.) so toggling a checkbox in the
    // editor doesn't wipe Amazon import data or the customizer config.
    ...initialMeta,
    bullets: form.bullets.map((b) => b.trim()).filter(Boolean),
    tags: form.tags,
    compareAtPrice: coerceNumber(form.compareAtPrice),
    weightGrams: coerceNumber(form.weightGrams),
    dimensions: {
      l: coerceNumber(form.dimL),
      w: coerceNumber(form.dimW),
      h: coerceNumber(form.dimH),
    },
    seo: {
      title: form.seoTitle || undefined,
      description: form.seoDescription || undefined,
      keywords: splitCsv(form.seoKeywords),
    },
  };

  // Auto-seed a working Simple customizer when an Amazon-imported product
  // is first flipped to customizable. Previously the variant-level "inherit"
  // option referenced nothing, so the customizer was broken on the front
  // end. With this default, "inherit" resolves to a real Simple zone
  // config and the customer can customise immediately.
  if (form.isCustomizable && !hasCanvas && source === "amazon") {
    metadata.canvas = {
      editor: "simple",
      useProductImageAsBase: true,
      baseImage: "",
      overlayImage: "",
      masks: [],
      limits: { maxImages: 1, maxTexts: 1 },
      imageZones: [
        { id: "z1", label: "Your photo", x: 25, y: 25, w: 50, h: 50, shape: "free" },
      ],
      textZones: [],
    };
  }

  return {
    title: form.title,
    description: form.description || undefined,
    category: form.category || undefined,
    basePrice: coerceNumber(form.basePrice) ?? 0,
    currency: form.currency || "INR",
    sku: form.sku || undefined,
    inventory: coerceNumber(form.inventory) ?? 0,
    isCustomizable: form.isCustomizable,
    images: form.images,
    b2cEnabled: form.b2cEnabled,
    b2bEnabled: form.b2bEnabled,
    ...(form.ownerCompanyId.trim() ? { ownerCompanyId: form.ownerCompanyId.trim() } : {}),
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
  const base = (slug || "NEW").toUpperCase();
  const a = attrName.slice(0, 3).toUpperCase();
  const v = value.slice(0, 8).toUpperCase().replace(/\W/g, "");
  return `${base}-${a}-${v}`;
}

// ---------- Upload ----------

async function uploadProductFile(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("gifteeng.b2b.token")
      : null;
  const res = await fetch(`${API_BASE_URL}/api/files/upload/product`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Audience": "b2b",
    },
    body: fd,
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (body && typeof body === "object" && (body.message || body.error)) ||
      `Upload failed (${res.status})`;
    throw new Error(String(message));
  }
  return { url: body.url as string };
}

/**
 * Download an external image URL (e.g. Amazon product photo) server-side and
 * persist it to our own uploads store. Returns the resulting hosted URL so
 * the product always loads from our server.
 */
async function uploadProductFromUrl(sourceUrl: string): Promise<{ url: string }> {
  const url = sourceUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("URL must start with http:// or https://");
  }
  const res = await apiB2b().post<{ url: string }>("/api/files/upload-from-url", {
    url,
    ownerType: "product",
  });
  if (!res?.url) throw new Error("Import failed — server returned no URL");
  return { url: res.url };
}

// ---------- AI helpers ----------

type AiContext = {
  title?: string;
  description?: string;
  category?: string;
  bullets?: string[];
  tags?: string[];
  basePrice?: string;
  currency?: string;
};

function formatAiContext(ctx: AiContext): string {
  const parts: string[] = [];
  if (ctx.title) parts.push(`Title: ${ctx.title}`);
  if (ctx.category) parts.push(`Category: ${ctx.category}`);
  if (ctx.basePrice) parts.push(`Price: ${ctx.basePrice} ${ctx.currency ?? "INR"}`);
  if (ctx.tags?.length) parts.push(`Tags: ${ctx.tags.join(", ")}`);
  if (ctx.bullets?.filter(Boolean).length) {
    parts.push(`Current bullets:\n- ${ctx.bullets.filter(Boolean).join("\n- ")}`);
  }
  if (ctx.description) {
    const plain = ctx.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (plain) parts.push(`Current description: ${plain.slice(0, 800)}`);
  }
  return parts.join("\n");
}

async function aiWrite(prompt: string, field: string, ctx: AiContext): Promise<string> {
  const res = await apiB2b().post<{ text: string }>("/api/ai/write", {
    prompt,
    field,
    context: formatAiContext(ctx),
  });
  const t = (res?.text ?? "").trim();
  if (!t) throw new Error("AI returned empty response");
  if (t.startsWith("⚠️")) throw new Error(t.replace(/^⚠️\s*/, ""));
  return t;
}

async function aiGenerateImage(prompt: string, referenceImageUrl?: string): Promise<string> {
  // When a reference image is present we ask the AI to preserve the subject
  // — this keeps all generated shots of the same physical SKU consistent
  // (different angle / background / lifestyle, but same product).
  const res = await apiB2b().post<{ url: string }>("/api/ai/generate-image", {
    prompt,
    referenceImageUrl,
  });
  if (!res?.url) throw new Error("AI image generation returned no URL");
  // Base64 data URLs (from gpt-image-1 /edits) need to go through a
  // different upload path than remote URLs. We handle both here.
  if (res.url.startsWith("data:")) {
    const mirror = await apiB2b().post<{ url: string }>("/api/files/upload-from-data-url", {
      dataUrl: res.url,
      ownerType: "product",
    }).catch(async () => {
      // Fallback: the data-url endpoint may not exist — POST to files/upload
      // directly as a base64 blob. We just return the data URL if neither works.
      return null;
    });
    return mirror?.url || res.url;
  }
  const mirror = await apiB2b().post<{ url: string }>("/api/files/upload-from-url", {
    url: res.url,
    ownerType: "product",
  });
  return mirror?.url || res.url;
}

function parseJsonArray(raw: string): string[] {
  const t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    // Fall through to line/bullet parsing
  }
  return t
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
}

// ---------- AI button ----------

function AiButton({
  label = "AI",
  title: btnTitle = "Regenerate with AI",
  loading = false,
  onClick,
  variant = "ghost",
}: {
  label?: string;
  title?: string;
  loading?: boolean;
  onClick: () => void;
  variant?: "ghost" | "solid";
}) {
  const base = "inline-flex items-center gap-1 rounded-md text-xs font-medium transition disabled:opacity-50";
  const styles =
    variant === "solid"
      ? "bg-gradient-to-r from-fuchsia-500 to-violet-600 px-3 py-1.5 text-white hover:opacity-90"
      : "border bg-background px-2 py-1 text-muted-foreground hover:border-fuchsia-500 hover:text-fuchsia-600";
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      title={btnTitle}
      className={`${base} ${styles}`}
    >
      <span className={loading ? "animate-spin" : ""}>✨</span>
      <span>{loading ? "…" : label}</span>
    </button>
  );
}

// ---------- Root component ----------

export default function ProductEditor({
  mode,
  initial,
  productId,
  onSaved,
}: ProductEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(initial));
  const [initialVariants] = useState<VariantOption[]>(
    Array.isArray(initial?.variantOptions)
      ? (initial!.variantOptions as (VariantOption & { image?: string })[]).map(normalizeVariantOption)
      : [],
  );
  const [attrGroups, setAttrGroups] = useState<AttributeGroup[]>(() =>
    groupVariantsByName(
      Array.isArray(initial?.variantOptions)
        ? (initial!.variantOptions as (VariantOption & { image?: string })[]).map(normalizeVariantOption)
        : [],
    ),
  );
  const [variantRows, setVariantRows] = useState<VariantOption[]>(
    Array.isArray(initial?.variantOptions)
      ? (initial!.variantOptions as (VariantOption & { image?: string })[]).map(normalizeVariantOption)
      : [],
  );

  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    Array.isArray(initial?.collectionLinks)
      ? (initial!.collectionLinks as CollectionLink[]).map((cl) => cl.collection.id)
      : [],
  );

  const [categories, setCategories] = useState<string[]>([]);
  const [variantTypes, setVariantTypes] = useState<VariantTypeDef[]>([]);
  const [collections, setCollections] = useState<CollectionRef[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const patch = useCallback(
    (fields: Partial<FormState>) => setForm((prev) => ({ ...prev, ...fields })),
    [],
  );

  // Reference lists fetched once.
  // Category source = ONLY the DB Category table (/api/categories). We used
  // to merge the distinct free-text column values in, which is how typo
  // variants ("Stationery" vs "Stationeries") kept propagating. Dropped.
  useEffect(() => {
    apiB2b().get<Array<{ name?: string; isActive?: boolean; is_active?: boolean }>>("/api/categories?pageSize=500")
      .then((list) => {
        if (!Array.isArray(list)) { setCategories([]); return; }
        const names = list
          .filter((c) => c?.isActive !== false && c?.is_active !== false)
          .map((c) => c?.name)
          .filter((n): n is string => !!n && n.trim().length > 0);
        setCategories(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => setCategories([]));
    apiB2b()
      .get<VariantTypeDef[]>("/api/products/variant-types/list")
      .then((res) => setVariantTypes(Array.isArray(res) ? res : []))
      .catch(() => setVariantTypes([]));
    apiB2b()
      .get<CollectionRef[]>("/api/collections")
      .then((res) => setCollections(Array.isArray(res) ? res : []))
      .catch(() => setCollections([]));
  }, []);

  async function persistCollections(id: string) {
    try {
      await apiB2b().patch(`/api/products/${id}/collections`, {
        collectionIds: selectedCollectionIds,
      });
    } catch (err) {
      throw new Error(getErrorMessage(err, "Failed to update collections"));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = buildPayload(form, initial);
      let savedId: string;
      let savedProduct: Product;
      if (mode === "create") {
        savedProduct = await apiB2b().post<Product>("/api/products", payload);
        savedId = savedProduct.id;
        // Persist any variants the user added before hitting Create
        for (const r of variantRows) {
          await apiB2b().post(`/api/products/admin/${savedId}/variants`, {
            name: r.name,
            value: r.value,
            priceDelta: r.priceDelta ?? 0,
            sku: r.sku || undefined,
            inventory: r.inventory ?? 0,
            // Send both so the PDP variant swatch has a thumbnail even if
            // the client only filled the images[] array.
            image: r.image ?? (r.images && r.images.length > 0 ? r.images[0] : undefined),
            images: r.images,
          });
        }
      } else {
        if (!productId) throw new Error("Missing product id");
        savedProduct = await apiB2b().patch<Product>(
          `/api/products/${productId}`,
          payload,
        );
        savedId = productId;

        // ── Save variants alongside the main product save ──────────────────
        // Delete variant rows that were removed since the page loaded
        const currentKeys = new Set(variantRows.map((r) => `${r.name}:::${r.value}`));
        const toDelete = initialVariants.filter(
          (r) => r.id && !currentKeys.has(`${r.name}:::${r.value}`),
        );
        for (const r of toDelete) {
          try { await apiB2b().delete(`/api/products/admin/variants/${r.id}`); } catch { /* non-fatal */ }
        }
        // Update existing rows — priceDelta / inventory / sku / customizationMode may have changed
        for (const r of variantRows) {
          if (!r.id) continue;
          try {
            await apiB2b().patch(`/api/products/admin/variants/${r.id}`, {
              priceDelta: r.priceDelta ?? 0,
              sku: r.sku,
              inventory: r.inventory ?? 0,
              image: r.image ?? (r.images && r.images.length > 0 ? r.images[0] : undefined),
              images: r.images,
              customizationMode: r.customizationMode ?? null,
            });
          } catch { /* non-fatal */ }
        }
        // Create variant rows that don't yet have a server id
        const newRows = variantRows.filter((r) => !r.id);
        for (const r of newRows) {
          await apiB2b().post(`/api/products/admin/${savedId}/variants`, {
            name: r.name,
            value: r.value,
            priceDelta: r.priceDelta ?? 0,
            sku: r.sku || undefined,
            inventory: r.inventory ?? 0,
            image: r.image ?? (r.images && r.images.length > 0 ? r.images[0] : undefined),
            images: r.images,
          });
        }
        // Re-fetch to hydrate server-assigned IDs so a second Save doesn't re-create
        if (newRows.length > 0 || toDelete.length > 0) {
          try {
            const fresh = await apiB2b().get<Product>(`/api/products/${form.slug}`);
            const fv = Array.isArray(fresh.variantOptions)
              ? (fresh.variantOptions as (VariantOption & { image?: string })[]).map(normalizeVariantOption)
              : [];
            setVariantRows(fv);
            setAttrGroups(groupVariantsByName(fv));
          } catch { /* non-fatal — UI stays consistent, IDs hydrate on next page load */ }
        }
      }
      await persistCollections(savedId);
      setSuccess(mode === "create" ? "Product created" : "Changes saved");
      onSaved?.(savedProduct);
    } catch (err) {
      setError(getErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!productId) return;
    if (!window.confirm("Delete this product? It will be soft-deleted.")) return;
    setDeleting(true);
    setError(null);
    try {
      await apiB2b().delete(`/api/products/admin/${productId}`);
      router.push("/super-admin/products");
    } catch (err) {
      setError(getErrorMessage(err, "Delete failed"));
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 pb-16">
      <StickyHeader
        mode={mode}
        title={form.title}
        slug={form.slug}
        saving={saving}
        error={error}
        success={success}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Visibility banner — fires a loud warning when the product is
              saved but not enabled on the customer-facing website. Most
              common cause of "I see it in admin but not on the site". */}
          {!form.b2cEnabled && !form.b2bEnabled && (
            <div
              className="rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-white flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-amber-900 dark:text-amber-200">
                  Hidden from website
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  This product is saved but not visible to anyone yet. Turn it on below and Save to publish.
                </p>
              </div>
              <button
                type="button"
                onClick={() => patch({ b2cEnabled: true })}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-black text-white shadow-md transition-transform active:scale-95"
                style={{ background: "linear-gradient(135deg,#c2185b,#6a1b9a)" }}
              >
                Publish to website
              </button>
            </div>
          )}
          {form.b2cEnabled && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-3 flex items-center gap-2 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-bold text-emerald-800 dark:text-emerald-300">
                Live on the website
              </span>
              {form.slug && (
                <a
                  href={publicSiteProductUrl(form.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 hover:underline font-semibold"
                >
                  View on site →
                </a>
              )}
            </div>
          )}

          <AiAllBanner form={form} patch={patch} setError={setError} />
          <SectionJumper />
          <BasicsSection
            mode={mode}
            form={form}
            patch={patch}
            categories={categories}
            setError={setError}
          />
          <MediaSection form={form} patch={patch} setError={setError} />
          <DescriptionSection form={form} patch={patch} setError={setError} />
          <PricingSection form={form} patch={patch} />
          <InventorySection form={form} patch={patch} />
          <VariationsSection
            mode={mode}
            productId={productId}
            productSlug={form.slug}
            variantTypes={variantTypes}
            attrGroups={attrGroups}
            setAttrGroups={setAttrGroups}
            variantRows={variantRows}
            setVariantRows={setVariantRows}
            initialVariants={initialVariants}
            setError={setError}
          />
          <ShippingSection form={form} patch={patch} />
          <CustomizationSection form={form} patch={patch} productId={productId} />
          <SeoSection form={form} patch={patch} setError={setError} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          <PublishingSidebar form={form} patch={patch} />
          <CollectionsSidebar
            collections={collections}
            selectedIds={selectedCollectionIds}
            setSelectedIds={setSelectedCollectionIds}
          />
          <StatusSidebar
            mode={mode}
            onDelete={handleDelete}
            deleting={deleting}
          />
        </aside>
      </div>
    </form>
  );
}

// ---------- Sticky header ----------

function StickyHeader({
  mode,
  title,
  slug,
  saving,
  error,
  success,
}: {
  mode: "create" | "edit";
  title: string;
  slug: string;
  saving: boolean;
  error: string | null;
  success: string | null;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/super-admin/products"
            className="text-xs text-muted-foreground hover:underline"
          >
            &larr; Back to products
          </Link>
          <h1 className="truncate text-xl font-bold">
            {title.trim() || (mode === "create" ? "New product" : "Untitled")}
          </h1>
          {mode === "edit" && slug && (
            <div className="truncate text-xs text-muted-foreground">/{slug}</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-destructive">{error}</span>}
          {success && !error && (
            <span className="text-sm text-green-600">{success}</span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving..." : mode === "create" ? "Create product" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Section shell ----------

// Slug the section title so we can anchor-link to it from the sticky sub-nav.
function sectionSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const id = `sec-${sectionSlug(title)}`;
  return (
    <section id={id} className="scroll-mt-20 rounded-md border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// Sticky section jumper — sits under the page header so the admin can
// bounce between Basics / Media / Pricing / SEO without scrolling.
// Clicking an item smooth-scrolls to the anchor.
function SectionJumper() {
  const items = [
    "Basics", "Media", "Description", "Pricing", "Inventory",
    "Variations", "Shipping", "Customization", "SEO",
  ];
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

function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </span>
        {action}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-md border bg-background px-3 py-1.5 text-sm";

// ---------- AI: Regenerate-all banner ----------

function AiAllBanner({
  form,
  patch,
  setError,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  setError: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const ctx = (): AiContext => ({
    title: form.title,
    description: form.description,
    category: form.category,
    bullets: form.bullets,
    tags: form.tags,
    basePrice: form.basePrice,
    currency: form.currency,
  });

  async function runAll() {
    if (form.title.trim().length < 4) {
      setError("Please set a Title first — AI uses it as the anchor for everything else.");
      return;
    }
    const hasDescription = form.description.trim().length >= 20;
    const hasTags = (form.tags ?? []).length > 0;
    const hasCategory = form.category.trim().length > 0;
    if (!hasDescription && !hasTags && !hasCategory) {
      setError("Add a short description, a category, or a few tags before using AI. Without any context the model returns generic placeholder text.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const next: Partial<FormState> = {};

      setProgress("Title…");
      try {
        const t = await aiWrite(
          `Rewrite the product title. Current: "${form.title}". Keep the core meaning; make it catchy, SEO-friendly, under 80 characters.`,
          "title",
          ctx(),
        );
        next.title = t.replace(/^["']|["']$/g, "");
      } catch {}

      setProgress("Bullets…");
      try {
        const t = await aiWrite(
          "Generate exactly 5 bullet points highlighting key features and gifting value. Each 10-15 words. Return as JSON array of strings.",
          "seo_bullets",
          ctx(),
        );
        const arr = parseJsonArray(t).slice(0, 8);
        const b = arr.slice();
        while (b.length < 5) b.push("");
        next.bullets = b;
      } catch {}

      setProgress("Description…");
      try {
        const t = await aiWrite(
          // SEO-ready long description: opening benefit, use-case paragraph,
// material/spec paragraph, gift occasion paragraph, CTA. Target 180-280
// words (enough for Google to rank, short enough not to bury specs).
// Uses H2 subheads so the page picks up semantic structure in SERPs.
`Write an SEO-optimized product long description in HTML. Return 180–280 words structured as:
  1. Opening paragraph: what the product is + who it's for (primary keyword in first sentence)
  2. <h2>Why customers love it</h2> — 2–3 benefit-driven bullet sentences as <p> (not <ul>)
  3. <h2>Personalization details</h2> — how they can customize (photo, name, message, etc.)
  4. <h2>Perfect for</h2> — 3–4 occasions/recipients (birthday, anniversary, boss, teacher…)
  5. Closing paragraph with a soft CTA (e.g. "Make it yours today.")
Rules: <p>, <h2>, <strong> only. No markdown. No emoji in headings. Do NOT repeat the product title verbatim more than twice.`,
          "description",
          ctx(),
        );
        next.description = t;
      } catch {}

      setProgress("SEO…");
      try {
        const t = await aiWrite(
          "Write an SEO meta title. Max 60 characters. Include the primary keyword. Return only the title text.",
          "seo_meta_title",
          ctx(),
        );
        next.seoTitle = t.replace(/^["']|["']$/g, "").slice(0, 60);
      } catch {}
      try {
        const t = await aiWrite(
          "Write an SEO meta description. Max 160 characters. Include a call-to-action and primary keyword. Return only the description.",
          "seo_meta_description",
          ctx(),
        );
        next.seoDescription = t.replace(/^["']|["']$/g, "").slice(0, 160);
      } catch {}
      try {
        const t = await aiWrite(
          "Generate exactly 10 SEO keywords relevant to the product. Return as a comma-separated list on one line.",
          "seo_keywords",
          ctx(),
        );
        next.seoKeywords = t.replace(/\n+/g, ", ").replace(/\s*,\s*/g, ", ").trim();
      } catch {}

      patch(next);
    } catch (err) {
      setError(getErrorMessage(err, "AI regenerate all failed"));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-violet-50 to-indigo-50 px-4 py-3 dark:border-fuchsia-900/40 dark:from-fuchsia-950/30 dark:via-violet-950/30 dark:to-indigo-950/30">
      <div>
        <div className="text-sm font-semibold">✨ AI copy & media</div>
        <div className="text-xs text-muted-foreground">
          {busy
            ? `Generating ${progress}`
            : "Regenerate every text field at once, or use the AI button on each field."}
        </div>
      </div>
      <AiButton
        variant="solid"
        label={busy ? "Generating…" : "Regenerate all"}
        loading={busy}
        onClick={runAll}
      />
    </div>
  );
}

// ---------- 1. Basics ----------

function BasicsSection({
  mode,
  form,
  patch,
  categories,
  setError,
}: {
  mode: "create" | "edit";
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  categories: string[];
  setError: (s: string | null) => void;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const ctx = (): AiContext => ({
    title: form.title,
    description: form.description,
    category: form.category,
    bullets: form.bullets,
    tags: form.tags,
    basePrice: form.basePrice,
    currency: form.currency,
  });

  async function regenField(key: string, prompt: string, field: string, apply: (t: string) => void) {
    setError(null);
    setBusy(key);
    try {
      const t = await aiWrite(prompt, field, ctx());
      apply(t);
    } catch (err) {
      setError(getErrorMessage(err, "AI request failed"));
    } finally {
      setBusy(null);
    }
  }

  function addTag(raw: string) {
    const v = raw.trim().replace(/,+$/, "");
    if (!v) return;
    if (form.tags.includes(v)) return;
    patch({ tags: [...form.tags, v] });
    setTagDraft("");
  }
  function removeTag(t: string) {
    patch({ tags: form.tags.filter((x) => x !== t) });
  }

  return (
    <Section title="Basics">
      <Field
        label="Title"
        action={
          <AiButton
            loading={busy === "title"}
            onClick={() =>
              regenField(
                "title",
                // SEO-first prompt: primary keyword leads, benefit follows,
                // length sits in the 55–65 char Google SERP sweet spot.
                `Rewrite this product's title for Google SEO. Current title: "${form.title}".
Rules:
- Primary keyword (the product type, e.g. "Acrylic Desk Name Plate") in the first 3 words.
- Include ONE differentiator: "personalized" OR "custom" OR "engraved" OR a clear benefit.
- Include the gift recipient / occasion when obvious (e.g. "for Boss", "for Doctor", "for Birthdays").
- 55–65 characters total. No ALL CAPS, no exclamation marks, no emojis.
- Return ONLY the title — no quotes, no labels, one line.`,
                "title",
                (t) => patch({ title: t.replace(/^["']|["']$/g, "") }),
              )
            }
          />
        }
      >
        <input
          required
          value={form.title}
          onChange={(e) => patch({ title: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Slug">
        {mode === "edit" ? (
          <div className="rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-sm text-muted-foreground">
            /{form.slug}
          </div>
        ) : (
          <input
            disabled
            placeholder="auto-generated from title"
            className={inputCls + " cursor-not-allowed opacity-60"}
            value=""
            onChange={() => {}}
          />
        )}
      </Field>
      <Field label="Category" hint="Pick from existing or add a new one">
        <CategoryPicker
          value={form.category}
          options={categories}
          onChange={(val) => patch({ category: val })}
          inputCls={inputCls}
        />
      </Field>
      <Field
        label="Tags"
        hint="Press Enter or comma to add"
        action={
          <AiButton
            label="AI tags"
            loading={busy === "tags"}
            onClick={() =>
              regenField(
                "tags",
                // Upgraded SEO tag prompt: covers recipients, occasions,
                // material/attribute, and long-tail queries — not just title
                // word splits. Target 12-15 diverse tags per product.
                `Generate 12–15 SEO tags for this product.
Mix of:
  (a) Recipient (e.g. "for boss", "for teacher", "for mom")
  (b) Occasion  (e.g. "birthday gift", "anniversary gift", "raksha bandhan", "diwali")
  (c) Attribute (material, size, colour, "personalized", "engraved", "custom")
  (d) Long-tail search phrase a buyer would actually type
  (e) Category synonyms
Rules: lower-case, 2–4 words each, NO duplicates, NO the current title words verbatim.
Return ONLY a JSON array of strings, nothing else.`,
                "features",
                (t) => {
                  const arr = parseJsonArray(t).slice(0, 15);
                  const merged = Array.from(new Set([...form.tags, ...arr]));
                  patch({ tags: merged });
                },
              )
            }
          />
        }
      >
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5">
          {form.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => {
              const v = e.target.value;
              if (v.endsWith(",")) addTag(v);
              else setTagDraft(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tagDraft);
              } else if (e.key === "Backspace" && !tagDraft && form.tags.length > 0) {
                removeTag(form.tags[form.tags.length - 1]);
              }
            }}
            placeholder={form.tags.length ? "" : "gift, premium, handmade"}
            className="flex-1 min-w-[120px] bg-transparent px-1 py-0.5 text-sm outline-none"
          />
        </div>
      </Field>
    </Section>
  );
}

// ---------- 2. Media ----------

function MediaSection({
  form,
  patch,
  setError,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  setError: (s: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [aiIdx, setAiIdx] = useState<number | null>(null);
  // Preview dialog shown BEFORE we destroy the existing image — user must explicitly pick
  const [aiPreview, setAiPreview] = useState<{
    index: number;
    oldUrl: string;
    oldAlt: string;
    newUrl: string;
    promptUsed: string;
  } | null>(null);
  // Lightweight undo banner shown AFTER accept — lets the user revert to the original URL
  const [undoState, setUndoState] = useState<{ index: number; oldUrl: string; newUrl: string } | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image prompt strategy:
  //   - When a reference image is present, we lock the model into PRESERVE
  //     mode: the exact same product (shape/text/graphics/colours) must be
  //     kept; ONLY the background, lighting and composition change. This is
  //     the whole point of image-to-image for e-commerce.
  //   - When there's no reference (generating from text only), we describe
  //     the product and let the model invent one.
  // The model receives both modes' prompts — it's the "Preserve" wording
  // that actually constrains gpt-image-1 enough to stop inventing a new SKU.
  function buildImagePrompt(i?: number, hasReference?: boolean, userHint?: string): string {
    const altHint = typeof i === "number" && form.images[i]?.alt ? form.images[i].alt : "";
    if (hasReference) {
      // Preserve-subject prompt. Capitalised KEY words to keep the model on
      // track — gpt-image-1 pays more attention to ALL-CAPS instructions.
      return [
        "KEEP THE PRODUCT IN THE REFERENCE IMAGE EXACTLY — same shape, same artwork, same text, same colours, same material.",
        "Do NOT invent a new product, do NOT add new text, do NOT change the graphic or typography.",
        userHint || "Replace ONLY the background: clean soft pastel studio, subtle soft shadow, centred composition, bright natural light.",
        altHint ? `Optional composition hint: ${altHint}.` : "",
        "Photorealistic, high-resolution e-commerce product photography, 1:1 square.",
      ].filter(Boolean).join(" ");
    }
    // No reference — legacy text-to-image path.
    return [
      form.title ? `Product photo of ${form.title}` : "Product photo",
      form.category ? `Category: ${form.category}` : "",
      altHint ? `Style/details: ${altHint}` : "",
      userHint || "",
      "Clean studio background, soft shadow, high-resolution e-commerce style, centred composition.",
    ].filter(Boolean).join(". ");
  }

  async function regenImage(i: number) {
    setError(null);
    // Ask for an optional background hint so admins can steer the regen
    // without re-opening a full dialog. Empty → default "clean pastel studio".
    const hint = typeof window !== "undefined"
      ? window.prompt(
          "Background / composition hint (optional):\n\nExamples:\n• clean white studio with soft shadow\n• festive Diwali setting with marigolds\n• minimalist beige with one prop\n• wooden desk top with sunlight",
          "clean pastel studio, soft diffused light, subtle shadow",
        )
      : "";
    // Cancelled? Leave early.
    if (hint === null) return;
    setAiIdx(i);
    try {
      // ALWAYS use the current image AS the reference so the subject is
      // preserved (same product, new background). Previously the MAIN image
      // (index 0) skipped the reference, so gpt-image-1 was free to invent
      // a brand-new product matching the title — the symptom users reported.
      const refUrl = form.images[i]?.url || form.images[0]?.url;
      const prompt = buildImagePrompt(i, !!refUrl, hint.trim() || undefined);
      const url = await aiGenerateImage(prompt, refUrl);
      // Show preview — DO NOT replace the original until the user confirms
      setAiPreview({
        index: i,
        oldUrl: form.images[i]?.url ?? "",
        oldAlt: form.images[i]?.alt ?? "",
        newUrl: url,
        promptUsed: prompt,
      });
    } catch (err) {
      setError(getErrorMessage(err, "AI image generation failed"));
    } finally {
      setAiIdx(null);
    }
  }

  function acceptAiPreview() {
    if (!aiPreview) return;
    const next = form.images.slice();
    next[aiPreview.index] = { ...next[aiPreview.index], url: aiPreview.newUrl };
    patch({ images: next });
    setUndoState({ index: aiPreview.index, oldUrl: aiPreview.oldUrl, newUrl: aiPreview.newUrl });
    setAiPreview(null);
  }

  // Keep original AND append the AI shot as a new image. Used when the AI
  // generated a great angle/lifestyle variation we want to KEEP alongside the
  // hero shot instead of replacing it.
  function keepBothAiPreview() {
    if (!aiPreview) return;
    const next = [...form.images, { url: aiPreview.newUrl, alt: "" }];
    patch({ images: next });
    setAiPreview(null);
  }

  function rejectAiPreview() {
    setAiPreview(null);
  }

  async function retryAiPreview() {
    if (!aiPreview) return;
    setAiIdx(aiPreview.index);
    try {
      // Retry keeps the same reference — the previous generation came from
      // the slot at aiPreview.index, so the original URL there is what we
      // want to preserve (subject identity stays stable across retries).
      const refUrl = form.images[aiPreview.index]?.url || form.images[0]?.url;
      const url = await aiGenerateImage(aiPreview.promptUsed, refUrl);
      setAiPreview({ ...aiPreview, newUrl: url });
    } catch (err) {
      setError(getErrorMessage(err, "AI image generation failed"));
    } finally {
      setAiIdx(null);
    }
  }

  function undoLastReplace() {
    if (!undoState) return;
    const next = form.images.slice();
    if (next[undoState.index] && next[undoState.index].url === undoState.newUrl) {
      next[undoState.index] = { ...next[undoState.index], url: undoState.oldUrl };
      patch({ images: next });
    }
    setUndoState(null);
  }

  async function generateNewImage() {
    setError(null);
    setAiIdx(-1);
    try {
      const prompt = [
        form.title ? `Product photo of ${form.title}` : "Product photo",
        form.category ? `Category: ${form.category}` : "",
        "Clean studio background, soft shadow, high-resolution e-commerce style.",
      ]
        .filter(Boolean)
        .join(". ");
      // Use the main image as reference so the new shot stays on-subject.
      const url = await aiGenerateImage(prompt, form.images[0]?.url);
      patch({ images: [...form.images, { url, alt: "" }] });
    } catch (err) {
      setError(getErrorMessage(err, "AI image generation failed"));
    } finally {
      setAiIdx(null);
    }
  }

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
      // Accept one URL per line — lets admin paste a bunch of Amazon links at once.
      const urls = raw.split(/[\r\n]+/).map(u => u.trim()).filter(Boolean);
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
      {undoState && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <span className="text-amber-900 dark:text-amber-200">
            Image #{undoState.index + 1} replaced with AI version.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undoLastReplace}
              className="rounded-md border border-amber-500 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoState(null)}
              className="text-xs text-amber-700 hover:text-amber-900"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {aiPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={rejectAiPreview}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-background p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">Preview AI image</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pick which one to keep. Your original is not replaced until you confirm.
                </p>
              </div>
              <button
                type="button"
                onClick={rejectAiPreview}
                className="rounded-md px-2 py-1 text-lg text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-muted-foreground">Original</div>
                {aiPreview.oldUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveImageUrl(aiPreview.oldUrl)}
                    alt={aiPreview.oldAlt}
                    className="w-full rounded-md border bg-muted object-contain"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    (no original)
                  </div>
                )}
                <button
                  type="button"
                  onClick={rejectAiPreview}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  Keep original
                </button>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase text-fuchsia-600 dark:text-fuchsia-400">
                  AI generated
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveImageUrl(aiPreview.newUrl)}
                  alt="AI generated"
                  className="w-full rounded-md border-2 border-fuchsia-300 bg-muted object-contain"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={retryAiPreview}
                    disabled={aiIdx !== null}
                    className="flex-1 min-w-[110px] rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    title="Generate a different image with the same prompt"
                  >
                    {aiIdx !== null ? "Regenerating…" : "↻ Try again"}
                  </button>
                  <button
                    type="button"
                    onClick={keepBothAiPreview}
                    className="flex-1 min-w-[110px] rounded-md border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
                    title="Keep original and add the AI image as an additional gallery image"
                  >
                    + Keep both
                  </button>
                  <button
                    type="button"
                    onClick={acceptAiPreview}
                    className="flex-1 min-w-[110px] rounded-md bg-gradient-to-r from-fuchsia-500 to-violet-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Use AI image
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  <span className="font-semibold">+ Keep both</span> appends the AI shot as a new gallery image. <span className="font-semibold">Use AI image</span> replaces the original in this slot.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (dragIndex == null) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (dragIndex != null) return;
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
          }
        }}
        className={`rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
        }`}
      >
        <p className="text-muted-foreground">
          {uploading ? "Uploading..." : "Drop images here or"}{" "}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-primary underline"
          >
            browse
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {/* Import from URL (e.g. Amazon product photo — downloaded to our server) */}
        <div
          className="mt-3 mx-auto max-w-2xl flex flex-col gap-1 sm:flex-row sm:items-start"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Paste image URL(s) — e.g. Amazon product photo. One per line for multiple."
            rows={2}
            className={`${inputCls} flex-1 resize-y text-xs`}
            onKeyDown={(e) => {
              if ((e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                void handleUrlImport();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleUrlImport()}
            disabled={uploading || !urlDraft.trim()}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50 sm:self-stretch whitespace-nowrap"
            title="Download image(s) from URL to our server"
          >
            {uploading ? "Importing…" : "Import from URL"}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          URLs are downloaded to our storage so the product never hotlinks to external hosts.
        </p>
        <div className="mt-3 flex justify-center">
          <AiButton
            variant="solid"
            label="Generate with AI"
            loading={aiIdx === -1}
            onClick={generateNewImage}
          />
        </div>
      </div>

      {form.images.length > 0 && (
        <ul className="space-y-2">
          {form.images.map((img, i) => (
            <li
              key={`${img.url}-${i}`}
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex != null && dragIndex !== i) moveImage(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-3 rounded-md border bg-background p-2 ${
                dragIndex === i ? "opacity-50" : ""
              }`}
            >
              <span
                className="cursor-grab select-none px-1 text-muted-foreground"
                title="Drag to reorder"
              >
                ⋮⋮
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveImageUrl(img.url)}
                alt={img.alt ?? ""}
                className="h-14 w-14 rounded object-cover"
              />
              <div className="flex-1 min-w-0">
                <input
                  value={img.alt ?? ""}
                  onChange={(e) => {
                    const next = form.images.slice();
                    next[i] = { ...next[i], alt: e.target.value };
                    patch({ images: next });
                  }}
                  placeholder="Alt text"
                  className={inputCls}
                />
              </div>
              {i === 0 && (
                <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
                  Main
                </span>
              )}
              <div className="flex items-center gap-1">
                <AiButton
                  label="AI"
                  title="Regenerate this image with AI"
                  loading={aiIdx === i}
                  onClick={() => regenImage(i)}
                />
                <button
                  type="button"
                  onClick={() => moveImage(i, i - 1)}
                  disabled={i === 0}
                  className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(i, i + 1)}
                  disabled={i === form.images.length - 1}
                  className="rounded border px-2 py-1 text-xs disabled:opacity-40"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="rounded border px-2 py-1 text-xs text-destructive"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------- 3. Description ----------

function DescriptionSection({
  form,
  patch,
  setError,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  setError: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const ctx = (): AiContext => ({
    title: form.title,
    description: form.description,
    category: form.category,
    bullets: form.bullets,
    tags: form.tags,
    basePrice: form.basePrice,
    currency: form.currency,
  });

  async function regen(key: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err, "AI request failed"));
    } finally {
      setBusy(null);
    }
  }

  function setBullet(i: number, v: string) {
    const next = form.bullets.slice();
    next[i] = v;
    patch({ bullets: next });
  }
  function addBullet() {
    if (form.bullets.length >= 8) return;
    patch({ bullets: [...form.bullets, ""] });
  }
  function removeBullet(i: number) {
    const next = form.bullets.slice();
    next.splice(i, 1);
    while (next.length < 5) next.push("");
    patch({ bullets: next });
  }

  // Require real source content before asking the model — without this guard
  // the model returns generic placeholder bullets ("High-quality materials",
  // "Customizable designs…") that have nothing to do with the actual product.
  function hasEnoughContext(): boolean {
    const hasTitle       = form.title.trim().length >= 4;
    const hasDescription = form.description.trim().length >= 20;
    const hasTags        = (form.tags ?? []).length > 0;
    return hasTitle && (hasDescription || hasTags);
  }

  async function regenAllBullets() {
    if (!hasEnoughContext()) {
      setError("Add a product Title (and a short description or a few tags) before AI can write bullets. Otherwise it produces generic placeholder text.");
      return;
    }
    await regen("bullets-all", async () => {
      const t = await aiWrite(
        "Generate exactly 5 bullet points highlighting key features and gifting value. Each bullet 10-15 words. Return as JSON array of strings. If the provided product context is too generic to write specific bullets, return an empty JSON array [].",
        "seo_bullets",
        ctx(),
      );
      const arr = parseJsonArray(t).slice(0, 8);
      if (arr.length === 0) {
        setError("AI couldn't produce specific bullets from the current data. Add more details to Title / Description first.");
        return;
      }
      const next = arr.slice();
      while (next.length < 5) next.push("");
      patch({ bullets: next });
    });
  }

  async function regenOneBullet(i: number) {
    const existing = (form.bullets[i] ?? "").trim();
    if (!existing && !hasEnoughContext()) {
      setError("Type a starting phrase for this bullet, or fill in Title & Description first — AI needs context to rewrite it.");
      return;
    }
    await regen(`bullet-${i}`, async () => {
      const t = await aiWrite(
        `Rewrite this product bullet point in 10-15 words. Current: "${existing}". Keep meaning, make it sharper. Return plain text only.`,
        "features",
        ctx(),
      );
      const clean = t.replace(/^[-*•\s]+/, "").replace(/^["']|["']$/g, "").trim();
      setBullet(i, clean);
    });
  }

  async function regenDescription() {
    await regen("desc", async () => {
      const t = await aiWrite(
        // SEO-ready long description: opening benefit, use-case paragraph,
// material/spec paragraph, gift occasion paragraph, CTA. Target 180-280
// words (enough for Google to rank, short enough not to bury specs).
// Uses H2 subheads so the page picks up semantic structure in SERPs.
`Write an SEO-optimized product long description in HTML. Return 180–280 words structured as:
  1. Opening paragraph: what the product is + who it's for (primary keyword in first sentence)
  2. <h2>Why customers love it</h2> — 2–3 benefit-driven bullet sentences as <p> (not <ul>)
  3. <h2>Personalization details</h2> — how they can customize (photo, name, message, etc.)
  4. <h2>Perfect for</h2> — 3–4 occasions/recipients (birthday, anniversary, boss, teacher…)
  5. Closing paragraph with a soft CTA (e.g. "Make it yours today.")
Rules: <p>, <h2>, <strong> only. No markdown. No emoji in headings. Do NOT repeat the product title verbatim more than twice.`,
        "description",
        ctx(),
      );
      patch({ description: t });
    });
  }

  return (
    <Section title="Description">
      <Field
        label="Bullets"
        hint="Up to 8"
        action={
          <AiButton
            label="AI all"
            loading={busy === "bullets-all"}
            onClick={regenAllBullets}
          />
        }
      >
        <div className="space-y-2">
          {form.bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={b}
                onChange={(e) => setBullet(i, e.target.value)}
                placeholder={`Feature ${i + 1}`}
                className={inputCls}
              />
              <AiButton
                label=""
                title="Regenerate this bullet"
                loading={busy === `bullet-${i}`}
                onClick={() => regenOneBullet(i)}
              />
              <button
                type="button"
                onClick={() => removeBullet(i)}
                className="rounded border px-2 py-1 text-xs"
              >
                ×
              </button>
            </div>
          ))}
          {form.bullets.length < 8 && (
            <button
              type="button"
              onClick={addBullet}
              className="rounded border px-3 py-1 text-xs"
            >
              + Add bullet
            </button>
          )}
        </div>
      </Field>
      <Field
        label="Long description"
        action={
          <AiButton
            loading={busy === "desc"}
            onClick={regenDescription}
          />
        }
      >
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

// ---------- 4. Pricing ----------

function PricingSection({
  form,
  patch,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
}) {
  return (
    <Section title="Pricing">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Base price">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.basePrice}
            onChange={(e) => patch({ basePrice: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Compare-at price">
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.compareAtPrice}
            onChange={(e) => patch({ compareAtPrice: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Currency">
          <select
            value={form.currency}
            onChange={(e) => patch({ currency: e.target.value })}
            className={inputCls}
          >
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

// ---------- 5. Inventory ----------

function InventorySection({
  form,
  patch,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
}) {
  return (
    <Section title="Inventory">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="SKU">
          <input
            value={form.sku}
            onChange={(e) => patch({ sku: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Stock">
          <input
            type="number"
            min="0"
            value={form.inventory}
            onChange={(e) => patch({ inventory: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
    </Section>
  );
}

// ---------- 6. Variations ----------

function VariationsSection({
  mode,
  productId,
  productSlug,
  variantTypes,
  attrGroups,
  setAttrGroups,
  variantRows,
  setVariantRows,
  initialVariants,
  setError,
}: {
  mode: "create" | "edit";
  productId?: string;
  productSlug: string;
  variantTypes: VariantTypeDef[];
  attrGroups: AttributeGroup[];
  setAttrGroups: React.Dispatch<React.SetStateAction<AttributeGroup[]>>;
  variantRows: VariantOption[];
  setVariantRows: React.Dispatch<React.SetStateAction<VariantOption[]>>;
  initialVariants: VariantOption[];
  setError: (s: string | null) => void;
  basePrice?: number | string;
}) {
  const [savingVariants, setSavingVariants] = useState(false);
  const [uploadingRowKey, setUploadingRowKey] = useState<string | null>(null);
  const [expandedCustRow, setExpandedCustRow] = useState<string | null>(null);

  const availableToAdd = variantTypes.filter(
    (vt) => !attrGroups.some((g) => g.name.toLowerCase() === vt.name.toLowerCase()),
  );

  function addAttribute(name: string) {
    if (!name) return;
    if (attrGroups.some((g) => g.name === name)) return;
    setAttrGroups((prev) => [...prev, { name, values: [] }]);
  }

  function removeAttribute(name: string) {
    setAttrGroups((prev) => prev.filter((g) => g.name !== name));
    setVariantRows((prev) => prev.filter((r) => r.name !== name));
  }

  function addValueToGroup(groupName: string, value: string) {
    const v = value.trim();
    if (!v) return;
    // If this value exists in the global attribute templates, pull its
    // default thumbnail so the new variant row is pre-populated (Design 01
    // shows its uploaded mockup etc.). This is the "attribute DB is the
    // single source of truth" behaviour the admin asked for.
    const meta = variantTypes.find((vt) => vt.name === groupName)?.valueMeta?.[v];
    const seedImage = meta?.imageUrl ?? undefined;
    setAttrGroups((prev) =>
      prev.map((g) =>
        g.name === groupName && !g.values.includes(v)
          ? { ...g, values: [...g.values, v] }
          : g,
      ),
    );
    setVariantRows((prev) => {
      if (prev.some((r) => r.name === groupName && r.value === v)) return prev;
      return [
        ...prev,
        {
          name: groupName,
          value: v,
          priceDelta: 0,
          sku: makeAutoSku(productSlug, groupName, v),
          inventory: 0,
          image: seedImage,
          images: seedImage ? [seedImage] : [],
        },
      ];
    });
  }

  function removeValueFromGroup(groupName: string, value: string) {
    setAttrGroups((prev) =>
      prev.map((g) =>
        g.name === groupName ? { ...g, values: g.values.filter((x) => x !== value) } : g,
      ),
    );
    setVariantRows((prev) =>
      prev.filter((r) => !(r.name === groupName && r.value === value)),
    );
  }

  function updateRow(key: string, patch: Partial<VariantOption>) {
    setVariantRows((prev) =>
      prev.map((r) => (rowKey(r) === key ? { ...r, ...patch } : r)),
    );
  }

  async function handleRowImageUpload(key: string, file: File) {
    setError(null);
    setUploadingRowKey(key);
    try {
      const { url } = await uploadProductFile(file);
      setVariantRows(prev =>
        prev.map(r => rowKey(r) === key ? { ...r, images: [...(r.images ?? []), url] } : r)
      );
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
      setVariantRows(prev =>
        prev.map(r => rowKey(r) === key ? { ...r, images: [...(r.images ?? []), url] } : r)
      );
    } catch (err) {
      setError(getErrorMessage(err, "URL import failed"));
    } finally {
      setUploadingRowKey(null);
    }
  }

  async function handleSaveAllVariants() {
    if (!productId) return;
    setSavingVariants(true);
    setError(null);
    try {
      // Diff: delete rows present in initial but not in current by (name,value)
      const currentKeys = new Set(variantRows.map((r) => `${r.name}:::${r.value}`));
      const toDelete = initialVariants.filter(
        (r) => r.id && !currentKeys.has(`${r.name}:::${r.value}`),
      );
      for (const r of toDelete) {
        await apiB2b().delete(`/api/products/admin/variants/${r.id}`);
      }
      // Update existing rows — priceDelta / inventory / sku / customizationMode may have changed
      for (const r of variantRows) {
        if (!r.id) continue;
        await apiB2b().patch(`/api/products/admin/variants/${r.id}`, {
          priceDelta: r.priceDelta ?? 0,
          sku: r.sku,
          inventory: r.inventory ?? 0,
          image: r.image ?? (r.images && r.images.length > 0 ? r.images[0] : undefined),
          images: r.images,
          customizationMode: r.customizationMode ?? null,
        });
      }
      // Create rows that do not yet have an id
      for (const r of variantRows) {
        if (r.id) continue;
        await apiB2b().post(`/api/products/admin/${productId}/variants`, {
          name: r.name,
          value: r.value,
          priceDelta: r.priceDelta ?? 0,
          sku: r.sku,
          inventory: r.inventory ?? 0,
          image: r.image ?? (r.images && r.images.length > 0 ? r.images[0] : undefined),
          images: r.images,
          customizationMode: r.customizationMode ?? null,
        });
      }
      // Reload and hydrate ids
      const fresh = await apiB2b().get<Product>(`/api/products/${productSlug}`);
      const freshVariants = Array.isArray(fresh.variantOptions)
        ? (fresh.variantOptions as VariantOption[])
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
    <Section
      title="Variations"
      description="Pick an attribute, add values, tune SKU rows. Note: only one attribute type at a time is combined into rows (multi-group rows are listed flat, not cross-producted)."
    >
      <div className="flex items-center gap-2">
        <select
          value=""
          onChange={(e) => {
            addAttribute(e.target.value);
            e.currentTarget.value = "";
          }}
          className={inputCls + " max-w-xs"}
          disabled={availableToAdd.length === 0}
        >
          <option value="">
            {availableToAdd.length === 0
              ? "All attributes added"
              : "+ Add attribute..."}
          </option>
          {availableToAdd.map((vt) => (
            <option key={vt.name} value={vt.name}>
              {vt.name}
            </option>
          ))}
        </select>
      </div>

      {attrGroups.length === 0 && (
        <p className="text-xs text-muted-foreground">No attributes yet.</p>
      )}

      {attrGroups.map((g) => {
        const prelisted = variantTypes.find((vt) => vt.name === g.name)?.values ?? [];
        return (
          <AttributeGroupCard
            key={g.name}
            group={g}
            prelistedValues={prelisted}
            onRemove={() => removeAttribute(g.name)}
            onAddValue={(v) => addValueToGroup(g.name, v)}
            onRemoveValue={(v) => removeValueFromGroup(g.name, v)}
          />
        );
      })}

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
                              setVariantRows((rows) =>
                                rows.map((row) =>
                                  rowKey(row) === key ? { ...row, value: trimmed } : row,
                                ),
                              );
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={r.sku ?? ""}
                          onChange={(e) => updateRow(key, { sku: e.target.value })}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {/* Direct absolute price — stored as priceDelta, shown as-is */}
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={r.priceDelta ?? 0}
                          onChange={(e) => updateRow(key, { priceDelta: Math.max(0, Number(e.target.value)) })}
                          className={inputCls + " text-right"}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          value={r.inventory ?? 0}
                          onChange={(e) =>
                            updateRow(key, { inventory: Number(e.target.value) })
                          }
                          className={inputCls + " text-right"}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <VariantImageCell
                          images={r.images ?? []}
                          uploading={uploadingRowKey === key}
                          onAdd={(file) => handleRowImageUpload(key, file)}
                          onAddUrl={(url) => handleRowImageUrlImport(key, url)}
                          onRemove={(url) => updateRow(key, { images: (r.images ?? []).filter(u => u !== url) })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpandedCustRow(custOpen ? null : key)}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                            r.customizationMode
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {"\uD83C\uDFA8"} {r.customizationMode ?? "Inherit"}
                        </button>
                      </td>
                    </tr>
                    {custOpen && (
                      <tr className="bg-primary/5 border-t border-primary/10">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">
                              Customisation for{" "}
                              <strong>
                                {r.name}: {r.value}
                              </strong>
                            </span>
                            <select
                              value={r.customizationMode ?? ""}
                              onChange={(e) =>
                                updateRow(key, {
                                  customizationMode: e.target.value || null,
                                })
                              }
                              className="text-xs border rounded-md px-2 py-1.5 bg-background focus:ring-1 focus:ring-primary/30 focus:outline-none"
                            >
                              <option value="">Inherit from product</option>
                              <option value="full">Full Canvas</option>
                              <option value="simple">Simple (text / colour only)</option>
                              <option value="template">Template Only</option>
                              <option value="none">Disabled (not customisable)</option>
                            </select>
                            {r.customizationMode && (
                              <button
                                type="button"
                                onClick={() => updateRow(key, { customizationMode: null })}
                                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                              >
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
            <p className="text-xs text-muted-foreground italic">
              Variants will be saved when you click &ldquo;Create product&rdquo;.
            </p>
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

function rowKey(r: VariantOption): string {
  return r.id ?? `new:${r.name}:${r.value}`;
}

function AttributeGroupCard({
  group,
  prelistedValues,
  onRemove,
  onAddValue,
  onRemoveValue,
}: {
  group: AttributeGroup;
  prelistedValues: string[];
  onRemove: () => void;
  onAddValue: (v: string) => void;
  onRemoveValue: (v: string) => void;
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
        <button
          type="button"
          onClick={onRemove}
          className="rounded border px-2 py-0.5 text-xs text-destructive"
        >
          Remove attribute
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5">
        {group.values.map((v) => {
          const MAX = 32;
          const display = v.length > MAX ? v.slice(0, MAX).trimEnd() + "…" : v;
          return (
            <span
              key={v}
              title={v}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs max-w-[260px]"
            >
              <span className="truncate">{display}</span>
              <button
                type="button"
                onClick={() => onRemoveValue(v)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          list={listId}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            }
          }}
          placeholder={`Add ${group.name.toLowerCase()}...`}
          className="flex-1 min-w-[120px] bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        <datalist id={listId}>
          {prelistedValues.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

function VariantImageCell({
  images,
  uploading,
  onAdd,
  onAddUrl,
  onRemove,
}: {
  images: string[];
  uploading: boolean;
  onAdd: (file: File) => void;
  onAddUrl?: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const promptForUrl = () => {
    if (!onAddUrl) return;
    const url = typeof window !== "undefined"
      ? window.prompt("Paste image URL (Amazon etc). It will be downloaded to our server.")
      : null;
    if (url && url.trim()) onAddUrl(url.trim());
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {images.map((url, i) => (
        <div key={i} className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveImageUrl(url)}
            alt=""
            className="h-10 w-10 rounded border object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(url)}
            className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-destructive text-white items-center justify-center text-[9px]"
          >
            ×
          </button>
          {i === 0 && (
            <span className="absolute -bottom-1 left-0 right-0 text-center text-[7px] text-muted-foreground">main</span>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="h-10 w-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 text-lg"
        title="Add image (upload file)"
      >
        {uploading ? "…" : "+"}
      </button>
      {onAddUrl && (
        <button
          type="button"
          onClick={promptForUrl}
          disabled={uploading}
          className="h-10 w-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 text-sm"
          title="Add image from URL (downloaded to our server)"
        >
          🔗
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---------- 7. Shipping ----------

function ShippingSection({
  form,
  patch,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
}) {
  return (
    <Section title="Shipping">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Weight (g)">
          <input
            type="number"
            min="0"
            value={form.weightGrams}
            onChange={(e) => patch({ weightGrams: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Length (cm)">
          <input
            type="number"
            min="0"
            value={form.dimL}
            onChange={(e) => patch({ dimL: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Width (cm)">
          <input
            type="number"
            min="0"
            value={form.dimW}
            onChange={(e) => patch({ dimW: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Height (cm)">
          <input
            type="number"
            min="0"
            value={form.dimH}
            onChange={(e) => patch({ dimH: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>
    </Section>
  );
}

// ---------- 8. Customization ----------

function CustomizationSection({
  form,
  patch,
  productId,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  productId?: string;
}) {
  return (
    <Section title="Customization">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isCustomizable}
            onChange={(e) => patch({ isCustomizable: e.target.checked })}
          />
          Allow buyers to customize this product
        </label>
        {form.isCustomizable && productId && (
          <a
            href={`/b2b/super-admin/customizer?productId=${productId}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-pink-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-pink-700 transition-colors"
          >
            <span aria-hidden>✨</span>
            Configure customisation →
          </a>
        )}
        {form.isCustomizable && !productId && (
          <span className="text-[11px] text-muted-foreground italic">
            Save the product first, then configure zones &amp; masks here.
          </span>
        )}
      </div>
    </Section>
  );
}

// ---------- 9. SEO ----------

function SeoSection({
  form,
  patch,
  setError,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
  setError: (s: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const ctx = (): AiContext => ({
    title: form.title,
    description: form.description,
    category: form.category,
    bullets: form.bullets,
    tags: form.tags,
    basePrice: form.basePrice,
    currency: form.currency,
  });

  async function regen(key: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      setError(getErrorMessage(err, "AI request failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="SEO">
      <Field
        label="Meta title"
        action={
          <AiButton
            loading={busy === "meta-title"}
            onClick={() =>
              regen("meta-title", async () => {
                const t = await aiWrite(
                  "Write an SEO meta title. Max 60 characters. Include the primary keyword. Return only the title text.",
                  "seo_meta_title",
                  ctx(),
                );
                patch({ seoTitle: t.replace(/^["']|["']$/g, "").slice(0, 60) });
              })
            }
          />
        }
      >
        <input
          value={form.seoTitle}
          onChange={(e) => patch({ seoTitle: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field
        label="Meta description"
        action={
          <AiButton
            loading={busy === "meta-desc"}
            onClick={() =>
              regen("meta-desc", async () => {
                const t = await aiWrite(
                  "Write an SEO meta description. Max 160 characters. Include a call-to-action and primary keyword. Return only the description text.",
                  "seo_meta_description",
                  ctx(),
                );
                patch({ seoDescription: t.replace(/^["']|["']$/g, "").slice(0, 160) });
              })
            }
          />
        }
      >
        <textarea
          rows={3}
          value={form.seoDescription}
          onChange={(e) => patch({ seoDescription: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field
        label="Keywords"
        hint="Comma-separated"
        action={
          <AiButton
            loading={busy === "keywords"}
            onClick={() =>
              regen("keywords", async () => {
                const t = await aiWrite(
                  "Generate exactly 10 SEO keywords relevant to the product. Return them as a comma-separated list on a single line.",
                  "seo_keywords",
                  ctx(),
                );
                const clean = t.replace(/\n+/g, ", ").replace(/\s*,\s*/g, ", ").trim();
                patch({ seoKeywords: clean });
              })
            }
          />
        }
      >
        <input
          value={form.seoKeywords}
          onChange={(e) => patch({ seoKeywords: e.target.value })}
          className={inputCls}
        />
      </Field>
    </Section>
  );
}

// ---------- Sidebar: Channels ----------

function PublishingSidebar({
  form,
  patch,
}: {
  form: FormState;
  patch: (f: Partial<FormState>) => void;
}) {
  const isPrivate = form.ownerCompanyId.trim().length > 0;
  return (
    <Section
      title="Publishing"
      description="Where this product appears for shoppers."
    >
      <div className="space-y-2 border-b pb-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">
          Show on
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.b2cEnabled}
            onChange={(e) => patch({ b2cEnabled: e.target.checked })}
          />
          <div>
            <div>B2C storefront</div>
            <div className="text-xs text-muted-foreground">
              Public shoppers on gifteeng.com
            </div>
          </div>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.b2bEnabled}
            onChange={(e) => patch({ b2bEnabled: e.target.checked })}
          />
          <div>
            <div>B2B portals</div>
            <div className="text-xs text-muted-foreground">
              Corporate clients on business.gifteeng.com
            </div>
          </div>
        </label>
      </div>
      {form.b2bEnabled && (
        <div className="space-y-2 pt-2">
          <div className="text-xs font-medium uppercase text-muted-foreground">
            B2B access
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              className="mt-0.5"
              checked={!isPrivate}
              onChange={() => patch({ ownerCompanyId: "" })}
            />
            <div>
              <div>All companies</div>
              <div className="text-xs text-muted-foreground">
                Visible to every B2B client
              </div>
            </div>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              className="mt-0.5"
              checked={isPrivate}
              onChange={() => patch({ ownerCompanyId: form.ownerCompanyId || " " })}
            />
            <div className="flex-1">
              <div>One company only</div>
              <div className="text-xs text-muted-foreground">
                Private — restrict to a single client
              </div>
              {isPrivate && (
                <input
                  value={form.ownerCompanyId}
                  onChange={(e) => patch({ ownerCompanyId: e.target.value })}
                  placeholder="Company UUID"
                  className={`${inputCls} mt-1.5`}
                />
              )}
            </div>
          </label>
        </div>
      )}
    </Section>
  );
}

// ---------- Category Picker ----------

function CategoryPicker({
  value,
  options,
  onChange,
  inputCls,
}: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  inputCls: string;
}) {
  // DROPDOWN ONLY. Admins add new categories via the "+ New" button which
  // POSTs to /api/categories/admin — the DB Category table is the single
  // source of truth. The previous free-text "new" mode was the main cause
  // of typo-duplicates in the category list.
  const allOptions = Array.from(
    new Set(options.filter((x): x is string => !!x && x.trim().length > 0)),
  ).sort((a, b) => a.localeCompare(b));
  const [saving, setSaving] = useState(false);

  const createCategory = async () => {
    const name = window.prompt("New category name:");
    if (!name || !name.trim()) return;
    setSaving(true);
    try {
      await apiB2b().post("/api/categories/admin", { name: name.trim(), is_active: true });
      // Parent refreshes options on its next render cycle via the existing
      // load effect. We optimistically select the new name.
      onChange(name.trim());
    } catch (err) {
      alert(
        (err as { body?: { message?: string }; message?: string })?.body?.message
        ?? (err as { message?: string })?.message
        ?? "Could not create category",
      );
    } finally {
      setSaving(false);
    }
  };

  const known = !value || allOptions.includes(value);
  return (
    <div className="flex gap-2">
      <select
        value={known ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls + " flex-1"}
      >
        <option value="">— Select category —</option>
        {allOptions.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
        {!known && <option value={value} disabled>⚠ {value} (not in master list)</option>}
      </select>
      <button
        type="button"
        onClick={createCategory}
        disabled={saving}
        className="rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted whitespace-nowrap disabled:opacity-50"
      >
        {saving ? "…" : "+ New"}
      </button>
    </div>
  );
}

// ---------- Sidebar: Collections ----------

function CollectionsSidebar({
  collections,
  selectedIds,
  setSelectedIds,
}: {
  collections: CollectionRef[];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [q, setQ] = useState("");

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const filtered = q.trim()
    ? collections.filter((c) => {
        const s = q.toLowerCase();
        return collectionLabel(c).toLowerCase().includes(s);
      })
    : collections;

  const selectedCount = selectedIds.length;

  return (
    <Section title={`Collections${selectedCount ? ` (${selectedCount})` : ""}`}>
      {collections.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No collections —{" "}
          <Link href="/super-admin/collections" className="underline">
            create some
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-2">
          {collections.length > 6 && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search collections…"
              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border bg-background p-1">
            {filtered.length === 0 ? (
              <li className="px-2 py-1 text-xs text-muted-foreground">
                No matches
              </li>
            ) : (
              filtered.map((c) => {
                const active = selectedIds.includes(c.id);
                const label = collectionLabel(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                        active
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40 bg-background"
                        }`}
                      >
                        {active ? "✓" : ""}
                      </span>
                      <span className="truncate">{label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ---------- Sidebar: Status ----------

function StatusSidebar({
  mode,
  onDelete,
  deleting,
}: {
  mode: "create" | "edit";
  onDelete: () => void;
  deleting: boolean;
}) {
  if (mode !== "edit") return null;
  return (
    <Section title="Status">
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="w-full rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive disabled:opacity-50"
      >
        {deleting ? "Deleting..." : "Delete product"}
      </button>
    </Section>
  );
}

// ── Variant value cell: truncated display + click to edit inline ─────────
// Amazon-imported variants often have long titles like "inultimate Wooden
// Owl Family Key Holder | No Drilling | with 2 Hooks". We render the first
// ~44 chars with an ellipsis + tooltip showing the full value. Click to
// open an inline input that edits the value in place.
function VariantValueCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const MAX = 44;
  const display =
    value.length > MAX ? value.slice(0, MAX).trimEnd() + "…" : value;

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    onChange(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="flex-1 rounded border border-primary/40 bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
        placeholder="Short name (e.g. Owl · Elephant · Design 1)"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={`${value}\n\nClick to rename`}
      className="flex-1 min-w-0 text-left text-xs truncate rounded px-1 py-0.5 hover:bg-muted/50 hover:text-primary transition-colors"
    >
      <span className="truncate">{display}</span>
      <span className="ml-1 text-muted-foreground opacity-60 text-[10px]">✎</span>
    </button>
  );
}

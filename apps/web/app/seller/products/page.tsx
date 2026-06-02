"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Loader2, Plus, Search, ArrowLeft, CheckCircle2, Clock, XCircle,
  Pencil, Trash2, IndianRupee, Boxes, Store, PackagePlus, ListPlus, FileSpreadsheet, Wand2,
} from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

// ── Types ───────────────────────────────────────────────────────────────────
type OfferStatus = "pending" | "approved" | "rejected";

interface ProductLite {
  id: string; slug: string; title: string; category: string | null;
  images: { url: string; alt?: string }[] | null;
  basePrice: string | number; brandName?: string | null;
}
interface SellerProduct {
  id: string; isOwnListing: boolean; price: string | number; stock: number;
  status: OfferStatus; rejectedReason: string | null;
  ratingAvg: number; ratingCount: number; createdAt: string;
  product: ProductLite;
}

const FIELD =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/15";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1";

const STATUS: Record<OfferStatus, { icon: typeof Clock; cls: string; label: string }> = {
  pending:  { icon: Clock,        cls: "text-amber-600 bg-amber-500/10 border-amber-500/20",      label: "In review" },
  approved: { icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", label: "Live" },
  rejected: { icon: XCircle,      cls: "text-destructive bg-destructive/5 border-destructive/20",  label: "Rejected" },
};

function firstImage(p: ProductLite): string | null {
  const imgs = p.images;
  if (Array.isArray(imgs) && imgs[0]?.url) return imgs[0].url;
  return null;
}
function inr(v: string | number): string {
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SellerProducts() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"list" | "new" | "catalog">("list");

  const [items, setItems] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    setReady(true);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await sellerApi.get<SellerProduct[]>("/seller/products");
      setItems(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (status === 401) { router.replace("/seller/login"); return; }
      setError((e as { message?: string })?.message ?? "Could not load your listings");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("list")}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-display text-lg font-black tracking-tight">
              {view === "list" ? "My products" : view === "new" ? "List a new product" : "Sell an existing product"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {view === "list"
                ? `${items.length} listing${items.length === 1 ? "" : "s"}`
                : "Submitted listings are reviewed before going live"}
            </p>
          </div>
        </div>
      </div>

      {view === "list" && (
        <ListView
          items={items}
          loading={loading}
          error={error}
          onNew={() => setView("new")}
          onCatalog={() => setView("catalog")}
          onChanged={load}
        />
      )}
      {view === "new" && <NewProductForm onDone={() => { setView("list"); load(); }} />}
      {view === "catalog" && <CatalogBrowser onDone={() => { setView("list"); load(); }} />}
    </div>
  );
}

// ── List view ────────────────────────────────────────────────────────────────
function ListView({
  items, loading, error, onNew, onCatalog, onChanged,
}: {
  items: SellerProduct[]; loading: boolean; error: string | null;
  onNew: () => void; onCatalog: () => void; onChanged: () => void;
}) {
  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }
  return (
    <div className="space-y-5">
      {/* Add actions */}
      <div className="grid grid-cols-2 gap-3">
        <a
          href="/seller/products/new"
          className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/50 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <PackagePlus className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold">List a new product</span>
          <span className="text-[11px] text-muted-foreground">Add your own product to the catalogue</span>
        </a>
        <button
          onClick={onCatalog}
          className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/50 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <ListPlus className="h-5 w-5 text-primary" />
          <span className="text-sm font-bold">Sell an existing product</span>
          <span className="text-[11px] text-muted-foreground">Offer a product already in the catalogue</span>
        </button>
      </div>
      <a
        href="/seller/products/bulk-upload"
        className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
      >
        <FileSpreadsheet className="h-5 w-5 text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-bold">Bulk upload via CSV</p>
          <p className="text-[11px] text-muted-foreground">Upload many products at once using our template</p>
        </div>
      </a>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card py-14 text-center">
          <Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground/20" />
          <p className="text-sm font-semibold">No products listed yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Add your first product to start selling</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => <OfferRow key={it.id} offer={it} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  );
}

function OfferRow({ offer, onChanged }: { offer: SellerProduct; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(offer.price));
  const [stock, setStock] = useState(String(offer.stock));
  const [busy, setBusy] = useState(false);
  const s = STATUS[offer.status];
  const StatusIcon = s.icon;
  const img = firstImage(offer.product);

  const save = async () => {
    setBusy(true);
    try {
      await sellerApi.patch(`/seller/products/${offer.id}`, {
        price: Number(price), stock: parseInt(stock, 10) || 0,
      });
      setEditing(false);
      onChanged();
    } catch { /* surfaced by reload */ } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm("Remove this listing? This cannot be undone.")) return;
    setBusy(true);
    try { await sellerApi.del?.(`/seller/products/${offer.id}`); }
    catch { /* ignore */ }
    finally { setBusy(false); onChanged(); }
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3.5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt={offer.product.title} className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center"><Package className="h-5 w-5 text-muted-foreground/30" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{offer.product.title}</span>
            {offer.isOwnListing && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-bold text-primary">
                Own
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><IndianRupee className="h-2.5 w-2.5" />{inr(offer.price)}</span>
            <span>·</span>
            <span className="flex items-center gap-0.5"><Boxes className="h-2.5 w-2.5" />{offer.stock} in stock</span>
          </div>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${s.cls}`}>
          <StatusIcon className="h-2.5 w-2.5" /> {s.label}
        </span>
        {offer.isOwnListing && (
          <>
            <a
              href={`/seller/products/${offer.id}`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              aria-label="Edit full listing"
              title="Edit full listing"
            >
              <Pencil className="h-3.5 w-3.5" />
            </a>
            <a
              href={`/seller/products/${offer.id}/customizer`}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-primary"
              aria-label="Set up customiser"
              title="Set up customiser"
            >
              <Wand2 className="h-3.5 w-3.5" />
            </a>
          </>
        )}
        {!offer.isOwnListing && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Edit price/stock"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {offer.status === "rejected" && offer.rejectedReason && (
        <p className="mt-2 rounded-lg bg-destructive/5 px-2.5 py-1.5 text-[11px] font-semibold text-destructive">
          Rejected: {offer.rejectedReason}
        </p>
      )}

      {editing && (
        <div className="mt-3 flex items-end gap-2 border-t border-border/40 pt-3">
          <div className="flex-1">
            <label className={LABEL}>Price (₹)</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className={FIELD} />
          </div>
          <div className="flex-1">
            <label className={LABEL}>Stock</label>
            <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={FIELD} />
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </button>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-xl border border-destructive/30 p-2.5 text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50"
            aria-label="Remove listing"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── New product form ─────────────────────────────────────────────────────────
interface VariantOption { name: string; values: string[] }

function NewProductForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ title: "", description: "", category: "", price: "", stock: "", sku: "" });
  const [isCustomizable, setIsCustomizable] = useState(false);
  const [customizationType, setCustomizationType] = useState<"text" | "photo" | "design">("text");
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    sellerApi.get<{ name: string }[]>("/categories").then((rows) =>
      setCategories(rows.map((r) => r.name))
    ).catch(() => {});
  }, []);

  const addVariant = () => setVariants((v) => [...v, { name: "", values: [""] }]);
  const removeVariant = (i: number) => setVariants((v) => v.filter((_, idx) => idx !== i));
  const setVariantName = (i: number, name: string) =>
    setVariants((v) => v.map((opt, idx) => idx === i ? { ...opt, name } : opt));
  const setVariantValues = (i: number, raw: string) =>
    setVariants((v) => v.map((opt, idx) => idx === i ? { ...opt, values: raw.split(",").map((s) => s.trim()).filter(Boolean) } : opt));

  const submit = async () => {
    setError(null);
    if (f.title.trim().length < 2) { setError("Product title is required"); return; }
    if (!(Number(f.price) > 0))    { setError("Enter a valid price"); return; }
    setBusy(true);
    try {
      await sellerApi.post("/seller/products", {
        title: f.title.trim(),
        description: f.description.trim() || undefined,
        category: f.category || undefined,
        sku: f.sku.trim() || undefined,
        isCustomizable,
        customizationType: isCustomizable ? customizationType : undefined,
        variantOptions: isCustomizable && variants.length > 0
          ? variants.filter((v) => v.name && v.values.length > 0)
          : undefined,
        price: Number(f.price),
        stock: parseInt(f.stock, 10) || 0,
      });
      onDone();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Could not submit — please try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* Basic info */}
      <section className="space-y-3 rounded-2xl border border-border/50 bg-card p-4">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Basic info</p>
        <div>
          <label className={LABEL}>Product title *</label>
          <input value={f.title} onChange={set("title")} className={FIELD} placeholder="e.g. Personalised Photo Mug" />
        </div>
        <div>
          <label className={LABEL}>Description</label>
          <textarea value={f.description} onChange={set("description")} className={`${FIELD} min-h-[90px] resize-y`} placeholder="What makes this product special" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Category</label>
            <select value={f.category} onChange={set("category")} className={FIELD}>
              <option value="">— Select category —</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>SKU / Model no.</label>
            <input value={f.sku} onChange={set("sku")} className={FIELD} placeholder="Optional" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Selling price (₹) *</label>
            <input value={f.price} onChange={set("price")} inputMode="numeric" className={FIELD} placeholder="499" />
          </div>
          <div>
            <label className={LABEL}>Stock on hand</label>
            <input value={f.stock} onChange={set("stock")} inputMode="numeric" className={FIELD} placeholder="50" />
          </div>
        </div>
      </section>

      {/* Customisation */}
      <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Customisation</p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => setIsCustomizable((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isCustomizable ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${isCustomizable ? "translate-x-4" : "translate-x-1"}`} />
            </div>
            <span className="text-xs font-semibold">Customisable product</span>
          </label>
        </div>

        {isCustomizable && (
          <div className="space-y-4 pt-1">
            {/* Customisation type */}
            <div>
              <label className={LABEL}>Customisation type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["text", "photo", "design"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCustomizationType(t)}
                    className={`rounded-xl border py-2 text-xs font-semibold capitalize transition-colors ${
                      customizationType === t
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t === "text" ? "📝 Text" : t === "photo" ? "🖼 Photo" : "🎨 Design"}
                  </button>
                ))}
              </div>
            </div>

            {/* Variant options */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={LABEL}>Variant options</label>
                <button type="button" onClick={addVariant}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Add option
                </button>
              </div>
              {variants.length === 0 && (
                <p className="text-[11px] text-muted-foreground">e.g. Design → Design 1, Design 2, Design 3</p>
              )}
              {variants.map((opt, i) => (
                <div key={i} className="mb-2 rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={opt.name}
                      onChange={(e) => setVariantName(i, e.target.value)}
                      placeholder="Option name (e.g. Design)"
                      className={`${FIELD} flex-1`}
                    />
                    <button type="button" onClick={() => removeVariant(i)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    value={opt.values.join(", ")}
                    onChange={(e) => setVariantValues(i, e.target.value)}
                    placeholder="Values, comma-separated (e.g. Design 1, Design 2)"
                    className={FIELD}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground">
        You can add product photos from the dashboard after the listing is created. Gifteeng reviews
        every new product before it goes live.
      </p>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Submit for review</>}
      </button>
    </div>
  );
}

// ── Catalog browser ──────────────────────────────────────────────────────────
function CatalogBrowser({ onDone }: { onDone: () => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<ProductLite | null>(null);

  const run = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const rows = await sellerApi.get<ProductLite[]>(
        `/seller/products/catalog${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ""}`,
      );
      setResults(Array.isArray(rows) ? rows : []);
    } catch { setResults([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { run(""); }, [run]);

  if (picked) {
    return <RequestForm product={picked} onBack={() => setPicked(null)} onDone={onDone} />;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(search)}
          placeholder="Search catalogue products..."
          className={`${FIELD} pl-9`}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card py-12 text-center">
          <Store className="mx-auto mb-2 h-9 w-9 text-muted-foreground/20" />
          <p className="text-sm font-semibold">No products found</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Try another search, or list a new product instead</p>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((p) => {
            const img = firstImage(p);
            return (
              <button
                key={p.id}
                onClick={() => setPicked(p)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {img
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={img} alt={p.title} className="h-full w-full object-cover" />
                    : <div className="flex h-full w-full items-center justify-center"><Package className="h-4 w-4 text-muted-foreground/30" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.category ?? "Uncategorised"} · catalogue price ₹{inr(p.basePrice)}
                  </p>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-primary" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequestForm({
  product, onBack, onDone,
}: { product: ProductLite; onBack: () => void; onDone: () => void }) {
  const [price, setPrice] = useState(String(Math.round(Number(product.basePrice))));
  const [stock, setStock] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!(Number(price) > 0)) { setError("Enter a valid price"); return; }
    setBusy(true);
    try {
      await sellerApi.post("/seller/products/request", {
        productId: product.id,
        price: Number(price),
        stock: parseInt(stock, 10) || 0,
      });
      onDone();
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Could not submit — please try again");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to catalogue
      </button>
      <section className="rounded-2xl border border-border/50 bg-card p-4">
        <p className="text-sm font-bold">{product.title}</p>
        <p className="text-[11px] text-muted-foreground">{product.category ?? "Uncategorised"}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Your selling price (₹) *</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" className={FIELD} />
          </div>
          <div>
            <label className={LABEL}>Stock on hand</label>
            <input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" className={FIELD} placeholder="50" />
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" /> Request to sell this product</>}
      </button>
    </div>
  );
}

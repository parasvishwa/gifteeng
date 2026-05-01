"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, X } from "lucide-react";
import { Input, Switch } from "@gifteeng/ui";
import { useToast } from "@gifteeng/ui";


async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    const res = await fetch(`${base}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}

interface ProductVariant {
  id: string;
  product_id: string;
  label: string;
  variant_type: string;
  price: number;
  compare_at_price: number;
  stock_quantity: number;
  sku: string | null;
  image_url: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  weight: number;
}

interface VariantImage {
  id: string;
  product_id: string;
  variant_id: string | null;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

interface Props {
  productId: string | null;
  isNew: boolean;
  basePrice: number;
  selectedVariants: Record<string, string[]>;
  variantOptions: { id: string; variant_type: string; value: string }[];
}

export default function VariantPricingSection({ productId, isNew, basePrice, selectedVariants }: Props) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantImages, setVariantImages] = useState<Record<string, VariantImage[]>>({});
  const [enabled, setEnabled] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const { toast } = useToast();
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (productId && !isNew) {
      fetchVariants(productId).then(() => { initialLoadDone.current = true; });
    }
  }, [productId, isNew]);

  const parseColorName = (val: string) => val.split("|")[0];

  const buildExpectedLabels = useCallback(() => {
    const activeTypes = Object.entries(selectedVariants)
      .filter(([_, values]) => values.length > 0)
      .map(([type, values]) => ({
        type,
        values: values.map(v => type === "color" ? parseColorName(v) : v),
      }));

    if (activeTypes.length === 0) return [];

    const cartesian = (arrays: string[][]): string[][] => {
      if (arrays.length === 0) return [[]];
      const [first, ...rest] = arrays;
      const restCombos = cartesian(rest);
      return first.flatMap(v => restCombos.map(combo => [v, ...combo]));
    };

    const valueSets = activeTypes.map(t => t.values);
    const combos = cartesian(valueSets);
    return combos.map(combo => combo.join(" / "));
  }, [selectedVariants]);

  const variantKey = Object.entries(selectedVariants)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, values]) => `${type}:${values.sort().join(",")}`)
    .join("|");

  useEffect(() => {
    if (!productId || !enabled || !initialLoadDone.current) return;
    syncVariants();
  }, [variantKey, enabled, productId]);

  const syncVariants = async () => {
    if (!productId) return;
    setSyncing(true);
    // TODO: wire to /api/products/:id/variants sync endpoint
    await fetchVariants(productId);
    setSyncing(false);
  };

  const fetchVariants = async (pid: string) => {
    // TODO: wire to /api/products/:id/variants
    const v = await safeGet<ProductVariant[]>(`/products/${pid}/variants`, []);
    setVariants(v);
    setEnabled(v.length > 0 || enabled);
    if (v.length > 0) {
      const imgs = await safeGet<VariantImage[]>(`/products/${pid}/variant-images`, []);
      const grouped: Record<string, VariantImage[]> = {};
      (imgs || []).forEach((img: any) => {
        if (!grouped[img.variant_id]) grouped[img.variant_id] = [];
        grouped[img.variant_id].push(img as VariantImage);
      });
      setVariantImages(grouped);
    }
  };

  const updateVariant = async (id: string, updates: Record<string, any>) => {
    // TODO: wire to PATCH /api/product-variants/:id
    setVariants(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
  };

  const deleteVariant = async (id: string) => {
    if (!confirm("Delete this variant?")) return;
    // TODO: wire to DELETE /api/product-variants/:id
    setVariants(prev => prev.filter(v => v.id !== id));
    setVariantImages(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleImageUpload = async (files: FileList, variantId: string) => {
    if (!productId || files.length === 0) return;
    setUploading(variantId);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append("file", files[i]);
        // TODO: wire to POST /api/files/upload then attach to variant
        await fetch(`${base}/api/files/upload`, { method: "POST", body: formData });
      }
      toast({ title: `${files.length} image(s) uploaded!` });
      await fetchVariants(productId!);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(null);
  };

  const deleteVariantImage = async (imgId: string, variantId: string) => {
    // TODO: wire to DELETE /api/product-images/:id
    setVariantImages(prev => ({
      ...prev, [variantId]: (prev[variantId] || []).filter(i => i.id !== imgId),
    }));
  };

  const hasSelections = Object.values(selectedVariants).some(v => v.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Variant Pricing</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {hasSelections ? "Auto-synced from variant selections above" : "Select variant options above to auto-generate combinations"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {!enabled ? null : !productId && isNew ? (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-4 py-3">Save the product first to manage variants.</p>
      ) : (
        <div className="space-y-2">
          {variants.length === 0 && hasSelections && (
            <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-4 py-3 text-center">
              Syncing variants…
            </p>
          )}

          {variants.map((v) => {
            const images = variantImages[v.id] || [];
            return (
              <div key={v.id} className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={v.label}
                    className="h-8 text-xs font-medium flex-1 min-w-0 bg-muted/20"
                    placeholder="Variant name"
                    readOnly
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      value={v.price}
                      onChange={e => updateVariant(v.id, { price: Number(e.target.value) })}
                      className="h-8 text-xs w-20"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground line-through">₹</span>
                    <Input
                      type="number"
                      value={v.compare_at_price}
                      onChange={e => updateVariant(v.id, { compare_at_price: Number(e.target.value) })}
                      className="h-8 text-xs w-20"
                      placeholder="0"
                    />
                  </div>
                  <Input
                    value={v.sku || ""}
                    onChange={e => updateVariant(v.id, { sku: e.target.value || null })}
                    className="h-8 text-xs w-24 hidden sm:block"
                    placeholder="SKU"
                  />
                  <Input
                    type="number"
                    value={v.stock_quantity}
                    onChange={e => updateVariant(v.id, { stock_quantity: Number(e.target.value) })}
                    className="h-8 text-xs w-16 hidden sm:block"
                    placeholder="Qty"
                  />
                  <button onClick={() => deleteVariant(v.id)} className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {images.map(img => (
                    <div key={img.id} className="relative group w-10 h-10 rounded-md border border-border overflow-hidden shrink-0">
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => deleteVariantImage(img.id, v.id)}
                        className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    className="w-10 h-10 rounded-md border border-dashed border-border/60 hover:border-primary/40 flex items-center justify-center transition-colors shrink-0"
                    onClick={() => { setUploadTarget(v.id); fileRef.current?.click(); }}
                  >
                    {uploading === v.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </button>
                  {images.length === 0 && <span className="text-[10px] text-muted-foreground">No images</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { if (e.target.files && uploadTarget) handleImageUpload(e.target.files, uploadTarget); e.target.value = ""; }} />
    </div>
  );
}
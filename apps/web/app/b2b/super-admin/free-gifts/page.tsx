"use client";

/**
 * Free Gifts admin — rebuilt for Deploy 122.
 *
 * Rules (matches Product Drop / variant-template conventions):
 *   - A product's normal basePrice is never modified when it becomes a
 *     free gift. We store the gift config in product.metadata.freeGift:
 *        { isActive: true, minCartInr, shippingInr, maxPerOrder }
 *   - At cart time the frontend reads this and offers the product as a
 *     free gift once the customer's subtotal crosses minCartInr.
 *   - Customer pays only the shipping_inr — the product price is waived.
 *
 * This admin page:
 *   1. Edits the site-wide banner (enabled/title/subtitle/gift_value)
 *   2. Lists all products currently marked as free gifts with their thresholds
 *   3. Lets admin toggle any product via a modal that captures
 *      minCartInr + shippingInr + maxPerOrder — no destructive price edits.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Gift, Loader2, Save, Trash2, Plus, Search, X, Package, IndianRupee, Pencil,
} from "lucide-react";
import {
  toast,
  Button, Input, Switch, Label, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeGet, safePatch } from "@/lib/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────
interface BannerSettings {
  enabled: boolean;
  title: string;
  subtitle: string;
  gift_value: number;
}

// Canonical free-gift config. Stored at product.metadata.freeGift.
interface FreeGiftConfig {
  isActive: boolean;
  minCartInr: number;    // cart must be ≥ this for the gift to be offered
  shippingInr: number;   // what the customer actually pays
  maxPerOrder: number;   // usually 1
}

// Shape returned by GET /api/products (public list)
interface RawProduct {
  id: string;
  title?: string;
  name?: string;
  images?: string[] | { url: string }[];
  basePrice?: number | string;
  metadata?: Record<string, unknown> | null;
}

interface GiftProduct {
  id: string;
  name: string;
  image: string;
  price: number;             // untouched — what the product normally costs
  giftConfig: FreeGiftConfig | null;
}

const DEFAULT_BANNER: BannerSettings = {
  enabled: true,
  title: "FREE GIFT Worth ₹299",
  subtitle: "Limited time offer!",
  gift_value: 299,
};

const DEFAULT_GIFT_CONFIG: FreeGiftConfig = {
  isActive: true,
  minCartInr: 999,
  shippingInr: 49,
  maxPerOrder: 1,
};

function parseGiftConfig(meta: unknown): FreeGiftConfig | null {
  const m = (meta ?? {}) as { freeGift?: unknown; isFreeGift?: unknown };
  if (m.freeGift && typeof m.freeGift === "object") {
    const f = m.freeGift as Partial<FreeGiftConfig>;
    if (f.isActive === false) return null;
    return {
      isActive: true,
      minCartInr: Number(f.minCartInr ?? DEFAULT_GIFT_CONFIG.minCartInr),
      shippingInr: Number(f.shippingInr ?? DEFAULT_GIFT_CONFIG.shippingInr),
      maxPerOrder: Number(f.maxPerOrder ?? DEFAULT_GIFT_CONFIG.maxPerOrder),
    };
  }
  // Legacy: older records used `metadata.isFreeGift: true` with no config.
  // Treat them as active with defaults so admin can edit + save proper values.
  if (m.isFreeGift === true) return { ...DEFAULT_GIFT_CONFIG };
  return null;
}

function normaliseProduct(p: RawProduct): GiftProduct {
  const name = p.title ?? p.name ?? "Unnamed product";
  const images = p.images ?? [];
  let image = "";
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    image = typeof first === "string" ? first : (first as { url: string }).url ?? "";
  }
  return {
    id: p.id,
    name,
    image,
    price: Number(p.basePrice ?? 0),
    giftConfig: parseGiftConfig(p.metadata),
  };
}

// ── Modal for setting free-gift thresholds ───────────────────────────────
function GiftConfigDialog({
  product, open, onClose, onSave, busy,
}: {
  product: GiftProduct | null;
  open: boolean;
  onClose: () => void;
  onSave: (cfg: FreeGiftConfig) => void;
  busy: boolean;
}) {
  const [cfg, setCfg] = useState<FreeGiftConfig>(DEFAULT_GIFT_CONFIG);
  useEffect(() => {
    if (product) {
      setCfg(product.giftConfig ?? { ...DEFAULT_GIFT_CONFIG });
    }
  }, [product]);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" /> Free-gift rules
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-muted/30 p-3 flex items-center gap-3">
          {product.image ? (
            <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-border/30" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Package className="w-4 h-4 text-muted-foreground/40" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{product.name}</p>
            <p className="text-[11px] text-muted-foreground">Normal price ₹{product.price.toFixed(0)}</p>
          </div>
        </div>

        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Min cart value to offer gift (₹)</Label>
            <Input
              type="number"
              min={1}
              value={cfg.minCartInr}
              onChange={(e) => setCfg({ ...cfg, minCartInr: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="mt-1 h-9"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Only customers whose cart ≥ this amount will see the free-gift CTA.
            </p>
          </div>
          <div>
            <Label className="text-xs">Customer pays for shipping (₹)</Label>
            <Input
              type="number"
              min={0}
              value={cfg.shippingInr}
              onChange={(e) => setCfg({ ...cfg, shippingInr: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="mt-1 h-9"
            />
            <p className="text-[10px] text-emerald-600 mt-0.5">
              Savings vs normal price: ₹{Math.max(0, product.price - cfg.shippingInr).toFixed(0)}
            </p>
          </div>
          <div>
            <Label className="text-xs">Max per order</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={cfg.maxPerOrder}
              onChange={(e) => setCfg({ ...cfg, maxPerOrder: Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1)) })}
              className="mt-1 h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={() => onSave({ ...cfg, isActive: true })}
            disabled={busy || cfg.minCartInr <= 0}
            className="gap-1.5"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AdminFreeGift() {
  const [search, setSearch] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [settings, setSettings] = useState<BannerSettings>(DEFAULT_BANNER);
  const [allProducts, setAllProducts] = useState<GiftProduct[]>([]);

  const [configTarget, setConfigTarget] = useState<GiftProduct | null>(null);
  const [configBusy, setConfigBusy] = useState(false);

  // ── Settings ────────────────────────────────────────────────────────────
  const fetchSettings = async () => {
    setLoadingSettings(true);
    const data = await safeGet<{ key?: string; value?: BannerSettings } | null>(
      "/admin/settings/free_gift_banner",
      null,
    );
    if (data?.value) setSettings(data.value);
    setLoadingSettings(false);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    await safePatch("/admin/settings/free_gift_banner", { value: settings }, null);
    toast({ title: "Banner saved" });
    setSavingSettings(false);
  };

  // ── Products ────────────────────────────────────────────────────────────
  const fetchAllProducts = async () => {
    setLoadingProducts(true);
    const data = await safeGet<{ items?: RawProduct[] } | RawProduct[]>(
      "/products?pageSize=500",
      [],
    );
    const raw: RawProduct[] = Array.isArray(data)
      ? data
      : (data as { items?: RawProduct[] }).items ?? [];
    setAllProducts(raw.map(normaliseProduct));
    setLoadingProducts(false);
  };

  useEffect(() => { fetchSettings(); fetchAllProducts(); }, []);

  // ── Toggle + edit flow ──────────────────────────────────────────────────
  const saveGiftConfig = async (product: GiftProduct, cfg: FreeGiftConfig) => {
    setConfigBusy(true);
    // CRITICAL: we merge into existing metadata; we DO NOT touch basePrice.
    // Any admin who then wants to permanently change the product's price
    // does it from the product editor — the free-gift flow is non-destructive.
    const raw = await safeGet<RawProduct | null>(`/products/${product.id}`, null);
    const existingMeta = (raw?.metadata ?? {}) as Record<string, unknown>;
    const nextMeta = {
      ...existingMeta,
      freeGift: cfg,
      // Clear the legacy flag — freeGift.isActive is now the source of truth.
      isFreeGift: undefined,
    };
    await safePatch(`/products/admin/${product.id}`, { metadata: nextMeta }, null);
    setAllProducts((prev) =>
      prev.map((p) => p.id === product.id ? { ...p, giftConfig: cfg } : p),
    );
    setConfigBusy(false);
    setConfigTarget(null);
    toast({ title: "Gift rule saved" });
  };

  const removeGiftConfig = async (product: GiftProduct) => {
    if (!confirm(`Remove "${product.name}" from free gifts? The product's normal price is untouched.`)) return;
    const raw = await safeGet<RawProduct | null>(`/products/${product.id}`, null);
    const existingMeta = (raw?.metadata ?? {}) as Record<string, unknown>;
    const nextMeta = {
      ...existingMeta,
      freeGift: { ...(existingMeta.freeGift as object ?? {}), isActive: false },
      isFreeGift: undefined,
    };
    await safePatch(`/products/admin/${product.id}`, { metadata: nextMeta }, null);
    setAllProducts((prev) =>
      prev.map((p) => p.id === product.id ? { ...p, giftConfig: null } : p),
    );
    toast({ title: "Removed from free gifts" });
  };

  // ── Derived lists ──────────────────────────────────────────────────────
  const giftProducts = useMemo(
    () => allProducts.filter((p) => p.giftConfig?.isActive),
    [allProducts],
  );
  const nonGiftProducts = useMemo(() => {
    const list = allProducts.filter((p) => !p.giftConfig?.isActive);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [allProducts, search]);

  if (loadingSettings || loadingProducts) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Gift className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Free Gifts</h1>
          <p className="text-xs text-muted-foreground">
            {giftProducts.length} gift product{giftProducts.length === 1 ? "" : "s"} · Banner {settings.enabled ? "active" : "hidden"}
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] leading-relaxed">
        <p className="font-semibold mb-1">How the free-gift flow works</p>
        <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
          <li>Admin picks a product and sets a <b>min-cart threshold</b> + <b>shipping-only price</b>.</li>
          <li>When a customer's cart subtotal ≥ the threshold, the free gift is offered in cart.</li>
          <li>Customer pays only the shipping — the product price is fully waived.</li>
          <li>Removing a product from free gifts <b>never</b> changes its normal selling price.</li>
        </ol>
      </div>

      {/* Banner Settings */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/10">
          <p className="text-xs font-semibold">Storefront banner</p>
          <div className="flex items-center gap-2">
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
            />
            <span className="text-[10px] text-muted-foreground">
              {settings.enabled ? "Visible" : "Hidden"}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-[11px] text-muted-foreground">Title</Label>
              <Input
                value={settings.title}
                onChange={(e) => setSettings((s) => ({ ...s, title: e.target.value }))}
                className="h-9 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Gift value (₹)</Label>
              <Input
                type="number"
                value={settings.gift_value}
                onChange={(e) => setSettings((s) => ({ ...s, gift_value: Number(e.target.value) }))}
                className="h-9 text-sm mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Subtitle</Label>
            <Input
              value={settings.subtitle}
              onChange={(e) => setSettings((s) => ({ ...s, subtitle: e.target.value }))}
              className="h-9 text-sm mt-1"
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Preview</p>
            <div className="bg-accent rounded-xl p-3 border border-primary/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-display font-bold text-sm">{settings.title}</p>
                <p className="text-[10px] text-primary font-medium">{settings.subtitle}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={saveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save banner
            </Button>
          </div>
        </div>
      </div>

      {/* Active gift products */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
          <p className="text-xs font-semibold">Active gift products</p>
          <p className="text-[10px] text-muted-foreground">Customers pay only shipping once their cart crosses the threshold</p>
        </div>

        {giftProducts.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No gift products yet</p>
            <p className="text-[10px] text-muted-foreground">Add one from the list below</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {giftProducts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-4 py-2.5 group hover:bg-accent/30 transition-colors"
              >
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border/30" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="inline-flex items-center gap-0.5">
                      <IndianRupee className="w-2.5 h-2.5" />{p.price.toFixed(0)} <span className="opacity-40">price</span>
                    </span>
                    <span>·</span>
                    <span>Min cart ₹{p.giftConfig?.minCartInr}</span>
                    <span>·</span>
                    <span>Pays ₹{p.giftConfig?.shippingInr} shipping</span>
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shrink-0"
                >
                  Free
                </Badge>
                <button
                  onClick={() => setConfigTarget(p)}
                  className="p-1.5 rounded-lg hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit rule"
                >
                  <Pencil className="w-3.5 h-3.5 text-primary" />
                </button>
                <button
                  onClick={() => removeGiftConfig(p)}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove from free gifts"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add products */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 bg-muted/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold">Add products</p>
            <p className="text-[10px] text-muted-foreground">{nonGiftProducts.length} available</p>
          </div>
          {allProducts.filter((p) => !p.giftConfig?.isActive).length > 5 && (
            <div className="relative w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-7 h-7 text-[11px] pr-7"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
        </div>

        {nonGiftProducts.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {search
              ? "No matches"
              : allProducts.length === 0
                ? "No products in catalog yet — create some under Products first."
                : "All products are already free gifts"}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
            {nonGiftProducts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30 transition-colors"
              >
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-8 h-8 rounded-lg object-cover shrink-0 border border-border/30" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-3.5 h-3.5 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">₹{p.price.toFixed(0)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] gap-1 px-2 shrink-0"
                  onClick={() => setConfigTarget(p)}
                >
                  <Plus className="w-3 h-3" /> Add as free gift
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gift-config dialog */}
      <GiftConfigDialog
        product={configTarget}
        open={!!configTarget}
        onClose={() => setConfigTarget(null)}
        onSave={(cfg) => configTarget && saveGiftConfig(configTarget, cfg)}
        busy={configBusy}
      />
    </div>
  );
}

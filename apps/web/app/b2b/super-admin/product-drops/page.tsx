"use client";

/**
 * Product Drops admin — Deploy 120.
 *
 * Admin picks a real product, sets ₹shipping price + win odds + caps, and
 * runs a "product drop" campaign. Customers play once/day on the Gift
 * Casino; winners get a voucher they redeem at the shipping-only price.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Gift, Plus, Pencil, Trash2, Loader2, Search, Play, Pause,
  TrendingUp, Calendar, Truck, Sparkles,
} from "lucide-react";
import {
  Button, Input, Label, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import { authHeaders, getApiBase } from "@/lib/admin-api";

type ProductRef = { id: string; title: string; slug: string; basePrice: number | string; images?: any };

type GameMode = "drop" | "guess_price" | "daily_deal" | "product_wheel";

interface WheelSlice { productId: string; shippingInr: number; weight: number; label?: string }

interface Drop {
  id: string;
  productId: string;
  product: ProductRef;
  gameMode: GameMode;
  modeConfig: Record<string, unknown> | null;
  shippingInr: number;
  winOddsPct: number | string;
  dailyLimit: number;
  maxWinners: number | null;
  winnersCount: number;
  claimWindowHours: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  title: string | null;
  subtitle: string | null;
  bannerImage: string | null;
  createdAt: string;
}

const MODE_META: Record<GameMode, { label: string; emoji: string; desc: string }> = {
  drop:          { label: "Lottery Drop",   emoji: "🎁", desc: "Random roll · win odds in %" },
  guess_price:   { label: "Guess the Price", emoji: "💲", desc: "Guess base price within tolerance %" },
  daily_deal:    { label: "Daily Deal",      emoji: "💥", desc: "Guaranteed win — once per day" },
  product_wheel: { label: "Product Wheel",   emoji: "🎡", desc: "Spin; server picks a slice" },
};

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

type FormState = {
  id?: string;
  productId: string;
  gameMode: GameMode;
  // Mode-specific params ────────────────────────────────────────────────
  tolerancePct: number;        // guess_price
  wheelSlices: WheelSlice[];   // product_wheel
  // Core ────────────────────────────────────────────────────────────────
  shippingInr: number;
  winOddsPct: number;
  dailyLimit: number;
  maxWinners: number | null;
  claimWindowHours: number;
  startsAt: string; // datetime-local string, empty = null
  endsAt: string;
  title: string;
  subtitle: string;
  bannerImage: string;
  isActive: boolean;
};
const EMPTY_FORM: FormState = {
  productId: "",
  gameMode: "drop",
  tolerancePct: 10,
  wheelSlices: [],
  shippingInr: 49,
  winOddsPct: 1.0,
  dailyLimit: 1,
  maxWinners: null,
  claimWindowHours: 72,
  startsAt: "",
  endsAt: "",
  title: "",
  subtitle: "",
  bannerImage: "",
  isActive: true,
};

export default function AdminProductDrops() {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const d = await api<Drop[]>("/games/admin/product-drops");
    setDrops(Array.isArray(d) ? d : []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // Fetch products for the picker (first 500 should cover nearly everyone).
    api<any>("/products?pageSize=500").then((raw) => {
      const items: any[] = Array.isArray(raw) ? raw : (raw?.items ?? []);
      setProducts(
        items.map((p) => ({
          id: p.id,
          title: p.title ?? p.name,
          slug: p.slug,
          basePrice: p.basePrice ?? p.price ?? 0,
          images: p.images,
        })),
      );
    });
  }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (d: Drop) => {
    const cfg = (d.modeConfig ?? {}) as any;
    setForm({
      id: d.id,
      productId: d.productId,
      gameMode: d.gameMode ?? "drop",
      tolerancePct: typeof cfg.tolerancePct === "number" ? cfg.tolerancePct : 10,
      wheelSlices: Array.isArray(cfg.slices) ? cfg.slices : [],
      shippingInr: d.shippingInr,
      winOddsPct: Number(d.winOddsPct),
      dailyLimit: d.dailyLimit,
      maxWinners: d.maxWinners,
      claimWindowHours: d.claimWindowHours,
      startsAt: d.startsAt ? d.startsAt.slice(0, 16) : "",
      endsAt:   d.endsAt   ? d.endsAt.slice(0, 16)   : "",
      title:    d.title ?? "",
      subtitle: d.subtitle ?? "",
      bannerImage: d.bannerImage ?? "",
      isActive: d.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.productId) { setToast("Pick a product first"); return; }
    // Build modeConfig from mode-specific UI fields.
    let modeConfig: Record<string, unknown> | null = null;
    if (form.gameMode === "guess_price") {
      modeConfig = { tolerancePct: form.tolerancePct };
    } else if (form.gameMode === "product_wheel") {
      if (form.wheelSlices.length < 2) {
        setToast("A Product Wheel needs at least 2 slices"); return;
      }
      modeConfig = { slices: form.wheelSlices };
    }
    setBusy(true);
    const payload = {
      productId: form.productId,
      gameMode: form.gameMode,
      modeConfig,
      shippingInr: form.shippingInr,
      winOddsPct: form.winOddsPct,
      dailyLimit: form.dailyLimit,
      maxWinners: form.maxWinners,
      claimWindowHours: form.claimWindowHours,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt:   form.endsAt   ? new Date(form.endsAt).toISOString()   : null,
      title:    form.title || undefined,
      subtitle: form.subtitle || undefined,
      bannerImage: form.bannerImage || undefined,
      isActive: form.isActive,
    };
    let res: any;
    if (form.id) {
      // Update — omit productId from payload (can't change product on existing drop)
      const { productId, ...patch } = payload;
      res = await api(`/games/admin/product-drops/${form.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } else {
      res = await api("/games/admin/product-drops", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    setBusy(false);
    if (!res) { setToast("Save failed — check inputs"); return; }
    setToast(form.id ? "Drop updated" : "Drop created");
    setDialogOpen(false);
    refresh();
    setTimeout(() => setToast(null), 2500);
  };

  const toggleActive = async (d: Drop) => {
    await api(`/games/admin/product-drops/${d.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !d.isActive }),
    });
    refresh();
  };

  const remove = async (d: Drop) => {
    if (!confirm(`Delete the "${d.product.title}" drop? Any unused vouchers stay with winners.`)) return;
    await api(`/games/admin/product-drops/${d.id}`, { method: "DELETE" });
    refresh();
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return drops;
    const q = search.toLowerCase();
    return drops.filter((d) =>
      d.product.title.toLowerCase().includes(q) ||
      (d.title ?? "").toLowerCase().includes(q),
    );
  }, [drops, search]);

  const selectedProduct = products.find((p) => p.id === form.productId);
  const basePriceNum = selectedProduct ? Number(selectedProduct.basePrice) : 0;
  const savings = basePriceNum > 0 ? basePriceNum - form.shippingInr : 0;
  const expectedWinsPerDay = Math.max(0, (form.winOddsPct / 100)).toFixed(4);

  return (
    <div className="max-w-6xl space-y-5">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-display font-bold tracking-tight">
            <Gift className="w-6 h-6 text-pink-500" /> Product Drops
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Give customers a shot at winning a real product. They pay only the shipping charge you set.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Drop
        </Button>
      </div>

      {/* Search */}
      {drops.length > 2 && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drops by product or title…"
            className="pl-8 h-9"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-14 text-center">
          <Gift className="w-9 h-9 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-semibold">No product drops yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Hook customers with a chance to win — they pay only shipping.
          </p>
          <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="w-4 h-4" /> Create first drop</Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((d) => {
            const odds = Number(d.winOddsPct);
            const firstImage = Array.isArray((d.product as any).images)
              ? (d.product as any).images[0]?.url ?? (d.product as any).images[0]
              : (d.bannerImage ?? null);
            return (
              <div
                key={d.id}
                className={`rounded-2xl border p-4 transition-shadow ${
                  d.isActive ? "bg-card border-border/60 hover:shadow-md" : "bg-muted/20 border-border/40 opacity-80"
                }`}
              >
                <div className="flex gap-3">
                  {firstImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={firstImage} alt="" className="w-16 h-16 rounded-lg object-cover border border-border/30 shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Gift className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold truncate">{d.title ?? d.product.title}</p>
                      <span className="text-[9px] font-bold rounded-full bg-fuchsia-500/10 text-fuchsia-600 px-1.5 py-0.5">
                        {MODE_META[d.gameMode ?? "drop"]?.emoji} {MODE_META[d.gameMode ?? "drop"]?.label ?? d.gameMode}
                      </span>
                      {d.isActive
                        ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 border text-[9px]">Live</Badge>
                        : <Badge variant="secondary" className="text-[9px]">Paused</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {d.product.title} · Base ₹{Number(d.product.basePrice).toFixed(0)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                      <span className="rounded-full bg-pink-500/10 text-pink-600 px-2 py-0.5 font-bold">
                        ₹{d.shippingInr} shipping only
                      </span>
                      <span className="rounded-full bg-amber-500/10 text-amber-600 px-2 py-0.5 font-bold">
                        {odds}% win odds
                      </span>
                      <span className="rounded-full bg-violet-500/10 text-violet-600 px-2 py-0.5 font-bold">
                        {d.winnersCount}{d.maxWinners ? `/${d.maxWinners}` : ""} won
                      </span>
                    </div>
                    {(d.startsAt || d.endsAt) && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {d.startsAt ? new Date(d.startsAt).toLocaleDateString() : "anytime"}
                        {" → "}
                        {d.endsAt ? new Date(d.endsAt).toLocaleDateString() : "no end"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 pt-2 border-t border-border/30">
                  <button
                    onClick={() => toggleActive(d)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {d.isActive ? <><Pause className="w-3 h-3" /> Pause</> : <><Play className="w-3 h-3" /> Resume</>}
                  </button>
                  <button
                    onClick={() => openEdit(d)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => remove(d)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit dialog ────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit drop" : "New product drop"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* ── Game mode picker ─────────────────────────────────────── */}
            <div>
              <Label className="text-xs">Game mode *</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(Object.keys(MODE_META) as GameMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, gameMode: m }))}
                    className={`rounded-xl border p-2.5 text-left transition-colors ${
                      form.gameMode === m
                        ? "border-pink-500 bg-pink-500/5"
                        : "border-border hover:border-border/80 bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">{MODE_META[m].emoji}</span>
                      <span className="text-[12px] font-bold">{MODE_META[m].label}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{MODE_META[m].desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">
                {form.gameMode === "product_wheel" ? "Primary product (fallback) *" : "Product *"}
              </Label>
              <Select
                value={form.productId}
                onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}
              >
                <SelectTrigger className="h-10 mt-1">
                  <SelectValue placeholder="Pick a product…" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title} — ₹{Number(p.basePrice).toFixed(0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.id && (
                <p className="text-[10px] text-muted-foreground mt-1">Product can't be changed after create. Create a new drop instead.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1"><Truck className="w-3 h-3" /> Shipping-only price (₹) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.shippingInr}
                  onChange={(e) => setForm((f) => ({ ...f, shippingInr: parseInt(e.target.value, 10) || 0 }))}
                  className="mt-1"
                />
                {selectedProduct && (
                  <p className="text-[10px] text-emerald-600 mt-1">
                    Winner saves ₹{savings.toFixed(0)} vs base ₹{basePriceNum.toFixed(0)}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Win odds (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0.01}
                  max={100}
                  value={form.winOddsPct}
                  disabled={form.gameMode !== "drop"}
                  onChange={(e) => setForm((f) => ({ ...f, winOddsPct: parseFloat(e.target.value) || 0 }))}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {form.gameMode === "drop"
                    ? `≈ ${expectedWinsPerDay} wins per player-attempt`
                    : "Used by Lottery Drop only"}
                </p>
              </div>
            </div>

            {/* ── Mode-specific fields ────────────────────────────────── */}
            {form.gameMode === "guess_price" && (
              <div className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-3 space-y-2">
                <div className="text-[11px] font-bold text-pink-700 dark:text-pink-300 flex items-center gap-1.5">
                  💲 Guess the Price — tuning
                </div>
                <div>
                  <Label className="text-xs">Tolerance (%)</Label>
                  <Input
                    type="number"
                    step="1"
                    min={1}
                    max={50}
                    value={form.tolerancePct}
                    onChange={(e) => setForm((f) => ({ ...f, tolerancePct: parseFloat(e.target.value) || 0 }))}
                    className="mt-1 h-8"
                  />
                  {selectedProduct && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Winner range: ₹{Math.max(0, basePriceNum * (1 - form.tolerancePct / 100)).toFixed(0)} – ₹{(basePriceNum * (1 + form.tolerancePct / 100)).toFixed(0)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {form.gameMode === "daily_deal" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  💥 Daily Deal — guaranteed win
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Every play succeeds. Use <b>Max winners</b> + <b>Schedule window</b> to create scarcity. The Win Odds field above is ignored.
                </p>
              </div>
            )}

            {form.gameMode === "product_wheel" && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                    🎡 Wheel slices
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      wheelSlices: [
                        ...f.wheelSlices,
                        { productId: "", shippingInr: f.shippingInr, weight: 10, label: "" },
                      ],
                    }))}
                    className="inline-flex items-center gap-1 rounded-md bg-violet-600 text-white text-[11px] font-bold px-2 py-1"
                  >
                    <Plus className="w-3 h-3" /> Add slice
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Leave a slice's product empty to make it a "no-win" slot. Weights are relative.
                </p>
                {form.wheelSlices.length === 0 && (
                  <div className="text-[11px] italic text-muted-foreground py-2">
                    No slices yet — click "Add slice" to configure the wheel.
                  </div>
                )}
                {form.wheelSlices.map((slice, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_70px_30px] gap-1.5 items-center">
                    <select
                      value={slice.productId}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        wheelSlices: f.wheelSlices.map((s, j) =>
                          j === i ? { ...s, productId: e.target.value } : s,
                        ),
                      }))}
                      className="h-8 rounded-md border border-border bg-background text-xs px-2"
                    >
                      <option value="">— no-win slice —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      placeholder="₹ship"
                      value={slice.shippingInr}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        wheelSlices: f.wheelSlices.map((s, j) =>
                          j === i ? { ...s, shippingInr: parseInt(e.target.value, 10) || 0 } : s,
                        ),
                      }))}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      placeholder="weight"
                      value={slice.weight}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        wheelSlices: f.wheelSlices.map((s, j) =>
                          j === i ? { ...s, weight: parseFloat(e.target.value) || 0 } : s,
                        ),
                      }))}
                      className="h-8 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        wheelSlices: f.wheelSlices.filter((_, j) => j !== i),
                      }))}
                      className="h-8 w-8 rounded-md hover:bg-destructive/10 text-destructive/70 hover:text-destructive flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Daily limit per user</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.dailyLimit}
                  onChange={(e) => setForm((f) => ({ ...f, dailyLimit: parseInt(e.target.value, 10) || 1 }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Max winners (total)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="∞"
                  value={form.maxWinners ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setForm((f) => ({ ...f, maxWinners: Number.isFinite(n) && n > 0 ? n : null }));
                  }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Claim window (hrs)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.claimWindowHours}
                  onChange={(e) => setForm((f) => ({ ...f, claimWindowHours: parseInt(e.target.value, 10) || 72 }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Starts at</Label>
                <Input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Ends at</Label>
                <Input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs flex items-center gap-1"><Sparkles className="w-3 h-3" /> Custom title (optional)</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Weekend Watch Drop"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Subtitle (optional)</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="e.g. Pay ₹49 shipping. That's it."
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Banner image URL (optional)</Label>
              <Input
                value={form.bannerImage}
                onChange={(e) => setForm((f) => ({ ...f, bannerImage: e.target.value }))}
                placeholder="/api/files/…"
                className="mt-1"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Active (visible to customers)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || !form.productId} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : form.id ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {form.id ? "Save changes" : "Create drop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

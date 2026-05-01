"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Trash2, Palette, Ruler, Box, Sparkles, Tag, Loader2,
  Search, X, Pencil, CheckCircle2, AlertCircle, Image as ImageIcon, Upload,
} from "lucide-react";
import { Button, Input, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Label } from "@gifteeng/ui";
import { getApiBase, safeGet, safePatch, safePost } from "@/lib/admin-api";

/* ── Inline toast banner ─────────────────────────────────────── */
function ToastBanner({ msg, kind }: { msg: string; kind: "ok" | "err" }) {
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg pointer-events-none
      ${kind === "ok" ? "bg-green-600" : "bg-destructive"}`}>
      {kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface VariantOption {
  id: string;
  variant_type: string;
  value: string;
  image_url?: string | null;
  sort_order: number;
  is_active: boolean;
  product_count?: number; // how many products use this variant value
}

/** Upload a file to the backend and return the signed URL (or null). */
async function uploadVariantImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("ownerType", "variant-template");
  try {
    const res = await fetch(`${getApiBase()}/api/files/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.url ?? data?.path ?? "") || null;
  } catch { return null; }
}

const BUILT_IN: Record<string, { icon: React.ElementType; label: string; desc: string }> = {
  printing: { icon: Sparkles, label: "Printing",  desc: "Printing techniques" },
  finish:   { icon: Sparkles, label: "Finishes",  desc: "Surface finish options" },
  color:    { icon: Palette,  label: "Colors",    desc: "Available color options" },
  size:     { icon: Ruler,    label: "Sizes",     desc: "Product dimensions & sizes" },
  material: { icon: Box,      label: "Materials", desc: "Material types" },
};

const TAB_ORDER = ["printing", "finish", "color", "size", "material"];

const getInfo = (type: string) =>
  BUILT_IN[type] || {
    icon: Tag,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    desc: `Custom: ${type}`,
  };

const parseColor = (val: string) => { const p = val.split("|"); return { name: p[0], hex: p[1] || "" }; };
const fmtColor   = (name: string, hex: string) => (hex ? `${name}|${hex}` : name);

/* ─── Inline-editable chip ──────────────────────────── */
function OptionChip({
  opt, isColor, canHaveImage, onDelete, onUpdate, onUpdateImage,
}: {
  opt: VariantOption;
  isColor: boolean;
  canHaveImage: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, value: string) => void;
  onUpdateImage: (id: string, url: string | null) => void;
}) {
  const { name: colorName, hex: colorHex } = isColor ? parseColor(opt.value) : { name: opt.value, hex: "" };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(colorName);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    if (draft.trim() && draft.trim() !== colorName) {
      onUpdate(opt.id, isColor ? fmtColor(draft.trim(), colorHex) : draft.trim());
    }
    setEditing(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    const url = await uploadVariantImage(file);
    setUploading(false);
    if (url) onUpdateImage(opt.id, url);
  };

  return (
    <div className="group relative flex items-center justify-between gap-1.5 rounded-xl border border-border/60 bg-background px-2.5 py-2 text-sm font-medium hover:border-primary/40 hover:bg-accent/20 transition-all">
      {/* Thumbnail or colour swatch */}
      {canHaveImage && opt.image_url ? (
        <span className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-muted border border-border/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={opt.image_url} alt={opt.value} className="w-full h-full object-cover" />
        </span>
      ) : canHaveImage ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative w-9 h-9 rounded-lg shrink-0 bg-muted/40 border border-dashed border-border/60 flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          title="Upload thumbnail"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
        </button>
      ) : isColor ? (
        <span
          className="w-4 h-4 rounded-full shrink-0 border border-white/20 shadow-sm"
          style={{ background: colorHex || "#ccc" }}
        />
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="flex-1 min-w-0 bg-transparent text-xs font-medium outline-none border-b border-primary"
        />
      ) : (
        <span className="flex-1 min-w-0 truncate text-xs">{colorName}</span>
      )}
      {isColor && colorHex && !editing && (
        <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">{colorHex}</span>
      )}
      {/* Product-usage badge */}
      <span
        className={`text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded-full leading-none ${
          (opt.product_count ?? 0) > 0
            ? "bg-pink-500/10 text-pink-600"
            : "bg-muted text-muted-foreground/60"
        }`}
        title={`${opt.product_count ?? 0} product${(opt.product_count ?? 0) === 1 ? "" : "s"} use this`}
      >
        {opt.product_count ?? 0}
      </span>
      {/* Action buttons — appear on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {canHaveImage && opt.image_url && (
          <button
            onClick={() => fileRef.current?.click()}
            className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Replace thumbnail"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          </button>
        )}
        {canHaveImage && opt.image_url && (
          <button
            onClick={() => onUpdateImage(opt.id, null)}
            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove thumbnail"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={() => { setDraft(colorName); setEditing(true); }}
          className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(opt.id)}
          className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────── */
export default function AdminVariants() {
  const [options,     setOptions]     = useState<VariantOption[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [newValue,    setNewValue]    = useState("");
  const [newHex,      setNewHex]      = useState("#ec4899");
  const [activeTab,   setActiveTab]   = useState("size");
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [search,      setSearch]      = useState("");
  const [toastMsg,    setToastMsg]    = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToastMsg({ msg, kind });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const fetchOptions = async () => {
    setLoading(true);
    const data = await safeGet<{ items?: VariantOption[] } | VariantOption[]>(
      "/product-variant-options?pageSize=500", { items: [] }
    );
    const list = Array.isArray(data) ? data : (data.items || []);
    setOptions(list);
    setLoading(false);
  };

  useEffect(() => { fetchOptions(); }, []);

  // Build tab list: preferred order first, then any custom types
  const variantTypes = useMemo(() => {
    const allTypes = new Set(options.map(o => o.variant_type));
    TAB_ORDER.forEach(t => allTypes.add(t));
    const preferred = TAB_ORDER.filter(t => allTypes.has(t));
    const custom    = Array.from(allTypes).filter(t => !TAB_ORDER.includes(t));
    return [...preferred, ...custom];
  }, [options]);

  const activeOptions = useMemo(() => {
    const items = options.filter(o => o.variant_type === activeTab);
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(o => {
      const name = activeTab === "color" ? parseColor(o.value).name : o.value;
      return name.toLowerCase().includes(q);
    });
  }, [options, activeTab, search]);

  const isColor   = activeTab === "color";
  const info      = getInfo(activeTab);
  const ActiveIcon = info.icon;
  const isBuiltIn = activeTab in BUILT_IN;
  const totalCount = options.filter(o => o.variant_type === activeTab).length;

  const addOption = async () => {
    const val = newValue.trim();
    if (!val) { showToast("Type a value first", "err"); return; }
    const valToStore = isColor ? fmtColor(val, newHex) : val;
    const checkName  = val.toLowerCase();
    const exists = options.filter(o => o.variant_type === activeTab).some(o => {
      const cmp = isColor ? parseColor(o.value).name.toLowerCase() : o.value.toLowerCase();
      return cmp === checkName;
    });
    if (exists) { showToast(`"${val}" already exists`, "err"); return; }
    setSaving(true);
    const created = await safePost<VariantOption | null>("/product-variant-options/admin", {
      variant_type: activeTab,
      value: valToStore,
      sort_order: options.filter(o => o.variant_type === activeTab).length,
    }, null);
    setSaving(false);
    if (!created?.id) {
      showToast("Failed to save — check your permissions", "err");
      return; // keep input so user can retry
    }
    showToast(`✓ "${val}" added`);
    setNewValue(""); setNewHex("#ec4899");
    fetchOptions();
  };

  const deleteOption = async (id: string) => {
    if (!confirm("Delete this option?")) return;
    const res = await fetch(`${getApiBase()}/api/product-variant-options/admin/${id}`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (!res.ok) { showToast("Delete failed", "err"); return; }
    showToast("Deleted");
    fetchOptions();
  };

  const updateValue = async (id: string, value: string) => {
    const updated = await safePatch<VariantOption | null>(`/product-variant-options/admin/${id}`, { value }, null);
    if (!updated?.id) { showToast("Update failed", "err"); return; }
    setOptions(prev => prev.map(o => o.id === id ? { ...o, value } : o));
    showToast("✓ Updated");
  };

  const updateImage = async (id: string, image_url: string | null) => {
    const updated = await safePatch<VariantOption | null>(
      `/product-variant-options/admin/${id}`,
      { image_url },
      null,
    );
    if (!updated?.id) { showToast("Image update failed", "err"); return; }
    setOptions(prev => prev.map(o => o.id === id ? { ...o, image_url } : o));
    showToast(image_url ? "✓ Thumbnail saved" : "Thumbnail removed");
  };

  const addNewType = async () => {
    const key = newTypeName.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) { showToast("Enter a type name", "err"); return; }
    if (variantTypes.includes(key)) { showToast(`"${key}" already exists`, "err"); return; }
    setSaving(true);
    const created = await safePost<VariantOption | null>("/product-variant-options/admin", {
      variant_type: key, value: "Default", sort_order: 0,
    }, null);
    setSaving(false);
    if (!created?.id) { showToast("Failed to create type", "err"); return; }
    showToast(`✓ "${newTypeName.trim()}" created`);
    setNewTypeName(""); setShowAddType(false);
    await fetchOptions();
    setActiveTab(key);
  };

  const deleteType = async () => {
    if (!confirm(`Delete all "${info.label}" options?`)) return;
    const res = await fetch(
      `${getApiBase()}/api/product-variant-options/admin?variant_type=${activeTab}`,
      { method: "DELETE", headers: authHeaders() }
    );
    if (!res.ok) { showToast("Delete failed", "err"); return; }
    showToast(`${info.label} removed`);
    setActiveTab("size");
    fetchOptions();
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-4xl space-y-5">
      {toastMsg && <ToastBanner msg={toastMsg.msg} kind={toastMsg.kind} />}

      {/* ── Page header ─────────────────────────────── */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-display font-bold tracking-tight">
          <Palette className="w-6 h-6 text-primary" /> Variant Options
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage predefined options for product variants. These appear as dropdowns when editing products.
        </p>
      </div>

      {/* ── Type tabs ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-1">
        {variantTypes.map(t => {
          const tInfo  = getInfo(t);
          const Icon   = tInfo.icon;
          const count  = options.filter(o => o.variant_type === t).length;
          const active = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => { setActiveTab(t); setSearch(""); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-semibold transition-all border border-transparent
                ${active
                  ? "bg-background border-border/60 border-b-background -mb-px text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tInfo.label}
              <span className={`ml-0.5 min-w-[22px] text-center px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none
                ${active ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                {count}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setShowAddType(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-all ml-1"
        >
          <Plus className="w-3.5 h-3.5" /> Add Type
        </button>
      </div>

      {/* ── Active section card ───────────────────────── */}
      <div className="bg-card rounded-2xl border border-border/40 overflow-hidden">

        {/* Section header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ActiveIcon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold">{info.label}</h2>
              <p className="text-[11px] text-muted-foreground">{info.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-bold text-xs">
              {totalCount} options
            </Badge>
            {!isBuiltIn && (
              <button
                onClick={deleteType}
                className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Add + search row */}
        <div className="flex items-center gap-2 px-5 py-3 bg-muted/20 border-b border-border/20">
          {isColor && (
            <input
              type="color"
              value={newHex}
              onChange={e => setNewHex(e.target.value)}
              className="w-9 h-9 rounded-lg border border-input cursor-pointer p-0.5 shrink-0"
            />
          )}
          <Input
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            placeholder={isColor ? "Color name..." : `Add new ${info.label.toLowerCase().replace(/s$/, "")}...`}
            className="flex-1 h-9 text-sm bg-background"
            onKeyDown={e => e.key === "Enter" && addOption()}
          />
          {/* search (shown when list is long) */}
          {totalCount > 8 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter..."
                className="pl-8 pr-7 h-9 w-36 text-xs bg-background"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
          <Button
            onClick={addOption}
            disabled={saving || !newValue.trim()}
            size="sm"
            className="gap-1.5 h-9 px-4 text-xs shrink-0"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add
          </Button>
        </div>

        {/* ── Options grid (Lovable style) ────────────── */}
        {activeOptions.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 p-5">
            {activeOptions.map(opt => (
              <OptionChip
                key={opt.id}
                opt={opt}
                isColor={isColor}
                // Thumbnails are useful for design/style/theme/pattern etc.
                // Colors already have a hex swatch, so skip them there.
                canHaveImage={!isColor}
                onDelete={deleteOption}
                onUpdate={updateValue}
                onUpdateImage={updateImage}
              />
            ))}
          </div>
        ) : (
          <div className="py-14 text-center">
            <ActiveIcon className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "No matches" : `No ${info.label.toLowerCase()} yet`}
            </p>
            {!search && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                Type above and press Enter or click Add
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Add Type dialog ──────────────────────────── */}
      <Dialog open={showAddType} onOpenChange={setShowAddType}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">New Variant Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Type Name</Label>
              <Input
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                placeholder="e.g. Weight, Flavor, Frame…"
                onKeyDown={e => e.key === "Enter" && addNewType()}
                autoFocus
                className="h-9 text-sm"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Internal key:{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                {newTypeName.trim().toLowerCase().replace(/\s+/g, "_") || "…"}
              </code>
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddType(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={addNewType}
              disabled={!newTypeName.trim() || saving}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Create Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

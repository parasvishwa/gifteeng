#!/usr/bin/env bash
# Run on server as root:  bash /tmp/deploy-admin-pages.sh
# Writes the correct collections page (grouped list) + new customizer page, then rebuilds web.
set -e
cd /srv/gifteeng

echo "→ Writing collections/page.tsx …"
cat > apps/web/app/b2b/super-admin/collections/page.tsx << 'TSEOF'
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Trash2, Save, X, Upload, Loader2, FolderOpen, Search, Image as ImageIcon, Globe, FileEdit, GripVertical } from "lucide-react";
import { Button, Input, Label, Switch, Badge, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gifteeng/ui";

const toast = (..._args: unknown[]) => console.log(_args);

function getApiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}
function authHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("gifteeng.b2b.token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, { headers: authHeaders() });
    if (!r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}
async function safePost<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}
async function safePatch<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!r.ok) return fallback;
    return await r.json();
  } catch { return fallback; }
}

const GROUP_ORDER = ["By Relation", "By Occasion", "By Theme", "By Profession", "By Use Case", "Other"];

interface Collection { id: string; name: string; description: string; image: string; is_active: boolean; sort_order: number; created_at: string; }
interface Product { id: string; name: string; image: string; is_active: boolean; price: number; }

function toApiPayload(item: Partial<Collection>) {
  return {
    title: item.name ?? "",
    description: item.description ?? "",
    heroImage: item.image ?? "",
    isPublished: item.is_active ?? true,
    sortOrder: item.sort_order ?? 0,
  };
}

export default function AdminCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "edit">("list");
  const [editItem, setEditItem] = useState<Partial<Collection> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [collectionProducts, setCollectionProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState("name");

  const fetchCollections = async () => {
    const data = await safeGet<Collection[]>("/collections?all=true", []);
    setCollections(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const fetchCollectionProducts = async (id: string) => {
    const data = await safeGet<Product[]>(`/collections/${id}/products`, []);
    setCollectionProducts(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    fetchCollections();
    safeGet<{ items?: Product[] } | Product[]>("/products?pageSize=100", []).then(raw => {
      const list = Array.isArray(raw) ? raw : ((raw as any).items ?? []);
      setAllProducts(list);
    });
  }, []);

  const handleSave = async () => {
    if (!editItem?.name) { toast({ title: "Name required" }); return; }
    const payload = toApiPayload(editItem);
    if (editItem.id) {
      await safePatch(`/collections/${editItem.id}`, payload, null);
    } else {
      await safePost("/collections", payload, null);
    }
    fetchCollections();
    setView("list");
    setEditItem(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection?")) return;
    await fetch(`${getApiBase()}/api/collections/${id}`, { method: "DELETE", headers: authHeaders() });
    fetchCollections();
  };

  const openEdit = async (c: Collection) => { setEditItem(c); setView("edit"); await fetchCollectionProducts(c.id); };
  const openCreate = () => { setEditItem({ is_active: true, sort_order: collections.length }); setCollectionProducts([]); setView("edit"); };

  const addProducts = async () => {
    if (!editItem?.id && editItem?.name) {
      const data = await safePost<any>("/collections", toApiPayload(editItem), null);
      if (!data?.id) return;
      setEditItem(p => ({ ...p, id: data.id }));
      if (selectedIds.size > 0) await safePost(`/collections/${data.id}/products`, { product_ids: Array.from(selectedIds) }, null);
      await fetchCollectionProducts(data.id);
      fetchCollections();
    } else if (editItem?.id && selectedIds.size > 0) {
      const existing = new Set(collectionProducts.map(p => p.id));
      const newIds = Array.from(selectedIds).filter(id => !existing.has(id));
      if (newIds.length > 0) await safePost(`/collections/${editItem.id}/products`, { product_ids: newIds }, null);
      await fetchCollectionProducts(editItem.id!);
      fetchCollections();
    }
    setShowPicker(false); setSelectedIds(new Set()); setProductSearch("");
  };

  const removeProduct = async (pid: string) => {
    if (!editItem?.id) return;
    await safePost(`/collections/${editItem.id}/products/remove`, { product_id: pid }, null);
    setCollectionProducts(prev => prev.filter(p => p.id !== pid));
  };

  const pickerProducts = useMemo(() => {
    const existing = new Set(collectionProducts.map(p => p.id));
    return allProducts.filter(p => !existing.has(p.id) && p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [allProducts, collectionProducts, productSearch]);

  const sortedProducts = useMemo(() => {
    const s = [...collectionProducts];
    if (sortBy === "name") s.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "price") s.sort((a, b) => b.price - a.price);
    return s;
  }, [collectionProducts, sortBy]);

  const filtered = useMemo(() => {
    if (!search.trim()) return collections;
    const q = search.toLowerCase();
    return collections.filter(c => c.name.toLowerCase().includes(q));
  }, [collections, search]);

  const groups = useMemo(() => {
    const map: Record<string, Collection[]> = {};
    filtered.forEach(c => {
      const g = c.description?.trim() || "Other";
      (map[g] = map[g] || []).push(c);
    });
    return map;
  }, [filtered]);

  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(groups);
    return [...GROUP_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !GROUP_ORDER.includes(k))];
  }, [groups]);

  const activeCount = collections.filter(c => c.is_active).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (view === "edit" && editItem) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => { setView("list"); setEditItem(null); }} className="p-1.5 rounded-lg hover:bg-muted">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            <h2 className="text-base font-display font-bold">{editItem.id ? "Edit Collection" : "New Collection"}</h2>
          </div>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave}><Save className="w-3.5 h-3.5" /> Save</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10"><p className="text-xs font-semibold">Details</p></div>
              <div className="p-4 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Name *</Label>
                  <Input value={editItem.name || ""} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm mt-1" placeholder="e.g. Family, Romantic, Birthday" autoFocus />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Group (organises the list view)</Label>
                  <Select value={editItem.description || ""} onValueChange={v => setEditItem(p => ({ ...p, description: v }))}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Pick a group…" /></SelectTrigger>
                    <SelectContent>
                      {GROUP_ORDER.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10 flex items-center justify-between">
                <p className="text-xs font-semibold">Products</p>
                <div className="flex items-center gap-2">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-7 text-[10px] w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">A–Z</SelectItem>
                      <SelectItem value="price">Price</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1">{collectionProducts.length}</Badge>
                </div>
              </div>
              <div className="p-3">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Search to add products…" value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); if (!showPicker) setShowPicker(true); }}
                    onFocus={() => setShowPicker(true)} className="pl-8 h-8 text-xs" />
                </div>
                {showPicker && (
                  <div className="border border-border/40 rounded-lg mb-3 overflow-hidden">
                    <div className="max-h-52 overflow-y-auto divide-y divide-border/30">
                      {pickerProducts.length === 0
                        ? <p className="text-xs text-muted-foreground text-center py-6">No products found</p>
                        : pickerProducts.map(p => (
                          <label key={p.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors text-xs ${selectedIds.has(p.id) ? "bg-primary/5" : "hover:bg-accent/50"}`}>
                            <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={checked => setSelectedIds(prev => { const n = new Set(prev); if (checked) n.add(p.id); else n.delete(p.id); return n; })} />
                            {p.image ? <img src={p.image} className="w-7 h-7 rounded-md object-cover border border-border/30 shrink-0" alt="" /> : <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0"><ImageIcon className="w-3 h-3 text-muted-foreground/40" /></div>}
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-muted-foreground shrink-0">₹{p.price}</span>
                          </label>
                        ))}
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/10">
                      <span className="text-[10px] text-muted-foreground">{selectedIds.size} selected</span>
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setShowPicker(false); setSelectedIds(new Set()); }}>Cancel</Button>
                        <Button size="sm" className="h-6 text-[10px] px-2" disabled={selectedIds.size === 0} onClick={addProducts}>Add</Button>
                      </div>
                    </div>
                  </div>
                )}
                {sortedProducts.length === 0 ? (
                  <div className="py-8 text-center">
                    <FolderOpen className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No products yet. Search above to add.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30 border border-border/40 rounded-lg">
                    {sortedProducts.map(p => (
                      <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 group hover:bg-accent/30 transition-colors">
                        {p.image ? <img src={p.image} className="w-8 h-8 rounded-md object-cover border border-border/30 shrink-0" alt="" /> : <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0"><ImageIcon className="w-3.5 h-3.5 text-muted-foreground/30" /></div>}
                        <span className="text-xs font-medium flex-1 truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">₹{p.price}</span>
                        <button onClick={() => removeProduct(p.id)} className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10"><p className="text-xs font-semibold">Image</p></div>
              <div className="p-4 space-y-2">
                {editItem.image ? <img src={editItem.image} alt="" className="w-full aspect-video object-cover rounded-lg border border-border/30" /> : <div className="w-full aspect-video bg-muted/40 rounded-lg flex items-center justify-center"><ImageIcon className="w-8 h-8 text-muted-foreground/20" /></div>}
                <div className="flex gap-1.5">
                  <Input value={editItem.image || ""} onChange={e => setEditItem(p => ({ ...p, image: e.target.value }))} placeholder="Image URL" className="h-8 text-xs flex-1" />
                  <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="sm" variant="outline" className="h-8 px-2.5 shrink-0">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { e.target.value = ""; }} />
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10"><p className="text-xs font-semibold">Settings</p></div>
              <div className="p-4">
                <label className="flex items-center justify-between">
                  <span className="text-xs">{editItem.is_active ? "Active" : "Draft"}</span>
                  <Switch checked={editItem.is_active ?? true} onCheckedChange={v => setEditItem(p => ({ ...p, is_active: v }))} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Collections</h1>
            <p className="text-xs text-muted-foreground">{activeCount} active · {collections.length} total · {sortedGroupKeys.length} groups</p>
          </div>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}><Plus className="w-3.5 h-3.5" /> Create</Button>
      </div>

      {collections.length > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search collections…" className="pl-8 h-8 text-xs pr-8" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>
      )}

      {collections.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-0.5">No collections yet</p>
          <p className="text-xs text-muted-foreground mb-4">Group products into curated collections</p>
          <Button size="sm" className="text-xs gap-1.5" onClick={openCreate}><Plus className="w-3.5 h-3.5" /> Create First</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-12 text-center">
          <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No collections match &quot;{search}&quot;</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroupKeys.map(groupName => (
            <div key={groupName}>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">{groupName}</p>
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{groups[groupName].length}</span>
              </div>
              <div className="space-y-1.5 pl-1">
                {groups[groupName].map(c => (
                  <div key={c.id} onClick={() => openEdit(c)}
                    className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3 transition-all cursor-pointer group hover:shadow-sm hover:border-border/60">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab" />
                    {c.image
                      ? <img src={c.image} alt={c.name} className="w-10 h-10 rounded-lg object-cover border border-border/30 shrink-0" />
                      : <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.is_active ? "bg-emerald-500/10" : "bg-muted/60"}`}>
                          {c.is_active ? <Globe className="w-4 h-4 text-emerald-600" /> : <FileEdit className="w-4 h-4 text-muted-foreground/40" />}
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <Badge variant={c.is_active ? "default" : "secondary"}
                          className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${c.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}`}>
                          {c.is_active ? "Active" : "Draft"}
                        </Badge>
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
TSEOF
echo "✅ collections/page.tsx written"

echo "→ Writing customizer/page.tsx …"
cat > apps/web/app/b2b/super-admin/customizer/page.tsx << 'TSEOF'
"use client";

/**
 * Admin Customizer — configure how customers personalise each product.
 *
 * Saves to  product.metadata.customizer  (via PATCH /products/admin/:id)
 * which the B2C /customize/[slug] page reads at runtime.
 *
 * Modes
 *   photo  – customer uploads 1-5 photos
 *   text   – customer types 1-3 text fields
 *   both   – photo upload(s) + text field(s)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Save, X, Camera, Type, Layers,
  Package, Search, ChevronRight, CheckCircle2,
  AlertCircle, Plus, Minus,
} from "lucide-react";
import {
  Button, Input, Label, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@gifteeng/ui";

// ── API helpers ──────────────────────────────────────────────────────────────

function getApiBase() {
  return typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");
}
function authHdr(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("gifteeng.b2b.token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHdr(), ...(init?.headers ?? {}) },
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) { console.error("API error", r.status, data); return null; }
    return data as T;
  } catch (e) { console.error("Fetch failed", e); return null; }
}

// ── Types ────────────────────────────────────────────────────────────────────

type CMode = "photo" | "text" | "both";

interface TextZone { label: string; placeholder: string; maxLen: number; }

interface CustomizerConfig {
  mode: CMode;
  photoCount: number;
  photoLabel: string;
  textZones: TextZone[];
  mockupImage: string;
  previewNote: string;
}

const DEFAULT_CONFIG: CustomizerConfig = {
  mode: "both",
  photoCount: 1,
  photoLabel: "Upload Your Photo",
  textZones: [
    { label: "Name / Message", placeholder: "e.g. Happy Birthday Raj!", maxLen: 60 },
  ],
  mockupImage: "",
  previewNote: "",
};

interface Product {
  id: string;
  title: string;
  isCustomizable: boolean;
  images?: { url: string }[];
  imageUrl?: string;
  metadata?: { customizer?: CustomizerConfig };
}

// ── Mode meta ────────────────────────────────────────────────────────────────

const MODES: { id: CMode; icon: React.ReactNode; label: string; desc: string }[] = [
  { id: "photo", icon: <Camera className="w-5 h-5" />, label: "Photo Upload", desc: "Customer uploads a photo printed on the product" },
  { id: "text",  icon: <Type className="w-5 h-5" />,   label: "Text / Name",  desc: "Customer types their name or a personalised message" },
  { id: "both",  icon: <Layers className="w-5 h-5" />, label: "Photo + Text", desc: "Upload a photo AND add personalised text" },
];

const MODE_COLORS: Record<CMode, string> = {
  photo: "text-blue-600 bg-blue-500/10 border-blue-500/30",
  text:  "text-amber-600 bg-amber-500/10 border-amber-500/30",
  both:  "text-violet-600 bg-violet-500/10 border-violet-500/30",
};
const MODE_BADGE: Record<CMode, string> = {
  photo: "📷 Photo",
  text:  "✏️ Text",
  both:  "🎨 Photo + Text",
};

// ── Counter ──────────────────────────────────────────────────────────────────

function Counter({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
        className="w-7 h-7 rounded-lg border border-border/40 flex items-center justify-center hover:bg-muted disabled:opacity-30">
        <Minus className="w-3 h-3" />
      </button>
      <span className="w-6 text-center text-sm font-semibold">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
        className="w-7 h-7 rounded-lg border border-border/40 flex items-center justify-center hover:bg-muted disabled:opacity-30">
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Live customer preview ─────────────────────────────────────────────────────

function CustomerPreview({ config, productImage }: { config: CustomizerConfig; productImage: string }) {
  const showPhoto = config.mode === "photo" || config.mode === "both";
  const showText  = config.mode === "text"  || config.mode === "both";
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden bg-card">
      <div className="px-3 py-2 bg-muted/10 border-b border-border/30 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Customer sees</span>
        <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">preview</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="relative w-full aspect-square max-w-[180px] mx-auto rounded-xl bg-muted/30 border border-border/30 overflow-hidden flex items-center justify-center">
          {productImage ? <img src={productImage} alt="Product" className="w-full h-full object-cover" /> : <Package className="w-10 h-10 text-muted-foreground/20" />}
          {showPhoto && (
            <div className="absolute inset-[15%] border-2 border-dashed border-blue-500/60 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <div className="text-center">
                <Camera className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-[9px] text-blue-700 font-medium">{config.photoLabel}</p>
              </div>
            </div>
          )}
        </div>
        {showPhoto && (
          <div className="space-y-1.5">
            {Array.from({ length: config.photoCount }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 dark:bg-blue-950/20">
                <Camera className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="text-xs text-blue-700 dark:text-blue-300">{i === 0 ? config.photoLabel : `Upload Photo ${i + 1}`}</span>
              </div>
            ))}
          </div>
        )}
        {showText && config.textZones.slice(0, 3).map((zone, i) => (
          <div key={i} className="space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium">{zone.label}</p>
            <div className="px-3 py-2 rounded-lg border border-border/40 bg-background text-xs text-muted-foreground/60 italic">{zone.placeholder}</div>
          </div>
        ))}
        {config.previewNote && <p className="text-[10px] text-muted-foreground italic">{config.previewNote}</p>}
      </div>
    </div>
  );
}

// ── Configure dialog ─────────────────────────────────────────────────────────

function ConfigureDialog({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const existing = product.metadata?.customizer;
  const [cfg, setCfg] = useState<CustomizerConfig>(existing ? { ...DEFAULT_CONFIG, ...existing } : { ...DEFAULT_CONFIG });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");

  const productImage = cfg.mockupImage || product.images?.[0]?.url || product.imageUrl || "";

  const set = useCallback(<K extends keyof CustomizerConfig>(k: K, v: CustomizerConfig[K]) => {
    setCfg(p => ({ ...p, [k]: v }));
    setStatus("idle");
  }, []);

  const updateTextZone = (i: number, patch: Partial<TextZone>) => {
    setCfg(p => { const zones = [...p.textZones]; zones[i] = { ...zones[i], ...patch }; return { ...p, textZones: zones }; });
    setStatus("idle");
  };

  const setTextCount = (n: number) => {
    setCfg(p => {
      const zones = [...p.textZones];
      while (zones.length < n) zones.push({ label: `Text ${zones.length + 1}`, placeholder: "Enter your text…", maxLen: 60 });
      return { ...p, textZones: zones.slice(0, n) };
    });
    setStatus("idle");
  };

  const handleSave = async () => {
    setSaving(true); setStatus("idle");
    const payload = { isCustomizable: true, metadata: { ...(product.metadata ?? {}), customizer: cfg } };
    const res = await apiFetch(`/products/admin/${product.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    setSaving(false);
    if (res !== null) { setStatus("ok"); setTimeout(() => { onSaved(); onClose(); }, 800); }
    else setStatus("err");
  };

  const showPhoto = cfg.mode === "photo" || cfg.mode === "both";
  const showText  = cfg.mode === "text"  || cfg.mode === "both";

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
      <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30">
        <div className="flex items-start justify-between">
          <div>
            <DialogTitle className="text-sm font-bold">{product.title}</DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Customisation setup</p>
          </div>
          <div className="flex items-center gap-2">
            {status === "ok" && <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Saved!</span>}
            {status === "err" && <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="w-3.5 h-3.5" /> Save failed</span>}
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </Button>
          </div>
        </div>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
        <div className="md:col-span-3 p-5 space-y-5 border-r border-border/20">

          {/* Mode */}
          <div>
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 block">Customisation Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => {
                const active = cfg.mode === m.id;
                return (
                  <button key={m.id} onClick={() => set("mode", m.id)}
                    className={`text-left p-2.5 rounded-xl border-2 transition-all ${active ? "border-primary bg-primary/5" : "border-border/40 hover:border-border/80 bg-card"}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-1.5 ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{m.icon}</div>
                    <p className={`text-xs font-semibold ${active ? "text-primary" : "text-foreground"}`}>{m.label}</p>
                    <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photo */}
          {showPhoto && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1"><Camera className="w-4 h-4 text-blue-600" /><p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Photo Upload</p></div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Number of photos</p>
                  <p className="text-[10px] text-muted-foreground">How many photos can the customer upload?</p>
                </div>
                <Counter value={cfg.photoCount} min={1} max={5} onChange={n => set("photoCount", n)} />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Upload button label</Label>
                <Input value={cfg.photoLabel} onChange={e => set("photoLabel", e.target.value)} placeholder="Upload Your Photo" className="h-8 text-xs mt-1" />
              </div>
            </div>
          )}

          {/* Text */}
          {showText && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1"><Type className="w-4 h-4 text-amber-600" /><p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Text Input</p></div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Number of text fields</p>
                  <p className="text-[10px] text-muted-foreground">e.g. Name on Line 1, Message on Line 2</p>
                </div>
                <Counter value={cfg.textZones.length} min={1} max={3} onChange={setTextCount} />
              </div>
              <div className="space-y-2">
                {cfg.textZones.map((zone, i) => (
                  <div key={i} className="bg-background rounded-lg border border-border/40 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Field {i + 1}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Label</Label>
                        <Input value={zone.label} onChange={e => updateTextZone(i, { label: e.target.value })} placeholder={`e.g. ${i === 0 ? "Your Name" : "Your Message"}`} className="h-7 text-xs mt-0.5" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Max characters</Label>
                        <Input type="number" value={zone.maxLen} onChange={e => updateTextZone(i, { maxLen: Math.max(10, Math.min(200, Number(e.target.value) || 60)) })} className="h-7 text-xs mt-0.5" min={10} max={200} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Placeholder hint</Label>
                      <Input value={zone.placeholder} onChange={e => updateTextZone(i, { placeholder: e.target.value })} placeholder="e.g. Happy Birthday Priya!" className="h-7 text-xs mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mockup */}
          <div>
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 block">Mockup / Preview Image <span className="normal-case font-normal">(optional)</span></Label>
            <p className="text-[10px] text-muted-foreground mb-2">Override the product image in the customiser (e.g. a flat-lay or blank template).</p>
            <Input value={cfg.mockupImage} onChange={e => set("mockupImage", e.target.value)} placeholder="https://… paste image URL" className="h-8 text-xs" />
          </div>

          {/* Note */}
          <div>
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 block">Customer note <span className="normal-case font-normal">(optional)</span></Label>
            <Input value={cfg.previewNote} onChange={e => set("previewNote", e.target.value)} placeholder="e.g. Photo will be printed in full colour, leave 5mm bleed." className="h-8 text-xs" />
          </div>
        </div>

        {/* Preview */}
        <div className="md:col-span-2 p-4 bg-muted/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Live Preview</p>
          <CustomerPreview config={cfg} productImage={productImage} />
          <div className="mt-3 p-3 rounded-xl border border-border/30 bg-card space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">What gets saved</p>
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${MODE_COLORS[cfg.mode]}`}>
                {cfg.mode === "photo" ? "📷" : cfg.mode === "text" ? "✏️" : "🎨"}
              </div>
              <span className="text-xs">{MODE_BADGE[cfg.mode]}</span>
            </div>
            {showPhoto && <p className="text-[10px] text-muted-foreground">{cfg.photoCount} photo upload{cfg.photoCount > 1 ? "s" : ""}</p>}
            {showText && <p className="text-[10px] text-muted-foreground">{cfg.textZones.length} text field{cfg.textZones.length > 1 ? "s" : ""} · max {cfg.textZones[0]?.maxLen} chars</p>}
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminCustomizer() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch<{ items?: any[] } | any[]>("/products?pageSize=100");
    const raw: any[] = data ? (Array.isArray(data) ? data : ((data as any).items ?? [])) : [];
    const list: Product[] = raw
      .filter((p: any) => p.isCustomizable || p.metadata?.customizer)
      .map((p: any) => ({
        id: p.id,
        title: p.title ?? p.name ?? "",
        isCustomizable: p.isCustomizable ?? false,
        images: p.images,
        imageUrl: p.imageUrl,
        metadata: p.metadata ?? {},
      }));
    setProducts(list);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filtered = products.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
  const getMode = (p: Product): CMode | null => p.metadata?.customizer?.mode ?? null;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Customiser Setup</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Configure how customers personalise each product</p>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">{products.length} customisable</Badge>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary/80 leading-relaxed">
        <strong>How it works:</strong> Select a product → choose Photo, Text, or Both → configure labels → Save.
        Customers see this setup when they click <em>Customise</em> on the product page.
      </div>

      {products.length > 4 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" className="pl-8 h-8 text-xs" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card py-16 text-center">
          <Package className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">{search ? "No products match" : "No customisable products"}</p>
          <p className="text-xs text-muted-foreground">
            {search ? "Try a different search term" : "Go to Products → edit a product → tick Customisable"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(p => {
            const mode = getMode(p);
            const img = p.metadata?.customizer?.mockupImage || p.images?.[0]?.url || p.imageUrl || "";
            return (
              <button key={p.id} onClick={() => setSelected(p)}
                className="group bg-card rounded-xl border border-border/40 overflow-hidden text-left hover:border-primary/40 hover:shadow-sm transition-all">
                <div className="aspect-square bg-muted/30 relative overflow-hidden">
                  {img ? <img src={img} alt={p.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-muted-foreground/20" /></div>}
                  {mode && <div className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${MODE_COLORS[mode]}`}>{MODE_BADGE[mode]}</div>}
                  <div className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-semibold flex items-center gap-1">Configure <ChevronRight className="w-3.5 h-3.5" /></span>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{mode ? "Configured ✓" : "Not set up yet"}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        {selected && (
          <ConfigureDialog product={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); fetchProducts(); }} />
        )}
      </Dialog>
    </div>
  );
}
TSEOF
echo "✅ customizer/page.tsx written"

echo ""
echo "→ Building web app (takes ~2 min)…"
pnpm --filter=@gifteeng/web build 2>&1 | tail -15

echo ""
echo "→ Restarting web service…"
systemctl restart gifteeng-web
echo ""
echo "🎉 Done!"
echo "   Collections: http://217.216.59.87:8080/super-admin/collections"
echo "   Customizer:  http://217.216.59.87:8080/super-admin/customizer"

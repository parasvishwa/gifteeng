"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Plus, Trash2, Save, X, Upload, Loader2, FolderOpen, Search, Image as ImageIcon, Globe, FileEdit, GripVertical } from "lucide-react";
import { Button, Input, Label, Switch, Badge, Checkbox, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gifteeng/ui";
import { toast } from "@gifteeng/ui";
import { authHeaders, getApiBase, safeGet, safePatch, safePost } from "@/lib/admin-api";

// Browser-aware: in the browser use window.location.origin so API calls
// route through the nginx proxy instead of hitting localhost:4000 directly.

/** Order groups match the design mockup */
const GROUP_ORDER = ["By Relation", "By Occasion", "By Theme", "By Profession", "By Use Case", "Other"];

interface Collection { id: string; name: string; description: string; image: string; is_active: boolean; sort_order: number; created_at: string; product_count?: number; }
interface Product { id: string; name: string; image: string; is_active: boolean; price: number; }

/** Convert frontend Collection shape → API body (camelCase, as the NestJS controller expects) */
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
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
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
    // pass ?all=true so admin sees drafts too
    const data = await safeGet<Collection[]>("/collections?all=true", []);
    setCollections(Array.isArray(data) ? data : []);
    setProductCounts({});
    setLoading(false);
  };

  const fetchCollectionProducts = async (id: string) => {
    const data = await safeGet<Product[]>(`/collections/${id}/products`, []);
    setCollectionProducts(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    fetchCollections();
    safeGet<{ items?: any[] } | any[]>("/products?pageSize=200", []).then(raw => {
      const items: any[] = Array.isArray(raw) ? raw : ((raw as any).items ?? []);
      const list: Product[] = items.map((p: any) => ({
        id: p.id ?? "",
        name: (p.name ?? p.title ?? "").toString(),
        image: p.imageUrl ?? p.images?.[0]?.url ?? p.image ?? "",
        is_active: p.isActive ?? p.is_active ?? true,
        price: Number(p.price ?? p.basePrice ?? 0),
      }));
      setAllProducts(list);
    });
  }, []);

  const handleImageUpload = async (_file: File) => {
    setUploading(true);
    toast({ title: "Upload not yet wired up" });
    setUploading(false);
  };

  const handleSave = async () => {
    if (!editItem?.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    const payload = toApiPayload(editItem);
    if (editItem.id) {
      await safePatch(`/collections/${editItem.id}`, payload, null);
    } else {
      await safePost("/collections", payload, null);
    }
    toast({ title: "Saved!" });
    fetchCollections();
    setView("list");
    setEditItem(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection?")) return;
    await fetch(`${getApiBase()}/api/collections/${id}`, { method: "DELETE", headers: authHeaders() });
    toast({ title: "Deleted" });
    fetchCollections();
  };

  const openEdit = async (c: Collection) => {
    setEditItem(c);
    setView("edit");
    await fetchCollectionProducts(c.id);
  };
  const openCreate = () => {
    setEditItem({ is_active: true, sort_order: collections.length });
    setCollectionProducts([]);
    setView("edit");
  };

  const addProducts = async () => {
    if (!editItem?.id && editItem?.name) {
      const data = await safePost<any>("/collections", toApiPayload(editItem), null);
      if (!data?.id) { toast({ title: "Save first", variant: "destructive" }); return; }
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
    setShowPicker(false);
    setSelectedIds(new Set());
    setProductSearch("");
  };

  const removeProduct = async (pid: string) => {
    if (!editItem?.id) return;
    await safePost(`/collections/${editItem.id}/products/remove`, { product_id: pid }, null);
    setCollectionProducts(prev => prev.filter(p => p.id !== pid));
    fetchCollections();
  };

  const pickerProducts = useMemo(() => {
    const existing = new Set(collectionProducts.map(p => p.id));
    const q = productSearch.toLowerCase();
    return allProducts.filter(p => !existing.has(p.id) && (p.name || "").toLowerCase().includes(q));
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

  /** Group collections by their description field (used as group label) */
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
    return [
      ...GROUP_ORDER.filter(k => keys.includes(k)),
      ...keys.filter(k => !GROUP_ORDER.includes(k)),
    ];
  }, [groups]);

  const activeCount = collections.filter(c => c.is_active).length;

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  // ── EDIT VIEW ──────────────────────────────────────────────────────────────
  if (view === "edit" && editItem) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setView("list"); setEditItem(null); }}
              className="p-1.5 rounded-lg hover:bg-muted"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            <h2 className="text-base font-display font-bold">
              {editItem.id ? "Edit Collection" : "New Collection"}
            </h2>
          </div>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave}>
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Details + Products */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10">
                <p className="text-xs font-semibold">Details</p>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Name *</Label>
                  <Input
                    value={editItem.name || ""}
                    onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
                    className="h-9 text-sm mt-1"
                    placeholder="e.g. Family, Romantic, Birthday"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">
                    Group (used to organise in the list)
                  </Label>
                  <Select
                    value={editItem.description || ""}
                    onValueChange={v => setEditItem(p => ({ ...p, description: v }))}
                  >
                    <SelectTrigger className="h-9 text-sm mt-1">
                      <SelectValue placeholder="Pick a group…" />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUP_ORDER.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Products */}
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10 flex items-center justify-between">
                <p className="text-xs font-semibold">Products</p>
                <div className="flex items-center gap-2">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-7 text-[10px] w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">A–Z</SelectItem>
                      <SelectItem value="price">Price</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                    {collectionProducts.length}
                  </Badge>
                </div>
              </div>

              <div className="p-3">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search to add products…"
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); if (!showPicker) setShowPicker(true); }}
                    onFocus={() => setShowPicker(true)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>

                {showPicker && (
                  <div className="border border-border/40 rounded-lg mb-3 overflow-hidden">
                    <div className="max-h-52 overflow-y-auto divide-y divide-border/30">
                      {pickerProducts.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">No products found</p>
                      ) : pickerProducts.map(p => (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors text-xs ${
                            selectedIds.has(p.id) ? "bg-primary/5" : "hover:bg-accent/50"
                          }`}
                        >
                          <Checkbox
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={checked =>
                              setSelectedIds(prev => {
                                const n = new Set(prev);
                                if (checked) n.add(p.id); else n.delete(p.id);
                                return n;
                              })
                            }
                          />
                          {p.image
                            ? <img src={p.image} className="w-7 h-7 rounded-md object-cover border border-border/30 shrink-0" alt="" />
                            : <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0"><ImageIcon className="w-3 h-3 text-muted-foreground/40" /></div>
                          }
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="text-muted-foreground shrink-0">₹{p.price}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/10">
                      <span className="text-[10px] text-muted-foreground">{selectedIds.size} selected</span>
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                          onClick={() => { setShowPicker(false); setSelectedIds(new Set()); }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm" className="h-6 text-[10px] px-2"
                          disabled={selectedIds.size === 0}
                          onClick={addProducts}
                        >
                          Add
                        </Button>
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
                        {p.image
                          ? <img src={p.image} className="w-8 h-8 rounded-md object-cover border border-border/30 shrink-0" alt="" />
                          : <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0"><ImageIcon className="w-3.5 h-3.5 text-muted-foreground/30" /></div>
                        }
                        <span className="text-xs font-medium flex-1 truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">₹{p.price}</span>
                        <button
                          onClick={() => removeProduct(p.id)}
                          className="p-1 rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10">
                <p className="text-xs font-semibold">Image</p>
              </div>
              <div className="p-4 space-y-2">
                {editItem.image ? (
                  <img src={editItem.image} alt="" className="w-full aspect-video object-cover rounded-lg border border-border/30" />
                ) : (
                  <div className="w-full aspect-video bg-muted/40 rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/20" />
                  </div>
                )}
                <div className="flex gap-1.5">
                  <Input
                    value={editItem.image || ""}
                    onChange={e => setEditItem(p => ({ ...p, image: e.target.value }))}
                    placeholder="Image URL"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    size="sm" variant="outline" className="h-8 px-2.5 shrink-0"
                  >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <input
                  ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); e.target.value = ""; }}
                />
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10">
                <p className="text-xs font-semibold">Settings</p>
              </div>
              <div className="p-4">
                <label className="flex items-center justify-between">
                  <span className="text-xs">{editItem.is_active ? "Active" : "Draft"}</span>
                  <Switch
                    checked={editItem.is_active ?? true}
                    onCheckedChange={v => setEditItem(p => ({ ...p, is_active: v }))}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FolderOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Collections</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount} active · {collections.length} total · {sortedGroupKeys.length} groups
            </p>
          </div>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" /> Create
        </Button>
      </div>

      {/* Search */}
      {collections.length > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search collections…"
            className="pl-8 h-8 text-xs pr-8"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {collections.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-0.5">No collections yet</p>
          <p className="text-xs text-muted-foreground mb-4">Group products into curated collections</p>
          <Button size="sm" className="text-xs gap-1.5" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" /> Create First
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-12 text-center">
          <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No collections match &quot;{search}&quot;</p>
        </div>
      ) : (
        /* Grouped list */
        <div className="space-y-6">
          {sortedGroupKeys.map(groupName => {
            const groupItems = groups[groupName];
            return (
              <div key={groupName}>
                {/* Group header */}
                <div className="flex items-center gap-3 mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    {groupName}
                  </p>
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {groupItems.length}
                  </span>
                </div>

                {/* Collection cards in this group */}
                <div className="space-y-1.5 pl-1">
                  {groupItems.map(c => (
                    <div
                      key={c.id}
                      onClick={() => openEdit(c)}
                      className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3 transition-all cursor-pointer group hover:shadow-sm hover:border-border/60"
                    >
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab" />
                      {c.image ? (
                        <img src={c.image} alt={c.name} className="w-10 h-10 rounded-lg object-cover border border-border/30 shrink-0" />
                      ) : (
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.is_active ? "bg-emerald-500/10" : "bg-muted/60"}`}>
                          {c.is_active
                            ? <Globe className="w-4 h-4 text-emerald-600" />
                            : <FileEdit className="w-4 h-4 text-muted-foreground/40" />
                          }
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <Badge
                            variant={c.is_active ? "default" : "secondary"}
                            className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${c.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}`}
                          >
                            {c.is_active ? "Active" : "Draft"}
                          </Badge>
                          <span className={`text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded-full ${
                            (c.product_count ?? 0) > 0
                              ? "bg-pink-500/10 text-pink-600"
                              : "bg-muted text-muted-foreground/60"
                          }`}>
                            {c.product_count ?? 0} product{(c.product_count ?? 0) === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
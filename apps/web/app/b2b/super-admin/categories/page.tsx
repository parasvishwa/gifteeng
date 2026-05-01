"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Save, FolderTree, ChevronRight, Loader2,
  Eye, EyeOff, Search, X, GripVertical, ImageIcon, Upload
} from "lucide-react";
import {
  toast,
  Button, Input, Label, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import { getApiBase, safeGet, safePatch, safePost } from "@/lib/admin-api";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface Category {
  id: string;
  name: string;
  image: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  product_count?: number; // live count from API (products that use this category)
}

// Minimal drag reorder hook stub
function useDragReorder<T extends { id: string }>({ items, onReorder }: { items: T[]; onReorder: (next: T[]) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const getDragProps = (idx: number) => ({
    draggable: true,
    onDragStart: () => setDragIdx(idx),
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOverIdx(idx); },
    onDragEnd: () => {
      if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
        const next = [...items];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(overIdx, 0, moved);
        onReorder(next);
      }
      setDragIdx(null); setOverIdx(null);
    },
  });
  return { dragIdx, overIdx, getDragProps };
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Partial<Category> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/api/files/upload`, { method: "POST", headers: authHeaders(), body: fd });
      const data = await res.json();
      const url = data?.url || data?.publicUrl || "";
      setEditItem(p => ({ ...p, image: url }));
      toast({ title: "Image uploaded!" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const fetchCategories = async () => {
    // The API returns camelCase (`isActive`, `parentId`, `sortOrder`) but
    // this UI was wired up against snake_case fields. Without this aliasing
    // every category renders as "hidden" because `cat.is_active` is
    // undefined → `!undefined === true` → strikethrough kicks in. Normalise
    // here so the rest of the page stays unchanged.
    type ApiCat = Category & {
      isActive?: boolean; parentId?: string | null; sortOrder?: number;
    };
    const data = await safeGet<{ items?: ApiCat[] } | ApiCat[]>("/categories?pageSize=500", { items: [] });
    const raw  = Array.isArray(data) ? data : (data.items || []);
    const list: Category[] = raw.map((c: ApiCat) => ({
      ...c,
      is_active:  c.is_active  ?? c.isActive  ?? true,
      parent_id:  c.parent_id  ?? c.parentId  ?? null,
      sort_order: c.sort_order ?? c.sortOrder ?? 0,
    }));
    setCategories(list);
    setLoading(false);
  };

  useEffect(() => { fetchCategories(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const parents = useMemo(() => filtered.filter(c => !c.parent_id), [filtered]);
  const getChildren = (parentId: string) => filtered.filter(c => c.parent_id === parentId);
  const allParents = useMemo(() => categories.filter(c => !c.parent_id), [categories]);

  const handleReorderParents = useCallback(async (reordered: Category[]) => {
    const updated = reordered.map((c, i) => ({ ...c, sort_order: i }));
    setCategories(prev => {
      const childCats = prev.filter(c => c.parent_id);
      return [...updated, ...childCats];
    });
    await Promise.all(updated.map((c, i) => safePatch(`/categories/admin/${c.id}`, { sort_order: i }, null)));
  }, []);

  const { dragIdx: parentDragIdx, overIdx: parentOverIdx, getDragProps: getParentDragProps } = useDragReorder({
    items: parents,
    onReorder: handleReorderParents,
  });

  const handleSave = async () => {
    if (!editItem?.name?.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: editItem.name.trim(),
      image: editItem.image || '',
      parent_id: editItem.parent_id || null,
      sort_order: editItem.sort_order ?? 0,
      is_active: editItem.is_active ?? true,
    };
    if (editItem.id) {
      await safePatch(`/categories/admin/${editItem.id}`, payload, null);
      setCategories(prev => prev.map(c => c.id === editItem.id ? { ...c, ...payload } as Category : c));
      toast({ title: "Category updated" });
    } else {
      const data = await safePost<Category | null>("/categories/admin", payload, null);
      if (data) {
        setCategories(prev => [...prev, data].sort((a, b) => a.sort_order - b.sort_order));
      }
      toast({ title: "Category created" });
    }
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this category and its subcategories?")) return;
    await fetch(`${getApiBase()}/api/categories/admin/${id}`, { method: "DELETE", headers: authHeaders() });
    setCategories(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
    toast({ title: "Deleted" });
  };

  const toggleActive = async (c: Category) => {
    const updated = { ...c, is_active: !c.is_active };
    setCategories(prev => prev.map(x => x.id === c.id ? updated : x));
    await safePatch(`/categories/admin/${c.id}`, { is_active: updated.is_active }, null);
  };

  const openAdd = (parentId?: string) => {
    setEditItem({ is_active: true, sort_order: categories.length, parent_id: parentId || null });
    setDialogOpen(true);
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  const activeCount = categories.filter(c => c.is_active).length;
  const parentCount = categories.filter(c => !c.parent_id).length;
  const subCount = categories.filter(c => c.parent_id).length;

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FolderTree className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold tracking-tight">Categories</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {parentCount} parent · {subCount} sub · {activeCount} active
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => openAdd()}>
          <Plus className="w-3.5 h-3.5" /> Add Category
        </Button>
      </div>

      {/* Search */}
      {categories.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-8 pr-8"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-5">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-semibold">
              {editItem?.id ? "Edit Category" : "New Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Name *</Label>
              <Input
                value={editItem?.name || ""}
                onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))}
                className="h-9 text-sm"
                placeholder="e.g. Photo Frames"
                autoFocus
              />
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Image</Label>
              <div className="flex gap-1.5 mt-1">
                <Input
                  placeholder="https://... or upload →"
                  value={editItem?.image || ""}
                  onChange={e => setEditItem(p => ({ ...p, image: e.target.value }))}
                  className="h-9 text-sm flex-1"
                />
                <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="sm" variant="outline" className="h-9 px-2.5 shrink-0">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); e.target.value = ""; }} />
            </div>
            {editItem?.image && (
              <img src={editItem.image} alt="Preview" className="w-full h-24 object-cover rounded-lg border border-border/40" />
            )}

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Parent Category</Label>
              <Select
                value={editItem?.parent_id || "_none"}
                onValueChange={v => setEditItem(p => ({ ...p, parent_id: v === "_none" ? null : v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None (top-level)</SelectItem>
                  {allParents.filter(p => p.id !== editItem?.id).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 h-9">
              <Switch
                checked={editItem?.is_active ?? true}
                onCheckedChange={v => setEditItem(p => ({ ...p, is_active: v }))}
              />
              <span className="text-xs text-muted-foreground">
                {editItem?.is_active ? "Active" : "Hidden"}
              </span>
            </div>

            <Button onClick={handleSave} size="sm" className="w-full h-9 text-xs gap-1.5 mt-1">
              <Save className="w-3.5 h-3.5" /> {editItem?.id ? "Update" : "Create"} Category
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Empty state */}
      {categories.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <FolderTree className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm font-medium mb-1">No categories yet</p>
          <p className="text-xs text-muted-foreground mb-4">Organize your products into categories</p>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => openAdd()}>
            <Plus className="w-3.5 h-3.5" /> Create first category
          </Button>
        </div>
      ) : parents.length === 0 && search ? (
        <div className="bg-card rounded-xl border border-border/40 py-12 text-center">
          <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No categories match &quot;{search}&quot;</p>
        </div>
      ) : (
        <div className="space-y-2">
          {parents.map((cat, idx) => {
            const children = getChildren(cat.id);
            const isDragging = parentDragIdx === idx;
            const isOver = parentOverIdx === idx;
            return (
              <div
                key={cat.id}
                {...getParentDragProps(idx)}
                className={`bg-card rounded-xl border overflow-hidden transition-all ${
                  isDragging ? "opacity-50 scale-[0.98] border-primary/40" :
                  isOver ? "border-primary/60 shadow-md" :
                  "border-border/40 hover:shadow-sm"
                }`}
              >
                {/* Parent row */}
                <div className="flex items-center gap-3 p-3">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border/20" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${!cat.is_active ? "text-muted-foreground line-through" : ""}`}>
                        {cat.name}
                      </p>
                      {!cat.is_active && (
                        <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">hidden</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <span>
                        {children.length > 0 ? `${children.length} subcategories` : "No subcategories"}
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span className={`inline-flex items-center gap-1 font-semibold ${
                        (cat.product_count ?? 0) > 0 ? "text-pink-600" : "text-muted-foreground/60"
                      }`}>
                        {cat.product_count ?? 0} product{(cat.product_count ?? 0) === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openAdd(cat.id)}
                      className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-primary/60 hover:text-primary"
                      title="Add subcategory"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleActive(cat)}
                      className={`p-1.5 rounded-lg transition-colors ${cat.is_active ? "text-green-600 hover:bg-green-500/10" : "text-muted-foreground hover:bg-muted"}`}
                      title={cat.is_active ? "Hide" : "Show"}
                    >
                      {cat.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => { setEditItem(cat); setDialogOpen(true); }}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Children */}
                {children.length > 0 && (
                  <div className="border-t border-border/30 bg-muted/5">
                    {children.map((sub, i) => (
                      <div
                        key={sub.id}
                        className={`flex items-center gap-2.5 px-3 py-2.5 ml-6 ${i < children.length - 1 ? "border-b border-border/10" : ""}`}
                      >
                        <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                        {sub.image ? (
                          <img src={sub.image} alt={sub.name} className="w-7 h-7 rounded object-cover shrink-0 border border-border/20" />
                        ) : (
                          <div className="w-7 h-7 rounded bg-muted/40 flex items-center justify-center shrink-0">
                            <ImageIcon className="w-3 h-3 text-muted-foreground/30" />
                          </div>
                        )}
                        <span className={`text-xs flex-1 truncate ${!sub.is_active ? "text-muted-foreground line-through" : ""}`}>
                          {sub.name}
                        </span>
                        <span className={`text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded-full ${
                          (sub.product_count ?? 0) > 0
                            ? "bg-pink-500/10 text-pink-600"
                            : "bg-muted text-muted-foreground/60"
                        }`}>
                          {sub.product_count ?? 0}
                        </span>
                        {!sub.is_active && (
                          <span className="text-[8px] text-muted-foreground bg-muted px-1 py-0.5 rounded-full">hidden</span>
                        )}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => toggleActive(sub)}
                            className={`p-1 rounded transition-colors ${sub.is_active ? "text-green-600" : "text-muted-foreground/40"}`}
                          >
                            {sub.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => { setEditItem(sub); setDialogOpen(true); }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(sub.id)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
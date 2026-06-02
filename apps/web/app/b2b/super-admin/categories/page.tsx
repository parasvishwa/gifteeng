"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Pencil, Trash2, Save, FolderTree, ChevronRight, Loader2,
  Eye, EyeOff, Search, X, GripVertical, ImageIcon, Upload, ChevronDown,
  ChevronUp, ChevronsUp, ChevronsDown, Package,
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

// Lightweight product representation for the category drill-in panel.
interface CategoryProduct {
  id: string;
  slug: string;
  title: string;
  image: string;
  basePrice: number;
  b2cEnabled: boolean;
}

export default function AdminCategories() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Partial<Category> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Drill-in state ──────────────────────────────────────────────────────
  // `expandedId` is the category whose product list is currently visible.
  // `productCache` keys by category name (lowercased, the DB uses category
  // name strings rather than FK ids) so re-opening an expanded panel
  // doesn't re-fetch.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [productCache, setProductCache] = useState<Record<string, CategoryProduct[]>>({});
  const [productsLoadingFor, setProductsLoadingFor] = useState<string | null>(null);

  const fetchProductsForCategory = async (cat: Category) => {
    const key = cat.name.trim().toLowerCase();
    if (productCache[key]) return; // cached
    setProductsLoadingFor(cat.id);
    // /products/admin/list returns ALL products (drafts + b2c-disabled).
    // Filtering server-side keeps the response under ~50 KB even for
    // categories with hundreds of items.
    const data = await safeGet<{ items?: any[] } | any[]>(
      `/products/admin/list?pageSize=500&page=1&category=${encodeURIComponent(cat.name)}`,
      { items: [] },
    );
    const raw: any[] = Array.isArray(data) ? data : ((data as any)?.items ?? []);
    const list: CategoryProduct[] = raw.map((p) => ({
      id: String(p.id ?? ""),
      slug: String(p.slug ?? ""),
      title: String(p.title ?? p.name ?? ""),
      image:
        (Array.isArray(p.images) && p.images[0]
          ? typeof p.images[0] === "string"
            ? p.images[0]
            : p.images[0]?.url
          : "") ?? "",
      basePrice: Number(p.basePrice ?? p.price ?? 0),
      b2cEnabled: Boolean(p.b2cEnabled ?? false),
    }));
    setProductCache((prev) => ({ ...prev, [key]: list }));
    setProductsLoadingFor((cur) => (cur === cat.id ? null : cur));
  };

  const toggleExpand = (cat: Category) => {
    if (expandedId === cat.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(cat.id);
    void fetchProductsForCategory(cat);
  };

  const goToProductEdit = (slug: string) => {
    if (!slug) return;
    router.push(`/super-admin/products/${encodeURIComponent(slug)}`);
  };

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

  // Legacy parent-reorder via HTML5 drag was removed in favour of the
  // unified drag-to-reparent system (drag any row onto another to nest, drag
  // onto the "top-level" zone to promote). Reordering among siblings can
  // still be done via the per-row up/down sortOrder editor in the dialog.
  // The old useDragReorder() hook caused handler conflicts that broke the
  // new drag system entirely — that's why the user reported "category drag
  // not working" right after the previous deploy.

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

  // ── Drag-to-reparent ─────────────────────────────────────────────────────
  // Drag any category onto a parent row to nest it as a subcategory. Drop on
  // the "Top-level" zone to promote a subcategory back to a top-level
  // category. The tree stays 2-level — dropping a parent that already has
  // children onto another parent is blocked client-side to avoid creating
  // grandchildren (Gifteeng's data model doesn't support 3+ deep).
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropToRoot, setDropToRoot] = useState(false);

  const dragged = draggingId
    ? categories.find((c) => c.id === draggingId) ?? null
    : null;

  // Are we currently dragging a parent that has children? If so, it can't be
  // nested anywhere — we hide the drop indicators on parent rows and only
  // accept reorder among siblings.
  const draggedHasChildren = useMemo(() => {
    if (!dragged) return false;
    return categories.some((c) => c.parent_id === dragged.id);
  }, [dragged, categories]);

  const reparentCategory = useCallback(
    async (childId: string, newParentId: string | null) => {
      const child = categories.find((c) => c.id === childId);
      if (!child) return;
      if (child.parent_id === newParentId) return;       // no-op
      if (newParentId === childId) return;               // self-drop
      // 2-level tree guard: a category with children can't become a child.
      const hasOwnChildren = categories.some((c) => c.parent_id === childId);
      if (hasOwnChildren && newParentId !== null) {
        toast({
          title: "Can't nest this category",
          description: `"${child.name}" has subcategories — Gifteeng's tree is only 2 levels deep. Move or delete its subcategories first.`,
          variant: "destructive",
        });
        return;
      }
      // Optimistic update so the row jumps to its new place immediately.
      setCategories((prev) =>
        prev.map((c) =>
          c.id === childId ? { ...c, parent_id: newParentId } : c,
        ),
      );
      const res = await safePatch(
        `/categories/admin/${childId}`,
        { parent_id: newParentId },
        null,
      );
      if (!res) {
        // Roll back if PATCH failed.
        setCategories((prev) =>
          prev.map((c) =>
            c.id === childId ? { ...c, parent_id: child.parent_id } : c,
          ),
        );
        toast({ title: "Couldn't move category", variant: "destructive" });
      } else {
        toast({
          title: newParentId
            ? `Nested under "${categories.find((c) => c.id === newParentId)?.name ?? "parent"}"`
            : `"${child.name}" is now a top-level category`,
        });
      }
    },
    [categories],
  );

  // ── Reorder via up/down buttons ──────────────────────────────────────────
  // HTML5 drag handles the "nest / promote" gesture; reorder uses explicit
  // buttons because mixing reorder-on-gap and nest-on-row drops in one
  // drag system led to brittle and ambiguous outcomes ("did I just nest
  // that or move it up?"). Buttons are also keyboard-accessible.
  //
  // Same-parent siblings only — swap this row's sort_order with the next
  // (or previous) sibling, then persist both.
  // Jump-to-edge — moves a row to position 0 (top) or position N-1 (bottom)
  // among its same-parent siblings, then renumbers all of them 0..N-1 and
  // persists in parallel. Saves the operator from clicking ↑ ten times to
  // bring a bottom row to the top.
  const moveRowToEdge = useCallback(
    async (cat: Category, edge: "top" | "bottom") => {
      const siblings = categories
        .filter((c) => c.parent_id === cat.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const others = siblings.filter((c) => c.id !== cat.id);
      const ordered = edge === "top" ? [cat, ...others] : [...others, cat];
      const updates = ordered
        .map((c, i) => ({ id: c.id, sort_order: i }))
        // Skip rows whose position didn't change — fewer PATCH round-trips.
        .filter((u) => {
          const existing = siblings.find((s) => s.id === u.id);
          return existing && existing.sort_order !== u.sort_order;
        });
      if (!updates.length) return;
      setCategories((prev) =>
        prev.map((c) => {
          const u = updates.find((x) => x.id === c.id);
          return u ? { ...c, sort_order: u.sort_order } : c;
        }),
      );
      await Promise.all(
        updates.map((u) =>
          safePatch(`/categories/admin/${u.id}`, { sort_order: u.sort_order }, null),
        ),
      );
    },
    [categories],
  );

  const moveRow = useCallback(
    async (cat: Category, direction: -1 | 1) => {
      const siblings = categories
        .filter((c) => c.parent_id === cat.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const idx = siblings.findIndex((c) => c.id === cat.id);
      const target = siblings[idx + direction];
      if (idx < 0 || !target) return;
      // Swap sort_order between cat and target.
      const a = cat.sort_order;
      const b = target.sort_order;
      // Avoid the no-op case where two siblings share the same sort_order.
      const newA = a === b ? b + direction : b;
      const newB = a === b ? a            : a;
      setCategories((prev) =>
        prev.map((c) => {
          if (c.id === cat.id)    return { ...c, sort_order: newA };
          if (c.id === target.id) return { ...c, sort_order: newB };
          return c;
        }),
      );
      await Promise.all([
        safePatch(`/categories/admin/${cat.id}`,    { sort_order: newA }, null),
        safePatch(`/categories/admin/${target.id}`, { sort_order: newB }, null),
      ]);
    },
    [categories],
  );

  const onRowDragStart = (cat: Category) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cat.id);
    setDraggingId(cat.id);
  };

  const onRowDragEnd = () => {
    setDraggingId(null);
    setDropTargetId(null);
    setDropToRoot(false);
  };

  const onParentDragOver = (parent: Category) => (e: React.DragEvent) => {
    if (!draggingId || draggingId === parent.id) return;
    // Block if the dragged row has its own children (would create grandkids).
    if (draggedHasChildren) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(parent.id);
  };

  const onParentDrop = (parent: Category) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingId || draggingId === parent.id || draggedHasChildren) {
      onRowDragEnd();
      return;
    }
    void reparentCategory(draggingId, parent.id);
    onRowDragEnd();
  };

  const onRootDragOver = (e: React.DragEvent) => {
    if (!draggingId) return;
    // Only meaningful when dragging a subcategory back out.
    const d = categories.find((c) => c.id === draggingId);
    if (!d || !d.parent_id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropToRoot(true);
  };

  const onRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingId) return;
    void reparentCategory(draggingId, null);
    onRowDragEnd();
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
          {/* Top-level drop zone — only shown while dragging a subcategory.
              Gives the admin a clear target for "promote this row out of
              its parent and make it a top-level category". */}
          {draggingId && dragged?.parent_id && (
            <div
              onDragOver={onRootDragOver}
              onDragLeave={() => setDropToRoot(false)}
              onDrop={onRootDrop}
              className={`rounded-xl border-2 border-dashed py-3 text-center text-xs font-bold transition-colors ${
                dropToRoot
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground bg-muted/20"
              }`}
            >
              ⤴ Drop here to make &quot;{dragged.name}&quot; a top-level category
            </div>
          )}
          {parents.map((cat, parentIdx) => {
            const children = getChildren(cat.id);
            const isReparentTarget = dropTargetId === cat.id;
            const isThisBeingDragged = draggingId === cat.id;
            const isFirstParent = parentIdx === 0;
            const isLastParent  = parentIdx === parents.length - 1;
            return (
              <div
                key={cat.id}
                onDragOver={onParentDragOver(cat)}
                onDragLeave={() => setDropTargetId((cur) => (cur === cat.id ? null : cur))}
                onDrop={onParentDrop(cat)}
                className={`bg-card rounded-xl border overflow-hidden transition-all ${
                  isThisBeingDragged ? "opacity-40 scale-[0.98] border-primary/40" :
                  isReparentTarget   ? "border-primary ring-2 ring-primary/30 shadow-md bg-primary/[0.03]" :
                  "border-border/40 hover:shadow-sm"
                }`}
              >
                {/* Parent row — only the INNER strip is draggable, not the
                    outer wrapper. Making the wrapper draggable too caused
                    HTML5 drag to intercept sub-row drags as parent drags
                    (the outer draggable consumes the event before the sub's
                    own draggable fires). Now: outer = drop target, inner = drag source. */}
                <div
                  className="flex items-center gap-3 p-3"
                  draggable
                  onDragStart={onRowDragStart(cat)}
                  onDragEnd={onRowDragEnd}
                >
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 cursor-grab active:cursor-grabbing" />
                  </div>
                  {/* Reorder cluster — 4 buttons in a 2×2 grid:
                        ⏫  ↑
                        ⏬  ↓
                      ⏫/⏬ jump to top/bottom (one click). ↑/↓ step by 1.
                      Explicit buttons because drag handles "nest" + "promote"
                      already — overloading drag with reorder semantics on
                      the same drop targets was ambiguous. */}
                  <div className="grid grid-cols-2 gap-x-0.5 gap-y-0 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); void moveRowToEdge(cat, "top"); }}
                      disabled={isFirstParent}
                      className="w-5 h-3.5 flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move to top"
                    >
                      <ChevronsUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void moveRow(cat, -1); }}
                      disabled={isFirstParent}
                      className="w-5 h-3.5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void moveRowToEdge(cat, "bottom"); }}
                      disabled={isLastParent}
                      className="w-5 h-3.5 flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move to bottom"
                    >
                      <ChevronsDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void moveRow(cat, 1); }}
                      disabled={isLastParent}
                      className="w-5 h-3.5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
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
                      {/* Clicking the count expands an inline product list
                          for this category. Click a product → product editor. */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpand(cat); }}
                        className={`inline-flex items-center gap-1 font-semibold hover:underline ${
                          (cat.product_count ?? 0) > 0 ? "text-pink-600" : "text-muted-foreground/60"
                        }`}
                        title={(cat.product_count ?? 0) > 0 ? "View products in this category" : "No products yet"}
                      >
                        {expandedId === cat.id
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronRight className="w-3 h-3" />}
                        {cat.product_count ?? 0} product{(cat.product_count ?? 0) === 1 ? "" : "s"}
                      </button>
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

                {/* Expanded product list for the parent category */}
                {expandedId === cat.id && (
                  <CategoryProductsPanel
                    cat={cat}
                    products={productCache[cat.name.trim().toLowerCase()] ?? []}
                    loading={productsLoadingFor === cat.id}
                    onProductClick={goToProductEdit}
                  />
                )}

                {/* Children */}
                {children.length > 0 && (
                  <div className="border-t border-border/30 bg-muted/5">
                    {children.map((sub, i) => {
                      const subBeingDragged = draggingId === sub.id;
                      const isFirstChild = i === 0;
                      const isLastChild  = i === children.length - 1;
                      return (
                      <div
                        key={sub.id}
                        className={`${i < children.length - 1 ? "border-b border-border/10" : ""} ${subBeingDragged ? "opacity-40" : ""}`}
                        draggable
                        onDragStart={onRowDragStart(sub)}
                        onDragEnd={onRowDragEnd}
                      >
                        <div className="flex items-center gap-2.5 px-3 py-2.5 ml-6">
                        <GripVertical className="w-3 h-3 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" />
                        <div className="grid grid-cols-2 gap-x-0.5 gap-y-0 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); void moveRowToEdge(sub, "top"); }}
                            disabled={isFirstChild}
                            className="w-4 h-3 flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move to top"
                          >
                            <ChevronsUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); void moveRow(sub, -1); }}
                            disabled={isFirstChild}
                            className="w-4 h-3 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            <ChevronUp className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); void moveRowToEdge(sub, "bottom"); }}
                            disabled={isLastChild}
                            className="w-4 h-3 flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move to bottom"
                          >
                            <ChevronsDown className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); void moveRow(sub, 1); }}
                            disabled={isLastChild}
                            className="w-4 h-3 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            <ChevronDown className="w-2.5 h-2.5" />
                          </button>
                        </div>
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
                        {/* Tappable badge — opens an inline product list for
                            this subcategory + lets admin click through to
                            the product editor. */}
                        <button
                          onClick={() => toggleExpand(sub)}
                          className={`text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded-full hover:underline ${
                            (sub.product_count ?? 0) > 0
                              ? "bg-pink-500/10 text-pink-600"
                              : "bg-muted text-muted-foreground/60"
                          }`}
                          title={(sub.product_count ?? 0) > 0 ? "View products" : "No products yet"}
                        >
                          {sub.product_count ?? 0}
                        </button>
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
                        {/* Subcategory drill-in panel */}
                        {expandedId === sub.id && (
                          <CategoryProductsPanel
                            cat={sub}
                            products={productCache[sub.name.trim().toLowerCase()] ?? []}
                            loading={productsLoadingFor === sub.id}
                            onProductClick={goToProductEdit}
                            indent
                          />
                        )}
                      </div>
                      );
                    })}
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

// ─── Category drill-in panel ─────────────────────────────────────────────────
// Renders the products that belong to a category (or subcategory). Each row
// is a click-through to the product editor at /super-admin/products/<slug>.
function CategoryProductsPanel({
  cat,
  products,
  loading,
  onProductClick,
  indent,
}: {
  cat: Category;
  products: CategoryProduct[];
  loading: boolean;
  onProductClick: (slug: string) => void;
  indent?: boolean;
}) {
  return (
    <div
      className={`border-t border-border/30 bg-muted/10 px-3 py-2 ${
        indent ? "ml-6" : ""
      }`}
    >
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-[11px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading products in "{cat.name}"…
        </div>
      ) : products.length === 0 ? (
        <div className="py-3 text-[11px] text-muted-foreground text-center">
          No products in "{cat.name}" yet. Assign a product's category to "{cat.name}"
          from the product editor to populate this list.
        </div>
      ) : (
        <div className="divide-y divide-border/20">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => onProductClick(p.slug)}
              className="w-full flex items-center gap-3 py-2 hover:bg-accent/30 transition-colors rounded-md px-2 text-left"
              title="Open product editor"
            >
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.title}
                  className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border/30"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{p.title}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">
                  /{p.slug}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">
                ₹{p.basePrice.toFixed(0)}
              </span>
              {!p.b2cEnabled && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">
                  Draft
                </span>
              )}
              <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
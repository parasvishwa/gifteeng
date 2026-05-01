"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Trash2, Loader2, ImageIcon, Search, X, Upload, Eye, EyeOff, Filter } from "lucide-react";
import {
  toast,
  Button, Input, Label, Switch, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeDelete, safeGet, safePatch, safePost } from "@/lib/admin-api";

async function uploadFile(file: File): Promise<{ id?: string; path?: string; url?: string } | null> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${getApiBase()}/api/files/upload`, { method: "POST", headers: authHeaders(), body: fd });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

interface StockImage {
  id: string; label: string; image_url: string; category: string;
  is_active: boolean; sort_order: number; created_at: string;
}

export default function AdminStockImagesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<StockImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  const load = async () => {
    setIsLoading(true);
    const data = await safeGet<StockImage[]>("/stock-images", []);
    setImages(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(
    () => [...new Set(images.map(i => i.category).filter(Boolean))].sort(),
    [images]
  );

  const filtered = useMemo(() => {
    let list = images;
    if (filterCat !== "all") list = list.filter(i => i.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }
    return list;
  }, [images, search, filterCat]);

  const runUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadFile(file);
      if (!res || !res.url) throw new Error("Upload failed");
      await safePost(
        "/stock-images",
        {
          label: newLabel || file.name.split(".")[0],
          image_url: res.url,
          category: newCategory,
          sort_order: images.length,
        },
        null
      );
      setNewLabel("");
      toast({ title: "Image uploaded!" });
      await load();
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    }
    setUploading(false);
  };

  const runDelete = async (image: StockImage) => {
    await safeDelete(`/stock-images/${image.id}`, null);
    toast({ title: "Image deleted" });
    await load();
  };

  const runToggle = async (id: string, is_active: boolean) => {
    await safePatch(`/stock-images/${id}`, { is_active }, null);
    await load();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) runUpload(file);
    e.target.value = "";
  };

  const activeCount = images.filter(i => i.is_active).length;

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ImageIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Stock Images</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount} active · {images.length - activeCount} hidden · {categories.length} categories
            </p>
          </div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
          <h3 className="text-xs font-semibold">Upload New Image</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">Label</Label>
              <Input placeholder="e.g. Sunset Background" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1 block">Category</Label>
              <Input placeholder="general" value={newCategory} onChange={e => setNewCategory(e.target.value)} className="h-9 text-sm w-full sm:w-32" />
            </div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1.5 text-xs h-9">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading..." : "Choose & Upload"}
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
        </div>
      </div>

      {/* Search & Filter */}
      {images.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search images..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8 pr-8" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          {categories.length > 1 && (
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="h-8 text-xs w-36">
                <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : images.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <ImageIcon className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm font-medium mb-1">No stock images yet</p>
          <p className="text-xs text-muted-foreground mb-4">Upload images for the product customizer gallery</p>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> Upload first image
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-12 text-center">
          <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No images match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map(img => (
            <div key={img.id} className={`bg-card rounded-xl overflow-hidden border border-border/40 group transition-all hover:shadow-md ${!img.is_active ? "opacity-50" : ""}`}>
              <div className="aspect-square relative overflow-hidden">
                <img src={img.image_url} alt={img.label} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                {/* Overlay actions */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => runToggle(img.id, !img.is_active)}
                    className="w-8 h-8 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-card transition-colors"
                    title={img.is_active ? "Hide" : "Show"}
                  >
                    {img.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => { if (confirm("Delete this image?")) runDelete(img); }}
                    className="w-8 h-8 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Status badge */}
                {!img.is_active && (
                  <div className="absolute top-1.5 right-1.5">
                    <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4 bg-card/80 backdrop-blur-sm">Hidden</Badge>
                  </div>
                )}
              </div>
              <div className="px-2.5 py-2">
                <p className="text-[11px] font-medium truncate">{img.label}</p>
                <p className="text-[9px] text-muted-foreground truncate">{img.category}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
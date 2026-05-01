"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Loader2, Eye, EyeOff, Upload, Play, Monitor, X, Pencil, Save } from "lucide-react";
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

interface ProductVideo {
  id: string; product_id: string; title: string; video_url: string;
  thumbnail_url: string; is_active: boolean; show_floating: boolean; sort_order: number;
}
interface Product { id: string; name: string; }

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<ProductVideo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    product_id: "", title: "", video_url: "", thumbnail_url: "", is_active: true, show_floating: true,
  });

  // Both /videos and /products return a paginated envelope `{items, total, ...}`,
  // not a plain array. Older code assumed array which crashed at .filter().
  // unwrapList() handles both shapes safely.
  const unwrapList = <T,>(v: unknown): T[] => {
    if (Array.isArray(v)) return v as T[];
    if (v && typeof v === "object" && Array.isArray((v as { items?: unknown }).items)) {
      return (v as { items: T[] }).items;
    }
    return [];
  };

  useEffect(() => {
    (async () => {
      const [v, p, s] = await Promise.all([
        safeGet<unknown>("/videos", []),
        safeGet<unknown>("/products?is_active=true", []),
        safeGet<Record<string, unknown>>("/admin/settings", {}),
      ]);
      setVideos(unwrapList<ProductVideo>(v));
      setProducts(unwrapList<Product>(p));
      const raw = (s as Record<string, unknown>)?.video_gallery_enabled;
      if (raw !== undefined && raw !== null) {
        setGlobalEnabled(String(raw).replace(/^"|"$/g, "") !== "false");
      }
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, []);

  const fetchVideos = async () => {
    const data = await safeGet<unknown>("/videos", []);
    setVideos(unwrapList<ProductVideo>(data));
  };

  const toggleGlobal = async (enabled: boolean) => {
    setGlobalEnabled(enabled);
    await safePatch("/admin/settings/video_gallery_enabled", { value: JSON.stringify(enabled) }, null);
    toast({ title: enabled ? "Video gallery enabled" : "Video gallery disabled" });
  };

  const validateVideoDimensions = (file: File): Promise<boolean> =>
    new Promise(resolve => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.videoWidth === 1080 && video.videoHeight === 1920) { resolve(true); }
        else {
          toast({ title: "Invalid dimensions", description: `Need 1080×1920, got ${video.videoWidth}×${video.videoHeight}`, variant: "destructive" });
          resolve(false);
        }
      };
      video.onerror = () => { URL.revokeObjectURL(video.src); resolve(false); };
      video.src = URL.createObjectURL(file);
    });

  const uploadVideo = async (file: File) => {
    setUploading(true);
    if (!(await validateVideoDimensions(file))) { setUploading(false); return; }
    const res = await uploadFile(file);
    if (!res || !res.url) { toast({ title: "Upload failed", variant: "destructive" }); setUploading(false); return; }
    setForm(f => ({ ...f, video_url: res.url || "" }));
    setUploading(false);
    toast({ title: "Video uploaded!" });
  };

  const uploadThumbnail = async (file: File) => {
    setUploadingThumb(true);
    const res = await uploadFile(file);
    if (!res || !res.url) { toast({ title: "Upload failed", variant: "destructive" }); setUploadingThumb(false); return; }
    setForm(f => ({ ...f, thumbnail_url: res.url || "" }));
    setUploadingThumb(false);
    toast({ title: "Thumbnail uploaded!" });
  };

  const saveVideo = async () => {
    if (!form.title || !form.video_url) { toast({ title: "Title and video are required", variant: "destructive" }); return; }
    if (editingId) {
      await safePatch(`/videos/${editingId}`, { ...form, updated_at: new Date().toISOString() }, null);
      toast({ title: "Video updated!" });
    } else {
      await safePost("/videos", { ...form, sort_order: videos.length }, null);
      toast({ title: "Video added!" });
    }
    setShowForm(false); setEditingId(null); resetForm(); fetchVideos();
  };

  const resetForm = () => setForm({ product_id: "", title: "", video_url: "", thumbnail_url: "", is_active: true, show_floating: true });

  const openAdd = () => { setEditingId(null); resetForm(); setShowForm(true); };
  const openEdit = (v: ProductVideo) => {
    setEditingId(v.id);
    setForm({ product_id: v.product_id, title: v.title, video_url: v.video_url, thumbnail_url: v.thumbnail_url, is_active: v.is_active, show_floating: v.show_floating });
    setShowForm(true);
  };

  const deleteVideo = async (id: string) => {
    if (!confirm("Delete this video?")) return;
    await safeDelete(`/videos/${id}`, null);
    toast({ title: "Video deleted" }); fetchVideos();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await safePatch(`/videos/${id}`, { is_active: !current }, null); fetchVideos();
  };

  const toggleFloating = async (id: string, current: boolean) => {
    await safePatch(`/videos/${id}`, { show_floating: !current }, null); fetchVideos();
  };

  const getProductName = (pid: string) => products.find(p => p.id === pid)?.name || "General";
  const activeCount = videos.filter(v => v.is_active).length;
  const floatingCount = videos.filter(v => v.show_floating).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Play className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Videos</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount} active · {floatingCount} floating · {videos.length} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1">
            <Switch checked={globalEnabled} onCheckedChange={toggleGlobal} />
            <span className="text-[10px] text-muted-foreground hidden sm:inline">{globalEnabled ? "Gallery on" : "Gallery off"}</span>
          </div>
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5" /> Add Video
          </Button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-muted/10">
            <h3 className="text-xs font-semibold">{editingId ? "Edit Video" : "New Video"}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1 rounded-lg hover:bg-muted">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground mb-1 block">Title *</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Product showcase video" className="h-9 text-sm" autoFocus />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground mb-1 block">Product</Label>
                <Select value={form.product_id || "_general"} onValueChange={v => setForm({ ...form, product_id: v === "_general" ? "" : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="General" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_general">General (no product)</SelectItem>
                    {products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Video upload */}
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Video *</Label>
              <input type="file" ref={videoFileRef} accept="video/*" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadVideo(e.target.files[0]); }} />
              {form.video_url ? (
                <div className="relative rounded-xl overflow-hidden border border-border/40 bg-muted aspect-video max-w-xs group">
                  <video src={form.video_url} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setPreviewVideo(form.video_url)} className="w-9 h-9 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center">
                      <Play className="w-4 h-4" />
                    </button>
                    <button onClick={() => setForm({ ...form, video_url: "" })} className="w-9 h-9 rounded-full bg-card/90 backdrop-blur-sm flex items-center justify-center text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => videoFileRef.current?.click()} disabled={uploading}
                  className="w-full max-w-xs aspect-video rounded-xl border-2 border-dashed border-border/60 hover:border-primary/50 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary transition-colors">
                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  <span className="text-xs font-medium">{uploading ? "Uploading..." : "Upload Video"}</span>
                  <span className="text-[9px] text-muted-foreground">1080 × 1920 portrait only</span>
                </button>
              )}
              <div className="mt-2">
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">Or paste URL</Label>
                <Input value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://..." className="h-8 text-xs font-mono" />
              </div>
            </div>

            {/* Thumbnail */}
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Thumbnail</Label>
              <input type="file" ref={thumbFileRef} accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadThumbnail(e.target.files[0]); }} />
              <div className="flex items-start gap-3">
                {form.thumbnail_url ? (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border/40 shrink-0 group">
                    <img src={form.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setForm({ ...form, thumbnail_url: "" })} className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => thumbFileRef.current?.click()} disabled={uploadingThumb}
                    className="w-16 h-16 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shrink-0">
                    {uploadingThumb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  </button>
                )}
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">Or paste URL</Label>
                  <Input value={form.thumbnail_url} onChange={e => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="https://..." className="h-8 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* Toggles + Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-border/30">
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                  <span className="text-xs">{form.is_active ? "Active" : "Hidden"}</span>
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={form.show_floating} onCheckedChange={v => setForm({ ...form, show_floating: v })} />
                  <span className="text-xs">Floating widget</span>
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={saveVideo}>
                  <Save className="w-3.5 h-3.5" /> {editingId ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Grid */}
      {videos.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Play className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm font-medium mb-1">No videos yet</p>
          <p className="text-xs text-muted-foreground mb-4">Add product showcase videos for your gallery</p>
          <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5" /> Add first video
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {videos.map(v => (
            <div key={v.id} className={`bg-card rounded-xl overflow-hidden border border-border/40 group transition-all hover:shadow-md ${!v.is_active ? "opacity-50" : ""}`}>
              {/* Thumbnail */}
              <div className="relative aspect-[9/16] max-h-52 bg-muted cursor-pointer overflow-hidden" onClick={() => setPreviewVideo(v.video_url)}>
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                ) : (
                  <video src={v.video_url} className="w-full h-full object-cover" muted preload="metadata" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-4 h-4" />
                  </div>
                </div>
                {/* Badges */}
                <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                  {v.show_floating && (
                    <Badge className="text-[8px] h-4 px-1.5 bg-primary/80 text-primary-foreground backdrop-blur-sm">
                      <Monitor className="w-2.5 h-2.5 mr-0.5" /> Float
                    </Badge>
                  )}
                  {!v.is_active && (
                    <Badge variant="secondary" className="text-[8px] h-4 px-1.5 bg-card/80 backdrop-blur-sm">Hidden</Badge>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="p-2.5">
                <p className="text-[11px] font-medium truncate mb-0.5">{v.title}</p>
                <p className="text-[9px] text-muted-foreground truncate mb-2">{getProductName(v.product_id)}</p>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => toggleActive(v.id, v.is_active)}
                    className={`p-1 rounded-lg transition-colors ${v.is_active ? "text-emerald-600 hover:bg-emerald-500/10" : "text-muted-foreground hover:bg-muted"}`} title={v.is_active ? "Hide" : "Show"}>
                    {v.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => toggleFloating(v.id, v.show_floating)}
                    className={`p-1 rounded-lg transition-colors ${v.show_floating ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted"}`} title="Toggle floating">
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => openEdit(v)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteVideo(v.id)} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ml-auto" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewVideo(null)}>
          <div className="relative w-full max-w-sm max-h-[85vh] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <video src={previewVideo} controls autoPlay className="w-full h-full object-contain bg-black rounded-2xl" />
            <button onClick={() => setPreviewVideo(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center hover:bg-card transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
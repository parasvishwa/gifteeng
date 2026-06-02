"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  FileImage, Upload, Search, Trash2, Loader2, Minimize2, ChevronDown,
  Copy, Check, Grid3X3, List, ImageOff, Package, Users, Star, Image,
  FolderOpen, X, Wand2, Eye, ChevronLeft, ChevronRight as ChevronRightIcon,
  AlertTriangle,
} from "lucide-react";
import {
  Button, Input, Checkbox, Progress, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeDelete, safeGet } from "@/lib/admin-api";

// ── In-page toast ───────────────────────────────────────
let _setToast: ((t: { title: string; description?: string; variant?: string } | null) => void) | null = null;
function useToast() {
  return {
    toast: (opts: { title: string; description?: string; variant?: string }) => {
      if (_setToast) { _setToast(opts); setTimeout(() => _setToast?.(null), 3500); }
    },
  };
}
function ToastBanner() {
  const [t, setT] = useState<{ title: string; description?: string; variant?: string } | null>(null);
  useEffect(() => { _setToast = setT; return () => { _setToast = null; }; }, []);
  if (!t) return null;
  const isErr = t.variant === "destructive";
  return (
    <div className={`fixed bottom-4 right-4 z-[300] flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl border max-w-xs animate-in slide-in-from-bottom-2 duration-200 ${
      isErr ? "bg-destructive text-destructive-foreground border-destructive/30" : "bg-card text-foreground border-border/60"
    }`}>
      <div className="min-w-0">
        <p className="text-xs font-bold">{t.title}</p>
        {t.description && <p className="text-[11px] opacity-75 mt-0.5">{t.description}</p>}
      </div>
      <button onClick={() => setT(null)} className="shrink-0 opacity-60 hover:opacity-100 text-xs leading-none mt-0.5">✕</button>
    </div>
  );
}

// ── Delete confirmation modal ─────────────────────────────
function DeleteConfirmModal({
  file,
  onConfirm,
  onCancel,
}: {
  file: StorageFile;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isUsed = file.usageCount > 0;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm animate-in zoom-in-95 duration-150">
        {/* Preview */}
        <div className="relative h-32 bg-muted rounded-t-2xl overflow-hidden">
          <img src={file.url} alt={file.name} className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isUsed ? "bg-amber-500/90" : "bg-destructive/90"}`}>
              {isUsed ? <AlertTriangle className="w-6 h-6 text-white" /> : <Trash2 className="w-6 h-6 text-white" />}
            </div>
          </div>
        </div>

        <div className="p-5">
          <h3 className="text-sm font-bold mb-1">Delete file?</h3>
          <p className="text-[11px] text-muted-foreground font-mono mb-3 truncate">{file.name}</p>

          {isUsed && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-3">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                <strong>This file is used {file.usageCount} time{file.usageCount !== 1 ? "s" : ""}</strong> across your products or content. Deleting it will cause broken images.
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mb-4">
            This action is permanent and cannot be undone.
          </p>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 h-9 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 h-9 rounded-lg text-xs font-semibold text-white transition-colors ${isUsed ? "bg-amber-500 hover:bg-amber-600" : "bg-destructive hover:bg-destructive/90"}`}
            >
              {isUsed ? "Delete anyway" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────
interface StorageFile {
  name: string;
  path: string;
  id: string;
  created_at: string;
  metadata: { size: number; mimetype: string } | null;
  bucket: string;
  url: string;
  category: "customer" | "product" | "review" | "hero" | "other";
  usageCount: number;
  usedIn: string[];
  altText?: string;
}
type FileCategory = "all" | "customer" | "product" | "review" | "hero" | "other";

const CATEGORY_META: Record<FileCategory, { label: string; icon: any; color: string; ownerType: string }> = {
  all:      { label: "All Files",          icon: FolderOpen, color: "text-foreground",         ownerType: "system" },
  customer: { label: "Customer Uploaded",  icon: Users,      color: "text-blue-500",            ownerType: "customer" },
  product:  { label: "Product Images",     icon: Package,    color: "text-emerald-500",         ownerType: "product" },
  review:   { label: "Reviews",            icon: Star,       color: "text-amber-500",           ownerType: "review" },
  hero:     { label: "Hero & Banners",     icon: Image,      color: "text-purple-500",          ownerType: "hero" },
  other:    { label: "Other",              icon: FolderOpen, color: "text-muted-foreground",    ownerType: "system" },
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Compress an image while preserving transparency. The previous version
// always called `toBlob(..., "image/jpeg")` which (a) flattens the alpha
// channel onto an opaque canvas background and (b) ignores the source
// format — so PNG icons came back as black-background JPGs.
//
// New behaviour:
//   • PNG in  → PNG out (lossless, alpha preserved). `quality` is mostly
//     ignored by the canvas spec for PNG, but we still resize.
//   • WebP in → WebP out (also supports alpha; quality respected).
//   • Anything else (JPG / HEIC / etc.) → JPG out at the requested quality.
//
// Returns the new Blob with its `type` correctly set so the upload payload
// preserves the right MIME and downstream consumers (file picker thumbs,
// browser <img>) treat it as the right format.
const compressImage = (blob: Blob, quality: number, maxWidth = 1200): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        // Don't pre-fill the canvas — leaving it transparent means PNG /
        // WebP outputs retain alpha. JPG output will fall back to black
        // for transparent pixels (acceptable, since the operator chose
        // JPG by uploading a JPG).
        ctx.drawImage(img, 0, 0, w, h);
        // Pick output format from the input MIME — keep alpha-bearing
        // formats lossless, only re-encode JPG-family as JPG.
        const inputType = (blob.type || "").toLowerCase();
        const outputType =
          inputType.includes("png")  ? "image/png"  :
          inputType.includes("webp") ? "image/webp" :
          "image/jpeg";
        // `quality` is only honoured for jpeg + webp by the canvas spec.
        // PNG always writes lossless; passing quality is harmless.
        canvas.toBlob(
          (r) => (r ? resolve(r) : reject(new Error("Compression failed"))),
          outputType,
          quality,
        );
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(blob);
  });

const bucketToCategory = (bucket: string): StorageFile["category"] => {
  switch (bucket) {
    case "order-assets":
    case "customer":   return "customer";
    case "masks":
    case "stock-images":
    case "product":    return "product";
    case "reviews":
    case "review":     return "review";
    case "hero-images":
    case "hero":       return "hero";
    default:           return "other";
  }
};

// ── Lightbox modal ───────────────────────────────────────
function Lightbox({
  files, index, onClose, onPrev, onNext,
}: {
  files: StorageFile[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const f = files[index];
  if (!f) return null;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={e => { e.stopPropagation(); onPrev(); }}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <div
        className="relative flex flex-col items-center max-w-4xl max-h-[90vh] mx-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Image */}
        <img
          src={f.url}
          alt={f.altText || f.name}
          className="max-h-[75vh] max-w-full rounded-xl object-contain shadow-2xl"
        />
        {/* Info bar */}
        <div className="mt-3 flex items-center gap-4 bg-white/10 rounded-xl px-5 py-2.5 text-white text-xs">
          <span className="font-semibold truncate max-w-[280px]">{f.name}</span>
          <span className="opacity-60">·</span>
          <span className="opacity-60 shrink-0">{formatFileSize(f.metadata?.size ?? 0)}</span>
          <span className="opacity-60">·</span>
          <span className="opacity-60 shrink-0 capitalize">{f.category}</span>
          <a
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="ml-2 shrink-0 underline opacity-70 hover:opacity-100"
            onClick={e => e.stopPropagation()}
          >
            Open
          </a>
        </div>
        {f.altText && (
          <p className="mt-2 text-white/50 text-[11px] max-w-md text-center italic">{f.altText}</p>
        )}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onNext(); }}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <ChevronRightIcon className="w-6 h-6" />
      </button>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────
export default function AdminFiles() {
  const [files, setFiles]                       = useState<StorageFile[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [search, setSearch]                     = useState("");
  const [selected, setSelected]                 = useState<Set<string>>(new Set());
  const [uploading, setUploading]               = useState(false);
  const [uploadCategory, setUploadCategory]     = useState<string>("product");
  const [compressing, setCompressing]           = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const [compressLog, setCompressLog]           = useState("");
  const [sortBy, setSortBy]                     = useState<"date"|"size"|"name"|"usage">("date");
  const [sortDir, setSortDir]                   = useState<"asc"|"desc">("desc");
  const [filterCategory, setFilterCategory]     = useState<FileCategory>("all");
  const [filterSize, setFilterSize]             = useState("all");
  const [viewMode, setViewMode]                 = useState<"grid"|"list">("grid");
  const [dragOver, setDragOver]                 = useState(false);
  const [copiedId, setCopiedId]                 = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx]           = useState<number | null>(null);
  const [generatingAlt, setGeneratingAlt]       = useState<Set<string>>(new Set());
  const [altResults, setAltResults]             = useState<Record<string, string>>({});
  const [copiedAlt, setCopiedAlt]               = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget]         = useState<StorageFile | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // ── Fetch ──
  const fetchFiles = async () => {
    setLoading(true);
    const raw = await safeGet<any[]>(`/files?pageSize=500`, []);
    const list: StorageFile[] = (raw || []).map((f: any) => {
      const bucket = f.ownerType || f.bucket || f.category || "other";
      const relPath: string = f.path || f.name || "";
      return {
        name: relPath.split("/").pop() || relPath || "file",
        path: relPath,
        id: f.id || `${bucket}/${relPath}`,
        created_at: f.createdAt || f.created_at || "",
        metadata: {
          size: Number(f.sizeBytes ?? f.metadata?.size ?? f.size ?? 0),
          mimetype: f.mimeType || f.metadata?.mimetype || f.mimetype || "image/*",
        },
        bucket,
        url: f.url || f.publicUrl || "",
        category: bucketToCategory(bucket),
        usageCount: Number(f.usageCount || 0),
        usedIn: Array.isArray(f.usedIn) ? f.usedIn : [],
      };
    });
    setFiles(list);
    setLoading(false);
  };
  useEffect(() => { fetchFiles(); }, []);

  // ── Upload ──
  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(fileList)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("ownerType", uploadCategory); // pass chosen category as ownerType
        const res = await fetch(`${getApiBase()}/api/files/upload`, {
          method: "POST", headers: authHeaders(), body: fd,
        });
        if (res.ok) ok++;
        else toast({ title: "Upload failed", description: file.name, variant: "destructive" });
      } catch (err: any) {
        toast({ title: "Upload error", description: err?.message, variant: "destructive" });
      }
    }
    if (ok > 0) toast({ title: `${ok} file(s) uploaded!` });
    setUploading(false);
    fetchFiles();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files);
  }, [uploadCategory]); // re-bind when category changes

  // ── Delete ──
  const confirmDelete = async (f: StorageFile) => {
    await safeDelete(`/files/${encodeURIComponent(f.id)}`, null);
    setFiles(prev => prev.filter(x => x.id !== f.id));
    setSelected(prev => { const next = new Set(prev); next.delete(f.id); return next; });
    setDeleteTarget(null);
    toast({ title: "Deleted" });
  };

  const handleDelete = (f: StorageFile) => setDeleteTarget(f);

  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const handleBulkDelete = () => setBulkDeletePending(true);
  const confirmBulkDelete = async () => {
    for (const id of new Set(selected)) await safeDelete(`/files/${encodeURIComponent(id)}`, null);
    setFiles(prev => prev.filter(x => !selected.has(x.id)));
    setSelected(new Set());
    setBulkDeletePending(false);
    toast({ title: "Files deleted" });
  };

  // ── Copy URL ──
  const copyUrl = (f: StorageFile) => {
    navigator.clipboard.writeText(f.url);
    setCopiedId(f.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // ── Compress in-place (PATCH /files/:id/replace) ──
  const compressFiles = async (level: "low" | "medium" | "high") => {
    const settings = {
      low:    { quality: 0.85, maxWidth: 1600 },
      medium: { quality: 0.65, maxWidth: 1200 },
      high:   { quality: 0.40, maxWidth: 800 },
    };
    const { quality, maxWidth } = settings[level];
    const toCompress = files.filter(f => selected.has(f.id));
    if (!toCompress.length) return;

    setCompressing(true); setCompressProgress(0); setCompressLog("");
    let done = 0, totalSaved = 0, successCount = 0;

    for (const f of toCompress) {
      try {
        setCompressLog(`Processing: ${f.name}`);
        const res = await fetch(f.url);
        if (!res.ok) { done++; setCompressProgress(Math.round((done / toCompress.length) * 100)); continue; }
        const blob = await res.blob();
        const originalSize = blob.size;
        if (originalSize < 5000) { done++; setCompressProgress(Math.round((done / toCompress.length) * 100)); continue; }

        const compressed = await compressImage(blob, quality, maxWidth);
        const saved = originalSize - compressed.size;

        if (saved > 1000) {
          // Compressed Blob now carries the correct MIME — PNG stays PNG,
          // WebP stays WebP, only JPG-family is re-encoded as JPG. Build
          // the upload filename with the matching extension so the
          // backend stores it with the right ContentType.
          const outMime = compressed.type || "image/jpeg";
          const newExt =
            outMime === "image/png"  ? ".png"  :
            outMime === "image/webp" ? ".webp" :
            ".jpg";
          // Strip any existing extension and append the new one — covers
          // the case where a PNG was uploaded as foo.png and stays foo.png.
          const baseName = f.name.replace(/\.[a-z0-9]+$/i, "");
          const newName  = `${baseName}${newExt}`;

          const fd = new FormData();
          fd.append("file", new File([compressed], newName, { type: outMime }));
          const upRes = await fetch(`${getApiBase()}/api/files/${encodeURIComponent(f.id)}/replace`, {
            method: "PATCH", headers: authHeaders(), body: fd,
          });
          if (upRes.ok) {
            const updated = await upRes.json();
            totalSaved += saved;
            successCount++;
            setFiles(prev => prev.map(x =>
              x.id === f.id
                ? { ...x, metadata: { size: updated.sizeBytes ?? compressed.size, mimetype: outMime } }
                : x
            ));
            setCompressLog(`${f.name}: saved ${formatFileSize(saved)}`);
          } else {
            setCompressLog(`Failed: ${f.name}`);
          }
        } else {
          setCompressLog(`Skipped ${f.name}: already optimized`);
        }
      } catch (err: any) {
        setCompressLog(`Error: ${f.name}`);
      }
      done++;
      setCompressProgress(Math.round((done / toCompress.length) * 100));
    }

    setCompressing(false);
    setSelected(new Set());
    toast({
      title: `Compressed ${successCount}/${toCompress.length}`,
      description: totalSaved > 0 ? `Saved ${formatFileSize(totalSaved)} — same files updated in-place` : "Already optimized",
    });
  };

  // ── Alt text generation ──
  const generateAlt = async (fileIds: string[]) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    if (!fileIds.length) return;
    const targets = files.filter(f => fileIds.includes(f.id));
    setGeneratingAlt(new Set(fileIds));

    for (const f of targets) {
      try {
        const base = getApiBase();
        const res = await fetch(`${base}/api/ai/generate`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `Write a concise, descriptive alt text for an e-commerce product image. The image filename is "${f.name}". Return only the alt text, no quotes, maximum 120 characters.`,
            maxTokens: 60,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text: string = (data.text || data.result || data.content || "").trim();
          if (text) {
            setAltResults(prev => ({ ...prev, [f.id]: text }));
            setFiles(prev => prev.map(x => x.id === f.id ? { ...x, altText: text } : x));
          }
        } else {
          // Fallback: generate from filename
          const fallback = f.name
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]/g, " ")
            .replace(/\d{10,}/g, "")
            .trim()
            .slice(0, 100);
          setAltResults(prev => ({ ...prev, [f.id]: fallback || f.name }));
        }
      } catch {
        const fallback = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim().slice(0, 100);
        setAltResults(prev => ({ ...prev, [f.id]: fallback }));
      }
    }
    setGeneratingAlt(new Set());
    toast({ title: `Alt text generated for ${targets.length} image(s)` });
  };

  const copyAlt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAlt(id);
    setTimeout(() => setCopiedAlt(null), 1500);
  };

  // ── Filtered / sorted list ──
  const filteredAndSorted = useMemo(() => {
    let result = files.filter(f => {
      if (search && !f.name.toLowerCase().includes(search.toLowerCase()) && !f.bucket.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory !== "all" && f.category !== filterCategory) return false;
      if (filterSize !== "all") {
        const size = f.metadata?.size || 0;
        if (filterSize === "small" && size >= 100 * 1024) return false;
        if (filterSize === "medium" && (size < 100 * 1024 || size >= 500 * 1024)) return false;
        if (filterSize === "large" && size < 500 * 1024) return false;
      }
      return true;
    });
    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortBy === "size") cmp = (a.metadata?.size || 0) - (b.metadata?.size || 0);
      else if (sortBy === "usage") cmp = a.usageCount - b.usageCount;
      else cmp = a.name.localeCompare(b.name);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [files, search, filterCategory, filterSize, sortBy, sortDir]);

  const toggleAll   = () => selected.size === filteredAndSorted.length
    ? setSelected(new Set())
    : setSelected(new Set(filteredAndSorted.map(f => f.id)));
  const toggleOne   = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<string, { count: number; size: number }> = {};
    for (const f of files) {
      if (!counts[f.category]) counts[f.category] = { count: 0, size: 0 };
      counts[f.category].count++;
      counts[f.category].size += f.metadata?.size || 0;
    }
    return counts;
  }, [files]);

  const totalSize   = files.reduce((s, f) => s + (f.metadata?.size || 0), 0);
  const unusedFiles = files.filter(f => f.usageCount === 0);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-xs text-muted-foreground">Scanning all assets…</p>
    </div>
  );

  return (
    <>
      <ToastBanner />

      {/* Single-file delete confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          file={deleteTarget}
          onConfirm={() => confirmDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Bulk delete confirm */}
      {bulkDeletePending && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-destructive" />
            </div>
            <h3 className="text-sm font-bold text-center mb-1">Delete {selected.size} files?</h3>
            {Array.from(selected).some(id => files.find(f => f.id === id)?.usageCount) && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center mb-3">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Some selected files are currently in use — this may break images.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground text-center mb-4">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setBulkDeletePending(false)} className="flex-1 h-9 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors">Cancel</button>
              <button onClick={confirmBulkDelete} className="flex-1 h-9 rounded-lg bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors">Delete all</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <Lightbox
          files={filteredAndSorted}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx(i => i !== null ? Math.max(0, i - 1) : null)}
          onNext={() => setLightboxIdx(i => i !== null ? Math.min(filteredAndSorted.length - 1, i + 1) : null)}
        />
      )}

      <div
        className="space-y-4"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="fixed inset-0 z-50 bg-primary/5 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-card border-2 border-dashed border-primary rounded-2xl p-12 text-center">
              <Upload className="w-10 h-10 text-primary mx-auto mb-3" />
              <p className="text-sm font-semibold">Drop files to upload as <span className="text-primary capitalize">{uploadCategory}</span></p>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileImage className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-display font-bold tracking-tight">Files</h2>
            <p className="text-[11px] text-muted-foreground">{files.length} files · {formatFileSize(totalSize)} · {unusedFiles.length} unused</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Category picker for upload */}
            <Select value={uploadCategory} onValueChange={setUploadCategory}>
              <SelectTrigger className="w-auto min-w-[120px] text-[11px] h-8 px-2.5 bg-card border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product Images</SelectItem>
                <SelectItem value="hero">Hero & Banners</SelectItem>
                <SelectItem value="review">Reviews</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="system">Other</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden sm:flex bg-muted rounded-lg p-0.5">
              <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setViewMode("list")} className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ""; }} />
        </div>

        {/* ── Category filter cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {(["customer", "product", "review", "hero", "other"] as const).map(cat => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const data = categoryCounts[cat] || { count: 0, size: 0 };
            const isActive = filterCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategory(isActive ? "all" : cat)}
                className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                  isActive ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : "border-border/40 bg-card hover:border-border"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : meta.color}`} />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold truncate">{meta.label}</p>
                  <p className="text-[10px] text-muted-foreground">{data.count} · {formatFileSize(data.size)}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Bulk action bar ── */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3.5 py-2.5 animate-in slide-in-from-top-2 duration-200 flex-wrap">
            <Checkbox checked={selected.size === filteredAndSorted.length} onCheckedChange={toggleAll} className="scale-90" />
            <span className="text-xs font-semibold text-primary flex-1">{selected.size} selected</span>

            {/* Alt text */}
            <Button
              size="sm" variant="outline"
              className="gap-1 text-[11px] h-7"
              disabled={generatingAlt.size > 0}
              onClick={() => generateAlt(Array.from(selected))}
            >
              {generatingAlt.size > 0 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Generate Alt
            </Button>

            {/* Compress */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-[11px] h-7" disabled={compressing}>
                  <Minimize2 className="w-3 h-3" /> Compress <ChevronDown className="w-2.5 h-2.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => compressFiles("low")} className="text-xs">Low — 85% quality (in-place)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => compressFiles("medium")} className="text-xs">Medium — 65% quality (in-place)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => compressFiles("high")} className="text-xs">High — 40% quality (in-place)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" variant="outline" className="gap-1 text-[11px] h-7 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleBulkDelete}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          </div>
        )}

        {compressing && (
          <div className="bg-card rounded-xl border border-border/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Compressing in-place…</p>
              <span className="text-[11px] text-muted-foreground font-mono">{compressProgress}%</span>
            </div>
            <Progress value={compressProgress} className="h-1.5" />
            {compressLog && <p className="text-[10px] text-muted-foreground font-mono truncate">{compressLog}</p>}
          </div>
        )}

        {/* ── Search + Filters ── */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input placeholder="Search files…" value={search} onChange={(e: any) => setSearch(e.target.value)} className="pl-8 h-9 text-xs bg-card border-border/40" />
          </div>
          <div className="flex gap-1.5">
            <Select value={filterSize} onValueChange={setFilterSize}>
              <SelectTrigger className="w-auto min-w-[90px] text-[11px] h-9 px-2.5 bg-card border-border/40"><SelectValue placeholder="Size" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sizes</SelectItem>
                <SelectItem value="small">&lt;100 KB</SelectItem>
                <SelectItem value="medium">100–500 KB</SelectItem>
                <SelectItem value="large">&gt;500 KB</SelectItem>
              </SelectContent>
            </Select>
            <Select value={`${sortBy}-${sortDir}`} onValueChange={(v: string) => { const [s, d] = v.split("-"); setSortBy(s as any); setSortDir(d as any); }}>
              <SelectTrigger className="w-auto min-w-[120px] text-[11px] h-9 px-2.5 bg-card border-border/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Newest first</SelectItem>
                <SelectItem value="date-asc">Oldest first</SelectItem>
                <SelectItem value="size-desc">Largest first</SelectItem>
                <SelectItem value="size-asc">Smallest first</SelectItem>
                <SelectItem value="name-asc">A → Z</SelectItem>
                <SelectItem value="name-desc">Z → A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredAndSorted.length > 0 && selected.size === 0 && (
          <div className="flex items-center gap-2 px-1">
            <Checkbox checked={false} onCheckedChange={toggleAll} className="scale-90" />
            <span className="text-[11px] text-muted-foreground">Select all ({filteredAndSorted.length})</span>
          </div>
        )}

        {/* ── File grid / list ── */}
        {filteredAndSorted.length === 0 ? (
          <div
            className="bg-card rounded-2xl border-2 border-dashed border-border/50 py-20 text-center cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <ImageOff className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm font-medium text-muted-foreground">No files found</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              {filterCategory !== "all" ? `No ${CATEGORY_META[filterCategory].label.toLowerCase()} files` : "Drag & drop or click to upload"}
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {filteredAndSorted.map((f, idx) => {
              const isSelected = selected.has(f.id);
              const catMeta = CATEGORY_META[f.category];
              const CatIcon = catMeta.icon;
              const alt = altResults[f.id] || f.altText;
              const isGenAlt = generatingAlt.has(f.id);

              return (
                <div
                  key={f.id}
                  className={`group relative rounded-xl overflow-hidden border-2 transition-all ${
                    isSelected ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-border"
                  }`}
                >
                  {/* Image — click opens lightbox */}
                  <div
                    className="aspect-square bg-muted cursor-zoom-in"
                    onClick={() => setLightboxIdx(idx)}
                  >
                    <img src={f.url} alt={alt || f.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                    {/* Top: select checkbox + view + copy + delete */}
                    <div className="flex items-center justify-between">
                      <div onClick={e => { e.stopPropagation(); toggleOne(f.id); }} className="cursor-pointer">
                        <Checkbox checked={isSelected} className="bg-white/80 border-white/50 data-[state=checked]:bg-primary" />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); setLightboxIdx(idx); }}
                          className="p-1.5 rounded-lg bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors"
                          title="View"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); copyUrl(f); }}
                          className="p-1.5 rounded-lg bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors"
                          title="Copy URL"
                        >
                          {copiedId === f.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(f); }}
                          className="p-1.5 rounded-lg bg-black/40 text-white/80 hover:text-red-400 hover:bg-black/60 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom: name + size + alt gen */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-white font-medium truncate">{f.name}</p>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] text-white/60">{formatFileSize(f.metadata?.size ?? 0)}</span>
                        <button
                          onClick={e => { e.stopPropagation(); generateAlt([f.id]); }}
                          disabled={isGenAlt}
                          className="flex items-center gap-0.5 text-[9px] text-amber-300 hover:text-amber-200 font-medium"
                          title="Generate alt text"
                        >
                          {isGenAlt ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                          Alt
                        </button>
                      </div>
                      {alt && (
                        <div className="flex items-start gap-1">
                          <p className="text-[9px] text-white/50 italic leading-tight flex-1 line-clamp-2">{alt}</p>
                          <button
                            onClick={e => { e.stopPropagation(); copyAlt(f.id, alt); }}
                            className="shrink-0 text-white/50 hover:text-white"
                          >
                            {copiedAlt === f.id ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Static badges */}
                  <div className="absolute bottom-1.5 left-1.5 flex gap-1 group-hover:opacity-0 transition-opacity">
                    <Badge variant="secondary" className="text-[8px] h-4 px-1.5 bg-black/50 text-white border-0 backdrop-blur-sm">
                      <CatIcon className="w-2.5 h-2.5 mr-0.5" />
                      {f.usageCount > 0 ? `${f.usageCount}×` : "0×"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // ── List view ──
          <div className="bg-card rounded-xl border border-border/40 divide-y divide-border/30">
            {filteredAndSorted.map((f, idx) => {
              const ext = f.name.split(".").pop()?.toUpperCase() || "FILE";
              const catMeta = CATEGORY_META[f.category];
              const CatIcon = catMeta.icon;
              const alt = altResults[f.id] || f.altText;
              const isGenAlt = generatingAlt.has(f.id);

              return (
                <div
                  key={f.id}
                  className={`flex items-center gap-3 p-3 transition-colors ${selected.has(f.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}
                >
                  <Checkbox checked={selected.has(f.id)} onCheckedChange={() => toggleOne(f.id)} className="scale-90 shrink-0" />
                  {/* Thumbnail — click opens lightbox */}
                  <div
                    className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0 cursor-zoom-in"
                    onClick={() => setLightboxIdx(idx)}
                  >
                    <img src={f.url} alt={alt || f.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{f.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">{ext}</span>
                      <span className="text-[9px] text-muted-foreground">{formatFileSize(f.metadata?.size ?? 0)}</span>
                      <span className={`text-[9px] flex items-center gap-0.5 ${catMeta.color}`}>
                        <CatIcon className="w-2.5 h-2.5" />{catMeta.label}
                      </span>
                    </div>
                    {alt && (
                      <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">{alt}</p>
                    )}
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 min-w-[80px]">
                    <Badge
                      variant={f.usageCount > 0 ? "default" : "secondary"}
                      className={`text-[9px] h-4 px-1.5 ${
                        f.usageCount > 0
                          ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                      }`}
                    >
                      {f.usageCount > 0 ? `${f.usageCount}× used` : "Unused"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setLightboxIdx(idx)} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors" title="View">
                      <Eye className="w-3 h-3" />
                    </button>
                    <button onClick={() => generateAlt([f.id])} disabled={isGenAlt} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-amber-500 hover:bg-muted transition-colors" title="Generate alt text">
                      {isGenAlt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    </button>
                    {alt && (
                      <button onClick={() => copyAlt(f.id, alt)} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors" title="Copy alt text">
                        {copiedAlt === f.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                    <button onClick={() => copyUrl(f)} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors" title="Copy URL">
                      {copiedId === f.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button onClick={() => handleDelete(f)} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

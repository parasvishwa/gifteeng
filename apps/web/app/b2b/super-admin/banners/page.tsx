"use client";

/**
 * Hero Banners — admin page.
 *
 * Up to 10 image-only banners per placement. Each banner is a 3:1 image
 * (1500×500 recommended) with a tap-target URL. The image IS the entire
 * banner — no app-rendered text or CTA. Same image renders identically
 * on web HeroSlider and Flutter home carousel.
 */

import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon, Plus, Trash2, Upload, Save, X, Eye,
  Power, MoveUp, MoveDown, Link2, Calendar, Smartphone, Globe,
} from "lucide-react";
import { adminGet, adminPost, adminPatch, adminUploadFile } from "@/lib/admin-api";

const MAX_BANNERS = 10;
const REC_WIDTH   = 1500;
const REC_HEIGHT  = 500;
const REC_RATIO   = REC_WIDTH / REC_HEIGHT; // 3.0
const RATIO_TOLERANCE = 0.15;               // ±15% lenient
const MAX_FILE_KB = 500;                    // soft warning threshold

interface Banner {
  id:        string;
  imageUrl:  string;
  linkUrl:   string;
  placement: string;
  altText:   string | null;
  startsAt:  string | null;
  endsAt:    string | null;
  sortOrder: number;
  isActive:  boolean;
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEdit]    = useState<Banner | "new" | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const data = await adminGet<Banner[]>("/admin/banners?placement=home", []);
    setBanners(Array.isArray(data) ? data.sort((a, b) => a.sortOrder - b.sortOrder) : []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const move = async (id: string, dir: -1 | 1) => {
    const idx = banners.findIndex((b) => b.id === id);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= banners.length) return;
    const reordered = [...banners];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx]!, reordered[idx]!];
    setBanners(reordered.map((b, i) => ({ ...b, sortOrder: i })));
    await adminPatch("/admin/banners/reorder", {
      placement: "home",
      ids: reordered.map((b) => b.id),
    }, {});
  };

  const toggleActive = async (b: Banner) => {
    await adminPatch(`/admin/banners/${b.id}`, { isActive: !b.isActive }, {});
    fetchAll();
  };

  const remove = async (b: Banner) => {
    if (!confirm("Delete this banner? This cannot be undone.")) return;
    await fetch(`${typeof window !== "undefined" ? window.location.origin : ""}/api/admin/banners/${b.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("gifteeng.b2b.token") ?? ""}` },
    });
    fetchAll();
  };

  const slotsLeft = MAX_BANNERS - banners.length;

  return (
    <div className="container max-w-6xl mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-[#EF3752]" />
            Hero Banners
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Image-only home page carousel · same image on web &amp; Flutter
          </p>
        </div>
        <button
          onClick={() => setEdit("new")}
          disabled={slotsLeft <= 0}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-[#EF3752] text-white disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Banner ({banners.length}/{MAX_BANNERS})
        </button>
      </div>

      {/* Spec strip */}
      <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Image spec:</strong> {REC_WIDTH} × {REC_HEIGHT} px (3:1 aspect) · WebP or JPG · ≤{MAX_FILE_KB} KB</p>
        <p><strong className="text-foreground">Design rule:</strong> bake all copy + CTA inside the image. The app does NOT add any title/subtitle/button on top.</p>
        <p><strong className="text-foreground">Safe zone:</strong> keep important text/CTA within the central 1200×500 band — outer edges may crop on some screens.</p>
      </div>

      {/* Empty state */}
      {!loading && banners.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center text-muted-foreground">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-bold mb-1">No banners yet</p>
          <p className="text-xs mb-5">Upload your first banner to start showing it on the home page.</p>
          <button onClick={() => setEdit("new")}
            className="px-4 py-2 rounded-lg bg-[#EF3752] text-white text-sm font-bold inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Upload first banner
          </button>
        </div>
      )}

      {/* Banner grid */}
      {!loading && banners.length > 0 && (
        <div className="space-y-3">
          {banners.map((b, i) => (
            <BannerRow
              key={b.id}
              banner={b}
              index={i}
              total={banners.length}
              onMove={move}
              onEdit={() => setEdit(b)}
              onToggle={() => toggleActive(b)}
              onDelete={() => remove(b)}
            />
          ))}
        </div>
      )}

      {/* Live preview tile */}
      {!loading && banners.filter((b) => b.isActive).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Live preview — both surfaces share the same image
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Globe className="w-3 h-3" /> Web — desktop
              </p>
              <div className="rounded-lg overflow-hidden border border-border" style={{ aspectRatio: "3 / 1" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banners.find((b) => b.isActive)?.imageUrl} alt=""
                     className="w-full h-full object-cover" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Smartphone className="w-3 h-3" /> Flutter app
              </p>
              <div className="max-w-[280px] rounded-2xl overflow-hidden border border-border mx-auto" style={{ aspectRatio: "3 / 1" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banners.find((b) => b.isActive)?.imageUrl} alt=""
                     className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <BannerEditor
          banner={editing === "new" ? null : editing}
          onClose={() => setEdit(null)}
          onSaved={() => { setEdit(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function BannerRow({ banner, index, total, onMove, onEdit, onToggle, onDelete }: {
  banner: Banner; index: number; total: number;
  onMove: (id: string, dir: -1 | 1) => void;
  onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-card p-3 flex items-center gap-3 ${
      banner.isActive ? "border-border" : "border-border/40 opacity-60"
    }`}>
      {/* Order controls */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button onClick={() => onMove(banner.id, -1)} disabled={index === 0}
          className="w-6 h-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">
          <MoveUp className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-muted-foreground text-center font-bold">#{index + 1}</span>
        <button onClick={() => onMove(banner.id, 1)} disabled={index === total - 1}
          className="w-6 h-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center">
          <MoveDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Thumbnail */}
      <div className="shrink-0 w-32 rounded-md overflow-hidden border border-border bg-muted" style={{ aspectRatio: "3 / 1" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={banner.imageUrl} alt={banner.altText ?? ""} className="w-full h-full object-cover" />
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0 text-xs space-y-0.5">
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Link2 className="w-3 h-3" />
          <span className="truncate font-mono">{banner.linkUrl}</span>
        </p>
        {(banner.startsAt || banner.endsAt) && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>
              {banner.startsAt ? `from ${new Date(banner.startsAt).toLocaleDateString()}` : "now"}
              {" → "}
              {banner.endsAt   ? `until ${new Date(banner.endsAt).toLocaleDateString()}` : "forever"}
            </span>
          </p>
        )}
        {banner.altText && (
          <p className="text-muted-foreground italic truncate">"{banner.altText}"</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggle}
          className={`w-8 h-8 rounded flex items-center justify-center ${
            banner.isActive
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-muted text-muted-foreground"
          }`}
          title={banner.isActive ? "Active" : "Disabled"}>
          <Power className="w-3.5 h-3.5" />
        </button>
        <button onClick={onEdit}
          className="w-8 h-8 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center">
          <Upload className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete}
          className="w-8 h-8 rounded hover:bg-red-500/15 text-red-600 flex items-center justify-center">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function BannerEditor({ banner, onClose, onSaved }: {
  banner: Banner | null; onClose: () => void; onSaved: () => void;
}) {
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "");
  const [linkUrl, setLinkUrl]   = useState(banner?.linkUrl ?? "/shop");
  const [altText, setAltText]   = useState(banner?.altText ?? "");
  const [startsAt, setStartsAt] = useState(banner?.startsAt?.slice(0, 10) ?? "");
  const [endsAt, setEndsAt]     = useState(banner?.endsAt?.slice(0, 10) ?? "");
  const [isActive, setActive]   = useState(banner?.isActive ?? true);
  const [uploading, setUploading] = useState(false);
  const [warn, setWarn]         = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setWarn(null);
    setUploading(true);
    try {
      // Validate dimensions + file size BEFORE upload (load via HTMLImageElement)
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => { resolve({ w: img.width, h: img.height }); URL.revokeObjectURL(url); };
        img.onerror = () => { reject(new Error("invalid image")); URL.revokeObjectURL(url); };
        img.src = url;
      });
      const ratio = dims.w / dims.h;
      const ratioOff = Math.abs(ratio - REC_RATIO) / REC_RATIO;
      const warnings: string[] = [];
      if (ratioOff > RATIO_TOLERANCE) {
        warnings.push(`Aspect ratio is ${ratio.toFixed(2)}:1 — recommended 3:1 (e.g. ${REC_WIDTH}×${REC_HEIGHT}). It will still upload but may crop unevenly.`);
      }
      if (file.size > MAX_FILE_KB * 1024) {
        warnings.push(`File is ${Math.round(file.size / 1024)} KB — recommended ≤${MAX_FILE_KB} KB for fast load.`);
      }
      if (warnings.length) setWarn(warnings.join(" "));

      const url = await adminUploadFile(file);
      setImageUrl(url);
    } catch (e) {
      setWarn((e as Error).message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!imageUrl) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      imageUrl,
      linkUrl: linkUrl.trim() || "/shop",
      placement: "home",
      altText:   altText.trim() || null,
      startsAt:  startsAt ? new Date(startsAt).toISOString() : null,
      endsAt:    endsAt   ? new Date(endsAt).toISOString()   : null,
      isActive,
    };
    if (banner) {
      await adminPatch(`/admin/banners/${banner.id}`, payload, {});
    } else {
      await adminPost("/admin/banners", payload, {});
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-bold">{banner ? "Edit banner" : "Upload new banner"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Upload zone */}
          <div>
            <label className="block text-xs font-bold mb-1.5">Banner image *</label>
            <div className="rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden" style={{ aspectRatio: "3 / 1" }}>
              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-full relative group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                    <Upload className="w-4 h-4 mr-1" /> Replace image
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-full flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Upload className="w-8 h-8 mb-2" />
                  <span className="text-sm font-bold">{uploading ? "Uploading…" : "Click to upload"}</span>
                  <span className="text-[11px] mt-1">{REC_WIDTH} × {REC_HEIGHT} · 3:1 · ≤{MAX_FILE_KB} KB</span>
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            {warn && <p className="mt-1.5 text-[11px] text-amber-600">{warn}</p>}
          </div>

          {/* Link URL */}
          <div>
            <label className="block text-xs font-bold mb-1.5">Tap target URL *</label>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="/shop or /shop?cat=birthday or https://…"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Use a relative path for in-app navigation, or an absolute URL to open in browser.
            </p>
          </div>

          {/* Alt text */}
          <div>
            <label className="block text-xs font-bold mb-1.5">Alt text (accessibility)</label>
            <input
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="e.g. Valentine's Day gifts up to 50% off"
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm"
            />
          </div>

          {/* Time window */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5">Starts (optional)</label>
              <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">Ends (optional)</label>
              <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
            <span>Active (off = saved but hidden)</span>
          </label>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-bold hover:bg-muted">
              Cancel
            </button>
            <button onClick={save} disabled={!imageUrl || saving || uploading}
              className="flex-[1.5] py-2.5 rounded-lg bg-[#EF3752] text-white text-sm font-black disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? "Saving…" : <><Save className="w-4 h-4" /> {banner ? "Save changes" : "Add banner"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

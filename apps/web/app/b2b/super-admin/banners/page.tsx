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
import { createPortal } from "react-dom";
import {
  Image as ImageIcon, Plus, Trash2, Upload, Save, X, Eye,
  Power, MoveUp, MoveDown, Link2, Calendar, Smartphone, Globe,
  Pencil, Type,
} from "lucide-react";
import { adminGet, adminPost, adminPatch, adminUploadFile, adminToast } from "@/lib/admin-api";

const MAX_BANNERS = 10;
const REC_WIDTH   = 1500;
const REC_HEIGHT  = 500;
const REC_RATIO   = REC_WIDTH / REC_HEIGHT; // 3.0
const RATIO_TOLERANCE = 0.15;               // ±15% lenient
const MAX_FILE_KB = 500;                    // soft warning threshold

interface Banner {
  id:             string;
  imageUrl:       string;
  mobileImageUrl?: string | null;
  linkUrl:        string;
  placement: string;
  altText:   string | null;
  startsAt:  string | null;
  endsAt:    string | null;
  sortOrder: number;
  isActive:  boolean;
  // Per-banner text overlay (left half of the hero composition).
  tagline?:       string | null;
  heading?:       string | null;
  headingAccent?: string | null;
  subtitle?:      string | null;
  button1Text?:   string | null;
  button1Link?:   string | null;
  button2Text?:   string | null;
  button2Link?:   string | null;
  // Per-banner color overrides (left-half bg, text, accent, button).
  textBgColor?:   string | null;
  textColor?:     string | null;
  accentColor?:   string | null;
  buttonColor?:   string | null;
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
        <p><strong className="text-foreground">Layout:</strong> Each banner is a side-by-side hero — text overlay on the left (~50%), image on the right (~50%). Same composition on web and Flutter.</p>
        <p><strong className="text-foreground">Image spec:</strong> {REC_WIDTH} × {REC_HEIGHT} px (3:1) for legacy image-only banners. For text-overlay banners aim for a clean RIGHT-HALF subject — image is cropped to fill the right side. WebP or JPG · ≤{MAX_FILE_KB} KB</p>
        <p><strong className="text-foreground">Text fallback:</strong> Leave all text fields blank to render the legacy image-only banner (image fills 100% width, no overlay).</p>
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
  // A banner is in "text overlay" mode the moment any one of the per-slide
  // text fields is filled. Otherwise the row preview shows just the image
  // (legacy full-bleed mode).
  const hasTextOverlay = Boolean(
    (banner.tagline ?? "").trim() ||
    (banner.heading ?? "").trim() ||
    (banner.headingAccent ?? "").trim() ||
    (banner.subtitle ?? "").trim() ||
    (banner.button1Text ?? "").trim(),
  );

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

      {/* Composed thumbnail — when text overlay is set, render the same
          left-text / right-image split the public hero shows. Otherwise
          render full-bleed image. Width bumped from w-32 to w-56 so the
          two halves are actually readable. */}
      <div
        className="shrink-0 w-56 rounded-md overflow-hidden border border-border bg-muted"
        style={{ aspectRatio: "3 / 1" }}
      >
        {hasTextOverlay ? (
          <div className="grid grid-cols-2 h-full">
            <div
              className="flex flex-col justify-center px-2 py-1 overflow-hidden"
              style={{ background: banner.textBgColor || "linear-gradient(135deg,#fff5f7,#ffd6e0)" }}
            >
              {banner.tagline && (
                <p className="text-[6px] font-black uppercase tracking-[0.18em] leading-none mb-0.5 truncate" style={{ color: banner.accentColor || "#EF3752", opacity: 0.85 }}>
                  {banner.tagline}
                </p>
              )}
              {(banner.heading || banner.headingAccent) && (
                <p className="text-[8px] font-black leading-[1.05] line-clamp-2" style={{ color: banner.textColor || "#1A1A2E" }}>
                  {banner.heading}
                  {banner.headingAccent && (
                    <>{" "}<span style={{ color: banner.accentColor || "#EF3752" }}>{banner.headingAccent}</span></>
                  )}
                </p>
              )}
              {banner.button1Text && (
                <span className="inline-block mt-0.5 px-1 py-[1px] rounded text-[6px] font-bold text-white self-start truncate max-w-full" style={{ backgroundColor: banner.buttonColor || "#EF3752" }}>
                  {banner.button1Text}
                </span>
              )}
            </div>
            <div style={{ background: banner.textBgColor || "linear-gradient(135deg,#fff5f7,#ffd6e0)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={banner.imageUrl} alt={banner.altText ?? ""} className="w-full h-full object-contain" />
            </div>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={banner.imageUrl} alt={banner.altText ?? ""} className="w-full h-full object-cover" />
        )}
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0 text-xs space-y-0.5">
        {/* Text overlay summary first — most important info at a glance. */}
        {hasTextOverlay ? (
          <p className="flex items-center gap-1.5 text-foreground/90 font-semibold truncate">
            <Type className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">
              {banner.heading}
              {banner.headingAccent ? ` · ${banner.headingAccent}` : ""}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-amber-600/80 font-medium text-[11px]">
            <ImageIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">Image-only banner — add text in Edit to overlay copy + CTA</span>
          </p>
        )}
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
      </div>

      {/* Actions — Power (toggle), Pencil (edit modal), Trash (delete) */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onToggle}
          className={`w-8 h-8 rounded flex items-center justify-center ${
            banner.isActive
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-muted text-muted-foreground"
          }`}
          title={banner.isActive ? "Active — click to hide" : "Hidden — click to show"}>
          <Power className="w-3.5 h-3.5" />
        </button>
        <button onClick={onEdit}
          className="w-8 h-8 rounded hover:bg-primary/10 text-primary flex items-center justify-center"
          title="Edit banner (image, text overlay, buttons, schedule)">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete}
          className="w-8 h-8 rounded hover:bg-red-500/15 text-red-600 flex items-center justify-center"
          title="Delete banner">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function BannerEditor({ banner, onClose, onSaved }: {
  banner: Banner | null; onClose: () => void; onSaved: () => void;
}) {
  const [imageUrl, setImageUrl]           = useState(banner?.imageUrl ?? "");
  const [mobileImageUrl, setMobileImageUrl] = useState(banner?.mobileImageUrl ?? "");
  const [linkUrl, setLinkUrl]             = useState(banner?.linkUrl ?? "/shop");
  const [altText, setAltText]   = useState(banner?.altText ?? "");
  const [startsAt, setStartsAt] = useState(banner?.startsAt?.slice(0, 10) ?? "");
  const [endsAt, setEndsAt]     = useState(banner?.endsAt?.slice(0, 10) ?? "");
  const [isActive, setActive]   = useState(banner?.isActive ?? true);
  // Per-banner text overlay
  const [tagline,       setTagline]       = useState(banner?.tagline       ?? "");
  const [heading,       setHeading]       = useState(banner?.heading       ?? "");
  const [headingAccent, setHeadingAccent] = useState(banner?.headingAccent ?? "");
  const [subtitle,      setSubtitle]      = useState(banner?.subtitle      ?? "");
  const [button1Text,   setButton1Text]   = useState(banner?.button1Text   ?? "");
  const [button1Link,   setButton1Link]   = useState(banner?.button1Link   ?? "");
  const [button2Text,   setButton2Text]   = useState(banner?.button2Text   ?? "");
  const [button2Link,   setButton2Link]   = useState(banner?.button2Link   ?? "");
  // Per-banner color overrides. Defaults are sensible brand values that
  // match what the public HeroSlider renders when these are null.
  const [textBgColor,   setTextBgColor]   = useState(banner?.textBgColor   ?? "#fff5f7");
  const [textColor,     setTextColor]     = useState(banner?.textColor     ?? "#1A1A2E");
  const [accentColor,   setAccentColor]   = useState(banner?.accentColor   ?? "#EF3752");
  const [buttonColor,   setButtonColor]   = useState(banner?.buttonColor   ?? "#EF3752");
  const [uploading, setUploading]           = useState(false);
  const [mobileUploading, setMobileUploading] = useState(false);
  const [warn, setWarn]                     = useState<string | null>(null);
  const [mobileWarn, setMobileWarn]         = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const fileRef       = useRef<HTMLInputElement>(null);
  const mobileFileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setWarn(null);
    setUploading(true);
    try {
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

  const onMobileFile = async (file: File) => {
    setMobileWarn(null);
    setMobileUploading(true);
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => { resolve({ w: img.width, h: img.height }); URL.revokeObjectURL(url); };
        img.onerror = () => { reject(new Error("invalid image")); URL.revokeObjectURL(url); };
        img.src = url;
      });
      // Recommended mobile: ~9:20 portrait or at least portrait/square
      const ratio = dims.w / dims.h;
      const warnings: string[] = [];
      if (ratio > 1.2) {
        warnings.push(`Aspect ratio is ${ratio.toFixed(2)}:1 — for mobile/app use portrait (e.g. 750×1334 or 1:1). Wide images will be cropped on phones.`);
      }
      if (file.size > MAX_FILE_KB * 1024) {
        warnings.push(`File is ${Math.round(file.size / 1024)} KB — recommended ≤${MAX_FILE_KB} KB for fast load.`);
      }
      if (warnings.length) setMobileWarn(warnings.join(" "));
      const url = await adminUploadFile(file);
      setMobileImageUrl(url);
    } catch (e) {
      setMobileWarn((e as Error).message ?? "Upload failed");
    } finally {
      setMobileUploading(false);
    }
  };

  // Lock the body scroll while the modal is open. Combined with the portal
  // below, this prevents the admin sidebar / sticky header from interfering
  // with the modal's stacking context — that combo was the reason the
  // "edit banner" action felt broken on some admin layouts.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const save = async () => {
    if (!imageUrl) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      imageUrl,
      mobileImageUrl: mobileImageUrl.trim() || null,
      linkUrl: linkUrl.trim() || "/shop",
      placement: "home",
      altText:   altText.trim() || null,
      startsAt:  startsAt ? new Date(startsAt).toISOString() : null,
      endsAt:    endsAt   ? new Date(endsAt).toISOString()   : null,
      isActive,
      // Trim each text field and coerce empty strings to null so the API
      // (and the public slider's fallback logic) can cleanly check "is any
      // text overlay present" via `heading || subtitle || …`.
      tagline:       tagline.trim()       || null,
      heading:       heading.trim()       || null,
      headingAccent: headingAccent.trim() || null,
      subtitle:      subtitle.trim()      || null,
      button1Text:   button1Text.trim()   || null,
      button1Link:   button1Link.trim()   || null,
      button2Text:   button2Text.trim()   || null,
      button2Link:   button2Link.trim()   || null,
      // Persist color overrides only when they differ from "no override" —
      // store the value either way; null means "use brand default at render".
      textBgColor:   textBgColor.trim()   || null,
      textColor:     textColor.trim()     || null,
      accentColor:   accentColor.trim()   || null,
      buttonColor:   buttonColor.trim()   || null,
    };
    // Use a sentinel fallback so we can detect a silent network failure —
    // previously `{}` was used as fallback, which is truthy and made
    // save() always look successful even when the PATCH 401'd or 500'd.
    const SENTINEL = { __ok: false } as const;
    try {
      const result = banner
        ? await adminPatch(`/admin/banners/${banner.id}`, payload, SENTINEL)
        : await adminPost(`/admin/banners`, payload, SENTINEL);
      if ((result as typeof SENTINEL).__ok === false) {
        adminToast.error(banner ? "Couldn't update banner — check network" : "Couldn't create banner — check network");
      } else {
        adminToast.success(banner ? "Banner updated" : "Banner created");
        onSaved();
      }
    } catch (e) {
      adminToast.error((e as Error)?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Portal to <body> so the modal escapes any ancestor stacking context
  // created by the admin layout (sticky header with backdrop-blur-md,
  // sidebar transforms, etc.) — same trap that was hiding the product
  // detail lightbox before we portaled it in session 99.
  const modalContent = (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 p-4" style={{ zIndex: 2147483000 }}>
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

          {/* Mobile / App banner upload */}
          <div>
            <label className="block text-xs font-bold mb-1.5 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-primary" />
              Mobile &amp; App banner
              <span className="text-muted-foreground font-normal ml-1">(optional — portrait, 750×1334 recommended)</span>
            </label>
            <p className="text-[10px] text-muted-foreground mb-2">
              Used on phones and in the Flutter app instead of the desktop image. Falls back to desktop image if not uploaded.
            </p>
            <div
              className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] overflow-hidden"
              style={{ aspectRatio: "9 / 16", maxHeight: 240, maxWidth: 135 }}
            >
              {mobileImageUrl ? (
                <button
                  type="button"
                  onClick={() => mobileFileRef.current?.click()}
                  className="w-full h-full relative group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mobileImageUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                    <Upload className="w-3.5 h-3.5 mr-1" /> Replace
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => mobileFileRef.current?.click()}
                  disabled={mobileUploading}
                  className="w-full h-full flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors gap-1 p-2"
                >
                  <Smartphone className="w-6 h-6" />
                  <span className="text-[10px] font-bold text-center">{mobileUploading ? "Uploading…" : "Upload mobile image"}</span>
                  <span className="text-[9px] text-center opacity-70">9:16 · 750×1334</span>
                </button>
              )}
            </div>
            {mobileImageUrl && (
              <button
                type="button"
                onClick={() => setMobileImageUrl("")}
                className="mt-1.5 text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove mobile image
              </button>
            )}
            <input
              ref={mobileFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onMobileFile(f);
                e.target.value = "";
              }}
            />
            {mobileWarn && <p className="mt-1.5 text-[11px] text-amber-600">{mobileWarn}</p>}
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

          {/* ── Text overlay (left half of hero) ───────────────────────────
              Leave EVERYTHING below blank to render this slide as a legacy
              full-bleed image with no text on top. Fill any field and the
              slide automatically becomes a side-by-side text+image hero. */}
          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-primary">
                Text overlay (optional)
              </p>
              <p className="text-[10px] text-muted-foreground">
                Leave blank for image-only banner
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Tagline</label>
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. MADE WITH LOVE"
                maxLength={80}
                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Heading line 1</label>
                <input
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder="Personalised Gifts That Create"
                  maxLength={160}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Heading line 2 (accent)</label>
                <input
                  value={headingAccent}
                  onChange={(e) => setHeadingAccent(e.target.value)}
                  placeholder="Forever Memories"
                  maxLength={80}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Subtitle</label>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Customized with love. Delivered with happiness."
                maxLength={240}
                className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Button 1 — text</label>
                <input
                  value={button1Text}
                  onChange={(e) => setButton1Text(e.target.value)}
                  placeholder="Shop Bestsellers"
                  maxLength={40}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Button 1 — link</label>
                <input
                  value={button1Link}
                  onChange={(e) => setButton1Link(e.target.value)}
                  placeholder="/shop"
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Button 2 — text</label>
                <input
                  value={button2Text}
                  onChange={(e) => setButton2Text(e.target.value)}
                  placeholder="How It Works"
                  maxLength={40}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">Button 2 — link</label>
                <input
                  value={button2Link}
                  onChange={(e) => setButton2Link(e.target.value)}
                  placeholder="#how-it-works"
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm font-mono"
                />
              </div>
            </div>

            {/* Live preview — composed exactly like the public hero. Uses
                the configured per-banner colors AND object-contain for the
                image so what you see here matches the live render. */}
            {(tagline || heading || headingAccent || subtitle || button1Text) && imageUrl && (
              <div className="rounded-lg overflow-hidden border border-border" style={{ aspectRatio: "5 / 2" }}>
                <div className="grid grid-cols-2 h-full">
                  <div className="flex flex-col justify-center px-4 py-3" style={{ background: textBgColor }}>
                    {tagline && (
                      <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.22em] mb-1" style={{ color: accentColor, opacity: 0.85 }}>{tagline}</p>
                    )}
                    {(heading || headingAccent) && (
                      <p className="font-display font-black leading-[1.05] text-sm md:text-base" style={{ color: textColor }}>
                        {heading}
                        {headingAccent && (<><br /><span style={{ color: accentColor }}>{headingAccent}</span></>)}
                      </p>
                    )}
                    {subtitle && (
                      <p className="text-[9px] md:text-[10px] mt-1 line-clamp-2" style={{ color: textColor, opacity: 0.65 }}>{subtitle}</p>
                    )}
                    {button1Text && (
                      <span className="inline-block mt-1.5 px-2 py-0.5 rounded text-[8px] font-bold text-white self-start" style={{ backgroundColor: buttonColor }}>{button1Text}</span>
                    )}
                  </div>
                  <div style={{ background: textBgColor }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="" className="w-full h-full object-contain" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Banner colors (admin-customizable) ──────────────────────── */}
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground/80">
                Banner colors
              </p>
              <p className="text-[10px] text-muted-foreground">
                Override the cream/red defaults
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ColorPickerField
                label="Left-half background"
                value={textBgColor}
                onChange={setTextBgColor}
                hint="Solid color or full gradient CSS"
                allowGradient
              />
              <ColorPickerField
                label="Heading text"
                value={textColor}
                onChange={setTextColor}
              />
              <ColorPickerField
                label="Accent (highlight + tagline)"
                value={accentColor}
                onChange={setAccentColor}
              />
              <ColorPickerField
                label="Primary button"
                value={buttonColor}
                onChange={setButtonColor}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setTextBgColor("#fff5f7");
                  setTextColor("#1A1A2E");
                  setAccentColor("#EF3752");
                  setButtonColor("#EF3752");
                }}
                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground underline"
              >
                Reset to brand defaults
              </button>
            </div>
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
  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}

// ── Color picker field ────────────────────────────────────────────────────
// Native <input type="color"> + a text input for the hex / gradient value.
// `allowGradient` lets the admin paste a CSS gradient string (e.g.
// "linear-gradient(135deg,#fff5f7,#ffd6e0)") for the left-half background.
function ColorPickerField({
  label, value, onChange, hint, allowGradient = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  allowGradient?: boolean;
}) {
  // The HTML color input only understands hex like "#ff0000" — when the
  // value is a gradient string, we still want to render a swatch (preview)
  // but the picker itself shows the first color (or a neutral fallback).
  const isGradient = value.includes("gradient");
  const pickerColor = isGradient ? "#ffffff" : (value || "#ffffff");

  return (
    <div>
      <label className="block text-[10px] font-bold mb-1 text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        {/* Visual swatch — shows solid color OR the gradient itself */}
        <div
          className="w-9 h-9 rounded-md border border-border shrink-0 relative overflow-hidden"
          style={{ background: value || "transparent" }}
        >
          {/* Hidden native picker layered on top — clicking the swatch opens it */}
          <input
            type="color"
            value={pickerColor}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            title={isGradient ? "Picker resets to solid — paste in the text input for gradient" : label}
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={allowGradient ? "#hex or linear-gradient(...)" : "#hex"}
          className="flex-1 px-2 py-1.5 rounded-md bg-card border border-border text-[11px] font-mono"
        />
      </div>
      {hint && <p className="mt-1 text-[9px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

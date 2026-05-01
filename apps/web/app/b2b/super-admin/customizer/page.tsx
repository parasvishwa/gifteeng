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

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, Save, X, Layers,
  Package, Search, ChevronRight, CheckCircle2,
  AlertCircle, Plus,
  LayoutTemplate, Upload, Type as TypeIcon,
  Trash2, FolderSearch,
} from "lucide-react";
import {
  Button, Input, Label, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@gifteeng/ui";
import { getApiBase, authHeaders } from "@/lib/admin-api";

// ── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) return null;
    return data as T;
  } catch { return null; }
}

// ── Types ────────────────────────────────────────────────────────────────────

/* Full-Customiser (canvas) extras ------------------------------------------ */

type CanvasEditor = "full" | "simple";

type MaskShape =
  | "none"
  | "rect"
  | "rounded-rect"
  | "circle"
  | "oval"
  | "heart"
  | "hexagon"
  | "arch"
  | "star"
  | "diamond"
  | "pentagon"
  | "custom-image";  // black silhouette PNG — black area = printable

interface PosRect { x: number; y: number; w: number; h: number; } // percent 0-100

interface MaskSlot {
  id: string;
  label: string;          // shown to customer (e.g. "Upload your photo")
  shape: MaskShape;
  maskImageUrl: string;   // only when shape === "custom-image"
  pos: PosRect;
  required: boolean;
}

type ZoneShape = "free" | "square" | "circle" | "oval" | "custom-image";

interface SimpleZone {
  id: string;
  x: number; y: number; w: number; h: number; // percent
  label: string;
  // Image-zone shape mask (image zones only)
  shape?: ZoneShape;
  // Corner radius for "free" / "square" shapes — percentage of the zone's
  // smaller dimension (0 = sharp corners, 50 = pill / fully rounded).
  // Ignored when shape is "circle" or "custom-image".
  cornerRadius?: number;
  maskImageUrl?: string;
  // Admin-curated icon / logo library for this zone. If non-empty, the
  // customer sees a picker grid BEFORE the "Upload your own" option —
  // perfect for monogram letters, flag icons, religion symbols, etc.
  allowedIcons?: Array<{ id: string; url: string; label?: string }>;
  // Text-zone palette (ignored for image zones)
  // Admin defines the allowed options — customer picks one of each.
  allowedFonts?:  string[];  // list of CSS font-family strings
  allowedColors?: string[];  // list of hex "#RRGGBB"
  defaultFontSize?: number;  // percent of zone height (20-200); default 70
  fontWeight?:    number;    // 400 | 600 | 700 — admin-fixed (no user choice)
  // ── Customiser v2 per-text-zone runtime toggles ─────────────────────────
  // When true, the customer can drag the text within the zone bounding box
  // at runtime. Position is persisted in fills.textPositions[zoneId].
  customerCanDrag?: boolean;
  // When true, the customer sees a font-size slider when editing the text
  // and can scale it 30-200% of defaultFontSize. Persists into
  // fills.textStyles[zoneId].fontSizePct.
  customerCanResize?: boolean;
}

interface CanvasConfig {
  editor: CanvasEditor;
  useProductImageAsBase: boolean;
  baseImage: string;
  basePos: PosRect;
  overlayImage: string;       // "top" layer
  overlayPos: PosRect;
  masks: MaskSlot[];          // up to 3 in full mode
  limits: { maxImages: number; maxTexts: number };
  imageZones: SimpleZone[];   // simple mode
  textZones: SimpleZone[];    // simple mode
}

const DEFAULT_MASK: Omit<MaskSlot, "id"> = {
  label: "Upload your photo",
  shape: "rect",
  maskImageUrl: "",
  pos: { x: 20, y: 20, w: 60, h: 60 },
  required: false,
};

const DEFAULT_CANVAS: CanvasConfig = {
  // New default: the unified "Customiser" mode (was called "simple"). Shows
  // Base + Mask + Top + image zones + text zones in one panel. Power users
  // can switch to "full" via the Advanced toggle.
  editor: "simple",
  useProductImageAsBase: true,
  baseImage: "",
  basePos:    { x: 0,  y: 0,  w: 100, h: 100 },
  overlayImage: "",
  overlayPos: { x: 0,  y: 0,  w: 100, h: 100 },
  masks: [],
  limits: { maxImages: 3, maxTexts: 3 },
  imageZones: [],
  textZones:  [],
};

// Migrate legacy single-mask schema → multi-mask
function migrateCanvas(raw: any): CanvasConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CANVAS };
  const editor: CanvasEditor =
    raw.editor === "simple" || raw.editor === "zones" ? "simple" : "full";
  const masks: MaskSlot[] = Array.isArray(raw.masks) && raw.masks.length
    ? raw.masks.slice(0, 12).map((m: any, i: number) => ({
        id: m.id || `m${i}-${Date.now()}`,
        label: m.label ?? DEFAULT_MASK.label,
        shape: m.shape ?? "rect",
        maskImageUrl: m.maskImageUrl ?? "",
        pos: m.pos ?? DEFAULT_MASK.pos,
        required: !!m.required,
      }))
    : (raw.maskShape && raw.maskShape !== "none"
        ? [{
            id: `m-legacy-${Date.now()}`,
            label: DEFAULT_MASK.label,
            shape: raw.maskShape,
            maskImageUrl: raw.maskImageUrl ?? "",
            pos: raw.maskPos ?? DEFAULT_MASK.pos,
            required: false,
          }]
        : []);
  return {
    editor,
    useProductImageAsBase: raw.useProductImageAsBase ?? !raw.baseImage,
    baseImage: raw.baseImage ?? "",
    basePos: raw.basePos ?? DEFAULT_CANVAS.basePos,
    overlayImage: raw.overlayImage ?? "",
    overlayPos: raw.overlayPos ?? DEFAULT_CANVAS.overlayPos,
    masks,
    limits: {
      maxImages: raw.limits?.maxImages ?? 3,
      maxTexts:  raw.limits?.maxTexts  ?? 3,
    },
    imageZones: Array.isArray(raw.imageZones)
      ? raw.imageZones.map((z: any, i: number) => ({
          id: z.id || `iz${i}`,
          x: z.x ?? 10, y: z.y ?? 10, w: z.w ?? 30, h: z.h ?? 20,
          label: z.label || `Image ${i+1}`,
          shape: (z.shape as ZoneShape | undefined) ?? "free",
          cornerRadius: typeof z.cornerRadius === "number" ? z.cornerRadius : 8,
          maskImageUrl: z.maskImageUrl ?? "",
        }))
      : [],
    textZones: Array.isArray(raw.textZones)
      ? raw.textZones.map((z: any, i: number) => ({
          id: z.id || `tz${i}`,
          x: z.x ?? 10, y: z.y ?? 50, w: z.w ?? 80, h: z.h ?? 12,
          label: z.label || `Text ${i+1}`,
          allowedFonts:  Array.isArray(z.allowedFonts)  ? z.allowedFonts.filter((s: any) => typeof s === "string")  : undefined,
          allowedColors: Array.isArray(z.allowedColors) ? z.allowedColors.filter((s: any) => typeof s === "string") : undefined,
          defaultFontSize: typeof z.defaultFontSize === "number" ? z.defaultFontSize
                           : typeof z.fontSize === "number" ? z.fontSize : undefined,
          fontWeight: typeof z.fontWeight === "number" ? z.fontWeight : undefined,
          customerCanDrag:   z.customerCanDrag   === true,
          customerCanResize: z.customerCanResize === true,
        }))
      : [],
  };
}

interface CustomizerConfig {
  canvas?: CanvasConfig;
}

const DEFAULT_CONFIG: CustomizerConfig = { canvas: { ...DEFAULT_CANVAS } };

interface Product {
  id: string;
  slug?: string;
  title: string;
  isCustomizable: boolean;
  images?: { url: string }[];
  imageUrl?: string;
  metadata?: { customizer?: CustomizerConfig };
}

// ── Full Customiser panel (tabbed Base / Mask / Top + drag-resize preview) ──

const MASK_SHAPES: { id: MaskShape; label: string }[] = [
  { id: "none",         label: "None"     },
  { id: "rect",         label: "Rect"     },
  { id: "circle",       label: "Circle"   },
  { id: "rounded-rect", label: "Rounded"  },
  { id: "oval",         label: "Oval"     },
  { id: "heart",        label: "Heart"    },
  { id: "hexagon",      label: "Hexagon"  },
  { id: "arch",         label: "Arch"     },
  { id: "star",         label: "Star"     },
  { id: "diamond",      label: "Diamond"  },
  { id: "pentagon",     label: "Pentagon" },
  { id: "custom-image", label: "Custom"   },
];

async function uploadToFiles(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
  try {
    const res = await fetch(`${getApiBase()}/api/files/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.url ?? data?.path ?? "") || null;
  } catch { return null; }
}

// ── File picker modal — browse existing uploaded files ──────────────────────
type FileAsset = {
  id: string;
  path: string;
  ownerType: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};

function FilePickerDialog({
  open, onOpenChange, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (url: string) => void;
}) {
  const [items, setItems] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    fetch(`${getApiBase()}/api/files?pageSize=500`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: FileAsset[]) => {
        // images only
        const imgs = (Array.isArray(data) ? data : []).filter(a => (a.mimeType || "").startsWith("image/"));
        setItems(imgs);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? items.filter(a =>
        a.path.toLowerCase().includes(needle) ||
        (a.ownerType || "").toLowerCase().includes(needle))
    : items;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSearch className="w-4 h-4" /> Pick from Media Library
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by filename or type (product, system, ai, …)"
              className="h-9 pl-8 text-xs"
            />
          </div>
          <div className="text-[11px] text-muted-foreground shrink-0">{filtered.length} files</div>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No files found</div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {filtered.map(a => {
                const name = a.path.split("/").pop() ?? a.path;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { onPick(a.url); onOpenChange(false); }}
                    className="group relative aspect-square rounded-md border border-border/60 overflow-hidden bg-muted hover:border-primary/60 hover:ring-2 hover:ring-primary/30 transition"
                    title={`${name}\n${a.ownerType} · ${(a.sizeBytes/1024).toFixed(0)} KB`}
                  >
                    <img src={a.url} alt={name} loading="lazy" className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition">
                      {a.ownerType}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImageUploadField({ value, onChange, placeholder, label, accept, svgOnly }: {
  value: string; onChange: (v: string) => void; placeholder: string; label?: string;
  /** HTML accept string for the <input type=file>. Default "image/*". */
  accept?: string;
  /** When true, reject non-SVG uploads with an inline error. Used by the
   *  custom-mask shape uploader: PNG silhouettes don't render on the
   *  Flutter app (flutter_svg can only parse SVG), so we lock the format
   *  upfront and tell the admin why. */
  svgOnly?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [uploadError, setUploadError] = useState("");
  useEffect(() => { setImgError(false); }, [value]);
  return (
    <div>
      {label && <Label className="text-[10px] text-muted-foreground">{label}</Label>}
      <div className={`flex gap-1.5 ${label ? "mt-0.5" : ""}`}>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-[11px] flex-1" />
        <Button size="sm" variant="outline" className="h-8 px-2.5 shrink-0 gap-1" onClick={() => setPickerOpen(true)} disabled={uploading} title="Search in library">
          <FolderSearch className="w-3 h-3" />
          <span className="text-[10px]">Library</span>
        </Button>
        <Button size="sm" variant="outline" className="h-8 px-2.5 shrink-0 gap-1" onClick={() => ref.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          <span className="text-[10px]">Upload</span>
        </Button>
        <input ref={ref} type="file" accept={accept ?? "image/*"} className="hidden" onChange={async e => {
          const f = e.target.files?.[0]; if (!f) return;
          // Validate SVG-only uploads before sending to the file API. We
          // accept either the browser-reported MIME type or the .svg
          // extension because some browsers report empty type for SVG.
          if (svgOnly) {
            const isSvg = f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg");
            if (!isSvg) {
              setUploadError(`Only SVG files are accepted here (got "${f.name}"). PNG/JPEG silhouettes can't be rendered on the mobile app.`);
              e.target.value = "";
              return;
            }
          }
          setUploadError("");
          setUploading(true);
          const url = await uploadToFiles(f);
          setUploading(false);
          if (url) onChange(url);
          e.target.value = "";
        }} />
      </div>
      {uploadError && (
        <p className="mt-1 text-[10px] text-destructive font-medium">{uploadError}</p>
      )}
      {value && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {imgError ? (
            <div
              className="w-10 h-10 rounded border border-destructive/40 bg-destructive/5 flex items-center justify-center text-destructive"
              title="Image failed to load — URL may have expired. Re-upload or pick from Library."
            >
              <AlertCircle className="w-4 h-4" />
            </div>
          ) : (
            <img
              src={value}
              alt=""
              onError={() => setImgError(true)}
              className="w-10 h-10 rounded border border-border/40 object-cover bg-muted"
            />
          )}
          {imgError && (
            <span className="text-[10px] text-destructive">Expired — re-upload or pick from Library</span>
          )}
          <button onClick={() => onChange("")} className="text-[10px] text-destructive hover:underline">Remove</button>
        </div>
      )}
      <FilePickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={onChange} />
    </div>
  );
}

// Render a mask shape as SVG path (for outline & clip)
function shapePath(shape: MaskShape, x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2, cy = y + h / 2;
  switch (shape) {
    case "rect":         return `M${x} ${y}H${x+w}V${y+h}H${x}Z`;
    case "rounded-rect": {
      const r = Math.min(w, h) * 0.12;
      return `M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
    }
    case "circle": {
      const r = Math.min(w, h) / 2;
      return `M${cx-r} ${cy}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0Z`;
    }
    case "oval": {
      const rx = w/2, ry = h/2;
      return `M${cx-rx} ${cy}a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 ${-rx*2} 0Z`;
    }
    case "heart": {
      const sx = x + w/2, sy = y + h*0.25;
      return `M${sx} ${y+h} C${x} ${y+h*0.6} ${x} ${y+h*0.1} ${sx} ${sy} C${x+w} ${y+h*0.1} ${x+w} ${y+h*0.6} ${sx} ${y+h}Z`;
    }
    case "hexagon": {
      const r = Math.min(w, h)/2;
      const pts = Array.from({length:6}, (_,i) => {
        const a = Math.PI/3 * i - Math.PI/6;
        return `${cx + r*Math.cos(a)},${cy + r*Math.sin(a)}`;
      });
      return `M${pts.join(" L")}Z`;
    }
    case "arch":
      return `M${x} ${y+h} V${cy} Q${x} ${y} ${cx} ${y} Q${x+w} ${y} ${x+w} ${cy} V${y+h} Z`;
    case "star": {
      const rOut = Math.min(w, h)/2;
      const rIn = rOut * 0.4;
      const pts: string[] = [];
      for (let i=0; i<10; i++) {
        const a = (Math.PI/5)*i - Math.PI/2;
        const r = i%2===0 ? rOut : rIn;
        pts.push(`${cx + r*Math.cos(a)},${cy + r*Math.sin(a)}`);
      }
      return `M${pts.join(" L")}Z`;
    }
    case "diamond":
      return `M${cx} ${y} L${x+w} ${cy} L${cx} ${y+h} L${x} ${cy}Z`;
    case "pentagon": {
      const r = Math.min(w, h)/2;
      const pts: string[] = [];
      for (let i=0; i<5; i++) {
        const a = (2*Math.PI/5)*i - Math.PI/2;
        pts.push(`${cx + r*Math.cos(a)},${cy + r*Math.sin(a)}`);
      }
      return `M${pts.join(" L")}Z`;
    }
    default: return "";
  }
}

// Small SVG icon for each shape in the picker
function ShapeIcon({ shape }: { shape: MaskShape }) {
  if (shape === "none")         return <X className="w-4 h-4 text-muted-foreground" />;
  if (shape === "custom-image") return <Plus className="w-4 h-4 text-muted-foreground" />;
  const d = shapePath(shape, 2, 2, 20, 20);
  return (
    <svg width={24} height={24} viewBox="0 0 24 24">
      <path d={d} fill="currentColor" className="text-muted-foreground" />
    </svg>
  );
}

// ── Interactive layer preview with drag / resize ─────────────────────────────

type DragState = {
  kind: "base" | "overlay" | "mask" | "imageZone" | "textZone";
  zoneIdx?: number;
  maskIdx?: number;
  mode: "move" | "resize";
  startX: number; startY: number;
  startPos: PosRect;
};

function LayerPreview({
  canvas, fallbackImage, activeTab, activeMaskIdx,
  activeZoneKind, activeZoneIdx,
  onUpdateBase, onUpdateOverlay, onUpdateMask, onSelectMask,
  onUpdateImageZone, onUpdateTextZone, onSelectZone, onSelectTop,
}: {
  canvas: CanvasConfig;
  fallbackImage: string;
  activeTab: "base" | "mask" | "top";
  activeMaskIdx: number;
  activeZoneKind: "image" | "text" | null;
  activeZoneIdx: number;
  onUpdateBase:    (p: PosRect) => void;
  onUpdateOverlay: (p: PosRect) => void;
  onUpdateMask:    (idx: number, p: PosRect) => void;
  onSelectMask:    (idx: number) => void;
  onUpdateImageZone: (idx: number, z: Partial<SimpleZone>) => void;
  onUpdateTextZone:  (idx: number, z: Partial<SimpleZone>) => void;
  onSelectZone:      (kind: "image" | "text", idx: number) => void;
  onSelectTop?:      () => void;
}) {
  const size = 280;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  const baseSrc = canvas.useProductImageAsBase ? (fallbackImage || canvas.baseImage) : canvas.baseImage;

  const toPct = (dxPx: number, dyPx: number) => ({ dx: (dxPx / size) * 100, dy: (dyPx / size) * 100 });

  const onMouseDown = (e: React.MouseEvent, kind: DragState["kind"], mode: DragState["mode"], idx?: number) => {
    e.preventDefault(); e.stopPropagation();
    let startPos: PosRect;
    if (kind === "base") startPos = canvas.basePos;
    else if (kind === "overlay") startPos = canvas.overlayPos;
    else if (kind === "mask") startPos = canvas.masks[idx!]?.pos ?? DEFAULT_MASK.pos;
    else if (kind === "imageZone") {
      const z = canvas.imageZones[idx!];
      startPos = { x: z.x, y: z.y, w: z.w, h: z.h };
    } else {
      const z = canvas.textZones[idx!];
      startPos = { x: z.x, y: z.y, w: z.w, h: z.h };
    }
    drag.current = {
      kind,
      mode,
      maskIdx: kind === "mask" ? idx : undefined,
      zoneIdx: (kind === "imageZone" || kind === "textZone") ? idx : undefined,
      startX: e.clientX, startY: e.clientY,
      startPos: { ...startPos },
    };

    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      const { dx, dy } = toPct(ev.clientX - drag.current.startX, ev.clientY - drag.current.startY);
      const p = drag.current.startPos;
      let next: PosRect;
      if (drag.current.mode === "move") {
        next = {
          x: Math.max(0, Math.min(100 - p.w, p.x + dx)),
          y: Math.max(0, Math.min(100 - p.h, p.y + dy)),
          w: p.w, h: p.h,
        };
      } else {
        // Constrain width = height when the zone is marked as circle or
        // square — we use the larger delta so the user always feels like
        // the handle follows the pointer. This lets admins get a perfect
        // circle by just dragging, without having to manually type equal
        // W/H values.
        let zoneShape: string | undefined;
        if (drag.current.kind === "imageZone" && drag.current.zoneIdx != null) {
          zoneShape = canvas.imageZones[drag.current.zoneIdx]?.shape;
        }
        // Circle and Square lock the aspect ratio at 1:1. Oval uses a free
        // rectangular bounding box (the ellipse fills whatever w×h you set).
        const lockRatio = zoneShape === "circle" || zoneShape === "square";
        let newW = p.w + dx;
        let newH = p.h + dy;
        if (lockRatio) {
          const side = Math.abs(dx) > Math.abs(dy) ? newW : newH;
          newW = side;
          newH = side;
        }
        next = {
          x: p.x, y: p.y,
          w: Math.max(5, Math.min(100 - p.x, newW)),
          h: Math.max(5, Math.min(100 - p.y, newH)),
        };
      }
      switch (drag.current.kind) {
        case "base":      onUpdateBase(next); break;
        case "overlay":   onUpdateOverlay(next); break;
        case "mask":      onUpdateMask(drag.current.maskIdx!, next); break;
        case "imageZone": onUpdateImageZone(drag.current.zoneIdx!, next); break;
        case "textZone":  onUpdateTextZone(drag.current.zoneIdx!, next); break;
      }
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const renderRect = (pos: PosRect, active: boolean, opts: { color: string; dashed?: boolean; onMouseDown?: (e: React.MouseEvent) => void; onResize?: (e: React.MouseEvent) => void; content?: React.ReactNode; clipPath?: string }) => {
    const style: React.CSSProperties = {
      left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.w}%`, height: `${pos.h}%`,
      border: `2px ${opts.dashed ? "dashed" : "solid"} ${opts.color}`,
      background: `${opts.color}15`,
      cursor: active ? "move" : "pointer",
    };
    if (opts.clipPath) style.clipPath = `path("${opts.clipPath}")`;
    return (
      <div
        className={`absolute flex items-center justify-center text-[10px] font-medium select-none ${active ? "ring-2 ring-offset-1 ring-pink-500 z-10" : ""}`}
        style={style}
        onMouseDown={opts.onMouseDown}
      >
        {opts.content}
        {active && opts.onResize && (
          <div
            className="absolute -bottom-1 -right-1 w-3 h-3 bg-pink-500 border-2 border-white rounded-sm cursor-nwse-resize"
            onMouseDown={opts.onResize}
          />
        )}
      </div>
    );
  };

  const bp = canvas.basePos, op = canvas.overlayPos;

  return (
    <div
      ref={ref}
      className="relative mx-auto rounded-xl border border-border/40 bg-[conic-gradient(at_top_left,#f9fafb,_#e5e7eb_25%,_#f9fafb_50%,_#e5e7eb_75%,_#f9fafb)] overflow-hidden"
      style={{ width: size, height: size }}
    >
      {/* Base image (always visible) */}
      {baseSrc ? (
        <img src={baseSrc} alt="" draggable={false}
          style={{ position: "absolute", left: `${bp.x}%`, top: `${bp.y}%`, width: `${bp.w}%`, height: `${bp.h}%`, objectFit: "contain", pointerEvents: "none" }} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-xs">
          Upload images to see preview
        </div>
      )}

      {/* Simple-mode zones — draggable & resizable */}
      {canvas.editor === "simple" && (
        <>
          {canvas.imageZones.map((z, i) => {
            const active = activeZoneKind === "image" && activeZoneIdx === i;
            // Match the mask shape on the preview so picking "Circle / Oval"
            // actually renders a rounded/elliptical placeholder rather than
            // a plain rectangle (which is what was confusing admins).
            const zShape = (z as any).shape as string | undefined;
            // Only apply a mask-image clip for "custom-image"; for "circle"
            // use borderRadius so resize handles can still sit outside the
            // zone without being clipped. We also render any clip effect on
            // a CHILD layer (pointer-events:none) so dragging/resizing the
            // parent rectangle still works.
            const isCustomMask = zShape === "custom-image" && (z as any).maskImageUrl;
            // True circle vs free-aspect oval. Treated separately for the
            // preview because circle should render at min(w_px, h_px) (same
            // as the customer side) while oval fills the whole rectangle.
            const isCircle     = zShape === "circle";
            const isOval       = zShape === "oval";
            // Per-zone corner radius — admin controls it via the slider in
            // the editor. Default of 8% looks like the previous hardcoded
            // 0.375rem at typical zone sizes. Range: 0 (sharp) — 50 (pill).
            const cornerR = typeof (z as any).cornerRadius === "number" ? (z as any).cornerRadius : 8;
            return (
              <div
                key={z.id}
                onClick={e => { e.stopPropagation(); onSelectZone("image", i); }}
                onMouseDown={e => { if (active) onMouseDown(e, "imageZone", "move", i); }}
                className={`absolute border-2 border-dashed flex items-center justify-center text-[9px] font-medium select-none ${
                  active
                    ? "border-blue-600 bg-blue-500/20 ring-2 ring-offset-1 ring-blue-500 z-10 cursor-move"
                    : "border-blue-500/70 bg-blue-500/10 cursor-pointer"
                } text-blue-700`}
                style={{
                  left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`,
                  // For circle we draw the visible chip via an inner
                  // aspect-ratio:1 element (see below) so it matches the
                  // customer renderer pixel-for-pixel even when the preview
                  // container's aspect ratio differs from the product
                  // image. Oval uses the full rectangle with 50% radius.
                  // Square / Free use the admin-controlled cornerRadius.
                  ...(isCircle
                    ? { borderRadius: 0, background: "transparent", border: "none" }
                    : {
                        borderRadius: isOval
                          ? "50%"
                          : `${Math.max(0, Math.min(50, cornerR))}%`,
                      }),
                  // Keep absolute positioning + flex so the inner-circle
                  // child can centre inside the rectangle.
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* True-circle chip — only for shape="circle". Inner box
                    uses aspectRatio:1 + width:100% + maxHeight:100% to
                    settle on min(parent_w, parent_h) pixels — identical
                    formula the customer renderer uses, so what you see
                    here is what the customer sees. */}
                {isCircle && (
                  <span
                    aria-hidden
                    style={{
                      aspectRatio: "1",
                      width: "100%",
                      maxHeight: "100%",
                      borderRadius: "9999px",
                      border: "2px dashed",
                      borderColor: active ? "rgb(37 99 235)" : "rgba(59,130,246,0.7)",
                      background: active
                        ? "rgba(59,130,246,0.20)"
                        : "rgba(59,130,246,0.10)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {/* Child layer shows the custom silhouette as a faint ghost
                    preview. pointer-events:none keeps the parent drag/resize
                    active. */}
                {isCustomMask && (
                  <span
                    className="absolute inset-0 pointer-events-none opacity-40"
                    style={{
                      WebkitMaskImage: `url(${(z as any).maskImageUrl})`,
                      maskImage:       `url(${(z as any).maskImageUrl})`,
                      WebkitMaskRepeat: "no-repeat",
                      maskRepeat:       "no-repeat",
                      WebkitMaskSize:   "100% 100%",
                      maskSize:         "100% 100%",
                      WebkitMaskPosition: "center",
                      maskPosition:       "center",
                      background: "rgba(59,130,246,0.25)",
                    }}
                  />
                )}
                <span className="relative z-[1]">📷 {z.label}</span>
                {active && (
                  <div
                    className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border-2 border-white rounded-sm cursor-nwse-resize z-20"
                    onMouseDown={e => onMouseDown(e, "imageZone", "resize", i)}
                  />
                )}
              </div>
            );
          })}
          {canvas.textZones.map((z, i) => {
            const active = activeZoneKind === "text" && activeZoneIdx === i;
            return (
              <div
                key={z.id}
                onClick={e => { e.stopPropagation(); onSelectZone("text", i); }}
                onMouseDown={e => { if (active) onMouseDown(e, "textZone", "move", i); }}
                className={`absolute border-2 border-dashed flex items-center justify-center text-[9px] font-medium select-none ${
                  active
                    ? "border-amber-600 bg-amber-500/20 ring-2 ring-offset-1 ring-amber-500 z-10 cursor-move"
                    : "border-amber-500/70 bg-amber-500/10 cursor-pointer"
                } text-amber-700`}
                style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
              >
                ✏️ {z.label}
                {active && (
                  <div
                    className="absolute -bottom-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-white rounded-sm cursor-nwse-resize z-20"
                    onMouseDown={e => onMouseDown(e, "textZone", "resize", i)}
                  />
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Masks preview — shown in BOTH editor modes now that the unified
          Customiser exposes the masks panel inline (Phase A). */}
      {canvas.masks.map((m, i) => {
        const active = activeTab === "mask" && i === activeMaskIdx;
        const pxW = (m.pos.w / 100) * size, pxH = (m.pos.h / 100) * size;
        const pathD = m.shape !== "none" && m.shape !== "custom-image" ? shapePath(m.shape, 0, 0, pxW, pxH) : "";
        return (
          <div key={m.id}
            className={`absolute ${active ? "z-10" : "z-0"}`}
            style={{ left: `${m.pos.x}%`, top: `${m.pos.y}%`, width: `${m.pos.w}%`, height: `${m.pos.h}%` }}
            onClick={() => onSelectMask(i)}
            onMouseDown={e => { if (active) onMouseDown(e, "mask", "move", i); }}
          >
            {/* Silhouette preview when shape=custom-image */}
            {m.shape === "custom-image" && m.maskImageUrl && (
              <img src={m.maskImageUrl} alt="" draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "contain", opacity: active ? 0.7 : 0.4, pointerEvents: "none" }} />
            )}
            {/* Shape outline */}
            {pathD && (
              <svg width="100%" height="100%" viewBox={`0 0 ${pxW} ${pxH}`} preserveAspectRatio="none" className="absolute inset-0 pointer-events-none">
                <path d={pathD}
                  fill={active ? "rgba(236,72,153,0.15)" : "rgba(236,72,153,0.05)"}
                  stroke={active ? "#ec4899" : "#ec489980"}
                  strokeWidth={active ? 2 : 1.2}
                  strokeDasharray={active ? "6 3" : "3 3"} />
              </svg>
            )}
            {m.shape === "none" && (
              <div className="absolute inset-0 border-2 border-dashed border-pink-400/40 rounded-sm" />
            )}
            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-pink-700 font-semibold pointer-events-none">
              {i + 1}. {m.label}
            </div>
            {active && (
              <div
                className="absolute -bottom-1 -right-1 w-3 h-3 bg-pink-500 border-2 border-white rounded-sm cursor-nwse-resize z-20"
                onMouseDown={e => onMouseDown(e, "mask", "resize", i)}
              />
            )}
          </div>
        );
      })}

      {/* Overlay / Top layer — always selectable. When active (selected via the
          layers panel) it shows a ring + corner resize handle and reacts to
          drag-to-move. When inactive, clicking it selects it without yet
          dragging — admin must click first, then drag. */}
      {canvas.overlayImage && (
        <div
          className={`absolute ${activeTab === "top" ? "z-20 ring-2 ring-offset-1 ring-pink-500 cursor-move" : "z-[5] cursor-pointer"}`}
          style={{ left: `${op.x}%`, top: `${op.y}%`, width: `${op.w}%`, height: `${op.h}%` }}
          onClick={e => { e.stopPropagation(); if (activeTab !== "top" && onSelectTop) onSelectTop(); }}
          onMouseDown={e => { if (activeTab === "top") onMouseDown(e, "overlay", "move"); }}
        >
          <img src={canvas.overlayImage} alt="" draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
          {activeTab === "top" && (
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-pink-500 border-2 border-white rounded-sm cursor-nwse-resize z-30"
              onMouseDown={e => onMouseDown(e, "overlay", "resize")} />
          )}
        </div>
      )}

      {/* Base resize handle when base tab active and base is uploaded */}
      {canvas.editor === "full" && activeTab === "base" && baseSrc && (
        <div
          className="absolute z-20 border-2 border-pink-500 ring-1 ring-offset-1 ring-pink-500/40 cursor-move"
          style={{ left: `${bp.x}%`, top: `${bp.y}%`, width: `${bp.w}%`, height: `${bp.h}%`, background: "transparent" }}
          onMouseDown={e => onMouseDown(e, "base", "move")}
        >
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-pink-500 border-2 border-white rounded-sm cursor-nwse-resize"
            onMouseDown={e => onMouseDown(e, "base", "resize")} />
        </div>
      )}
    </div>
  );
}

// ── Font library shown to admin (customer picks ONE of the admin-allowed ones) ─
const FONT_LIBRARY: { label: string; family: string }[] = [
  { label: "Outfit",      family: "'Outfit', sans-serif" },
  { label: "DM Sans",     family: "'DM Sans', sans-serif" },
  { label: "Georgia",     family: "Georgia, serif" },
  { label: "Times",       family: "'Times New Roman', serif" },
  { label: "Arial",       family: "Arial, sans-serif" },
  { label: "Courier",     family: "'Courier New', monospace" },
  { label: "Cursive",     family: "'Brush Script MT', cursive" },
  { label: "Comic Sans",  family: "'Comic Sans MS', cursive" },
  { label: "Impact",      family: "Impact, sans-serif" },
];

// ── Google Fonts dynamic loader (duplicated client-side logic from UI pkg) ──
const SYSTEM_FONTS = new Set([
  "arial", "georgia", "impact", "verdana", "tahoma",
  "times new roman", "courier new", "comic sans ms", "brush script mt",
  "sans-serif", "serif", "monospace", "cursive", "system-ui",
]);
function extractFontName(family: string): string | null {
  if (!family) return null;
  const m = family.match(/'([^']+)'/) || family.match(/"([^"]+)"/);
  if (m) return m[1];
  const first = family.split(",")[0].trim();
  return first || null;
}
function loadGoogleFont(family: string): void {
  if (typeof document === "undefined") return;
  const name = extractFontName(family);
  if (!name) return;
  if (SYSTEM_FONTS.has(name.toLowerCase())) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const id = `gf-${slug}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}` +
    `:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

// ── Palette editor: admin defines allowed fonts + colors per text zone ───────

// ── Image-zone shape mask editor ─────────────────────────────────────────
// Shown under a selected image zone in simple-mode. Lets admin pick the
// mask shape customer-uploaded photos get clipped to.
const SHAPE_OPTIONS: { id: ZoneShape; label: string; hint: string; emoji: string }[] = [
  { id: "free",         label: "Free",   emoji: "▭",  hint: "Rectangle, no clipping — the default behaviour" },
  { id: "square",       label: "Square", emoji: "◼",  hint: "Locked 1:1 ratio — admin hint to keep zone square" },
  { id: "circle",       label: "Circle", emoji: "⬤",  hint: "True circle — zone is auto-snapped to a 1:1 box and clipped" },
  { id: "oval",         label: "Oval",   emoji: "⬭",  hint: "Free aspect ellipse — fills the rectangular zone as an oval" },
  { id: "custom-image", label: "Custom", emoji: "✂",  hint: "Upload a black silhouette; black area = visible photo" },
];

function ImageZoneShapeEditor({ zone, onChange }: {
  zone: SimpleZone;
  onChange: (patch: Partial<SimpleZone>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const shape = (zone.shape as ZoneShape) ?? "free";

  const pickFile = () => ref.current?.click();
  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    const url = await uploadToFiles(f);
    setUploading(false);
    if (url) onChange({ maskImageUrl: url });
  };

  return (
    <div
      className="mt-2 p-2 rounded-md border border-blue-500/20 bg-blue-500/5 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700/80">
        Shape mask
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {SHAPE_OPTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              // Auto-snap dimensions only for the locked-ratio shapes:
              //   • circle → square box, renders as a true circle
              //   • square → square box (admin hint, sharp corners)
              // "Oval" intentionally keeps whatever w/h the zone has so the
              // ellipse adapts to the rectangle the admin drew.
              if (s.id === "circle" || s.id === "square") {
                const side = Math.min(zone.w, zone.h);
                onChange({ shape: s.id, w: side, h: side });
              } else {
                onChange({ shape: s.id });
              }
            }}
            title={s.hint}
            className={`py-1.5 rounded-md border text-[10px] font-semibold transition-colors ${
              shape === s.id
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-border/60 bg-card hover:border-blue-500/40"
            }`}
          >
            <span className="block text-base leading-none mb-0.5">{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Corner-radius slider — only relevant for rectangle-ish shapes.
          Circle uses a fixed 50% (the auto-squared zone makes this a true
          circle); custom-image uses the uploaded silhouette so radius is
          ignored. */}
      {(shape === "free" || shape === "square") && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700/80">
              Corner radius
            </span>
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {Math.round(zone.cornerRadius ?? 8)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={Math.round(zone.cornerRadius ?? 8)}
            onChange={(e) => onChange({ cornerRadius: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Sharp</span>
            <span>Rounded</span>
            <span>Pill</span>
          </div>
        </div>
      )}

      {/* Custom mask uploader */}
      {shape === "custom-image" && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Input
              value={zone.maskImageUrl ?? ""}
              onChange={(e) => onChange({ maskImageUrl: e.target.value })}
              placeholder="Paste URL or upload silhouette →"
              className="h-7 text-[11px] flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 gap-1"
              onClick={pickFile}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Upload
            </Button>
            <input
              ref={ref}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); if (ref.current) ref.current.value = ""; }}
            />
          </div>
          {zone.maskImageUrl ? (
            <div className="flex items-center gap-2">
              <div
                className="w-12 h-12 rounded border border-border bg-white flex-shrink-0"
                style={{
                  backgroundImage: `url(${zone.maskImageUrl})`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              />
              <p className="text-[10px] text-muted-foreground flex-1">
                Customer photos are clipped to the black silhouette of this image.
                PNG with transparent background works best.
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-amber-600">
              Upload a PNG/SVG where the black (or opaque) area will be visible.
            </p>
          )}
        </div>
      )}

      {/* ── Icon / logo library for this zone ─────────────────────────
          Admin curates a set of icons; the customer sees them as a grid
          and can pick one instead of (or before) uploading their own.   */}
      <IconLibraryEditor zone={zone} onChange={onChange} />
    </div>
  );
}

// Per-zone icon library editor. Shows current icons as a grid with
// quick-remove, plus an "Add icon" uploader. Icons are stored as
// `{ id, url, label? }` on the zone so they travel with the product.
function IconLibraryEditor({ zone, onChange }: {
  zone: SimpleZone;
  onChange: (patch: Partial<SimpleZone>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const icons = zone.allowedIcons ?? [];

  const addFile = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    const url = await uploadToFiles(f);
    setUploading(false);
    if (!url) return;
    const id = `icn_${Math.random().toString(36).slice(2, 9)}`;
    const label = f.name.replace(/\.[^.]+$/, "").slice(0, 24);
    onChange({ allowedIcons: [...icons, { id, url, label }] });
  };

  const remove = (id: string) => {
    onChange({ allowedIcons: icons.filter((i) => i.id !== id) });
  };

  const addUrl = () => {
    const url = typeof window !== "undefined" ? window.prompt("Icon image URL:") : "";
    if (!url) return;
    const id = `icn_${Math.random().toString(36).slice(2, 9)}`;
    onChange({ allowedIcons: [...icons, { id, url, label: "" }] });
  };

  return (
    <div className="space-y-1.5 pt-2 border-t border-blue-500/10">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700/80">
          Icon library {icons.length > 0 && <span className="text-muted-foreground">· {icons.length}</span>}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={addUrl}>
            URL
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-1.5 text-[10px] gap-1" onClick={() => ref.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            Add
          </Button>
          <input
            ref={ref}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { addFile(e.target.files?.[0]); if (ref.current) ref.current.value = ""; }}
          />
        </div>
      </div>
      {icons.length === 0 ? (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Pre-load icons / logos the customer can pick for this zone (e.g. monograms, religion symbols, flags). Leave empty to require them to upload their own.
        </p>
      ) : (
        <div className="grid grid-cols-6 gap-1">
          {icons.map((ic) => (
            <div key={ic.id} className="relative group aspect-square rounded border border-border bg-white/60 dark:bg-white/10 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ic.url} alt={ic.label ?? ""} className="w-full h-full object-contain p-1" />
              <button
                type="button"
                onClick={() => remove(ic.id)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-[9px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
                aria-label="Remove icon"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextZonePaletteEditor({ zone, onChange }: {
  zone: SimpleZone;
  onChange: (patch: Partial<SimpleZone>) => void;
}) {
  const allowedFonts  = zone.allowedFonts  ?? [];
  const allowedColors = zone.allowedColors ?? [];
  const [newColor, setNewColor] = useState("#111111");
  const [newFontName, setNewFontName] = useState("");

  // Eagerly load any Google Font that's in this zone's allowedFonts so the
  // chips below preview in the right face.
  useEffect(() => {
    allowedFonts.forEach(f => loadGoogleFont(f));
  }, [allowedFonts]);

  const toggleFont = (family: string) => {
    const next = allowedFonts.includes(family)
      ? allowedFonts.filter(f => f !== family)
      : [...allowedFonts, family];
    onChange({ allowedFonts: next });
  };
  const addCustomFont = () => {
    const name = newFontName.trim();
    if (!name) return;
    const family = `'${name}', sans-serif`;
    if (allowedFonts.includes(family)) { setNewFontName(""); return; }
    loadGoogleFont(family);
    onChange({ allowedFonts: [...allowedFonts, family] });
    setNewFontName("");
  };
  const addColor = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(newColor)) return;
    if (allowedColors.includes(newColor)) return;
    onChange({ allowedColors: [...allowedColors, newColor] });
  };
  const removeColor = (c: string) =>
    onChange({ allowedColors: allowedColors.filter(x => x !== c) });

  return (
    <div
      className="pt-1.5 mt-1 border-t border-border/30 space-y-2"
      onClick={e => e.stopPropagation()}
    >
      {/* Fonts palette */}
      <div>
        <p className="text-[9px] font-semibold text-muted-foreground mb-1">
          Allowed fonts (customer picks one)
        </p>
        <div className="flex flex-wrap gap-1">
          {FONT_LIBRARY.map(f => {
            const on = allowedFonts.includes(f.family);
            return (
              <button
                key={f.family}
                onClick={() => toggleFont(f.family)}
                className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                  on
                    ? "bg-amber-500/90 border-amber-600 text-white"
                    : "border-border/40 bg-background hover:bg-muted"
                }`}
                style={{ fontFamily: f.family }}
              >
                {f.label}
              </button>
            );
          })}
          {/* Custom Google Fonts added by admin (not in FONT_LIBRARY) */}
          {allowedFonts
            .filter(f => !FONT_LIBRARY.some(lib => lib.family === f))
            .map(f => {
              const name = extractFontName(f) || f;
              return (
                <div key={f} className="relative group">
                  <button
                    onClick={() => toggleFont(f)}
                    className="px-2 py-1 pr-4 rounded text-[10px] border bg-amber-500/90 border-amber-600 text-white"
                    style={{ fontFamily: f }}
                    title="Custom Google Font — click × to remove"
                  >
                    {name}
                  </button>
                  <button
                    onClick={() => toggleFont(f)}
                    className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-black/30 hover:bg-destructive text-white text-[8px] font-bold leading-none flex items-center justify-center"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              );
            })}
        </div>
        {/* Add custom Google Font */}
        <div className="flex items-center gap-1 mt-1.5">
          <Input
            placeholder="Any Google Font (e.g. Pacifico, Lobster, Playfair Display)"
            value={newFontName}
            onChange={e => setNewFontName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomFont(); } }}
            className="h-7 text-[10px] px-1.5 flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={addCustomFont}
          >
            + Font
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground mt-0.5 italic">
          Uses Google Fonts — exact spelling, title-case (&quot;Playfair Display&quot;). Loads only when allowed.
        </p>
        {allowedFonts.length === 0 && (
          <p className="text-[9px] text-destructive/80 mt-0.5 italic">
            Pick at least one font — else customer gets the default.
          </p>
        )}
      </div>

      {/* Colors palette */}
      <div>
        <p className="text-[9px] font-semibold text-muted-foreground mb-1">
          Allowed colors (customer picks one)
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {allowedColors.map(c => (
            <div key={c} className="relative group">
              <span
                className="block w-6 h-6 rounded border border-border/40"
                style={{ background: c }}
                title={c}
              />
              <button
                onClick={() => removeColor(c)}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white text-[9px] font-bold leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="h-6 w-8 rounded border border-border/40 p-0 cursor-pointer"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={addColor}
            >
              + Add
            </Button>
          </div>
        </div>
      </div>

      {/* Default size + weight */}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className="block text-[9px] text-muted-foreground mb-0.5">
            Default size (% of zone height)
          </span>
          <Input
            type="number"
            min={20}
            max={200}
            value={zone.defaultFontSize ?? 70}
            onChange={e => onChange({ defaultFontSize: Number(e.target.value) || undefined })}
            className="h-7 text-[10px] px-1.5"
          />
        </label>
        <label className="block">
          <span className="block text-[9px] text-muted-foreground mb-0.5">Weight (fixed)</span>
          <select
            value={String(zone.fontWeight ?? 600)}
            onChange={e => onChange({ fontWeight: Number(e.target.value) })}
            className="w-full h-7 text-[10px] rounded border border-border/40 px-1.5 bg-background"
          >
            <option value="400">Normal</option>
            <option value="600">Semibold</option>
            <option value="700">Bold</option>
          </select>
        </label>
      </div>

      {/* Customer runtime toggles ─────────────────────────────────────────
          customerCanDrag   → at runtime the customer can drag the text label
                              within this zone's bounding box.
          customerCanResize → at runtime the customer sees a font-size slider
                              (30–200% of the default size) when editing.
          Both default OFF for backward-compat. Saved old text zones render
          fixed (i.e. the same as before this feature shipped). */}
      <div className="space-y-1 pt-1.5 border-t border-border/30">
        <label className="flex items-center gap-2 cursor-pointer text-[10px]">
          <input
            type="checkbox"
            checked={!!zone.customerCanDrag}
            onChange={e => onChange({ customerCanDrag: e.target.checked })}
            className="accent-amber-500"
          />
          <span><strong>Customer can drag</strong> within bounding box</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-[10px]">
          <input
            type="checkbox"
            checked={!!zone.customerCanResize}
            onChange={e => onChange({ customerCanResize: e.target.checked })}
            className="accent-amber-500"
          />
          <span><strong>Customer can resize</strong> text (size slider in editor)</span>
        </label>
      </div>
    </div>
  );
}

// ── Simple-mode zone list (add / remove / rename) ────────────────────────────

function ZoneList({ zones, onChange, kind, activeIdx, onSelect }: {
  zones: SimpleZone[];
  onChange: (z: SimpleZone[]) => void;
  kind: "image" | "text";
  activeIdx: number;
  onSelect: (idx: number) => void;
}) {
  const add = () => {
    const next = [...zones, {
      id: `${kind[0]}z-${Date.now()}`,
      x: 10, y: kind === "image" ? 10 : 60, w: kind === "image" ? 30 : 80, h: kind === "image" ? 25 : 10,
      label: `${kind === "image" ? "Image" : "Text"} ${zones.length + 1}`,
    }];
    onChange(next);
    onSelect(zones.length);
  };
  const upd = (i: number, patch: Partial<SimpleZone>) =>
    onChange(zones.map((z, idx) => idx === i ? { ...z, ...patch } : z));
  const del = (i: number) => onChange(zones.filter((_, idx) => idx !== i));

  const accent = kind === "image" ? "blue" : "amber";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {kind === "image" ? "Image zones" : "Text zones"} ({zones.length})
        </p>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={add}>
          <Plus className="w-2.5 h-2.5" /> Add
        </Button>
      </div>
      {zones.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">
          No zones yet — click <strong>Add</strong>, then drag on the preview to position.
        </p>
      ) : zones.map((z, i) => {
        const active = i === activeIdx;
        return (
          <div key={z.id}
            onClick={() => onSelect(i)}
            className={`rounded-lg border p-2 space-y-1 cursor-pointer transition-colors ${
              active
                ? (kind === "image" ? "border-blue-500 bg-blue-500/10" : "border-amber-500 bg-amber-500/10")
                : "border-border/40 bg-card hover:border-border/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full bg-${accent}-500`} />
              <Input
                value={z.label}
                onChange={e => upd(i, { label: e.target.value })}
                onClick={e => e.stopPropagation()}
                placeholder="Label"
                className="h-7 text-[11px] flex-1"
              />
              <button
                onClick={e => { e.stopPropagation(); del(i); }}
                className="p-1 rounded hover:bg-destructive/10 text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground leading-tight">
              {Math.round(z.x)}%, {Math.round(z.y)}% · {Math.round(z.w)}×{Math.round(z.h)}%
              {active && " — drag on preview to move / resize"}
            </p>
            {kind === "image" && active && (
              <ImageZoneShapeEditor zone={z} onChange={patch => upd(i, patch)} />
            )}
            {kind === "text" && active && (
              <TextZonePaletteEditor zone={z} onChange={patch => upd(i, patch)} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── The panel itself ─────────────────────────────────────────────────────────

function FullCustomiserPanel({
  cfg, setCfg, productImage, setStatus, goTemplates, goFonts,
}: {
  cfg: CustomizerConfig;
  setCfg: React.Dispatch<React.SetStateAction<CustomizerConfig>>;
  productImage: string;
  setStatus: (s: "idle" | "ok" | "err") => void;
  goTemplates: () => void;
  goFonts: () => void;
}) {
  // Seed / migrate canvas on first render
  useEffect(() => {
    if (!cfg.canvas) setCfg(p => ({ ...p, canvas: { ...DEFAULT_CANVAS } }));
    else {
      const migrated = migrateCanvas(cfg.canvas);
      if (JSON.stringify(migrated) !== JSON.stringify(cfg.canvas)) {
        setCfg(p => ({ ...p, canvas: migrated }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canvas = cfg.canvas ?? DEFAULT_CANVAS;
  const update = (patch: Partial<CanvasConfig>) => {
    // Customiser v2: default mode is "simple" (the unified Customiser).
    // Power users can opt into the legacy "full" (layered) editor via the
    // small "Switch to Advanced layered editor" link below — once toggled,
    // we preserve whichever editor mode is on the patch / current canvas.
    setCfg(p => {
      const cur = p.canvas ?? DEFAULT_CANVAS;
      const nextEditor: CanvasEditor =
        (patch as any).editor ?? cur.editor ?? "simple";
      return { ...p, canvas: { ...cur, ...patch, editor: nextEditor } };
    });
    setStatus("idle");
  };

  const [tab, setTab] = useState<"base" | "mask" | "top">("mask");
  const [maskIdx, setMaskIdx] = useState(0);
  const [activeZone, setActiveZone] = useState<{ kind: "image" | "text"; idx: number } | null>(null);

  const activeMask: MaskSlot | undefined = canvas.masks[maskIdx];

  // Delete / Backspace → remove the currently-active mask (Full mode) or
  // image/text zone (Simple mode). Ignored while typing in a form field so
  // renaming a label doesn't nuke the zone on Backspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      if (canvas.editor === "simple" && activeZone) {
        e.preventDefault();
        if (activeZone.kind === "image") {
          const next = canvas.imageZones.filter((_, idx) => idx !== activeZone.idx);
          update({ imageZones: next });
        } else {
          const next = canvas.textZones.filter((_, idx) => idx !== activeZone.idx);
          update({ textZones: next });
        }
        setActiveZone(null);
      } else if (canvas.editor === "full" && tab === "mask" && canvas.masks.length > 0) {
        e.preventDefault();
        const next = canvas.masks.filter((_, idx) => idx !== maskIdx);
        update({ masks: next });
        if (maskIdx >= next.length) setMaskIdx(Math.max(0, next.length - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.editor, canvas.imageZones, canvas.textZones, canvas.masks, activeZone, tab, maskIdx]);

  const addMask = () => {
    if (canvas.masks.length >= 12) return;
    const newMask: MaskSlot = { ...DEFAULT_MASK, id: `m-${Date.now()}` };
    update({ masks: [...canvas.masks, newMask] });
    setMaskIdx(canvas.masks.length);
  };
  const removeMask = (i: number) => {
    const next = canvas.masks.filter((_, idx) => idx !== i);
    update({ masks: next });
    if (maskIdx >= next.length) setMaskIdx(Math.max(0, next.length - 1));
  };
  const updateMask = (i: number, patch: Partial<MaskSlot>) =>
    update({ masks: canvas.masks.map((m, idx) => idx === i ? { ...m, ...patch } : m) });

  const updateImageZone = (i: number, patch: Partial<SimpleZone>) =>
    update({ imageZones: canvas.imageZones.map((z, idx) => idx === i ? { ...z, ...patch } : z) });
  const updateTextZone = (i: number, patch: Partial<SimpleZone>) =>
    update({ textZones: canvas.textZones.map((z, idx) => idx === i ? { ...z, ...patch } : z) });

  // ── Layers panel helpers ─────────────────────────────────────────────────
  // Reorder masks / textZones by swapping array indices (later index = front).
  const swapMasks = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= canvas.masks.length || j >= canvas.masks.length) return;
    const next = [...canvas.masks];
    [next[i], next[j]] = [next[j], next[i]];
    update({ masks: next });
    if (maskIdx === i) setMaskIdx(j);
    else if (maskIdx === j) setMaskIdx(i);
  };
  const swapTextZones = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= canvas.textZones.length || j >= canvas.textZones.length) return;
    const next = [...canvas.textZones];
    [next[i], next[j]] = [next[j], next[i]];
    update({ textZones: next });
    if (activeZone?.kind === "text" && activeZone.idx === i) setActiveZone({ kind: "text", idx: j });
    else if (activeZone?.kind === "text" && activeZone.idx === j) setActiveZone({ kind: "text", idx: i });
  };
  const deleteMask = (i: number) => {
    const next = canvas.masks.filter((_, idx) => idx !== i);
    update({ masks: next });
    if (maskIdx >= next.length) setMaskIdx(Math.max(0, next.length - 1));
  };
  const deleteTextZone = (i: number) => {
    const next = canvas.textZones.filter((_, idx) => idx !== i);
    update({ textZones: next });
    if (activeZone?.kind === "text" && activeZone.idx === i) setActiveZone(null);
  };
  const deleteTopLayer = () => {
    update({ overlayImage: "" });
    if (tab === "top") setTab("mask");
  };

  // Selection helpers used by the layers panel
  const selectBase = () => { setTab("base"); setActiveZone(null); };
  const selectTop  = () => { setTab("top");  setActiveZone(null); };
  const selectMask = (i: number) => { setTab("mask"); setMaskIdx(i); setActiveZone(null); };
  const selectText = (i: number) => { setActiveZone({ kind: "text", idx: i }); setTab("mask"); };

  // Layers list — ordered so the FRONT (visually on top) is at the top of
  // the panel. Render order is: base (back) → masks → top → text zones (front).
  // Reverse so the panel reads top-to-bottom = front-to-back.
  type LayerRow =
    | { kind: "text"; idx: number; label: string; icon: string }
    | { kind: "top"; label: string; icon: string }
    | { kind: "mask"; idx: number; label: string; icon: string }
    | { kind: "base"; label: string; icon: string };
  const shapeIcon = (s: MaskShape): string => {
    switch (s) {
      case "circle":      return "⬤";
      case "heart":       return "❤";
      case "star":        return "★";
      case "hexagon":     return "⬢";
      case "diamond":     return "◆";
      case "pentagon":    return "⬟";
      case "oval":        return "⬭";
      case "arch":        return "⌂";
      case "rounded-rect":return "▢";
      case "rect":        return "▭";
      case "custom-image":return "✂";
      default:            return "□";
    }
  };
  // Z-order: text zones (front) > top > masks > base (back). The list reads
  // top-to-bottom = front-to-back, matching the visual stacking order.
  const layersFrontFirst: LayerRow[] = [
    ...canvas.textZones.map((t, i) => ({ kind: "text" as const, idx: i, label: t.label || `Text ${i + 1}`, icon: "T" })).reverse(),
    ...(canvas.overlayImage ? [{ kind: "top" as const, label: "Top layer", icon: "🖼" }] : []),
    ...canvas.masks.map((m, i) => ({ kind: "mask" as const, idx: i, label: m.label || `Mask ${i + 1}`, icon: shapeIcon(m.shape) })).reverse(),
    { kind: "base" as const, label: "Base", icon: "□" },
  ];

  const isLayerActive = (row: LayerRow): boolean => {
    if (row.kind === "base") return tab === "base";
    if (row.kind === "top")  return tab === "top";
    if (row.kind === "mask") return tab === "mask" && maskIdx === row.idx && !activeZone;
    if (row.kind === "text") return activeZone?.kind === "text" && activeZone.idx === row.idx;
    return false;
  };

  return (
    <div className="rounded-xl border border-pink-200 dark:border-pink-800 bg-pink-50/40 dark:bg-pink-950/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <LayoutTemplate className="w-4 h-4 text-pink-600" />
        <p className="text-xs font-semibold text-pink-700 dark:text-pink-300">
          {canvas.editor === "full" ? "Customiser — Advanced (layered)" : "Customiser"}
        </p>
      </div>

      {/* ── Advanced-mode tab nav (Base / Mask / Top) ────────────────────────
          Only shown when the admin has explicitly opted into the legacy
          layered editor via the toggle at the bottom. Selecting a tab is the
          primary way to choose what's edited in the live preview when there
          are no zones / masks defined yet. */}
      {canvas.editor === "full" && (
        <div className="flex gap-0.5 border-b border-pink-200/40">
          {([
            { id: "base", label: "Base"  },
            { id: "mask", label: "Masks" },
            { id: "top",  label: "Top"   },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setActiveZone(null); }}
              className={`px-3 py-1.5 text-[11px] font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? "border-pink-500 text-pink-700 dark:text-pink-300"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Live preview + Layers panel ────────────────────────────────────
          Layers panel is hidden when nothing has been added yet — at that
          point it would only show "Base" (a useless single-row list). The
          panel reappears the moment the admin adds the first mask, text
          zone, or top layer. (#2 UX tightening) */}
      {(() => {
        const hasLayers =
          (canvas.masks?.length ?? 0) > 0 ||
          (canvas.textZones?.length ?? 0) > 0 ||
          !!canvas.overlayImage;
        return (
      <div className={`grid grid-cols-1 ${hasLayers ? "sm:grid-cols-[280px_1fr]" : ""} gap-3`}>
        <div>
          <p className="text-[11px] font-semibold text-foreground">Live preview</p>
          <p className="text-[9px] text-muted-foreground mb-1.5">
            Drag any layer to move, corner handle to resize.
          </p>
          <LayerPreview
            canvas={canvas}
            fallbackImage={productImage}
            activeTab={tab}
            activeMaskIdx={maskIdx}
            activeZoneKind={activeZone?.kind ?? null}
            activeZoneIdx={activeZone?.idx ?? -1}
            onUpdateBase={p => update({ basePos: p })}
            onUpdateOverlay={p => update({ overlayPos: p })}
            onUpdateMask={(i, p) => updateMask(i, { pos: p })}
            onSelectMask={i => selectMask(i)}
            onUpdateImageZone={(i, patch) => updateImageZone(i, patch)}
            onUpdateTextZone={(i, patch) => updateTextZone(i, patch)}
            onSelectZone={(kind, idx) => {
              if (kind === "text") setActiveZone({ kind, idx });
              else setActiveZone({ kind, idx }); // image zones (legacy) still selectable
            }}
            onSelectTop={selectTop}
          />
        </div>

        {/* Layers panel — front-of-canvas at TOP of list. Hidden when nothing
            has been added yet so we don't ship a panel with only "Base" in it. */}
        {hasLayers && (
        <aside className="rounded-lg border border-border/40 bg-card overflow-hidden">
          <div className="px-2.5 py-1.5 border-b border-border/40 bg-muted/30">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Layers <span className="font-normal normal-case">({layersFrontFirst.length})</span>
            </p>
          </div>
          <ul className="divide-y divide-border/30 max-h-[260px] overflow-y-auto">
            {layersFrontFirst.map((row, i) => {
              const active = isLayerActive(row);
              const onSelect = () => {
                if (row.kind === "base") selectBase();
                else if (row.kind === "top") selectTop();
                else if (row.kind === "mask") selectMask(row.idx);
                else if (row.kind === "text") selectText(row.idx);
              };
              // Up arrow → move toward FRONT (earlier in this list = more front)
              // Reordering operates on the underlying array (later array index = later render = front).
              // For the list "front-first", moving up in list → larger array idx.
              const canMoveFront =
                (row.kind === "mask" && row.idx < canvas.masks.length - 1) ||
                (row.kind === "text" && row.idx < canvas.textZones.length - 1);
              const canMoveBack =
                (row.kind === "mask" && row.idx > 0) ||
                (row.kind === "text" && row.idx > 0);
              const canDelete = row.kind === "mask" || row.kind === "text" || row.kind === "top";
              const moveFront = () => {
                if (row.kind === "mask") swapMasks(row.idx, row.idx + 1);
                else if (row.kind === "text") swapTextZones(row.idx, row.idx + 1);
              };
              const moveBack = () => {
                if (row.kind === "mask") swapMasks(row.idx, row.idx - 1);
                else if (row.kind === "text") swapTextZones(row.idx, row.idx - 1);
              };
              const onDelete = () => {
                if (row.kind === "mask") deleteMask(row.idx);
                else if (row.kind === "text") deleteTextZone(row.idx);
                else if (row.kind === "top") deleteTopLayer();
              };
              return (
                <li
                  key={`${row.kind}-${row.kind === "base" || row.kind === "top" ? row.kind : (row as any).idx}-${i}`}
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] cursor-pointer transition-colors ${
                    active ? "bg-pink-500/10 text-pink-700 dark:text-pink-300" : "hover:bg-muted/40"
                  }`}
                  onClick={onSelect}
                >
                  <span className="w-5 text-center font-bold opacity-80">{row.icon}</span>
                  <span className="flex-1 truncate">{row.label}</span>
                  {(row.kind === "mask" || row.kind === "text") && (
                    <>
                      <button
                        type="button"
                        disabled={!canMoveFront}
                        onClick={e => { e.stopPropagation(); moveFront(); }}
                        title="Move forward (visually toward front)"
                        className="px-1 text-muted-foreground disabled:opacity-30 hover:text-foreground"
                      >▲</button>
                      <button
                        type="button"
                        disabled={!canMoveBack}
                        onClick={e => { e.stopPropagation(); moveBack(); }}
                        title="Move back (visually toward back)"
                        className="px-1 text-muted-foreground disabled:opacity-30 hover:text-foreground"
                      >▼</button>
                    </>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onDelete(); }}
                      title="Delete"
                      className="px-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
        )}
      </div>
        );
      })()}

      <>
          {/* Simple-mode controls */}
          <div className="space-y-2 p-3 rounded-lg border border-blue-200/60 bg-blue-50/30 dark:bg-blue-950/10">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={canvas.useProductImageAsBase}
                onChange={e => update({ useProductImageAsBase: e.target.checked })}
                className="accent-blue-500" />
              <span className="text-[11px] font-medium">Use main product image as base</span>
            </label>
            {!canvas.useProductImageAsBase && (
              <ImageUploadField
                value={canvas.baseImage}
                onChange={v => update({ baseImage: v })}
                placeholder="Paste URL or upload"
                label="Base image"
              />
            )}
          </div>

          {/* ── Masks (shaped cut-outs the customer uploads photos into) ──
              Same feature as the Full mode "Mask" tab, surfaced inline so
              admins don't have to switch modes. Up to 3 masks per product
              with full shape library + custom SVG silhouette. */}
          <div className="space-y-2.5 p-3 rounded-lg border border-pink-200/60 bg-pink-50/30 dark:bg-pink-950/10">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] uppercase tracking-wider font-bold text-pink-700/80">
                Photo masks
                <span className="ml-1 font-normal text-muted-foreground normal-case tracking-normal">
                  (shaped cut-outs)
                </span>
              </Label>
              {canvas.masks.length < 12 && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-1" onClick={addMask}>
                  <Plus className="w-3 h-3" /> Add mask
                </Button>
              )}
            </div>

            {canvas.masks.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">
                Add up to 12 mask shapes (round photo, heart, star, custom SVG…). Customers upload photos that get clipped to the shape.
              </p>
            ) : (
              <>
                {/* Mask slot tabs */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {canvas.masks.map((m, i) => (
                    <div key={m.id} className={`flex items-center rounded-md border ${
                      i === maskIdx ? "border-pink-500 bg-pink-500/10" : "border-border/50 bg-card"
                    }`}>
                      <button onClick={() => { setMaskIdx(i); setTab("mask"); }}
                        className={`px-2 h-7 text-[11px] font-semibold ${i === maskIdx ? "text-pink-700" : "text-muted-foreground"}`}>
                        Mask {i + 1}
                      </button>
                      <button onClick={() => removeMask(i)} className="px-1 h-7 text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {activeMask && (
                  <div className="space-y-2.5">
                    {/* Shape grid */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Mask shape</Label>
                      <div className="grid grid-cols-6 gap-1 mt-1">
                        {MASK_SHAPES.map(s => {
                          const active = activeMask.shape === s.id;
                          return (
                            <button key={s.id}
                              onClick={() => updateMask(maskIdx, { shape: s.id })}
                              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-md border transition-all ${
                                active ? "border-pink-500 bg-pink-500/10" : "border-border/40 bg-card hover:border-border/80"
                              }`}>
                              <ShapeIcon shape={s.id} />
                              <span className="text-[9px] font-medium">{s.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inscribed-circle hint — shown only when the admin
                        picks "Circle". The bounding box on the preview
                        becomes a square (locked 1:1) and the rendered
                        circle equals that square's side. If it looks
                        small, drag any corner to enlarge — the customer
                        sees exactly what's previewed. */}
                    {activeMask.shape === "circle" && (
                      <div className="rounded-md border border-pink-500/30 bg-pink-500/5 px-2.5 py-1.5">
                        <p className="text-[10px] text-pink-700 dark:text-pink-300 leading-snug">
                          <strong>Tip:</strong> circle size = the square
                          bounding box. Drag a corner of the preview to
                          resize. The customer photo fills the inscribed
                          circle exactly.
                        </p>
                      </div>
                    )}

                    {/* Custom shape — SVG-only. PNG silhouettes don't render
                        on the Flutter app (flutter_svg can't parse raster
                        images), so we lock the format to SVG up-front and
                        explain why. Vector also scales pixel-perfectly. */}
                    {activeMask.shape === "custom-image" && (
                      <div className="space-y-1">
                        <ImageUploadField
                          value={activeMask.maskImageUrl}
                          onChange={v => updateMask(maskIdx, { maskImageUrl: v })}
                          placeholder="Upload SVG silhouette"
                          label="Custom shape (SVG only)"
                          accept="image/svg+xml,.svg"
                          svgOnly
                        />
                        <p className="text-[9px] text-muted-foreground italic">
                          <strong>SVG required.</strong> The shape defines where the customer&apos;s photo shows. PNG/JPEG won&apos;t render on the mobile app — export your shape as SVG (any vector tool).
                        </p>
                      </div>
                    )}

                    {/* Label + required */}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Label shown to customer</Label>
                      <Input value={activeMask.label}
                        onChange={e => updateMask(maskIdx, { label: e.target.value })}
                        placeholder="e.g. Upload your pet photo"
                        className="h-8 text-[11px] mt-0.5" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                      <input type="checkbox" checked={activeMask.required}
                        onChange={e => updateMask(maskIdx, { required: e.target.checked })}
                        className="accent-pink-500" />
                      Required — customer must upload an image for this mask
                    </label>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Simple-mode — Top / overlay image (same as Full mode) ─────
              Sits above the zones in the customer preview (frame, badge,
              mug-handle cut-out etc). Transparent PNG recommended. */}
          <div className="space-y-2 p-3 rounded-lg border border-emerald-200/60 bg-emerald-50/30 dark:bg-emerald-950/10">
            <ImageUploadField
              value={canvas.overlayImage}
              onChange={v => update({ overlayImage: v })}
              placeholder="Upload transparent PNG that sits over zones"
              label="Top layer (overlay)"
            />
            <p className="text-[9px] text-muted-foreground italic">
              Overlay artwork rendered above the zones — e.g. a frame, sticker, or brand header.
            </p>
          </div>

          {/* Text zones only — image zones removed; masks cover photos.
              imageZones[] still preserved on save for back-compat with old
              products, just not surfaced in the UI. */}
          <ZoneList
            zones={canvas.textZones}
            onChange={z => update({ textZones: z })}
            kind="text"
            activeIdx={activeZone?.kind === "text" ? activeZone.idx : -1}
            onSelect={idx => setActiveZone({ kind: "text", idx })}
          />
        </>

      {/* Quick links */}
      <div className="flex items-center gap-3 pt-2 border-t border-pink-200/50 dark:border-pink-800/50">
        <button onClick={goTemplates} className="text-[10px] font-semibold text-pink-600 hover:underline">
          → Manage Templates
        </button>
        <button onClick={goFonts} className="text-[10px] font-semibold text-pink-600 hover:underline">
          → Manage Fonts
        </button>
        {/* ── Advanced editor toggle ──────────────────────────────────────
            Power users only. Switches to the legacy layered editor where
            base/mask/top live on separate tabs. Most admins should never
            need this — it's intentionally muted and at the bottom. */}
        <button
          onClick={() => update({ editor: canvas.editor === "full" ? "simple" : "full" } as any)}
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground hover:underline"
          title={canvas.editor === "full"
            ? "Back to the unified Customiser"
            : "Switch to the legacy Base / Mask / Top tabbed editor"}
        >
          {canvas.editor === "full"
            ? "← Back to Simple Customiser"
            : "Switch to Advanced layered editor →"}
        </button>
      </div>
    </div>
  );
}

// ── Configure dialog ─────────────────────────────────────────────────────────

function ConfigureDialog({ product, onClose, onSaved }: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  // The product list endpoint (/api/products) intentionally strips the
  // `metadata` blob to keep payloads small. So `product.metadata.customizer`
  // is undefined here even when there's a saved config in the DB. Without
  // the refetch below the dialog would always open in default Full mode,
  // wiping the admin's previously-saved zones the moment they hit Save.
  const existing = product.metadata?.customizer;
  // Always run the existing config through migrateCanvas on first render so
  // legacy/older saves get any newly-added defaults applied before the panel
  // reads from them. Avoids "Mask config gone" appearance when the metadata
  // is partially shaped (#3).
  const [cfg, setCfg] = useState<CustomizerConfig>(() => {
    if (!existing) return { ...DEFAULT_CONFIG };
    const merged: CustomizerConfig = { ...DEFAULT_CONFIG, ...existing };
    if (merged.canvas) merged.canvas = migrateCanvas(merged.canvas);
    return merged;
  });
  // Treat hydration as complete only when we have a canvas with at least one
  // configured field — otherwise we MUST refetch to avoid showing an empty
  // dialog when the list endpoint stripped metadata.
  const [hydrated, setHydrated] = useState<boolean>(() => {
    const c = existing?.canvas;
    if (!c) return false;
    return (
      (Array.isArray(c.masks) && c.masks.length > 0) ||
      (Array.isArray(c.imageZones) && c.imageZones.length > 0) ||
      (Array.isArray(c.textZones) && c.textZones.length > 0) ||
      !!c.overlayImage || !!c.baseImage
    );
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [tab, setTab] = useState<"setup" | "templates" | "fonts">("setup");

  // Hydrate the full saved config on open. We hit the single-product
  // endpoint by slug (it returns metadata in full) and merge whatever's
  // there over our DEFAULT_CONFIG. Idempotent: if the list already
  // included metadata.customizer we skip the round-trip.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    (async () => {
      const slug = product.slug;
      // Prefer slug (canonical), fall back to id-based fetch if the list
      // mapping somehow didn't carry slug through. Without this, missing
      // slug → no refetch → masks vanish on reopen (#3).
      const path = slug
        ? `/products/${encodeURIComponent(slug)}`
        : product.id
          ? `/products/admin/${encodeURIComponent(product.id)}`
          : null;
      if (!path) { setHydrated(true); return; }
      const full = await apiFetch<any>(path);
      if (cancelled) return;
      const remoteCfg = full?.metadata?.customizer;
      if (remoteCfg && typeof remoteCfg === "object") {
        // Run the canvas through migrateCanvas so any fields missing from
        // older saves (cornerRadius, oval shape, etc.) get sensible defaults
        // before the panel reads from it.
        const merged: CustomizerConfig = { ...DEFAULT_CONFIG, ...remoteCfg };
        if (merged.canvas) merged.canvas = migrateCanvas(merged.canvas);
        setCfg(merged);
      }
      setHydrated(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Templates state ────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [fonts, setFonts] = useState<any[]>([]);
  const [loadingFonts, setLoadingFonts] = useState(false);

  useEffect(() => {
    if (tab === "templates" && templates.length === 0) {
      setLoadingTemplates(true);
      apiFetch<any[]>("/design-templates?pageSize=50").then(data => {
        setTemplates(Array.isArray(data) ? data : []);
        setLoadingTemplates(false);
      });
    }
    if (tab === "fonts" && fonts.length === 0) {
      setLoadingFonts(true);
      apiFetch<any[]>("/custom-fonts?pageSize=50").then(data => {
        setFonts(Array.isArray(data) ? data : []);
        setLoadingFonts(false);
      });
    }
  }, [tab]);

  const productImage = product.images?.[0]?.url || product.imageUrl || "";

  const handleSave = async () => {
    setSaving(true);
    setStatus("idle");
    const payload = {
      isCustomizable: true,
      metadata: {
        ...(product.metadata ?? {}),
        customizer: cfg,
      },
    };
    const res = await apiFetch(`/products/admin/${product.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res !== null) {
      setStatus("ok");
      setTimeout(() => { onSaved(); onClose(); }, 800);
    } else {
      setStatus("err");
    }
  };

  return (
    <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
      <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30">
        <div className="flex items-start justify-between">
          <div>
            <DialogTitle className="text-sm font-bold">{product.title}</DialogTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Customisation setup</p>
          </div>
          <div className="flex items-center gap-2">
            {status === "ok" && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
              </span>
            )}
            {status === "err" && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5" /> Save failed
              </span>
            )}
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </Button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex gap-0.5 mt-3 border-b border-border/20 -mb-3 pb-0">
          {[
            { id: "setup", label: "Setup", icon: <Layers className="w-3.5 h-3.5" /> },
            { id: "templates", label: "Templates", icon: <LayoutTemplate className="w-3.5 h-3.5" /> },
            { id: "fonts", label: "Fonts", icon: <TypeIcon className="w-3.5 h-3.5" /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </DialogHeader>

      {/* ── Templates tab ── */}
      {tab === "templates" && (
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Design templates are canvas presets customers can choose in the Full Customiser.
            Manage them at <strong>Settings → Design Templates</strong>.
          </p>
          {loadingTemplates ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-border/40 py-12 text-center bg-card">
              <LayoutTemplate className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm font-medium mb-1">No templates yet</p>
              <p className="text-xs text-muted-foreground">Go to <strong>Settings → Design Templates</strong> to add canvas templates</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {templates.slice(0, 20).map((t: any) => (
                <div key={t.id} className="rounded-lg border border-border/40 overflow-hidden bg-card">
                  <div className="aspect-square bg-muted/30 relative">
                    {t.thumbnail ? (
                      <img src={t.thumbnail} alt={t.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <LayoutTemplate className="w-6 h-6 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${t.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[10px] font-medium truncate">{t.label || t.name}</p>
                    {t.category && <p className="text-[9px] text-muted-foreground truncate">{t.category}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Fonts tab ── */}
      {tab === "fonts" && (
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            Custom fonts appear in the text customiser for customers to choose.
            Manage them at <strong>Settings → Custom Fonts</strong>.
          </p>
          {loadingFonts ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : fonts.length === 0 ? (
            <div className="rounded-xl border border-border/40 py-12 text-center bg-card">
              <TypeIcon className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm font-medium mb-1">No custom fonts yet</p>
              <p className="text-xs text-muted-foreground">Go to <strong>Settings → Custom Fonts</strong> to upload TTF/OTF/WOFF fonts</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {fonts.map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 bg-card">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${f.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{f.name || f.font_family}</p>
                    <p
                      className="text-[10px] text-muted-foreground truncate"
                      style={{ fontFamily: f.font_family }}
                    >
                      {f.font_family} — The quick brown fox
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0">
                    {f.is_active ? "Active" : "Hidden"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Setup tab ── */}
      {tab === "setup" && (
        <div className="p-5">
          <FullCustomiserPanel
            cfg={cfg}
            setCfg={setCfg}
            productImage={productImage}
            setStatus={setStatus}
            goTemplates={() => setTab("templates")}
            goFonts={() => setTab("fonts")}
          />
        </div>
      )}
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
      .filter((p: any) => p.isCustomizable || p.is_customizable || p.metadata?.customizer)
      .map((p: any) => ({
        id: p.id,
        // CRITICAL: slug is required for ConfigureDialog hydration. Without it,
        // the useEffect short-circuits and never refetches the saved customizer
        // metadata, so masks (and any other previously-saved fields) appear
        // empty on dialog reopen.
        slug: p.slug,
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

  const filtered = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  const isConfigured = (p: Product): boolean => {
    const c = p.metadata?.customizer?.canvas;
    if (!c) return false;
    return (c.masks?.length ?? 0) > 0
      || (c.imageZones?.length ?? 0) > 0
      || (c.textZones?.length ?? 0) > 0
      || !!c.overlayImage
      || !!c.baseImage;
  };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Customiser Setup</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure how customers personalise each product
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-xs shrink-0">
          {products.length} customisable
        </Badge>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary/80 leading-relaxed">
        <strong>How it works:</strong> Select a product below → use the layers panel
        to add a base, photo masks, a top overlay and text zones → drag and resize on
        the preview → Save. Customers see this on the product page when they click
        <em> Customise</em>.
      </div>

      {/* Search */}
      {products.length > 4 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-8 h-8 text-xs"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Product grid */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card py-16 text-center">
          <Package className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">
            {search ? "No products match" : "No customisable products"}
          </p>
          <p className="text-xs text-muted-foreground">
            {search
              ? "Try a different search term"
              : "Go to Products → edit a product → tick 'Customisable'"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(p => {
            const configured = isConfigured(p);
            const editor = p.metadata?.customizer?.canvas?.editor ?? "full";
            const img = p.images?.[0]?.url || p.imageUrl || "";
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="group bg-card rounded-xl border border-border/40 overflow-hidden text-left hover:border-primary/40 hover:shadow-sm transition-all"
              >
                {/* Product image */}
                <div className="aspect-square bg-muted/30 relative overflow-hidden">
                  {img ? (
                    <img src={img} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground/20" />
                    </div>
                  )}
                  {/* Configured badge */}
                  {configured && (
                    <div className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                      editor === "simple"
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-pink-50 border-pink-200 text-pink-700"
                    }`}>
                      {editor === "simple" ? "Simple" : "Full"}
                    </div>
                  )}
                  {/* Configure overlay */}
                  <div className="absolute inset-0 bg-primary/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-semibold flex items-center gap-1">
                      Configure <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {configured ? "Configured ✓" : "Not set up yet"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Configure dialog */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        {selected && (
          <ConfigureDialog
            product={selected}
            onClose={() => setSelected(null)}
            onSaved={() => { setSelected(null); fetchProducts(); }}
          />
        )}
      </Dialog>
    </div>
  );
}

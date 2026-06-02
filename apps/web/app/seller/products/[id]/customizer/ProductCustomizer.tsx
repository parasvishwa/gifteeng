/**
 * ProductCustomizer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-contained product customiser panel. Zero project-specific dependencies.
 * Works in any React + Tailwind + lucide-react project (Next.js, Vite, CRA…).
 *
 * Usage
 * ─────
 *   import { ProductCustomizer } from "./ProductCustomizer";
 *   import type { CustomizerConfig } from "./ProductCustomizer";
 *
 *   <ProductCustomizer
 *     productImage="https://cdn.example.com/product.jpg"
 *     initialConfig={savedConfigOrUndefined}
 *     onSave={async (config) => {
 *       await myApi.patch("/products/123", { customizer: config });
 *     }}
 *     onUpload={async (file) => {
 *       const fd = new FormData();
 *       fd.append("file", file);
 *       const res = await fetch("/api/upload", { method: "POST", body: fd });
 *       const { url } = await res.json();
 *       return url; // return the public URL string
 *     }}
 *   />
 *
 * Props
 * ─────
 *   productImage  — URL of the product image shown in the live preview
 *   initialConfig — previously saved CustomizerConfig (optional)
 *   onSave        — async callback with the new config; throw to show error
 *   onUpload      — async callback that uploads a File and returns its URL
 *   title         — optional header title (default: "Customisation setup")
 */

"use client"; // safe to delete if you're not in a Next.js app-router project

import { createContext, useContext, useState, useEffect, useRef } from "react";
import {
  Loader2, Save, X, CheckCircle2, AlertCircle, Plus, Upload, Trash2,
} from "lucide-react";

// ── Public types ──────────────────────────────────────────────────────────────

export type CanvasEditor = "full" | "simple";

export type MaskShape =
  | "none" | "rect" | "rounded-rect" | "circle" | "oval"
  | "heart" | "hexagon" | "arch" | "star" | "diamond" | "pentagon" | "custom-image";

export interface PosRect { x: number; y: number; w: number; h: number; }

export interface MaskSlot {
  id: string;
  label: string;
  shape: MaskShape;
  maskImageUrl: string;
  pos: PosRect;
  required: boolean;
}

export type ZoneShape = "free" | "square" | "circle" | "oval" | "custom-image";

export interface SimpleZone {
  id: string;
  x: number; y: number; w: number; h: number;
  label: string;
  shape?: ZoneShape;
  cornerRadius?: number;
  maskImageUrl?: string;
  allowedIcons?: Array<{ id: string; url: string; label?: string }>;
  allowedFonts?: string[];
  allowedColors?: string[];
  defaultFontSize?: number;
  fontWeight?: number;
  customerCanDrag?: boolean;
  customerCanResize?: boolean;
}

export interface CanvasConfig {
  editor: CanvasEditor;
  useProductImageAsBase: boolean;
  baseImage: string;
  basePos: PosRect;
  overlayImage: string;
  overlayPos: PosRect;
  masks: MaskSlot[];
  limits: { maxImages: number; maxTexts: number };
  imageZones: SimpleZone[];
  textZones: SimpleZone[];
}

export interface CustomizerConfig { canvas?: CanvasConfig; }

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProductCustomizerProps {
  /** URL of the product's main image — shown in the live preview */
  productImage: string;
  /** Previously saved config to pre-populate the editor */
  initialConfig?: CustomizerConfig;
  /** Called when the user clicks Save. Throw to surface an error. */
  onSave: (config: CustomizerConfig) => Promise<void>;
  /** Upload a file and return its public URL */
  onUpload: (file: File) => Promise<string>;
  /** Optional header title */
  title?: string;
}

// ── Internal context (avoids prop-drilling onUpload) ─────────────────────────

const UploadCtx = createContext<(file: File) => Promise<string>>(async () => "");

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_MASK: Omit<MaskSlot, "id"> = {
  label: "Upload your photo", shape: "rect", maskImageUrl: "",
  pos: { x: 20, y: 20, w: 60, h: 60 }, required: false,
};

const DEFAULT_CANVAS: CanvasConfig = {
  editor: "simple",
  useProductImageAsBase: true,
  baseImage: "", basePos: { x: 0, y: 0, w: 100, h: 100 },
  overlayImage: "", overlayPos: { x: 0, y: 0, w: 100, h: 100 },
  masks: [], limits: { maxImages: 3, maxTexts: 3 },
  imageZones: [], textZones: [],
};

const DEFAULT_CONFIG: CustomizerConfig = { canvas: { ...DEFAULT_CANVAS } };

// ── Config migration (handles legacy shape from v1) ───────────────────────────

function migrateCanvas(raw: unknown): CanvasConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CANVAS };
  const r = raw as Record<string, unknown>;
  const editor: CanvasEditor = r.editor === "simple" || r.editor === "zones" ? "simple" : "full";
  const masks: MaskSlot[] = Array.isArray(r.masks) && r.masks.length
    ? (r.masks as unknown[]).slice(0, 12).map((m: unknown, i: number) => {
        const mm = (m ?? {}) as Record<string, unknown>;
        return {
          id: (mm.id as string) || `m${i}-${Date.now()}`,
          label: (mm.label as string) ?? DEFAULT_MASK.label,
          shape: (mm.shape as MaskShape) ?? "rect",
          maskImageUrl: (mm.maskImageUrl as string) ?? "",
          pos: (mm.pos as PosRect) ?? DEFAULT_MASK.pos,
          required: !!mm.required,
        };
      })
    : (r.maskShape && r.maskShape !== "none"
        ? [{ id: `m-legacy-${Date.now()}`, label: DEFAULT_MASK.label, shape: r.maskShape as MaskShape, maskImageUrl: (r.maskImageUrl as string) ?? "", pos: (r.maskPos as PosRect) ?? DEFAULT_MASK.pos, required: false }]
        : []);
  return {
    editor,
    useProductImageAsBase: (r.useProductImageAsBase as boolean) ?? !(r.baseImage),
    baseImage: (r.baseImage as string) ?? "",
    basePos: (r.basePos as PosRect) ?? DEFAULT_CANVAS.basePos,
    overlayImage: (r.overlayImage as string) ?? "",
    overlayPos: (r.overlayPos as PosRect) ?? DEFAULT_CANVAS.overlayPos,
    masks,
    limits: {
      maxImages: ((r.limits as Record<string, number>)?.maxImages) ?? 3,
      maxTexts:  ((r.limits as Record<string, number>)?.maxTexts)  ?? 3,
    },
    imageZones: Array.isArray(r.imageZones)
      ? (r.imageZones as unknown[]).map((z: unknown, i: number) => {
          const zz = (z ?? {}) as Record<string, unknown>;
          return {
            id: (zz.id as string) || `iz${i}`, x: (zz.x as number) ?? 10, y: (zz.y as number) ?? 10,
            w: (zz.w as number) ?? 30, h: (zz.h as number) ?? 20,
            label: (zz.label as string) || `Image ${i + 1}`, shape: (zz.shape as ZoneShape) ?? "free",
            cornerRadius: typeof zz.cornerRadius === "number" ? zz.cornerRadius : 8,
            maskImageUrl: (zz.maskImageUrl as string) ?? "",
          };
        })
      : [],
    textZones: Array.isArray(r.textZones)
      ? (r.textZones as unknown[]).map((z: unknown, i: number) => {
          const zz = (z ?? {}) as Record<string, unknown>;
          return {
            id: (zz.id as string) || `tz${i}`, x: (zz.x as number) ?? 10, y: (zz.y as number) ?? 50,
            w: (zz.w as number) ?? 80, h: (zz.h as number) ?? 12,
            label: (zz.label as string) || `Text ${i + 1}`,
            allowedFonts:  Array.isArray(zz.allowedFonts)  ? zz.allowedFonts  as string[] : undefined,
            allowedColors: Array.isArray(zz.allowedColors) ? zz.allowedColors as string[] : undefined,
            defaultFontSize: typeof zz.defaultFontSize === "number" ? zz.defaultFontSize : undefined,
            fontWeight:      typeof zz.fontWeight      === "number" ? zz.fontWeight      : undefined,
            customerCanDrag:   zz.customerCanDrag   === true,
            customerCanResize: zz.customerCanResize === true,
          };
        })
      : [],
  };
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

const MASK_SHAPES: { id: MaskShape; label: string }[] = [
  { id: "none", label: "None" }, { id: "rect", label: "Rect" }, { id: "circle", label: "Circle" },
  { id: "rounded-rect", label: "Rounded" }, { id: "oval", label: "Oval" }, { id: "heart", label: "Heart" },
  { id: "hexagon", label: "Hexagon" }, { id: "arch", label: "Arch" }, { id: "star", label: "Star" },
  { id: "diamond", label: "Diamond" }, { id: "pentagon", label: "Pentagon" }, { id: "custom-image", label: "Custom" },
];

function shapePath(shape: MaskShape, x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2, cy = y + h / 2;
  switch (shape) {
    case "rect":         return `M${x} ${y}H${x+w}V${y+h}H${x}Z`;
    case "rounded-rect": { const r = Math.min(w,h)*0.12; return `M${x+r} ${y}H${x+w-r}Q${x+w} ${y} ${x+w} ${y+r}V${y+h-r}Q${x+w} ${y+h} ${x+w-r} ${y+h}H${x+r}Q${x} ${y+h} ${x} ${y+h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`; }
    case "circle":       { const r=Math.min(w,h)/2; return `M${cx-r} ${cy}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0Z`; }
    case "oval":         { const rx=w/2,ry=h/2; return `M${cx-rx} ${cy}a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 ${-rx*2} 0Z`; }
    case "heart":        { const sx=x+w/2,sy=y+h*0.25; return `M${sx} ${y+h} C${x} ${y+h*0.6} ${x} ${y+h*0.1} ${sx} ${sy} C${x+w} ${y+h*0.1} ${x+w} ${y+h*0.6} ${sx} ${y+h}Z`; }
    case "hexagon":      { const r=Math.min(w,h)/2; const pts=Array.from({length:6},(_,i)=>{const a=Math.PI/3*i-Math.PI/6;return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}); return `M${pts.join(" L")}Z`; }
    case "arch":         return `M${x} ${y+h} V${cy} Q${x} ${y} ${cx} ${y} Q${x+w} ${y} ${x+w} ${cy} V${y+h} Z`;
    case "star":         { const rOut=Math.min(w,h)/2,rIn=rOut*0.4; const pts:string[]=[]; for(let i=0;i<10;i++){const a=(Math.PI/5)*i-Math.PI/2;const r=i%2===0?rOut:rIn;pts.push(`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`);} return `M${pts.join(" L")}Z`; }
    case "diamond":      return `M${cx} ${y} L${x+w} ${cy} L${cx} ${y+h} L${x} ${cy}Z`;
    case "pentagon":     { const r=Math.min(w,h)/2; const pts:string[]=[]; for(let i=0;i<5;i++){const a=(2*Math.PI/5)*i-Math.PI/2;pts.push(`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`);} return `M${pts.join(" L")}Z`; }
    default:             return "";
  }
}

function ShapeIcon({ shape }: { shape: MaskShape }) {
  if (shape === "none") return <X className="w-4 h-4 text-muted-foreground" />;
  if (shape === "custom-image") return <Plus className="w-4 h-4 text-muted-foreground" />;
  const d = shapePath(shape, 2, 2, 20, 20);
  return (
    <svg width={24} height={24} viewBox="0 0 24 24">
      <path d={d} fill="currentColor" className="text-muted-foreground" />
    </svg>
  );
}

// ── Image upload field ────────────────────────────────────────────────────────

function ImageUploadField({ value, onChange, label, placeholder, accept, svgOnly }: {
  value: string; onChange: (v: string) => void; label?: string; placeholder: string;
  accept?: string; svgOnly?: boolean;
}) {
  const doUpload = useContext(UploadCtx);
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      {label && <label className="block text-[10px] text-muted-foreground mb-0.5">{label}</label>}
      <div className="flex gap-1.5">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[11px] outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="h-8 px-2.5 rounded-lg border border-border/60 bg-card text-[10px] flex items-center gap-1 hover:bg-muted disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Upload
        </button>
        <input
          ref={ref}
          type="file"
          accept={accept ?? "image/*"}
          className="hidden"
          onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (svgOnly) {
              const isSvg = f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg");
              if (!isSvg) { setError("Only SVG files accepted here"); e.target.value = ""; return; }
            }
            setError("");
            setUploading(true);
            try {
              const url = await doUpload(f);
              if (url) onChange(url);
            } catch {
              setError("Upload failed");
            } finally {
              setUploading(false);
              e.target.value = "";
            }
          }}
        />
      </div>
      {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
      {value && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="w-10 h-10 rounded border border-border/40 object-cover bg-muted" />
          <button onClick={() => onChange("")} className="text-[10px] text-destructive hover:underline">Remove</button>
        </div>
      )}
    </div>
  );
}

// ── Drag-resize canvas preview ────────────────────────────────────────────────

type DragState = {
  kind: "base" | "overlay" | "mask" | "imageZone" | "textZone";
  zoneIdx?: number; maskIdx?: number;
  mode: "move" | "resize";
  startX: number; startY: number; startPos: PosRect;
};

function LayerPreview({
  canvas, fallbackImage, activeTab, activeMaskIdx,
  activeZoneKind, activeZoneIdx,
  onUpdateBase, onUpdateOverlay, onUpdateMask, onSelectMask,
  onUpdateImageZone, onUpdateTextZone, onSelectZone, onSelectTop,
}: {
  canvas: CanvasConfig; fallbackImage: string;
  activeTab: "base" | "mask" | "top"; activeMaskIdx: number;
  activeZoneKind: "image" | "text" | null; activeZoneIdx: number;
  onUpdateBase: (p: PosRect) => void; onUpdateOverlay: (p: PosRect) => void;
  onUpdateMask: (idx: number, p: PosRect) => void; onSelectMask: (idx: number) => void;
  onUpdateImageZone: (idx: number, z: Partial<SimpleZone>) => void;
  onUpdateTextZone: (idx: number, z: Partial<SimpleZone>) => void;
  onSelectZone: (kind: "image" | "text", idx: number) => void;
  onSelectTop?: () => void;
}) {
  const SIZE = 280;
  const drag = useRef<DragState | null>(null);
  const baseSrc = canvas.useProductImageAsBase ? (fallbackImage || canvas.baseImage) : canvas.baseImage;
  const toPct = (dx: number, dy: number) => ({ dx: (dx / SIZE) * 100, dy: (dy / SIZE) * 100 });

  const onMouseDown = (e: React.MouseEvent, kind: DragState["kind"], mode: DragState["mode"], idx?: number) => {
    e.preventDefault(); e.stopPropagation();
    let startPos: PosRect;
    if (kind === "base") startPos = canvas.basePos;
    else if (kind === "overlay") startPos = canvas.overlayPos;
    else if (kind === "mask") startPos = canvas.masks[idx!]?.pos ?? DEFAULT_MASK.pos;
    else if (kind === "imageZone") { const z = canvas.imageZones[idx!]; startPos = { x: z.x, y: z.y, w: z.w, h: z.h }; }
    else { const z = canvas.textZones[idx!]; startPos = { x: z.x, y: z.y, w: z.w, h: z.h }; }
    drag.current = { kind, mode, maskIdx: kind === "mask" ? idx : undefined, zoneIdx: (kind === "imageZone" || kind === "textZone") ? idx : undefined, startX: e.clientX, startY: e.clientY, startPos: { ...startPos } };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      const { dx, dy } = toPct(ev.clientX - drag.current.startX, ev.clientY - drag.current.startY);
      const p = drag.current.startPos;
      let next: PosRect;
      if (drag.current.mode === "move") {
        next = { x: Math.max(0, Math.min(100 - p.w, p.x + dx)), y: Math.max(0, Math.min(100 - p.h, p.y + dy)), w: p.w, h: p.h };
      } else {
        next = { x: p.x, y: p.y, w: Math.max(5, Math.min(100 - p.x, p.w + dx)), h: Math.max(5, Math.min(100 - p.y, p.h + dy)) };
      }
      switch (drag.current.kind) {
        case "base":      onUpdateBase(next); break;
        case "overlay":   onUpdateOverlay(next); break;
        case "mask":      onUpdateMask(drag.current.maskIdx!, next); break;
        case "imageZone": onUpdateImageZone(drag.current.zoneIdx!, next); break;
        case "textZone":  onUpdateTextZone(drag.current.zoneIdx!, next); break;
      }
    };
    const up = () => { drag.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const bp = canvas.basePos, op = canvas.overlayPos;
  return (
    <div
      className="relative mx-auto rounded-xl border border-border/40 bg-[conic-gradient(at_top_left,#f9fafb,_#e5e7eb_25%,_#f9fafb_50%,_#e5e7eb_75%,_#f9fafb)] overflow-hidden select-none"
      style={{ width: SIZE, height: SIZE }}
    >
      {baseSrc
        ? <img src={baseSrc} alt="" draggable={false} style={{ position: "absolute", left: `${bp.x}%`, top: `${bp.y}%`, width: `${bp.w}%`, height: `${bp.h}%`, objectFit: "contain", pointerEvents: "none" }} />
        : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40 text-xs">No image — upload one to preview</div>
      }

      {/* Image zones */}
      {canvas.imageZones.map((z, i) => {
        const active = activeZoneKind === "image" && activeZoneIdx === i;
        const cornerR = typeof z.cornerRadius === "number" ? z.cornerRadius : 8;
        return (
          <div key={z.id}
            onClick={e => { e.stopPropagation(); onSelectZone("image", i); }}
            onMouseDown={e => { if (active) onMouseDown(e, "imageZone", "move", i); }}
            className={`absolute border-2 border-dashed flex items-center justify-center text-[9px] font-medium ${active ? "border-blue-600 bg-blue-500/20 ring-2 ring-blue-500 z-10 cursor-move" : "border-blue-500/70 bg-blue-500/10 cursor-pointer"} text-blue-700`}
            style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`, borderRadius: `${cornerR}%` }}
          >
            📷 {z.label}
            {active && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border-2 border-white rounded-sm cursor-nwse-resize z-20" onMouseDown={e => onMouseDown(e, "imageZone", "resize", i)} />}
          </div>
        );
      })}

      {/* Text zones */}
      {canvas.textZones.map((z, i) => {
        const active = activeZoneKind === "text" && activeZoneIdx === i;
        return (
          <div key={z.id}
            onClick={e => { e.stopPropagation(); onSelectZone("text", i); }}
            onMouseDown={e => { if (active) onMouseDown(e, "textZone", "move", i); }}
            className={`absolute border-2 border-dashed flex items-center justify-center text-[9px] font-medium ${active ? "border-amber-600 bg-amber-500/20 ring-2 ring-amber-500 z-10 cursor-move" : "border-amber-500/70 bg-amber-500/10 cursor-pointer"} text-amber-700`}
            style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
          >
            ✏️ {z.label}
            {active && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-amber-500 border-2 border-white rounded-sm cursor-nwse-resize z-20" onMouseDown={e => onMouseDown(e, "textZone", "resize", i)} />}
          </div>
        );
      })}

      {/* Photo masks */}
      {canvas.masks.map((m, i) => {
        const active = activeTab === "mask" && i === activeMaskIdx;
        const pxW = (m.pos.w / 100) * SIZE, pxH = (m.pos.h / 100) * SIZE;
        const pathD = m.shape !== "none" && m.shape !== "custom-image" ? shapePath(m.shape, 0, 0, pxW, pxH) : "";
        return (
          <div key={m.id}
            className={`absolute ${active ? "z-10" : "z-0"}`}
            style={{ left: `${m.pos.x}%`, top: `${m.pos.y}%`, width: `${m.pos.w}%`, height: `${m.pos.h}%` }}
            onClick={() => onSelectMask(i)}
            onMouseDown={e => { if (active) onMouseDown(e, "mask", "move", i); }}
          >
            {m.shape === "custom-image" && m.maskImageUrl && (
              <img src={m.maskImageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", opacity: active ? 0.7 : 0.4, pointerEvents: "none" }} />
            )}
            {pathD && (
              <svg width="100%" height="100%" viewBox={`0 0 ${pxW} ${pxH}`} preserveAspectRatio="none" className="absolute inset-0 pointer-events-none">
                <path d={pathD} fill={active ? "rgba(236,72,153,0.15)" : "rgba(236,72,153,0.05)"} stroke={active ? "#ec4899" : "#ec489980"} strokeWidth={active ? 2 : 1.2} strokeDasharray={active ? "6 3" : "3 3"} />
              </svg>
            )}
            <div className="absolute inset-0 flex items-center justify-center text-[9px] text-pink-700 font-semibold pointer-events-none">{i + 1}. {m.label}</div>
            {active && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-pink-500 border-2 border-white rounded-sm cursor-nwse-resize z-20" onMouseDown={e => onMouseDown(e, "mask", "resize", i)} />}
          </div>
        );
      })}

      {/* Overlay */}
      {canvas.overlayImage && (
        <div
          className={`absolute ${activeTab === "top" ? "z-20 ring-2 ring-pink-500 cursor-move" : "z-[5] cursor-pointer"}`}
          style={{ left: `${op.x}%`, top: `${op.y}%`, width: `${op.w}%`, height: `${op.h}%` }}
          onClick={e => { e.stopPropagation(); if (activeTab !== "top" && onSelectTop) onSelectTop(); }}
          onMouseDown={e => { if (activeTab === "top") onMouseDown(e, "overlay", "move"); }}
        >
          <img src={canvas.overlayImage} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
          {activeTab === "top" && <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-pink-500 border-2 border-white rounded-sm cursor-nwse-resize z-30" onMouseDown={e => onMouseDown(e, "overlay", "resize")} />}
        </div>
      )}
    </div>
  );
}

// ── Font library ──────────────────────────────────────────────────────────────

const FONT_LIBRARY = [
  { label: "Outfit",     family: "'Outfit', sans-serif" },
  { label: "DM Sans",    family: "'DM Sans', sans-serif" },
  { label: "Georgia",    family: "Georgia, serif" },
  { label: "Times",      family: "'Times New Roman', serif" },
  { label: "Arial",      family: "Arial, sans-serif" },
  { label: "Courier",    family: "'Courier New', monospace" },
  { label: "Cursive",    family: "'Brush Script MT', cursive" },
  { label: "Comic Sans", family: "'Comic Sans MS', cursive" },
  { label: "Impact",     family: "Impact, sans-serif" },
];

const SYSTEM_FONTS = new Set(["arial", "georgia", "impact", "verdana", "tahoma", "times new roman", "courier new", "comic sans ms", "brush script mt"]);

function extractFontName(family: string): string | null {
  if (!family) return null;
  const m = family.match(/'([^']+)'/) || family.match(/"([^"]+)"/);
  if (m) return m[1];
  return family.split(",")[0].trim() || null;
}

function loadGoogleFont(family: string) {
  if (typeof document === "undefined") return;
  const name = extractFontName(family);
  if (!name || SYSTEM_FONTS.has(name.toLowerCase())) return;
  const id = `gf-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id; link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
}

// ── Text zone palette editor ──────────────────────────────────────────────────

function TextZonePaletteEditor({ zone, onChange }: { zone: SimpleZone; onChange: (p: Partial<SimpleZone>) => void }) {
  const allowedFonts  = zone.allowedFonts  ?? [];
  const allowedColors = zone.allowedColors ?? [];
  const [newColor, setNewColor] = useState("#111111");
  const [newFontName, setNewFontName] = useState("");

  useEffect(() => { allowedFonts.forEach(f => loadGoogleFont(f)); }, [allowedFonts]);

  const toggleFont = (f: string) => onChange({ allowedFonts: allowedFonts.includes(f) ? allowedFonts.filter(x => x !== f) : [...allowedFonts, f] });
  const addCustomFont = () => {
    const name = newFontName.trim(); if (!name) return;
    const family = `'${name}', sans-serif`;
    if (allowedFonts.includes(family)) { setNewFontName(""); return; }
    loadGoogleFont(family);
    onChange({ allowedFonts: [...allowedFonts, family] });
    setNewFontName("");
  };

  return (
    <div className="pt-1.5 mt-1 border-t border-border/30 space-y-2" onClick={e => e.stopPropagation()}>
      <div>
        <p className="text-[9px] font-semibold text-muted-foreground mb-1">Allowed fonts (customer picks one)</p>
        <div className="flex flex-wrap gap-1">
          {FONT_LIBRARY.map(f => (
            <button key={f.family} type="button" onClick={() => toggleFont(f.family)}
              className={`px-2 py-1 rounded text-[10px] border transition-colors ${allowedFonts.includes(f.family) ? "bg-amber-500/90 border-amber-600 text-white" : "border-border/40 bg-background hover:bg-muted"}`}
              style={{ fontFamily: f.family }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 mt-1.5">
          <input value={newFontName} onChange={e => setNewFontName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomFont(); } }}
            placeholder="Any Google Font (e.g. Pacifico)"
            className="flex-1 h-7 rounded border border-border/40 bg-background px-2 text-[10px] outline-none focus:border-primary/50"
          />
          <button type="button" onClick={addCustomFont} className="h-7 px-2 rounded border border-border/40 bg-card text-[10px] hover:bg-muted">+ Font</button>
        </div>
      </div>
      <div>
        <p className="text-[9px] font-semibold text-muted-foreground mb-1">Allowed colors</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {allowedColors.map(c => (
            <div key={c} className="relative group">
              <span className="block w-6 h-6 rounded border border-border/40" style={{ background: c }} title={c} />
              <button type="button" onClick={() => onChange({ allowedColors: allowedColors.filter(x => x !== c) })}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white text-[9px] font-bold leading-none flex items-center justify-center opacity-0 group-hover:opacity-100">×</button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-6 w-8 rounded border border-border/40 p-0 cursor-pointer" />
            <button type="button"
              onClick={() => { if (!/^#[0-9a-fA-F]{6}$/.test(newColor) || allowedColors.includes(newColor)) return; onChange({ allowedColors: [...allowedColors, newColor] }); }}
              className="h-6 px-2 rounded border border-border/40 bg-card text-[10px] hover:bg-muted">+ Add</button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="block">
          <span className="block text-[9px] text-muted-foreground mb-0.5">Default size (%)</span>
          <input type="number" min={20} max={200} value={zone.defaultFontSize ?? 70}
            onChange={e => onChange({ defaultFontSize: Number(e.target.value) || undefined })}
            className="w-full h-7 rounded border border-border/40 bg-background px-2 text-[10px] outline-none focus:border-primary/50" />
        </label>
        <label className="block">
          <span className="block text-[9px] text-muted-foreground mb-0.5">Weight (fixed)</span>
          <select value={String(zone.fontWeight ?? 600)} onChange={e => onChange({ fontWeight: Number(e.target.value) })}
            className="w-full h-7 rounded border border-border/40 bg-background px-1.5 text-[10px]">
            <option value="400">Normal</option>
            <option value="600">Semibold</option>
            <option value="700">Bold</option>
          </select>
        </label>
      </div>
      <div className="space-y-1 pt-1.5 border-t border-border/30">
        <label className="flex items-center gap-2 cursor-pointer text-[10px]">
          <input type="checkbox" checked={!!zone.customerCanDrag} onChange={e => onChange({ customerCanDrag: e.target.checked })} className="accent-amber-500" />
          <span><strong>Customer can drag</strong> within bounding box</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-[10px]">
          <input type="checkbox" checked={!!zone.customerCanResize} onChange={e => onChange({ customerCanResize: e.target.checked })} className="accent-amber-500" />
          <span><strong>Customer can resize</strong> text</span>
        </label>
      </div>
    </div>
  );
}

// ── Image zone shape editor ───────────────────────────────────────────────────

const SHAPE_OPTIONS: { id: ZoneShape; label: string; emoji: string }[] = [
  { id: "free",         label: "Free",   emoji: "▭" },
  { id: "square",       label: "Square", emoji: "◼" },
  { id: "circle",       label: "Circle", emoji: "⬤" },
  { id: "oval",         label: "Oval",   emoji: "⬭" },
  { id: "custom-image", label: "Custom", emoji: "✂" },
];

function ImageZoneShapeEditor({ zone, onChange }: { zone: SimpleZone; onChange: (p: Partial<SimpleZone>) => void }) {
  const shape = zone.shape ?? "free";
  return (
    <div className="mt-2 p-2 rounded-md border border-blue-500/20 bg-blue-500/5 space-y-2" onClick={e => e.stopPropagation()}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700/80">Shape mask</p>
      <div className="grid grid-cols-5 gap-1.5">
        {SHAPE_OPTIONS.map(s => (
          <button key={s.id} type="button" onClick={() => {
            if (s.id === "circle" || s.id === "square") { const side = Math.min(zone.w, zone.h); onChange({ shape: s.id, w: side, h: side }); }
            else onChange({ shape: s.id });
          }}
          className={`py-1.5 rounded-md border text-[10px] font-semibold transition-colors ${shape === s.id ? "border-blue-500 bg-blue-500 text-white" : "border-border/60 bg-card hover:border-blue-500/40"}`}>
            <span className="block text-base leading-none mb-0.5">{s.emoji}</span>{s.label}
          </button>
        ))}
      </div>
      {(shape === "free" || shape === "square") && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700/80">Corner radius</span>
            <span className="text-[10px] font-mono text-muted-foreground">{Math.round(zone.cornerRadius ?? 8)}%</span>
          </div>
          <input type="range" min={0} max={50} value={Math.round(zone.cornerRadius ?? 8)}
            onChange={e => onChange({ cornerRadius: Number(e.target.value) })} className="w-full accent-blue-500" />
        </div>
      )}
      {shape === "custom-image" && (
        <ImageUploadField value={zone.maskImageUrl ?? ""} onChange={v => onChange({ maskImageUrl: v })}
          placeholder="Upload silhouette image" accept="image/png,image/svg+xml,image/jpeg" />
      )}
    </div>
  );
}

// ── Zone list (image or text) ─────────────────────────────────────────────────

function ZoneList({ zones, onChange, kind, activeIdx, onSelect }: {
  zones: SimpleZone[]; onChange: (z: SimpleZone[]) => void;
  kind: "image" | "text"; activeIdx: number; onSelect: (idx: number) => void;
}) {
  const add = () => {
    const next = [...zones, {
      id: `${kind[0]}z-${Date.now()}`,
      x: 10, y: kind === "image" ? 10 : 60,
      w: kind === "image" ? 30 : 80,
      h: kind === "image" ? 25 : 10,
      label: `${kind === "image" ? "Image" : "Text"} ${zones.length + 1}`,
    }];
    onChange(next); onSelect(zones.length);
  };
  const upd = (i: number, patch: Partial<SimpleZone>) => onChange(zones.map((z, idx) => idx === i ? { ...z, ...patch } : z));
  const del = (i: number) => onChange(zones.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {kind === "image" ? "Image zones" : "Text zones"} ({zones.length})
        </p>
        <button type="button" onClick={add} className="h-6 px-2 rounded border border-border/60 bg-card text-[10px] flex items-center gap-1 hover:bg-muted">
          <Plus className="w-2.5 h-2.5" /> Add
        </button>
      </div>
      {zones.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No zones yet — click Add, then drag on the preview to position.</p>
      ) : zones.map((z, i) => {
        const active = i === activeIdx;
        const isImg = kind === "image";
        return (
          <div key={z.id} onClick={() => onSelect(i)}
            className={`rounded-lg border p-2 space-y-1 cursor-pointer transition-colors ${active ? (isImg ? "border-blue-500 bg-blue-500/10" : "border-amber-500 bg-amber-500/10") : "border-border/40 bg-card hover:border-border/80"}`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isImg ? "bg-blue-500" : "bg-amber-500"}`} />
              <input value={z.label} onChange={e => upd(i, { label: e.target.value })} onClick={e => e.stopPropagation()}
                placeholder="Label" className="flex-1 h-7 rounded border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50" />
              <button type="button" onClick={e => { e.stopPropagation(); del(i); }} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground">{Math.round(z.x)}%, {Math.round(z.y)}% · {Math.round(z.w)}×{Math.round(z.h)}%</p>
            {isImg && active && <ImageZoneShapeEditor zone={z} onChange={patch => upd(i, patch)} />}
            {!isImg && active && <TextZonePaletteEditor zone={z} onChange={patch => upd(i, patch)} />}
          </div>
        );
      })}
    </div>
  );
}

// ── CustomiserPanel — the core editor (no API calls, no routing) ──────────────

function CustomiserPanel({
  cfg, setCfg, productImage,
}: {
  cfg: CustomizerConfig;
  setCfg: React.Dispatch<React.SetStateAction<CustomizerConfig>>;
  productImage: string;
}) {
  useEffect(() => {
    if (!cfg.canvas) {
      setCfg(p => ({ ...p, canvas: { ...DEFAULT_CANVAS } }));
    } else {
      const migrated = migrateCanvas(cfg.canvas);
      if (JSON.stringify(migrated) !== JSON.stringify(cfg.canvas)) setCfg(p => ({ ...p, canvas: migrated }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canvas = cfg.canvas ?? DEFAULT_CANVAS;
  const update = (patch: Partial<CanvasConfig>) => {
    setCfg(p => { const cur = p.canvas ?? DEFAULT_CANVAS; return { ...p, canvas: { ...cur, ...patch } }; });
  };

  const [tab, setTab] = useState<"base" | "mask" | "top">("mask");
  const [maskIdx, setMaskIdx] = useState(0);
  const [activeZone, setActiveZone] = useState<{ kind: "image" | "text"; idx: number } | null>(null);

  const activeMask = canvas.masks[maskIdx];

  const addMask = () => {
    if (canvas.masks.length >= 12) return;
    update({ masks: [...canvas.masks, { ...DEFAULT_MASK, id: `m-${Date.now()}` }] });
    setMaskIdx(canvas.masks.length);
  };
  const removeMask = (i: number) => {
    const next = canvas.masks.filter((_, idx) => idx !== i);
    update({ masks: next });
    if (maskIdx >= next.length) setMaskIdx(Math.max(0, next.length - 1));
  };
  const updateMask = (i: number, patch: Partial<MaskSlot>) =>
    update({ masks: canvas.masks.map((m, idx) => idx === i ? { ...m, ...patch } : m) });

  return (
    <div className="rounded-xl border border-pink-200 dark:border-pink-800 bg-pink-50/40 dark:bg-pink-950/20 p-4 space-y-3">
      {/* Live preview */}
      <div className="grid grid-cols-1 sm:grid-cols-[280px_1fr] gap-3">
        <div>
          <p className="text-[11px] font-semibold mb-1">Live preview</p>
          <p className="text-[9px] text-muted-foreground mb-1.5">Drag any layer to move it, corner handle to resize.</p>
          <LayerPreview
            canvas={canvas} fallbackImage={productImage}
            activeTab={tab} activeMaskIdx={maskIdx}
            activeZoneKind={activeZone?.kind ?? null} activeZoneIdx={activeZone?.idx ?? -1}
            onUpdateBase={p => update({ basePos: p })}
            onUpdateOverlay={p => update({ overlayPos: p })}
            onUpdateMask={(i, p) => updateMask(i, { pos: p })}
            onSelectMask={i => { setMaskIdx(i); setTab("mask"); }}
            onUpdateImageZone={(i, patch) => update({ imageZones: canvas.imageZones.map((z, idx) => idx === i ? { ...z, ...patch } : z) })}
            onUpdateTextZone={(i, patch) => update({ textZones: canvas.textZones.map((z, idx) => idx === i ? { ...z, ...patch } : z) })}
            onSelectZone={(kind, idx) => setActiveZone({ kind, idx })}
            onSelectTop={() => { setTab("top"); setActiveZone(null); }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground leading-relaxed">
          <p className="font-semibold text-foreground text-[11px] mb-1">How it works</p>
          <p>• <strong>Photo masks</strong> — shaped cut-outs the customer uploads photos into (heart, circle, custom SVG…)</p>
          <p>• <strong>Text zones</strong> — areas where customer types personalised text with your chosen fonts &amp; colors</p>
          <p>• <strong>Top layer</strong> — overlay artwork (frame, sticker) printed above everything</p>
          <p className="mt-1.5">Click any zone in the preview to select it, then drag to move or use the corner handle to resize.</p>
        </div>
      </div>

      {/* Base image */}
      <div className="space-y-2 p-3 rounded-lg border border-blue-200/60 bg-blue-50/30">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={canvas.useProductImageAsBase}
            onChange={e => update({ useProductImageAsBase: e.target.checked })} className="accent-blue-500" />
          <span className="text-[11px] font-medium">Use product image as base</span>
        </label>
        {!canvas.useProductImageAsBase && (
          <ImageUploadField value={canvas.baseImage} onChange={v => update({ baseImage: v })}
            placeholder="Paste URL or upload base image" label="Base image" />
        )}
      </div>

      {/* Photo masks */}
      <div className="space-y-2.5 p-3 rounded-lg border border-pink-200/60 bg-pink-50/30">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] uppercase tracking-wider font-bold text-pink-700/80">
            Photo masks <span className="font-normal text-muted-foreground normal-case">(shaped cut-outs)</span>
          </label>
          {canvas.masks.length < 12 && (
            <button type="button" onClick={addMask} className="h-7 px-2 rounded border border-border/60 bg-card text-[10px] flex items-center gap-1 hover:bg-muted">
              <Plus className="w-3 h-3" /> Add mask
            </button>
          )}
        </div>
        {canvas.masks.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">Add shaped cut-outs (circle, heart, star, custom SVG…) that customers upload photos into.</p>
        ) : (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              {canvas.masks.map((m, i) => (
                <div key={m.id} className={`flex items-center rounded-md border ${i === maskIdx ? "border-pink-500 bg-pink-500/10" : "border-border/50 bg-card"}`}>
                  <button type="button" onClick={() => { setMaskIdx(i); setTab("mask"); }}
                    className={`px-2 h-7 text-[11px] font-semibold ${i === maskIdx ? "text-pink-700" : "text-muted-foreground"}`}>
                    Mask {i + 1}
                  </button>
                  <button type="button" onClick={() => removeMask(i)} className="px-1 h-7 text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {activeMask && (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Mask shape</label>
                  <div className="grid grid-cols-6 gap-1">
                    {MASK_SHAPES.map(s => (
                      <button key={s.id} type="button" onClick={() => updateMask(maskIdx, { shape: s.id })}
                        className={`flex flex-col items-center gap-0.5 p-1.5 rounded-md border transition-all ${activeMask.shape === s.id ? "border-pink-500 bg-pink-500/10" : "border-border/40 bg-card hover:border-border/80"}`}>
                        <ShapeIcon shape={s.id} />
                        <span className="text-[9px] font-medium">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {activeMask.shape === "custom-image" && (
                  <ImageUploadField value={activeMask.maskImageUrl} onChange={v => updateMask(maskIdx, { maskImageUrl: v })}
                    placeholder="Upload SVG silhouette" label="Custom shape (SVG only)" accept="image/svg+xml,.svg" svgOnly />
                )}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Label shown to customer</label>
                  <input value={activeMask.label} onChange={e => updateMask(maskIdx, { label: e.target.value })}
                    placeholder="e.g. Upload your pet photo"
                    className="w-full h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[11px] outline-none focus:border-primary/50 mt-0.5" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                  <input type="checkbox" checked={activeMask.required} onChange={e => updateMask(maskIdx, { required: e.target.checked })} className="accent-pink-500" />
                  Required — customer must upload an image for this mask
                </label>
              </div>
            )}
          </>
        )}
      </div>

      {/* Top overlay */}
      <div className="space-y-2 p-3 rounded-lg border border-emerald-200/60 bg-emerald-50/30">
        <ImageUploadField value={canvas.overlayImage} onChange={v => update({ overlayImage: v })}
          placeholder="Upload transparent PNG overlay" label="Top layer (overlay)" />
        <p className="text-[9px] text-muted-foreground italic">Overlay artwork above zones — e.g. a frame, sticker, or brand header.</p>
      </div>

      {/* Image zones */}
      <ZoneList
        zones={canvas.imageZones} onChange={z => update({ imageZones: z })}
        kind="image" activeIdx={activeZone?.kind === "image" ? activeZone.idx : -1}
        onSelect={idx => setActiveZone({ kind: "image", idx })}
      />

      {/* Text zones */}
      <ZoneList
        zones={canvas.textZones} onChange={z => update({ textZones: z })}
        kind="text" activeIdx={activeZone?.kind === "text" ? activeZone.idx : -1}
        onSelect={idx => setActiveZone({ kind: "text", idx })}
      />
    </div>
  );
}

// ── ProductCustomizer — the public export ─────────────────────────────────────

/**
 * Drop-in product customiser editor.
 *
 * @example
 * <ProductCustomizer
 *   productImage="https://cdn.example.com/mug.jpg"
 *   initialConfig={product.customizerConfig}
 *   onSave={async (config) => {
 *     await fetch(`/api/products/${id}`, {
 *       method: "PATCH",
 *       headers: { "Content-Type": "application/json" },
 *       body: JSON.stringify({ customizerConfig: config }),
 *     });
 *   }}
 *   onUpload={async (file) => {
 *     const fd = new FormData();
 *     fd.append("file", file);
 *     const { url } = await fetch("/api/upload", { method: "POST", body: fd }).then(r => r.json());
 *     return url;
 *   }}
 * />
 */
export function ProductCustomizer({
  productImage,
  initialConfig,
  onSave,
  onUpload,
  title = "Customisation setup",
}: ProductCustomizerProps) {
  const [cfg, setCfg] = useState<CustomizerConfig>(() => {
    if (!initialConfig) return DEFAULT_CONFIG;
    const merged: CustomizerConfig = { ...DEFAULT_CONFIG, ...initialConfig };
    if (merged.canvas) merged.canvas = migrateCanvas(merged.canvas);
    return merged;
  });

  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState<"idle" | "ok" | "err">("idle");
  const [errMsg,  setErrMsg]  = useState("");

  const handleSave = async () => {
    setSaving(true);
    setStatus("idle");
    try {
      await onSave(cfg);
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      setErrMsg((e as { message?: string })?.message ?? "Save failed");
      setStatus("err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <UploadCtx.Provider value={onUpload}>
      <div className="min-h-screen bg-muted/20 pb-12">
        {/* Sticky header */}
        <header className="sticky top-0 z-10 bg-card border-b border-border/60 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm truncate">{title}</h1>
            <p className="text-[10px] text-muted-foreground">Configure photo masks, text zones, and overlays</p>
          </div>
          <div className="flex items-center gap-2">
            {status === "ok" && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            {status === "err" && (
              <span className="flex items-center gap-1 text-xs text-destructive" title={errMsg}>
                <AlertCircle className="w-3.5 h-3.5" /> Failed
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </header>

        <div className="max-w-3xl mx-auto p-4">
          <CustomiserPanel cfg={cfg} setCfg={setCfg} productImage={productImage} />
        </div>
      </div>
    </UploadCtx.Provider>
  );
}

// Re-export defaults so consumers can initialise from scratch
export { DEFAULT_CONFIG, DEFAULT_CANVAS };

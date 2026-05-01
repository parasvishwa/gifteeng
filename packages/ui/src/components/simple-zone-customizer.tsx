"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Pencil, Upload, X, Check } from "lucide-react";
import type { CanvasEditorChange, CanvasEditorProduct } from "./canvas-editor";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ZoneShape =
  | "free"              // default / no mask — fills the whole rectangle
  | "square"            // locked 1:1 rectangle (admin display hint)
  | "circle"            // TRUE circle — admin auto-snaps zone w === h
  | "oval"              // ellipse — fills whatever rectangle the zone is
  | "custom-image";     // uploaded black silhouette; black pixels become the mask

export interface SimpleZone {
  id: string;
  x: number; y: number; w: number; h: number; // percent (0-100)
  label: string;
  // ── Image-zone shape mask (image zones only) ────────────────────────────
  shape?: ZoneShape;    // default "free"
  // Corner radius for "free" / "square" shapes — percent of the zone's
  // smaller dimension (0 = sharp, 50 = pill). Defaults to 8.
  cornerRadius?: number;
  maskImageUrl?: string; // required when shape === "custom-image"
  // ── Admin-curated icon / logo library for this zone ─────────────────────
  // When non-empty, the customer sees these as clickable picks BEFORE the
  // "Upload your own" button (e.g. monogram letters, flags, religion icons).
  allowedIcons?: Array<{ id: string; url: string; label?: string }>;
  // Text-zone palette: admin defines allowed options, customer picks one.
  allowedFonts?:   string[];  // CSS font-family strings
  allowedColors?:  string[];  // hex "#RRGGBB"
  defaultFontSize?: number;   // percent of zone height, 20-200
  fontWeight?:     number;    // 400 | 600 | 700 — fixed by admin
  // ── Customiser v2 per-text-zone runtime toggles ─────────────────────────
  // When true, the customer can drag the rendered text within the zone
  // bounding box at runtime. Position offsets persisted in
  // fills.textPositions[zoneId] (% of zone w/h, clamped 0-100).
  customerCanDrag?: boolean;
  // When true, the customer sees the font-size slider in the inline editor.
  // Otherwise the size slider is hidden (size is fixed at defaultFontSize).
  customerCanResize?: boolean;
}

export interface TextStyleChoice {
  fontFamily?:  string;  // from zone.allowedFonts
  fontColor?:   string;  // from zone.allowedColors
  fontSizePct?: number;  // percent of zone height, customer-chosen (20–200)
}

const DEFAULT_FONT_FAMILY = "'Outfit', 'DM Sans', Arial, sans-serif";
const DEFAULT_FONT_COLOR  = "#111111";
const DEFAULT_FONT_WEIGHT = 600;
const DEFAULT_FONT_SIZE_PCT = 70;

// ─────────────────────────────────────────────────────────────────────────────
// Google Fonts dynamic loader
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_FONTS = new Set([
  "arial", "georgia", "impact", "verdana", "tahoma",
  "times new roman", "courier new", "comic sans ms", "brush script mt",
  "sans-serif", "serif", "monospace", "cursive", "system-ui",
]);

export function extractFontName(family: string): string | null {
  if (!family) return null;
  const m = family.match(/'([^']+)'/) || family.match(/"([^"]+)"/);
  if (m) return m[1];
  const first = family.split(",")[0].trim();
  return first || null;
}

/** Inject <link> for a Google Font if the family name isn't a system font. No-op SSR. */
export function loadGoogleFont(family: string): void {
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

/** Resolves once the given font is actually loaded (or after timeout). */
export async function ensureFontLoaded(
  family: string,
  weight: number,
  sizePx: number,
): Promise<void> {
  if (typeof document === "undefined" || !(document as any).fonts) return;
  try {
    await (document as any).fonts.load(`${weight} ${sizePx}px ${family}`);
  } catch {
    /* ignore */
  }
}

function resolveZoneStyle(
  zone: SimpleZone,
  choice: TextStyleChoice | undefined,
): { fontFamily: string; fontColor: string; fontWeight: number; fontSizePct: number } {
  const allowedFonts  = zone.allowedFonts  ?? [];
  const allowedColors = zone.allowedColors ?? [];
  const pickedFont = choice?.fontFamily && allowedFonts.includes(choice.fontFamily)
    ? choice.fontFamily
    : allowedFonts[0];
  const pickedColor = choice?.fontColor && allowedColors.includes(choice.fontColor)
    ? choice.fontColor
    : allowedColors[0];
  const defaultSizePct = typeof zone.defaultFontSize === "number" && zone.defaultFontSize > 0
    ? zone.defaultFontSize
    : DEFAULT_FONT_SIZE_PCT;
  return {
    fontFamily:  pickedFont  || DEFAULT_FONT_FAMILY,
    fontColor:   pickedColor || DEFAULT_FONT_COLOR,
    fontWeight:  zone.fontWeight || DEFAULT_FONT_WEIGHT,
    fontSizePct: typeof choice?.fontSizePct === "number" && choice.fontSizePct > 0
      ? choice.fontSizePct
      : defaultSizePct,
  };
}

// ─── Mask schema (mirrors admin's MaskSlot — see super-admin/customizer/page.tsx) ───
export type SimpleMaskShape =
  | "none" | "rect" | "rounded-rect" | "circle" | "oval"
  | "heart" | "hexagon" | "arch" | "star" | "diamond" | "pentagon"
  | "custom-image";

export interface SimpleMaskSlot {
  id: string;
  label: string;
  shape: SimpleMaskShape;
  maskImageUrl: string; // only when shape === "custom-image"
  pos: { x: number; y: number; w: number; h: number }; // percentages 0-100
  required: boolean;
}

export interface SimpleCustomizerFills {
  images: Record<string, string>;            // zoneId → dataURL (uploaded image)
  texts:  Record<string, string>;            // zoneId → entered text
  textStyles?: Record<string, TextStyleChoice>; // zoneId → customer font/color choice
  maskImages?: Record<string, string>;       // maskId → uploaded photo URL
  // Customiser v2: per-text-zone drag offset (only present for zones whose
  // SimpleZone.customerCanDrag === true). Stored as percent of the zone's
  // own width/height so it scales with the canvas. Defaults to {0,0}.
  textPositions?: Record<string, { dxPct: number; dyPct: number }>;
}

export interface SimpleCustomizerPayload {
  __simpleZones: true;
  baseImage: string;
  imageZones: SimpleZone[];
  textZones: SimpleZone[];
  masks?: SimpleMaskSlot[];
  fills: SimpleCustomizerFills;
  imageScales?: Record<string, number>;
  imageRotations?: Record<string, number>;
}

export interface SimpleZoneCustomizerProps {
  product: CanvasEditorProduct;
  baseImage: string;                // product.imageUrl or canvas.baseImage
  overlayImage?: string | null;     // optional transparent PNG rendered above zones
  imageZones: SimpleZone[];
  textZones: SimpleZone[];
  /** Mask slots saved by admin in unified Customiser. Empty / undefined → no masks. */
  masks?: SimpleMaskSlot[];
  initialCanvasJSON?: string | null; // restore from cart
  onChange?: (change: CanvasEditorChange) => void;
  className?: string;
  /**
   * If provided, user-uploaded photos are POST-ed here and stored as a
   * persistent server URL instead of a base64 data-URL. Prevents huge canvas
   * JSON blobs when users upload many photos. Response must be { url: string }.
   */
  fileUploadUrl?: string;
}

// Mask shape → SVG path (byte-identical to admin LayerPreview shapePath()).
// We always emit relative to a 0,0 / w x h box so the path can be reused
// either in a per-mask <svg viewBox="0 0 w h"> for outline OR inside a
// <clipPath> for clipping the customer's uploaded photo.
export function simpleShapePath(
  shape: SimpleMaskShape, x: number, y: number, w: number, h: number,
): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadToServer(file: File, uploadUrl: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("ownerType", "customization");
  const res = await fetch(uploadUrl, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const data = await res.json() as { url?: string };
  if (!data.url) throw new Error("No URL in upload response");
  return data.url;
}

function parseInitialFills(initial?: string | null): {
  fills: SimpleCustomizerFills;
  imageScales: Record<string, number>;
  imageRotations: Record<string, number>;
  maskScales: Record<string, number>;
  maskRotations: Record<string, number>;
} {
  const empty = {
    fills: { images: {}, texts: {}, textStyles: {}, maskImages: {}, textPositions: {} },
    imageScales: {}, imageRotations: {},
    maskScales: {}, maskRotations: {},
  };
  if (!initial) return empty;
  try {
    const parsed = JSON.parse(initial) as SimpleCustomizerPayload & {
      maskScales?: Record<string, number>;
      maskRotations?: Record<string, number>;
    };
    if (parsed && parsed.__simpleZones && parsed.fills) {
      return {
        fills: {
          images: { ...(parsed.fills.images ?? {}) },
          texts:  { ...(parsed.fills.texts  ?? {}) },
          textStyles: { ...(parsed.fills.textStyles ?? {}) },
          maskImages: { ...(parsed.fills.maskImages ?? {}) },
          textPositions: { ...(parsed.fills.textPositions ?? {}) },
        },
        imageScales:    { ...(parsed.imageScales    ?? {}) },
        imageRotations: { ...(parsed.imageRotations ?? {}) },
        maskScales:     { ...(parsed.maskScales     ?? {}) },
        maskRotations:  { ...(parsed.maskRotations  ?? {}) },
      };
    }
  } catch { /* ignore */ }
  return empty;
}

// Render the composite preview to a hidden canvas, return dataURL.
async function composePreview(
  baseImage: string,
  imageZones: SimpleZone[],
  textZones: SimpleZone[],
  fills: SimpleCustomizerFills,
  imageScales?: Record<string, number>,
  imageRotations?: Record<string, number>,
  masks?: SimpleMaskSlot[],
  maskScales?: Record<string, number>,
  maskRotations?: Record<string, number>,
): Promise<string> {
  try {
    const base = await loadImage(baseImage);
    const W = base.naturalWidth || 1200;
    const H = base.naturalHeight || 1200;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(base, 0, 0, W, H);

    // Draw masks (between base and zones — same z-order as the on-screen stage)
    if (masks && masks.length) {
      for (const m of masks) {
        const src = (fills.maskImages ?? {})[m.id];
        if (!src) continue; // empty mask = nothing on the composite (the dashed outline is editor-only)
        try {
          const photo = await loadImage(src);
          const mx = (m.pos.x / 100) * W;
          const my = (m.pos.y / 100) * H;
          const mw = (m.pos.w / 100) * W;
          const mh = (m.pos.h / 100) * H;
          // Apply customer's zoom + rotate (CSS transform on screen → bake here).
          const mScale = (maskScales ?? {})[m.id] ?? 1;
          const mRotateDeg = (maskRotations ?? {})[m.id] ?? 0;
          const drawPhoto = () => {
            const ar = photo.naturalWidth / photo.naturalHeight;
            const boxAr = mw / mh;
            let sx = 0, sy = 0, sw = photo.naturalWidth, sh = photo.naturalHeight;
            if (ar > boxAr) { sw = photo.naturalHeight * boxAr; sx = (photo.naturalWidth - sw) / 2; }
            else            { sh = photo.naturalWidth / boxAr; sy = (photo.naturalHeight - sh) / 2; }
            if (mScale !== 1 || mRotateDeg !== 0) {
              ctx.save();
              ctx.translate(mx + mw / 2, my + mh / 2);
              if (mRotateDeg !== 0) ctx.rotate((mRotateDeg * Math.PI) / 180);
              ctx.scale(mScale, mScale);
              ctx.drawImage(photo, sx, sy, sw, sh, -mw / 2, -mh / 2, mw, mh);
              ctx.restore();
            } else {
              ctx.drawImage(photo, sx, sy, sw, sh, mx, my, mw, mh);
            }
          };
          ctx.save();
          if (m.shape === "custom-image" && m.maskImageUrl) {
            // Silhouette → composite via offscreen canvas with destination-in.
            try {
              const sil = await loadImage(m.maskImageUrl);
              const off = document.createElement("canvas");
              off.width = Math.max(1, Math.round(mw));
              off.height = Math.max(1, Math.round(mh));
              const octx = off.getContext("2d");
              if (octx) {
                const ar = photo.naturalWidth / photo.naturalHeight;
                const boxAr = mw / mh;
                let sx = 0, sy = 0, sw = photo.naturalWidth, sh = photo.naturalHeight;
                if (ar > boxAr) { sw = photo.naturalHeight * boxAr; sx = (photo.naturalWidth - sw) / 2; }
                else            { sh = photo.naturalWidth / boxAr; sy = (photo.naturalHeight - sh) / 2; }
                if (mScale !== 1 || mRotateDeg !== 0) {
                  octx.save();
                  octx.translate(off.width / 2, off.height / 2);
                  if (mRotateDeg !== 0) octx.rotate((mRotateDeg * Math.PI) / 180);
                  octx.scale(mScale, mScale);
                  octx.drawImage(photo, sx, sy, sw, sh, -off.width / 2, -off.height / 2, off.width, off.height);
                  octx.restore();
                } else {
                  octx.drawImage(photo, sx, sy, sw, sh, 0, 0, off.width, off.height);
                }
                octx.globalCompositeOperation = "destination-in";
                octx.drawImage(sil, 0, 0, off.width, off.height);
                ctx.drawImage(off, mx, my, mw, mh);
              }
            } catch { /* skip */ }
          } else if (m.shape === "circle") {
            // True inscribed circle — radius = min(w,h)/2, centred. Same
            // semantics as CSS clip-path: circle(closest-side at center).
            try {
              const r = Math.min(mw, mh) / 2;
              ctx.beginPath();
              ctx.arc(mx + mw / 2, my + mh / 2, r, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();
            } catch { /* skip clip on exotic browsers */ }
            drawPhoto();
          } else if (m.shape !== "none") {
            const path = simpleShapePath(m.shape, 0, 0, mw, mh);
            if (path) {
              try {
                const p2d = new Path2D(path);
                ctx.translate(mx, my);
                ctx.clip(p2d);
                ctx.translate(-mx, -my);
              } catch { /* old browser w/o Path2D - skip clip */ }
            }
            drawPhoto();
          } else {
            drawPhoto();
          }
          ctx.restore();
        } catch { /* ignore broken mask photo */ }
      }
    }

    // Draw image zones
    for (const z of imageZones) {
      const src = fills.images[z.id];
      if (!src) continue;
      try {
        const zImg = await loadImage(src);
        const zx = (z.x / 100) * W;
        const zy = (z.y / 100) * H;
        const zw = (z.w / 100) * W;
        const zh = (z.h / 100) * H;
        // object-fit: cover
        const ar = zImg.naturalWidth / zImg.naturalHeight;
        const zoneAr = zw / zh;
        let sx = 0, sy = 0, sw = zImg.naturalWidth, sh = zImg.naturalHeight;
        if (ar > zoneAr) {
          sw = zImg.naturalHeight * zoneAr;
          sx = (zImg.naturalWidth - sw) / 2;
        } else {
          sh = zImg.naturalWidth / zoneAr;
          sy = (zImg.naturalHeight - sh) / 2;
        }
        const scale = (imageScales ?? {})[z.id] ?? 1;
        const rotateDeg = (imageRotations ?? {})[z.id] ?? 0;
        if (scale !== 1 || rotateDeg !== 0) {
          ctx.save();
          ctx.translate(zx + zw / 2, zy + zh / 2);
          if (rotateDeg !== 0) ctx.rotate((rotateDeg * Math.PI) / 180);
          ctx.scale(scale, scale);
          ctx.drawImage(zImg, sx, sy, sw, sh, -zw / 2, -zh / 2, zw, zh);
          ctx.restore();
        } else {
          ctx.drawImage(zImg, sx, sy, sw, sh, zx, zy, zw, zh);
        }
      } catch { /* skip broken image */ }
    }

    // Draw text zones
    for (const z of textZones) {
      const txt = fills.texts[z.id];
      if (!txt) continue;
      const zx = (z.x / 100) * W;
      const zy = (z.y / 100) * H;
      const zw = (z.w / 100) * W;
      const zh = (z.h / 100) * H;
      const st = resolveZoneStyle(z, fills.textStyles?.[z.id]);
      const startFontSize = Math.max(10, Math.floor(zh * (st.fontSizePct / 100)));
      // Make sure the font (incl. any dynamically-loaded Google Font) is
      // actually available to the canvas BEFORE we draw, else canvas falls
      // back to Times/default.
      loadGoogleFont(st.fontFamily);
      await ensureFontLoaded(st.fontFamily, st.fontWeight, startFontSize);
      ctx.save();
      ctx.fillStyle = st.fontColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Shrink to fit width
      let size = startFontSize;
      ctx.font = `${st.fontWeight} ${size}px ${st.fontFamily}`;
      while (ctx.measureText(txt).width > zw * 0.98 && size > 8) {
        size -= 1;
        ctx.font = `${st.fontWeight} ${size}px ${st.fontFamily}`;
      }
      // Customiser v2 — apply per-zone customer drag offset (% of zone w/h)
      const tp = (fills.textPositions ?? {})[z.id];
      const offX = tp ? (tp.dxPct / 100) * zw : 0;
      const offY = tp ? (tp.dyPct / 100) * zh : 0;
      ctx.fillText(txt, zx + zw / 2 + offX, zy + zh / 2 + offY);
      ctx.restore();
    }

    return canvas.toDataURL("image/png", 0.92);
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SimpleZoneCustomizer({
  product,
  baseImage,
  overlayImage,
  imageZones,
  textZones,
  masks,
  initialCanvasJSON,
  onChange,
  className,
  fileUploadUrl,
}: SimpleZoneCustomizerProps): React.ReactElement {
  // Defensive: normalise inputs so a malformed saved config (missing fields,
  // nulls, partial pos) doesn't throw at render time. Customiser v2 added
  // several fields (customerCanDrag, textPositions, maskImages) — older saved
  // configs may not have them. Default everything before we read.
  const masksList: SimpleMaskSlot[] = Array.isArray(masks)
    ? masks
        .filter(m => m && typeof m === "object")
        .map((m): SimpleMaskSlot => ({
          id: m.id ?? `m-${Math.random().toString(36).slice(2)}`,
          label: m.label ?? "",
          shape: m.shape ?? "rect",
          maskImageUrl: m.maskImageUrl ?? "",
          pos: m.pos && typeof m.pos === "object"
            ? {
                x: typeof m.pos.x === "number" ? m.pos.x : 0,
                y: typeof m.pos.y === "number" ? m.pos.y : 0,
                w: typeof m.pos.w === "number" ? m.pos.w : 50,
                h: typeof m.pos.h === "number" ? m.pos.h : 50,
              }
            : { x: 20, y: 20, w: 60, h: 60 },
          required: !!m.required,
        }))
    : [];
  const [fills, setFills] = useState<SimpleCustomizerFills>(() => parseInitialFills(initialCanvasJSON).fills);
  const [imageScales, setImageScales] = useState<Record<string, number>>(() => parseInitialFills(initialCanvasJSON).imageScales);
  const [imageRotations, setImageRotations] = useState<Record<string, number>>(() => parseInitialFills(initialCanvasJSON).imageRotations);
  // Per-mask zoom + rotation. Same UX as image-zone editor — customer taps a
  // filled mask → bottom sheet with zoom slider + rotate knob → Apply persists.
  const [maskScales, setMaskScales] = useState<Record<string, number>>(() => parseInitialFills(initialCanvasJSON).maskScales);
  const [maskRotations, setMaskRotations] = useState<Record<string, number>>(() => parseInitialFills(initialCanvasJSON).maskRotations);
  const [editingMaskScale, setEditingMaskScale] = useState<{ mask: SimpleMaskSlot; scale: number; rotate: number } | null>(null);
  const [editingTextZone, setEditingTextZone] = useState<SimpleZone | null>(null);
  const [editingImageZoneScale, setEditingImageZoneScale] = useState<{ zone: SimpleZone; scale: number; rotate: number } | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [draftFont, setDraftFont]         = useState<string | undefined>(undefined);
  const [draftColor, setDraftColor]       = useState<string | undefined>(undefined);
  const [draftFontSizePct, setDraftFontSizePct] = useState<number>(DEFAULT_FONT_SIZE_PCT);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetZoneRef = useRef<string | null>(null);
  // Separate target for mask uploads — masks have their own fills bucket
  // so we don't accidentally overwrite an image-zone fill of the same id.
  const uploadTargetMaskRef = useRef<string | null>(null);
  const [iconPickerZone, setIconPickerZone] = useState<SimpleZone | null>(null);

  // Customiser v2 — runtime text drag (zones with customerCanDrag === true).
  // Tracks active drag pointer state. Position offsets are stored in
  // fills.textPositions[zoneId] as % of zone w/h (clamped 0–100).
  const textDragRef = useRef<
    | {
        zoneId: string;
        startClientX: number;
        startClientY: number;
        zoneRect: DOMRect;
        startDxPct: number;
        startDyPct: number;
      }
    | null
  >(null);

  // Emit change whenever fills or scales update
  const emitChange = useCallback(async () => {
    if (!onChange) return;
    const payload: SimpleCustomizerPayload & {
      maskScales?: Record<string, number>;
      maskRotations?: Record<string, number>;
    } = {
      __simpleZones: true,
      baseImage,
      imageZones,
      textZones,
      masks: masksList,
      fills,
      imageScales,
      imageRotations,
      maskScales,
      maskRotations,
    };
    const previewDataUrl = await composePreview(baseImage, imageZones, textZones, fills, imageScales, imageRotations, masksList, maskScales, maskRotations);
    const imagesUsed = [
      ...Object.values(fills.images),
      ...Object.values(fills.maskImages ?? {}),
    ].filter(Boolean);
    onChange({
      canvasJSON: JSON.stringify(payload),
      previewDataUrl,
      fontsUsed: [],
      imagesUsed,
    });
  }, [onChange, baseImage, imageZones, textZones, masksList, fills, imageScales, imageRotations, maskScales, maskRotations]);

  useEffect(() => {
    const h = setTimeout(() => { void emitChange(); }, 150);
    return () => clearTimeout(h);
  }, [emitChange]);

  // Preload every admin-allowed font across all text zones so both the HTML
  // overlay and the canvas composite can render them without FOUT/fallback.
  useEffect(() => {
    const families = new Set<string>();
    for (const z of textZones) {
      (z.allowedFonts ?? []).forEach(f => families.add(f));
    }
    families.forEach(f => loadGoogleFont(f));
  }, [textZones]);

  // ── Image zone handlers ─────────────────────────────────────────────────
  const onImageZoneClick = (zoneId: string) => {
    uploadTargetZoneRef.current = zoneId;
    uploadTargetMaskRef.current = null;
    const zone = imageZones.find((z) => z.id === zoneId);
    // If already filled → open the image edit sheet (scale / rotate / replace / remove)
    if (fills.images[zoneId] && zone) {
      setEditingImageZoneScale({ zone, scale: imageScales[zoneId] ?? 1, rotate: imageRotations[zoneId] ?? 0 });
      return;
    }
    if (zone && (zone.allowedIcons?.length ?? 0) > 0) {
      setIconPickerZone(zone);
      return;
    }
    imageInputRef.current?.click();
  };

  const pickIconForZone = (zoneId: string, url: string) => {
    setFills((prev) => ({ ...prev, images: { ...prev.images, [zoneId]: url } }));
    setIconPickerZone(null);
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const zoneId = uploadTargetZoneRef.current;
    const maskId = uploadTargetMaskRef.current;
    e.target.value = "";
    uploadTargetMaskRef.current = null; // consumed
    if (!file || (!zoneId && !maskId)) return;
    const setUrl = (url: string) => {
      if (maskId) {
        setFills(prev => ({
          ...prev,
          maskImages: { ...(prev.maskImages ?? {}), [maskId]: url },
        }));
      } else if (zoneId) {
        setFills(prev => ({ ...prev, images: { ...prev.images, [zoneId]: url } }));
      }
    };
    try {
      const url = fileUploadUrl
        ? await uploadToServer(file, fileUploadUrl)
        : await fileToDataUrl(file);
      setUrl(url);
    } catch {
      // Silently fall back to data URL on server upload failure
      try {
        const dataUrl = await fileToDataUrl(file);
        setUrl(dataUrl);
      } catch { /* ignore */ }
    }
  };

  // ── Mask handlers ───────────────────────────────────────────────────────
  // Empty mask → file picker. Filled mask → edit sheet (zoom + rotate +
  // change/remove). Same UX shape as image zones above.
  const onMaskClick = (maskId: string) => {
    const filled = !!(fills.maskImages ?? {})[maskId];
    if (filled) {
      const m = masksList.find(x => x.id === maskId);
      if (!m) return;
      setEditingMaskScale({
        mask:   m,
        scale:  maskScales[maskId]    ?? 1,
        rotate: maskRotations[maskId] ?? 0,
      });
      return;
    }
    uploadTargetMaskRef.current = maskId;
    uploadTargetZoneRef.current = null;
    imageInputRef.current?.click();
  };
  const clearMask = (maskId: string) => {
    setFills(prev => {
      const copy = { ...(prev.maskImages ?? {}) };
      delete copy[maskId];
      return { ...prev, maskImages: copy };
    });
    // Reset zoom + rotation along with the photo so the next upload starts clean.
    setMaskScales(prev => { const c = { ...prev }; delete c[maskId]; return c; });
    setMaskRotations(prev => { const c = { ...prev }; delete c[maskId]; return c; });
  };

  const clearImageZone = (zoneId: string) => {
    setFills(prev => {
      const copy = { ...prev.images };
      delete copy[zoneId];
      return { ...prev, images: copy };
    });
    setImageScales(prev => {
      const copy = { ...prev };
      delete copy[zoneId];
      return copy;
    });
  };

  // ── Text zone handlers ──────────────────────────────────────────────────
  const openTextEditor = (zone: SimpleZone) => {
    const existing = fills.textStyles?.[zone.id];
    const defaultSizePct = typeof zone.defaultFontSize === "number" && zone.defaultFontSize > 0
      ? zone.defaultFontSize : DEFAULT_FONT_SIZE_PCT;
    setTextDraft(fills.texts[zone.id] ?? "");
    setDraftFont(existing?.fontFamily ?? zone.allowedFonts?.[0]);
    setDraftColor(existing?.fontColor ?? zone.allowedColors?.[0]);
    setDraftFontSizePct(typeof existing?.fontSizePct === "number" ? existing.fontSizePct : defaultSizePct);
    setEditingTextZone(zone);
  };
  const saveTextEditor = () => {
    if (!editingTextZone) return;
    const zoneId = editingTextZone.id;
    const styleChoice: TextStyleChoice = { fontSizePct: draftFontSizePct };
    if (draftFont)  styleChoice.fontFamily = draftFont;
    if (draftColor) styleChoice.fontColor  = draftColor;
    setFills(prev => ({
      ...prev,
      texts: { ...prev.texts, [zoneId]: textDraft.trim() },
      textStyles: { ...(prev.textStyles ?? {}), [zoneId]: styleChoice },
    }));
    setEditingTextZone(null);
    setTextDraft("");
    setDraftFont(undefined);
    setDraftColor(undefined);
    setDraftFontSizePct(DEFAULT_FONT_SIZE_PCT);
  };
  const closeTextEditor = () => {
    setEditingTextZone(null);
    setTextDraft("");
    setDraftFont(undefined);
    setDraftColor(undefined);
    setDraftFontSizePct(DEFAULT_FONT_SIZE_PCT);
  };
  const clearTextZone = (zoneId: string) => {
    setFills(prev => {
      const copyTexts = { ...prev.texts };
      delete copyTexts[zoneId];
      const copyStyles = { ...(prev.textStyles ?? {}) };
      delete copyStyles[zoneId];
      return { ...prev, texts: copyTexts, textStyles: copyStyles };
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const hasAnyFill =
    Object.keys(fills.images).length > 0
    || Object.values(fills.texts).some(t => !!t)
    || Object.keys(fills.maskImages ?? {}).length > 0;

  return (
    <div className={className}>
      {/* Intro hint */}
      <div className="px-4 pt-3 pb-2 text-center">
        <p className="text-[11px] uppercase tracking-widest font-bold text-gray-400">Simple Customiser</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Tap a highlighted slot to upload an image or add text
        </p>
      </div>

      {/* Stage — capped at 55 vh so large product photos never overflow the screen.
           Zone overlays use %-based positioning relative to this container,
           so they remain correctly aligned for square/landscape images. */}
      <div className="relative mx-auto w-full max-w-sm px-4 py-2">
        <div
          className="relative w-full overflow-hidden rounded-xl bg-gray-50 border border-gray-200 shadow-sm"
          style={{ maxHeight: "55vh" }}
        >
          {baseImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={baseImage}
              alt={product.title ?? "product"}
              className="block w-full h-auto select-none"
              style={{ maxHeight: "55vh", objectFit: "cover", objectPosition: "top center" }}
              draggable={false}
            />
          ) : (
            <div className="aspect-square w-full flex items-center justify-center text-sm text-gray-400">No base image</div>
          )}

          {/* Mask overlays — admin-defined photo slots with shape clipping.
               Visual treatment must match admin LayerPreview pixel-for-pixel:
               same shapePath() formula, same dashed-outline colours, same
               object-fit: cover behaviour for the customer's uploaded photo. */}
          {masksList.map((m) => {
            if (m.shape === "none") return null;
            const filled = (fills.maskImages ?? {})[m.id];
            const clipId = `gft-mask-${m.id}`;
            // Use a 100x100 normalised viewBox + preserveAspectRatio="none" so
            // the path stretches to match the rectangular bounding box exactly
            // — same trick the admin uses (preserveAspectRatio="none" on the
            // outline SVG inside a percent-positioned container).
            const pathD = m.shape === "custom-image"
              ? ""
              : simpleShapePath(m.shape, 0, 0, 100, 100);
            return (
              <button
                key={`mask-${m.id}`}
                type="button"
                onClick={() => onMaskClick(m.id)}
                className="absolute group"
                style={{
                  left:   `${m.pos.x}%`,
                  top:    `${m.pos.y}%`,
                  width:  `${m.pos.w}%`,
                  height: `${m.pos.h}%`,
                  padding: 0,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {filled ? (
                  m.shape === "custom-image" && m.maskImageUrl ? (
                    // Custom silhouette mask via mask-image. The photo fills
                    // the rectangle (object-fit:cover) and the silhouette PNG
                    // alpha-masks it. Customer's zoom + rotate apply to the
                    // photo; silhouette stays put (matches the bake math).
                    <span
                      className="block relative w-full h-full overflow-hidden"
                      style={{
                        WebkitMaskImage: `url(${m.maskImageUrl})`,
                        maskImage:       `url(${m.maskImageUrl})`,
                        WebkitMaskRepeat: "no-repeat",
                        maskRepeat:       "no-repeat",
                        WebkitMaskSize:   "100% 100%",
                        maskSize:         "100% 100%",
                        WebkitMaskPosition: "center",
                        maskPosition:       "center",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={filled}
                        alt={m.label}
                        className="absolute inset-0 w-full h-full object-cover"
                        draggable={false}
                        style={{
                          transform: `scale(${maskScales[m.id] ?? 1}) rotate(${maskRotations[m.id] ?? 0}deg)`,
                          transformOrigin: "center",
                        }}
                      />
                    </span>
                  ) : m.shape === "circle" ? (
                    // ── Circle — TRUE inscribed circle ────────────────────
                    // SVG clipPath with `clipPathUnits="objectBoundingBox"`
                    // stretches the path to the box, turning a 1×1 circle
                    // into an oval whenever the zone's pixel w ≠ h. CSS
                    // `clip-path: circle(closest-side at center)` resolves
                    // the radius as the smaller distance from centre to
                    // edge, i.e. min(w,h)/2 — a true circle every time.
                    // Universal browser support (Chrome 55+, Safari 9.1+).
                    <span
                      className="block relative w-full h-full overflow-hidden ring-2 ring-primary/30"
                      style={{
                        clipPath:        "circle(closest-side at center)",
                        WebkitClipPath:  "circle(closest-side at center)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={filled}
                        alt={m.label}
                        className="absolute inset-0 w-full h-full object-cover"
                        draggable={false}
                        style={{
                          transform: `scale(${maskScales[m.id] ?? 1}) rotate(${maskRotations[m.id] ?? 0}deg)`,
                          transformOrigin: "center",
                        }}
                      />
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); clearMask(m.id); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors z-10"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </span>
                  ) : (
                    // Geometric shape — apply clip-path via inline SVG <clipPath>
                    // on a 100x100 viewBox stretched to the bounding box. The
                    // clipPath path is identical to admin's shapePath(), giving
                    // byte-identical visuals.
                    <span className="block relative w-full h-full">
                      <svg
                        width="0"
                        height="0"
                        style={{ position: "absolute", width: 0, height: 0 }}
                        aria-hidden
                      >
                        <defs>
                          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                            <path
                              d={simpleShapePath(m.shape, 0, 0, 1, 1)}
                            />
                          </clipPath>
                        </defs>
                      </svg>
                      <span
                        className="block relative w-full h-full overflow-hidden"
                        style={{ clipPath: `url(#${clipId})`, WebkitClipPath: `url(#${clipId})` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={filled}
                          alt={m.label}
                          className="absolute inset-0 w-full h-full object-cover"
                          draggable={false}
                          style={{
                            transform: `scale(${maskScales[m.id] ?? 1}) rotate(${maskRotations[m.id] ?? 0}deg)`,
                            transformOrigin: "center",
                          }}
                        />
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); clearMask(m.id); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors z-10"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </span>
                  )
                ) : (
                  // Empty placeholder — dashed shape outline + label.
                  // Uses preserveAspectRatio="none" so the path stretches to
                  // match the exact rectangle the admin defined (matches the
                  // admin LayerPreview's full-mode mask outline rendering).
                  <span className="block relative w-full h-full">
                    {m.shape === "custom-image" && m.maskImageUrl ? (
                      // Faint silhouette ghost so customer can see the shape
                      <span
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          WebkitMaskImage: `url(${m.maskImageUrl})`,
                          maskImage:       `url(${m.maskImageUrl})`,
                          WebkitMaskRepeat: "no-repeat",
                          maskRepeat:       "no-repeat",
                          WebkitMaskSize:   "100% 100%",
                          maskSize:         "100% 100%",
                          WebkitMaskPosition: "center",
                          maskPosition:       "center",
                          background: "rgba(239,55,82,0.20)",
                          border: "2px dashed rgba(239,55,82,0.55)",
                        }}
                      />
                    ) : pathD ? (
                      // For "circle" the SVG must NOT stretch — `xMidYMid meet`
                      // letterboxes the 100×100 viewBox to the smaller axis,
                      // giving a true round outline. Every other shape (rect,
                      // oval, heart, star, …) stretches to fill the rectangle
                      // (`preserveAspectRatio="none"`) which is correct for
                      // those — oval is meant to elongate, etc.
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio={m.shape === "circle" ? "xMidYMid meet" : "none"}
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        aria-hidden
                      >
                        <path
                          d={pathD}
                          fill="rgba(239,55,82,0.10)"
                          stroke="rgba(239,55,82,0.80)"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    ) : null}
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-primary pointer-events-none">
                      <Upload className="w-5 h-5" />
                      <span className="text-[10px] font-bold truncate max-w-full px-1">{m.label}</span>
                    </span>
                  </span>
                )}
              </button>
            );
          })}

          {/* Image zone overlays */}
          {imageZones.map(z => {
            const filled = fills.images[z.id];
            const shape = (z.shape as ZoneShape | undefined) ?? "free";
            // ── Mask ────────────────────────────────────────────────────────
            // For "circle" we render a TRUE circle (admin uses min(w,h)/2).
            // Circle sizing: flex-centering wrapper + inner element using
            // aspect-ratio:1 + width:100% + max-height:100% gives a perfect
            // circle of diameter min(zone_w_px, zone_h_px) in all browsers,
            // without relying on cqmin container-query support.
            const maskStyle: React.CSSProperties = (() => {
              if (shape === "custom-image" && z.maskImageUrl) {
                return {
                  WebkitMaskImage: `url(${z.maskImageUrl})`,
                  maskImage:       `url(${z.maskImageUrl})`,
                  WebkitMaskRepeat: "no-repeat",
                  maskRepeat:       "no-repeat",
                  WebkitMaskSize:   "100% 100%",
                  maskSize:         "100% 100%",
                  WebkitMaskPosition: "center",
                  maskPosition:       "center",
                  borderRadius: 0,
                };
              }
              return {};
            })();
            // Resolve outline radius:
            //   • circle → fully round (zone is auto-squared by admin so it
            //     reads as a perfect circle on the customer's screen, even
            //     when the product image rectangle distorts pixel ratios).
            //   • oval   → 50% on each side → ellipse fills the rectangle.
            //   • custom-image → 0 (the silhouette decides shape).
            //   • free / square → admin-controlled cornerRadius (% of side).
            const cornerR = typeof z.cornerRadius === "number" ? z.cornerRadius : 8;
            const cornerPctClamped = Math.max(0, Math.min(50, cornerR));
            const outlineRadius =
              shape === "circle"       ? "9999px" :
              shape === "oval"         ? "50%"    :
              shape === "custom-image" ? "0"      :
                                         `${cornerPctClamped}%`;
            // For "circle" we use `clip-path: circle(closest-side at center)`
            // — the most reliable cross-browser way to draw a TRUE circle
            // inside a rectangular box. `closest-side` resolves to the
            // smallest distance from centre to an edge, i.e. min(w,h)/2,
            // so the visible photo is always inscribed in the zone as a
            // perfect circle even when the zone rectangle is slightly off
            // square due to product-image aspect ratio differences.
            // Oval keeps the rectangular box with a 50% borderRadius so it
            // intentionally reads as an ellipse.
            const isCircle = shape === "circle";
            const circleClip = "circle(closest-side at center)";
            return (
              <button
                key={`img-${z.id}`}
                onClick={() => onImageZoneClick(z.id)}
                type="button"
                className="absolute group"
                style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
              >
                {filled ? (
                  isCircle ? (
                    /* Circle — filled. The full-rect span is clipped to a
                       circle via clip-path: circle(closest-side at center)
                       which gives a TRUE inscribed circle regardless of the
                       parent rectangle's aspect ratio. */
                    <span
                      className="block overflow-hidden ring-2 ring-primary/70 hover:ring-primary"
                      style={{ position: "relative", width: "100%", height: "100%", clipPath: circleClip, WebkitClipPath: circleClip }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={filled}
                        alt={z.label}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ transform: `scale(${imageScales[z.id] ?? 1}) rotate(${imageRotations[z.id] ?? 0}deg)`, transformOrigin: "center" }}
                      />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full px-2 py-1 text-[10px] font-bold text-gray-800 flex items-center gap-1">
                          <Camera className="w-3 h-3" /> Change
                        </span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); clearImageZone(z.id); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                        style={{ zIndex: 2 }}
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </span>
                  ) : (
                    /* Non-circle — filled */
                    <span
                      className="block overflow-hidden ring-2 ring-primary/70 hover:ring-primary"
                      style={{ position: "relative", width: "100%", height: "100%", borderRadius: outlineRadius, ...maskStyle }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={filled} alt={z.label} className="absolute inset-0 w-full h-full object-cover" style={{ transform: `scale(${imageScales[z.id] ?? 1}) rotate(${imageRotations[z.id] ?? 0}deg)`, transformOrigin: "center" }} />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full px-2 py-1 text-[10px] font-bold text-gray-800 flex items-center gap-1">
                          <Camera className="w-3 h-3" /> Edit
                        </span>
                      </span>
                    </span>
                  )
                ) : (
                  isCircle ? (
                    // Circle - empty placeholder. The dashed ring is drawn
                    // as inline SVG with preserveAspectRatio xMidYMid meet,
                    // so it scales to the smaller axis - guaranteeing a
                    // true round shape regardless of parent aspect ratio.
                    <span style={{ position: "absolute", inset: 0 }}>
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="xMidYMid meet"
                        className="block w-full h-full"
                        aria-hidden
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="48"
                          fill="rgba(239,55,82,0.10)"
                          stroke="rgba(239,55,82,0.80)"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                        />
                      </svg>
                      <span
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-primary pointer-events-none"
                      >
                        <Upload className="w-5 h-5" />
                        <span className="text-[10px] font-bold">{z.label}</span>
                      </span>
                    </span>
                  ) : (
                    /* Non-circle — empty placeholder */
                    <span
                      className="flex items-center justify-center border-2 border-dashed border-primary/80 bg-primary/10 hover:bg-primary/20 transition-colors"
                      style={{ position: "relative", width: "100%", height: "100%", borderRadius: outlineRadius }}
                    >
                      {/* Preview the custom-image mask shape as a faint outline */}
                      {shape === "custom-image" && z.maskImageUrl && (
                        <span
                          className="absolute inset-0 opacity-40 pointer-events-none"
                          style={{
                            WebkitMaskImage: `url(${z.maskImageUrl})`,
                            maskImage: `url(${z.maskImageUrl})`,
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                            WebkitMaskSize: "100% 100%",
                            maskSize: "100% 100%",
                            background: "rgba(239,55,82,0.25)",
                          }}
                        />
                      )}
                      <span className="relative flex flex-col items-center gap-1 text-primary">
                        <Upload className="w-5 h-5" />
                        <span className="text-[10px] font-bold">{z.label}</span>
                      </span>
                    </span>
                  )
                )}
              </button>
            );
          })}

          {/* Text zone overlays */}
          {textZones.map(z => {
            const isEditingThis = editingTextZone?.id === z.id;
            // Show live draft on the product while editing — user sees changes instantly
            const filled = isEditingThis ? textDraft : (fills.texts[z.id] ?? "");
            const st = isEditingThis
              ? {
                  fontFamily:  draftFont  ?? (z.allowedFonts?.[0]  ?? DEFAULT_FONT_FAMILY),
                  fontColor:   draftColor ?? (z.allowedColors?.[0] ?? DEFAULT_FONT_COLOR),
                  fontWeight:  z.fontWeight ?? DEFAULT_FONT_WEIGHT,
                  fontSizePct: draftFontSizePct,
                }
              : resolveZoneStyle(z, fills.textStyles?.[z.id]);

            // Customiser v2 — per-text-zone runtime drag offset (admin must
            // have ticked customerCanDrag for this zone). The offset is
            // stored as % of the zone's own width/height so it survives
            // canvas resizes. Clamped 0–100 so the text never escapes the
            // bounding box.
            const canDrag = !!z.customerCanDrag;
            const pos = (fills.textPositions ?? {})[z.id] ?? { dxPct: 0, dyPct: 0 };

            // Pointer-down on the rendered text starts a drag. We stop
            // propagation so the parent button's onClick (which opens the
            // text editor) only fires on a CLEAN click — not the drag-end.
            const onTextPointerDown = (e: React.PointerEvent) => {
              if (!canDrag || !filled || isEditingThis) return;
              e.stopPropagation();
              const zoneEl = (e.currentTarget as HTMLElement).closest("[data-text-zone]") as HTMLElement | null;
              if (!zoneEl) return;
              const rect = zoneEl.getBoundingClientRect();
              textDragRef.current = {
                zoneId: z.id,
                startClientX: e.clientX,
                startClientY: e.clientY,
                zoneRect: rect,
                startDxPct: pos.dxPct,
                startDyPct: pos.dyPct,
              };
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch { /* ignore */ }
            };
            const onTextPointerMove = (e: React.PointerEvent) => {
              const drag = textDragRef.current;
              if (!drag || drag.zoneId !== z.id) return;
              e.preventDefault();
              e.stopPropagation();
              const dxPx = e.clientX - drag.startClientX;
              const dyPx = e.clientY - drag.startClientY;
              const dxPctDelta = (dxPx / drag.zoneRect.width)  * 100;
              const dyPctDelta = (dyPx / drag.zoneRect.height) * 100;
              // Clamp to keep the text anchor inside the zone
              const nextDx = Math.max(-50, Math.min(50, drag.startDxPct + dxPctDelta));
              const nextDy = Math.max(-50, Math.min(50, drag.startDyPct + dyPctDelta));
              setFills(prev => ({
                ...prev,
                textPositions: {
                  ...(prev.textPositions ?? {}),
                  [z.id]: { dxPct: nextDx, dyPct: nextDy },
                },
              }));
            };
            const onTextPointerUp = (e: React.PointerEvent) => {
              if (textDragRef.current?.zoneId === z.id) {
                e.stopPropagation();
                textDragRef.current = null;
                try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
              }
            };

            const transform = canDrag && filled
              ? `translate(${pos.dxPct}%, ${pos.dyPct}%)`
              : undefined;

            return (
              <button
                key={`txt-${z.id}`}
                onClick={() => isEditingThis ? undefined : openTextEditor(z)}
                type="button"
                data-text-zone={z.id}
                className={`absolute group ${isEditingThis ? "cursor-default" : ""}`}
                style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
              >
                {filled ? (
                  <span
                    className={`relative block w-full h-full flex items-center justify-center rounded-md ring-2 transition-all ${
                      isEditingThis
                        ? "ring-[#EF3752] shadow-lg shadow-pink-500/20"
                        : "ring-amber-500/60 hover:ring-[#EF3752]"
                    }`}
                    style={{ containerType: "size", overflow: "visible" } as React.CSSProperties}
                  >
                    <span
                      onPointerDown={onTextPointerDown}
                      onPointerMove={onTextPointerMove}
                      onPointerUp={onTextPointerUp}
                      onPointerCancel={onTextPointerUp}
                      className={`px-2 text-center leading-none whitespace-nowrap transition-transform ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
                      style={{
                        fontFamily: st.fontFamily,
                        color:      st.fontColor,
                        fontWeight: st.fontWeight,
                        fontSize: `${st.fontSizePct}cqh`,
                        transform,
                        touchAction: canDrag ? "none" : undefined,
                      }}
                    >
                      {filled}
                    </span>
                    {/* Editing pulse indicator */}
                    {isEditingThis && (
                      <span className="absolute inset-0 rounded-md ring-2 ring-[#EF3752]/60 animate-pulse pointer-events-none" />
                    )}
                    {!isEditingThis && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); clearTextZone(z.id); }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white shadow flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {canDrag && !isEditingThis && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-amber-600 bg-white/90 rounded px-1 pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity">
                        drag to position
                      </span>
                    )}
                  </span>
                ) : (
                  <span className={`flex w-full h-full items-center justify-center rounded-md border-2 border-dashed transition-colors ${
                    isEditingThis
                      ? "border-amber-500 bg-amber-500/20 animate-pulse"
                      : "border-amber-500/80 bg-amber-500/10 hover:bg-amber-500/20"
                  }`}>
                    <span className="flex items-center gap-1 text-amber-700">
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold truncate max-w-full">{z.label}</span>
                    </span>
                  </span>
                )}
              </button>
            );
          })}

          {/* Overlay / top layer — sits above zones inside the stage.
              Transparent PNG so zone content shows through. Uses pointer-
              events:none so the zones below remain clickable. */}
          {overlayImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={overlayImage}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 w-full h-full object-contain select-none"
            />
          )}
        </div>

        {/* Empty-state tip if nothing configured */}
        {imageZones.length === 0 && textZones.length === 0 && masksList.length === 0 && (
          <p className="mt-3 text-center text-xs text-gray-500">
            No customisation zones configured for this product.
          </p>
        )}
      </div>

      {/* ── Inline text editor toolbar ──────────────────────────────────────
          Replaces the old bottom-sheet modal. Sits directly below the product
          so the user always sees their text updating live on the product above. */}
      {editingTextZone && (() => {
        const zone = editingTextZone;
        const allowedFonts  = zone.allowedFonts  ?? [];
        const allowedColors = zone.allowedColors ?? [];
        const previewFont   = draftFont  ?? allowedFonts[0]  ?? DEFAULT_FONT_FAMILY;
        const previewColor  = draftColor ?? allowedColors[0] ?? DEFAULT_FONT_COLOR;
        const previewWeight = zone.fontWeight ?? DEFAULT_FONT_WEIGHT;
        return (
          <div className="max-w-md mx-auto px-4 mt-2 mb-1">
            <div className="rounded-2xl border-2 border-pink-200 bg-white shadow-xl overflow-hidden">

              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border-b border-pink-100">
                <Pencil className="w-3.5 h-3.5 text-[#EF3752] shrink-0" />
                <span className="text-xs font-bold text-gray-800 flex-1">{zone.label}</span>
                <span className="text-[10px] text-gray-400 font-medium hidden sm:block">
                  see live preview above ↑
                </span>
                <button
                  type="button"
                  onClick={closeTextEditor}
                  className="w-6 h-6 rounded-full hover:bg-pink-100 text-gray-400 flex items-center justify-center transition-colors ml-1"
                  aria-label="Close"
                ><X className="w-3.5 h-3.5" /></button>
              </div>

              <div className="px-4 pt-3 pb-4 space-y-3">
                {/* Text input — styled in the active font/color so it feels live */}
                <input
                  autoFocus
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) saveTextEditor(); }}
                  placeholder={`Type ${zone.label}…`}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 text-base outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300/30 transition-all"
                  style={{ fontFamily: previewFont, color: previewColor, fontWeight: previewWeight }}
                />

                {/* Controls row: fonts + colors + size all in one compact strip */}
                {(allowedFonts.length > 1 || allowedColors.length > 1) && (
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Font chips */}
                    {allowedFonts.length > 1 && (
                      <div className="flex gap-1.5 overflow-x-auto flex-1" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
                        {allowedFonts.map(f => {
                          const on = (draftFont ?? allowedFonts[0]) === f;
                          return (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setDraftFont(f)}
                              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs border-2 font-medium transition-all ${
                                on
                                  ? "bg-[#EF3752] border-[#c8152c] text-white shadow-sm"
                                  : "bg-white border-gray-200 text-gray-700 hover:border-pink-300"
                              }`}
                              style={{ fontFamily: f }}
                            >
                              Aa
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Color swatches */}
                    {allowedColors.length > 1 && (
                      <div className="flex gap-2 shrink-0">
                        {allowedColors.map(c => {
                          const on = (draftColor ?? allowedColors[0]) === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setDraftColor(c)}
                              className={`w-7 h-7 rounded-full border-2 transition-all ${
                                on ? "border-[#EF3752] scale-110 shadow-sm" : "border-gray-300 hover:border-pink-400"
                              }`}
                              style={{ background: c }}
                              title={c}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Font size — compact slider with A / A labels.
                    Only shown when the admin ticked customerCanResize on
                    this zone; otherwise the size stays at defaultFontSize. */}
                {zone.customerCanResize && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-400 shrink-0">A</span>
                  <input
                    type="range"
                    min={30}
                    max={200}
                    step={5}
                    value={draftFontSizePct}
                    onChange={(e) => setDraftFontSizePct(Number(e.target.value))}
                    className="flex-1 accent-[#EF3752] h-1.5 cursor-pointer rounded-full"
                  />
                  <span className="text-[14px] font-bold text-gray-400 shrink-0">A</span>
                  <span className="text-xs font-bold text-gray-600 w-9 text-right shrink-0">{draftFontSizePct}%</span>
                </div>
                )}

                {/* Done button */}
                <button
                  type="button"
                  onClick={saveTextEditor}
                  className="w-full h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #EF3752 0%, #c8152c 100%)" }}
                >
                  <Check className="w-4 h-4" />
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Zone list (bottom helper panel) */}
      {(imageZones.length > 0 || textZones.length > 0 || masksList.length > 0) && (
        <div className="max-w-md mx-auto px-4 pb-4">
          <div className="rounded-xl border border-gray-200 bg-white/90 divide-y divide-gray-100 overflow-hidden">
            {masksList.map(m => {
              const filled = !!(fills.maskImages ?? {})[m.id];
              return (
                <button
                  key={`list-mask-${m.id}`}
                  onClick={() => onMaskClick(m.id)}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-pink-50 transition-colors text-left"
                >
                  <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${filled ? "bg-green-100 text-green-600" : "bg-pink-100 text-pink-600"}`}>
                    {filled ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-gray-900 truncate">{m.label}</span>
                    <span className="block text-[10px] text-gray-500">
                      {filled ? "Photo added — tap to change" : `Tap to upload (${m.shape})`}
                    </span>
                  </span>
                  {m.required && !filled && (
                    <span className="text-[9px] font-bold text-red-500 shrink-0">required</span>
                  )}
                </button>
              );
            })}
            {imageZones.map(z => {
              const filled = !!fills.images[z.id];
              return (
                <button
                  key={`list-img-${z.id}`}
                  onClick={() => onImageZoneClick(z.id)}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-pink-50 transition-colors text-left"
                >
                  <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${filled ? "bg-green-100 text-green-600" : "bg-pink-100 text-pink-600"}`}>
                    {filled ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-gray-900 truncate">{z.label}</span>
                    <span className="block text-[10px] text-gray-500">
                      {filled ? "Photo added — tap to change" : "Tap to upload your photo"}
                    </span>
                  </span>
                </button>
              );
            })}
            {textZones.map(z => {
              const filled = fills.texts[z.id];
              const isActive = editingTextZone?.id === z.id;
              return (
                <button
                  key={`list-txt-${z.id}`}
                  onClick={() => openTextEditor(z)}
                  type="button"
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left ${
                    isActive ? "bg-rose-50 border-l-2 border-[#EF3752]" : "hover:bg-rose-50"
                  }`}
                >
                  <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                    isActive ? "bg-[#EF3752] text-white" :
                    filled ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
                  }`}>
                    {filled || isActive ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-gray-900 truncate">{z.label}</span>
                    <span className="block text-[10px] truncate text-gray-500">
                      {isActive ? "Editing — type below ↓" : filled ? filled : "Tap to add text"}
                    </span>
                  </span>
                  {isActive && <span className="text-[10px] font-bold text-[#EF3752] shrink-0">active</span>}
                </button>
              );
            })}
          </div>

          {!hasAnyFill && (
            <p className="mt-2 text-center text-[11px] text-gray-400">
              Fill at least one slot before proceeding
            </p>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChosen}
      />

      {/* Icon picker modal — shown when the tapped zone has an admin-
          curated icon library. Customer picks an icon or falls through to
          "Upload your own" for a regular file. */}
      {iconPickerZone && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIconPickerZone(null)}
        >
          <div
            className="w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl shadow-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">Pick for: {iconPickerZone.label}</p>
                <p className="text-[11px] text-gray-500">Choose an icon or upload your own image</p>
              </div>
              <button
                onClick={() => setIconPickerZone(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 flex items-center justify-center"
                aria-label="Close"
              ><X className="w-4 h-4" /></button>
            </div>

            {(iconPickerZone.allowedIcons?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">Icons</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {(iconPickerZone.allowedIcons ?? []).map((ic) => {
                    const active = fills.images[iconPickerZone.id] === ic.url;
                    return (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => pickIconForZone(iconPickerZone.id, ic.url)}
                        className={`group relative aspect-square rounded-lg border-2 bg-gray-50 hover:bg-pink-50 p-1.5 transition-colors ${
                          active ? "border-pink-500 ring-2 ring-pink-500/30" : "border-gray-200 hover:border-pink-400"
                        }`}
                        title={ic.label || ""}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ic.url} alt={ic.label || ""} className="w-full h-full object-contain" />
                        {active && (
                          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-pink-500 text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                        {ic.label && (
                          <span className="absolute -bottom-0.5 inset-x-0 text-[9px] font-medium text-gray-600 text-center truncate opacity-0 group-hover:opacity-100 bg-white/90">{ic.label}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setIconPickerZone(null);
                setTimeout(() => imageInputRef.current?.click(), 50);
              }}
              className="w-full mt-1 py-2.5 rounded-xl border-2 border-dashed border-pink-500/70 text-pink-600 font-semibold text-sm hover:bg-pink-50 flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" /> Upload your own image
            </button>

            {fills.images[iconPickerZone.id] && (
              <button
                type="button"
                onClick={() => { clearImageZone(iconPickerZone.id); setIconPickerZone(null); }}
                className="w-full py-2 rounded-xl text-[12px] font-medium text-gray-600 hover:bg-gray-50"
              >
                Remove current selection
              </button>
            )}
          </div>
        </div>
      )}

      {/* Text editor inline toolbar — rendered above the zone list (see above) */}

      {/* Mask zoom / rotate / edit bottom sheet — mirrors the image-zone
          editor below so customers get the same controls on either kind of
          slot. Tapping a filled mask opens this; saving applies maskScales
          / maskRotations and re-bakes the preview composite. */}
      {editingMaskScale && (
        <div
          className="fixed inset-0 z-[110] flex flex-col justify-end"
          onClick={() => setEditingMaskScale(null)}
        >
          <div className="absolute inset-0 bg-black/50 pointer-events-none" />
          <div
            className="relative w-full bg-white rounded-t-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-gray-200" />
            </div>
            <div className="px-5 pb-6 pt-1">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Edit photo</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5 mb-3">{editingMaskScale.mask.label || "Mask"}</p>

              {/* Live preview */}
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-gray-100 mb-4 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={(fills.maskImages ?? {})[editingMaskScale.mask.id] ?? ""}
                  alt="preview"
                  className="w-full h-full object-cover transition-transform duration-200"
                  style={{
                    transform: `scale(${editingMaskScale.scale}) rotate(${editingMaskScale.rotate}deg)`,
                    transformOrigin: "center",
                  }}
                />
              </div>

              {/* Zoom slider */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Zoom</p>
                  <span className="text-xs font-bold text-gray-700">{Math.round(editingMaskScale.scale * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400 font-bold">1×</span>
                  <input
                    type="range"
                    min={100}
                    max={300}
                    step={5}
                    value={Math.round(editingMaskScale.scale * 100)}
                    onChange={(e) => setEditingMaskScale(prev => prev ? { ...prev, scale: Number(e.target.value) / 100 } : null)}
                    className="flex-1 accent-[#EF3752] cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-400 font-bold">3×</span>
                </div>
              </div>

              {/* Rotate controls */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Rotate</p>
                  <span className="text-xs font-bold text-gray-700">{editingMaskScale.rotate}°</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingMaskScale(prev => prev ? { ...prev, rotate: (prev.rotate - 90 + 360) % 360 } : null)}
                    className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all shrink-0"
                    title="Rotate left 90°"
                  >
                    ↺
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={editingMaskScale.rotate}
                    onChange={(e) => setEditingMaskScale(prev => prev ? { ...prev, rotate: Number(e.target.value) } : null)}
                    className="flex-1 accent-[#EF3752] cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingMaskScale(prev => prev ? { ...prev, rotate: (prev.rotate + 90) % 360 } : null)}
                    className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all shrink-0"
                    title="Rotate right 90°"
                  >
                    ↻
                  </button>
                </div>
                {(editingMaskScale.rotate !== 0) && (
                  <button
                    type="button"
                    onClick={() => setEditingMaskScale(prev => prev ? { ...prev, rotate: 0 } : null)}
                    className="mt-1.5 text-[10px] text-gray-400 hover:text-gray-600 underline"
                  >
                    Reset rotation
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { clearMask(editingMaskScale.mask.id); setEditingMaskScale(null); }}
                  className="flex-1 h-10 rounded-xl border border-red-200 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => {
                    uploadTargetMaskRef.current = editingMaskScale.mask.id;
                    uploadTargetZoneRef.current = null;
                    setEditingMaskScale(null);
                    setTimeout(() => imageInputRef.current?.click(), 60);
                  }}
                  className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMaskScales(prev    => ({ ...prev, [editingMaskScale.mask.id]: editingMaskScale.scale  }));
                    setMaskRotations(prev => ({ ...prev, [editingMaskScale.mask.id]: editingMaskScale.rotate }));
                    setEditingMaskScale(null);
                  }}
                  className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #EF3752 0%, #c8152c 100%)" }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image scale / edit bottom sheet */}
      {editingImageZoneScale && (
        <div
          className="fixed inset-0 z-[110] flex flex-col justify-end"
          onClick={() => setEditingImageZoneScale(null)}
        >
          <div className="absolute inset-0 bg-black/50 pointer-events-none" />
          <div
            className="relative w-full bg-white rounded-t-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-gray-200" />
            </div>
            <div className="px-5 pb-6 pt-1">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Edit image</p>
              <p className="text-sm font-bold text-gray-900 mt-0.5 mb-3">{editingImageZoneScale.zone.label}</p>

              {/* Live preview */}
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-gray-100 mb-4 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fills.images[editingImageZoneScale.zone.id] ?? ""}
                  alt="preview"
                  className="w-full h-full object-cover transition-transform duration-200"
                  style={{
                    transform: `scale(${editingImageZoneScale.scale}) rotate(${editingImageZoneScale.rotate}deg)`,
                    transformOrigin: "center",
                  }}
                />
              </div>

              {/* Zoom slider */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Zoom</p>
                  <span className="text-xs font-bold text-gray-700">{Math.round(editingImageZoneScale.scale * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400 font-bold">1×</span>
                  <input
                    type="range"
                    min={100}
                    max={300}
                    step={5}
                    value={Math.round(editingImageZoneScale.scale * 100)}
                    onChange={(e) => setEditingImageZoneScale(prev => prev ? { ...prev, scale: Number(e.target.value) / 100 } : null)}
                    className="flex-1 accent-[#EF3752] cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-400 font-bold">3×</span>
                </div>
              </div>

              {/* Rotate controls */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Rotate</p>
                  <span className="text-xs font-bold text-gray-700">{editingImageZoneScale.rotate}°</span>
                </div>
                {/* Quick 90° tap buttons + fine slider */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingImageZoneScale(prev => prev ? { ...prev, rotate: (prev.rotate - 90 + 360) % 360 } : null)}
                    className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all shrink-0"
                    title="Rotate left 90°"
                  >
                    ↺
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={editingImageZoneScale.rotate}
                    onChange={(e) => setEditingImageZoneScale(prev => prev ? { ...prev, rotate: Number(e.target.value) } : null)}
                    className="flex-1 accent-[#EF3752] cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingImageZoneScale(prev => prev ? { ...prev, rotate: (prev.rotate + 90) % 360 } : null)}
                    className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all shrink-0"
                    title="Rotate right 90°"
                  >
                    ↻
                  </button>
                </div>
                {/* Reset shortcut */}
                {(editingImageZoneScale.rotate !== 0) && (
                  <button
                    type="button"
                    onClick={() => setEditingImageZoneScale(prev => prev ? { ...prev, rotate: 0 } : null)}
                    className="mt-1.5 text-[10px] text-gray-400 hover:text-gray-600 underline"
                  >
                    Reset rotation
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { clearImageZone(editingImageZoneScale.zone.id); setEditingImageZoneScale(null); }}
                  className="flex-1 h-10 rounded-xl border border-red-200 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => {
                    uploadTargetZoneRef.current = editingImageZoneScale.zone.id;
                    setEditingImageZoneScale(null);
                    setTimeout(() => imageInputRef.current?.click(), 60);
                  }}
                  className="flex-1 h-10 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageScales(prev => ({ ...prev, [editingImageZoneScale.zone.id]: editingImageZoneScale.scale }));
                    setImageRotations(prev => ({ ...prev, [editingImageZoneScale.zone.id]: editingImageZoneScale.rotate }));
                    setEditingImageZoneScale(null);
                  }}
                  className="flex-1 h-10 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #EF3752 0%, #c8152c 100%)" }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SimpleZoneCustomizer;

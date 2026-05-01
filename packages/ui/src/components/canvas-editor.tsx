"use client";

import * as React from "react";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, Type, Square, Circle, Triangle, Trash2, Sparkles, Heart, Diamond,
  Hexagon, Layers, Download, Undo2, Redo2, ArrowRight, Wand2, Eye, EyeOff,
  LayoutTemplate, ImageIcon, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown,
  Maximize2, X, Star, Pencil,
} from "lucide-react";
import {
  Canvas as FabricCanvas, FabricImage, FabricText, Rect,
  Circle as FabricCircle, Triangle as FabricTriangle, Ellipse, Polygon, Path,
  ActiveSelection, loadSVGFromString, util as fabricUtil,
} from "fabric";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { cn } from "../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MaskShape =
  | "rect" | "circle" | "oval" | "rounded-rect" | "heart" | "hexagon"
  | string; // also supports "svg:..." and "custom:..."

export interface MockupTemplate {
  maskShape?: MaskShape | null;
  maskPos?: { x: number; y: number; w: number; h: number };
  customizerImage?: string | null;
  overlayImage?: string | null;
  basePos?: { x: number; y: number; w: number; h: number };
  overlayPos?: { x: number; y: number; w: number; h: number };
  maxImages?: number;
  minImages?: number;
  maxTexts?: number;
  minTexts?: number;
  maxMasks?: number;
  minMasks?: number;
}

export interface CanvasEditorProduct {
  id: string;
  title?: string;
  name?: string;
  image?: string;
  imageUrl?: string;
  mockupTemplates?: MockupTemplate[];
}

export interface CanvasEditorChange {
  canvasJSON: string;
  previewDataUrl: string;
  fontsUsed: string[];
  imagesUsed: string[];
}

export interface CanvasEditorProps {
  product: CanvasEditorProduct;
  initialTemplate?: MockupTemplate;
  initialCanvasJSON?: string | null;
  onChange?: (change: CanvasEditorChange) => void;
  className?: string;
  /**
   * Editor mode — controls which tools are exposed.
   * - "full"   (default): Upload, Images, Text, Shape, Templates, AI
   * - "simple" : Text + Templates only (for products with a "Simple" customization variant)
   */
  mode?: "full" | "simple";
  /**
   * Canvas dimensions in pixels. Defaults to a 400-sized square when omitted.
   * When provided, the fabric canvas is initialised to exactly this size so
   * templates authored at a specific print ratio (Portrait 2:3, Phone, Custom)
   * show their real shape at design time — not a universal 400×400 box.
   */
  canvasWidth?: number;
  canvasHeight?: number;
  /**
   * If provided, user-uploaded photos are POST-ed to this URL and stored as a
   * persistent server URL instead of a base64 data-URL. Prevents multi-MB
   * canvas JSON blobs when users upload many photos. Response must be { url: string }.
   */
  fileUploadUrl?: string;
}

type ToolMode = "select" | "text" | "shape" | "upload" | "ai" | "images" | "templates" | "draw";
type ShapeType = "rect" | "circle" | "triangle" | "heart" | "diamond" | "hexagon" | "star" | "arrow" | "custom";

interface DesignTemplateRecord {
  id: string;
  label: string;
  category: string;
  thumbnail: string;
  objects: unknown[];
}

interface StockImageRecord {
  label: string;
  url: string;
}

interface FontOption {
  name: string;
  family: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const defaultFontOptions: FontOption[] = [
  { name: "Outfit", family: "'Outfit', sans-serif" },
  { name: "DM Sans", family: "'DM Sans', sans-serif" },
  { name: "Georgia", family: "Georgia, serif" },
  { name: "Cursive", family: "'Brush Script MT', cursive" },
  { name: "Mono", family: "'Courier New', monospace" },
  { name: "Impact", family: "Impact, sans-serif" },
  { name: "Comic Sans", family: "'Comic Sans MS', cursive" },
  { name: "Arial Black", family: "'Arial Black', sans-serif" },
  { name: "Palatino", family: "'Palatino Linotype', serif" },
  { name: "Trebuchet", family: "'Trebuchet MS', sans-serif" },
];

const paletteColors = [
  "#FF5733", "#FFC300", "#1A1A2E", "#FFFFFF", "#E91E63",
  "#9C27B0", "#2196F3", "#4CAF50", "#FF9800", "#000000",
  "#00BCD4", "#795548", "#607D8B", "#F44336", "#CDDC39",
];

// Silent toast stub — replace with a real toast hook if caller provides one.
const toast = (..._args: unknown[]): void => {
  /* noop in shared UI package */
};

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMaskClipPath(
  shape: MaskShape,
  canvasSize: number,
  maskPos?: { x: number; y: number; w: number; h: number },
): unknown {
  const pos = maskPos || { x: 8, y: 8, w: 84, h: 84 };
  const left = (pos.x / 100) * canvasSize;
  const top = (pos.y / 100) * canvasSize;
  const width = (pos.w / 100) * canvasSize;
  const height = (pos.h / 100) * canvasSize;
  const cx = left + width / 2;
  const cy = top + height / 2;

  if (typeof shape === "string" && shape.startsWith("svg:")) {
    const pathData = shape.slice(4);
    try {
      const path = new Path(pathData, { left: cx, top: cy, originX: "center", originY: "center", absolutePositioned: true });
      const pathBounds = path.getBoundingRect();
      const scale = Math.min(width / (pathBounds.width || 1), height / (pathBounds.height || 1));
      path.set({ scaleX: scale, scaleY: scale });
      return path;
    } catch {
      return new Rect({ width, height, left: cx, top: cy, originX: "center", originY: "center", absolutePositioned: true });
    }
  }

  if (typeof shape === "string" && shape.startsWith("custom:")) {
    return null;
  }

  switch (shape) {
    case "circle": return new FabricCircle({ radius: Math.min(width, height) / 2, left: cx, top: cy, originX: "center", originY: "center", absolutePositioned: true });
    case "oval": return new Ellipse({ rx: width / 2, ry: height * 0.35, left: cx, top: cy, originX: "center", originY: "center", absolutePositioned: true });
    case "rounded-rect": return new Rect({ width, height: height * 0.5, rx: 24, ry: 24, left: cx, top: cy, originX: "center", originY: "center", absolutePositioned: true });
    case "heart": return new Ellipse({ rx: width * 0.45, ry: height * 0.4, left: cx, top: cy + 10, originX: "center", originY: "center", absolutePositioned: true });
    case "hexagon": return new FabricCircle({ radius: Math.min(width, height) / 2, left: cx, top: cy, originX: "center", originY: "center", absolutePositioned: true });
    case "rect":
    default: return new Rect({ width, height, left: cx, top: cy, originX: "center", originY: "center", absolutePositioned: true });
  }
}

function drawMaskOutline(
  canvas: FabricCanvas,
  shape: MaskShape,
  canvasSize: number,
  maskPos?: { x: number; y: number; w: number; h: number },
): void {
  const pos = maskPos || { x: 8, y: 8, w: 84, h: 84 };
  const left = (pos.x / 100) * canvasSize;
  const top = (pos.y / 100) * canvasSize;
  const width = (pos.w / 100) * canvasSize;
  const height = (pos.h / 100) * canvasSize;
  const cx = left + width / 2;
  const cy = top + height / 2;

  const commonProps = {
    fill: "transparent", stroke: "hsl(11, 100%, 60%)", strokeWidth: 2, strokeDashArray: [8, 4],
    selectable: false, evented: false, excludeFromExport: true,
    originX: "center" as const, originY: "center" as const, left: cx, top: cy,
  };

  let outline: { set: (attrs: Record<string, unknown>) => void; getBoundingRect: () => { width: number; height: number } } | null = null;

  if (typeof shape === "string" && shape.startsWith("svg:")) {
    const pathData = shape.slice(4);
    try {
      const p = new Path(pathData, { ...commonProps });
      const pathBounds = p.getBoundingRect();
      const scale = Math.min(width / (pathBounds.width || 1), height / (pathBounds.height || 1));
      p.set({ scaleX: scale, scaleY: scale });
      outline = p as unknown as typeof outline;
    } catch {
      outline = new Rect({ ...commonProps, width, height }) as unknown as typeof outline;
    }
  } else if (typeof shape === "string" && shape.startsWith("custom:")) {
    const maskUrl = shape.slice(7);
    if (maskUrl) {
      FabricImage.fromURL(maskUrl, { crossOrigin: "anonymous" }).then((img) => {
        const scale = Math.min(width / (img.width || 1), height / (img.height || 1));
        img.set({ ...commonProps, scaleX: scale, scaleY: scale, opacity: 0.4 });
        (img as unknown as { __isMaskOutline: boolean }).__isMaskOutline = true;
        canvas.add(img);
        canvas.bringObjectToFront(img);
        canvas.renderAll();
      }).catch(() => { /* ignore */ });
    }
    return;
  } else {
    switch (shape) {
      case "circle": outline = new FabricCircle({ ...commonProps, radius: Math.min(width, height) / 2 }) as unknown as typeof outline; break;
      case "oval": outline = new Ellipse({ ...commonProps, rx: width / 2, ry: height * 0.35 }) as unknown as typeof outline; break;
      case "rounded-rect": outline = new Rect({ ...commonProps, width, height: height * 0.5, rx: 24, ry: 24 }) as unknown as typeof outline; break;
      case "heart": outline = new Ellipse({ ...commonProps, rx: width * 0.45, ry: height * 0.4, top: cy + 10 }) as unknown as typeof outline; break;
      case "rect":
      default: outline = new Rect({ ...commonProps, width, height }) as unknown as typeof outline; break;
    }
  }

  if (outline) {
    (outline as unknown as { __isMaskOutline: boolean }).__isMaskOutline = true;
    canvas.add(outline as unknown as Parameters<FabricCanvas["add"]>[0]);
    canvas.bringObjectToFront(outline as unknown as Parameters<FabricCanvas["bringObjectToFront"]>[0]);
  }
}

function createStarPoints(cx: number, cy: number, outerR: number, innerR: number, points: number): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    result.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return result;
}

function createHeartPoints(size: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 360; i += 5) {
    const rad = (i * Math.PI) / 180;
    const x = size * (16 * Math.pow(Math.sin(rad), 3)) / 16;
    const y = -size * (13 * Math.cos(rad) - 5 * Math.cos(2 * rad) - 2 * Math.cos(3 * rad) - Math.cos(4 * rad)) / 16;
    points.push({ x: x + size, y: y + size });
  }
  return points;
}

function createDiamondPoints(size: number): { x: number; y: number }[] {
  return [{ x: size / 2, y: 0 }, { x: size, y: size / 2 }, { x: size / 2, y: size }, { x: 0, y: size / 2 }];
}

function createHexagonPoints(size: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push({ x: size / 2 + (size / 2) * Math.cos(angle), y: size / 2 + (size / 2) * Math.sin(angle) });
  }
  return points;
}

function createArrowPoints(size: number): { x: number; y: number }[] {
  const w = size, h = size * 0.6;
  return [
    { x: 0, y: h * 0.3 }, { x: w * 0.6, y: h * 0.3 }, { x: w * 0.6, y: 0 },
    { x: w, y: h * 0.5 }, { x: w * 0.6, y: h }, { x: w * 0.6, y: h * 0.7 }, { x: 0, y: h * 0.7 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Fallback: encode file as base64 data URL (embedded in canvas JSON). */
function uploadUserFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Server upload: POST the file to uploadUrl and return the persistent URL.
 * Keeps canvas JSON lean — stores a URL instead of a multi-MB base64 blob.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Built-in India-themed templates — always available alongside admin templates
// ─────────────────────────────────────────────────────────────────────────────

function makeThumb(bg: string, fg: string, text: string): string {
  const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 320'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>${bg}</linearGradient></defs>
    <rect width='240' height='320' fill='url(#g)'/>
    <text x='50%' y='52%' text-anchor='middle' font-family='Georgia, serif' font-style='italic' font-weight='700' font-size='26' fill='${fg}'>${safe}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const BUILTIN_TEMPLATES: DesignTemplateRecord[] = [
  {
    id: "builtin-diwali",
    label: "Happy Diwali",
    category: "Festive",
    thumbnail: makeThumb("<stop offset='0' stop-color='#4a0e0e'/><stop offset='1' stop-color='#1a0505'/>", "#ffc107", "Happy Diwali"),
    objects: [
      { type: "text", text: "Happy Diwali", left: 200, top: 130, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 44, fill: "#d4a017" },
      { type: "text", text: "May lights fill your home", left: 200, top: 190, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 16, fill: "#8b4513" },
    ],
  },
  {
    id: "builtin-rakhi",
    label: "Raksha Bandhan",
    category: "Festive",
    thumbnail: makeThumb("<stop offset='0' stop-color='#c62828'/><stop offset='1' stop-color='#f57c00'/>", "#fff8dc", "Raksha Bandhan"),
    objects: [
      { type: "text", text: "Happy Raksha Bandhan", left: 200, top: 130, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fill: "#b71c1c" },
      { type: "text", text: "To my forever protector", left: 200, top: 190, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#5d4037" },
    ],
  },
  {
    id: "builtin-karwa-chauth",
    label: "Karwa Chauth",
    category: "Festive",
    thumbnail: makeThumb("<stop offset='0' stop-color='#880e4f'/><stop offset='1' stop-color='#311b92'/>", "#fdc116", "Karwa Chauth"),
    objects: [
      { type: "text", text: "Happy Karwa Chauth", left: 200, top: 130, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 36, fill: "#e91e63" },
      { type: "text", text: "Forever yours", left: 200, top: 190, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 16, fill: "#ad1457" },
    ],
  },
  {
    id: "builtin-holi",
    label: "Holi Hai",
    category: "Festive",
    thumbnail: makeThumb("<stop offset='0' stop-color='#ec4899'/><stop offset='0.5' stop-color='#facc15'/><stop offset='1' stop-color='#22c55e'/>", "#ffffff", "Holi Hai!"),
    objects: [
      { type: "text", text: "Happy Holi", left: 200, top: 120, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 44, fill: "#ec4899" },
      { type: "text", text: "Bura na mano · Holi hai!", left: 200, top: 180, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#6a1b9a" },
    ],
  },
  {
    id: "builtin-eid",
    label: "Eid Mubarak",
    category: "Festive",
    thumbnail: makeThumb("<stop offset='0' stop-color='#1b5e20'/><stop offset='1' stop-color='#004d40'/>", "#c9a227", "Eid Mubarak"),
    objects: [
      { type: "text", text: "Eid Mubarak", left: 200, top: 130, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 40, fill: "#c9a227" },
      { type: "text", text: "Blessings on you and family", left: 200, top: 190, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#1b5e20" },
    ],
  },
  {
    id: "builtin-wedding",
    label: "Wedding",
    category: "Occasion",
    thumbnail: makeThumb("<stop offset='0' stop-color='#fce4ec'/><stop offset='1' stop-color='#f8bbd0'/>", "#880e4f", "Forever"),
    objects: [
      { type: "text", text: "Happily Ever After", left: 200, top: 120, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 36, fill: "#ad1457" },
      { type: "text", text: "— The [Name] Family —", left: 200, top: 180, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#6a1b4d" },
    ],
  },
  {
    id: "builtin-baby-shower",
    label: "Baby Shower",
    category: "Occasion",
    thumbnail: makeThumb("<stop offset='0' stop-color='#e1f5fe'/><stop offset='1' stop-color='#fce4ec'/>", "#7b4bb5", "Welcome Little One"),
    objects: [
      { type: "text", text: "Welcome Little One", left: 200, top: 130, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fill: "#7b4bb5" },
      { type: "text", text: "A new chapter begins", left: 200, top: 190, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#455a64" },
    ],
  },
  {
    id: "builtin-birthday",
    label: "Birthday",
    category: "Occasion",
    thumbnail: makeThumb("<stop offset='0' stop-color='#ec4899'/><stop offset='1' stop-color='#f59e0b'/>", "#ffffff", "Happy Birthday"),
    objects: [
      { type: "text", text: "Happy Birthday", left: 200, top: 120, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 44, fill: "#ec4899" },
      { type: "text", text: "Wishing you the best year yet", left: 200, top: 180, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#78350f" },
    ],
  },
  {
    id: "builtin-anniversary",
    label: "Anniversary",
    category: "Occasion",
    thumbnail: makeThumb("<stop offset='0' stop-color='#4a148c'/><stop offset='1' stop-color='#880e4f'/>", "#fdc116", "Happy Anniversary"),
    objects: [
      { type: "text", text: "Happy Anniversary", left: 200, top: 130, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 36, fill: "#fdc116" },
      { type: "text", text: "Cheers to many more years", left: 200, top: 190, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#ffffff" },
    ],
  },
  {
    id: "builtin-corporate",
    label: "Corporate Thank-You",
    category: "Corporate",
    thumbnail: makeThumb("<stop offset='0' stop-color='#0f172a'/><stop offset='1' stop-color='#1e293b'/>", "#e2e8f0", "Thank You"),
    objects: [
      { type: "text", text: "Thank You", left: 200, top: 130, originX: "center", originY: "center", fontFamily: "'Playfair Display', Georgia, serif", fontSize: 44, fill: "#cbd5e1" },
      { type: "text", text: "For your dedication & service", left: 200, top: 190, originX: "center", originY: "center", fontFamily: "'Outfit', sans-serif", fontSize: 14, fill: "#94a3b8" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CanvasEditor({
  product,
  initialTemplate,
  initialCanvasJSON,
  onChange,
  className,
  mode = "full",
  canvasWidth,
  canvasHeight,
  fileUploadUrl,
}: CanvasEditorProps): React.ReactElement {
  const template: MockupTemplate = initialTemplate ?? product.mockupTemplates?.[0] ?? {};
  const dbMaskShape = template.maskShape ?? null;
  const dbCustomizerImage = template.customizerImage ?? product.image ?? product.imageUrl ?? null;
  const dbOverlayImage = template.overlayImage ?? null;
  const dbMaskPos = template.maskPos ?? { x: 10, y: 10, w: 80, h: 80 };
  const dbBasePos = template.basePos ?? { x: 0, y: 0, w: 100, h: 100 };
  const dbOverlayPos = template.overlayPos ?? { x: 0, y: 0, w: 100, h: 100 };
  const maxImages = template.maxImages ?? 0;
  const maxTexts = template.maxTexts ?? 0;
  const maxMasks = template.maxMasks ?? 0;

  const productName = product.title ?? product.name ?? "Product";

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgShapeInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const maskClipRef = useRef<{ shape: MaskShape; size: number; pos: { x: number; y: number; w: number; h: number } } | null>(null);

  const [activeTool, setActiveTool] = useState<ToolMode>("select");
  // Character panel drag offset (Photoshop-style: grab header to reposition).
  // Reset to 0,0 every time the panel opens so user gets a predictable spot.
  const [charOffset, setCharOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const charDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  useEffect(() => { if (activeTool === "text") setCharOffset({ x: 0, y: 0 }); }, [activeTool]);

  // Layers panel — same drag pattern as Character
  const [layersOpen, setLayersOpen] = useState(false);
  const [layersOffset, setLayersOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const layersDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  useEffect(() => { if (layersOpen) setLayersOffset({ x: 0, y: 0 }); }, [layersOpen]);

  // Draw/Pen panel — same drag pattern as Character
  const [drawOffset, setDrawOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const drawDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  useEffect(() => { if (activeTool === "draw") setDrawOffset({ x: 0, y: 0 }); }, [activeTool]);
  // Shape panel drag offset
  const [shapeOffset, setShapeOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const shapeDragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  useEffect(() => { if (activeTool === "shape") setShapeOffset({ x: 0, y: 0 }); }, [activeTool]);
  // Used to force the layers list to re-render when canvas changes
  const [, layersTick] = useState(0);
  const [canvasReady, setCanvasReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [selectedFont, setSelectedFont] = useState(0);
  const [fontSize, setFontSize] = useState(28);
  const [textColor, setTextColor] = useState("#1A1A2E");
  const [shapeType, setShapeType] = useState<ShapeType>("rect");
  const [fillColor, setFillColor] = useState("#FF5733");
  // Shape stroke/outline controls (also applied live to the current selection)
  const [strokeColor, setStrokeColor] = useState("#1A1A2E");
  const [strokeWidth, setStrokeWidth] = useState(0); // 0 = no outline
  const [strokeDash, setStrokeDash] = useState<"solid" | "dashed" | "dotted">("solid");
  const [cornerRadius, setCornerRadius] = useState(12); // rect only
  const [shapeOpacity, setShapeOpacity] = useState(1);
  // Canvas background — "transparent" means no fill (checkerboard shows through).
  const [canvasBg, setCanvasBg] = useState<string>("transparent");
  const [aiPrompt, setAiPrompt] = useState("");
  const [showMockup, setShowMockup] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showMask, setShowMask] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const [popupTool, setPopupTool] = useState<ToolMode | null>(null);
  const [, forceUpdate] = useState(0);
  const [templates, setTemplates] = useState<DesignTemplateRecord[]>(BUILTIN_TEMPLATES);
  const [templateCategory, setTemplateCategory] = useState("All");
  const [stockImages, setStockImages] = useState<StockImageRecord[]>([]);
  const [fontOptions, setFontOptions] = useState<FontOption[]>(defaultFontOptions);

  // ── Custom fonts ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/custom_fonts");
        if (!res.ok) return;
        const data: Array<{ name: string; font_family: string; font_url?: string }> = await res.json();
        if (cancelled || !Array.isArray(data) || data.length === 0) return;
        data.forEach((f) => {
          if (f.font_url && typeof FontFace !== "undefined") {
            try {
              const fontFace = new FontFace(f.font_family, `url(${f.font_url})`);
              fontFace.load().then((loaded) => { document.fonts.add(loaded); }).catch(() => { /* ignore */ });
            } catch { /* ignore */ }
          }
        });
        const customFonts: FontOption[] = data.map((f) => ({
          name: f.name,
          family: `'${f.font_family}', sans-serif`,
        }));
        setFontOptions([...customFonts, ...defaultFontOptions]);
      } catch {
        /* fall back to defaults */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fire initial onChange once canvas is ready (even with empty canvas) ──
  // Without this, designs[i].change stays null until the user manually edits,
  // which disables the "Add to cart" button on first load.
  const emitChangeRef = useRef<((canvas: FabricCanvas) => void) | null>(null);

  // ── Fire onChange when canvas mutates ────────────────────────────────────
  const emitChange = useCallback((canvas: FabricCanvas): void => {
    if (!onChange) return;
    try {
      const canvasJSON = JSON.stringify(canvas.toJSON());
      // Preview: render at 2× but cap at 1400px on the long edge.
      // This gives sharp previews on admin/retina screens while staying
      // well under nginx's body-size limit (JPEG @ ~1MB max).
      const maxSide = 1400;
      const cw = canvas.width || 400;
      const ch = canvas.height || 400;
      const longest = Math.max(cw, ch);
      const naturalMult = 2; // 2× retina render
      const capMult = longest * naturalMult > maxSide ? maxSide / longest : naturalMult;
      const mult = capMult;
      const previewDataUrl = canvas.toDataURL({ format: "jpeg", quality: 0.88, multiplier: mult });
      const objects = canvas.getObjects() as unknown as Array<Record<string, unknown>>;
      const fontsUsed = new Set<string>();
      const imagesUsed: string[] = [];
      objects.forEach((obj) => {
        if (obj.__isMaskOutline || obj.__isBaseProduct || obj.__isOverlay) return;
        if (obj.type === "text" || obj.type === "i-text" || obj.type === "textbox") {
          const family = obj.fontFamily;
          if (typeof family === "string") fontsUsed.add(family);
        }
        if (obj.type === "image") {
          const el = obj._element as HTMLImageElement | undefined;
          if (el?.src) imagesUsed.push(el.src);
        }
      });
      onChange({ canvasJSON, previewDataUrl, fontsUsed: Array.from(fontsUsed), imagesUsed });
    } catch {
      /* ignore */
    }
  }, [onChange]);

  // Keep ref in sync so the initial-emit effect always uses the latest emitChange
  useEffect(() => { emitChangeRef.current = emitChange; }, [emitChange]);

  // Fire once ~600 ms after canvas is ready so the parent captures the initial
  // state even when the user hasn't touched anything yet.
  useEffect(() => {
    if (!canvasReady) return;
    const t = setTimeout(() => {
      if (fabricRef.current && emitChangeRef.current) {
        emitChangeRef.current(fabricRef.current);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [canvasReady]); // runs once per mount when canvas becomes ready

  const pushHistory = useCallback((canvas: FabricCanvas): void => {
    try {
      const json = JSON.stringify(canvas.toJSON());
      const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      newHistory.push(json);
      historyRef.current = newHistory.slice(-20);
      historyIndexRef.current = historyRef.current.length - 1;
      emitChange(canvas);
    } catch (e) {
      console.warn("Failed to save canvas history", e);
    }
  }, [emitChange]);

  // ── Initialize fabric canvas ─────────────────────────────────────────────
  useEffect(() => {
    if (!canvasContainerRef.current || fabricRef.current) return;
    const container = canvasContainerRef.current;

    // If explicit canvasWidth/canvasHeight are passed (e.g. from a size preset
    // like Portrait 2:3 → 400×600), respect the aspect ratio and scale to fit
    // the available container. Otherwise fall back to the legacy
    // "max 400 square" behaviour.
    // Use the PARENT's width for sizing (container is a wrapper div that can
    // report 0 before layout) — fall back via its ancestry.
    let availableW = container.clientWidth;
    if (availableW < 200 && container.parentElement) {
      availableW = container.parentElement.clientWidth || availableW;
    }
    availableW = Math.max(availableW, 400);
    // Height budget: viewport minus top-bar (~56) + status strip (~36) +
    // toolbar (~60) + safe bottom-margin (~60) + card/outer padding (~60 md)
    // = ~270 reserved. Cap at 560 so the toolbar is always visible.
    const availableH =
      typeof window !== "undefined" ? Math.max(240, window.innerHeight - 320) : 500;

    let w = 400;
    let h = 400;
    if (canvasWidth && canvasHeight && canvasWidth > 0 && canvasHeight > 0) {
      const ar = canvasWidth / canvasHeight;
      // Fit inside the available box while preserving the aspect ratio.
      // Cap so each side doesn't exceed 900 px (enough for ratio clarity
      // without killing pan/zoom performance or hiding the toolbar).
      const maxW = Math.min(availableW - 40, 900);
      const maxH = Math.min(availableH, 560);
      // Scale the requested dims down to fit maxW × maxH.
      let scale = Math.min(maxW / canvasWidth, maxH / canvasHeight, 1);
      // If the requested dims are SMALLER than the box, scale UP so the
      // canvas still fills the workspace (Photoshop "Fit on Screen" feel).
      if (scale === 1) {
        scale = Math.min(maxW / canvasWidth, maxH / canvasHeight);
      }
      w = Math.max(80, Math.round(canvasWidth * scale));
      h = Math.max(80, Math.round(canvasHeight * scale));
      // Preserve aspect exactly — integer rounding can drift; re-align.
      if (Math.abs(w / h - ar) > 0.02) {
        if (ar >= 1) h = Math.round(w / ar);
        else         w = Math.round(h * ar);
      }
    } else {
      w = Math.min(availableW, 400);
      h = w;
    }
    const canvasEl = document.createElement("canvas");
    canvasEl.width = w;
    canvasEl.height = h;
    canvasEl.className = "rounded-xl touch-none";
    container.appendChild(canvasEl);

    // Preserve the `size` var name used by the rest of the init code below
    // (the smaller-side baseline, used for mask sizing & image scaling).
    const size = Math.min(w, h);

    const canvas = new FabricCanvas(canvasEl, {
      width: w, height: h, backgroundColor: "transparent", selection: true, preserveObjectStacking: true,
    });

    // Legacy AR-probe path — only runs when no explicit canvas dimensions
    // were passed AND no mask/template is set (so customer-photo products
    // still auto-fit to the product image).
    const maskShape = dbMaskShape;
    const hasExplicit = !!(canvasWidth && canvasHeight);
    if (!hasExplicit && !maskShape && dbCustomizerImage) {
      const probe = new window.Image();
      probe.crossOrigin = "anonymous";
      probe.onload = () => {
        if (!fabricRef.current) return;
        const ar = probe.naturalWidth / (probe.naturalHeight || 1);
        const newH = ar > 0 ? Math.round(size / ar) : size;
        canvasEl.width  = size;
        canvasEl.height = newH;
        canvas.setDimensions({ width: size, height: newH });
        canvas.renderAll();
      };
      probe.src = dbCustomizerImage;
    }

    if (maskShape) {
      const clipPath = createMaskClipPath(maskShape, size, dbMaskPos);
      if (clipPath) {
        maskClipRef.current = { shape: maskShape, size, pos: dbMaskPos };
      }
      drawMaskOutline(canvas, maskShape, size, dbMaskPos);

      if (typeof maskShape === "string" && maskShape.startsWith("custom:")) {
        const maskUrl = maskShape.slice(7);
        if (maskUrl) {
          const maskImg = new window.Image();
          maskImg.crossOrigin = "anonymous";
          maskImg.onload = () => {
            const ml = (dbMaskPos.x / 100) * size;
            const mt = (dbMaskPos.y / 100) * size;
            const mw2 = (dbMaskPos.w / 100) * size;
            const mh2 = (dbMaskPos.h / 100) * size;
            const scale = Math.min(mw2 / (maskImg.width || 1), mh2 / (maskImg.height || 1));
            const mw = maskImg.width * scale;
            const mh = maskImg.height * scale;
            const mx = ml + (mw2 - mw) / 2;
            const my = mt + (mh2 - mh) / 2;

            canvas.on("after:render", () => {
              const ctx = canvas.getContext();
              ctx.save();
              ctx.globalCompositeOperation = "destination-in";
              ctx.drawImage(maskImg, mx, my, mw, mh);
              ctx.restore();
            });
            canvas.renderAll();
          };
          maskImg.src = maskUrl;
        }
      }
    }

    if (dbCustomizerImage) {
      FabricImage.fromURL(dbCustomizerImage, { crossOrigin: "anonymous" }).then((img) => {
        if (!fabricRef.current) return;
        const bx = (dbBasePos.x / 100) * size;
        const by = (dbBasePos.y / 100) * size;
        const bw = (dbBasePos.w / 100) * size;
        const bh = (dbBasePos.h / 100) * size;
        const imgScale = Math.min(bw / (img.width || 1), bh / (img.height || 1));
        img.set({
          scaleX: imgScale, scaleY: imgScale,
          left: bx + bw / 2, top: by + bh / 2,
          originX: "center", originY: "center",
          selectable: false, evented: false,
        });
        (img as unknown as { __isBaseProduct: boolean }).__isBaseProduct = true;
        canvas.add(img);
        canvas.sendObjectToBack(img);
        canvas.renderAll();
        pushHistory(canvas);
      }).catch((err) => console.warn("Failed to load customizer image:", err));
    }

    if (dbOverlayImage) {
      FabricImage.fromURL(dbOverlayImage, { crossOrigin: "anonymous" }).then((img) => {
        if (!fabricRef.current) return;
        const ox = (dbOverlayPos.x / 100) * size;
        const oy = (dbOverlayPos.y / 100) * size;
        const ow = (dbOverlayPos.w / 100) * size;
        const oh = (dbOverlayPos.h / 100) * size;
        const imgScale = Math.min(ow / (img.width || 1), oh / (img.height || 1));
        img.set({
          scaleX: imgScale, scaleY: imgScale,
          left: ox + ow / 2, top: oy + oh / 2,
          originX: "center", originY: "center",
          selectable: false, evented: false,
        });
        (img as unknown as { __isOverlay: boolean }).__isOverlay = true;
        (img as unknown as { excludeFromExport: boolean }).excludeFromExport = false;
        canvas.add(img);
        canvas.bringObjectToFront(img);
        canvas.renderAll();
      }).catch((err) => console.warn("Failed to load overlay image:", err));
    }

    const syncSelected = (): void => {
      const active = canvas.getActiveObject() as any;
      if (!active) return;
      if (active.type === "text") {
        const textObj = active as FabricText;
        const family = textObj.fontFamily || "";
        setFontOptions((current) => {
          const idx = current.findIndex((f) => f.family === family);
          if (idx >= 0) setSelectedFont(idx);
          return current;
        });
        setFontSize(textObj.fontSize || 28);
        setTextColor((textObj.fill as string) || "#1A1A2E");
      } else if (active.type !== "image") {
        // Shape selected — mirror its fill/outline/radius/opacity into the
        // dialog controls so sliders reflect reality instead of the defaults.
        if (typeof active.fill === "string") setFillColor(active.fill);
        if (typeof active.stroke === "string") setStrokeColor(active.stroke);
        const sw = Number(active.strokeWidth) || 0;
        setStrokeWidth(sw);
        const da = active.strokeDashArray as number[] | undefined;
        if (!da || da.length === 0) setStrokeDash("solid");
        else if (da.length >= 2 && da[0] > da[1]) setStrokeDash("dashed");
        else setStrokeDash("dotted");
        if (active.type === "rect" && typeof active.rx === "number") setCornerRadius(active.rx);
        if (typeof active.opacity === "number") setShapeOpacity(active.opacity);
      } else if (active.type === "image") {
        if (typeof active.opacity === "number") setShapeOpacity(active.opacity);
      }
    };

    canvas.on("selection:created", () => { setHasSelection(true); syncSelected(); layersTick((n) => n + 1); });
    canvas.on("selection:updated", () => { setHasSelection(true); syncSelected(); layersTick((n) => n + 1); });
    canvas.on("selection:cleared", () => { setHasSelection(false); layersTick((n) => n + 1); });
    canvas.on("object:modified", (e: any) => {
      // Rect: bake scale into width/height so rx/ry stay at their
      // authored pixel radius. Without this, scaling a rounded rect
      // stretches the corners into ovals — users want the radius to
      // stay "visually constant" while only the rect size changes.
      const obj = e?.target as any;
      if (obj && obj.type === "rect" && (obj.scaleX !== 1 || obj.scaleY !== 1)) {
        const newW = (obj.width || 0) * (obj.scaleX || 1);
        const newH = (obj.height || 0) * (obj.scaleY || 1);
        obj.set({ width: newW, height: newH, scaleX: 1, scaleY: 1 });
        obj.setCoords();
      }
      pushHistory(canvas);
      layersTick((n) => n + 1);
    });
    canvas.on("object:added",    () => { layersTick((n) => n + 1); });
    canvas.on("object:removed",  () => { layersTick((n) => n + 1); });
    // Freehand pen-tool strokes commit to history as a single undoable step
    canvas.on("path:created", () => { pushHistory(canvas); layersTick((n) => n + 1); });

    fabricRef.current = canvas;
    setCanvasReady(true);

    // Restore from initial JSON if provided. loadFromJSON restores whatever
    // width/height were serialized — which forces old 400×400 templates back
    // to square even when the caller asked for 1920×1080. So we re-apply our
    // dimensions right after the load and re-scale any existing objects
    // proportionally so content isn't cropped or centred incorrectly.
    if (initialCanvasJSON) {
      try {
        canvas.loadFromJSON(initialCanvasJSON).then(() => {
          if (canvasWidth && canvasHeight && canvasWidth > 0 && canvasHeight > 0) {
            const prevW = canvas.width || w;
            const prevH = canvas.height || h;
            if (prevW !== w || prevH !== h) {
              const sx = w / prevW;
              const sy = h / prevH;
              canvas.setDimensions({ width: w, height: h });
              // Re-scale/move existing user objects proportionally so a
              // template saved at 400×400 still reads at 1920×1080.
              const objs = canvas.getObjects() as unknown as Array<Record<string, any>>;
              for (const o of objs) {
                if (o.__isBaseProduct || o.__isOverlay || o.__isMaskOutline) continue;
                o.set({
                  left:   (o.left   ?? 0) * sx,
                  top:    (o.top    ?? 0) * sy,
                  scaleX: (o.scaleX ?? 1) * sx,
                  scaleY: (o.scaleY ?? 1) * sy,
                });
                o.setCoords?.();
              }
            }
          }
          canvas.renderAll();
          pushHistory(canvas);
        });
      } catch (e) {
        console.warn("Failed to restore initial canvas JSON", e);
      }
    }

    const handleResize = (): void => {
      // If explicit dims were provided, never collapse back to a 400 square
      // on window resize — keep them locked so the chosen aspect is preserved.
      if (canvasWidth && canvasHeight && canvasWidth > 0 && canvasHeight > 0) return;
      const newSize = Math.min(container.clientWidth, 400);
      canvas.setDimensions({ width: newSize, height: newSize });
      canvas.renderAll();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.dispose();
      fabricRef.current = null;
      while (container.firstChild) container.removeChild(container.firstChild);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbMaskShape, dbCustomizerImage, dbOverlayImage]);

  // ── Paste handler ────────────────────────────────────────────────────────
  // Shared helper — drop an SVG markup string onto the canvas as a scaled,
  // centred group. Used by both clipboard paste and the drag-and-drop handler
  // so shapes copied from Illustrator behave identically either way.
  const addSvgStringToCanvas = useCallback(async (svgText: string): Promise<void> => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      const result = await loadSVGFromString(svgText);
      const objects = ((result as unknown as { objects: unknown[] }).objects ?? []).filter(Boolean) as Parameters<typeof fabricUtil.groupSVGElements>[0];
      const options = (result as unknown as { options: Record<string, unknown> }).options ?? {};
      if (!objects.length) return;
      const group = fabricUtil.groupSVGElements(objects, options) as unknown as Record<string, any>;
      const cw = canvas.width || 400;
      const ch = canvas.height || 400;
      const gw = Number(group.width) || 1;
      const gh = Number(group.height) || 1;
      const scale = Math.min((cw * 0.7) / gw, (ch * 0.7) / gh);
      group.set({
        left: cw / 2, top: ch / 2,
        originX: "center", originY: "center",
        scaleX: scale, scaleY: scale,
      });
      canvas.add(group as any);
      canvas.setActiveObject(group as any);
      // Keep overlays/masks above pasted art
      const all = [...canvas.getObjects()] as unknown as Array<Record<string, unknown>>;
      all.filter((o) => o.__isOverlay).forEach((o) => canvas.bringObjectToFront(o as any));
      all.filter((o) => o.__isMaskOutline).forEach((o) => canvas.bringObjectToFront(o as any));
      canvas.renderAll();
      pushHistory(canvas);
    } catch (err) {
      console.warn("SVG paste/drop failed", err);
    }
  }, [pushHistory]);

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent): Promise<void> => {
      const items = e.clipboardData?.items;
      if (!items || !fabricRef.current) return;

      // ── 1) Raw SVG markup in text (Illustrator → Copy SVG Code, or user
      //        pastes SVG source). Detect <svg ...> or <?xml ... <svg> in
      //        text/plain OR text/html payloads.
      const textData = e.clipboardData?.getData("text/plain") || "";
      const htmlData = e.clipboardData?.getData("text/html") || "";
      const looksLikeSvg = (s: string): boolean => /<svg[\s>]/i.test(s.trim());
      let svgSource: string | null = null;
      if (looksLikeSvg(textData)) {
        svgSource = textData.trim();
      } else if (looksLikeSvg(htmlData)) {
        // text/html from Illustrator sometimes wraps the <svg> in fragment
        // comments — extract the first <svg>…</svg> block.
        const m = htmlData.match(/<svg[\s\S]*?<\/svg>/i);
        if (m) svgSource = m[0];
      }
      if (svgSource) {
        e.preventDefault();
        await addSvgStringToCanvas(svgSource);
        return;
      }

      for (const item of Array.from(items)) {
        // ── 2) SVG file on clipboard (image/svg+xml)
        if (item.type === "image/svg+xml" || item.type.includes("svg")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;
          try {
            const text = await blob.text();
            await addSvgStringToCanvas(text);
          } catch { /* ignore */ }
          return;
        }
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          try {
            // Upload pasted images to the server so the canvas JSON only stores
            // a URL — base64-embedding bloats cart_items.customization to MB.
            const uploadedUrl = fileUploadUrl
              ? await uploadToServer(blob, fileUploadUrl)
              : await uploadUserFile(blob);
            const img = await FabricImage.fromURL(uploadedUrl, fileUploadUrl ? { crossOrigin: "anonymous" } : {});
            const canvas = fabricRef.current;
            if (!canvas) return;
            const cw = canvas.width || 400;
            const ch = canvas.height || 400;
            const scale = Math.min((cw * 0.8) / (img.width || 1), (ch * 0.8) / (img.height || 1));
            img.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
            const mInfo = maskClipRef.current;
            if (mInfo) {
              const clip = createMaskClipPath(mInfo.shape, mInfo.size, mInfo.pos);
              if (clip) (img as unknown as { clipPath: unknown }).clipPath = clip;
            }
            canvas.add(img);
            canvas.setActiveObject(img);
            const objects = [...canvas.getObjects()] as unknown as Array<Record<string, unknown>>;
            const overlays = objects.filter((obj) => obj.__isOverlay);
            const masks = objects.filter((obj) => obj.__isMaskOutline);
            overlays.forEach((obj) => canvas.bringObjectToFront(obj as unknown as Parameters<FabricCanvas["bringObjectToFront"]>[0]));
            masks.forEach((obj) => canvas.bringObjectToFront(obj as unknown as Parameters<FabricCanvas["bringObjectToFront"]>[0]));
            canvas.renderAll();
            pushHistory(canvas);
          } catch {
            /* ignore */
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [pushHistory, addSvgStringToCanvas, fileUploadUrl]);

  // ── Click outside → deselect ─────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (!fabricRef.current) return;
      const canvasEl = canvasContainerRef.current;
      const toolbarEl = document.getElementById("customizer-toolbar");
      const mainToolbar = document.getElementById("customizer-main-toolbar");
      const target = e.target as Node;
      if (canvasEl?.contains(target)) return;
      if (toolbarEl?.contains(target)) return;
      if (mainToolbar?.contains(target)) return; // ← keep selection when clicking toolbar buttons
      // Don't deselect when clicking inside a Radix dialog portal
      const inDialog = !!(target as Element)?.closest?.('[role="dialog"]');
      if (inDialog) return;
      // Don't deselect when clicking inside any floating editor panel
      // (Shape, Layers, Draw/Pen, Character). Without this, every slider
      // tap closed the panel the user was actively using.
      const inFloatingPanel = !!(target as Element)?.closest?.('[data-customizer-panel]');
      if (inFloatingPanel) return;
      fabricRef.current.discardActiveObject();
      fabricRef.current.renderAll();
      setHasSelection(false);
      setActiveTool("select");
      setPopupTool(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Real-time text + shape updaters ──────────────────────────────────────
  const updateSelectedTextFont = useCallback((fontIdx: number): void => {
    setSelectedFont(fontIdx);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.type === "text") {
      (active as FabricText).set({ fontFamily: fontOptions[fontIdx].family });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [fontOptions, pushHistory]);

  const updateSelectedTextSize = useCallback((newSize: number): void => {
    setFontSize(newSize);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.type === "text") {
      (active as FabricText).set({ fontSize: newSize });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory]);

  const updateSelectedTextColor = useCallback((color: string): void => {
    setTextColor(color);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.type === "text") {
      (active as FabricText).set({ fill: color });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory]);

  const updateSelectedShapeFill = useCallback((color: string): void => {
    setFillColor(color);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.type !== "text" && active.selectable) {
      active.set({ fill: color });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory]);

  // Build a fabric-compatible strokeDashArray for a given pattern + width.
  // Returns undefined for solid (no dash).
  const dashArrayFor = useCallback((pattern: "solid" | "dashed" | "dotted", width: number): number[] | undefined => {
    if (pattern === "solid" || width <= 0) return undefined;
    if (pattern === "dashed") return [width * 3, width * 2];
    return [Math.max(1, Math.round(width * 0.7)), Math.max(2, width * 1.5)]; // dotted
  }, []);

  const updateSelectedShapeStrokeColor = useCallback((color: string): void => {
    setStrokeColor(color);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.type !== "text" && active.type !== "image" && active.selectable) {
      (active as any).set({ stroke: color });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory]);

  const updateSelectedShapeStrokeWidth = useCallback((w: number): void => {
    setStrokeWidth(w);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.type !== "text" && active.type !== "image" && active.selectable) {
      (active as any).set({ strokeWidth: w, strokeUniform: true, strokeDashArray: dashArrayFor(strokeDash, w) });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory, strokeDash, dashArrayFor]);

  const updateSelectedShapeStrokeDash = useCallback((pattern: "solid" | "dashed" | "dotted"): void => {
    setStrokeDash(pattern);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.type !== "text" && active.type !== "image" && active.selectable) {
      const w = (active as any).strokeWidth || strokeWidth || 1;
      (active as any).set({ strokeDashArray: dashArrayFor(pattern, w) });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory, strokeWidth, dashArrayFor]);

  const updateSelectedShapeRadius = useCallback((r: number): void => {
    setCornerRadius(r);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject() as any;
    // Only rect-family supports rx/ry
    if (active && active.type === "rect" && active.selectable) {
      active.set({ rx: r, ry: r });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory]);

  const updateSelectedShapeOpacity = useCallback((o: number): void => {
    setShapeOpacity(o);
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.selectable) {
      (active as any).set({ opacity: o });
      fabricRef.current.renderAll();
      pushHistory(fabricRef.current);
    }
  }, [pushHistory]);

  useEffect(() => {
    if (!fabricRef.current) return;
    (fabricRef.current.getObjects() as unknown as Array<Record<string, unknown>>).forEach((obj) => {
      if (obj.__isMaskOutline) (obj as unknown as { set: (a: Record<string, unknown>) => void }).set({ visible: showMask });
    });
    fabricRef.current.renderAll();
  }, [showMask]);

  // Canvas background colour → sync to fabric so the chosen bg is part of
  // the exported template (canvas.toJSON() captures backgroundColor).
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    (canvas as any).backgroundColor = canvasBg === "transparent" ? "" : canvasBg;
    canvas.requestRenderAll();
  }, [canvasBg, canvasReady]);

  // ── Pen tool (simple line-path with optional curves) ──────────────────
  // Click  = add straight anchor
  // Click+drag = pull an outgoing curve handle for THIS segment only
  //              (no auto-mirroring — the next segment stays straight unless
  //              that anchor is also dragged, so behaviour is predictable)
  // Click first anchor OR "Close" button = close + commit
  // Enter / "Finish" button = commit open path
  // Esc = cancel
  //
  // No double-click commit — it caused accidental path commits when the
  // user was just clicking quickly.
  type PenAnchor = { x: number; y: number; outX?: number; outY?: number };
  const penAnchorsRef = useRef<PenAnchor[]>([]);
  const penDraggingRef = useRef(false);
  const penPreviewRef = useRef<any>(null);
  const penAnchorDotsRef = useRef<any[]>([]);
  const penMouseRef = useRef<{ x: number; y: number } | null>(null);

  const buildPenPathD = useCallback((anchors: PenAnchor[], opts?: { close?: boolean; mouse?: { x: number; y: number } | null }) => {
    const { close = false, mouse = null } = opts || {};
    if (!anchors.length) return "";
    let d = `M ${anchors[0].x} ${anchors[0].y}`;
    for (let i = 1; i < anchors.length; i++) {
      const prev = anchors[i - 1];
      const cur = anchors[i];
      // Only curve when the previous anchor has an out-handle that's
      // meaningfully offset from the anchor itself (user dragged). Otherwise
      // draw a straight line — keeps simple click-to-add predictable.
      const hasCurve =
        typeof prev.outX === "number" && typeof prev.outY === "number" &&
        (Math.abs(prev.outX - prev.x) > 0.5 || Math.abs(prev.outY - prev.y) > 0.5);
      if (hasCurve) {
        // Use quadratic with prev's out-handle as the single control point.
        d += ` Q ${prev.outX} ${prev.outY} ${cur.x} ${cur.y}`;
      } else {
        d += ` L ${cur.x} ${cur.y}`;
      }
    }
    if (mouse && !close) {
      const last = anchors[anchors.length - 1];
      const hasCurve =
        typeof last.outX === "number" && typeof last.outY === "number" &&
        (Math.abs(last.outX - last.x) > 0.5 || Math.abs(last.outY - last.y) > 0.5);
      if (hasCurve) d += ` Q ${last.outX} ${last.outY} ${mouse.x} ${mouse.y}`;
      else d += ` L ${mouse.x} ${mouse.y}`;
    }
    if (close) d += " Z";
    return d;
  }, []);

  const clearPenPreview = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
    for (const dot of penAnchorDotsRef.current) { canvas.remove(dot); }
    penAnchorDotsRef.current = [];
  }, []);

  const refreshPenPreview = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    clearPenPreview();
    const anchors = penAnchorsRef.current;
    if (!anchors.length) { canvas.requestRenderAll(); return; }
    const d = buildPenPathD(anchors, { mouse: penMouseRef.current });
    if (!d) { canvas.requestRenderAll(); return; }
    const sw = strokeWidth > 0 ? strokeWidth : 2;
    const preview = new Path(d, {
      fill: "transparent",
      stroke: strokeColor || "#1A1A2E",
      strokeWidth: sw,
      strokeDashArray: [sw * 2, sw * 2],
      strokeUniform: true,
      selectable: false,
      evented: false,
      hoverCursor: "crosshair",
      objectCaching: false,
    }) as any;
    preview.__isPenPreview = true;
    canvas.add(preview);
    penPreviewRef.current = preview;
    // Anchor dots so the user can SEE every click they've placed.
    anchors.forEach((a, idx) => {
      const isFirst = idx === 0;
      const dot = new FabricCircle({
        left: a.x, top: a.y,
        originX: "center", originY: "center",
        radius: isFirst ? 5 : 3.5,
        fill: isFirst ? "#fff" : strokeColor || "#1A1A2E",
        stroke: isFirst ? "#DA1C5C" : "#fff",
        strokeWidth: 1.5,
        selectable: false,
        evented: false,
        hoverCursor: "crosshair",
        objectCaching: false,
      }) as any;
      dot.__isPenPreview = true;
      canvas.add(dot);
      penAnchorDotsRef.current.push(dot);
    });
    canvas.requestRenderAll();
  }, [strokeColor, strokeWidth, buildPenPathD, clearPenPreview]);

  const commitPen = useCallback((close: boolean) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    clearPenPreview();
    const anchors = penAnchorsRef.current;
    penAnchorsRef.current = [];
    penMouseRef.current = null;
    if (anchors.length < 2) { canvas.requestRenderAll(); return; }
    const d = buildPenPathD(anchors, { close });
    const sw = strokeWidth > 0 ? strokeWidth : 2;
    const path = new Path(d, {
      fill: close ? fillColor : "transparent",
      stroke: strokeWidth > 0 ? strokeColor : "#1A1A2E",
      strokeWidth: sw,
      strokeDashArray: dashArrayFor(strokeDash, sw),
      strokeUniform: true,
      opacity: shapeOpacity,
    }) as any;
    canvas.add(path);
    canvas.setActiveObject(path);
    canvas.requestRenderAll();
    pushHistory(canvas);
  }, [fillColor, strokeColor, strokeWidth, strokeDash, shapeOpacity, dashArrayFor, buildPenPathD, clearPenPreview, pushHistory]);

  const cancelPen = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    clearPenPreview();
    penAnchorsRef.current = [];
    penMouseRef.current = null;
    canvas.requestRenderAll();
  }, [clearPenPreview]);

  // Wire mouse + keyboard events while Pen tool is active
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = false;

    if (activeTool !== "draw") {
      cancelPen();
      canvas.selection = true;
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
      return;
    }

    canvas.selection = false;
    canvas.defaultCursor = "crosshair";
    canvas.hoverCursor = "crosshair";
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    const onDown = (opt: any) => {
      const p = canvas.getPointer(opt.e);
      const anchors = penAnchorsRef.current;
      // Clicking near the first anchor closes the path.
      if (anchors.length > 1) {
        const first = anchors[0];
        if (Math.hypot(p.x - first.x, p.y - first.y) < 10) {
          commitPen(true);
          return;
        }
      }
      anchors.push({ x: p.x, y: p.y });
      penDraggingRef.current = true;
      penMouseRef.current = { x: p.x, y: p.y };
      refreshPenPreview();
    };
    const onMove = (opt: any) => {
      const p = canvas.getPointer(opt.e);
      penMouseRef.current = { x: p.x, y: p.y };
      const anchors = penAnchorsRef.current;
      // Only while the mouse button is held after a click do we let the drag
      // pull out a curve handle. Prevents every mouse move from being a curve.
      if (penDraggingRef.current && anchors.length) {
        const last = anchors[anchors.length - 1];
        last.outX = p.x;
        last.outY = p.y;
      }
      refreshPenPreview();
    };
    const onUp = () => { penDraggingRef.current = false; };

    canvas.on("mouse:down", onDown);
    canvas.on("mouse:move", onMove);
    canvas.on("mouse:up", onUp);

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || (target && target.isContentEditable)) return;
      if (e.key === "Enter") { e.preventDefault(); commitPen(false); }
      else if (e.key === "Escape") { e.preventDefault(); cancelPen(); }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      canvas.off("mouse:down", onDown);
      canvas.off("mouse:move", onMove);
      canvas.off("mouse:up", onUp);
      window.removeEventListener("keydown", onKey);
      cancelPen();
      canvas.selection = true;
      canvas.defaultCursor = "default";
      canvas.hoverCursor = "move";
    };
  }, [activeTool, canvasReady, refreshPenPreview, commitPen, cancelPen]);

  // ── Undo / redo ──────────────────────────────────────────────────────────
  const undo = useCallback((): void => {
    if (historyIndexRef.current <= 0 || !fabricRef.current) return;
    historyIndexRef.current -= 1;
    fabricRef.current.loadFromJSON(historyRef.current[historyIndexRef.current]).then(() => {
      fabricRef.current?.renderAll();
      if (fabricRef.current) emitChange(fabricRef.current);
      forceUpdate((n) => n + 1);
    });
  }, [emitChange]);

  const redo = useCallback((): void => {
    if (historyIndexRef.current >= historyRef.current.length - 1 || !fabricRef.current) return;
    historyIndexRef.current += 1;
    fabricRef.current.loadFromJSON(historyRef.current[historyIndexRef.current]).then(() => {
      fabricRef.current?.renderAll();
      if (fabricRef.current) emitChange(fabricRef.current);
      forceUpdate((n) => n + 1);
    });
  }, [emitChange]);

  // ── Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl+Shift+Z / Ctrl+Y (redo)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in a text field
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || (target && target.isContentEditable)) return;
      // Delete / Backspace → remove selected object (no modifier required)
      if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey && !e.metaKey) {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const active = canvas.getActiveObject() as any;
        if (!active) return;
        // Never delete the product base / overlay / mask outline
        if (active.__isBaseProduct || active.__isOverlay || active.__isMaskOutline) return;
        e.preventDefault();
        // Handle multi-selection (ActiveSelection)
        if (active.type === "activeselection" && typeof active.forEachObject === "function") {
          active.forEachObject((o: any) => canvas.remove(o));
          canvas.discardActiveObject();
        } else {
          canvas.remove(active);
        }
        canvas.requestRenderAll();
        pushHistory(canvas);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
      else if (key === "a") {
        // Ctrl/Cmd+A → select every user-editable layer (skip product base,
        // overlay, mask outline, and any in-progress pen preview).
        const canvas = fabricRef.current;
        if (!canvas) return;
        e.preventDefault();
        const all = canvas.getObjects() as unknown as Array<Record<string, any>>;
        const selectable = all.filter((o) =>
          !o.__isBaseProduct && !o.__isOverlay && !o.__isMaskOutline && !o.__isPenPreview && o.selectable !== false
        ) as any[];
        if (!selectable.length) return;
        canvas.discardActiveObject();
        if (selectable.length === 1) {
          canvas.setActiveObject(selectable[0]);
        } else {
          const sel = new ActiveSelection(selectable, { canvas });
          canvas.setActiveObject(sel);
        }
        canvas.requestRenderAll();
        setHasSelection(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, pushHistory]);

  // ── Add text / shape / image ─────────────────────────────────────────────
  const addText = useCallback((): void => {
    if (!fabricRef.current || !textInput.trim()) return;
    if (maxTexts > 0) {
      const counts = (fabricRef.current.getObjects() as unknown as Array<Record<string, unknown>>).filter((obj) => obj.type === "text" && !obj.__isBaseProduct && !obj.__isOverlay && !obj.__isMaskOutline);
      if (counts.length >= maxTexts) {
        toast({ title: "Text limit reached", description: `Maximum ${maxTexts} text(s) allowed for this product`, variant: "destructive" });
        return;
      }
    }
    const cw = fabricRef.current.width || 400;
    const ch = fabricRef.current.height || 400;
    const text = new FabricText(textInput, {
      left: cw / 2, top: ch / 2, originX: "center", originY: "center",
      fontFamily: fontOptions[selectedFont].family, fontSize, fill: textColor, editable: true,
    });
    fabricRef.current.add(text);
    fabricRef.current.setActiveObject(text);
    fabricRef.current.renderAll();
    pushHistory(fabricRef.current);
    setTextInput("");
    toast({ title: "Text added" });
  }, [textInput, selectedFont, fontSize, textColor, pushHistory, maxTexts, fontOptions]);

  const addShape = useCallback((): void => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (maxMasks > 0) {
      const counts = (canvas.getObjects() as unknown as Array<Record<string, unknown>>).filter((obj) => obj.type !== "text" && obj.type !== "i-text" && obj.type !== "textbox" && obj.type !== "image" && !obj.__isBaseProduct && !obj.__isOverlay && !obj.__isMaskOutline);
      if (counts.length >= maxMasks) {
        toast({ title: "Shape limit reached", description: `Maximum ${maxMasks} shape(s) allowed`, variant: "destructive" });
        return;
      }
    }
    const cw = canvas.width || 400;
    const ch = canvas.height || 400;
    let shape: Parameters<FabricCanvas["add"]>[0] | null = null;
    const effectiveStrokeWidth = strokeWidth > 0 ? strokeWidth : 0;
    const commonProps = {
      left: cw / 2,
      top: ch / 2,
      originX: "center" as const,
      originY: "center" as const,
      fill: fillColor,
      stroke: effectiveStrokeWidth > 0 ? strokeColor : "rgba(0,0,0,0.15)",
      strokeWidth: effectiveStrokeWidth > 0 ? effectiveStrokeWidth : 1,
      strokeDashArray: dashArrayFor(strokeDash, effectiveStrokeWidth > 0 ? effectiveStrokeWidth : 1),
      strokeUniform: true,
      opacity: shapeOpacity,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    };
    switch (shapeType) {
      case "rect": shape = new Rect({ ...commonProps, width: 80, height: 80, rx: cornerRadius, ry: cornerRadius }); break;
      case "circle": shape = new FabricCircle({ ...commonProps, radius: 40 }); break;
      case "triangle": shape = new FabricTriangle({ ...commonProps, width: 80, height: 80 }); break;
      case "heart": shape = new Polygon(createHeartPoints(40), { ...commonProps }); break;
      case "diamond": shape = new Polygon(createDiamondPoints(80), { ...commonProps }); break;
      case "hexagon": shape = new Polygon(createHexagonPoints(80), { ...commonProps }); break;
      case "star": shape = new Polygon(createStarPoints(0, 0, 40, 18, 5), { ...commonProps }); break;
      case "arrow": shape = new Polygon(createArrowPoints(80), { ...commonProps }); break;
      case "custom":
        // SVG upload — open file picker; shape is added by the onChange handler
        svgShapeInputRef.current?.click();
        return;
    }
    if (!shape) return;
    canvas.add(shape);
    // Layering: push bases to back, then put shape above overlays/masks so it's visible.
    // (Previously overlays were brought to front AFTER the shape, which hid the shape.)
    const allObjects = canvas.getObjects() as unknown as Array<Record<string, unknown>>;
    allObjects.filter((o) => o.__isBaseProduct).forEach((o) => canvas.sendObjectToBack(o as unknown as Parameters<FabricCanvas["sendObjectToBack"]>[0]));
    canvas.bringObjectToFront(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
    pushHistory(canvas);
    toast({ title: "Shape added" });
  }, [shapeType, fillColor, strokeColor, strokeWidth, strokeDash, cornerRadius, shapeOpacity, dashArrayFor, pushHistory, maxMasks]);

  // Layer controls
  const fixLayerOrder = useCallback((canvas: FabricCanvas): void => {
    const objects = [...canvas.getObjects()] as unknown as Array<Record<string, unknown>>;
    const bases = objects.filter((obj) => obj.__isBaseProduct);
    const overlays = objects.filter((obj) => obj.__isOverlay);
    const masks = objects.filter((obj) => obj.__isMaskOutline);
    bases.forEach((obj) => canvas.sendObjectToBack(obj as unknown as Parameters<FabricCanvas["sendObjectToBack"]>[0]));
    overlays.forEach((obj) => canvas.bringObjectToFront(obj as unknown as Parameters<FabricCanvas["bringObjectToFront"]>[0]));
    masks.forEach((obj) => canvas.bringObjectToFront(obj as unknown as Parameters<FabricCanvas["bringObjectToFront"]>[0]));
    canvas.renderAll();
  }, []);

  const applyMaskClipToImage = useCallback((img: FabricImage): void => {
    const maskInfo = maskClipRef.current;
    if (!maskInfo) return;
    const clip = createMaskClipPath(maskInfo.shape, maskInfo.size, maskInfo.pos);
    if (clip) {
      (img as unknown as { clipPath: unknown }).clipPath = clip;
    }
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file || !fabricRef.current) return;
    if (maxImages > 0) {
      const imgCount = (fabricRef.current.getObjects() as unknown as Array<Record<string, unknown>>).filter((obj) => obj.type === "image" && !obj.__isBaseProduct && !obj.__isOverlay && !obj.__isMaskOutline);
      if (imgCount.length >= maxImages) {
        toast({ title: "Image limit reached", description: `Maximum ${maxImages} image(s) allowed for this product`, variant: "destructive" });
        e.target.value = "";
        return;
      }
    }
    (fileUploadUrl ? uploadToServer(file, fileUploadUrl) : uploadUserFile(file)).then((url) => {
      // Server URLs need crossOrigin so canvas.toDataURL() can read them back.
      // Data URLs are same-origin by construction — no crossOrigin needed.
      return FabricImage.fromURL(url, fileUploadUrl ? { crossOrigin: "anonymous" } : {}).then((img) => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const cw = canvas.width || 400;
        const ch = canvas.height || 400;
        const scale = Math.min((cw * 0.5) / (img.width || 1), (ch * 0.5) / (img.height || 1));
        img.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
        applyMaskClipToImage(img);
        canvas.add(img);
        canvas.setActiveObject(img);
        fixLayerOrder(canvas);
        pushHistory(canvas);
        toast({ title: "Image added" });
      });
    }).catch(() => toast({ title: "Upload failed", variant: "destructive" }));
    e.target.value = "";
  }, [pushHistory, fixLayerOrder, applyMaskClipToImage, maxImages, fileUploadUrl]);

  const addStockImage = useCallback((url: string): void => {
    if (!fabricRef.current) return;
    if (maxImages > 0) {
      const imgCount = (fabricRef.current.getObjects() as unknown as Array<Record<string, unknown>>).filter((obj) => obj.type === "image" && !obj.__isBaseProduct && !obj.__isOverlay && !obj.__isMaskOutline);
      if (imgCount.length >= maxImages) {
        toast({ title: "Image limit reached", description: `Maximum ${maxImages} image(s) allowed`, variant: "destructive" });
        return;
      }
    }
    FabricImage.fromURL(url, { crossOrigin: "anonymous" }).then((img) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const cw = canvas.width || 400;
      const ch = canvas.height || 400;
      const scale = Math.min((cw * 0.45) / (img.width || 1), (ch * 0.45) / (img.height || 1));
      img.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
      applyMaskClipToImage(img);
      canvas.add(img);
      canvas.setActiveObject(img);
      fixLayerOrder(canvas);
      pushHistory(canvas);
      toast({ title: "Image added" });
    }).catch(() => toast({ title: "Failed to load image", variant: "destructive" }));
  }, [pushHistory, fixLayerOrder, applyMaskClipToImage, maxImages]);

  const applyTemplate = useCallback((tmpl: { id: string; label: string; objects: unknown[] }): void => {
    if (!fabricRef.current) return;
    const canvas = fabricRef.current;
    const toRemove = (canvas.getObjects() as unknown as Array<Record<string, unknown>>).filter((obj) => obj.selectable !== false && !obj.__isMaskOutline);
    toRemove.forEach((obj) => canvas.remove(obj as unknown as Parameters<FabricCanvas["remove"]>[0]));
    tmpl.objects.forEach((rawObj) => {
      const obj = rawObj as Record<string, unknown>;
      if (obj.type === "text") {
        const text = new FabricText(String(obj.text ?? ""), {
          left: obj.left as number, top: obj.top as number,
          originX: (obj.originX as "center") || "center", originY: (obj.originY as "center") || "center",
          fontFamily: (obj.fontFamily as string) || "'Outfit', sans-serif", fontSize: (obj.fontSize as number) || 24,
          fill: (obj.fill as string) || "#1A1A2E", editable: true,
        });
        canvas.add(text);
      }
    });
    canvas.renderAll();
    pushHistory(canvas);
    toast({ title: `Template "${tmpl.label}" applied` });
  }, [pushHistory]);

  const deleteSelected = useCallback((): void => {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObjects();
    if (active.length === 0) return;
    active.forEach((obj) => { if (obj.selectable && fabricRef.current) fabricRef.current.remove(obj); });
    fabricRef.current.discardActiveObject();
    fabricRef.current.renderAll();
    pushHistory(fabricRef.current);
  }, [pushHistory]);

  const bringForward = useCallback((): void => {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.selectable) {
      fabricRef.current.bringObjectForward(active, true);
      fixLayerOrder(fabricRef.current);
      fabricRef.current.requestRenderAll();
      pushHistory(fabricRef.current);
    }
  }, [fixLayerOrder, pushHistory]);

  const sendBackward = useCallback((): void => {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.selectable) {
      fabricRef.current.sendObjectBackwards(active, true);
      fixLayerOrder(fabricRef.current);
      fabricRef.current.requestRenderAll();
      pushHistory(fabricRef.current);
    }
  }, [fixLayerOrder, pushHistory]);

  const bringToFront = useCallback((): void => {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.selectable) {
      fabricRef.current.bringObjectToFront(active);
      fixLayerOrder(fabricRef.current);
      fabricRef.current.requestRenderAll();
      pushHistory(fabricRef.current);
    }
  }, [fixLayerOrder, pushHistory]);

  const sendToBack = useCallback((): void => {
    if (!fabricRef.current) return;
    const active = fabricRef.current.getActiveObject();
    if (active && active.selectable) {
      fabricRef.current.sendObjectToBack(active);
      fixLayerOrder(fabricRef.current);
      fabricRef.current.requestRenderAll();
      pushHistory(fabricRef.current);
    }
  }, [fixLayerOrder, pushHistory]);

  const exportCanvas = useCallback((): string | undefined => {
    if (!fabricRef.current) return undefined;
    return fabricRef.current.toDataURL({ format: "png", quality: 1, multiplier: 2 });
  }, []);

  const handleAiGenerate = async (): Promise<void> => {
    if (!aiPrompt.trim()) {
      toast({ title: "Enter a prompt", description: "Describe the image you want to generate" });
      return;
    }
    setAiGenerating(true);
    toast({ title: "Generating image…", description: "This may take a few seconds" });
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data: { imageUrl?: string; error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      const imageUrl = data.imageUrl;
      if (!imageUrl) throw new Error("No image returned");
      if (fabricRef.current) {
        const img = await FabricImage.fromURL(imageUrl);
        const canvas = fabricRef.current;
        const cw = canvas.width || 400;
        const ch = canvas.height || 400;
        const scale = Math.min((cw * 0.6) / (img.width || 1), (ch * 0.6) / (img.height || 1));
        img.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        pushHistory(canvas);
      }
      toast({ title: "Image generated" });
      setAiPrompt("");
    } catch (err) {
      console.error("AI generation error:", err);
      toast({ title: "Generation failed", description: (err as Error).message || "Please try again", variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleDownloadDesign = (): void => {
    const dataUrl = exportCanvas();
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.download = `${productName || "design"}-gifteeng.png`;
    link.href = dataUrl;
    link.click();
    toast({ title: "Design saved" });
  };

  // ── Load design templates + stock images on mount ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tRes, sRes] = await Promise.all([
          fetch("/api/admin/design-templates").catch(() => null),
          fetch("/api/admin/stock-images").catch(() => null),
        ]);
        if (tRes && tRes.ok && !cancelled) {
          const data: Array<{ id: string; label: string; category: string; thumbnail: string; canvas_json: unknown }> = await tRes.json();
          const adminTemplates: DesignTemplateRecord[] = data.map((t) => ({
            id: t.id,
            label: t.label,
            category: t.category,
            thumbnail: t.thumbnail,
            objects: Array.isArray(t.canvas_json) ? t.canvas_json : [],
          }));
          // Show only admin-curated templates; ignore built-in fallbacks
          setTemplates(adminTemplates);
        }
        if (sRes && sRes.ok && !cancelled) {
          const data: Array<{ label: string; image_url: string }> = await sRes.json();
          setStockImages(data.map((s) => ({ label: s.label, url: s.image_url })));
        }
      } catch {
        /* ignore — optional endpoints */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── UI ───────────────────────────────────────────────────────────────────
  const popupTools: ToolMode[] = ["upload", "images", "templates"];
  const allTools: { mode: ToolMode; icon: typeof Upload; label: string }[] = [
    { mode: "upload", icon: Upload, label: "Upload" },
    { mode: "images", icon: ImageIcon, label: "Images" },
    { mode: "text", icon: Type, label: "Text" },
    { mode: "shape", icon: Square, label: "Shape" },
    { mode: "draw", icon: Pencil, label: "Draw" },
    { mode: "templates", icon: LayoutTemplate, label: "Templates" },
  ];
  const tools = mode === "simple"
    ? allTools.filter((t) => t.mode === "text" || t.mode === "templates")
    : allTools;

  const shapeOptions: { type: ShapeType; icon: typeof Square; label: string }[] = [
    { type: "rect", icon: Square, label: "Rect" },
    { type: "circle", icon: Circle, label: "Circle" },
    { type: "triangle", icon: Triangle, label: "Triangle" },
    { type: "heart", icon: Heart, label: "Heart" },
    { type: "diamond", icon: Diamond, label: "Diamond" },
    { type: "hexagon", icon: Hexagon, label: "Hexagon" },
    { type: "star", icon: Star, label: "Star" },
    { type: "arrow", icon: ArrowRight, label: "Arrow" },
    { type: "custom", icon: ImageIcon, label: "Custom" },
  ];

  return (
    <div className={cn("relative w-full max-w-6xl mx-auto", className)}>
      {/* Full-screen Preview Modal */}
      {fullPreview && (
        <div className="fixed inset-0 z-[100] bg-foreground/90 flex items-center justify-center p-4" onClick={() => { setFullPreview(false); setShowMockup(false); }}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-card flex items-center justify-center" onClick={() => { setFullPreview(false); setShowMockup(false); }}>
            <X className="w-5 h-5" />
          </button>
          <div className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <img src={exportCanvas() || ""} alt="Design Preview" className="w-full rounded-xl" />
            <div className="flex gap-2 mt-4 justify-center">
              <button onClick={handleDownloadDesign} className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2">
                <Download className="w-4 h-4" /> Download
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        {/* Photoshop-style workspace shell:
            deep charcoal background surrounds the canvas, thin neutral toolbar
            underneath. This replaces the old soft-pastel card layout. */}
        <div
          className="rounded-lg md:rounded-xl overflow-hidden shadow-[0_14px_60px_-20px_rgba(0,0,0,0.35)] border border-[#242428] mb-3 md:mb-5"
          style={{ background: "#1e1e22" }}
        >
          {/* Canvas with drag-and-drop — dark workspace surround */}
          <div
            className={cn(
              "flex justify-center p-4 md:p-6 relative transition-all",
              isDragging && "ring-2 ring-primary ring-inset bg-primary/10",
            )}
            style={{
              background: isDragging
                ? undefined
                : "radial-gradient(ellipse at 50% 30%, #2a2a30 0%, #1a1a1e 100%)",
              minHeight: 320,
            }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              if (!fabricRef.current) return;

              // ── First check if the drag carried raw SVG markup (e.g. dragged
              //    from Illustrator, VS Code, or a browser). Many apps expose
              //    <svg>…</svg> as text/plain or text/html on the dataTransfer.
              const textSvg = e.dataTransfer.getData("text/plain") || "";
              const htmlSvg = e.dataTransfer.getData("text/html") || "";
              const looksLikeSvg = (s: string): boolean => /<svg[\s>]/i.test(s.trim());
              let droppedSvg: string | null = null;
              if (looksLikeSvg(textSvg)) droppedSvg = textSvg.trim();
              else if (looksLikeSvg(htmlSvg)) {
                const m = htmlSvg.match(/<svg[\s\S]*?<\/svg>/i);
                if (m) droppedSvg = m[0];
              }
              if (droppedSvg) {
                await addSvgStringToCanvas(droppedSvg);
                return;
              }

              const files = e.dataTransfer.files;
              if (!files.length) return;
              const file = files[0];
              if (!file) return;

              // ── SVG file drop — read as text & parse via Fabric SVG loader
              if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
                try {
                  const text = await file.text();
                  await addSvgStringToCanvas(text);
                } catch { /* ignore */ }
                return;
              }

              if (!file.type.startsWith("image/")) return;
              if (maxImages > 0) {
                const imgCount = (fabricRef.current.getObjects() as unknown as Array<Record<string, unknown>>).filter((obj) => obj.type === "image" && !obj.__isBaseProduct && !obj.__isOverlay && !obj.__isMaskOutline);
                if (imgCount.length >= maxImages) {
                  toast({ title: "Image limit reached", description: `Maximum ${maxImages} image(s) allowed`, variant: "destructive" });
                  return;
                }
              }
              // blob: URLs don't survive Fabric serialization — fall back to
              // base64 only when no upload endpoint is configured.
              const url = fileUploadUrl
                ? await uploadToServer(file, fileUploadUrl)
                : await uploadUserFile(file);
              const img = await FabricImage.fromURL(url, fileUploadUrl ? { crossOrigin: "anonymous" } : {});
              const canvas = fabricRef.current;
              const cw = canvas.width || 400;
              const ch = canvas.height || 400;
              const scale = Math.min((cw * 0.8) / (img.width || 1), (ch * 0.8) / (img.height || 1));
              img.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center", scaleX: scale, scaleY: scale });
              canvas.add(img);
              canvas.setActiveObject(img);
              canvas.renderAll();
              pushHistory(canvas);
            }}
          >
            {isDragging && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-primary/10 rounded-xl border-2 border-dashed border-primary pointer-events-none">
                <p className="text-sm font-bold text-primary">Drop image here</p>
              </div>
            )}
            <div
              ref={canvasContainerRef}
              className={cn(showMockup ? "hidden" : "", "rounded-sm")}
              style={{
                // Drop-shadow so the canvas "floats" on the dark workspace
                boxShadow: "0 16px 50px -10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
              }}
            />
            {showMockup && (
              <div className="relative flex items-center justify-center" style={{ width: Math.min(400, typeof window !== "undefined" ? window.innerWidth - 48 : 360), height: Math.min(400, typeof window !== "undefined" ? window.innerWidth - 48 : 360) }}>
                {canvasReady && (
                  <img src={exportCanvas() || ""} alt="Design Preview" className="max-w-full max-h-full object-contain" />
                )}
              </div>
            )}
          </div>

          {/* Photoshop-style dark toolbar (Options Bar equivalent)
              Compact icon-only tool strip — labels live in tooltips so the
              toolbar stays on a single line even at narrow viewports. */}
          <div
            id="customizer-main-toolbar"
            className="flex items-center gap-1 md:gap-1.5 px-1.5 md:px-3 py-1.5 border-t overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              background: "#18181b",
              borderColor: "#2a2a2e",
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {/* Primary tools — icon-only pill row */}
            <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
              {tools.map(({ mode, icon: Icon, label }) => {
                const isPopup = popupTools.includes(mode);
                const isActive = (!isPopup && activeTool === mode) || popupTool === mode;
                const isUpload = mode === "upload";
                return (
                  <button
                    key={mode}
                    title={label}
                    aria-label={label}
                    onClick={() => {
                      if (mode === "upload") {
                        fileInputRef.current?.click();
                      } else if (isPopup) {
                        setPopupTool((prev) => (prev === mode ? null : mode));
                      } else {
                        setActiveTool((prev) => (prev === mode ? "select" : mode));
                      }
                    }}
                    className={cn(
                      "inline-flex items-center justify-center rounded-md transition-all",
                      "w-9 h-9 md:w-9 md:h-9",
                      isActive
                        ? "bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white shadow-md shadow-pink-500/30"
                        : isUpload
                          ? "bg-gradient-to-r from-pink-500/25 to-amber-500/25 text-pink-100 hover:from-pink-500/40 hover:to-amber-500/40 border border-pink-500/40"
                          : "text-white/70 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
            <div className="w-px h-5 bg-white/10 mx-1 flex-shrink-0" />
            <div className="flex-1 min-w-0" />

            {/* Secondary controls — icon-only, right-aligned, no wrap */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button onClick={undo} className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Undo (Ctrl+Z)">
                <Undo2 className="w-4 h-4" />
              </button>
              <button onClick={redo} className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Redo (Ctrl+Shift+Z or Ctrl+Y)">
                <Redo2 className="w-4 h-4" />
              </button>
              {hasSelection && (
                <>
                  <button onClick={deleteSelected} className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-red-500/20 text-red-300 hover:text-red-200 transition-colors" title="Delete (Del)">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="w-px h-5 bg-white/10 mx-0.5 flex-shrink-0 hidden md:block" />
                  <button onClick={bringToFront} className="hidden md:inline-flex w-8 h-8 items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Bring to Front">
                    <ChevronsUp className="w-4 h-4" />
                  </button>
                  <button onClick={bringForward} className="hidden md:inline-flex w-8 h-8 items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Bring Forward">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button onClick={sendBackward} className="hidden md:inline-flex w-8 h-8 items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Send Backward">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button onClick={sendToBack} className="hidden md:inline-flex w-8 h-8 items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Send to Back">
                    <ChevronsDown className="w-4 h-4" />
                  </button>
                </>
              )}
              <div className="w-px h-5 bg-white/10 mx-0.5 flex-shrink-0" />
              {/* Canvas background — transparent toggle + colour picker */}
              <div className="flex items-center gap-1 flex-shrink-0" title="Canvas background">
                <button
                  type="button"
                  onClick={() => setCanvasBg("transparent")}
                  className={cn(
                    "w-6 h-6 rounded-md border relative overflow-hidden",
                    canvasBg === "transparent" ? "border-pink-400 ring-2 ring-pink-400/40" : "border-white/20",
                  )}
                  style={{
                    background: "repeating-conic-gradient(#666 0% 25%, #222 0% 50%) 0 0 / 8px 8px",
                  }}
                  title="Transparent canvas"
                  aria-label="Transparent background"
                />
                <input
                  type="color"
                  value={canvasBg === "transparent" ? "#ffffff" : canvasBg}
                  onChange={(e) => setCanvasBg(e.target.value)}
                  className="w-6 h-6 rounded-md border border-white/20 cursor-pointer bg-transparent p-0"
                  title="Canvas background colour"
                  aria-label="Canvas background colour"
                />
              </div>
              <button onClick={() => setShowMask(!showMask)} className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Toggle mask">
                {showMask ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button onClick={handleDownloadDesign} className="hidden md:inline-flex w-8 h-8 items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Download">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={() => setFullPreview(true)} className="w-8 h-8 inline-flex items-center justify-center rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors" title="Full preview">
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setLayersOpen((v) => !v); layersTick((n) => n + 1); }}
                className={cn("w-8 h-8 inline-flex items-center justify-center rounded-md transition-colors",
                  layersOpen ? "bg-pink-500/20 text-pink-300" : "hover:bg-white/10 text-white/70 hover:text-white")}
                title="Layers panel"
              >
                <Layers className="w-4 h-4" />
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { handleImageUpload(e); setPopupTool(null); }} />
          {/* SVG shape upload — triggered by Custom shape button */}
          <input
            ref={svgShapeInputRef}
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const text = await file.text();
                await addSvgStringToCanvas(text);
              } catch { /* ignore */ }
            }}
          />
        </div>

        {/* Text Panel — Photoshop "Character" popup
            Fixed-positioned floating card, dark theme, internal scroll.
            Positioned bottom-right on desktop, full-width at bottom on mobile. */}
        {activeTool === "text" && (
          <div
            id="customizer-toolbar"
            data-customizer-panel="text"
            className="fixed md:absolute left-0 right-0 md:left-auto md:right-4 bottom-0 md:bottom-auto md:top-4 z-[200] md:w-[340px] rounded-t-xl md:rounded-xl shadow-2xl border p-3 space-y-3 max-h-[70vh] overflow-y-auto"
            style={{
              background: "#1f1f23",
              borderColor: "#2e2e33",
              color: "rgba(255,255,255,0.92)",
              transform: `translate(${charOffset.x}px, ${charOffset.y}px)`,
            }}
          >
            {/* Panel header — drag handle */}
            <div
              className="flex items-center justify-between sticky top-0 -mx-3 px-3 pb-2 border-b border-white/5 mb-1 select-none cursor-grab active:cursor-grabbing"
              style={{ background: "#1f1f23" }}
              onPointerDown={(e) => {
                // Only start drag on primary button + non-button targets
                if ((e.target as HTMLElement).closest("button")) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                charDragRef.current = {
                  startX: e.clientX, startY: e.clientY,
                  baseX: charOffset.x, baseY: charOffset.y,
                };
              }}
              onPointerMove={(e) => {
                if (!charDragRef.current) return;
                const { startX, startY, baseX, baseY } = charDragRef.current;
                setCharOffset({
                  x: baseX + (e.clientX - startX),
                  y: baseY + (e.clientY - startY),
                });
              }}
              onPointerUp={(e) => {
                (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                charDragRef.current = null;
              }}
              onPointerCancel={() => { charDragRef.current = null; }}
              title="Drag to reposition"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60 flex items-center gap-1.5">
                <span className="inline-flex flex-col gap-0.5" aria-hidden>
                  <span className="flex gap-0.5"><span className="w-0.5 h-0.5 bg-white/40 rounded-full"/><span className="w-0.5 h-0.5 bg-white/40 rounded-full"/></span>
                  <span className="flex gap-0.5"><span className="w-0.5 h-0.5 bg-white/40 rounded-full"/><span className="w-0.5 h-0.5 bg-white/40 rounded-full"/></span>
                  <span className="flex gap-0.5"><span className="w-0.5 h-0.5 bg-white/40 rounded-full"/><span className="w-0.5 h-0.5 bg-white/40 rounded-full"/></span>
                </span>
                Character
              </p>
              <div className="flex items-center gap-1">
                {(charOffset.x !== 0 || charOffset.y !== 0) && (
                  <button
                    onClick={() => setCharOffset({ x: 0, y: 0 })}
                    className="w-6 h-6 rounded-md hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center text-[10px]"
                    title="Reset position"
                    aria-label="Reset position"
                  >
                    ⤴
                  </button>
                )}
                <button
                  onClick={() => setActiveTool("select")}
                  className="w-6 h-6 rounded-md hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
                  aria-label="Close"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Input + Add button */}
            <div className="flex gap-2">
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type your text…"
                className="flex-1 h-10 px-3 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                style={{
                  background: "#2a2a2f",
                  border: "1px solid #3a3a40",
                  color: "rgba(255,255,255,0.95)",
                }}
                maxLength={60}
                onKeyDown={(e) => { if (e.key === "Enter") addText(); }}
              />
              <button
                onClick={addText}
                className="h-10 px-4 rounded-lg text-white font-bold text-sm shrink-0 transition-all shadow-md"
                style={{ background: "linear-gradient(135deg, hsl(351 85% 58%) 0%, hsl(351 85% 48%) 100%)" }}
              >
                Add Text
              </button>
            </div>

            {/* Font picker */}
            <div>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-1.5">
                Font {hasSelection ? "· applies to selection" : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                {fontOptions.map((font, i) => (
                  <button
                    key={i}
                    onClick={() => updateSelectedTextFont(i)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap transition-all",
                      selectedFont === i
                        ? "text-white font-bold"
                        : "text-white/60 hover:text-white hover:bg-white/5",
                    )}
                    style={{
                      fontFamily: font.family,
                      background: selectedFont === i ? "linear-gradient(135deg,#ec4899,#a855f7)" : "rgba(255,255,255,0.04)",
                      border: selectedFont === i ? "1px solid transparent" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {font.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Size + Color row */}
            <div className="flex gap-3 items-center pt-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Size</span>
                  <span className="text-[11px] font-bold tabular-nums text-white">{fontSize}px</span>
                </div>
                <input
                  type="range" min="14" max="96" value={fontSize}
                  onChange={(e) => updateSelectedTextSize(Number(e.target.value))}
                  className="w-full accent-pink-500 h-2 rounded-full"
                />
              </div>
              <div className="shrink-0">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1">Color</span>
                <input
                  type="color" value={textColor}
                  onChange={(e) => updateSelectedTextColor(e.target.value)}
                  className="w-10 h-9 rounded-lg cursor-pointer p-0.5"
                  style={{ background: "transparent", border: "1px solid #3a3a40" }}
                />
              </div>
            </div>

            {maxTexts > 0 && (
              <p className="text-[10px] text-white/40 text-center tabular-nums">
                {fabricRef.current
                  ? (fabricRef.current.getObjects() as unknown as Array<Record<string, unknown>>)
                      .filter((o) => o.type === "text" && !o.__isBaseProduct && !o.__isOverlay && !o.__isMaskOutline).length
                  : 0}/{maxTexts} texts used
              </p>
            )}
          </div>
        )}

        {/* ── Layers panel (floating, draggable, Photoshop-style) ───── */}
        {layersOpen && (
          <div
            data-customizer-panel="layers"
            className="fixed md:absolute left-0 right-0 md:left-4 md:right-auto bottom-0 md:bottom-auto md:top-4 z-[200] md:w-[300px] rounded-t-xl md:rounded-xl shadow-2xl border p-3 space-y-2 max-h-[70vh] overflow-y-auto"
            style={{
              background: "#1f1f23",
              borderColor: "#2e2e33",
              color: "rgba(255,255,255,0.92)",
              transform: `translate(${layersOffset.x}px, ${layersOffset.y}px)`,
            }}
          >
            <div
              className="flex items-center justify-between sticky top-0 -mx-3 px-3 pb-2 border-b border-white/5 mb-1 select-none cursor-grab active:cursor-grabbing"
              style={{ background: "#1f1f23" }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                layersDragRef.current = {
                  startX: e.clientX, startY: e.clientY,
                  baseX: layersOffset.x, baseY: layersOffset.y,
                };
              }}
              onPointerMove={(e) => {
                if (!layersDragRef.current) return;
                const { startX, startY, baseX, baseY } = layersDragRef.current;
                setLayersOffset({ x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) });
              }}
              onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); layersDragRef.current = null; }}
              onPointerCancel={() => { layersDragRef.current = null; }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60 flex items-center gap-1.5">
                <Layers className="w-3 h-3" />
                Layers
              </p>
              <button
                onClick={() => setLayersOpen(false)}
                className="w-6 h-6 rounded-md hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
                title="Close"
              >✕</button>
            </div>

            {(() => {
              const canvas = fabricRef.current;
              if (!canvas) return <p className="text-[11px] text-white/40 text-center py-4">No canvas</p>;
              // Get user layers (non-product), show top-layer first (Photoshop order)
              const all = (canvas.getObjects() as unknown as Array<Record<string, any>>);
              const userLayers = all.filter(o => !o.__isBaseProduct && !o.__isOverlay && !o.__isMaskOutline && !o.__isPenPreview);
              if (userLayers.length === 0) {
                return <p className="text-[11px] text-white/40 text-center py-4">Empty — add text, shapes, or images</p>;
              }
              const topFirst = [...userLayers].reverse();
              const active = canvas.getActiveObject();
              return (
                <div className="space-y-1">
                  {topFirst.map((obj, idx) => {
                    const realIdx = userLayers.length - 1 - idx;
                    const type = String(obj.type ?? "object");
                    const text = obj.type === "text" ? String(obj.text ?? "") : "";
                    const label = text ? text.slice(0, 24) : `${type[0]!.toUpperCase()}${type.slice(1)} ${realIdx + 1}`;
                    const icon = type === "text" ? "T" : type === "image" ? "🖼" : "◼";
                    const visible = obj.visible !== false;
                    const isActive = active === obj;
                    return (
                      <div
                        key={(obj as any).__layerId ?? idx}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(realIdx));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = parseInt(e.dataTransfer.getData("text/plain") || "-1", 10);
                          if (from < 0 || from === realIdx) return;
                          const dragged = userLayers[from];
                          if (!dragged) return;
                          // Translate user-layer index to absolute canvas index
                          // (locked product/overlay/mask layers live below).
                          const locked = all.length - userLayers.length;
                          canvas.moveObjectTo(dragged as any, realIdx + locked);
                          canvas.renderAll();
                          pushHistory(canvas);
                          layersTick((n) => n + 1);
                        }}
                        onClick={() => {
                          canvas.setActiveObject(obj as any);
                          canvas.renderAll();
                          layersTick((n) => n + 1);
                        }}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 border cursor-grab active:cursor-grabbing transition-colors ${
                          isActive
                            ? "border-pink-500/60 bg-pink-500/10"
                            : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        {/* Live thumbnail for images & shapes; typographic
                            preview for text (so the font/colour read). */}
                        {(() => {
                          const previewBg = type === "text" ? "rgba(236,72,153,0.2)" : type === "image" ? "rgba(59,130,246,0.15)" : "rgba(168,85,247,0.15)";
                          if (type === "text") {
                            return (
                              <div
                                className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden"
                                style={{
                                  background: previewBg,
                                  border: "1px solid rgba(255,255,255,0.08)",
                                }}
                              >
                                <span
                                  className="text-sm font-black leading-none"
                                  style={{
                                    color: String((obj as any).fill ?? "#fff"),
                                    fontFamily: String((obj as any).fontFamily ?? "serif"),
                                    textShadow: "0 0 2px rgba(0,0,0,0.4)",
                                  }}
                                >
                                  Aa
                                </span>
                              </div>
                            );
                          }
                          // toDataURL with a small multiplier so the render is cheap.
                          // Guarded — some objects may throw (e.g. not-yet-loaded image).
                          let thumbUrl = "";
                          try {
                            const bounds = obj.getBoundingRect?.();
                            const mult = bounds && bounds.width > 0
                              ? Math.min(0.5, 40 / Math.max(bounds.width, bounds.height))
                              : 0.2;
                            thumbUrl = (obj as any).toDataURL?.({ multiplier: mult, format: "png" }) ?? "";
                          } catch { /* no-op */ }
                          return (
                            <div
                              className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden"
                              style={{
                                background: previewBg,
                                border: "1px solid rgba(255,255,255,0.08)",
                                backgroundImage: thumbUrl ? `url(${thumbUrl})` : undefined,
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                              }}
                            >
                              {!thumbUrl && (
                                <span className="text-white/70 text-sm font-black">{icon}</span>
                              )}
                            </div>
                          );
                        })()}
                        <span className="flex-1 min-w-0 text-[11px] text-white/85 truncate" title={label}>{label}</span>

                        {/* Visibility */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            obj.set("visible", !visible);
                            canvas.renderAll();
                            layersTick((n) => n + 1);
                          }}
                          className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
                          title={visible ? "Hide layer" : "Show layer"}
                        >
                          {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>

                        {/* Up (forward) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            canvas.bringObjectForward(obj as any);
                            canvas.renderAll();
                            pushHistory(canvas);
                            layersTick((n) => n + 1);
                          }}
                          className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white text-[13px]"
                          title="Bring forward"
                        >▲</button>

                        {/* Down (backward) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            canvas.sendObjectBackwards(obj as any);
                            canvas.renderAll();
                            pushHistory(canvas);
                            layersTick((n) => n + 1);
                          }}
                          className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white text-[13px]"
                          title="Send backward"
                        >▼</button>

                        {/* Delete */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            canvas.remove(obj as any);
                            canvas.renderAll();
                            pushHistory(canvas);
                            layersTick((n) => n + 1);
                          }}
                          className="w-6 h-6 rounded hover:bg-red-500/20 flex items-center justify-center text-red-400 hover:text-red-300"
                          title="Delete layer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-white/30 text-center pt-1">
                    Drag rows to reorder · ▲▼ for front/back · 👁 visibility
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Draw/Pen panel (floating, draggable) ───────────────────── */}
        {activeTool === "draw" && (
          <div
            data-customizer-panel="draw"
            className="fixed md:absolute left-0 right-0 md:left-auto md:right-4 bottom-0 md:bottom-auto md:top-4 z-[200] md:w-[280px] rounded-t-xl md:rounded-xl shadow-2xl border p-3 space-y-3 max-h-[70vh] overflow-y-auto"
            style={{
              background: "#1f1f23",
              borderColor: "#2e2e33",
              color: "rgba(255,255,255,0.92)",
              transform: `translate(${drawOffset.x}px, ${drawOffset.y}px)`,
            }}
          >
            <div
              className="flex items-center justify-between sticky top-0 -mx-3 px-3 pb-2 border-b border-white/5 mb-1 select-none cursor-grab active:cursor-grabbing"
              style={{ background: "#1f1f23" }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drawDragRef.current = {
                  startX: e.clientX, startY: e.clientY,
                  baseX: drawOffset.x, baseY: drawOffset.y,
                };
              }}
              onPointerMove={(e) => {
                if (!drawDragRef.current) return;
                const { startX, startY, baseX, baseY } = drawDragRef.current;
                setDrawOffset({ x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) });
              }}
              onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); drawDragRef.current = null; }}
              onPointerCancel={() => { drawDragRef.current = null; }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60 flex items-center gap-1.5">
                <Pencil className="w-3 h-3" />
                Pen · Bezier
              </p>
              <button
                onClick={() => setActiveTool("select")}
                className="w-6 h-6 rounded-md hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
                title="Close"
              >✕</button>
            </div>

            <div className="space-y-1 text-[11px] leading-relaxed text-white/70">
              <p className="flex items-start gap-1.5"><span className="inline-block w-1 h-1 rounded-full bg-pink-400 mt-1.5" /> <span><span className="text-white/90 font-semibold">Click</span> to add a straight anchor</span></p>
              <p className="flex items-start gap-1.5"><span className="inline-block w-1 h-1 rounded-full bg-pink-400 mt-1.5" /> <span><span className="text-white/90 font-semibold">Click + drag</span> to pull a curve handle</span></p>
              <p className="flex items-start gap-1.5"><span className="inline-block w-1 h-1 rounded-full bg-pink-400 mt-1.5" /> <span>Click the <span className="text-white/90 font-semibold">first anchor</span> to close</span></p>
              <p className="flex items-start gap-1.5"><span className="inline-block w-1 h-1 rounded-full bg-pink-400 mt-1.5" /> <span><kbd className="px-1 py-px rounded bg-white/10 text-white/90 text-[10px] font-semibold">Enter</kbd> or double-click = finish open</span></p>
              <p className="flex items-start gap-1.5"><span className="inline-block w-1 h-1 rounded-full bg-pink-400 mt-1.5" /> <span><kbd className="px-1 py-px rounded bg-white/10 text-white/90 text-[10px] font-semibold">Esc</kbd> = cancel</span></p>
            </div>

            <div className="flex gap-2 pt-1 border-t border-white/5">
              <button
                onClick={() => commitPen(false)}
                className="flex-1 text-[11px] font-semibold py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white/90"
                title="Enter"
              >Finish open</button>
              <button
                onClick={() => commitPen(true)}
                className="flex-1 text-[11px] font-semibold py-1.5 rounded-md bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white"
              >Close path</button>
            </div>

            <p className="text-[10px] text-white/40">Stroke colour &amp; width are set in the <span className="text-white/70 font-semibold">Shape</span> panel.</p>
          </div>
        )}

        {/* ── Shape panel (floating, draggable — replaces old modal) ──── */}
        {activeTool === "shape" && (
          <div
            data-customizer-panel="shape"
            className="fixed md:absolute left-0 right-0 md:left-auto md:right-4 bottom-0 md:bottom-auto md:top-4 z-[200] md:w-[320px] rounded-t-xl md:rounded-xl shadow-2xl border p-3 space-y-3 max-h-[80vh] overflow-y-auto"
            style={{
              background: "#1f1f23",
              borderColor: "#2e2e33",
              color: "rgba(255,255,255,0.92)",
              transform: `translate(${shapeOffset.x}px, ${shapeOffset.y}px)`,
            }}
          >
            <div
              className="flex items-center justify-between sticky top-0 -mx-3 px-3 pb-2 border-b border-white/5 mb-1 select-none cursor-grab active:cursor-grabbing"
              style={{ background: "#1f1f23" }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button, input")) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                shapeDragRef.current = {
                  startX: e.clientX, startY: e.clientY,
                  baseX: shapeOffset.x, baseY: shapeOffset.y,
                };
              }}
              onPointerMove={(e) => {
                if (!shapeDragRef.current) return;
                const { startX, startY, baseX, baseY } = shapeDragRef.current;
                setShapeOffset({ x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) });
              }}
              onPointerUp={(e) => { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); shapeDragRef.current = null; }}
              onPointerCancel={() => { shapeDragRef.current = null; }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60 flex items-center gap-1.5">
                <Square className="w-3 h-3" />
                Shape
              </p>
              <button
                onClick={() => setActiveTool("select")}
                className="w-6 h-6 rounded-md hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
                title="Close"
              >✕</button>
            </div>

            {/* Shape picker */}
            <div className="grid grid-cols-4 gap-1.5">
              {shapeOptions.map(({ type, icon: Icon, label }) => (
                <button
                  key={type} onClick={() => setShapeType(type)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-all",
                    shapeType === type ? "bg-white text-black" : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>

            {/* Fill */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5 block">
                Fill {hasSelection ? "· live" : ""}
              </label>
              <div className="flex gap-1.5 flex-wrap items-center">
                {paletteColors.map((color) => (
                  <button
                    key={color} onClick={() => updateSelectedShapeFill(color)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      fillColor === color ? "border-pink-400 scale-110 ring-2 ring-pink-400/30" : "border-white/20",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <input
                  type="color"
                  value={fillColor}
                  onChange={(e) => updateSelectedShapeFill(e.target.value)}
                  className="w-6 h-6 rounded-full border-2 border-white/20 cursor-pointer bg-transparent"
                  title="Custom fill"
                />
              </div>
            </div>

            {/* Outline */}
            <div className="space-y-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Outline</label>
                <span className="text-[10px] text-white/50 font-mono">{strokeWidth === 0 ? "None" : `${strokeWidth}px`}</span>
              </div>
              <input
                type="range" min={0} max={20} value={strokeWidth}
                onChange={(e) => updateSelectedShapeStrokeWidth(parseInt(e.target.value, 10) || 0)}
                className="w-full accent-pink-500"
              />
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => updateSelectedShapeStrokeColor(e.target.value)}
                  className="w-7 h-7 rounded border border-white/20 cursor-pointer bg-transparent"
                  title="Outline colour"
                />
                <div className="flex gap-1 flex-1">
                  {(["solid", "dashed", "dotted"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => updateSelectedShapeStrokeDash(p)}
                      className={cn(
                        "flex-1 text-[10px] font-semibold py-1.5 rounded-md capitalize transition-colors",
                        strokeDash === p
                          ? "bg-white text-black"
                          : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                      )}
                    >{p}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Radius + Opacity */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Radius</label>
                  <span className="text-[10px] text-white/50 font-mono">{cornerRadius}px</span>
                </div>
                <input
                  type="range" min={0} max={60} value={cornerRadius}
                  onChange={(e) => updateSelectedShapeRadius(parseInt(e.target.value, 10) || 0)}
                  disabled={shapeType !== "rect" && !(fabricRef.current?.getActiveObject() as any)?.rx}
                  className="w-full accent-pink-500 disabled:opacity-40"
                  title="Corner radius (rectangles)"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/50">Opacity</label>
                  <span className="text-[10px] text-white/50 font-mono">{Math.round(shapeOpacity * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={100} value={Math.round(shapeOpacity * 100)}
                  onChange={(e) => updateSelectedShapeOpacity((parseInt(e.target.value, 10) || 0) / 100)}
                  className="w-full accent-pink-500"
                />
              </div>
            </div>

            {hasSelection && (
              <p className="text-[10px] text-pink-300 font-medium bg-pink-500/10 rounded-md px-2.5 py-1.5">
                Changes apply live to selected shape
              </p>
            )}

            <button
              onClick={() => addShape()}
              className="w-full text-[12px] font-bold py-2.5 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white hover:from-pink-600 hover:to-fuchsia-700 shadow-lg shadow-pink-500/30"
            >Add Shape</button>
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={popupTool === "upload"} onOpenChange={(open) => !open && setPopupTool(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Upload Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-all group"
            >
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3 group-hover:text-primary transition-colors" />
              <p className="text-sm text-foreground font-medium">Tap to upload</p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 10MB</p>
            </button>
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
              <p className="text-[10px] text-foreground font-medium">For best printing results, please use high-resolution images (minimum 300 DPI recommended)</p>
            </div>
            <div className="bg-muted rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground">Tip: You can also press <strong>Ctrl+V</strong> (or <strong>Cmd+V</strong> on Mac) to paste an image directly onto the canvas.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Images Dialog */}
      <Dialog open={popupTool === "images"} onOpenChange={(open) => !open && setPopupTool(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Select Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Pick from our gallery or upload your own</p>
            <div className="grid grid-cols-4 gap-2">
              {stockImages.map((img) => (
                <button
                  key={img.label}
                  onClick={() => { addStockImage(img.url); setPopupTool(null); }}
                  className="group relative aspect-square rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-all"
                >
                  <img src={img.url} alt={img.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform" loading="lazy" />
                  <div className="absolute inset-x-0 bottom-0 bg-foreground/70 py-0.5">
                    <span className="text-[9px] text-background font-medium">{img.label}</span>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-all cursor-pointer flex items-center justify-center"
            >
              <Upload className="w-4 h-4 inline mr-1.5" /> Upload your own
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shape Dialog */}
      {/* Templates Dialog */}
      <Dialog open={popupTool === "templates"} onOpenChange={(open) => !open && setPopupTool(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Templates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Pick a readymade design, then edit the text</p>
            {(() => {
              const categories = ["All", ...Array.from(new Set(templates.map((t) => t.category).filter(Boolean)))];
              return (
                <div className="flex gap-2 flex-wrap">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setTemplateCategory(cat)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[11px] font-medium transition-all",
                        templateCategory === cat
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              );
            })()}
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No templates available</p>
            ) : (
              (() => {
                // Match the preview thumbnail aspect to the CURRENT canvas so
                // the admin sees how each template will actually look on their
                // Landscape / Portrait / Square / Custom canvas.
                const cw = canvasWidth && canvasWidth > 0 ? canvasWidth : 1;
                const ch = canvasHeight && canvasHeight > 0 ? canvasHeight : 1;
                const previewAspect = `${cw} / ${ch}`;
                return (
              <div className="grid grid-cols-2 gap-3">
                {templates
                  .filter((tmpl) => templateCategory === "All" || tmpl.category === templateCategory)
                  .map((tmpl) => (
                    <button
                      key={tmpl.id}
                      onClick={() => { applyTemplate(tmpl); setPopupTool(null); }}
                      className="group relative rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-all text-left"
                    >
                      <div
                        className="relative bg-muted/50 flex items-center justify-center p-3"
                        style={{ aspectRatio: previewAspect }}
                      >
                        {(tmpl as { thumbnail?: string }).thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(tmpl as { thumbnail?: string }).thumbnail}
                            alt={tmpl.label}
                            className="w-full h-full object-cover absolute inset-0"
                          />
                        ) : (
                          <div className="text-center">
                            <span className="text-2xl block mb-1">{tmpl.label.split(" ").pop()}</span>
                            <span className="text-xs font-display font-bold text-foreground">{tmpl.label.replace(/[^\w\s]/g, "").trim()}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-2 bg-card relative z-10">
                        <span className="text-[10px] font-medium text-muted-foreground group-hover:text-primary transition-colors">
                          {tmpl.category && <span className="text-primary/70">{tmpl.category} · </span>}
                          {tmpl.objects.length} elements · Tap to apply
                        </span>
                      </div>
                    </button>
                  ))}
                {templates.filter((tmpl) => templateCategory === "All" || tmpl.category === templateCategory).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6 col-span-2">No templates in this category</p>
                )}
              </div>
                );
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default CanvasEditor;

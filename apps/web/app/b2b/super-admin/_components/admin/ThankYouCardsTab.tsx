"use client";

/**
 * ThankYouCardsTab — manage thank-you card templates shown at checkout.
 *
 * HOW IT WORKS:
 *   Cards are stored in /api/thank-you-cards (NestJS → thank_you_cards table).
 *   At checkout, customers can optionally add a personalised thank-you card
 *   to their order for a small fee.
 *
 *   Each card has:
 *     • Size (e.g. 4x6, 5x7, A5)
 *     • Template / Background / Foreground image URLs
 *     • Visual text-area editor — drag to position, resize the text zone
 *     • Price in ₹, font size range, text colour & alignment
 *
 * ADMIN WORKFLOW:
 *   1. Click "Add Card" → fill in size, price, image URLs.
 *   2. Drag the dashed box on the preview to position the text zone.
 *   3. Toggle eye to show/hide from customers.
 *
 * RECOMMENDED SIZES:
 *   4x6 (most common), 5x7, A5 (148×210mm), Square 4x4
 */

import { useState, useEffect, useRef } from "react";
import {
  Button, Input, Label, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import { Plus, Pencil, Trash2, Save, CreditCard, Loader2, Search, Eye, EyeOff, Upload, X, Sparkles, ChevronDown } from "lucide-react";
import { adminGet, adminPost, adminPatch, adminDelete, adminToast, adminUploadFile } from "@/lib/admin-api";

// ── Reusable image upload field ─────────────────────────────────────────────
// Drop-in replacement for URL inputs on admin forms. Preserves the `value`
// string (so the saved payload is still a URL) but the admin never has to
// paste one — they just pick a local file and we upload to /api/files/upload.
function ImageUploadField({
  label,
  value,
  onChange,
  hint,
  accept = "image/*",
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  accept?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const url = await adminUploadFile(file);
      onChange(url);
      adminToast.success("Uploaded!");
    } catch (err: any) {
      adminToast.error(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className={`mt-0.5 flex items-center gap-2 ${compact ? "" : ""}`}>
        {value ? (
          <div className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border/60 bg-muted/20 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
            </>
          ) : value ? (
            <>
              <Upload className="h-3 w-3" /> Replace
            </>
          ) : (
            <>
              <Upload className="h-3 w-3" /> Choose file
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={pick}
        />
      </div>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground/70">{hint}</p> : null}
    </div>
  );
}

interface ThankYouCard {
  id: string;
  size: string;
  template_label?: string | null;
  template_image?: string | null;
  background_image?: string | null;
  foreground_image?: string | null;
  price: number;
  text_area_x: number;
  text_area_y: number;
  text_area_width: number;
  text_area_height: number;
  max_font_size: number;
  min_font_size: number;
  text_color: string;
  text_align: string;
  is_active: boolean;
  sort_order: number;
}

// ── Drag-and-resize text area visual editor ────────────────────────────────

function TextAreaVisualEditor({
  bgImage, fgImage,
  textAreaX, textAreaY, textAreaWidth, textAreaHeight,
  textColor, textAlign, onChange,
}: {
  bgImage: string; fgImage: string;
  textAreaX: number; textAreaY: number;
  textAreaWidth: number; textAreaHeight: number;
  textColor: string; textAlign: "left" | "center" | "right";
  onChange: (v: { x: number; y: number; w: number; h: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"move" | "resize" | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0, ow: 0, oh: 0 });

  const startDrag = (clientX: number, clientY: number, mode: "move" | "resize") => {
    setDragging(mode);
    dragStart.current = { mx: clientX, my: clientY, ox: textAreaX, oy: textAreaY, ow: textAreaWidth, oh: textAreaHeight };
  };

  useEffect(() => {
    if (!dragging) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const applyMove = (clientX: number, clientY: number) => {
      const dx = ((clientX - dragStart.current.mx) / rect.width) * 100;
      const dy = ((clientY - dragStart.current.my) / rect.height) * 100;
      if (dragging === "move") {
        onChange({
          x: Math.round(Math.max(0, Math.min(100 - dragStart.current.ow, dragStart.current.ox + dx)) * 10) / 10,
          y: Math.round(Math.max(0, Math.min(100 - dragStart.current.oh, dragStart.current.oy + dy)) * 10) / 10,
          w: dragStart.current.ow, h: dragStart.current.oh,
        });
      } else {
        onChange({
          x: dragStart.current.ox, y: dragStart.current.oy,
          w: Math.round(Math.max(10, Math.min(100 - dragStart.current.ox, dragStart.current.ow + dx)) * 10) / 10,
          h: Math.round(Math.max(5, Math.min(100 - dragStart.current.oy, dragStart.current.oh + dy)) * 10) / 10,
        });
      }
    };
    const onMouseMove = (e: MouseEvent) => applyMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); applyMove(e.touches[0].clientX, e.touches[0].clientY); };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[3/4] bg-muted rounded-lg overflow-hidden border-2 border-border select-none touch-none"
      style={{ cursor: dragging === "move" ? "grabbing" : "default" }}
    >
      {bgImage && <img src={bgImage} alt="bg" className="absolute inset-0 w-full h-full object-cover" />}
      {fgImage && <img src={fgImage} alt="fg" className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10" />}
      <div
        className="absolute z-20 border-2 border-dashed rounded cursor-grab active:cursor-grabbing"
        style={{
          left: `${textAreaX}%`, top: `${textAreaY}%`,
          width: `${textAreaWidth}%`, height: `${textAreaHeight}%`,
          borderColor: textColor, backgroundColor: `${textColor}18`,
        }}
        onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY, "move"); }}
        onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY, "move")}
      >
        <span
          className="absolute -top-5 left-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ color: textColor, backgroundColor: `${textColor}20` }}
        >
          Text Area — drag to move
        </span>
        <div
          className="w-full h-full flex items-center justify-center px-1 text-[10px] font-medium overflow-hidden pointer-events-none"
          style={{ color: textColor, textAlign, opacity: 0.7 }}
        >
          Sample text here
        </div>
        {/* Resize handle */}
        <div
          className="absolute -bottom-2 -right-2 w-5 h-5 rounded-sm cursor-se-resize z-30 flex items-center justify-center"
          style={{ backgroundColor: textColor }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, e.clientY, "resize"); }}
          onTouchStart={e => { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY, "resize"); }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M9 1L1 9M9 5L5 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      {!bgImage && !fgImage && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
          Paste a background image URL to preview
        </div>
      )}
    </div>
  );
}

// ── Main tab ─────────────────────────────────────────────────────────────────

const BLANK_CARD = (): Partial<ThankYouCard> => ({
  is_active: true, sort_order: 0, price: 5,
  text_area_x: 10, text_area_y: 60,
  text_area_width: 80, text_area_height: 30,
  max_font_size: 18, min_font_size: 8,
  text_color: "#1A1A2E", text_align: "center",
});

export default function ThankYouCardsTab() {
  const [cards, setCards] = useState<ThankYouCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<Partial<ThankYouCard> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  // ── AI generation state ────────────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ label: string; messages: string[]; imageUrl?: string } | null>(null);
  const [aiExpanded, setAiExpanded] = useState(false);

  const generateAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    const ctx = `Thank-you card template. Size: ${editItem?.size || "4x6"}. Occasion/theme: ${aiPrompt}`;

    // Run text + image generations in parallel so the admin doesn't wait
    // 30 s in sequence. Image uses an explicit thank-you-card art-direction
    // prompt so the model produces a printable greeting-card hero image —
    // light background, no camera/human subject, generous negative space
    // on the bottom half where the customer's text will be overlaid.
    const imagePrompt = [
      `A beautiful thank-you card design for occasion/theme: ${aiPrompt}.`,
      "Soft pastel background, elegant floral or abstract motifs on the top half,",
      "GENEROUS EMPTY SPACE on the BOTTOM HALF for the customer's handwritten message.",
      "No people, no camera, no signature, no pre-written text on the card.",
      "Aspect ratio 4:6 portrait. Print-ready. Minimalist, premium greeting-card aesthetic.",
      "Clean edges, centered composition.",
    ].join(" ");

    const [labelRes, msgRes, imgRes] = await Promise.all([
      adminPost<{ text: string } | null>(
        "/admin/ai/write",
        { prompt: aiPrompt, field: "title", context: ctx },
        null,
      ),
      adminPost<{ text: string } | null>(
        "/admin/ai/write",
        {
          prompt: `Write 3 short warm thank-you card messages for: ${aiPrompt}. Return a JSON array of 3 strings, each under 25 words.`,
          field: "description",
          context: ctx,
        },
        null,
      ),
      adminPost<{ url: string } | null>(
        "/ai/generate-image",
        {
          prompt: imagePrompt,
          size: "1024x1024",
          quality: "hd",
          style: "natural",
        },
        null,
      ).catch(() => null),
    ]);

    let messages: string[] = [];
    try {
      const parsed = JSON.parse((msgRes as { text?: string })?.text ?? "[]");
      messages = Array.isArray(parsed) ? parsed.slice(0, 3).map(String) : [];
    } catch {
      messages = ((msgRes as { text?: string })?.text ?? "").split("\n").filter(Boolean).slice(0, 3);
    }

    // If OpenAI returned a URL, mirror it into our storage so it stays
    // permanent (their signed URLs expire in ~1 hour). If mirroring fails
    // we fall back to the raw URL which is at least usable right now.
    let finalImageUrl: string | undefined;
    const genUrl = (imgRes as { url?: string } | null)?.url;
    if (genUrl) {
      try {
        const mirror = await adminPost<{ url: string } | null>(
          "/files/upload-from-url",
          { url: genUrl, ownerType: "thank-you-card" },
          null,
        );
        finalImageUrl = (mirror as { url?: string } | null)?.url || genUrl;
      } catch {
        finalImageUrl = genUrl;
      }
    }

    setAiResult({
      label: ((labelRes as { text?: string })?.text ?? "").trim(),
      messages,
      imageUrl: finalImageUrl,
    });
    setAiLoading(false);
  };

  const fetchCards = async () => {
    setLoading(true);
    const data = await adminGet<ThankYouCard[]>("/thank-you-cards", []);
    setCards(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchCards(); }, []);

  const handleSave = async () => {
    if (!editItem?.size?.trim()) { adminToast.error("Size is required (e.g. 4x6)"); return; }
    setSaving(true);
    const payload: Partial<ThankYouCard> = {
      size: editItem.size,
      template_label: editItem.template_label || editItem.size,
      template_image: editItem.template_image,
      background_image: editItem.background_image,
      foreground_image: editItem.foreground_image,
      price: editItem.price ?? 5,
      text_area_x: editItem.text_area_x ?? 10,
      text_area_y: editItem.text_area_y ?? 60,
      text_area_width: editItem.text_area_width ?? 80,
      text_area_height: editItem.text_area_height ?? 30,
      max_font_size: editItem.max_font_size ?? 18,
      min_font_size: editItem.min_font_size ?? 8,
      text_color: editItem.text_color ?? "#1A1A2E",
      text_align: editItem.text_align ?? "center",
      is_active: editItem.is_active ?? true,
      sort_order: editItem.sort_order ?? cards.length,
    };
    if (editItem.id) {
      await adminPatch(`/thank-you-cards/${editItem.id}`, payload, null);
      adminToast.success("Card updated!");
    } else {
      await adminPost("/thank-you-cards", payload, null);
      adminToast.success("Card created!");
    }
    setSaving(false);
    setDialogOpen(false);
    setEditItem(null);
    fetchCards();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this card? Customers won't see it at checkout.")) return;
    await adminDelete(`/thank-you-cards/${id}`, null);
    adminToast.success("Deleted!");
    fetchCards();
  };

  const toggleActive = async (c: ThankYouCard) => {
    await adminPatch(`/thank-you-cards/${c.id}`, { is_active: !c.is_active }, null);
    fetchCards();
  };

  const filtered = cards.filter(c =>
    (c.template_label ?? c.size).toLowerCase().includes(search.toLowerCase()) ||
    c.size.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search cards…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-8 bg-muted/30 border-border/30"
          />
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => { setEditItem({ ...BLANK_CARD(), sort_order: cards.length }); setDialogOpen(true); }}
        >
          <Plus className="w-3 h-3" /> Add Card
        </Button>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
        <strong>Thank-You Cards</strong> are shown at checkout. Customers can add a personalised handwritten-style card for a small fee. Upload your card template image and drag the text zone to the correct position.
      </div>

      {/* Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); setEditItem(null); setAiResult(null); setAiPrompt(""); setAiExpanded(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{editItem?.id ? "Edit" : "New"} Thank-You Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {/* Size + price */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Size *</Label>
                <Input
                  value={editItem?.size || ""}
                  onChange={e => setEditItem(p => ({ ...p, size: e.target.value }))}
                  placeholder="e.g. 4x6, 5x7, A5"
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Price (₹)</Label>
                <Input
                  type="number"
                  value={editItem?.price ?? 5}
                  onChange={e => setEditItem(p => ({ ...p, price: parseInt(e.target.value) || 0 }))}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            </div>

            {/* Label */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Display Label</Label>
              <Input
                value={editItem?.template_label || ""}
                onChange={e => setEditItem(p => ({ ...p, template_label: e.target.value }))}
                placeholder="e.g. Classic Thank You 4×6"
                className="h-8 text-xs mt-0.5"
              />
            </div>

            {/* ── AI Generation ──────────────────────────────────────────────── */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
              <button
                type="button"
                onClick={() => setAiExpanded(v => !v)}
                className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-widest text-primary"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Generate with AI
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${aiExpanded ? "rotate-180" : ""}`} />
              </button>
              {aiExpanded && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-1.5">
                    <Input
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && void generateAI()}
                      placeholder="e.g. Birthday, warm and celebratory"
                      className="h-7 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="h-7 px-3 text-[10px] gap-1 shrink-0"
                      onClick={() => void generateAI()}
                      disabled={aiLoading || !aiPrompt.trim()}
                    >
                      {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Generate
                    </Button>
                  </div>
                  {aiResult && (
                    <div className="space-y-2">
                      {aiResult.label && (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 rounded-md bg-card border border-border/40 px-2 py-1.5 text-xs font-medium text-foreground truncate">
                            {aiResult.label}
                          </div>
                          <Button
                            type="button" size="sm" variant="outline"
                            className="h-6 px-2 text-[9px] shrink-0"
                            onClick={() => setEditItem(p => ({ ...p, template_label: aiResult.label }))}
                          >
                            Use as label
                          </Button>
                        </div>
                      )}
                      {aiResult.messages.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Sample messages for customers:</p>
                          {aiResult.messages.map((msg, i) => (
                            <div key={i} className="rounded-md bg-card border border-border/30 px-2 py-1.5 text-[10px] text-muted-foreground italic leading-relaxed">
                              "{msg}"
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Images — direct file upload (no URL pasting) */}
            <ImageUploadField
              label="Template / Preview Image"
              value={editItem?.template_image || ""}
              onChange={(url) => setEditItem((p) => ({ ...p, template_image: url }))}
              hint="Full card front — shown to customers when picking this design."
            />
            <div className="grid grid-cols-2 gap-2">
              <ImageUploadField
                label="Background Layer"
                value={editItem?.background_image || ""}
                onChange={(url) => setEditItem((p) => ({ ...p, background_image: url }))}
                hint="Rendered behind text."
              />
              <ImageUploadField
                label="Foreground Overlay"
                value={editItem?.foreground_image || ""}
                onChange={(url) => setEditItem((p) => ({ ...p, foreground_image: url }))}
                hint="Transparent PNG on top."
              />
            </div>

            {/* Visual text area editor */}
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Text Area — Drag to Move · Corner to Resize
              </Label>
              <div className="mt-2 max-w-[260px] mx-auto">
                <TextAreaVisualEditor
                  bgImage={editItem?.background_image || editItem?.template_image || ""}
                  fgImage={editItem?.foreground_image || ""}
                  textAreaX={editItem?.text_area_x ?? 10}
                  textAreaY={editItem?.text_area_y ?? 60}
                  textAreaWidth={editItem?.text_area_width ?? 80}
                  textAreaHeight={editItem?.text_area_height ?? 30}
                  textColor={editItem?.text_color || "#1A1A2E"}
                  textAlign={(editItem?.text_align || "center") as "left" | "center" | "right"}
                  onChange={({ x, y, w, h }) => setEditItem(p => ({
                    ...p, text_area_x: x, text_area_y: y, text_area_width: w, text_area_height: h,
                  }))}
                />
              </div>
            </div>

            {/* Numeric coords */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { k: "text_area_x", label: "X (%)" },
                { k: "text_area_y", label: "Y (%)" },
                { k: "text_area_width", label: "W (%)" },
                { k: "text_area_height", label: "H (%)" },
              ].map(({ k, label }) => (
                <div key={k}>
                  <Label className="text-[9px] text-muted-foreground">{label}</Label>
                  <Input
                    type="number"
                    value={(editItem as any)?.[k] ?? 0}
                    onChange={e => setEditItem(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }))}
                    className="h-7 text-xs mt-0.5"
                    step="0.5"
                  />
                </div>
              ))}
            </div>

            {/* Font + colour */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Min Font</Label>
                <Input
                  type="number"
                  value={editItem?.min_font_size ?? 8}
                  onChange={e => setEditItem(p => ({ ...p, min_font_size: parseInt(e.target.value) || 8 }))}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Max Font</Label>
                <Input
                  type="number"
                  value={editItem?.max_font_size ?? 18}
                  onChange={e => setEditItem(p => ({ ...p, max_font_size: parseInt(e.target.value) || 18 }))}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Text Color</Label>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="color"
                    value={editItem?.text_color || "#1A1A2E"}
                    onChange={e => setEditItem(p => ({ ...p, text_color: e.target.value }))}
                    className="w-8 h-8 rounded border border-border cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground">{editItem?.text_color || "#1A1A2E"}</span>
                </div>
              </div>
            </div>

            {/* Align + sort + active */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Text Align</Label>
                <Select
                  value={editItem?.text_align || "center"}
                  onValueChange={v => setEditItem(p => ({ ...p, text_align: v }))}
                >
                  <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Sort Order</Label>
                <Input
                  type="number"
                  value={editItem?.sort_order ?? 0}
                  onChange={e => setEditItem(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Switch
                  checked={editItem?.is_active ?? true}
                  onCheckedChange={v => setEditItem(p => ({ ...p, is_active: v }))}
                  className="scale-90"
                />
                <span className="text-[11px] text-muted-foreground">
                  {editItem?.is_active ? "Active" : "Hidden"}
                </span>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs gap-1">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save Card
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cards grid */}
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <CreditCard className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-3">
            {search ? "No cards match your search" : "No thank-you card templates yet"}
          </p>
          {!search && (
            <Button
              variant="outline" size="sm" className="gap-1 text-xs"
              onClick={() => { setEditItem({ ...BLANK_CARD(), sort_order: 0 }); setDialogOpen(true); }}
            >
              <Plus className="w-3 h-3" /> Create First Card
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {filtered.map(c => (
            <div
              key={c.id}
              className={`bg-card rounded-xl border border-border/40 overflow-hidden transition-opacity ${!c.is_active ? "opacity-50" : ""}`}
            >
              <div className="aspect-[3/4] bg-muted/30 flex items-center justify-center">
                {c.template_image ? (
                  <img src={c.template_image} alt={c.template_label || c.size} className="w-full h-full object-cover" />
                ) : (
                  <CreditCard className="w-8 h-8 text-muted-foreground/20" />
                )}
              </div>
              <div className="p-2.5">
                <p className="font-medium text-xs truncate">{c.template_label || c.size}</p>
                <p className="text-[10px] text-muted-foreground">₹{c.price} · {c.size}</p>
                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={() => toggleActive(c)}
                    className={`p-1 rounded-md transition-colors ${c.is_active ? "text-green-600 bg-green-500/10" : "text-muted-foreground bg-muted/50"}`}
                  >
                    {c.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  <div className="flex gap-0.5">
                    <button
                      className="p-1.5 rounded-lg hover:bg-muted"
                      onClick={() => { setEditItem(c); setDialogOpen(true); }}
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <button
                      className="p-1.5 rounded-lg hover:bg-destructive/10"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive/60" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

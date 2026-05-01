"use client";

/**
 * DesignTemplatesTab — Template Studio for designers.
 *
 * TWO VIEWS:
 *  1. Library  — searchable grid of all saved templates (thumbnail cards).
 *  2. Studio   — full visual canvas editor (Fabric.js via CanvasEditor) for
 *               creating / editing a template. Auto-generates thumbnail on save.
 *
 * SIZE PRESETS (metadata only — canvas is always square internally):
 *   Square 1:1 · Thank-You Card · Portrait 2:3 · Landscape 3:2 · Phone Case
 *
 * SAVE FLOW:
 *   Designer clicks Save → canvasJSON + previewDataUrl captured from CanvasEditor
 *   → thumbnail set to previewDataUrl (base64) → POST/PATCH /api/design-templates
 */

import { useState, useEffect, useRef } from "react";
import {
  Plus, Pencil, Trash2, Save, LayoutTemplate, Loader2, Search,
  Eye, EyeOff, Sparkles, ArrowLeft, CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  Button, Input, Label, Switch,
} from "@gifteeng/ui";
import { CanvasEditor } from "@gifteeng/ui";
import type { CanvasEditorChange } from "@gifteeng/ui";
import { adminGet, adminPost, adminPatch, adminDelete, adminFetch } from "@/lib/admin-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DesignTemplate {
  id: string;
  label: string;
  category?: string | null;
  thumbnail?: string | null;
  is_active: boolean;
  sort_order: number;
  canvas_json?: unknown;
  created_at?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STUDIO_PRODUCT = { id: "template-studio", title: "Template Studio" };

const CATEGORIES = [
  "Birthday", "Anniversary", "Thank You", "Wedding", "Baby",
  "Festival", "Corporate", "Love", "Graduation", "Get Well", "Other",
];

const SIZE_PRESETS = [
  { key: "square",    label: "Square 1:1",       desc: "Mugs, coasters, frames",  icon: "⬜", w: 400, h: 400, dpi: "300 DPI · 4×4 in" },
  { key: "card",      label: "Thank-You Card",    desc: "4×6 greeting cards",      icon: "📇", w: 600, h: 400, dpi: "300 DPI · 6×4 in" },
  { key: "portrait",  label: "Portrait 2:3",      desc: "Photo prints, posters",   icon: "🖼️", w: 400, h: 600, dpi: "300 DPI · 4×6 in" },
  { key: "landscape", label: "Landscape 3:2",     desc: "Banners, panoramic",      icon: "🌅", w: 600, h: 400, dpi: "300 DPI · 6×4 in" },
  { key: "phone",     label: "Phone Case",        desc: "Slim / tough cases",      icon: "📱", w: 360, h: 720, dpi: "300 DPI · 3.2×6.4 in" },
];

const CATEGORY_COLORS: Record<string, string> = {
  Birthday: "bg-pink-100 text-pink-700", Anniversary: "bg-amber-100 text-amber-700",
  "Thank You": "bg-orange-100 text-orange-700", Wedding: "bg-stone-100 text-stone-700",
  Baby: "bg-emerald-100 text-emerald-700", Festival: "bg-yellow-100 text-yellow-800",
  Corporate: "bg-blue-100 text-blue-700", Love: "bg-red-100 text-red-700",
  Graduation: "bg-purple-100 text-purple-700", "Get Well": "bg-green-100 text-green-700",
};
function catBadge(cat?: string | null) {
  if (!cat) return "bg-muted text-muted-foreground";
  return CATEGORY_COLORS[cat] ?? "bg-muted text-muted-foreground";
}

// ── Dimension input ────────────────────────────────────────────────────────
// Number input that allows free typing (including clearing the field and
// typing larger numbers) and only clamps to [64, 2000] on blur or Enter.
// Previous version clamped on every keystroke so typing "800" was impossible
// because "8" got clamped to 64 immediately.
function DimensionInput({
  value, onCommit, className, title,
}: {
  value: number;
  onCommit: (v: number) => void;
  className?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  // Keep draft in sync when the upstream value changes (e.g. preset swap)
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n)) { setDraft(String(value)); return; }
    const clamped = Math.max(64, Math.min(2000, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); }
        if (e.key === "Escape") { setDraft(String(value)); (e.currentTarget as HTMLInputElement).blur(); }
      }}
      className={
        className ??
        "w-14 h-5 px-1 rounded border border-border/50 bg-background text-center font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40"
      }
      title={title}
    />
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, kind }: { msg: string; kind: "ok" | "err" }) {
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200
      ${kind === "ok" ? "bg-green-600" : "bg-destructive"}`}>
      {kind === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DesignTemplatesTab() {
  // Library state
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [seeding,   setSeeding]   = useState(false);
  const [search,    setSearch]    = useState("");

  // Studio state
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioItem, setStudioItem] = useState<Partial<DesignTemplate> & { size_preset?: string } | null>(null);
  // Photoshop-style "New Document" modal shown before entering the studio
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const canvasChangeRef = useRef<CanvasEditorChange | null>(null);

  // Toast
  const [toastState, setToastState] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const showToast = (msg: string, kind: "ok" | "err" = "ok") => {
    setToastState({ msg, kind });
    setTimeout(() => setToastState(null), 3000);
  };

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchTemplates = async () => {
    setLoading(true);
    const data = await adminGet<DesignTemplate[]>("/design-templates", []);
    setTemplates(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  // ── Seed presets ─────────────────────────────────────────────────────────────

  const handleSeedPresets = async () => {
    if (!confirm("Add up to 10 starter templates? Skips any that already exist.")) return;
    setSeeding(true);
    const res = await adminPost<{ created: number }>("/design-templates/seed-presets", {}, { created: 0 });
    showToast(`✓ Added ${res.created} starter template${res.created !== 1 ? "s" : ""}${res.created === 0 ? " (all already exist)" : ""}`);
    setSeeding(false);
    fetchTemplates();
  };

  // ── Open studio ──────────────────────────────────────────────────────────────

  // Open the Photoshop-style "New Document" modal first; actual studio opens
  // when the user confirms a size preset.
  const openNew = () => {
    setNewModalOpen(true);
  };
  // Called from the modal once the user picks a preset (or Custom W×H).
  const startNewFromPreset = (preset: typeof SIZE_PRESETS[number] | { key: "custom"; w: number; h: number; [k: string]: unknown }) => {
    canvasChangeRef.current = null;
    const base: any = {
      is_active: true,
      sort_order: templates.length,
      label: "",
      category: "",
      size_preset: preset.key,
    };
    if (preset.key === "custom") {
      base.custom_w = (preset as any).w;
      base.custom_h = (preset as any).h;
    }
    setStudioItem(base);
    setNewModalOpen(false);
    setStudioOpen(true);
  };
  // "Duplicate an existing template" path
  const startNewFromTemplate = (t: DesignTemplate) => {
    canvasChangeRef.current = null;
    const cj = t.canvas_json as Record<string, unknown> | null | undefined;
    const preset = (cj?.__preset as string) ?? "square";
    setStudioItem({
      is_active: true,
      sort_order: templates.length,
      label: `${t.label} (copy)`,
      category: t.category ?? "",
      size_preset: preset,
      canvas_json: t.canvas_json,
    });
    setNewModalOpen(false);
    setStudioOpen(true);
  };

  const openEdit = (t: DesignTemplate) => {
    canvasChangeRef.current = null;
    // Extract size_preset from canvas_json if stored there
    const cj = t.canvas_json as Record<string, unknown> | null | undefined;
    const preset = (cj?.__preset as string) ?? "square";
    setStudioItem({ ...t, size_preset: preset });
    setStudioOpen(true);
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!studioItem?.label?.trim()) { showToast("Template name is required", "err"); return; }
    setSaving(true);

    // Build canvas_json: include __preset metadata so it survives round-trips
    let canvasJson: unknown = studioItem.canvas_json ?? {};
    if (canvasChangeRef.current) {
      try {
        const parsed = JSON.parse(canvasChangeRef.current.canvasJSON) as Record<string, unknown>;
        parsed.__preset = studioItem.size_preset ?? "square";
        canvasJson = parsed;
      } catch {
        canvasJson = studioItem.canvas_json ?? {};
      }
    } else if (typeof canvasJson === "object" && canvasJson !== null) {
      (canvasJson as Record<string, unknown>).__preset = studioItem.size_preset ?? "square";
    }

    const payload = {
      label:      studioItem.label.trim(),
      category:   studioItem.category || null,
      thumbnail:  canvasChangeRef.current?.previewDataUrl || studioItem.thumbnail || null,
      canvas_json: canvasJson,
      is_active:  studioItem.is_active ?? true,
      sort_order: studioItem.sort_order ?? templates.length,
    };

    // Use adminFetch so we surface the ACTUAL server error instead of the
    // opaque "Save failed — check permissions" toast. Most common causes:
    //   401 → b2b token missing/expired (re-login at /b2b/login)
    //   403 → caller not super_admin
    //   5xx → Prisma constraint / missing required field
    let ok = false;
    try {
      if (studioItem.id) {
        await adminFetch<{ id?: string }>(`/design-templates/${studioItem.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await adminFetch<{ id?: string }>("/design-templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      ok = true;
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "";
      // Trim noisy HTML bodies to the first useful line
      const short = msg.replace(/<[^>]+>/g, "").split(/\n/)[0]!.trim().slice(0, 140);
      setSaving(false);
      if (/401/.test(msg)) {
        showToast("Session expired — please sign in again at /b2b/login", "err");
      } else if (/403/.test(msg)) {
        showToast("Your account isn't super_admin — cannot save templates", "err");
      } else if (short) {
        showToast(`Save failed: ${short}`, "err");
      } else {
        showToast("Save failed — check network/permissions", "err");
      }
      return;
    }

    setSaving(false);
    if (!ok) { showToast("Save failed — check permissions", "err"); return; }
    showToast("✓ Template saved!");
    setStudioOpen(false);
    setStudioItem(null);
    // Clear any Library search so the newly-saved template is guaranteed
    // to be visible when the list refreshes (otherwise an old search term
    // could hide it, making the template look "lost").
    setSearch("");
    fetchTemplates();
  };

  // ── Delete / toggle ──────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await adminDelete(`/design-templates/${id}`, null);
    showToast("Deleted");
    fetchTemplates();
  };

  const toggleActive = async (t: DesignTemplate) => {
    await adminPatch(`/design-templates/${t.id}`, { is_active: !t.is_active }, null);
    fetchTemplates();
  };

  const filtered = templates.filter(t =>
    t.label.toLowerCase().includes(search.toLowerCase()) ||
    (t.category ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const initialCanvasJSON = studioItem?.canvas_json
    ? typeof studioItem.canvas_json === "string"
      ? studioItem.canvas_json
      : JSON.stringify(studioItem.canvas_json)
    : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDIO VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (studioOpen && studioItem !== null) {
    return (
      <div className="flex flex-col h-[calc(100vh-120px)] min-h-[600px]">
        {toastState && <Toast msg={toastState.msg} kind={toastState.kind} />}

        {/* ── Studio top bar ────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-card shrink-0 flex-wrap">
          {/* Back */}
          <button
            type="button"
            onClick={() => { setStudioOpen(false); setStudioItem(null); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Library
          </button>

          <div className="w-px h-5 bg-border/60 shrink-0" />

          {/* Template name — auto-focused so the admin knows what's needed
              for Save to enable. Red ring when empty so it's obvious. */}
          <input
            autoFocus
            type="text"
            value={studioItem.label ?? ""}
            onChange={e => setStudioItem(s => ({ ...s!, label: e.target.value }))}
            placeholder="Template name (required)…"
            className={`flex-1 min-w-[160px] max-w-xs h-8 rounded-lg border bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 transition-colors ${
              (studioItem.label ?? "").trim()
                ? "border-border/60 focus:ring-primary/30"
                : "border-amber-400/70 focus:ring-amber-400/40"
            }`}
          />

          {/* Category picker */}
          <select
            value={studioItem.category ?? ""}
            onChange={e => setStudioItem(s => ({ ...s!, category: e.target.value || null }))}
            className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 shrink-0"
          >
            <option value="">Category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Size preset */}
          <select
            value={studioItem.size_preset ?? "square"}
            onChange={e => {
              const v = e.target.value;
              if (v === "custom") {
                setStudioItem(s => ({ ...s!, size_preset: "custom", ...((s as any)?.custom_w ? {} : { custom_w: 800, custom_h: 500 }) } as any));
              } else {
                setStudioItem(s => ({ ...s!, size_preset: v }));
              }
            }}
            className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 shrink-0"
          >
            {SIZE_PRESETS.map(p => (
              <option key={p.key} value={p.key}>{p.icon} {p.label}</option>
            ))}
            <option value="custom">✏️ Custom</option>
          </select>

          {/* Active toggle */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Switch
              checked={studioItem.is_active ?? true}
              onCheckedChange={v => setStudioItem(s => ({ ...s!, is_active: v }))}
              className="scale-75"
            />
            <span className="text-[11px] text-muted-foreground">{studioItem.is_active ? "Active" : "Hidden"}</span>
          </div>

          {/* Save */}
          <Button
            size="sm"
            disabled={saving || !studioItem.label?.trim()}
            onClick={handleSave}
            title={!studioItem.label?.trim() ? "Enter a template name to save" : saving ? "Saving…" : "Save template"}
            className="gap-1.5 h-8 px-4 shrink-0 ml-auto"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : !studioItem.label?.trim() ? "Name required" : "Save Template"}
          </Button>
        </div>

        {/* ── Size preset info bar (Photoshop-style status strip) ─────── */}
        {studioItem.size_preset && (() => {
          const presetKey = studioItem.size_preset ?? "square";
          const custom = presetKey === "custom";
          const cw = custom ? ((studioItem as any).custom_w ?? 400) : (SIZE_PRESETS.find(p => p.key === presetKey)?.w ?? 400);
          const ch = custom ? ((studioItem as any).custom_h ?? 400) : (SIZE_PRESETS.find(p => p.key === presetKey)?.h ?? 400);
          const label = custom ? "Custom" : (SIZE_PRESETS.find(p => p.key === presetKey)?.label ?? "Square 1:1");
          const desc  = custom ? "Custom dimensions" : (SIZE_PRESETS.find(p => p.key === presetKey)?.desc ?? "");
          return (
            <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border/40 text-[11px] shrink-0 bg-muted/30 font-mono">
              <span
                className="inline-block border border-primary/70 rounded"
                style={{
                  width: cw / ch >= 1 ? 16 : Math.round(16 * (cw / ch)),
                  height: cw / ch >= 1 ? Math.round(16 / (cw / ch)) : 16,
                  background: "linear-gradient(135deg,rgba(236,72,153,0.18),rgba(168,85,247,0.1))",
                }}
              />
              <span className="font-bold text-foreground">{label}</span>
              <span className="text-muted-foreground">·</span>

              {/* Editable W × H pair — clamps on blur so you can freely
                  erase/retype numbers while mid-edit. */}
              <DimensionInput
                value={cw}
                onCommit={(v) => setStudioItem(s => ({ ...s!, size_preset: "custom", ...( { custom_w: v, custom_h: ch } as any) }))}
                title="Canvas width (px)"
              />
              <span className="text-muted-foreground">×</span>
              <DimensionInput
                value={ch}
                onCommit={(v) => setStudioItem(s => ({ ...s!, size_preset: "custom", ...( { custom_w: cw, custom_h: v } as any) }))}
                title="Canvas height (px)"
              />
              {desc && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{desc}</span>
                </>
              )}
              <span className="ml-auto text-muted-foreground/60 font-sans text-[10px]">
                Print {cw}×{ch} px · Aspect {(cw / ch).toFixed(2)}:1 · {cw > ch ? "landscape" : cw < ch ? "portrait" : "square"}
              </span>
            </div>
          );
        })()}

        {/* ── Canvas editor (fills remaining height) ──────────────────── */}
        <div className="flex-1 overflow-hidden bg-muted/20">
          {(() => {
            // Resolve the chosen preset to real canvas pixel dimensions so the
            // editor actually shows a Portrait / Phone / Custom rectangle at
            // the correct shape instead of a locked 400×400 square.
            const presetKey = studioItem.size_preset ?? "square";
            let cw: number | undefined;
            let ch: number | undefined;
            if (presetKey === "custom") {
              cw = (studioItem as any).custom_w ?? 400;
              ch = (studioItem as any).custom_h ?? 400;
            } else {
              const p = SIZE_PRESETS.find((x) => x.key === presetKey);
              if (p) { cw = p.w; ch = p.h; }
            }
            return (
              <CanvasEditor
                key={`${studioItem.id ?? "new"}-${cw}x${ch}`}
                product={STUDIO_PRODUCT}
                initialCanvasJSON={initialCanvasJSON}
                onChange={(change) => { canvasChangeRef.current = change; }}
                className="h-full"
                mode="full"
                canvasWidth={cw}
                canvasHeight={ch}
              />
            );
          })()}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIBRARY VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {toastState && <Toast msg={toastState.msg} kind={toastState.kind} />}

      {newModalOpen && (
        <NewTemplateModal
          recent={templates.slice(0, 6)}
          onClose={() => setNewModalOpen(false)}
          onPickPreset={startNewFromPreset}
          onUseTemplate={startNewFromTemplate}
        />
      )}

      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-8 bg-muted/30 border-border/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleSeedPresets} disabled={seeding}>
            {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Load 10 Starters
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openNew}>
            <Plus className="w-3 h-3" /> New Template
          </Button>
        </div>
      </div>

      {/* ── Size preset legend ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {SIZE_PRESETS.map(p => (
          <span key={p.key} className="inline-flex items-center gap-1 text-[10px] bg-muted/60 rounded-full px-2 py-0.5 text-muted-foreground">
            {p.icon} <span className="font-medium">{p.label}</span> <span className="opacity-60">— {p.desc}</span>
          </span>
        ))}
      </div>

      {/* ── Template grid ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <LayoutTemplate className="w-10 h-10 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-3">
            {search ? "No templates match your search" : "No templates yet"}
          </p>
          {!search && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleSeedPresets} disabled={seeding}>
                {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Load 10 Starters
              </Button>
              <Button size="sm" className="gap-1 text-xs" onClick={openNew}>
                <Plus className="w-3 h-3" /> New Template
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {filtered.map(t => {
            const cj = t.canvas_json as Record<string, unknown> | null | undefined;
            const preset = SIZE_PRESETS.find(p => p.key === (cj?.__preset as string));
            return (
              <div
                key={t.id}
                className={`group bg-card rounded-xl border border-border/40 overflow-hidden transition-all hover:shadow-md hover:border-primary/20 ${!t.is_active ? "opacity-55" : ""}`}
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-muted/30 flex items-center justify-center relative overflow-hidden">
                  {t.thumbnail ? (
                    <img src={t.thumbnail} alt={t.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-primary/5 to-primary/10">
                      <LayoutTemplate className="w-8 h-8 text-primary/30" />
                      <span className="text-[9px] text-primary/40 font-medium">{t.category || "Template"}</span>
                    </div>
                  )}
                  {/* Hidden overlay */}
                  {!t.is_active && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <span className="text-[9px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Hidden</span>
                    </div>
                  )}
                  {/* Edit overlay on hover */}
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(t)}
                      className="flex items-center gap-1.5 bg-white text-foreground rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg hover:bg-primary hover:text-white transition-colors"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  </div>
                  {/* Size badge */}
                  {preset && (
                    <div className="absolute bottom-1.5 left-1.5 bg-background/90 text-[9px] font-medium rounded px-1.5 py-0.5 text-foreground/70">
                      {preset.icon} {preset.label}
                    </div>
                  )}
                </div>

                {/* Card footer */}
                <div className="p-2.5">
                  <p className="font-semibold text-xs truncate">{t.label}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    {t.category ? (
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${catBadge(t.category)}`}>
                        {t.category}
                      </span>
                    ) : <span />}
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => toggleActive(t)}
                        title={t.is_active ? "Hide" : "Show"}
                        className={`p-1 rounded-md transition-colors ${t.is_active ? "text-green-600 hover:bg-green-500/10" : "text-muted-foreground hover:bg-muted/50"}`}
                      >
                        {t.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                      <button
                        className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NewTemplateModal — Photoshop "New Document"-style size picker
// Shown when the admin clicks "New Template". Lets them pick a size preset
// (with visual aspect-ratio preview) or duplicate an existing template,
// before the studio opens.
// ═══════════════════════════════════════════════════════════════════════════
function NewTemplateModal({
  recent, onClose, onPickPreset, onUseTemplate,
}: {
  recent: DesignTemplate[];
  onClose: () => void;
  onPickPreset: (preset: (typeof SIZE_PRESETS)[number] | { key: "custom"; label: "Custom"; desc: string; icon: "✏️"; w: number; h: number; dpi: string }) => void;
  onUseTemplate: (t: DesignTemplate) => void;
}) {
  const [tab, setTab] = useState<"preset" | "recent">("preset");
  const [selectedKey, setSelectedKey] = useState<string>("square");
  const [customW, setCustomW] = useState(500);
  const [customH, setCustomH] = useState(500);

  const selected = selectedKey === "custom"
    ? { key: "custom" as const, label: "Custom", desc: "Custom dimensions", icon: "✏️", w: customW, h: customH, dpi: `${customW} × ${customH} px` }
    : SIZE_PRESETS.find((p) => p.key === selectedKey)!;

  const previewMax = 120;
  const ratio = selected.w / selected.h;
  const previewW = ratio >= 1 ? previewMax : Math.round(previewMax * ratio);
  const previewH = ratio >= 1 ? Math.round(previewMax / ratio) : previewMax;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-[#2b2b2f] flex flex-col"
        style={{ background: "#1f1f23" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-md hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors z-10"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header bar (dark Photoshop-style) */}
        <div className="px-5 py-3 border-b border-[#2b2b2f] flex items-center gap-3" style={{ background: "#18181b" }}>
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-white font-black"
            style={{ background: "linear-gradient(135deg,#ec4899,#a855f7)" }}
          >
            ✦
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Gifteeng Template Studio</p>
            <h2 className="text-white font-bold text-base leading-none mt-0.5">New Template</h2>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-[#333]">
            <button
              onClick={() => setTab("preset")}
              className={"px-3 h-8 text-xs font-semibold transition-colors " + (tab === "preset" ? "bg-[#3b3b40] text-white" : "text-white/50 hover:text-white/80")}
            >
              Size preset
            </button>
            <button
              onClick={() => setTab("recent")}
              className={"px-3 h-8 text-xs font-semibold transition-colors " + (tab === "recent" ? "bg-[#3b3b40] text-white" : "text-white/50 hover:text-white/80")}
            >
              From template ({recent.length})
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "preset" ? (
            <div className="grid md:grid-cols-[1fr_260px] gap-0">
              {/* Preset grid */}
              <div className="p-5 border-r border-[#2b2b2f]">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-3">Pick a canvas size</p>
                <div className="grid grid-cols-2 gap-2">
                  {SIZE_PRESETS.map((p) => {
                    const r = p.w / p.h;
                    const aW = r >= 1 ? 52 : Math.round(52 * r);
                    const aH = r >= 1 ? Math.round(52 / r) : 52;
                    const active = selectedKey === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setSelectedKey(p.key)}
                        className={"group flex items-center gap-3 rounded-xl border p-3 text-left transition-all " + (active ? "border-pink-500 bg-pink-500/10" : "border-[#2b2b2f] bg-[#25252a] hover:border-[#444]")}
                      >
                        <div className="relative w-[60px] h-[60px] flex items-center justify-center shrink-0">
                          <div
                            className="border-2 rounded"
                            style={{
                              width: aW, height: aH,
                              borderColor: active ? "#ec4899" : "#5b5b63",
                              background: active ? "rgba(236,72,153,0.15)" : "rgba(255,255,255,0.03)",
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white leading-tight">{p.label}</p>
                          <p className="text-[11px] text-white/50 mt-0.5">{p.desc}</p>
                          <p className="text-[10px] text-white/30 mt-0.5 font-mono">
                            {p.w} × {p.h}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  {/* Custom size card */}
                  {(() => {
                    const active = selectedKey === "custom";
                    const r = customW / customH;
                    const aW = r >= 1 ? 52 : Math.round(52 * r);
                    const aH = r >= 1 ? Math.round(52 / r) : 52;
                    return (
                      <div
                        onClick={() => setSelectedKey("custom")}
                        className={"group flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all col-span-2 " + (active ? "border-pink-500 bg-pink-500/10" : "border-dashed border-[#333] bg-[#25252a] hover:border-[#555]")}
                      >
                        <div className="relative w-[60px] h-[60px] flex items-center justify-center shrink-0">
                          <div
                            className="border-2 border-dashed rounded"
                            style={{
                              width: aW, height: aH,
                              borderColor: active ? "#ec4899" : "#5b5b63",
                              background: active ? "rgba(236,72,153,0.15)" : "rgba(255,255,255,0.03)",
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white leading-tight">Custom</p>
                          <p className="text-[11px] text-white/50 mt-0.5">Set your own pixel dimensions</p>
                          <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                            <DimensionInput
                              value={customW}
                              onCommit={(v) => { setSelectedKey("custom"); setCustomW(v); }}
                              className="w-16 h-6 rounded bg-[#18181b] border border-[#3a3a40] text-white text-[11px] font-mono text-center focus:outline-none focus:border-pink-500"
                            />
                            <span className="text-white/40 text-xs">×</span>
                            <DimensionInput
                              value={customH}
                              onCommit={(v) => { setSelectedKey("custom"); setCustomH(v); }}
                              className="w-16 h-6 rounded bg-[#18181b] border border-[#3a3a40] text-white text-[11px] font-mono text-center focus:outline-none focus:border-pink-500"
                            />
                            <span className="text-white/40 text-[10px]">px</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Info panel */}
              <div className="p-5" style={{ background: "#19191c" }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-3">Preview</p>
                <div className="flex items-center justify-center py-6 rounded-xl border border-[#2b2b2f] bg-[#0f0f12] mb-4">
                  <div
                    className="border-2 border-pink-500/60 rounded shadow-lg"
                    style={{
                      width: previewW, height: previewH,
                      background: "linear-gradient(135deg,rgba(236,72,153,0.15),rgba(168,85,247,0.1))",
                    }}
                  />
                </div>
                <dl className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between"><dt className="text-white/40">Label</dt><dd className="text-white font-mono">{selected.label}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/40">Dimensions</dt><dd className="text-white font-mono">{selected.w} × {selected.h}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/40">Print size</dt><dd className="text-white/80 font-mono text-[10px]">{selected.dpi}</dd></div>
                  <div className="flex justify-between"><dt className="text-white/40">Best for</dt><dd className="text-white/80 text-right">{selected.desc}</dd></div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40 mb-3">Duplicate an existing template</p>
              {recent.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[#333] p-8 text-center text-white/40 text-sm">
                  No templates yet — use the preset tab to create your first one.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {recent.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onUseTemplate(t)}
                      className="group rounded-xl border border-[#2b2b2f] bg-[#25252a] p-2 hover:border-[#444] text-left transition-colors"
                    >
                      <div className="aspect-square rounded-md bg-[#0f0f12] overflow-hidden mb-2 flex items-center justify-center">
                        {t.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.thumbnail} alt={t.label} className="w-full h-full object-cover" />
                        ) : (
                          <LayoutTemplate className="w-6 h-6 text-white/30" />
                        )}
                      </div>
                      <p className="text-xs font-bold text-white truncate">{t.label}</p>
                      {t.category && <p className="text-[10px] text-white/40 truncate mt-0.5">{t.category}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2b2b2f] flex items-center justify-between gap-3" style={{ background: "#18181b" }}>
          <p className="text-[11px] text-white/40">
            Canvas is always 400×400 internally — the preset is saved as print metadata.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 h-8 text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 rounded transition-colors"
            >
              Cancel
            </button>
            {tab === "preset" && (
              <button
                onClick={() => onPickPreset(selected)}
                className="px-5 h-9 rounded-lg text-sm font-black text-white shadow-lg"
                style={{ background: "linear-gradient(135deg,#ec4899,#a855f7)" }}
              >
                Create →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

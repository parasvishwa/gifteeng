"use client";

/**
 * Homepage page-builder — Shopify-style drag & edit (Deploy 100–101).
 *
 * Loads the unified `homepage_config` JSON from settings, offers 18 section
 * types, supports drag-reorder, duplicate, delete, visibility toggles, and
 * inline editors per section type.
 *
 * All state lives in a single `config` object; Save PATCHes the whole blob
 * back to /api/admin/settings/homepage_config.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Save, Plus, Trash2, Loader2, Copy, GripVertical, Eye, EyeOff,
  ChevronDown, ChevronRight, Smartphone, Monitor, AlertCircle,
} from "lucide-react";
import type {
  HomepageConfig, HomepageSection, SectionType, AnnouncementMessage,
  HeroSlide, ProductRowSource,
} from "@gifteeng/shared";
import { authHeaders } from "@/lib/admin-api";

// ─── API helpers ──────────────────────────────────────────────────────────
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${BASE}/api${path}`, { headers: authHeaders() });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch { return fallback; }
}

async function safePatch<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${BASE}/api${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch { return fallback; }
}

async function safePost<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${BASE}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch { return fallback; }
}

async function safeDelete(path: string): Promise<void> {
  try {
    await fetch(`${BASE}/api${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch { /* best-effort */ }
}

/** Sync hero slides from the homepage config into /admin/announcements
 *  so the mobile app can read them from the public /announcements?placement=hero
 *  endpoint. Matches by `externalId` (= slide.id) to upsert; removes stale ones. */
async function syncHeroAnnouncements(slides: HeroSlide[]): Promise<void> {
  type AnnRow = { id: string; externalId?: string };
  type AnnList = AnnRow[] | { items?: AnnRow[] };
  const existing = await safeGet<AnnList>("/admin/announcements?placement=hero&pageSize=50", []);
  const existingList: AnnRow[] = Array.isArray(existing)
    ? existing
    : ((existing as { items?: AnnRow[] }).items ?? []);

  const existingMap = new Map(existingList.map((a) => [a.externalId ?? "", a.id]));
  const seenSlideIds = new Set<string>();

  for (const slide of slides) {
    if (!slide.id) continue;
    seenSlideIds.add(slide.id);

    const body = {
      title:       slide.title       ?? "Hero Banner",
      subtitle:    slide.subtitle    ?? "",
      bannerImage: slide.imageUrl    ?? "",
      gradient:    [slide.bgColor1   ?? "#1A1A2E", slide.bgColor2 ?? "#16213E"],
      accentColor: slide.accentColor ?? "#EF3752",
      ctaText:     slide.ctaText     ?? "Shop Now",
      link:        slide.ctaLink     ?? "/shop",
      placement:   "hero",
      active:      true,
      externalId:  slide.id,
    };

    const existingId = existingMap.get(slide.id);
    if (existingId) {
      await safePatch(`/admin/announcements/${existingId}`, body, null);
    } else {
      await safePost(`/admin/announcements`, body, null);
    }
  }

  // Delete announcements whose slides have been removed from the config
  for (const [extId, annId] of existingMap.entries()) {
    if (extId && !seenSlideIds.has(extId)) {
      await safeDelete(`/admin/announcements/${annId}`);
    }
  }
}

function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Section registry — what shows up in the "Add Section" menu ────────
type AddOption = {
  label: string;
  icon: string;
  type: SectionType;
  // pre-fill the section.config with these values (useful for product-row
  // which has 5 sub-options — best-selling / new-arrivals / featured /
  // category / collection — each is a different config preset).
  presetConfig?: Record<string, unknown>;
  presetTitle?: string;
};

const ADD_OPTIONS: AddOption[] = [
  { type: "announcement-bar", icon: "📢", label: "Announcement Bar" },
  { type: "hero",             icon: "🖼️", label: "Hero Banner / Carousel" },
  { type: "product-row",      icon: "🔥", label: "Best-Selling Products",   presetTitle: "Best Sellers",     presetConfig: { source: "best-selling", limit: 12, pinnedProductIds: [], appendAuto: true } },
  { type: "product-row",      icon: "✨", label: "New Arrivals",            presetTitle: "New Arrivals",     presetConfig: { source: "new-arrivals", limit: 12, pinnedProductIds: [], appendAuto: true } },
  { type: "product-row",      icon: "⭐", label: "Featured (Hand-Picked)",   presetTitle: "Featured",         presetConfig: { source: "featured",     limit: 12, pinnedProductIds: [], appendAuto: false } },
  { type: "product-row",      icon: "🏷️", label: "By Category",             presetTitle: "Shop by Category", presetConfig: { source: "category",     limit: 12, pinnedProductIds: [], appendAuto: true, categoryName: "" } },
  { type: "product-row",      icon: "📚", label: "By Collection",           presetTitle: "From a Collection", presetConfig: { source: "collection",  limit: 12, pinnedProductIds: [], appendAuto: true, collectionSlug: "" } },
  { type: "shop-by-category", icon: "🛍️", label: "Shop by Category",        presetTitle: "Shop by Category",  presetConfig: { tiles: [], layout: "grid" } },
  { type: "gamification-widget", icon: "🎮", label: "Gamification Widget",    presetConfig: { variant: "full" } },
  { type: "how-it-works",     icon: "🧭", label: "How It Works",            presetTitle: "How it works",     presetConfig: { steps: [] } },
  { type: "design-with-ai",   icon: "🤖", label: "Design with AI",          presetConfig: { headline: "Design your gift with AI", ctaText: "Try AI design", ctaLink: "/ai-design" } },
  { type: "smart-reminders",  icon: "⏰", label: "Smart Reminders",         presetConfig: { headline: "Never miss a special date" } },
  { type: "gifteeng-difference", icon: "💎", label: "The Gifteeng Difference", presetTitle: "Why Gifteeng",   presetConfig: { points: [] } },
  { type: "return-gifts",     icon: "🎁", label: "Return Gifts",            presetTitle: "Return Gifts",     presetConfig: { } },
  { type: "testimonials",     icon: "💬", label: "Testimonials",            presetTitle: "Loved by customers", presetConfig: { limit: 10 } },
  { type: "app-coming-soon",  icon: "📱", label: "App Coming Soon",         presetConfig: { headline: "Our app is coming soon" } },
  { type: "make-someone-happy", icon: "❤️", label: "Make Someone Happy",     presetConfig: { headline: "Make someone happy today", ctaText: "Start gifting", ctaLink: "/products" } },
  { type: "features-grid",    icon: "🛡️", label: "Features / Trust Grid",   presetConfig: { items: [] } },
  { type: "spin-wheel",       icon: "🎡", label: "Spin Wheel Teaser",       presetConfig: { } },
  { type: "custom-html",      icon: "</>", label: "Custom HTML Block",       presetConfig: { html: "", css: "" } },
];

// ─── Migrate pre-Deploy-100 config from legacy keys ──────────────────────
type LegacyHeroSlide = { id?: string; imageUrl?: string; title?: string; subtitle?: string; ctaText?: string; ctaLink?: string; active?: boolean; order?: number };
type LegacyHomeSection = { id?: string; type?: string; title?: string; subtitle?: string; collectionSlug?: string; categoryName?: string; active?: boolean; order?: number };

// The legacy admin stored these keys as JSON-stringified arrays (not parsed
// objects). Prisma returns whatever was saved — so `value` can be either a
// string or an already-parsed array/object. Normalize both shapes here.
function normalizeLegacyArray<T>(value: unknown): T[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch { return []; }
  }
  if (Array.isArray(value)) return value as T[];
  return [];
}

function migrateLegacy(
  legacyHero: LegacyHeroSlide[],
  legacySections: LegacyHomeSection[],
): HomepageConfig {
  const sections: HomepageSection[] = [];
  let order = 0;

  // ── 1) Announcement bar (marquee at the top) ──
  sections.push({
    id: genId("sec"), type: "announcement-bar", active: true, order: order++,
    visibility: { mobile: true, desktop: true },
    config: {
      messages: [
        { id: "m1", icon: "🎉", text: "Free shipping on orders above ₹499" },
        { id: "m2", icon: "✨", text: "Use code WELCOME10 for 10% off your first order" },
        { id: "m3", icon: "📦", text: "7-day easy returns" },
        { id: "m4", icon: "⭐", text: "1L+ happy customers across India" },
      ],
    },
  });

  // ── 2) Hero — legacy or seeded defaults so first-time admins see slides ──
  const heroSlides = legacyHero.length
    ? legacyHero.map((s, i) => ({
        id: s.id ?? `slide-${i}`,
        imageUrl: s.imageUrl ?? "",
        title: s.title, subtitle: s.subtitle,
        ctaText: s.ctaText, ctaLink: s.ctaLink,
      }))
    : [
        { id: "seed-h1", imageUrl: "https://images.unsplash.com/photo-1513201099705-a9746072f418?w=1200&q=80",
          title: "Gifts That Speak From The Heart", subtitle: "Personalised photo frames, mugs & more — starting ₹99",
          ctaText: "Shop Now", ctaLink: "/products" },
        { id: "seed-h2", imageUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=1200&q=80",
          title: "Design Your Gift with AI ✨", subtitle: "Describe the occasion — AI creates the perfect personalised message",
          ctaText: "Try AI Design", ctaLink: "/ai-design" },
      ];
  sections.push({
    id: genId("sec"), type: "hero", active: true, order: order++,
    visibility: { mobile: true, desktop: true },
    config: { slides: heroSlides },
  });

  // ── 3) Legacy product sections → product-row. If none, seed defaults. ──
  if (legacySections.length) {
    for (const s of legacySections) {
      let src: ProductRowSource = "new-arrivals";
      const t = s.type ?? "";
      if (t === "best-selling") src = "best-selling";
      else if (t === "new-arrivals") src = "new-arrivals";
      else if (t === "featured") src = "featured";
      else if (t === "collection-row") src = "collection";
      else if (t === "category-row" || t === "business-needs" || t === "kids-zone") src = "category";
      const categoryName = t === "business-needs" ? "Business & Office"
        : t === "kids-zone" ? "Kids Zone"
        : s.categoryName;
      sections.push({
        id: s.id ?? genId("sec"), type: "product-row",
        title: s.title, subtitle: s.subtitle,
        active: s.active ?? true,
        order: order++,
        visibility: { mobile: true, desktop: true },
        config: {
          source: src, limit: 12, pinnedProductIds: [], appendAuto: true,
          categoryName, collectionSlug: s.collectionSlug,
        },
      });
    }
  } else {
    // Seed the current hardcoded homepage shape so first-time admins get the
    // existing layout as a starting point — not a blank canvas.
    sections.push(
      { id: genId("sec"), type: "shop-by-category", title: "Shop by Category", subtitle: "Find the perfect gift by occasion", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { layout: "grid", tiles: [
          { id: "tl1", categoryName: "Personalized Gifts",  label: "Personalized",   emoji: "🎁" },
          { id: "tl2", categoryName: "Home Decor",          label: "Home Decor",     emoji: "🏡" },
          { id: "tl3", categoryName: "Stationeries",        label: "Stationery",     emoji: "📝" },
          { id: "tl4", categoryName: "Kids Zone",           label: "Kids",           emoji: "🧸" },
          { id: "tl5", categoryName: "Business & Office",   label: "Office & Corp.", emoji: "💼" },
          { id: "tl6", categoryName: "Return Gifts",        label: "Return Gifts",   emoji: "🎀" },
        ] } },
      { id: genId("sec"), type: "product-row", title: "Best Sellers", subtitle: "Our most-loved gifts", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { source: "best-selling", limit: 12, pinnedProductIds: [], appendAuto: true } },
      { id: genId("sec"), type: "product-row", title: "New Arrivals", subtitle: "Fresh from our collection", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { source: "new-arrivals", limit: 12, pinnedProductIds: [], appendAuto: true } },
      { id: genId("sec"), type: "gamification-widget", title: "Earn Goins", active: true, order: order++, visibility: { mobile: true, desktop: true }, config: { variant: "full" } },
      { id: genId("sec"), type: "how-it-works", title: "How it works", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { steps: [
          { id: "s1", icon: "🎨", title: "Pick a gift", description: "Browse personalised gifts & pick the one you love" },
          { id: "s2", icon: "✨", title: "Customise it", description: "Add a photo, name or message" },
          { id: "s3", icon: "📦", title: "We deliver", description: "Across India, on time, gift-wrapped" },
        ] } },
      { id: genId("sec"), type: "design-with-ai", title: "Design with AI", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { headline: "Design your gift with AI", subheadline: "Describe the occasion — our AI writes the perfect message.", ctaText: "Try AI design", ctaLink: "/ai-design" } },
      { id: genId("sec"), type: "gifteeng-difference", title: "Why Gifteeng", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { points: [
          { id: "d1", icon: "🎁", title: "Personalised, not generic", description: "Every gift is designed around the person receiving it" },
          { id: "d2", icon: "⚡", title: "Fast pan-India delivery", description: "Dispatched within 24 hours — arrives in 3-5 days" },
          { id: "d3", icon: "💯", title: "Quality you can trust", description: "1L+ happy customers and a 4.8★ average rating" },
        ] } },
      { id: genId("sec"), type: "return-gifts", title: "Return Gifts", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { categoryName: "Return Gifts" } },
      { id: genId("sec"), type: "testimonials", title: "Loved by customers", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { limit: 10 } },
      { id: genId("sec"), type: "smart-reminders", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { headline: "Never miss a special date" } },
      { id: genId("sec"), type: "make-someone-happy", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { headline: "Make someone happy today", subheadline: "A small gift can change a day.", ctaText: "Start gifting", ctaLink: "/products" } },
      { id: genId("sec"), type: "app-coming-soon", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { headline: "Our app is coming soon", subheadline: "Order, design & track — all from your phone." } },
      { id: genId("sec"), type: "features-grid", title: "Shop with confidence", active: true, order: order++, visibility: { mobile: true, desktop: true },
        config: { items: [
          { id: "f1", icon: "🚚", label: "Free shipping", description: "On orders above ₹499" },
          { id: "f2", icon: "🔒", label: "Secure payments", description: "UPI · Cards · COD" },
          { id: "f3", icon: "📦", label: "Easy returns", description: "7-day no-questions" },
          { id: "f4", icon: "⭐", label: "1L+ happy customers", description: "Across India" },
        ] } },
    );
  }
  return { version: 1, sections, updatedAt: new Date().toISOString() };
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function HomepageBuilderPage() {
  const [config, setConfig] = useState<HomepageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [dirty, setDirty]     = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [collections, setCollections] = useState<Array<{ slug: string; name: string }>>([]);

  // Load config + supporting lookups
  useEffect(() => {
    (async () => {
      setLoading(true);
      // Prefer the new unified config, else migrate legacy
      const row = await safeGet<{ value?: unknown } | null>("/admin/settings/homepage_config", null);
      const heroRow = await safeGet<{ value?: unknown } | null>("/admin/settings/homepage_hero_slides", null);
      const secRow = await safeGet<{ value?: unknown } | null>("/admin/settings/homepage_sections", null);

      // Existing unified config wins. Note: the API may also double-wrap
      // `value` as a JSON string (because the legacy admin saved it that
      // way). Parse if needed.
      let cfg: HomepageConfig | null = null;
      const v = row?.value;
      const parsedNew = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
      if (parsedNew && typeof parsedNew === "object" && Array.isArray((parsedNew as HomepageConfig).sections)) {
        cfg = parsedNew as HomepageConfig;
      }
      if (!cfg) {
        // Migrate from legacy keys (string-wrapped arrays).
        const legacyHero = normalizeLegacyArray<LegacyHeroSlide>(heroRow?.value);
        const legacySections = normalizeLegacyArray<LegacyHomeSection>(secRow?.value);
        cfg = migrateLegacy(legacyHero, legacySections);
      }
      setConfig(cfg);
      setLoading(false);

      // Supporting lookups for product-row editor
      // Unified source: /api/categories returns Category[] from the DB.
      // Filter by isActive + map to names so the UI gets a simple string list.
      const cats = await safeGet<Array<{ name: string; isActive?: boolean }>>("/categories?pageSize=500", []);
      setCategories(Array.isArray(cats) ? cats.filter((c) => c.isActive !== false).map((c) => c.name) : []);
      const colls = await safeGet<Array<{ slug: string; name: string }>>("/collections", []);
      setCollections(Array.isArray(colls) ? colls : []);
    })();
  }, []);

  const markDirty = () => { setDirty(true); setSaveMsg(null); };

  const updateConfig = (mut: (c: HomepageConfig) => HomepageConfig) => {
    setConfig((c) => c ? mut(structuredClone(c)) : c);
    markDirty();
  };

  const updateSection = (id: string, patch: Partial<HomepageSection>) => {
    updateConfig((c) => ({
      ...c,
      sections: c.sections.map((s) => s.id === id ? { ...s, ...patch } : s),
    }));
  };

  const updateSectionConfig = (id: string, cfgPatch: Record<string, unknown>) => {
    updateConfig((c) => ({
      ...c,
      sections: c.sections.map((s) => s.id === id ? { ...s, config: { ...s.config, ...cfgPatch } } : s),
    }));
  };

  const addSection = (opt: AddOption) => {
    const id = genId("sec");
    updateConfig((c) => ({
      ...c,
      sections: [
        ...c.sections,
        {
          id, type: opt.type,
          title: opt.presetTitle,
          active: true,
          order: c.sections.length,
          visibility: { mobile: true, desktop: true },
          config: { ...(opt.presetConfig ?? {}) },
        },
      ],
    }));
    setExpandedId(id);
    setShowAddMenu(false);
  };

  const duplicateSection = (id: string) => {
    updateConfig((c) => {
      const idx = c.sections.findIndex((s) => s.id === id);
      if (idx < 0) return c;
      const src = c.sections[idx];
      const copy: HomepageSection = {
        ...structuredClone(src),
        id: genId("sec"),
        title: src.title ? `${src.title} (copy)` : undefined,
        order: idx + 1,
      };
      const next = [...c.sections];
      next.splice(idx + 1, 0, copy);
      return { ...c, sections: next.map((s, i) => ({ ...s, order: i })) };
    });
  };

  const removeSection = (id: string) => {
    if (!confirm("Delete this section?")) return;
    updateConfig((c) => ({
      ...c,
      sections: c.sections.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })),
    }));
  };

  const moveSection = (fromId: string, toIdx: number) => {
    updateConfig((c) => {
      const fromIdx = c.sections.findIndex((s) => s.id === fromId);
      if (fromIdx < 0 || fromIdx === toIdx) return c;
      const next = [...c.sections];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, moved);
      return { ...c, sections: next.map((s, i) => ({ ...s, order: i })) };
    });
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setErr(null); setSaveMsg(null);
    const payload = { ...config, updatedAt: new Date().toISOString() };
    const res = await safePatch<{ key?: string } | null>(
      "/admin/settings/homepage_config",
      { value: payload },
      null,
    );
    if (!res) {
      setSaving(false);
      setErr("Save failed. Try again.");
      return;
    }

    // Sync hero slides → /admin/announcements so mobile picks them up from
    // the public /announcements?placement=hero endpoint automatically.
    const heroSection = payload.sections.find((s) => s.type === "hero");
    if (heroSection) {
      const slides = (heroSection.config.slides as HeroSlide[] | undefined) ?? [];
      await syncHeroAnnouncements(slides);
    }

    setSaving(false);
    setConfig(payload);
    setDirty(false);
    setSaveMsg("Saved ✓");
    setTimeout(() => setSaveMsg(null), 3000);
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sections = [...config.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 sticky top-0 z-20 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black">Homepage Builder</h1>
          <p className="text-xs text-muted-foreground">
            Drag to reorder · click to edit · {sections.length} section{sections.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* Preview live opens the CUSTOMER site (not this admin host).
            admin.gifteeng.com/ → admin portal login. We force an absolute URL
            to the public storefront via env, falling back to the known prod
            host. `noreferrer` so admin auth cookies don't leak. */}
        <a
          href={(typeof window !== "undefined"
            ? (process.env.NEXT_PUBLIC_SITE_URL
                || window.location.origin.replace(/^https?:\/\/(admin|new-business|business)\./, "https://new."))
            : "https://new.gifteeng.com")}
          target="_blank" rel="noreferrer noopener"
          className="hidden md:inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
        >
          Preview live →
        </a>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold text-white transition-all ${
            !dirty ? "bg-primary/40 cursor-not-allowed"
              : saving ? "bg-primary/70"
              : "bg-primary hover:opacity-90 shadow-md shadow-primary/30"
          }`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : dirty ? "Save changes" : "All saved"}
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" /> {err}
        </div>
      )}
      {saveMsg && (
        <div className="rounded-md border border-emerald-300/40 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {saveMsg}
        </div>
      )}

      {/* Sections list */}
      <div className="space-y-2">
        {sections.map((sec, idx) => (
          <SectionCard
            key={sec.id}
            sec={sec}
            expanded={expandedId === sec.id}
            onToggleExpand={() => setExpandedId((cur) => cur === sec.id ? null : sec.id)}
            onUpdate={(patch) => updateSection(sec.id, patch)}
            onUpdateConfig={(patch) => updateSectionConfig(sec.id, patch)}
            onDuplicate={() => duplicateSection(sec.id)}
            onRemove={() => removeSection(sec.id)}
            onDragStart={() => setDragId(sec.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => { if (dragId && dragId !== sec.id) { e.preventDefault(); } }}
            onDrop={() => { if (dragId) moveSection(dragId, idx); }}
            isDragging={dragId === sec.id}
            categories={categories}
            collections={collections}
          />
        ))}
        {sections.length === 0 && (
          <div className="rounded-xl border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
            No sections yet — add your first one below.
          </div>
        )}
      </div>

      {/* Add section button + menu */}
      <div className="relative">
        <button
          onClick={() => setShowAddMenu((v) => !v)}
          className="w-full rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 py-3 text-sm font-bold text-primary inline-flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Section
        </button>
        {showAddMenu && (
          <div className="absolute left-0 right-0 mt-2 z-30 rounded-xl border bg-card shadow-2xl p-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {ADD_OPTIONS.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => addSection(opt)}
                  className="flex items-center gap-3 rounded-md border border-border/40 bg-background hover:bg-muted px-3 py-2 text-left text-sm"
                >
                  <span className="text-xl">{opt.icon}</span>
                  <span className="font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddMenu(false)}
              className="mt-2 w-full rounded-md text-xs text-muted-foreground hover:bg-muted py-1"
            >Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Individual section card ─────────────────────────────────────────────

function SectionCard(props: {
  sec: HomepageSection;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (p: Partial<HomepageSection>) => void;
  onUpdateConfig: (p: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
  categories: string[];
  collections: Array<{ slug: string; name: string }>;
}) {
  const { sec, expanded, onToggleExpand, onUpdate, onUpdateConfig,
    onDuplicate, onRemove, onDragStart, onDragEnd, onDragOver, onDrop, isDragging,
    categories, collections } = props;
  const option = ADD_OPTIONS.find((o) => o.type === sec.type && (!o.presetConfig?.source || o.presetConfig.source === (sec.config.source ?? "")));
  const icon = option?.icon ?? "⬜";
  const typeLabel = option?.label ?? sec.type;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`rounded-xl border bg-card transition-shadow ${
        isDragging ? "opacity-40 scale-[0.99]" : "hover:shadow-md"
      }`}
    >
      {/* Row header */}
      <div className="flex items-center gap-2 px-2 py-2">
        <span className="cursor-grab active:cursor-grabbing text-muted-foreground/60 px-1" title="Drag to reorder">
          <GripVertical className="w-4 h-4" />
        </span>
        <span className="text-xl" aria-hidden>{icon}</span>
        <button onClick={onToggleExpand} className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold truncate">
            {sec.title || typeLabel}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">{typeLabel}</p>
        </button>
        {/* visibility toggles */}
        <button
          onClick={() => onUpdate({ visibility: { ...sec.visibility, mobile: !sec.visibility.mobile } })}
          className={`hidden sm:inline-flex p-1.5 rounded-md ${sec.visibility.mobile ? "text-primary" : "text-muted-foreground/40 line-through"}`}
          title={`Mobile: ${sec.visibility.mobile ? "visible" : "hidden"}`}
        ><Smartphone className="w-4 h-4" /></button>
        <button
          onClick={() => onUpdate({ visibility: { ...sec.visibility, desktop: !sec.visibility.desktop } })}
          className={`hidden sm:inline-flex p-1.5 rounded-md ${sec.visibility.desktop ? "text-primary" : "text-muted-foreground/40 line-through"}`}
          title={`Desktop: ${sec.visibility.desktop ? "visible" : "hidden"}`}
        ><Monitor className="w-4 h-4" /></button>
        <button
          onClick={() => onUpdate({ active: !sec.active })}
          className={`p-1.5 rounded-md ${sec.active ? "text-emerald-600" : "text-muted-foreground/40"}`}
          title={sec.active ? "Active" : "Hidden"}
        >{sec.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}</button>
        <button onClick={onDuplicate} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted" title="Duplicate">
          <Copy className="w-4 h-4" />
        </button>
        <button onClick={onRemove} className="p-1.5 rounded-md text-destructive hover:bg-destructive/10" title="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
        <button onClick={onToggleExpand} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-3">
          {/* Common: title + subtitle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <LabeledInput
              label="Section title"
              value={sec.title ?? ""}
              onChange={(v) => onUpdate({ title: v })}
            />
            <LabeledInput
              label="Subtitle"
              value={sec.subtitle ?? ""}
              onChange={(v) => onUpdate({ subtitle: v })}
            />
          </div>

          {/* Per-type editor */}
          <SectionEditor
            sec={sec}
            onUpdateConfig={onUpdateConfig}
            categories={categories}
            collections={collections}
          />
        </div>
      )}
    </div>
  );
}

// ─── Generic labeled input ───────────────────────────────────────────────
function LabeledInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
      />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange, placeholder, rows = 4 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono"
      />
    </label>
  );
}

// ─── Per-type editors ────────────────────────────────────────────────────
function SectionEditor({ sec, onUpdateConfig, categories, collections }: {
  sec: HomepageSection;
  onUpdateConfig: (p: Record<string, unknown>) => void;
  categories: string[];
  collections: Array<{ slug: string; name: string }>;
}) {
  const cfg = sec.config as Record<string, unknown>;

  switch (sec.type) {
    case "announcement-bar":
      return <AnnouncementEditor cfg={cfg} onUpdateConfig={onUpdateConfig} />;
    case "hero":
      return <HeroEditor cfg={cfg} onUpdateConfig={onUpdateConfig} />;
    case "product-row":
      return <ProductRowEditor cfg={cfg} onUpdateConfig={onUpdateConfig} categories={categories} collections={collections} />;
    case "shop-by-category":
      return <ShopByCategoryEditor cfg={cfg} onUpdateConfig={onUpdateConfig} categories={categories} />;
    case "custom-html":
      return <CustomHtmlEditor cfg={cfg} onUpdateConfig={onUpdateConfig} />;
    case "how-it-works":
      return <ListEditor cfg={cfg} listKey="steps" itemLabel="Step" fields={[
        { key: "icon",  label: "Icon (emoji)" },
        { key: "title", label: "Title" },
        { key: "description", label: "Description" },
      ]} onUpdateConfig={onUpdateConfig} />;
    case "features-grid":
      return <ListEditor cfg={cfg} listKey="items" itemLabel="Feature" fields={[
        { key: "icon",  label: "Icon (emoji)" },
        { key: "label", label: "Label" },
        { key: "description", label: "Description" },
      ]} onUpdateConfig={onUpdateConfig} />;
    case "gifteeng-difference":
      return <ListEditor cfg={cfg} listKey="points" itemLabel="Difference point" fields={[
        { key: "icon",  label: "Icon" },
        { key: "title", label: "Title" },
        { key: "description", label: "Description" },
      ]} onUpdateConfig={onUpdateConfig} />;
    case "design-with-ai":
    case "make-someone-happy":
      return <CtaBlockEditor cfg={cfg} onUpdateConfig={onUpdateConfig} withImage />;
    case "smart-reminders":
      return <LabeledInput label="Headline" value={(cfg.headline as string) ?? ""} onChange={(v) => onUpdateConfig({ headline: v })} />;
    case "return-gifts":
      return (
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="Section title" value={(cfg.title as string) ?? ""} onChange={(v) => onUpdateConfig({ title: v })} />
          <CategoryPicker value={(cfg.categoryName as string) ?? ""} onChange={(v) => onUpdateConfig({ categoryName: v })} categories={categories} label="Category filter (optional)" />
        </div>
      );
    case "testimonials":
      return (
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="Section title" value={(cfg.title as string) ?? ""} onChange={(v) => onUpdateConfig({ title: v })} />
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Number to show</span>
            <input type="number" min={1} max={40} value={Number(cfg.limit ?? 10)}
              onChange={(e) => onUpdateConfig({ limit: Number(e.target.value) || 10 })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
            />
          </label>
        </div>
      );
    case "app-coming-soon":
      return (
        <div className="space-y-2">
          <LabeledInput label="Headline" value={(cfg.headline as string) ?? ""} onChange={(v) => onUpdateConfig({ headline: v })} />
          <LabeledInput label="Subheadline" value={(cfg.subheadline as string) ?? ""} onChange={(v) => onUpdateConfig({ subheadline: v })} />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput label="App Store link" value={(cfg.appStoreLink as string) ?? ""} onChange={(v) => onUpdateConfig({ appStoreLink: v })} />
            <LabeledInput label="Play Store link" value={(cfg.playStoreLink as string) ?? ""} onChange={(v) => onUpdateConfig({ playStoreLink: v })} />
          </div>
          <LabeledInput label="Image URL (phone mockup)" value={(cfg.imageUrl as string) ?? ""} onChange={(v) => onUpdateConfig({ imageUrl: v })} />
        </div>
      );
    case "gamification-widget":
      return (
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variant</span>
          <select value={(cfg.variant as string) ?? "full"} onChange={(e) => onUpdateConfig({ variant: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm">
            <option value="full">Full (Goins + Spin + Scratch)</option>
            <option value="spin-only">Spin only</option>
            <option value="scratch-only">Scratch only</option>
          </select>
        </label>
      );
    case "spin-wheel":
      return (
        <LabeledInput label="Headline (optional)" value={(cfg.headline as string) ?? ""} onChange={(v) => onUpdateConfig({ headline: v })} />
      );
    default:
      return <p className="text-xs text-muted-foreground italic">No extra settings for this block.</p>;
  }
}

// ─── Announcement bar editor ─────────────────────────────────────────────
function AnnouncementEditor({ cfg, onUpdateConfig }: { cfg: Record<string, unknown>; onUpdateConfig: (p: Record<string, unknown>) => void }) {
  const messages = (cfg.messages as AnnouncementMessage[] | undefined) ?? [];
  const update = (next: AnnouncementMessage[]) => onUpdateConfig({ messages: next });
  return (
    <div className="space-y-2">
      {messages.map((m, i) => (
        <div key={m.id} className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
          <input
            value={m.icon ?? ""} onChange={(e) => { const n = [...messages]; n[i] = { ...m, icon: e.target.value }; update(n); }}
            className="w-14 rounded border px-2 py-1 text-sm text-center" placeholder="🎉"
          />
          <input
            value={m.text} onChange={(e) => { const n = [...messages]; n[i] = { ...m, text: e.target.value }; update(n); }}
            className="flex-1 rounded border px-2 py-1 text-sm" placeholder="Announcement text"
          />
          <input
            value={m.link ?? ""} onChange={(e) => { const n = [...messages]; n[i] = { ...m, link: e.target.value }; update(n); }}
            className="w-32 rounded border px-2 py-1 text-xs" placeholder="/link (optional)"
          />
          <button onClick={() => update(messages.filter((x) => x.id !== m.id))} className="p-1 text-destructive hover:bg-destructive/10 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={() => update([...messages, { id: genId("msg"), icon: "✨", text: "" }])}
        className="w-full rounded-md border-2 border-dashed py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
      >+ Add message</button>
    </div>
  );
}

// ─── Hero editor ─────────────────────────────────────────────────────────
//
// Each slide supports: image (URL or upload), title, subtitle,
// CTA text/link, accent color, and a two-stop background gradient.
// Changes are saved as part of the homepage_config AND synced to
// /admin/announcements with placement=hero so the mobile app can
// read them from the public /announcements endpoint.
function HeroEditor({ cfg, onUpdateConfig }: { cfg: Record<string, unknown>; onUpdateConfig: (p: Record<string, unknown>) => void }) {
  const slides = (cfg.slides as HeroSlide[] | undefined) ?? [];
  const update = (next: HeroSlide[]) => onUpdateConfig({ slides: next });
  const [uploading, setUploading] = useState<string | null>(null); // slide id being uploaded

  const handleUpload = async (slideId: string, file: File) => {
    setUploading(slideId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("ownerType", "banner");
      const r = await fetch(`${BASE}/api/files/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (r.ok) {
        const data = await r.json() as { url?: string; signedUrl?: string; path?: string };
        const imageUrl = data.url ?? data.signedUrl ?? (data.path ? `${BASE}/${data.path}` : "");
        const idx = slides.findIndex((s) => s.id === slideId);
        if (idx >= 0) {
          const n = [...slides];
          n[idx] = { ...n[idx], imageUrl };
          update(n);
        }
      }
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground bg-muted/60 rounded-md px-3 py-2">
        🖼️ <strong>Hero banners</strong> — changes here are saved to the homepage config <em>and</em> pushed
        to the mobile app automatically when you save. Upload an image or set gradient colors for
        each slide.
      </p>
      {slides.map((s, i) => (
        <div key={s.id} className="rounded-md border bg-background p-3 space-y-2">
          {/* Image row */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imageUrl} alt="" className="h-20 w-32 object-cover rounded-md border" />
              ) : (
                <div className="h-20 w-32 rounded-md border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              {/* Image URL + upload */}
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Background image</span>
                <div className="flex gap-2 mt-1">
                  <input
                    value={s.imageUrl ?? ""}
                    onChange={(e) => { const n = [...slides]; n[i] = { ...s, imageUrl: e.target.value }; update(n); }}
                    placeholder="https://… or upload below"
                    className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                  />
                  <label className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                    uploading === s.id ? "opacity-50 pointer-events-none" : "hover:bg-muted"
                  }`}>
                    {uploading === s.id ? "Uploading…" : "⬆ Upload"}
                    <input
                      type="file" accept="image/*" className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(s.id, f); e.target.value = ""; }}
                    />
                  </label>
                </div>
              </label>

              {/* Title / subtitle */}
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="Title" value={s.title ?? ""}
                  onChange={(v) => { const n = [...slides]; n[i] = { ...s, title: v }; update(n); }} />
                <LabeledInput label="Subtitle" value={s.subtitle ?? ""}
                  onChange={(v) => { const n = [...slides]; n[i] = { ...s, subtitle: v }; update(n); }} />
              </div>

              {/* CTA */}
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="CTA text (e.g. Shop Now)" value={s.ctaText ?? ""}
                  onChange={(v) => { const n = [...slides]; n[i] = { ...s, ctaText: v }; update(n); }}
                  placeholder="Shop Now" />
                <LabeledInput label="CTA link" value={s.ctaLink ?? ""}
                  onChange={(v) => { const n = [...slides]; n[i] = { ...s, ctaLink: v }; update(n); }}
                  placeholder="/shop" />
              </div>

              {/* Colors — only used when no background image is set */}
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Accent color</span>
                  <div className="flex gap-1.5 mt-1 items-center">
                    <input type="color"
                      value={s.accentColor || "#EF3752"}
                      onChange={(e) => { const n = [...slides]; n[i] = { ...s, accentColor: e.target.value }; update(n); }}
                      className="h-8 w-10 rounded border cursor-pointer p-0.5"
                    />
                    <input type="text"
                      value={s.accentColor || "#EF3752"}
                      onChange={(e) => { const n = [...slides]; n[i] = { ...s, accentColor: e.target.value }; update(n); }}
                      className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
                      placeholder="#EF3752"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">BG from (gradient)</span>
                  <div className="flex gap-1.5 mt-1 items-center">
                    <input type="color"
                      value={s.bgColor1 || "#1A1A2E"}
                      onChange={(e) => { const n = [...slides]; n[i] = { ...s, bgColor1: e.target.value }; update(n); }}
                      className="h-8 w-10 rounded border cursor-pointer p-0.5"
                    />
                    <input type="text"
                      value={s.bgColor1 || "#1A1A2E"}
                      onChange={(e) => { const n = [...slides]; n[i] = { ...s, bgColor1: e.target.value }; update(n); }}
                      className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">BG to (gradient)</span>
                  <div className="flex gap-1.5 mt-1 items-center">
                    <input type="color"
                      value={s.bgColor2 || "#16213E"}
                      onChange={(e) => { const n = [...slides]; n[i] = { ...s, bgColor2: e.target.value }; update(n); }}
                      className="h-8 w-10 rounded border cursor-pointer p-0.5"
                    />
                    <input type="text"
                      value={s.bgColor2 || "#16213E"}
                      onChange={(e) => { const n = [...slides]; n[i] = { ...s, bgColor2: e.target.value }; update(n); }}
                      className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs font-mono"
                    />
                  </div>
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground">
                💡 Background image takes priority over gradient. Leave image blank to use gradient colors.
              </p>
            </div>
            <button onClick={() => update(slides.filter((x) => x.id !== s.id))} className="p-1.5 text-destructive hover:bg-destructive/10 rounded flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => update([...slides, { id: genId("slide"), imageUrl: "", active: true, order: slides.length }])}
        className="w-full rounded-md border-2 border-dashed py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
      >+ Add slide</button>
    </div>
  );
}

// ─── Product-row editor (the big one) ────────────────────────────────────
function ProductRowEditor({ cfg, onUpdateConfig, categories, collections }: {
  cfg: Record<string, unknown>;
  onUpdateConfig: (p: Record<string, unknown>) => void;
  categories: string[];
  collections: Array<{ slug: string; name: string }>;
}) {
  const source = (cfg.source as ProductRowSource) ?? "best-selling";
  const limit = Number(cfg.limit ?? 12);
  const pinnedIds = (cfg.pinnedProductIds as string[] | undefined) ?? [];
  const appendAuto = cfg.appendAuto !== false;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Source</span>
          <select value={source} onChange={(e) => onUpdateConfig({ source: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm">
            <option value="best-selling">Best-Selling</option>
            <option value="new-arrivals">New Arrivals</option>
            <option value="featured">Featured (hand-pick only)</option>
            <option value="category">By Category</option>
            <option value="collection">By Collection</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Max products</span>
          <input type="number" min={1} max={40} value={limit}
            onChange={(e) => onUpdateConfig({ limit: Number(e.target.value) || 12 })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 mt-5">
          <input type="checkbox" checked={appendAuto}
            onChange={(e) => onUpdateConfig({ appendAuto: e.target.checked })}
            disabled={source === "featured"}
          />
          <span className="text-xs">Auto-fill remaining slots</span>
        </label>
      </div>

      {source === "category" && (
        <CategoryPicker value={(cfg.categoryName as string) ?? ""} onChange={(v) => onUpdateConfig({ categoryName: v })} categories={categories} label="Category" />
      )}
      {source === "collection" && (
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Collection</span>
          <select value={(cfg.collectionSlug as string) ?? ""} onChange={(e) => onUpdateConfig({ collectionSlug: e.target.value })}
            className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm">
            <option value="">Select collection…</option>
            {collections.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
      )}

      {/* Pinned products */}
      <div className="rounded-md border bg-muted/30 p-2 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Pinned products {pinnedIds.length > 0 && <span>· {pinnedIds.length}</span>}
          </p>
          <button onClick={() => setPickerOpen(true)} className="text-xs font-semibold text-primary hover:underline">+ Add product</button>
        </div>
        {pinnedIds.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            {source === "featured" ? "Add at least one product — Featured is hand-pick only." : "Optional: pin specific products to force position. Auto-fill picks the rest."}
          </p>
        ) : (
          <div className="space-y-1">
            {pinnedIds.map((id, i) => (
              <PinnedProductRow
                key={id}
                id={id}
                position={i + 1}
                onMoveUp={i === 0 ? undefined : () => { const n = [...pinnedIds]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onUpdateConfig({ pinnedProductIds: n }); }}
                onMoveDown={i === pinnedIds.length - 1 ? undefined : () => { const n = [...pinnedIds]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; onUpdateConfig({ pinnedProductIds: n }); }}
                onRemove={() => onUpdateConfig({ pinnedProductIds: pinnedIds.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <ProductPicker
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            if (pinnedIds.includes(id)) return;
            onUpdateConfig({ pinnedProductIds: [...pinnedIds, id] });
          }}
        />
      )}
    </div>
  );
}

function PinnedProductRow({ id, position, onMoveUp, onMoveDown, onRemove }: {
  id: string; position: number;
  onMoveUp?: () => void; onMoveDown?: () => void; onRemove: () => void;
}) {
  const [product, setProduct] = useState<{ title?: string; image?: string; slug?: string } | null>(null);
  useEffect(() => {
    safeGet<{ title?: string; images?: unknown; imageUrl?: string; slug?: string }>(
      `/products/${id}`, { }
    ).then((p) => {
      let img = p.imageUrl ?? "";
      if (!img && Array.isArray(p.images) && p.images.length) {
        const first = p.images[0];
        img = typeof first === "string" ? first : (first as { url?: string })?.url ?? "";
      }
      setProduct({ title: p.title, image: img, slug: p.slug });
    });
  }, [id]);
  return (
    <div className="flex items-center gap-2 rounded border bg-background px-2 py-1.5">
      <span className="text-[10px] font-bold text-muted-foreground w-5">#{position}</span>
      {product?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image} alt="" className="h-8 w-8 object-cover rounded" />
      )}
      <span className="flex-1 text-sm truncate">{product?.title ?? id}</span>
      {onMoveUp && <button onClick={onMoveUp} className="text-xs text-muted-foreground hover:text-foreground px-1">↑</button>}
      {onMoveDown && <button onClick={onMoveDown} className="text-xs text-muted-foreground hover:text-foreground px-1">↓</button>}
      <button onClick={onRemove} className="text-destructive p-1 hover:bg-destructive/10 rounded">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Product picker ──────────────────────────────────────────────────────
function ProductPicker({ onClose, onPick }: {
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Array<{ id: string; title?: string; imageUrl?: string; images?: unknown }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = setTimeout(async () => {
      setLoading(true);
      // Use the admin list so drafts show up too (the public endpoint filters
      // b2cEnabled=true and would hide un-published products from the picker).
      // Empty query returns the most recent 30 products so admins can just
      // browse without typing.
      const params = new URLSearchParams();
      params.set("pageSize", "30");
      if (q.trim()) params.set("search", q.trim());
      const res = await safeGet<{ items?: unknown[] } | unknown[]>(
        `/products/admin/list?${params.toString()}`, {}
      );
      const list = Array.isArray(res) ? res : ((res as { items?: unknown[] }).items ?? []);
      setItems(list as typeof items);
      setLoading(false);
    }, 180);
    return () => clearTimeout(h);
  }, [q]);

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-xl shadow-2xl flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-b">
          <input autoFocus placeholder="Search products by title…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm bg-background"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && <p className="text-xs text-muted-foreground px-2 py-2">Loading…</p>}
          {!loading && items.length === 0 && <p className="text-xs text-muted-foreground px-2 py-2">No products match.</p>}
          {items.map((p) => {
            let img = p.imageUrl ?? "";
            if (!img && Array.isArray(p.images) && p.images.length) {
              const first = p.images[0];
              img = typeof first === "string" ? first : (first as { url?: string })?.url ?? "";
            }
            return (
              <button key={p.id}
                onClick={() => { onPick(p.id); onClose(); }}
                className="w-full flex items-center gap-3 rounded-md border bg-background hover:bg-muted px-2 py-1.5 text-left"
              >
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" className="h-8 w-8 object-cover rounded" />
                )}
                <span className="text-sm font-medium truncate">{p.title ?? p.id}</span>
              </button>
            );
          })}
        </div>
        <div className="p-2 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-1 text-xs text-muted-foreground hover:bg-muted rounded">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Category picker ──────────────────────────────────────────────────────
// Category picker — DROPDOWN ONLY. Was a datalist which accepted free-text
// entry; that's how the category list drifted into typo-variants. To add
// a new category, admins go to /b2b/super-admin/categories (the DB is the
// one source of truth).
function CategoryPicker({ value, onChange, categories, label }: {
  value: string; onChange: (v: string) => void; categories: string[]; label: string;
}) {
  const known = categories.includes(value) || value === "";
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={known ? value : ""} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm">
        <option value="">— (none)</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        {!known && <option value={value} disabled>⚠ {value} (not in master list)</option>}
      </select>
    </label>
  );
}

// ─── Custom HTML editor ──────────────────────────────────────────────────
function CustomHtmlEditor({ cfg, onUpdateConfig }: {
  cfg: Record<string, unknown>; onUpdateConfig: (p: Record<string, unknown>) => void;
}) {
  const html = (cfg.html as string) ?? "";
  const css  = (cfg.css  as string) ?? "";
  return (
    <div className="space-y-2">
      <LabeledTextarea label="HTML" value={html} onChange={(v) => onUpdateConfig({ html: v })}
        rows={8} placeholder="<div class='my-block'>Hello world</div>" />
      <LabeledTextarea label="CSS (optional)" value={css} onChange={(v) => onUpdateConfig({ css: v })}
        rows={4} placeholder=".my-block { padding: 20px; background: #fafafa; }" />
      <p className="text-[10px] text-amber-600 dark:text-amber-400">
        ⚠ Admin-authored HTML renders raw. Review for any script tags before publishing.
      </p>
    </div>
  );
}

// ─── Generic list editor ─────────────────────────────────────────────────
function ListEditor<T extends { id: string; [k: string]: unknown }>(props: {
  cfg: Record<string, unknown>;
  listKey: string;
  itemLabel: string;
  fields: Array<{ key: string; label: string }>;
  onUpdateConfig: (p: Record<string, unknown>) => void;
}) {
  const { cfg, listKey, itemLabel, fields, onUpdateConfig } = props;
  const items = (cfg[listKey] as T[] | undefined) ?? [];
  const set = (next: T[]) => onUpdateConfig({ [listKey]: next });
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.id} className="flex items-start gap-2 rounded-md border bg-background p-2">
          <span className="text-[10px] font-bold text-muted-foreground mt-1">#{i + 1}</span>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
            {fields.map((f) => (
              <LabeledInput key={f.key} label={f.label}
                value={(it[f.key] as string) ?? ""}
                onChange={(v) => { const n = [...items]; n[i] = { ...it, [f.key]: v }; set(n); }}
              />
            ))}
          </div>
          <button onClick={() => set(items.filter((_, j) => j !== i))} className="p-1.5 text-destructive hover:bg-destructive/10 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          const newItem = { id: genId(itemLabel.toLowerCase().slice(0, 4)) } as T;
          set([...items, newItem]);
        }}
        className="w-full rounded-md border-2 border-dashed py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
      >+ Add {itemLabel.toLowerCase()}</button>
    </div>
  );
}

// ─── CTA block editor (design-with-ai / make-someone-happy) ─────────────
function CtaBlockEditor({ cfg, onUpdateConfig, withImage }: {
  cfg: Record<string, unknown>; onUpdateConfig: (p: Record<string, unknown>) => void; withImage?: boolean;
}) {
  return (
    <div className="space-y-2">
      <LabeledInput label="Headline" value={(cfg.headline as string) ?? ""} onChange={(v) => onUpdateConfig({ headline: v })} />
      <LabeledInput label="Subheadline" value={(cfg.subheadline as string) ?? ""} onChange={(v) => onUpdateConfig({ subheadline: v })} />
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput label="CTA text" value={(cfg.ctaText as string) ?? ""} onChange={(v) => onUpdateConfig({ ctaText: v })} />
        <LabeledInput label="CTA link" value={(cfg.ctaLink as string) ?? ""} onChange={(v) => onUpdateConfig({ ctaLink: v })} />
      </div>
      {withImage && (
        <LabeledInput label="Image URL" value={(cfg.imageUrl as string) ?? ""} onChange={(v) => onUpdateConfig({ imageUrl: v })} />
      )}
    </div>
  );
}

// ─── Shop-by-Category editor ─────────────────────────────────────────────
type Tile = { id: string; categoryName: string; label?: string; imageUrl?: string; emoji?: string };
function ShopByCategoryEditor({ cfg, onUpdateConfig, categories }: {
  cfg: Record<string, unknown>;
  onUpdateConfig: (p: Record<string, unknown>) => void;
  categories: string[];
}) {
  const tiles = (cfg.tiles as Tile[] | undefined) ?? [];
  const layout = (cfg.layout as "grid" | "scroll") ?? "grid";
  const set = (next: Tile[]) => onUpdateConfig({ tiles: next });

  return (
    <div className="space-y-2">
      <label className="block w-full sm:w-44">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Layout</span>
        <select value={layout} onChange={(e) => onUpdateConfig({ layout: e.target.value })}
          className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm">
          <option value="grid">Grid (wraps)</option>
          <option value="scroll">Horizontal scroll</option>
        </select>
      </label>

      {tiles.map((t, i) => (
        <div key={t.id} className="rounded-md border bg-background p-2 flex items-start gap-2">
          {t.imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={t.imageUrl} alt="" className="h-14 w-14 rounded-lg object-cover border" />
            : <div className="h-14 w-14 rounded-lg border bg-muted flex items-center justify-center text-2xl">{t.emoji || "🎁"}</div>
          }
          <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
            <label className="block md:col-span-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</span>
              {/* Dropdown only — admins manage the master list at /b2b/super-admin/categories */}
              <select value={categories.includes(t.categoryName) ? t.categoryName : ""}
                onChange={(e) => { const n = [...tiles]; n[i] = { ...t, categoryName: e.target.value }; set(n); }}
                className="mt-1 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">— Select a category —</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                {t.categoryName && !categories.includes(t.categoryName) && (
                  <option value={t.categoryName} disabled>⚠ {t.categoryName} (not in master list)</option>
                )}
              </select>
            </label>
            <LabeledInput label="Display label (optional)" value={t.label ?? ""}
              onChange={(v) => { const n = [...tiles]; n[i] = { ...t, label: v }; set(n); }}
              placeholder={t.categoryName}
            />
            <LabeledInput label="Emoji / icon" value={t.emoji ?? ""}
              onChange={(v) => { const n = [...tiles]; n[i] = { ...t, emoji: v }; set(n); }}
              placeholder="🎁"
            />
            <LabeledInput label="Image URL (optional)" value={t.imageUrl ?? ""}
              onChange={(v) => { const n = [...tiles]; n[i] = { ...t, imageUrl: v }; set(n); }}
              placeholder="https://…"
            />
          </div>
          <button onClick={() => set(tiles.filter((_, j) => j !== i))}
            className="p-1.5 text-destructive hover:bg-destructive/10 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <button
        onClick={() => set([...tiles, { id: genId("tile"), categoryName: "", emoji: "🎁" }])}
        className="w-full rounded-md border-2 border-dashed py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
      >+ Add category tile</button>

      <datalist id="sbc-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  );
}

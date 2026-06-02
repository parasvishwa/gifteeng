"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText, Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink, Save, ArrowLeft,
  Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Image,
  AlignLeft, Code, Quote, Minus, Loader2, Globe, FileEdit, Search, X
} from "lucide-react";
import { Input, Label, Button, Switch, Badge, Textarea } from "@gifteeng/ui";
import { toast } from "@gifteeng/ui";
import { sanitizeHtml } from "../../../../lib/sanitize-html";


async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('gifteeng.b2b.token') : null;
    const res = await fetch(`${base}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}
async function safePost<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('gifteeng.b2b.token') : null;
    const res = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}
async function safePatch<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('gifteeng.b2b.token') : null;
    const res = await fetch(`${base}/api${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}
async function safeDelete<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('gifteeng.b2b.token') : null;
    const res = await fetch(`${base}/api${path}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}

interface CustomPage {
  id: string; title: string; slug: string; html_content: string;
  is_published: boolean; created_at: string; updated_at: string;
}

const generateSlug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ─── Built-in pages directory ────────────────────────────────────────────────
// Every screen the customer can land on across web + Flutter. Used by the
// Pages admin so the operator has a single place to see "what pages exist"
// and where to edit each one. CMS-editable pages (privacy, terms, …) link
// to this page's editor. Hardcoded screens (cart, checkout, product detail)
// link to the specific admin surface that controls their data/copy.
type Surface = "web" | "flutter" | "both";
type EditorKind =
  | { kind: "cms";       slug: string }                 // custom_pages row
  | { kind: "admin";     href: string; label: string }  // jump to a sibling admin page
  | { kind: "settings";  tab: string }                  // /super-admin/settings ?tab=
  | { kind: "code-only" };                              // not yet editable from admin

const BUILT_IN_PAGES: Array<{
  group: string;
  label: string;
  webPath?: string;
  flutterRoute?: string;
  surface: Surface;
  editor: EditorKind;
  notes?: string;
}> = [
  // ── Storefront ────────────────────────────────────────────────────────────
  { group: "Storefront", label: "Home",           webPath: "/",                flutterRoute: "/home",      surface: "both",
    editor: { kind: "admin", href: "/super-admin/homepage-content", label: "Homepage Builder" },
    notes: "Sections, hero copy, banners — all driven by the Homepage Builder + Settings → Hero." },
  { group: "Storefront", label: "Shop (catalog)", webPath: "/products",        flutterRoute: "/shop",      surface: "both",
    editor: { kind: "admin", href: "/super-admin/products", label: "Products" } },
  { group: "Storefront", label: "Product detail", webPath: "/products/[slug]", flutterRoute: "/product/:slug", surface: "both",
    editor: { kind: "admin", href: "/super-admin/products", label: "Products" } },
  { group: "Storefront", label: "Categories",     webPath: "/collections",     flutterRoute: "/categories", surface: "both",
    editor: { kind: "admin", href: "/super-admin/categories", label: "Categories" } },
  { group: "Storefront", label: "Collections",    webPath: "/collections",     flutterRoute: "/collections", surface: "both",
    editor: { kind: "admin", href: "/super-admin/collections", label: "Collections" } },
  { group: "Storefront", label: "Search",         webPath: "/search",          flutterRoute: "/search",    surface: "both",
    editor: { kind: "code-only" } },

  // ── Cart & checkout ─────────────────────────────────────────────────────
  { group: "Cart & checkout", label: "Cart",           webPath: "/cart",      flutterRoute: "/cart",       surface: "both",
    editor: { kind: "code-only" } },
  { group: "Cart & checkout", label: "Checkout",       webPath: "/checkout",  flutterRoute: "/checkout",   surface: "both",
    editor: { kind: "admin", href: "/super-admin/settings?tab=payments", label: "Settings → Payments" } },
  { group: "Cart & checkout", label: "Order success",  webPath: "/order-success", flutterRoute: "/order-success", surface: "both",
    editor: { kind: "code-only" } },
  { group: "Cart & checkout", label: "Orders / Track", webPath: "/orders",    flutterRoute: "/orders",     surface: "both",
    editor: { kind: "admin", href: "/super-admin/orders", label: "Orders admin" } },

  // ── Customer account ────────────────────────────────────────────────────
  { group: "Account", label: "Sign in",            webPath: "/auth",         flutterRoute: "/auth",      surface: "both",
    editor: { kind: "code-only" } },
  { group: "Account", label: "Account",            webPath: "/account",      flutterRoute: "/account",   surface: "both",
    editor: { kind: "code-only" } },
  { group: "Account", label: "Wishlist",           webPath: "/account/wishlist", flutterRoute: "/wishlist", surface: "both",
    editor: { kind: "code-only" } },
  { group: "Account", label: "Goins / Loyalty",    webPath: "/goins",        flutterRoute: "/goins",     surface: "both",
    editor: { kind: "admin", href: "/super-admin/coins", label: "Goins & Loyalty admin" } },
  { group: "Account", label: "Reminders",          webPath: "/reminders",    flutterRoute: "/reminders", surface: "both",
    editor: { kind: "admin", href: "/super-admin/reminders", label: "Reminders" } },
  { group: "Account", label: "Reviews",            webPath: "/reviews",      flutterRoute: "/reviews",   surface: "both",
    editor: { kind: "admin", href: "/super-admin/reviews", label: "Reviews admin" } },
  { group: "Account", label: "Account deletion",   webPath: "/account-deletion", surface: "web",
    editor: { kind: "code-only" } },

  // ── Marketing & engagement ──────────────────────────────────────────────
  { group: "Marketing", label: "Gift quiz",          webPath: "/gift-quiz",  flutterRoute: "/gift-quiz", surface: "both",
    editor: { kind: "code-only" } },
  { group: "Marketing", label: "AI design",          webPath: "/ai-design",  flutterRoute: "/ai-design", surface: "both",
    editor: { kind: "admin", href: "/super-admin/ai-settings", label: "AI Settings" } },
  { group: "Marketing", label: "Customizer studio",  webPath: "/customize",  flutterRoute: "/customizer", surface: "both",
    editor: { kind: "admin", href: "/super-admin/customizer", label: "Customizer" } },
  { group: "Marketing", label: "Gift cards",         webPath: "/gift-cards", surface: "web",
    editor: { kind: "code-only" } },
  { group: "Marketing", label: "Album / Stickers",   webPath: "/album",      flutterRoute: "/album",     surface: "both",
    editor: { kind: "admin", href: "/super-admin/stickers", label: "Stickers admin" } },
  { group: "Marketing", label: "Games / Play",       webPath: "/play",       flutterRoute: "/play",      surface: "both",
    editor: { kind: "admin", href: "/super-admin/games", label: "Games admin" } },
  { group: "Marketing", label: "Referral landing",   webPath: "/referral",   flutterRoute: "/referrals", surface: "both",
    editor: { kind: "admin", href: "/super-admin/referrals", label: "Referrals admin" } },
  { group: "Marketing", label: "Videos",             webPath: "/videos",     surface: "web",
    editor: { kind: "admin", href: "/super-admin/videos", label: "Videos admin" } },

  // ── B2B / vendors ───────────────────────────────────────────────────────
  { group: "B2B", label: "Catalogs (B2B)",          webPath: "/catalogs",   flutterRoute: "/catalogs",  surface: "both",
    editor: { kind: "admin", href: "/super-admin/catalogs", label: "Catalogs admin" } },
  { group: "B2B", label: "Corporate landing",        webPath: "/corporate",  surface: "web",
    editor: { kind: "settings", tab: "hero" } },
  { group: "B2B", label: "Become a vendor",          webPath: "/become-a-vendor", flutterRoute: "/become-a-vendor", surface: "both",
    editor: { kind: "code-only" } },

  // ── Legal / static (CMS-editable) ───────────────────────────────────────
  { group: "Legal & static (CMS)", label: "Privacy policy",   webPath: "/privacy",  flutterRoute: "/privacy",  surface: "both",
    editor: { kind: "cms", slug: "privacy-policy" } },
  { group: "Legal & static (CMS)", label: "Terms",            webPath: "/terms",    flutterRoute: "/terms",    surface: "both",
    editor: { kind: "cms", slug: "terms" } },
  { group: "Legal & static (CMS)", label: "Shipping policy",  webPath: "/shipping", flutterRoute: "/shipping", surface: "both",
    editor: { kind: "cms", slug: "shipping-policy" } },
  { group: "Legal & static (CMS)", label: "Returns policy",   webPath: "/returns",  flutterRoute: "/returns",  surface: "both",
    editor: { kind: "cms", slug: "returns-policy" } },
  { group: "Legal & static (CMS)", label: "About",            webPath: "/about",    flutterRoute: "/about",    surface: "both",
    editor: { kind: "cms", slug: "about" } },
  { group: "Legal & static (CMS)", label: "Contact",          webPath: "/contact",  flutterRoute: "/contact",  surface: "both",
    editor: { kind: "cms", slug: "contact" } },
  { group: "Legal & static (CMS)", label: "Install (PWA)",    webPath: "/install",  surface: "web",
    editor: { kind: "code-only" } },
];

const TOOLBAR_ACTIONS = [
  { icon: Bold, label: "Bold", tag: "<strong>", endTag: "</strong>" },
  { icon: Italic, label: "Italic", tag: "<em>", endTag: "</em>" },
  { icon: Heading1, label: "H1", tag: "<h1>", endTag: "</h1>" },
  { icon: Heading2, label: "H2", tag: "<h2>", endTag: "</h2>" },
  { icon: Heading3, label: "H3", tag: "<h3>", endTag: "</h3>" },
  { icon: List, label: "List", tag: "<ul>\n  <li>", endTag: "</li>\n</ul>" },
  { icon: ListOrdered, label: "Ordered", tag: "<ol>\n  <li>", endTag: "</li>\n</ol>" },
  { icon: Quote, label: "Quote", tag: "<blockquote>", endTag: "</blockquote>" },
  { icon: Code, label: "Code", tag: "<code>", endTag: "</code>" },
  { icon: Link2, label: "Link", tag: '<a href="#">', endTag: "</a>" },
  { icon: Image, label: "Image", tag: '<img src="', endTag: '" alt="" />' },
  { icon: Minus, label: "HR", tag: "<hr />", endTag: "" },
  { icon: AlignLeft, label: "P", tag: "<p>", endTag: "</p>" },
];

export default function AdminPages() {
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomPage | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [search, setSearch] = useState("");

  const fetchPages = async () => {
    // TODO: backend endpoint /admin/custom-pages is required (Supabase custom_pages table)
    const data = await safeGet<CustomPage[]>("/admin/custom-pages", []);
    setPages(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPages(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return pages;
    const q = search.toLowerCase();
    return pages.filter(p => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q));
  }, [pages, search]);

  const startNew = () => {
    setEditing({
      id: "", title: "", slug: "",
      html_content: `<div class="page-content">\n  <h1>Page Title</h1>\n  <p>Start writing your content here...</p>\n</div>`,
      is_published: false, created_at: "", updated_at: "",
    });
    setIsNew(true);
    setPreview(false);
  };

  const startEdit = (page: CustomPage) => { setEditing({ ...page }); setIsNew(false); setPreview(false); };

  const insertTag = (tag: string, endTag: string) => {
    if (!editing) return;
    const textarea = document.getElementById("html-editor") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = editing.html_content.substring(start, end);
    const before = editing.html_content.substring(0, start);
    const after = editing.html_content.substring(end);
    const newContent = endTag
      ? `${before}${tag}${selected || "text"}${endTag}${after}`
      : `${before}${tag}${after}`;
    setEditing({ ...editing, html_content: newContent });
    setTimeout(() => {
      textarea.focus();
      const newPos = start + tag.length + (selected || "text").length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    const slug = editing.slug || generateSlug(editing.title);
    setSaving(true);
    const pageData = { title: editing.title, slug, html_content: editing.html_content, is_published: editing.is_published, updated_at: new Date().toISOString() };
    if (isNew) {
      const created = await safePost<CustomPage | null>("/admin/custom-pages", pageData, null);
      if (!created) { toast({ title: "Failed to create", variant: "destructive" }); setSaving(false); return; }
      toast({ title: "Page created!" });
    } else {
      await safePatch(`/admin/custom-pages/${editing.id}`, pageData, null);
      toast({ title: "Page updated!" });
    }
    setSaving(false); setEditing(null); setIsNew(false); fetchPages();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this page?")) return;
    await safeDelete(`/admin/custom-pages/${id}`, null);
    toast({ title: "Page deleted" }); fetchPages();
  };

  const togglePublish = async (page: CustomPage) => {
    await safePatch(`/admin/custom-pages/${page.id}`, { is_published: !page.is_published, updated_at: new Date().toISOString() }, null);
    fetchPages();
    toast({ title: page.is_published ? "Unpublished" : "Published" });
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  /* ── Editor View ── */
  if (editing) {
    return (
      <div className="max-w-4xl space-y-4">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => { setEditing(null); setIsNew(false); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Pages
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 mr-2">
              <Switch checked={editing.is_published} onCheckedChange={v => setEditing({ ...editing, is_published: v })} />
              <span className="text-[11px] text-muted-foreground">{editing.is_published ? "Published" : "Draft"}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPreview(!preview)} className="h-8 text-xs gap-1.5">
              {preview ? <Code className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? "Code" : "Preview"}
            </Button>
            <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {isNew ? "Create" : "Save"}
            </Button>
          </div>
        </div>

        {/* Page meta */}
        <div className="bg-card rounded-xl border border-border/40 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Page Title *</Label>
              <Input
                value={editing.title}
                onChange={e => {
                  const title = e.target.value;
                  setEditing({ ...editing, title, slug: isNew ? generateSlug(title) : editing.slug });
                }}
                placeholder="e.g. Terms & Conditions"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">URL Slug</Label>
              <div className="flex items-center">
                <span className="text-[10px] text-muted-foreground bg-muted/60 h-9 px-2.5 rounded-l-md border border-r-0 border-input flex items-center font-mono">/page/</span>
                <Input
                  value={editing.slug}
                  onChange={e => setEditing({ ...editing, slug: generateSlug(e.target.value) })}
                  placeholder="terms-and-conditions"
                  className="h-9 text-sm rounded-l-none font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Editor / Preview */}
        {preview ? (
          <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-4 py-2 bg-muted/20 border-b border-border/30 font-medium">
              Preview
            </div>
            <div className="p-5 prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeHtml(editing.html_content) }} />
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
            <div className="flex flex-wrap gap-0.5 p-1.5 bg-muted/20 border-b border-border/30">
              {TOOLBAR_ACTIONS.map(action => (
                <button
                  key={action.label}
                  onClick={() => insertTag(action.tag, action.endTag)}
                  className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-background hover:shadow-sm transition-colors text-muted-foreground hover:text-foreground"
                  title={action.label}
                >
                  <action.icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
            <Textarea
              id="html-editor"
              value={editing.html_content}
              onChange={e => setEditing({ ...editing, html_content: e.target.value })}
              className="font-mono text-[11px] leading-relaxed min-h-[400px] resize-y border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="<h1>Your page content...</h1>"
            />
            <div className="text-[9px] text-muted-foreground px-3 py-1.5 bg-muted/10 border-t border-border/20 flex items-center justify-between">
              <span>HTML + Tailwind classes supported</span>
              <span>{editing.html_content.length} chars</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Pages List ── */
  const publishedCount = pages.filter(p => p.is_published).length;

  return (
    <div className="max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold tracking-tight">Pages</h2>
            <p className="text-xs text-muted-foreground">{publishedCount} published · {pages.length - publishedCount} drafts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={async () => {
              if (!confirm("Seed the 6 standard pages (Privacy, Terms, Shipping, Returns, About, Contact)? Existing slugs are preserved — this will only create missing ones.")) return;
              setSaving(true);
              const res = await safePost<{ seeded: string[]; skipped: number } | null>("/admin/custom-pages/seed", {}, null);
              setSaving(false);
              if (res?.seeded) {
                toast({ title: `Seeded ${res.seeded.length} page${res.seeded.length === 1 ? "" : "s"}${res.skipped ? ` (${res.skipped} already existed)` : ""}` });
                fetchPages();
              } else {
                toast({ title: "Seed failed — check permissions", variant: "destructive" });
              }
            }}
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs"
            disabled={saving}
          >
            ✨ Seed defaults
          </Button>
          <Button onClick={startNew} size="sm" className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Page
          </Button>
        </div>
      </div>

      {/* Search */}
      {pages.length > 3 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search pages..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8 pr-8" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      )}

      {/* ── Built-in pages directory ─────────────────────────────────────── */}
      <BuiltInPagesDirectory
        customPages={pages}
        onOpenCms={(slug) => {
          const existing = pages.find((p) => p.slug === slug);
          if (existing) {
            startEdit(existing);
            return;
          }
          // No row yet — open a "new page" prefilled with that slug.
          setEditing({
            id: "",
            title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            slug,
            html_content: `<div class="page-content">\n  <h1>${slug.replace(/-/g, " ")}</h1>\n  <p>Add content…</p>\n</div>`,
            is_published: false,
            created_at: "",
            updated_at: "",
          });
          setIsNew(true);
          setPreview(false);
        }}
        searchQuery={search}
      />

      {/* List */}
      {pages.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-7 h-7 text-primary/40" />
          </div>
          <p className="text-sm font-medium mb-1">No pages yet</p>
          <p className="text-xs text-muted-foreground mb-4">
            Quickly create the 6 legal-required pages (Privacy, Terms, Shipping, Returns, About, Contact) — or start fresh.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              onClick={async () => {
                setSaving(true);
                const res = await safePost<{ seeded: string[] } | null>("/admin/custom-pages/seed", {}, null);
                setSaving(false);
                if (res?.seeded) { toast({ title: `Seeded ${res.seeded.length} pages` }); fetchPages(); }
                else             { toast({ title: "Seed failed", variant: "destructive" }); }
              }}
              size="sm"
              className="gap-1.5 text-xs"
              disabled={saving}
            >
              ✨ Seed 6 standard pages
            </Button>
            <Button onClick={startNew} size="sm" variant="outline" className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> New Page
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-12 text-center">
          <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No pages match "{search}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(page => (
            <div
              key={page.id}
              className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${page.is_published ? "bg-emerald-500/10" : "bg-muted/60"}`}>
                {page.is_published ? <Globe className="w-4 h-4 text-emerald-600" /> : <FileEdit className="w-4 h-4 text-muted-foreground/50" />}
              </div>

              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => startEdit(page)}>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium truncate">{page.title}</p>
                  <Badge
                    variant={page.is_published ? "default" : "secondary"}
                    className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${page.is_published ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}`}
                  >
                    {page.is_published ? "Live" : "Draft"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate">/page/{page.slug}</p>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => togglePublish(page)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title={page.is_published ? "Unpublish" : "Publish"}>
                  {page.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                {page.is_published && (
                  <button onClick={() => window.open(`/page/${page.slug}`, "_blank")} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="Open in new tab">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => startEdit(page)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(page.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Built-in pages directory component ──────────────────────────────────────
// Renders the BUILT_IN_PAGES list grouped by category. Each row tells the
// operator where the page lives (web URL + Flutter route), which surface it's
// on, and offers a one-click jump to whatever admin surface controls it.
function BuiltInPagesDirectory({
  customPages,
  onOpenCms,
  searchQuery,
}: {
  customPages: CustomPage[];
  onOpenCms: (slug: string) => void;
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState<boolean>(true);
  const cmsBySlug = useMemo(() => {
    const m = new Map<string, CustomPage>();
    customPages.forEach((p) => m.set(p.slug, p));
    return m;
  }, [customPages]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return BUILT_IN_PAGES;
    return BUILT_IN_PAGES.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        (p.webPath ?? "").toLowerCase().includes(q) ||
        (p.flutterRoute ?? "").toLowerCase().includes(q) ||
        p.group.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  // Group by `group` field, preserving the order they appear in BUILT_IN_PAGES.
  const groups = useMemo(() => {
    const out: Record<string, typeof BUILT_IN_PAGES> = {};
    const order: string[] = [];
    for (const p of filtered) {
      if (!out[p.group]) {
        out[p.group] = [];
        order.push(p.group);
      }
      out[p.group]!.push(p);
    }
    return order.map((name) => ({ name, items: out[name]! }));
  }, [filtered]);

  if (filtered.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Built-in pages</span>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
            {filtered.length}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {expanded ? "Hide" : "Show"} · web + Flutter
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/30">
          {groups.map((g) => (
            <div key={g.name}>
              <div className="px-4 py-2 bg-muted/20 border-b border-border/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {g.name}
                </p>
              </div>
              <div className="divide-y divide-border/30">
                {g.items.map((p) => {
                  const cmsRow = p.editor.kind === "cms" ? cmsBySlug.get(p.editor.slug) : null;
                  return (
                    <div
                      key={`${p.group}-${p.label}`}
                      className="px-4 py-2.5 flex items-center gap-3 hover:bg-accent/20 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{p.label}</p>
                          {p.surface === "both" && (
                            <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-blue-500/10 text-blue-600 border-blue-500/20">
                              Web · App
                            </Badge>
                          )}
                          {p.surface === "web" && (
                            <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                              Web only
                            </Badge>
                          )}
                          {p.surface === "flutter" && (
                            <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                              App only
                            </Badge>
                          )}
                          {cmsRow?.is_published && (
                            <Badge className="text-[8px] h-3.5 px-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                              Published
                            </Badge>
                          )}
                          {p.editor.kind === "cms" && !cmsRow && (
                            <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-amber-500/10 text-amber-700 border-amber-500/30">
                              Not seeded
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {p.webPath && <span>web {p.webPath}</span>}
                          {p.webPath && p.flutterRoute && <span> · </span>}
                          {p.flutterRoute && <span>app {p.flutterRoute}</span>}
                        </p>
                        {p.notes && (
                          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                            {p.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.webPath && (
                          <button
                            onClick={() => window.open(p.webPath, "_blank")}
                            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                            title="Open on web"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {p.editor.kind === "cms" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => onOpenCms(p.editor.kind === "cms" ? p.editor.slug : "")}
                          >
                            <Pencil className="w-3 h-3" />
                            {cmsRow ? "Edit copy" : "Seed & edit"}
                          </Button>
                        )}
                        {p.editor.kind === "admin" && (
                          <a href={p.editor.href}>
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 gap-1">
                              <Pencil className="w-3 h-3" /> {p.editor.label}
                            </Button>
                          </a>
                        )}
                        {p.editor.kind === "settings" && (
                          <a href={`/super-admin/settings?tab=${p.editor.tab}`}>
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 gap-1">
                              <Pencil className="w-3 h-3" /> Settings → {p.editor.tab}
                            </Button>
                          </a>
                        )}
                        {p.editor.kind === "code-only" && (
                          <span className="text-[10px] text-muted-foreground/60 italic px-2">
                            code-only
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
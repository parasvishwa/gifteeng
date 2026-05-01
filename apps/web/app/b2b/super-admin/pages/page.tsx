"use client";

import { useState, useEffect, useMemo } from "react";
import {
  FileText, Plus, Pencil, Trash2, Eye, EyeOff, ExternalLink, Save, ArrowLeft,
  Bold, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Image,
  AlignLeft, Code, Quote, Minus, Loader2, Globe, FileEdit, Search, X
} from "lucide-react";
import { Input, Label, Button, Switch, Badge, Textarea } from "@gifteeng/ui";
import { toast } from "@gifteeng/ui";


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
            <div className="p-5 prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: editing.html_content }} />
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
"use client";

// Super-admin — Announcements CRUD
// Home-screen banners with time-windowed visibility. The daily cron
// auto-hides banners whose endsAt has passed, and auto-shows ones whose
// startsAt has arrived — admin just schedules ahead without having to
// manually toggle on/off at 00:00.
//
// Endpoints:
//   GET    /api/admin/announcements
//   POST   /api/admin/announcements
//   PATCH  /api/admin/announcements/:id
//   DELETE /api/admin/announcements/:id

import { useState, useEffect, useMemo } from "react";
import {
  Badge, Button, Input, Label, Switch, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import {
  Plus, Trash2, X, Loader2, Pencil, Search,
  Megaphone, Calendar, Clock, MapPin,
} from "lucide-react";
import { authHeaders, getApiBase, safeDelete, safeGet, safePatch, safePost } from "@/lib/admin-api";

interface Announcement {
  id: string;
  title: string;
  subtitle: string | null;
  emoji: string | null;
  // Slug for /shop?occasion=<slug> deep-link from the mobile banner.
  slug: string | null;
  placement: "home" | "shop" | "checkout" | "all";
  link: string;
  eventDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  gradient: string[] | null;
  bannerImage: string | null;
  // Occasion → catalog mapping. The "Shop Now" CTA on the banner deep-
  // links into a shop view filtered to these collections + categories.
  collectionSlugs: string[];
  categoryNames:   string[];
  active: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

const emptyForm: Omit<Announcement, "id" | "createdAt" | "updatedAt"> = {
  title: "",
  subtitle: null,
  emoji: "🎉",
  slug: null,
  placement: "home",
  link: "/shop",
  eventDate: null,
  startsAt: null,
  endsAt: null,
  gradient: ["#3D0020", "#2B0018"],
  bannerImage: null,
  collectionSlugs: [],
  categoryNames:   [],
  active: true,
  order: 0,
};

// Preset gradient palettes that match the mobile app's event banner.
const GRADIENT_PRESETS: { label: string; emoji: string; colors: string[] }[] = [
  { label: "Rose",    emoji: "💝", colors: ["#3D0020", "#2B0018"] },
  { label: "Sunset",  emoji: "🌇", colors: ["#3D1A00", "#2B1200"] },
  { label: "Violet",  emoji: "🌸", colors: ["#2E0050", "#1A0030"] },
  { label: "Ocean",   emoji: "🌊", colors: ["#0F2137", "#082032"] },
  { label: "Emerald", emoji: "🍀", colors: ["#052E16", "#031A0D"] },
  { label: "Amber",   emoji: "🪔", colors: ["#451A03", "#1C0701"] },
];

function toInputDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  // YYYY-MM-DDTHH:mm — what <input type="datetime-local"> wants
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromInputDateTime(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(+d)) return null;
  return d.toISOString();
}

export default function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await safeGet<{ items: Announcement[] }>("/admin/announcements?pageSize=200", { items: [] });
    setItems(data.items ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (a) => a.title.toLowerCase().includes(q) || (a.subtitle ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const startEdit = (a: Announcement) => {
    setEditing(a);
    const { id: _, createdAt: _c, updatedAt: _u, ...rest } = a;
    setForm(rest);
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    const payload: any = { ...form };
    // Backend expects ISO; normalize null-empties + convert datetime-local → ISO
    for (const k of ["subtitle", "emoji", "bannerImage", "slug"]) {
      if (payload[k] === "") payload[k] = null;
    }
    if (payload.gradient && Array.isArray(payload.gradient) && payload.gradient.length < 2) {
      payload.gradient = undefined;
    }
    // Strip empty slug array fields so the payload is small + validates
    // cleanly against the .max(50) schema — they're optional on the API.
    if (Array.isArray(payload.collectionSlugs) && payload.collectionSlugs.length === 0) {
      delete payload.collectionSlugs;
    }
    if (Array.isArray(payload.categoryNames) && payload.categoryNames.length === 0) {
      delete payload.categoryNames;
    }
    const ok = editing
      ? await safePatch<Announcement | null>(`/admin/announcements/${editing.id}`, payload, null)
      : await safePost<Announcement | null>(`/admin/announcements`, payload, null);
    setSaving(false);
    if (ok) {
      setShowForm(false);
      setEditing(null);
      await load();
    }
  };

  const toggleActive = async (a: Announcement) => {
    await safePatch(`/admin/announcements/${a.id}`, { active: !a.active }, null);
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, active: !a.active } : x)));
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await safeDelete(`/admin/announcements/${id}`, null);
    await load();
  };

  const liveCount = items.filter((a) => a.active && isLive(a)).length;
  const scheduledCount = items.filter((a) => a.active && !isLive(a) && a.startsAt && +new Date(a.startsAt) > Date.now()).length;

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Megaphone className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight">Announcements</h1>
          <p className="text-xs text-muted-foreground">
            {liveCount} live now · {scheduledCount} scheduled · {items.length} total
          </p>
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={startCreate}>
          <Plus className="w-3.5 h-3.5" /> New Announcement
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title or subtitle…"
          className="pl-9 h-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Megaphone className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">
            {search ? "No matches" : "No announcements yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            Schedule a festival or occasion banner to appear on home / shop / checkout.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <AnnRow
              key={a.id}
              a={a}
              onEdit={() => startEdit(a)}
              onToggle={() => toggleActive(a)}
              onDelete={() => remove(a.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <FormSheet
          editing={editing}
          form={form}
          setForm={setForm}
          onCancel={() => setShowForm(false)}
          onSave={save}
          saving={saving}
        />
      )}
    </div>
  );
}

function isLive(a: Announcement): boolean {
  const now = Date.now();
  const starts = a.startsAt ? +new Date(a.startsAt) : null;
  const ends = a.endsAt ? +new Date(a.endsAt) : null;
  if (starts !== null && now < starts) return false;
  if (ends !== null && now >= ends) return false;
  return true;
}

function AnnRow({
  a, onEdit, onToggle, onDelete,
}: {
  a: Announcement;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const live = a.active && isLive(a);
  const g0 = a.gradient?.[0] ?? "#2E0050";
  const g1 = a.gradient?.[1] ?? "#1A0030";
  return (
    <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* Preview tile */}
        <div
          className="shrink-0 w-16 h-16 rounded-lg flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${g0}, ${g1})` }}
        >
          <span className="text-2xl">{a.emoji || "🎉"}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{a.title}</span>
            {live && (
              <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                Live
              </Badge>
            )}
            {!a.active && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Disabled</Badge>
            )}
            {a.active && !live && (
              <Badge className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                {a.startsAt && +new Date(a.startsAt) > Date.now() ? "Scheduled" : "Expired"}
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 uppercase tracking-wider">
              {a.placement}
            </Badge>
          </div>
          {a.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{a.subtitle}</p>}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/70">
            {a.eventDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {fmt(a.eventDate)}
              </span>
            )}
            {a.startsAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> starts {fmt(a.startsAt)}
              </span>
            )}
            {a.endsAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> ends {fmt(a.endsAt)}
              </span>
            )}
            {a.link && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {a.link}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Switch checked={a.active} onCheckedChange={onToggle} />
          <button onClick={onEdit} title="Edit" className="p-1.5 rounded-lg hover:bg-muted">
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={onDelete} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-500/10">
            <Trash2 className="w-4 h-4 text-rose-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function FormSheet({
  editing, form, setForm, onCancel, onSave, saving,
}: {
  editing: Announcement | null;
  form: Omit<Announcement, "id" | "createdAt" | "updatedAt">;
  setForm: (f: any) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const g0 = form.gradient?.[0] ?? "#2E0050";
  const g1 = form.gradient?.[1] ?? "#1A0030";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-2 sm:p-6">
      <div className="bg-background rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto border border-border/40">
        <div className="flex items-center justify-between p-4 border-b border-border/40 sticky top-0 bg-background">
          <h2 className="font-bold text-sm">
            {editing ? "Edit announcement" : "New announcement"}
          </h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* Preview */}
          <div
            className="h-20 rounded-xl flex items-center gap-3 px-4 text-white"
            style={{ background: `linear-gradient(135deg, ${g0}, ${g1})` }}
          >
            <span className="text-3xl">{form.emoji || "🎉"}</span>
            <div className="flex-1">
              <div className="font-bold text-sm">{form.title || "Title goes here"}</div>
              {form.subtitle && <div className="text-xs opacity-80">{form.subtitle}</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Valentine's Day" />
            </div>
            <div>
              <Label className="text-xs">Emoji</Label>
              <Input value={form.emoji ?? ""} onChange={(e) => set("emoji", e.target.value)} placeholder="💝" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Subtitle</Label>
            <Input
              value={form.subtitle ?? ""}
              onChange={(e) => set("subtitle", e.target.value)}
              placeholder="Gifts for your loved one"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Placement</Label>
              <Select value={form.placement} onValueChange={(v) => set("placement", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="checkout">Checkout</SelectItem>
                  <SelectItem value="all">All surfaces</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tap link</Label>
              <Input value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="/shop?occasion=mothers-day" />
            </div>
          </div>

          {/* Occasion slug — drives /shop?occasion=<slug> from the mobile
              banner Shop-Now CTA. Also matched against products tagged
              with occasion:<slug> to scope the filtered shop view. */}
          <div className="grid grid-cols-1 gap-3 border-t border-border/40 pt-3">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
              Occasion routing
            </div>
            <div>
              <Label className="text-xs">Occasion slug</Label>
              <Input
                value={form.slug ?? ""}
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="mothers-day"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Used to deep-link Shop Now → <code>/shop?occasion={form.slug || "mothers-day"}</code>.
                Lowercase, dashes only.
              </p>
            </div>
            <div>
              <Label className="text-xs">Collections to feature (slugs, comma-separated)</Label>
              <Input
                value={(form.collectionSlugs ?? []).join(", ")}
                onChange={(e) => set(
                  "collectionSlugs",
                  e.target.value
                    .split(",")
                    .map((s: string) => s.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                    .filter(Boolean),
                )}
                placeholder="mothers-day-edit, premium-jewellery"
              />
            </div>
            <div>
              <Label className="text-xs">Categories to feature (names, comma-separated)</Label>
              <Input
                value={(form.categoryNames ?? []).join(", ")}
                onChange={(e) => set(
                  "categoryNames",
                  e.target.value
                    .split(",")
                    .map((s: string) => s.trim())
                    .filter(Boolean),
                )}
                placeholder="Jewellery, Personalised Mugs"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Match the Category names exactly as they appear in <code>/super-admin/categories</code>.
              </p>
            </div>
          </div>

          {/* Gradient preset picker */}
          <div>
            <Label className="text-xs">Gradient preset</Label>
            <div className="grid grid-cols-6 gap-2 mt-1">
              {GRADIENT_PRESETS.map((p) => {
                const selected =
                  form.gradient?.[0] === p.colors[0] && form.gradient?.[1] === p.colors[1];
                return (
                  <button
                    key={p.label}
                    onClick={() => set("gradient", p.colors)}
                    title={p.label}
                    className={`aspect-square rounded-lg flex items-center justify-center text-xl transition ${selected ? "ring-2 ring-primary" : "ring-1 ring-border/40"}`}
                    style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}
                  >
                    <span className="drop-shadow">{p.emoji}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Event date</Label>
              <Input
                type="datetime-local"
                value={toInputDateTime(form.eventDate)}
                onChange={(e) => set("eventDate", fromInputDateTime(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Starts at</Label>
              <Input
                type="datetime-local"
                value={toInputDateTime(form.startsAt)}
                onChange={(e) => set("startsAt", fromInputDateTime(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Ends at</Label>
              <Input
                type="datetime-local"
                value={toInputDateTime(form.endsAt)}
                onChange={(e) => set("endsAt", fromInputDateTime(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Sort order</Label>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => set("order", parseInt(e.target.value || "0", 10))}
              />
            </div>
            <label className="flex items-center gap-2 text-xs pt-5">
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
              Active
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border/40 sticky bottom-0 bg-background">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving || !form.title}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (editing ? "Save" : "Create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

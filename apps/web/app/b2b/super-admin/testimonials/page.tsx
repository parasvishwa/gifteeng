"use client";

// Super-admin — Testimonials CRUD
// Backs the mobile home-page carousel and the web testimonials strip.
// The endpoint contract (same for web + mobile):
//   GET    /api/admin/testimonials?status=all
//   POST   /api/admin/testimonials
//   PATCH  /api/admin/testimonials/:id
//   POST   /api/admin/testimonials/:id/approve
//   POST   /api/admin/testimonials/:id/reject
//   DELETE /api/admin/testimonials/:id

import { useState, useEffect, useMemo } from "react";
import {
  Badge, Button, Input, Label, Switch, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import {
  Plus, Trash2, Star, X, Loader2, Pencil, Check, XCircle,
  Search, MessageSquareQuote, User, Package, MapPin,
} from "lucide-react";
import { authHeaders, getApiBase, safeDelete, safeGet, safePatch, safePost } from "@/lib/admin-api";

interface Testimonial {
  id: string;
  name: string;
  avatar: string | null;
  location: string | null;
  rating: number;
  text: string;
  verified: boolean;
  featured: boolean;
  status: "pending" | "approved" | "rejected";
  productId: string | null;
  productTitle: string | null;
  productImage: string | null;
  productSlug: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface ProductLite { id: string; title: string; slug: string }

const emptyForm: Omit<Testimonial, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  avatar: null,
  location: null,
  rating: 5,
  text: "",
  verified: true,
  featured: false,
  status: "approved",
  productId: null,
  productTitle: null,
  productImage: null,
  productSlug: null,
  order: 0,
};

export default function AdminTestimonials() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const [data, ps] = await Promise.all([
      safeGet<{ items: Testimonial[] }>(`/admin/testimonials?status=${status}&pageSize=200`, { items: [] }),
      safeGet<{ items: ProductLite[] } | ProductLite[]>(`/products?pageSize=500`, []),
    ]);
    setItems(data.items ?? []);
    const plist = Array.isArray(ps) ? ps : (ps as any).items ?? [];
    setProducts(plist.map((p: any) => ({ id: p.id, title: p.title, slug: p.slug })));
    setLoading(false);
  };
  useEffect(() => { load(); }, [status]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.text.toLowerCase().includes(q) ||
        (t.productTitle ?? "").toLowerCase().includes(q),
    );
  }, [items, search]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };
  const startEdit = (t: Testimonial) => {
    setEditing(t);
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = t;
    setForm(rest);
    setShowForm(true);
  };
  const cancel = () => {
    setShowForm(false);
    setEditing(null);
  };

  const save = async () => {
    setSaving(true);
    // API expects null for clearing, not empty string
    const payload: any = { ...form };
    for (const k of ["avatar", "location", "productId", "productTitle", "productImage", "productSlug"]) {
      if (payload[k] === "") payload[k] = null;
    }
    const ok = editing
      ? await safePatch<Testimonial | null>(`/admin/testimonials/${editing.id}`, payload, null)
      : await safePost<Testimonial | null>(`/admin/testimonials`, payload, null);
    setSaving(false);
    if (ok) {
      setShowForm(false);
      setEditing(null);
      await load();
    }
  };

  const quickApprove = async (id: string) => {
    await safePost(`/admin/testimonials/${id}/approve`, {}, null);
    await load();
  };
  const quickReject = async (id: string) => {
    await safePost(`/admin/testimonials/${id}/reject`, {}, null);
    await load();
  };
  const toggleFeatured = async (t: Testimonial) => {
    await safePatch(`/admin/testimonials/${t.id}`, { featured: !t.featured }, null);
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, featured: !t.featured } : x)));
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this testimonial? Can't be undone.")) return;
    await safeDelete(`/admin/testimonials/${id}`, null);
    await load();
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const approvedCount = items.filter((i) => i.status === "approved").length;

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <MessageSquareQuote className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-display font-bold tracking-tight">Testimonials</h1>
          <p className="text-xs text-muted-foreground">
            {approvedCount} approved · {pendingCount} pending · {items.length} total
          </p>
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={startCreate}>
          <Plus className="w-3.5 h-3.5" /> New Testimonial
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-36 h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, text, or linked product…"
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <MessageSquareQuote className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">
            {search ? "No matches" : "No testimonials yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {search ? "Try a different query" : 'Click "New Testimonial" above to add one'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <TestimonialRow
              key={t.id}
              t={t}
              onEdit={() => startEdit(t)}
              onApprove={() => quickApprove(t.id)}
              onReject={() => quickReject(t.id)}
              onToggleFeatured={() => toggleFeatured(t)}
              onDelete={() => remove(t.id)}
            />
          ))}
        </div>
      )}

      {/* Edit/Create modal */}
      {showForm && (
        <FormSheet
          editing={editing}
          form={form}
          setForm={setForm}
          products={products}
          onCancel={cancel}
          onSave={save}
          saving={saving}
        />
      )}
    </div>
  );
}

function TestimonialRow({
  t, onEdit, onApprove, onReject, onToggleFeatured, onDelete,
}: {
  t: Testimonial;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onToggleFeatured: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
      <div className="flex gap-3 p-4">
        {/* Avatar */}
        <div className="shrink-0">
          {t.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{t.name}</span>
            {/* Rating stars */}
            <span className="flex items-center">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${i < t.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
                />
              ))}
            </span>
            {t.verified && (
              <Badge className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                Verified
              </Badge>
            )}
            {t.featured && (
              <Badge className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/20">
                Featured
              </Badge>
            )}
            <StatusPill status={t.status} />
          </div>

          <p className="text-xs text-muted-foreground italic mt-1 line-clamp-2">"{t.text}"</p>

          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/60">
            {t.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {t.location}
              </span>
            )}
            {t.productTitle && (
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" /> {t.productTitle}
              </span>
            )}
            <span>#{t.order}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {t.status !== "approved" && (
            <button
              onClick={onApprove}
              title="Approve"
              className="p-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors"
            >
              <Check className="w-4 h-4 text-emerald-600" />
            </button>
          )}
          {t.status !== "rejected" && (
            <button
              onClick={onReject}
              title="Reject"
              className="p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
            >
              <XCircle className="w-4 h-4 text-rose-500" />
            </button>
          )}
          <button
            onClick={onToggleFeatured}
            title={t.featured ? "Unpin" : "Feature"}
            className="p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
          >
            <Star className={`w-4 h-4 ${t.featured ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    rejected: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  };
  return (
    <Badge className={`text-[9px] h-4 px-1.5 ${map[status] ?? ""}`}>{status}</Badge>
  );
}

function FormSheet({
  editing, form, setForm, products, onCancel, onSave, saving,
}: {
  editing: Testimonial | null;
  form: Omit<Testimonial, "id" | "createdAt" | "updatedAt">;
  setForm: (f: any) => void;
  products: ProductLite[];
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-2 sm:p-6">
      <div className="bg-background rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto border border-border/40">
        <div className="flex items-center justify-between p-4 border-b border-border/40 sticky top-0 bg-background">
          <h2 className="font-bold text-sm">
            {editing ? "Edit testimonial" : "New testimonial"}
          </h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Priya Sharma" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Location</Label>
              <Input
                value={form.location ?? ""}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Mumbai"
              />
            </div>
            <div>
              <Label className="text-xs">Avatar URL</Label>
              <Input
                value={form.avatar ?? ""}
                onChange={(e) => set("avatar", e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Rating (1–5)</Label>
              <Input
                type="number"
                min={1} max={5}
                value={form.rating}
                onChange={(e) => set("rating", parseInt(e.target.value || "5", 10))}
              />
            </div>
            <div>
              <Label className="text-xs">Sort order</Label>
              <Input
                type="number"
                value={form.order}
                onChange={(e) => set("order", parseInt(e.target.value || "0", 10))}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Text *</Label>
            <Textarea
              value={form.text}
              onChange={(e) => set("text", e.target.value)}
              placeholder="The personalised cake topper was stunning!"
              rows={4}
            />
          </div>
          <div>
            <Label className="text-xs">Linked product (optional)</Label>
            <Select
              value={form.productId ?? "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  set("productId", null);
                  set("productTitle", null);
                  set("productSlug", null);
                  set("productImage", null);
                } else {
                  const p = products.find((pp) => pp.id === v);
                  set("productId", v);
                  set("productTitle", p?.title ?? null);
                  set("productSlug", p?.slug ?? null);
                  // productImage left for backend to cache from images[0]
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">— none —</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.verified} onCheckedChange={(v) => set("verified", v)} />
              Verified
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.featured} onCheckedChange={(v) => set("featured", v)} />
              Featured
            </label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border/40 sticky bottom-0 bg-background">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={saving || !form.name || !form.text}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (editing ? "Save changes" : "Create")}
          </Button>
        </div>
      </div>
    </div>
  );
}

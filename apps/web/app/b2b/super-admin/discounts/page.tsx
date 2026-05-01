"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Search, Ticket, Download, Trash2, Save, X, Copy, Pencil, Tag, Loader2, Percent, IndianRupee, Truck, Users, Clock } from "lucide-react";
import { Button, Input, Label, Checkbox, Switch, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gifteeng/ui";
import { toast } from "@gifteeng/ui";
import { authHeaders, getApiBase, safeGet, safePatch, safePost } from "@/lib/admin-api";

const useAuth = () => ({ user: { id: "stub" }, profile: { role: "super_admin" } });

interface Discount {
  id: string; title: string; code: string; description: string; status: string; method: string;
  discount_type: string; discount_value: number; applies_to: string; min_purchase: number;
  min_quantity: number; max_uses: number; one_per_customer: boolean; used_count: number;
  starts_at: string; ends_at: string | null; is_active: boolean; created_at: string;
  target_product_ids: string[]; target_categories: string[];
}

const genCode = (len = 8) => Array.from({ length: len }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");

export default function AdminDiscounts() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"list" | "edit">("list");
  const [editItem, setEditItem] = useState<Partial<Discount> | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);

  const fetchDiscounts = async () => {
    const data = await safeGet<Discount[]>('/discounts', []);
    setDiscounts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDiscounts();
    // TODO: categories endpoint
    safeGet<{ id: string; name: string }[]>('/categories', []).then(data => setCategories(data || []));
    // TODO: products endpoint
    safeGet<{ id: string; name: string }[]>('/products', []).then(data => setProducts(data || []));
  }, []);

  const getStatus = (d: Discount) => {
    if (!d.is_active) return "expired";
    if (d.ends_at && new Date(d.ends_at) < new Date()) return "expired";
    if (new Date(d.starts_at) > new Date()) return "scheduled";
    return "active";
  };

  const getTypeLabel = (d: Partial<Discount>) =>
    d.discount_type === "percentage" ? `${d.discount_value}% off` :
    d.discount_type === "fixed_amount" ? `₹${d.discount_value} off` : "Free shipping";

  const statusBadge = (status: string) => {
    const styles = {
      active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      scheduled: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      expired: "bg-muted text-muted-foreground border-border/30",
    }[status] || "";
    return <Badge variant="secondary" className={`text-[8px] h-4 px-1.5 ${styles}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  };

  const handleSave = async () => {
    if (!editItem?.title && !editItem?.code) { toast({ title: "Title or code required", variant: "destructive" }); return; }
    const payload = {
      title: editItem.title || "", code: editItem.code || "", description: editItem.description || "",
      method: editItem.method || "Code", discount_type: editItem.discount_type || "percentage",
      discount_value: editItem.discount_value ?? 0, applies_to: editItem.applies_to || "category",
      min_purchase: editItem.min_purchase ?? 0, min_quantity: editItem.min_quantity ?? 0,
      max_uses: editItem.max_uses ?? 0, one_per_customer: editItem.one_per_customer ?? true,
      starts_at: editItem.starts_at || new Date().toISOString(), ends_at: editItem.ends_at || null,
      is_active: editItem.is_active ?? true, updated_at: new Date().toISOString(),
      target_product_ids: editItem.target_product_ids || [], target_categories: editItem.target_categories || [],
    };
    if (editItem.id) {
      await safePatch(`/discounts/${editItem.id}`, payload, null);
      setDiscounts(prev => prev.map(d => d.id === editItem.id ? { ...d, ...payload } as Discount : d));
    } else {
      const data = await safePost<any>('/discounts', payload, null);
      if (data) setDiscounts(prev => [data as Discount, ...prev]);
    }
    toast({ title: "Discount saved!" }); setView("list"); setEditItem(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this discount?")) return;
    // TODO: delete endpoint
    await safePost(`/discounts/${id}/delete`, {}, null);
    setDiscounts(prev => prev.filter(d => d.id !== id));
    toast({ title: "Deleted" });
  };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code); toast({ title: "Copied!" }); };

  const handleExport = () => {
    const csv = ["Title,Code,Status,Method,Type,Value,Used",
      ...discounts.map(d => [d.title, d.code, getStatus(d), d.method, d.discount_type, d.discount_value, d.used_count].join(","))
    ].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "discounts.csv"; a.click();
  };

  const filtered = useMemo(() => discounts.filter(d => {
    const s = getStatus(d);
    return (filter === "all" || s === filter) &&
      (!search || d.title.toLowerCase().includes(search.toLowerCase()) || d.code.toLowerCase().includes(search.toLowerCase()));
  }), [discounts, filter, search]);

  const activeCount = discounts.filter(d => getStatus(d) === "active").length;
  const totalUsed = discounts.reduce((s, d) => s + d.used_count, 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  // ── EDIT VIEW ──
  if (view === "edit" && editItem) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-bold">{editItem.id ? "Edit Discount" : "Create Discount"}</h2>
          <button onClick={() => { setView("list"); setEditItem(null); }} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <div className="p-4 space-y-5">
            {/* Method */}
            <div>
              <Label className="text-[11px] text-muted-foreground mb-2 block">Discount Method</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { val: "Code", icon: Tag, title: "Discount Code", desc: "Enter code at checkout" },
                  { val: "Automatic", icon: Ticket, title: "Automatic", desc: "Applied automatically" },
                ].map(m => (
                  <button key={m.val}
                    className={`rounded-xl border p-3 text-left transition-all ${editItem.method === m.val ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border/40 hover:border-border"}`}
                    onClick={() => setEditItem(p => ({ ...p, method: m.val }))}>
                    <m.icon className="w-4 h-4 text-primary mb-1" />
                    <p className="text-xs font-semibold">{m.title}</p>
                    <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Title & Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Title *</Label>
                <Input value={editItem.title || ""} onChange={e => setEditItem(p => ({ ...p, title: e.target.value }))} placeholder="Summer Sale" className="h-9 text-sm mt-1" autoFocus />
              </div>
              {editItem.method !== "Automatic" && (
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-muted-foreground">Code</Label>
                    <button onClick={() => setEditItem(p => ({ ...p, code: genCode() }))} className="text-[10px] text-primary hover:underline">Generate</button>
                  </div>
                  <div className="flex gap-1.5 mt-1">
                    <Input value={editItem.code || ""} onChange={e => setEditItem(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="SAVE20" className="h-9 text-sm font-mono uppercase flex-1" />
                    {editItem.code && (
                      <Button variant="outline" size="sm" className="h-9 px-2.5 shrink-0" onClick={() => copyCode(editItem.code || "")}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Value */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Discount Type</Label>
                <Select value={editItem.discount_type || "percentage"} onValueChange={v => setEditItem(p => ({ ...p, discount_type: v }))}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage"><span className="flex items-center gap-1.5"><Percent className="w-3 h-3" /> Percentage</span></SelectItem>
                    <SelectItem value="fixed_amount"><span className="flex items-center gap-1.5"><IndianRupee className="w-3 h-3" /> Fixed amount</span></SelectItem>
                    <SelectItem value="free_shipping"><span className="flex items-center gap-1.5"><Truck className="w-3 h-3" /> Free shipping</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editItem.discount_type !== "free_shipping" && (
                <div>
                  <Label className="text-[11px] text-muted-foreground">Value ({editItem.discount_type === "percentage" ? "%" : "₹"})</Label>
                  <Input type="number" value={editItem.discount_value ?? 0} onChange={e => setEditItem(p => ({ ...p, discount_value: parseFloat(e.target.value) || 0 }))} className="h-9 text-sm mt-1" />
                </div>
              )}
            </div>

            {/* Applies to */}
            <div>
              <Label className="text-[11px] text-muted-foreground">Applies To</Label>
              <Select value={editItem.applies_to || "category"} onValueChange={v => setEditItem(p => ({ ...p, applies_to: v, target_product_ids: [], target_categories: [] }))}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">Specific categories</SelectItem>
                  <SelectItem value="products">Specific products</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editItem.applies_to === "category" && (
              <div>
                <Label className="text-[11px] text-muted-foreground mb-2 block">Categories</Label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => {
                    const sel = (editItem.target_categories || []).includes(cat.name);
                    return (
                      <button key={cat.id} type="button"
                        onClick={() => setEditItem(p => {
                          const cur = p?.target_categories || [];
                          return { ...p, target_categories: sel ? cur.filter(c => c !== cat.name) : [...cur, cat.name] };
                        })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${sel ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 text-muted-foreground border-border/50 hover:border-primary/40"}`}>
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {editItem.applies_to === "products" && (
              <div>
                <Label className="text-[11px] text-muted-foreground mb-2 block">Products</Label>
                <div className="max-h-48 overflow-y-auto border border-border/40 rounded-lg divide-y divide-border/30">
                  {products.map(p => {
                    const sel = (editItem.target_product_ids || []).includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors text-xs ${sel ? "bg-primary/5" : ""}`}>
                        <Checkbox checked={sel} onCheckedChange={() => setEditItem(prev => {
                          const cur = prev?.target_product_ids || [];
                          return { ...prev, target_product_ids: sel ? cur.filter(id => id !== p.id) : [...cur, p.id] };
                        })} />
                        <span className="truncate">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conditions */}
            <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Conditions</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Min purchase (₹)</Label>
                  <Input type="number" value={editItem.min_purchase ?? 0} onChange={e => setEditItem(p => ({ ...p, min_purchase: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Min quantity</Label>
                  <Input type="number" value={editItem.min_quantity ?? 0} onChange={e => setEditItem(p => ({ ...p, min_quantity: parseInt(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Max uses (0 = ∞)</Label>
                  <Input type="number" value={editItem.max_uses ?? 0} onChange={e => setEditItem(p => ({ ...p, max_uses: parseInt(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2">
                    <Switch checked={editItem.one_per_customer ?? true} onCheckedChange={v => setEditItem(p => ({ ...p, one_per_customer: v }))} />
                    <span className="text-xs">Once per customer</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Start Date</Label>
                <Input type="datetime-local" value={(editItem.starts_at || new Date().toISOString()).slice(0, 16)}
                  onChange={e => setEditItem(p => ({ ...p, starts_at: new Date(e.target.value).toISOString() }))} className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">End Date</Label>
                <Input type="datetime-local" value={editItem.ends_at ? editItem.ends_at.slice(0, 16) : ""}
                  onChange={e => setEditItem(p => ({ ...p, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} className="h-9 text-sm mt-1" />
              </div>
            </div>

            <label className="flex items-center gap-2">
              <Switch checked={editItem.is_active ?? true} onCheckedChange={v => setEditItem(p => ({ ...p, is_active: v }))} />
              <span className="text-xs">{editItem.is_active ? "Active" : "Inactive"}</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border/30 bg-muted/10">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setView("list"); setEditItem(null); }}>Cancel</Button>
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSave}>
              <Save className="w-3.5 h-3.5" /> {editItem.id ? "Save Changes" : "Create Discount"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Ticket className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Discounts</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount} active · {totalUsed} total uses · {discounts.length} codes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 hidden sm:flex" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => {
            setEditItem({ method: "Code", discount_type: "percentage", applies_to: "category", one_per_customer: true, is_active: true, starts_at: new Date().toISOString() });
            setView("edit");
          }}>
            <Plus className="w-3.5 h-3.5" /> Create
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
          {["all", "active", "scheduled", "expired"].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[140px] max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 h-8 text-xs" />
        </div>
      </div>

      {/* Discount Cards */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Ticket className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">{search || filter !== "all" ? "No discounts match" : "No discounts yet"}</p>
          <p className="text-xs text-muted-foreground">{search || filter !== "all" ? "Try different filters" : "Create your first discount code"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(d => {
            const status = getStatus(d);
            return (
              <div key={d.id}
                onClick={() => { setEditItem(d); setView("edit"); }}
                className={`bg-card rounded-xl border p-3.5 cursor-pointer group transition-all hover:shadow-sm ${status === "expired" ? "border-border/20 opacity-60" : "border-border/40 hover:border-border/60"}`}>
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    d.discount_type === "percentage" ? "bg-blue-500/10" : d.discount_type === "fixed_amount" ? "bg-emerald-500/10" : "bg-amber-500/10"
                  }`}>
                    {d.discount_type === "percentage" ? <Percent className="w-4 h-4 text-blue-600" /> :
                     d.discount_type === "fixed_amount" ? <IndianRupee className="w-4 h-4 text-emerald-600" /> :
                     <Truck className="w-4 h-4 text-amber-600" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {d.code && <span className="font-mono font-bold text-sm text-primary">{d.code}</span>}
                      <span className="text-xs font-medium truncate">{d.title}</span>
                      {statusBadge(status)}
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1">{d.method}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span className="font-medium">{getTypeLabel(d)}</span>
                      <span>·</span>
                      <span>{d.applies_to === "category" ? "Categories" : "Products"}</span>
                      {d.min_purchase > 0 && <><span>·</span><span>Min ₹{d.min_purchase}</span></>}
                      {d.one_per_customer && <><span>·</span><span>Once/customer</span></>}
                    </div>
                  </div>

                  {/* Usage + Actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold">{d.used_count}</p>
                      <p className="text-[9px] text-muted-foreground">used</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {d.code && (
                        <button onClick={e => { e.stopPropagation(); copyCode(d.code); }} className="p-1.5 rounded-lg hover:bg-muted" title="Copy code">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(d.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10" title="Delete">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
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
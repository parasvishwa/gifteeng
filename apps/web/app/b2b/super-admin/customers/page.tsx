"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Search, Users, Download, Trash2, Save, X, Mail, Phone, MapPin, ShoppingBag, IndianRupee, Loader2, Bell, BellOff, StickyNote, Brain, ArrowUpDown } from "lucide-react";
import { Button, Input, Label, Switch, Badge, Textarea } from "@gifteeng/ui";
import { toast } from "@gifteeng/ui";
import { authHeaders, getApiBase, safeDelete, safeGet, safePatch, safePost } from "@/lib/admin-api";

interface Customer {
  id: string; name: string; email: string; phone: string; location: string;
  email_subscribed: boolean; orders_count: number; amount_spent: number;
  notes: string; created_at: string; updated_at: string;
}

type ChurnRisk = {
  risk: "high" | "medium" | "low";
  reason: string;
  action: string;
};

const CHURN_RISK_LS_KEY = (customerId: string) => `gifteeng.churn.risk.${customerId}`;

function loadChurnRisk(customerId: string): ChurnRisk | null {
  try {
    const raw = localStorage.getItem(CHURN_RISK_LS_KEY(customerId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveChurnRisk(customerId: string, risk: ChurnRisk) {
  localStorage.setItem(CHURN_RISK_LS_KEY(customerId), JSON.stringify(risk));
}

function riskColor(risk: ChurnRisk["risk"]) {
  if (risk === "high") return "text-red-600 bg-red-100 border-red-200";
  if (risk === "medium") return "text-yellow-700 bg-yellow-100 border-yellow-200";
  return "text-emerald-700 bg-emerald-100 border-emerald-200";
}

function riskEmoji(risk: ChurnRisk["risk"]) {
  if (risk === "high") return "🔴";
  if (risk === "medium") return "🟡";
  return "🟢";
}

async function analyzeChurnRisk(customer: Customer): Promise<ChurnRisk | null> {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    const data = JSON.stringify({
      name: customer.name,
      orders_count: customer.orders_count,
      amount_spent: customer.amount_spent,
      last_active: customer.updated_at || customer.created_at,
      email_subscribed: customer.email_subscribed,
    });
    const res = await fetch(`${getApiBase()}/api/admin/ai/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        prompt: `Predict churn risk for this customer: ${data}. Reply: {risk: 'high'|'medium'|'low', reason: '...' (max 15 words), action: 'recommended action (max 10 words)'}`,
      }),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as { text?: string };
    const text = result.text ?? "";
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as ChurnRisk;
    return parsed;
  } catch { return null; }
}

// ─── Churn Risk Popover ───────────────────────────────────────
function ChurnRiskBadge({ customer, risk, onAnalyze, loading }: {
  customer: Customer;
  risk: ChurnRisk | null;
  onAnalyze: () => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => { setOpen(v => !v); if (!risk && !loading) onAnalyze(); }}
        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-semibold transition-all ${
          risk ? riskColor(risk.risk) : "bg-muted text-muted-foreground border-border/40 hover:bg-primary/5 hover:text-primary hover:border-primary/30"
        }`}
        title="AI Risk Analysis"
      >
        {loading ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
        ) : risk ? (
          <>{riskEmoji(risk.risk)} {risk.risk}</>
        ) : (
          <><Brain className="w-2.5 h-2.5" /> Risk</>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-xl border border-border/40 bg-card shadow-xl p-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Brain className="w-3 h-3 text-primary" /> AI Churn Risk
          </p>
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing...
            </div>
          ) : risk ? (
            <>
              <div className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-semibold ${riskColor(risk.risk)}`}>
                {riskEmoji(risk.risk)} {risk.risk.toUpperCase()} RISK
              </div>
              <p className="text-xs text-foreground">{risk.reason}</p>
              <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Recommended Action</p>
                <p className="text-xs font-medium">{risk.action}</p>
              </div>
              <button
                onClick={onAnalyze}
                className="text-[10px] text-primary hover:underline"
              >
                Re-analyze
              </button>
            </>
          ) : (
            <button
              onClick={onAnalyze}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Brain className="w-3 h-3" /> Run analysis
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "edit">("list");
  const [editItem, setEditItem] = useState<Partial<Customer> | null>(null);
  const [churnRisks, setChurnRisks] = useState<Record<string, ChurnRisk>>({});
  const [churnLoading, setChurnLoading] = useState<Record<string, boolean>>({});
  const [bulkAnalyzing, setBulkAnalyzing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [sortByRisk, setSortByRisk] = useState(false);

  const fetchCustomers = async () => {
    // API returns the Prisma shape: `fullName`, `ordersCount`, `createdAt`,
    // etc. The page UI was written against a flatter `name` / `created_at`
    // shape, so every row came back showing "Unnamed". Normalise here so
    // the rest of the page can keep using its existing fields.
    const data = await safeGet<{ items: any[] }>("/customers?pageSize=200", { items: [] });
    const raw = (data?.items as any[]) ?? [];
    const list: Customer[] = raw.map((r) => ({
      id: r.id ?? "",
      name: r.fullName ?? r.name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      location: r.location ?? "",
      email_subscribed: r.email_subscribed ?? r.emailSubscribed ?? false,
      orders_count: r.ordersCount ?? r.orders_count ?? 0,
      amount_spent: Number(r.amountSpent ?? r.amount_spent ?? 0),
      notes: r.notes ?? "",
      created_at: r.createdAt ?? r.created_at ?? "",
      updated_at: r.updatedAt ?? r.updated_at ?? r.createdAt ?? r.created_at ?? "",
    }));
    setCustomers(list);
    setLoading(false);
    // Load persisted churn risks
    const stored: Record<string, ChurnRisk> = {};
    for (const c of list) {
      const r = loadChurnRisk(c.id);
      if (r) stored[c.id] = r;
    }
    setChurnRisks(stored);
  };

  useEffect(() => { fetchCustomers(); }, []);

  async function runChurnAnalysis(customer: Customer) {
    setChurnLoading(prev => ({ ...prev, [customer.id]: true }));
    const risk = await analyzeChurnRisk(customer);
    if (risk) {
      saveChurnRisk(customer.id, risk);
      setChurnRisks(prev => ({ ...prev, [customer.id]: risk }));
    }
    setChurnLoading(prev => ({ ...prev, [customer.id]: false }));
  }

  async function runBulkAnalysis() {
    const batch = filtered.slice(0, 20);
    setBulkAnalyzing(true);
    setBulkProgress(0);
    for (let i = 0; i < batch.length; i++) {
      const c = batch[i];
      if (!churnRisks[c.id]) {
        await runChurnAnalysis(c);
      }
      setBulkProgress(i + 1);
    }
    setBulkAnalyzing(false);
    setSortByRisk(true);
  }

  const handleSave = async () => {
    if (!editItem?.name && !editItem?.email) { toast({ title: "Name or email required", variant: "destructive" }); return; }
    const payload = {
      name: editItem.name || "", email: editItem.email || "", phone: editItem.phone || "",
      location: editItem.location || "", email_subscribed: editItem.email_subscribed ?? false,
      orders_count: editItem.orders_count ?? 0, amount_spent: editItem.amount_spent ?? 0,
      notes: editItem.notes || "", updated_at: new Date().toISOString(),
    };
    if (editItem.id) {
      await safePatch(`/customers/${editItem.id}`, payload, null);
      setCustomers(prev => prev.map(c => c.id === editItem.id ? { ...c, ...payload } as Customer : c));
      toast({ title: "Customer saved!" });
    } else {
      const data = await safePost<Customer | null>(`/customers`, payload, null);
      if (data) setCustomers(prev => [data as Customer, ...prev]);
      toast({ title: "Customer saved!" });
    }
    setView("list"); setEditItem(null);
  };

  const handleDelete = async (id: string) => {
    // Two-step: first confirm deletion, then ask whether to hard-delete
    // (frees phone/email for re-signup) or anonymize (keeps order history).
    // OK → hard delete; the server falls back to anonymize automatically if
    // past orders/reviews block the row-level DELETE.
    if (!confirm(
      "Permanently delete this customer?\n\n" +
      "• OK = Hard delete (phone & email become free to re-register immediately).\n" +
      "• Cancel = Keep customer (abort).\n\n" +
      "If the customer has past orders, we'll anonymize instead (null phone/email, keep order history)."
    )) return;
    const res = await safeDelete<{ deleted?: boolean; anonymized?: boolean } | null>(
      `/customers/${id}`,
      null,
      { mode: "hard" },
    );
    setCustomers(prev => prev.filter(c => c.id !== id));
    toast({
      title: res?.anonymized
        ? "Anonymized (past orders preserved; phone/email freed)"
        : "Deleted (phone/email freed for re-registration)",
    });
  };

  const handleExport = () => {
    const csv = ["Name,Email,Phone,Location,Subscribed,Orders,Amount Spent",
      ...customers.map(c => [c.name, c.email, c.phone, c.location, c.email_subscribed ? "Yes" : "No", c.orders_count, c.amount_spent].join(","))
    ].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv"; a.click();
  };

  const filtered = useMemo(() => {
    let list = customers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = customers.filter(c => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.phone?.includes(q) || c.location?.toLowerCase().includes(q));
    }
    if (sortByRisk) {
      const riskOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      list = [...list].sort((a, b) => {
        const ra = churnRisks[a.id]?.risk ?? "low";
        const rb = churnRisks[b.id]?.risk ?? "low";
        return (riskOrder[ra] ?? 3) - (riskOrder[rb] ?? 3);
      });
    }
    return list;
  }, [customers, search, sortByRisk, churnRisks]);

  const totalRevenue = customers.reduce((s, c) => s + (c.amount_spent || 0), 0);
  const subscribedCount = customers.filter(c => c.email_subscribed).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (view === "edit" && editItem) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-bold">{editItem.id ? "Edit Customer" : "Add Customer"}</h2>
          <button onClick={() => { setView("list"); setEditItem(null); }} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <div className="p-4 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Name *</Label>
                <Input value={editItem.name || ""} onChange={e => setEditItem(p => ({ ...p, name: e.target.value }))} placeholder="Full name" className="h-9 text-sm mt-1" autoFocus />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Email</Label>
                <Input type="email" value={editItem.email || ""} onChange={e => setEditItem(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Phone</Label>
                <Input value={editItem.phone || ""} onChange={e => setEditItem(p => ({ ...p, phone: e.target.value }))} placeholder="+91 9876543210" className="h-9 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Location</Label>
                <Input value={editItem.location || ""} onChange={e => setEditItem(p => ({ ...p, location: e.target.value }))} placeholder="City, State" className="h-9 text-sm mt-1" />
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Order Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Orders count</Label>
                  <Input type="number" value={editItem.orders_count ?? 0} onChange={e => setEditItem(p => ({ ...p, orders_count: parseInt(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Amount spent (₹)</Label>
                  <Input type="number" value={editItem.amount_spent ?? 0} onChange={e => setEditItem(p => ({ ...p, amount_spent: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs mt-1" />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <Switch checked={editItem.email_subscribed ?? false} onCheckedChange={v => setEditItem(p => ({ ...p, email_subscribed: v }))} />
                <span className="text-xs">Email subscribed</span>
              </label>
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Notes</Label>
              <Textarea value={editItem.notes || ""} onChange={e => setEditItem(p => ({ ...p, notes: e.target.value }))}
                placeholder="Internal notes..." className="text-sm min-h-[80px]" />
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-border/30 bg-muted/10">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setView("list"); setEditItem(null); }}>Cancel</Button>
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleSave}>
              <Save className="w-3.5 h-3.5" /> {editItem.id ? "Save Changes" : "Add Customer"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Customers</h1>
            <p className="text-xs text-muted-foreground">
              {customers.length} total · {subscribedCount} subscribed · ₹{totalRevenue.toLocaleString("en-IN")} revenue
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {sortByRisk && (
            <button
              onClick={() => setSortByRisk(false)}
              className="h-8 text-xs gap-1.5 flex items-center px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            >
              <ArrowUpDown className="w-3 h-3" /> Sorted by Risk <X className="w-2.5 h-2.5 ml-1" />
            </button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
            onClick={runBulkAnalysis}
            disabled={bulkAnalyzing}
          >
            {bulkAnalyzing ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing {bulkProgress}/{Math.min(filtered.length, 20)}...</>
            ) : (
              <><Brain className="w-3.5 h-3.5" /> Run bulk analysis</>
            )}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 hidden sm:flex" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setEditItem({ email_subscribed: false, orders_count: 0, amount_spent: 0 }); setView("edit"); }}>
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>
      </div>

      {customers.length > 3 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="pl-8 h-8 text-xs pr-8" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium mb-0.5">{search ? "No matches" : "No customers yet"}</p>
          <p className="text-xs text-muted-foreground">{search ? "Try a different search" : "Customers will appear here as orders come in"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id}
              onClick={() => { setEditItem(c); setView("edit"); }}
              className="bg-card rounded-xl border border-border/40 p-3.5 cursor-pointer group transition-all hover:shadow-sm hover:border-border/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {(c.name?.[0] || c.email?.[0] || c.phone?.[0] || "?").toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Display priority: full name → email prefix (the bit
                        before `@`) → phone → "Guest customer". The old fallback
                        ("Unnamed") looked broken when the customer obviously
                        had an email or phone on record. */}
                    <span className="text-sm font-medium truncate">
                      {c.name
                        ? c.name
                        : c.email
                          ? c.email.split("@")[0]
                          : c.phone
                            ? c.phone
                            : "Guest customer"}
                    </span>
                    {c.email_subscribed ? (
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <Bell className="w-2 h-2 mr-0.5" />Subscribed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-muted text-muted-foreground border-border/30">
                        <BellOff className="w-2 h-2 mr-0.5" />Unsubscribed
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                    {c.email && <span className="flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{c.email}</span>}
                    {c.phone && <><span>·</span><span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{c.phone}</span></>}
                    {c.location && <><span>·</span><span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{c.location}</span></>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><ShoppingBag className="w-3 h-3" />{c.orders_count}</span>
                      <span className="font-bold flex items-center gap-0.5"><IndianRupee className="w-3 h-3" />{(c.amount_spent || 0).toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                  {/* AI Risk Badge */}
                  <ChurnRiskBadge
                    customer={c}
                    risk={churnRisks[c.id] ?? null}
                    loading={!!churnLoading[c.id]}
                    onAnalyze={() => runChurnAnalysis(c)}
                  />
                  <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
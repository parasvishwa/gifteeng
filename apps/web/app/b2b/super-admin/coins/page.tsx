"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, Search, Gift, TrendingUp, Users, Loader2,
  CheckCircle2, AlertCircle, Send, RefreshCw, Coins,
} from "lucide-react";
import { Button, Input, Label, Badge } from "@gifteeng/ui";
import AdminPageGuide from "../_components/AdminPageGuide";
import { getApiBase, authHeaders } from "@/lib/admin-api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) return null;
    return data as T;
  } catch { return null; }
}

interface Customer {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

interface GrantLog {
  id: string;
  customerId: string;
  coins: number;
  reason: string;
  createdAt?: string;
}

export default function AdminCoins() {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [coins, setCoins] = useState("");
  const [reason, setReason] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantStatus, setGrantStatus] = useState<"idle" | "ok" | "err">("idle");

  const [recentGrants, setRecentGrants] = useState<GrantLog[]>([]);
  const [stats, setStats] = useState({ totalCustomers: 0, recentGrants: 0 });

  // Fetch customers for search
  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomers([]); return; }
    setLoadingCustomers(true);
    const data = await apiFetch<{ items?: Customer[] } | Customer[]>(
      `/customers?search=${encodeURIComponent(q)}&pageSize=10`
    );
    const list = data
      ? Array.isArray(data) ? data : ((data as any).items ?? [])
      : [];
    setCustomers(list);
    setLoadingCustomers(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 350);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  // Load initial stats
  useEffect(() => {
    apiFetch<{ total?: number } | any>("/customers?pageSize=1").then(d => {
      if (d) setStats(s => ({ ...s, totalCustomers: (d as any).total ?? 0 }));
    });
  }, []);

  const handleGrant = async () => {
    if (!selectedCustomer || !coins || !reason.trim()) return;
    setGranting(true);
    setGrantStatus("idle");
    const res = await apiFetch("/coins/admin/grant", {
      method: "POST",
      body: JSON.stringify({
        customerId: selectedCustomer.id,
        coins: parseInt(coins, 10),
        reason: reason.trim(),
      }),
    });
    setGranting(false);
    if (res !== null) {
      setGrantStatus("ok");
      const log: GrantLog = {
        id: Date.now().toString(),
        customerId: selectedCustomer.id,
        coins: parseInt(coins, 10),
        reason: reason.trim(),
        createdAt: new Date().toISOString(),
      };
      setRecentGrants(prev => [log, ...prev.slice(0, 9)]);
      setStats(s => ({ ...s, recentGrants: s.recentGrants + 1 }));
      setCoins("");
      setReason("");
      setSelectedCustomer(null);
      setCustomerSearch("");
      setTimeout(() => setGrantStatus("idle"), 3000);
    } else {
      setGrantStatus("err");
    }
  };

  const fmtDate = (d?: string) => d
    ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Coins &amp; Loyalty</h1>
          <p className="text-xs text-muted-foreground">Grant reward coins to customers manually</p>
        </div>
      </div>

      <AdminPageGuide
        title="Coins & Loyalty — Grant Goins"
        description="Manually reward Gifteeng Goins to any customer. Use this for compensation, goodwill gestures, contest winners, or bulk promotions."
        steps={[
          { text: "Search for a customer by name, phone, or email in the search box." },
          { text: "Select the correct customer from the dropdown results." },
          { text: "Enter the number of Goins to grant and add a reason (shown in customer's transaction history)." },
          { text: "Click 'Grant Goins' — the customer's balance updates immediately." },
        ]}
        tips={[
          "Goins are non-refundable once granted — double-check the amount before confirming.",
          "Use the Reason field clearly (e.g. 'Order #1234 delay compensation') for audit trail.",
          "1 Goin = ₹1 discount at checkout for the customer.",
        ]}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Customers", val: stats.totalCustomers || "—", icon: Users, color: "text-blue-600" },
          { label: "Grants This Session", val: stats.recentGrants, icon: Gift, color: "text-emerald-600" },
          { label: "Coin Rate", val: "1 Coin = ₹1", icon: TrendingUp, color: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl p-3 border border-border/40">
            <div className="flex items-center gap-1.5 mb-1.5">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="text-[10px] text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className="text-base font-bold">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Grant form */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Send className="w-4 h-4 text-amber-500" /> Grant Goins to Customer
          </p>
        </div>
        <div className="p-4 space-y-4">
          {/* Customer search */}
          <div>
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Search Customer
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }}
                placeholder="Name, email or phone…"
                className="pl-8 h-9 text-sm"
              />
            </div>

            {/* Selected customer badge */}
            {selectedCustomer && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{selectedCustomer.name || selectedCustomer.email || selectedCustomer.id}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{selectedCustomer.email || selectedCustomer.id}</p>
                </div>
                <button
                  onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Customer results dropdown */}
            {!selectedCustomer && customerSearch && (
              <div className="mt-1 border border-border/40 rounded-lg overflow-hidden bg-card shadow-sm">
                {loadingCustomers ? (
                  <div className="p-4 flex justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : customers.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground text-center">No customers found</p>
                ) : customers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); setCustomers([]); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-primary">
                        {(c.name || c.email || "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{c.name || c.email || c.id}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{c.email || c.phone || c.id.slice(0, 8) + "…"}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Coins amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Coins Amount
              </Label>
              <Input
                type="number"
                min="1"
                max="10000"
                value={coins}
                onChange={e => setCoins(e.target.value)}
                placeholder="e.g. 100"
                className="h-9 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide flex items-center gap-1">
                <span className="text-muted-foreground">Reason</span>
                <span className="text-rose-500 font-black" aria-label="required">*</span>
              </Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Birthday bonus, support credit…"
                className={`h-9 text-sm mt-1 transition-colors ${
                  reason.trim() ? "" : "border-amber-400/60 focus:ring-amber-400/40"
                }`}
              />
              {!reason.trim() && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Required · shown in the customer's transaction history
                </p>
              )}
            </div>
          </div>

          {/* Quick reason chips */}
          <div className="flex flex-wrap gap-1.5">
            {["Birthday bonus", "Welcome gift", "Support credit", "Loyalty reward", "Contest winner", "Referral bonus"].map(r => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                  reason === r
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                    : "border-border/40 text-muted-foreground hover:border-amber-500/30 hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-1">
            {(() => {
              const missing: string[] = [];
              if (!selectedCustomer) missing.push("select a customer");
              if (!coins)            missing.push("enter amount");
              if (!reason.trim())    missing.push("add a reason");
              const tip = missing.length > 0
                ? `Please ${missing.join(" · ")}`
                : granting ? "Granting…" : "Grant Goins";
              return (
                <Button
                  onClick={handleGrant}
                  disabled={granting || !selectedCustomer || !coins || !reason.trim()}
                  title={tip}
                  className="gap-2"
                  style={{ background: "linear-gradient(135deg, #ec4899 0%, #f59e0b 100%)" }}
                >
                  {granting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Grant {coins ? `${coins} Goins` : "Goins"}
                </Button>
              );
            })()}
            {(!selectedCustomer || !coins || !reason.trim()) && !granting && (
              <span className="text-xs text-muted-foreground">
                {!selectedCustomer ? "Pick a customer · " : ""}
                {!coins ? "enter amount · " : ""}
                {!reason.trim() ? "add a reason" : ""}
              </span>
            )}
            {grantStatus === "ok" && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Goins granted!
              </span>
            )}
            {grantStatus === "err" && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5" /> Failed — check customer ID
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Recent grants this session */}
      {recentGrants.length > 0 && (
        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10 flex items-center justify-between">
            <p className="text-xs font-semibold">Recent Grants (this session)</p>
            <button
              onClick={() => setRecentGrants([])}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <div className="divide-y divide-border/30">
            {recentGrants.map(g => (
              <div key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{g.reason}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {g.customerId.slice(0, 12)}… · {fmtDate(g.createdAt)}
                  </p>
                </div>
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold shrink-0">
                  +{g.coins} ✦
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
        <strong>How coins work:</strong> Customers earn coins via daily spin, referrals, and purchases.
        1 coin = ₹1 discount at checkout (up to 20% of order). Manually grant coins for special occasions,
        support credits, or contest prizes above.
      </div>
    </div>
  );
}

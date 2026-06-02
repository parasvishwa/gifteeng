"use client";

import { useState, useRef } from "react";
import {
  Sparkles, Search, Loader2, CheckCircle2, AlertCircle,
  User, Phone, Coins, History, X,
} from "lucide-react";
import { Button, Input, Label, Badge } from "@gifteeng/ui";
import AdminPageGuide from "../_components/AdminPageGuide";
import { ADMIN_API_BASE, adminAuthHeaders } from "@/lib/admin-api";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomerResult {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  coinBalance?: number;
  isFrozen?: boolean;
}

interface GrantLog {
  id: string;
  customerId: string;
  customerName: string;
  phone: string;
  coins: number;
  reason: string;
  notes: string;
  adminLabel: string;
  ts: string;
  balanceBefore: number;
  balanceAfter: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REASONS = [
  "Goodwill gesture",
  "Compensation for issue",
  "Campaign reward",
  "Correction",
  "Other",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; status?: number }> {
  try {
    const r = await fetch(`${ADMIN_API_BASE}/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...adminAuthHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    const text = await r.text();
    const data = text ? (JSON.parse(text) as T) : null;
    return { ok: r.ok, data, status: r.status };
  } catch {
    return { ok: false, data: null };
  }
}

function fmt(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminCoins() {
  // Search
  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [customer, setCustomer] = useState<CustomerResult | null>(null);

  // Grant form
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantStatus, setGrantStatus] = useState<"idle" | "ok" | "err">("idle");
  const [grantError, setGrantError] = useState("");

  // History (session-based)
  const [history, setHistory] = useState<GrantLog[]>([]);

  const amountRef = useRef<HTMLInputElement>(null);

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const q = phone.trim();
    if (!q) return;
    setSearching(true);
    setSearchError("");
    setCustomer(null);
    setGrantStatus("idle");

    // 1. Find customer by phone
    const res = await apiFetch<{ items: CustomerResult[]; total: number }>(
      `/customers?search=${encodeURIComponent(q)}&pageSize=5`
    );

    if (!res.ok || !res.data) {
      setSearchError("Failed to search. Check your connection.");
      setSearching(false);
      return;
    }

    const match = res.data.items.find(
      (c) => c.phone === q || c.phone === `+91${q}` || c.phone?.replace(/\D/g, "").endsWith(q.replace(/\D/g, ""))
    ) ?? res.data.items[0];

    if (!match) {
      setSearchError(`No customer found for "${q}".`);
      setSearching(false);
      return;
    }

    // 2. Get full details (includes coinBalance)
    const detail = await apiFetch<CustomerResult>(`/customers/${match.id}`);
    const full: CustomerResult = detail.ok && detail.data
      ? { ...match, coinBalance: (detail.data as any).coinBalance ?? 0, isFrozen: (detail.data as any).isFrozen }
      : { ...match, coinBalance: 0 };

    setCustomer(full);
    setSearching(false);
    setTimeout(() => amountRef.current?.focus(), 100);
  };

  // ── Grant ─────────────────────────────────────────────────────────────────

  const handleGrant = async () => {
    if (!customer || !amount || !reason) return;
    const coins = parseInt(amount, 10);
    if (isNaN(coins) || coins === 0) return;

    setGranting(true);
    setGrantStatus("idle");
    setGrantError("");

    const balanceBefore = customer.coinBalance ?? 0;

    const res = await apiFetch("/coins/admin/grant", {
      method: "POST",
      body: JSON.stringify({
        customerId: customer.id,
        coins: Math.abs(coins), // API only accepts positive
        reason: notes.trim() ? `${reason} — ${notes.trim()}` : reason,
      }),
    });

    setGranting(false);

    if (res.ok) {
      const balanceAfter = balanceBefore + coins;
      const log: GrantLog = {
        id: `${Date.now()}`,
        customerId: customer.id,
        customerName: customer.fullName ?? customer.phone ?? customer.id,
        phone: customer.phone ?? "",
        coins,
        reason,
        notes: notes.trim(),
        adminLabel: "You",
        ts: new Date().toISOString(),
        balanceBefore,
        balanceAfter,
      };
      setHistory((prev) => [log, ...prev.slice(0, 19)]);
      setCustomer((c) => c ? { ...c, coinBalance: balanceAfter } : c);
      setGrantStatus("ok");
      setAmount("");
      setNotes("");
      setTimeout(() => setGrantStatus("idle"), 4000);
    } else {
      setGrantStatus("err");
      setGrantError(
        res.status === 403 ? "Permission denied." :
        res.status === 404 ? "Customer not found in coins system." :
        "Grant failed. Try again."
      );
    }
  };

  const coins = parseInt(amount, 10);
  const isValid = !!customer && !!amount && !isNaN(coins) && coins !== 0;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Coin Management</h1>
          <p className="text-xs text-muted-foreground">Manually grant or deduct Goins from customer accounts</p>
        </div>
      </div>

      <AdminPageGuide
        title="Coin Management"
        description="Search a customer by phone number, review their current balance, then grant or deduct Goins. All actions are logged in the session history below."
        steps={[
          { text: "Enter the customer's phone number and click Find Customer." },
          { text: "Confirm the customer details and current balance shown." },
          { text: "Enter a positive amount to grant, negative to deduct. Pick a reason." },
          { text: "Click Grant Coins — balance updates immediately." },
        ]}
        tips={[
          "100 Goins = ₹1 discount at checkout (up to 20% of order value).",
          "Always add a clear reason — it appears in the customer's transaction history.",
          "Deductions require entering a negative number (e.g. -200).",
        ]}
      />

      {/* ── Search section ── */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" /> Find Customer
          </p>
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Phone number (e.g. 9876543210)"
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={searching || !phone.trim()}
              className="h-9 px-4 gap-2 text-sm"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {searching ? "Searching…" : "Find Customer"}
            </Button>
          </div>

          {searchError && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {searchError}
            </p>
          )}

          {/* Customer card */}
          {customer && (
            <div className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{customer.fullName ?? "—"}</p>
                  {customer.isFrozen && (
                    <Badge className="bg-red-100 text-red-600 border-red-200 text-[10px]">Frozen</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{customer.phone} {customer.email ? `· ${customer.email}` : ""}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{customer.id}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Current Balance</p>
                <p className="text-xl font-bold text-amber-600">
                  {(customer.coinBalance ?? 0).toLocaleString("en-IN")}
                  <span className="text-sm font-normal ml-1">Goins</span>
                </p>
              </div>
              <button
                onClick={() => { setCustomer(null); setPhone(""); setGrantStatus("idle"); }}
                className="text-muted-foreground hover:text-foreground ml-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Grant / Deduct form ── */}
      {customer && (
        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/30 bg-muted/10">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500" /> Grant / Deduct Goins
            </p>
          </div>
          <div className="p-4 space-y-4">

            <div className="grid grid-cols-2 gap-3">
              {/* Amount */}
              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Amount <span className="text-muted-foreground/60 normal-case">(+ grant, − deduct)</span>
                </Label>
                <Input
                  ref={amountRef}
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 200 or -100"
                  className="h-9 text-sm mt-1"
                />
                {amount && !isNaN(parseInt(amount)) && parseInt(amount) !== 0 && (
                  <p className={`text-[10px] mt-1 font-medium ${parseInt(amount) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {parseInt(amount) > 0
                      ? `+${parseInt(amount)} Goins → balance will be ${((customer.coinBalance ?? 0) + parseInt(amount)).toLocaleString("en-IN")}`
                      : `${parseInt(amount)} Goins → balance will be ${((customer.coinBalance ?? 0) + parseInt(amount)).toLocaleString("en-IN")}`
                    }
                  </p>
                )}
              </div>

              {/* Reason dropdown */}
              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  Reason <span className="text-rose-500 font-black">*</span>
                </Label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Notes <span className="text-muted-foreground/50 normal-case">(optional — shown in transaction history)</span>
              </Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Order #1234 delay compensation"
                className="h-9 text-sm mt-1"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={handleGrant}
                disabled={granting || !isValid}
                className="gap-2"
                style={isValid ? { background: "linear-gradient(135deg, #ec4899 0%, #f59e0b 100%)" } : undefined}
              >
                {granting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Sparkles className="w-4 h-4" />
                }
                {granting
                  ? "Processing…"
                  : amount && !isNaN(parseInt(amount)) && parseInt(amount) < 0
                    ? `Deduct ${Math.abs(parseInt(amount))} Goins`
                    : amount && !isNaN(parseInt(amount)) && parseInt(amount) > 0
                      ? `Grant ${parseInt(amount)} Goins`
                      : "Grant Coins"
                }
              </Button>

              {grantStatus === "ok" && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Done! Balance updated.
                </span>
              )}
              {grantStatus === "err" && (
                <span className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" /> {grantError}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── History table ── */}
      {history.length > 0 && (
        <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10 flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              Admin Coin Transactions — This Session
            </p>
            <button
              onClick={() => setHistory([])}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30 bg-muted/5">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Reason</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Admin</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/5 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{fmt(h.ts)}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{h.customerName}</p>
                      <p className="text-[10px] text-muted-foreground">{h.phone}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap">
                      <span className={h.coins > 0 ? "text-emerald-600" : "text-red-500"}>
                        {h.coins > 0 ? `+${h.coins}` : h.coins} ✦
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{h.reason}</p>
                      {h.notes && <p className="text-[10px] text-muted-foreground">{h.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{h.adminLabel}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">
                      {h.balanceAfter.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info footer */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
        <strong>How Goins work:</strong> Customers earn Goins via daily spin, referrals, and purchases.
        100 Goins = ₹1 discount at checkout (up to 20% of order value). Use this page to grant or correct balances for support cases.
      </div>
    </div>
  );
}

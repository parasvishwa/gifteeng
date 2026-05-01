"use client";

/**
 * Fraud Watch — Goin economy audit (Deploy 117).
 *
 * Lists the top Goin earners across a selectable window (1 / 7 / 30 / 90
 * days). Flags accounts that look like farms (huge spin or scratch totals,
 * very new account, dominant single earn type) and lets an admin freeze
 * with a reason, or unfreeze when cleared.
 *
 * Backed by:
 *   GET  /api/coins/admin/audit/top-earners?days=N&limit=N
 *   POST /api/coins/admin/freeze    { customerId, reason }
 *   POST /api/coins/admin/unfreeze  { customerId }
 */

import { useState, useEffect, useMemo } from "react";
import {
  ShieldAlert, Snowflake, ThumbsUp, Loader2, Search, RefreshCw,
  AlertTriangle, Flame,
} from "lucide-react";
import {
  Button, Input, Label, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeGet, safePost } from "@/lib/admin-api";

type EarnBreakdown = Record<string, number>;

interface EarnerRow {
  customerId: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  currentBalance: number;
  earnedInWindow: number;
  earnedInWindowInr: number;
  transactionsInWindow: number;
  breakdownByType: EarnBreakdown;
  isFrozen: boolean;
  frozenAt: string | null;
  frozenReason: string | null;
  accountCreatedAt: string | null;
  lastLoginAt: string | null;
  windowDays: number;
}

/**
 * Lightweight rules-of-thumb for flagging suspicious accounts. These are
 * hints, not verdicts — an admin still has to eyeball and decide. Order
 * matters because the first rule that matches is what the UI surfaces.
 */
function suspicionFlags(row: EarnerRow): string[] {
  const flags: string[] = [];
  const total = row.earnedInWindow;
  const days = row.windowDays;
  // Rule 1: new account earning a lot, fast.
  if (row.accountCreatedAt) {
    const ageDays = (Date.now() - new Date(row.accountCreatedAt).getTime()) / 86_400_000;
    if (ageDays < 7 && total > 5000) flags.push("🆕 < 1 week old");
  }
  // Rule 2: velocity — >1000 G/day sustained.
  if (total / Math.max(days, 1) > 1000) flags.push("⚡ High velocity");
  // Rule 3: dominant single earn type (e.g. 90%+ from scratch cards).
  const typeTotals = Object.values(row.breakdownByType).filter((v) => v > 0);
  const max = typeTotals.length ? Math.max(...typeTotals) : 0;
  if (total > 3000 && max / total > 0.9) {
    const dominantType = Object.entries(row.breakdownByType).find(([, v]) => v === max)?.[0];
    flags.push(`🎯 ${Math.round((max / total) * 100)}% from ${dominantType}`);
  }
  // Rule 4: many txns for a small total → spamming.
  if (row.transactionsInWindow > 50 && total < 1000) flags.push("🔁 Low-value spam");
  return flags;
}

export default function FraudWatchPage() {
  const [rows, setRows] = useState<EarnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");

  const [freezeTarget, setFreezeTarget] = useState<EarnerRow | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    const data = await safeGet<EarnerRow[]>(`/coins/admin/audit/top-earners?days=${days}&limit=100`, []);
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };
  useEffect(() => { fetchRows(); /* eslint-disable-next-line */ }, [days]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").toLowerCase().includes(q) ||
      (r.fullName ?? "").toLowerCase().includes(q) ||
      r.customerId.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalsInr = useMemo(
    () => rows.reduce((sum, r) => sum + r.earnedInWindowInr, 0),
    [rows],
  );
  const frozenCount = useMemo(() => rows.filter((r) => r.isFrozen).length, [rows]);

  const handleFreezeConfirm = async () => {
    if (!freezeTarget) return;
    const reason = freezeReason.trim();
    if (reason.length < 3) return;
    setActionBusy(true);
    const res = await safePost<{ ok: boolean }>("/coins/admin/freeze", {
      customerId: freezeTarget.customerId,
      reason,
    }, { ok: false });
    setActionBusy(false);
    if (res?.ok) {
      setToast(`Frozen: ${freezeTarget.email ?? freezeTarget.phone ?? freezeTarget.customerId.slice(0, 8)}`);
      setFreezeTarget(null);
      setFreezeReason("");
      fetchRows();
    } else {
      setToast("Freeze failed — check permissions");
    }
    setTimeout(() => setToast(null), 3500);
  };

  const handleUnfreeze = async (row: EarnerRow) => {
    if (!confirm(`Unfreeze ${row.email ?? row.phone ?? "this account"}? They'll earn & redeem Goins again.`)) return;
    setActionBusy(true);
    const res = await safePost<{ ok: boolean }>("/coins/admin/unfreeze", { customerId: row.customerId }, { ok: false });
    setActionBusy(false);
    if (res?.ok) {
      setToast(`Unfrozen: ${row.email ?? row.phone ?? row.customerId.slice(0, 8)}`);
      fetchRows();
    } else {
      setToast("Unfreeze failed");
    }
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="max-w-6xl space-y-5">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-pink-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-display font-bold tracking-tight">
          <ShieldAlert className="w-6 h-6 text-rose-500" /> Fraud Watch
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Top Goin earners + freeze suspicious accounts. Frozen users can still log in and browse, but stop earning / redeeming.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/40 bg-card p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Earners ({days}d)</div>
          <div className="mt-0.5 text-2xl font-bold">{rows.length}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">₹ Earned ({days}d)</div>
          <div className="mt-0.5 text-2xl font-bold">₹{totalsInr.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Currently Frozen</div>
          <div className="mt-0.5 text-2xl font-bold text-rose-500">{frozenCount}</div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Flagged (heuristic)</div>
          <div className="mt-0.5 text-2xl font-bold text-amber-500">
            {rows.filter((r) => suspicionFlags(r).length > 0).length}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card p-2">
        <div className="flex items-center gap-1 px-1">
          {[1, 7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {d === 1 ? "24h" : `${d}d`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by email, phone, name, or ID…"
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card py-12 text-center text-sm text-muted-foreground">
          No earn activity in this window.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
          <table className="w-full">
            <thead className="border-b border-border/30 bg-muted/20">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Earned ({days}d)</th>
                <th className="px-3 py-2">Breakdown</th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2">Balance</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.map((r) => {
                const flags = suspicionFlags(r);
                return (
                  <tr key={r.customerId} className={r.isFrozen ? "bg-rose-50/30 dark:bg-rose-950/10" : "hover:bg-muted/10"}>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-fuchsia-500 text-[10px] font-bold text-white">
                          {(r.email ?? r.fullName ?? "?")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold truncate max-w-[200px]">
                            {r.fullName ?? r.email ?? r.phone ?? r.customerId.slice(0, 10)}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                            {r.email ?? r.phone ?? r.customerId.slice(0, 18) + "…"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-sm font-bold">{r.earnedInWindow.toLocaleString("en-IN")} G</div>
                      <div className="text-[10px] text-muted-foreground">₹{r.earnedInWindowInr.toFixed(2)} · {r.transactionsInWindow} txns</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(r.breakdownByType)
                          .filter(([, v]) => v > 0)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 4)
                          .map(([type, amt]) => (
                            <span key={type} className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                              {type.replace(/_/g, " ")} · {amt}G
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {flags.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {flags.map((f) => (
                            <span key={f} className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                              <Flame className="w-2.5 h-2.5" /> {f}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="text-sm font-semibold">{r.currentBalance.toLocaleString("en-IN")}</div>
                      <div className="text-[10px] text-muted-foreground">redeemable</div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      {r.isFrozen ? (
                        <div className="flex flex-col items-end gap-1">
                          <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30 border text-[9px] font-bold">
                            <Snowflake className="w-2.5 h-2.5 mr-0.5" /> FROZEN
                          </Badge>
                          {r.frozenReason && (
                            <span className="text-[9px] text-muted-foreground max-w-[180px] truncate" title={r.frozenReason}>
                              {r.frozenReason}
                            </span>
                          )}
                          <button
                            onClick={() => handleUnfreeze(r)}
                            disabled={actionBusy}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 text-[10px] font-bold px-2 py-1 transition-colors"
                          >
                            <ThumbsUp className="w-3 h-3" /> Unfreeze
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setFreezeTarget(r); setFreezeReason(""); }}
                          disabled={actionBusy}
                          className={`inline-flex items-center gap-1 rounded-md text-[10px] font-bold px-2 py-1 transition-colors ${
                            flags.length > 0
                              ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-600"
                              : "bg-muted hover:bg-muted/80 text-muted-foreground"
                          }`}
                        >
                          <Snowflake className="w-3 h-3" /> Freeze
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Freeze dialog */}
      <Dialog open={!!freezeTarget} onOpenChange={(v) => { if (!v) { setFreezeTarget(null); setFreezeReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              Freeze this account?
            </DialogTitle>
          </DialogHeader>
          {freezeTarget && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="font-semibold">{freezeTarget.fullName ?? freezeTarget.email ?? freezeTarget.phone}</div>
                <div className="text-[11px] text-muted-foreground">
                  {freezeTarget.earnedInWindow.toLocaleString("en-IN")} G earned in the last {days}d ·
                  {" "}{freezeTarget.transactionsInWindow} transactions ·
                  {" "}balance {freezeTarget.currentBalance}
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason (visible in txn history) *</Label>
                <Input
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  placeholder="e.g. Suspicious scratch-card velocity, multi-account rings"
                  maxLength={280}
                  className="mt-1"
                  autoFocus
                />
                <div className="mt-1 text-[10px] text-muted-foreground/60">{freezeReason.length}/280</div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Frozen accounts can still sign in, place orders and browse. They simply cannot earn new Goins or apply them for a discount until unfrozen.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setFreezeTarget(null); setFreezeReason(""); }}
              disabled={actionBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFreezeConfirm}
              disabled={actionBusy || freezeReason.trim().length < 3}
              className="gap-1.5 bg-rose-500 hover:bg-rose-600"
            >
              {actionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Snowflake className="w-3.5 h-3.5" />}
              Freeze account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

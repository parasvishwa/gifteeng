"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Wallet, Loader2, CheckCircle2, Clock, Search,
  IndianRupee, AlertCircle, Play, CreditCard,
} from "lucide-react";
import { safeGet, safePatch, adminToast } from "@/lib/admin-api";

type PayoutStatus = "pending" | "eligible" | "processing" | "paid" | "cancelled";

interface Payout {
  id: string;
  status: PayoutStatus;
  grossAmount: string;
  commissionRate: string;
  commissionAmount: string;
  netAmount: string;
  paymentRef: string | null;
  paidAt: string | null;
  createdAt: string;
  seller: {
    brandName: string;
    city: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
  };
  _count: { items: number };
}

const STATUS_META: Record<PayoutStatus, { label: string; cls: string }> = {
  pending:    { label: "Pending",      cls: "text-gray-500 bg-gray-100 border-gray-200" },
  eligible:   { label: "Eligible",     cls: "text-blue-700 bg-blue-100 border-blue-200" },
  processing: { label: "Transferring", cls: "text-amber-700 bg-amber-100 border-amber-200" },
  paid:       { label: "Paid",         cls: "text-emerald-700 bg-emerald-100 border-emerald-200" },
  cancelled:  { label: "Cancelled",    cls: "text-red-600 bg-red-100 border-red-200" },
};

const TABS: { key: PayoutStatus | ""; label: string }[] = [
  { key: "",           label: "All" },
  { key: "eligible",   label: "Eligible" },
  { key: "processing", label: "Transferring" },
  { key: "paid",       label: "Paid" },
];

function inr(v: string | number) {
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminPayouts() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<PayoutStatus | "">("");
  const [search, setSearch]   = useState("");
  const [busy, setBusy]       = useState<string | null>(null);
  const [modal, setModal]     = useState<{ id: string; net: string } | null>(null);
  const [payRef, setPayRef]   = useState("");

  useEffect(() => { load(); }, [tab]);

  async function load() {
    setLoading(true);
    const qs   = tab ? `?status=${tab}` : "";
    const data = await safeGet<Payout[]>(`/admin/payouts${qs}`, []);
    setPayouts(data ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return payouts;
    const q = search.toLowerCase();
    return payouts.filter((p) =>
      p.seller.brandName.toLowerCase().includes(q) ||
      (p.paymentRef ?? "").toLowerCase().includes(q),
    );
  }, [payouts, search]);

  async function markProcessing(id: string) {
    setBusy(id);
    await safePatch(`/admin/payouts/${id}/mark-processing`, {}, null);
    adminToast.info("Marked as transferring");
    await load();
    setBusy(null);
  }

  async function markPaid() {
    if (!modal) return;
    setBusy(modal.id);
    await safePatch(`/admin/payouts/${modal.id}/mark-paid`, { paymentRef: payRef || undefined }, null);
    adminToast.success("Payout marked as paid");
    setModal(null); setPayRef("");
    await load();
    setBusy(null);
  }

  async function triggerCron() {
    setBusy("cron");
    await safePatch("/admin/payouts/trigger", {}, null);
    adminToast.info("Payout batch processing triggered");
    await load();
    setBusy(null);
  }

  // Summary totals for eligible
  const eligibleTotal = payouts
    .filter((p) => p.status === "eligible")
    .reduce((s, p) => s + Number(p.netAmount), 0);

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Seller Payouts</h1>
        </div>
        <div className="flex items-center gap-2">
          {eligibleTotal > 0 && (
            <span className="text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
              ₹{inr(eligibleTotal)} eligible to pay
            </span>
          )}
          <button
            onClick={triggerCron}
            disabled={busy === "cron"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50"
          >
            {busy === "cron" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run payout batch
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by seller name or payment ref…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground text-sm">No payouts found</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Seller</th>
                <th className="px-4 py-3 text-left">Bank details</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-right">Fee</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => {
                const meta = STATUS_META[p.status];
                const hasBankDetails = p.seller.bankAccountNumber && p.seller.bankIfsc;

                return (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{p.seller.brandName}</p>
                      <p className="text-xs text-muted-foreground">{p.seller.city ?? "—"} · {p._count.items} item{p._count.items !== 1 ? "s" : ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      {hasBankDetails ? (
                        <>
                          <p className="text-xs font-mono">{p.seller.bankAccountNumber}</p>
                          <p className="text-xs text-muted-foreground">{p.seller.bankIfsc}</p>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle className="w-3 h-3" /> Missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">₹{inr(p.grossAmount)}</td>
                    <td className="px-4 py-3 text-right text-red-500 text-xs">−₹{inr(p.commissionAmount)}</td>
                    <td className="px-4 py-3 text-right font-black">₹{inr(p.netAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.cls}`}>
                        {p.status === "paid" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {meta.label}
                      </span>
                      {p.paidAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(p.paidAt)}</p>
                      )}
                      {p.paymentRef && (
                        <p className="text-xs text-muted-foreground font-mono">{p.paymentRef}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {p.status === "eligible" && (
                          <button
                            onClick={() => markProcessing(p.id)}
                            disabled={busy === p.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          >
                            {busy === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <IndianRupee className="w-3 h-3" />}
                            Transfer
                          </button>
                        )}
                        {p.status === "processing" && (
                          <button
                            onClick={() => { setModal({ id: p.id, net: p.netAmount }); setPayRef(""); }}
                            disabled={busy === p.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <CreditCard className="w-3 h-3" />
                            Mark paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark paid modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="font-bold text-base">Confirm payment</h2>
            <p className="text-sm text-muted-foreground">
              Marking ₹{inr(modal.net)} as paid. Enter the bank transfer reference (UTR / NEFT ref).
            </p>
            <input
              type="text"
              placeholder="Payment reference (UTR / NEFT)"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2 rounded-lg border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={markPaid}
                disabled={busy === modal.id}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {busy === modal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm paid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

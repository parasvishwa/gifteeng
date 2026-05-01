"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders, getApiBase, safeGet, safePost } from "@/lib/admin-api";

type Company = { id: string; name: string };

type Wallet = {
  id?: string;
  walletId?: string;
  companyId: string;
  companyName?: string;
  balance: number;
  locked?: number;
  available?: number;
  lastTopUpAt?: string | null;
  lastDebitAt?: string | null;
  debited30d?: number;
};

type Transaction = {
  id: string;
  type?: string;
  amount?: number;
  notes?: string;
  reference?: string;
  createdAt?: string;
  description?: string;
};

function inr(n?: number | null): string {
  return (n ?? 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function SuperAdminWalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Top-up dialog
  const [showTopUp, setShowTopUp] = useState<boolean>(false);
  const [topUpPreset, setTopUpPreset] = useState<Wallet | null>(null);

  // Transaction panel
  const [txPanelFor, setTxPanelFor] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch companies list for the top-up dropdown
      const cmpRaw = await safeGet<Company[] | { data?: Company[] }>("/companies", []);
      const cmpList: Company[] = Array.isArray(cmpRaw) ? cmpRaw : (cmpRaw.data ?? []);
      setCompanies(cmpList);

      // Try platform-staff endpoint first
      const bulk = await safeGet<Wallet[] | { data?: Wallet[] }>(
        "/admin/wallets/all",
        [],
      );
      const bulkList: Wallet[] = Array.isArray(bulk) ? bulk : (bulk.data ?? []);
      if (bulkList.length > 0) {
        // Enrich with company names where missing
        const byId = new Map(cmpList.map((c) => [c.id, c.name] as const));
        setWallets(
          bulkList.map((w) => ({
            ...w,
            companyName: w.companyName ?? byId.get(w.companyId) ?? w.companyId,
          })),
        );
        setLoading(false);
        return;
      }

      // Fallback: per-company fetch
      const out: Wallet[] = [];
      await Promise.all(
        cmpList.map(async (c) => {
          const w = await safeGet<Wallet | null>(
            `/wallet/company?companyId=${c.id}`,
            null,
          );
          if (w) {
            out.push({
              ...w,
              companyId: c.id,
              companyName: c.name,
              balance: w.balance ?? 0,
            });
          }
        }),
      );
      setWallets(out);
    } catch {
      setError("Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openTxPanel(w: Wallet) {
    if (txPanelFor?.companyId === w.companyId) {
      setTxPanelFor(null);
      setTransactions([]);
      return;
    }
    setTxPanelFor(w);
    setTxLoading(true);
    setTransactions([]);
    const res = await safeGet<Transaction[] | { data?: Transaction[] }>(
      `/wallet/company/transactions?companyId=${w.companyId}`,
      [],
    );
    const list: Transaction[] = Array.isArray(res) ? res : (res.data ?? []);
    setTransactions(list);
    setTxLoading(false);
  }

  function handleTopUpClick(w?: Wallet) {
    setTopUpPreset(w ?? null);
    setShowTopUp(true);
  }

  const metrics = useMemo(() => {
    const totalBalance = wallets.reduce((acc, w) => acc + (w.balance ?? 0), 0);
    const totalLocked = wallets.reduce((acc, w) => acc + (w.locked ?? 0), 0);
    const totalDebited30 = wallets.reduce((acc, w) => acc + (w.debited30d ?? 0), 0);
    const top = [...wallets].sort(
      (a, b) => (b.debited30d ?? 0) - (a.debited30d ?? 0),
    )[0];
    return {
      totalBalance,
      totalLocked,
      totalDebited30,
      topName: top?.companyName ?? "--",
      topAmount: top?.debited30d ?? 0,
    };
  }, [wallets]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Wallets</h1>
          <p className="text-sm text-muted-foreground">
            All company wallets and recent activity.
          </p>
        </div>
        <button
          onClick={() => handleTopUpClick()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Top up wallet
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total balance" value={inr(metrics.totalBalance)} />
        <MetricCard label="Total locked" value={inr(metrics.totalLocked)} />
        <MetricCard label="Debited (30d)" value={inr(metrics.totalDebited30)} />
        <MetricCard
          label="Top spender"
          value={metrics.topName}
          hint={inr(metrics.topAmount)}
        />
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Company</th>
              <th className="px-4 py-2 text-right">Balance</th>
              <th className="px-4 py-2 text-right">Locked</th>
              <th className="px-4 py-2 text-right">Available</th>
              <th className="px-4 py-2 text-left">Last top-up</th>
              <th className="px-4 py-2 text-left">Last debit</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : wallets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No wallets to show.
                </td>
              </tr>
            ) : (
              wallets.map((w) => {
                const available = w.available ?? (w.balance ?? 0) - (w.locked ?? 0);
                const isExpanded = txPanelFor?.companyId === w.companyId;
                return (
                  <>
                    <tr
                      key={w.companyId}
                      className={`border-t cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-muted/20" : ""}`}
                      onClick={() => openTxPanel(w)}
                    >
                      <td className="px-4 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{w.companyName ?? "--"}</span>
                          <span className="text-xs text-muted-foreground">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">{inr(w.balance)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {inr(w.locked)}
                      </td>
                      <td className="px-4 py-2 text-right">{inr(available)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {w.lastTopUpAt
                          ? new Date(w.lastTopUpAt).toLocaleDateString()
                          : "--"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {w.lastDebitAt
                          ? new Date(w.lastDebitAt).toLocaleDateString()
                          : "--"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openTxPanel(w)}
                            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                          >
                            {isExpanded ? "Hide" : "Transactions"}
                          </button>
                          <button
                            onClick={() => handleTopUpClick(w)}
                            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                          >
                            Top up
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${w.companyId}-tx`} className="border-t bg-muted/10">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold">
                              Transaction History — {w.companyName}
                            </h3>
                            {txLoading ? (
                              <p className="text-xs text-muted-foreground">Loading transactions...</p>
                            ) : transactions.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No transactions found.</p>
                            ) : (
                              <div className="overflow-hidden rounded-md border max-h-72 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/50 sticky top-0">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left">Date</th>
                                      <th className="px-3 py-1.5 text-left">Type</th>
                                      <th className="px-3 py-1.5 text-right">Amount</th>
                                      <th className="px-3 py-1.5 text-left">Notes / Ref</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {transactions.map((tx) => (
                                      <tr key={tx.id} className="border-t hover:bg-muted/30">
                                        <td className="px-3 py-1.5 text-muted-foreground">
                                          {tx.createdAt
                                            ? new Date(tx.createdAt).toLocaleDateString()
                                            : "--"}
                                        </td>
                                        <td className="px-3 py-1.5 uppercase">
                                          {tx.type ?? "--"}
                                        </td>
                                        <td
                                          className={`px-3 py-1.5 text-right font-medium ${
                                            (tx.amount ?? 0) < 0
                                              ? "text-red-600"
                                              : "text-green-600"
                                          }`}
                                        >
                                          {inr(tx.amount)}
                                        </td>
                                        <td className="px-3 py-1.5 text-muted-foreground">
                                          {tx.notes ?? tx.reference ?? tx.description ?? "--"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showTopUp && (
        <TopUpDialog
          companies={companies}
          wallets={wallets}
          preset={topUpPreset}
          onClose={() => { setShowTopUp(false); setTopUpPreset(null); }}
          onDone={(updatedCompanyId, newBalance) => {
            setShowTopUp(false);
            setTopUpPreset(null);
            // Update the balance in-place without full reload
            if (updatedCompanyId && newBalance != null) {
              setWallets((prev) =>
                prev.map((w) =>
                  w.companyId === updatedCompanyId
                    ? { ...w, balance: newBalance, lastTopUpAt: new Date().toISOString() }
                    : w,
                ),
              );
            } else {
              load();
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Top Up Dialog ────────────────────────────────────────────────────────────

function TopUpDialog({
  companies,
  wallets,
  preset,
  onClose,
  onDone,
}: {
  companies: Company[];
  wallets: Wallet[];
  preset: Wallet | null;
  onClose: () => void;
  onDone: (companyId: string | null, newBalance: number | null) => void;
}) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    preset?.companyId ?? (companies[0]?.id ?? ""),
  );
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWallet = wallets.find((w) => w.companyId === selectedCompanyId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid amount");
      setSaving(false);
      return;
    }
    if (!selectedCompanyId) {
      setError("Select a company");
      setSaving(false);
      return;
    }
    const res = await safePost<{ id?: string; balance?: number; newBalance?: number } | null>(
      "/wallet/topup",
      {
        companyId: selectedCompanyId,
        amount: n,
        notes,
      },
      null,
    );
    setSaving(false);
    if (!res) {
      setError("Top-up failed");
      return;
    }
    const newBalance = res.newBalance ?? res.balance ?? null;
    onDone(selectedCompanyId, newBalance);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Top up wallet</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Company *
            </span>
            <select
              required
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            >
              <option value="">— Select company —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {selectedWallet && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <span className="font-medium">Current balance:</span>{" "}
              {inr(selectedWallet.balance)}
              {selectedWallet.walletId || selectedWallet.id ? (
                <span className="ml-2 text-muted-foreground">
                  Wallet ID: {selectedWallet.walletId ?? selectedWallet.id}
                </span>
              ) : null}
            </div>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Amount (INR) *
            </span>
            <input
              required
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Notes / Reference
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="UTR / invoice number / reason"
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Processing..." : "Top up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, Plus, X } from "lucide-react";
import { apiB2b } from "../../../../../lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AmazonAccount = {
  id: string;
  name: string;
  marketplace: string;
  sellerId: string;
  clientId: string;
  isActive: boolean;
  createdAt?: string;
};

type FormState = {
  name: string;
  marketplace: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  sellerId: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  marketplace: "in",
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  sellerId: "",
  isActive: true,
};

const MARKETPLACE_OPTIONS: { value: string; label: string }[] = [
  { value: "in", label: "India (amazon.in)" },
  { value: "com", label: "USA (amazon.com)" },
  { value: "co.uk", label: "UK (amazon.co.uk)" },
  { value: "de", label: "Germany (amazon.de)" },
  { value: "co.jp", label: "Japan (amazon.co.jp)" },
  { value: "com.au", label: "Australia (amazon.com.au)" },
  { value: "ca", label: "Canada (amazon.ca)" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function marketplaceLabel(value: string): string {
  return MARKETPLACE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function marketplaceDomain(value: string): string {
  return `amazon.${value}`;
}

// ---------------------------------------------------------------------------
// Account Card
// ---------------------------------------------------------------------------

function AccountCard({
  account,
  onRemove,
  removing,
}: {
  account: AmazonAccount;
  onRemove: (id: string) => void;
  removing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900">{account.name}</span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {marketplaceDomain(account.marketplace)}
          </span>
          {account.isActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400 inline-block" />
              Inactive
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Seller ID:{" "}
          <span className="font-mono text-gray-700">
            {account.sellerId}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          Client ID:{" "}
          <span className="font-mono">
            {account.clientId.length > 30
              ? `${account.clientId.slice(0, 30)}…`
              : account.clientId}
          </span>
        </p>
      </div>

      <div className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Remove?</span>
            <button
              onClick={() => onRemove(account.id)}
              disabled={removing}
              className="rounded px-2.5 py-1 text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {removing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Yes, remove"
              )}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded px-2.5 py-1 text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="rounded px-3 py-1.5 text-xs font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Account Form
// ---------------------------------------------------------------------------

function AddAccountForm({
  onSuccess,
  onCancel,
  client,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  client: ReturnType<typeof apiB2b>;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await client.post("/api/amazon-sp/accounts", form);
      onSuccess();
    } catch (err) {
      const e = err as { body?: { message?: string }; message?: string };
      setError(
        e.body?.message ?? e.message ?? "Failed to save account"
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-shadow";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const helpClass = "mt-1 text-xs text-gray-500";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-6 space-y-5"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-gray-900">
          Add Amazon SP-API Account
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Account name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="My India Store"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Marketplace</label>
          <select
            value={form.marketplace}
            onChange={(e) => update("marketplace", e.target.value)}
            required
            className={inputClass}
          >
            {MARKETPLACE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2 */}
      <div>
        <label className={labelClass}>Client ID</label>
        <input
          type="text"
          value={form.clientId}
          onChange={(e) => update("clientId", e.target.value)}
          placeholder="amzn1.application-oa2-client.xxx"
          required
          className={inputClass}
        />
      </div>

      {/* Row 3 */}
      <div>
        <label className={labelClass}>Client Secret</label>
        <input
          type="password"
          value={form.clientSecret}
          onChange={(e) => update("clientSecret", e.target.value)}
          required
          className={inputClass}
        />
      </div>

      {/* Row 4 */}
      <div>
        <label className={labelClass}>Refresh Token (Atzr|…)</label>
        <input
          type="password"
          value={form.refreshToken}
          onChange={(e) => update("refreshToken", e.target.value)}
          required
          className={inputClass}
        />
        <p className={helpClass}>
          Get this by authorizing your app in Seller Central → Apps → Manage
          Your Apps.
        </p>
      </div>

      {/* Row 5 */}
      <div>
        <label className={labelClass}>Seller ID / Merchant Token</label>
        <input
          type="text"
          value={form.sellerId}
          onChange={(e) => update("sellerId", e.target.value)}
          placeholder="A1XXXXX"
          required
          className={inputClass}
        />
        <p className={helpClass}>
          Found in Seller Central → Account Info → Business Information.
        </p>
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={form.isActive}
          onChange={(e) => update("isActive", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
        />
        <label htmlFor="isActive" className="text-sm text-gray-700">
          Active (enable syncing for this account)
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save Account"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AmazonConnectPage() {
  const client = useMemo(() => apiB2b(), []);

  const [accounts, setAccounts] = useState<AmazonAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function fetchAccounts() {
    setLoading(true);
    setError(null);
    try {
      const data = await client.get<AmazonAccount[]>("/api/amazon-sp/accounts");
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      const e = err as { body?: { message?: string }; message?: string };
      setError(e.body?.message ?? e.message ?? "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      await client.delete(`/api/amazon-sp/accounts/${id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      showFlash("Account removed.");
    } catch (err) {
      const e = err as { body?: { message?: string }; message?: string };
      setError(e.body?.message ?? e.message ?? "Failed to remove account");
    } finally {
      setRemovingId(null);
    }
  }

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }

  function handleFormSuccess() {
    setShowForm(false);
    showFlash("Account saved successfully.");
    fetchAccounts();
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Amazon Seller Connections
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Connect your Amazon Seller accounts via SP-API to import products
            and manage orders.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Account
          </button>
        )}
      </div>

      {/* Flash */}
      {flash && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">{flash}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <AddAccountForm
          client={client}
          onSuccess={handleFormSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Accounts list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading accounts…</span>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
          <p className="text-sm text-gray-500">No accounts connected yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Click &quot;Add Account&quot; above to connect your first Amazon
            Seller account.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onRemove={handleRemove}
              removing={removingId === account.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

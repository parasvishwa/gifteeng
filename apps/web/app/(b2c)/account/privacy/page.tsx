"use client";

// ─────────────────────────────────────────────────────────────────────
// Customer privacy & data controls page (DPDP Act compliance).
// ─────────────────────────────────────────────────────────────────────
//
// Three sections:
//   1. Consent toggles per category (essential / analytics / marketing /
//      ai_personalization) — flipping a toggle creates a new
//      ConsentRecord row server-side; we never mutate prior records.
//   2. Data export — one click generates a JSON file of everything the
//      platform knows about the customer. Stored server-side for 7 days
//      so the customer can re-download without re-generating.
//   3. Account deletion — schedules anonymization 30 days from request.
//      Customer can cancel any time before the grace period elapses.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Download, Trash2, AlertTriangle, Check, Loader2 } from "lucide-react";
import { cartFetch, getB2cToken } from "@/lib/api";

type ConsentCategory = "essential" | "analytics" | "marketing" | "ai_personalization";

type ConsentSnapshot = Record<ConsentCategory, {
  granted: boolean; recordedAt: string | null; policyVersion: string;
}>;

type ExportRow = {
  id: string;
  status: "pending" | "ready" | "expired" | "cancelled";
  sizeBytes: number | null;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string | null;
};

const CATEGORY_META: Record<ConsentCategory, { label: string; help: string; canWithdraw: boolean }> = {
  essential: {
    label: "Essential",
    help: "Login, cart, checkout, order tracking. Required to use Gifteeng.",
    canWithdraw: false,
  },
  analytics: {
    label: "Analytics",
    help: "Page views, performance monitoring, error reporting (Sentry, GA4). Helps us fix bugs and improve speed.",
    canWithdraw: true,
  },
  marketing: {
    label: "Marketing",
    help: "Abandoned-cart reminders, promotional pushes, Meta Pixel for retargeting. Off = no marketing emails / SMS / pushes.",
    canWithdraw: true,
  },
  ai_personalization: {
    label: "AI personalization",
    help: "AI-driven recommendations, intent classification, gift suggestions. Off = product browsing without personalization.",
    canWithdraw: true,
  },
};

export default function PrivacyPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [consents, setConsents] = useState<ConsentSnapshot | null>(null);
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [pendingExport, setPendingExport] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deletionScheduled, setDeletionScheduled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ConsentCategory | null>(null);

  useEffect(() => {
    const token = getB2cToken();
    if (!token) { setAuthed(false); return; }
    setAuthed(true);
    void load();
  }, []);

  const load = async () => {
    try {
      const [c, ex, me] = await Promise.all([
        cartFetch<ConsentSnapshot>("/me/privacy/consents", { authed: true }),
        cartFetch<ExportRow[]>("/me/privacy/exports", { authed: true }),
        cartFetch<{ dataDeletionScheduledFor?: string | null }>("/auth/b2c/me", { authed: true })
          .catch(() => null),
      ]);
      setConsents(c);
      setExports(ex);
      setDeletionScheduled(me?.dataDeletionScheduledFor ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load privacy settings");
    }
  };

  const toggle = async (category: ConsentCategory, granted: boolean) => {
    setBusy(category);
    setError(null);
    try {
      await cartFetch("/me/privacy/consents", {
        method: "POST",
        body: JSON.stringify({ category, granted }),
        authed: true,
      });
      await load();
    } catch (e: any) {
      setError(e?.body?.message ?? e?.message ?? "Could not update consent");
    } finally {
      setBusy(null);
    }
  };

  const requestExport = async () => {
    setPendingExport(true);
    setError(null);
    try {
      const r = await cartFetch<{ id: string; status: string }>("/me/privacy/export", {
        method: "POST",
        body: JSON.stringify({}),
        authed: true,
      });
      // Immediately fetch the full payload + trigger a browser download.
      const full = await cartFetch<ExportRow & { payload: unknown }>(`/me/privacy/exports/${r.id}`, { authed: true });
      const blob = new Blob([JSON.stringify(full.payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gifteeng-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await load();
    } catch (e: any) {
      setError(e?.body?.message ?? e?.message ?? "Could not generate export");
    } finally {
      setPendingExport(false);
    }
  };

  const requestDeletion = async () => {
    if (!confirm(
      "Are you sure?\n\n" +
      "We'll schedule your account for deletion 30 days from now. During that window, " +
      "you can cancel by visiting this page again. After 30 days, your name, email, " +
      "phone, addresses, and personal photos will be permanently anonymized.\n\n" +
      "Order records (required by tax law) will be kept but with all personal " +
      "information redacted."
    )) return;
    setPendingDelete(true);
    setError(null);
    try {
      await cartFetch("/me/privacy/delete-account", {
        method: "POST",
        body: JSON.stringify({}),
        authed: true,
      });
      await load();
    } catch (e: any) {
      setError(e?.body?.message ?? e?.message ?? "Could not request deletion");
    } finally {
      setPendingDelete(false);
    }
  };

  const cancelDeletion = async () => {
    setPendingDelete(true);
    try {
      await cartFetch("/me/privacy/delete-account", { method: "DELETE", authed: true });
      await load();
    } catch (e: any) {
      setError(e?.body?.message ?? e?.message ?? "Could not cancel deletion");
    } finally {
      setPendingDelete(false);
    }
  };

  if (authed === null) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (authed === false) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold mb-2">Privacy & data controls</h1>
        <p className="text-sm text-muted-foreground mb-4">Please sign in to manage your data.</p>
        <Link href="/account" className="text-primary underline text-sm">Go to account</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 md:pt-20 pb-24">
      <Link href="/account" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline mb-3">
        <ArrowLeft className="w-3 h-3" /> Back to account
      </Link>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-1">
        <ShieldCheck className="w-6 h-6 text-primary" />
        Privacy & data controls
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Under India&apos;s Digital Personal Data Protection Act, you have the right to control,
        export, and delete the data we hold about you. Use the controls below — they take effect
        immediately, no support tickets required.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Consents ────────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold mb-1">What we can do with your data</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Toggle off any non-essential category to revoke that consent immediately. We log every change
          for the regulator&apos;s audit trail.
        </p>
        {!consents ? (
          <div className="text-sm text-muted-foreground">Loading consent settings…</div>
        ) : (
          <div className="space-y-3">
            {(["essential", "analytics", "marketing", "ai_personalization"] as ConsentCategory[]).map((cat) => {
              const meta = CATEGORY_META[cat];
              const c = consents[cat];
              const isBusy = busy === cat;
              return (
                <div key={cat} className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{meta.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{meta.help}</div>
                    {c.recordedAt && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Last decision: {new Date(c.recordedAt).toLocaleString("en-IN")}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {!meta.canWithdraw ? (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Required</span>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => toggle(cat, !c.granted)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          c.granted ? "bg-primary" : "bg-muted"
                        } disabled:opacity-50`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          c.granted ? "translate-x-6" : "translate-x-1"
                        }`} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Data export ────────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border bg-card p-5">
        <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export your data
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Get everything we know about you in a single JSON file — orders, addresses, wishlist,
          coin transactions, reviews, customizer designs, the lot. The file is generated immediately
          and downloads to your device.
        </p>
        <button
          onClick={requestExport}
          disabled={pendingExport}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {pendingExport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {pendingExport ? "Generating…" : "Download my data"}
        </button>

        {exports.length > 0 && (
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Previous exports ({exports.length})
            </summary>
            <div className="mt-2 space-y-1">
              {exports.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded border bg-background p-2">
                  <span>{new Date(e.createdAt).toLocaleString("en-IN")}</span>
                  <span className="text-muted-foreground">{e.sizeBytes ? `${(e.sizeBytes / 1024).toFixed(1)} KB` : ""}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${
                    e.status === "ready" ? "text-emerald-700" : "text-muted-foreground"
                  }`}>{e.status}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ── Delete account ──────────────────────────────────────────── */}
      <section className="mb-8 rounded-xl border border-red-200 bg-red-50/40 dark:bg-red-950/10 p-5">
        <h2 className="text-base font-semibold mb-1 flex items-center gap-2 text-red-700 dark:text-red-400">
          <Trash2 className="w-4 h-4" />
          Delete my account
        </h2>
        {deletionScheduled ? (
          <>
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-300 mb-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Deletion scheduled for {new Date(deletionScheduled).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
                <div className="text-xs mt-0.5">You can cancel any time before that date.</div>
              </div>
            </div>
            <button
              onClick={cancelDeletion}
              disabled={pendingDelete}
              className="rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {pendingDelete ? "Working…" : "Cancel deletion"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              Your account will be scheduled for deletion 30 days from now. During that window you can
              come back and cancel. After 30 days, your name, email, phone, addresses, customizer photos,
              wishlist, and saved preferences will be permanently anonymized. Order records are kept for
              7 years (tax law) but with all personal information redacted.
            </p>
            <button
              onClick={requestDeletion}
              disabled={pendingDelete}
              className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 disabled:opacity-50"
            >
              {pendingDelete ? "Working…" : "Schedule deletion"}
            </button>
          </>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground text-center">
        Read our full <Link href="/privacy" className="underline">privacy policy</Link>.
        Questions? Email <a href="mailto:privacy@gifteeng.com" className="underline">privacy@gifteeng.com</a>.
      </p>
    </div>
  );
}

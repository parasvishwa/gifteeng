"use client";

// ─── Accept invite page ──────────────────────────────────────────────────────
//
// Lands here from the single-use invite link `/super-admin/accept-invite
// ?token=…`. The token is verified server-side; the user picks their own
// password and the API atomically sets the passwordHash + activates the
// account + clears the token columns. Replaces the legacy
// /set-password (email, password) flow — see docs/SECURITY_AUDIT.md C-3.
//
// This page is intentionally public (no admin guard) — the token *is* the
// authorization. Throttled at 5 attempts / minute / IP on the API.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getApiBase } from "@/lib/admin-api";

export default function AcceptInvitePage() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get("token") ?? "";

  const [pw, setPw]           = useState("");
  const [pwConfirm, setPwCo]  = useState("");
  const [submitting, setSub]  = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This invite link is missing its token. Ask your admin to resend.");
    }
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pwConfirm) {
      setError("Passwords do not match.");
      return;
    }
    setSub(true);
    try {
      const r = await fetch(`${getApiBase()}/auth/b2b/accept-invite`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password: pw }),
      });
      if (!r.ok) {
        // 400 = invalid/expired token; 429 = throttled
        const txt = await r.text();
        setError(
          r.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : txt || "Could not accept invite. The link may be expired.",
        );
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/super-admin"), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSub(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="font-bold text-emerald-900">Account activated</p>
          <p className="text-sm text-emerald-800 mt-1">
            Redirecting you to the admin login…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form
        onSubmit={submit}
        className="max-w-md w-full rounded-2xl border border-border bg-card p-6 space-y-4"
      >
        <div>
          <h1 className="text-xl font-black tracking-tight">Set your password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a password to activate your Gifteeng team account.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
              New password
            </span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
              Confirm password
            </span>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwCo(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || !token}
          className="w-full rounded-lg bg-[#EF3752] text-white px-4 py-2.5 text-sm font-bold disabled:opacity-60"
        >
          {submitting ? "Activating…" : "Activate account"}
        </button>

        <p className="text-[11px] text-muted-foreground text-center">
          Your password is hashed with argon2id before storage. The invite link
          is single-use and will be discarded after activation.
        </p>
      </form>
    </div>
  );
}

"use client";

// ─────────────────────────────────────────────────────────────────────
// Cookie consent banner — first-touch DPDP-compliant prompt.
//
// Behaviour:
//   - Shown once per browser until the user makes any choice.
//   - Three buttons: Reject all, Customize, Accept all.
//   - Decisions are stored in localStorage (`gifteeng.cookieConsent`)
//     so the banner doesn't reappear; if the user is logged in we ALSO
//     POST each non-essential category to /me/privacy/consents so the
//     audit trail is server-side.
//   - Marketing trackers (GTM, GA4, Meta Pixel) read the same
//     localStorage key before initialising, so a "reject all" choice
//     prevents any third-party script load.
//
// The banner is unobtrusive (bottom-fixed strip) and dismissible via
// any of the three buttons — never a forced modal.

import { useEffect, useState } from "react";
import { getB2cToken, cartFetch } from "@/lib/api";

type Choice = "all" | "essential" | "custom";

type StoredConsent = {
  version: string;
  decidedAt: string;
  analytics: boolean;
  marketing: boolean;
  ai_personalization: boolean;
};

const STORAGE_KEY = "gifteeng.cookieConsent";
const POLICY_VERSION = "1.0";

export function getCookieConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.version !== POLICY_VERSION) return null;
    return parsed;
  } catch { return null; }
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [picks, setPicks] = useState({ analytics: false, marketing: false, ai_personalization: false });

  useEffect(() => {
    const existing = getCookieConsent();
    if (!existing) setOpen(true);
  }, []);

  const persist = async (next: { analytics: boolean; marketing: boolean; ai_personalization: boolean }) => {
    const stored: StoredConsent = {
      version: POLICY_VERSION,
      decidedAt: new Date().toISOString(),
      ...next,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch { /* private mode */ }

    // Mirror to server when logged in. Fire-and-forget — the banner
    // shouldn't block the page render on a network call.
    if (getB2cToken()) {
      const send = (category: "analytics" | "marketing" | "ai_personalization", granted: boolean) =>
        cartFetch("/me/privacy/consents", {
          method: "POST",
          authed: true,
          body: JSON.stringify({ category, granted }),
        }).catch(() => { /* swallow */ });
      send("analytics", next.analytics);
      send("marketing", next.marketing);
      send("ai_personalization", next.ai_personalization);
    }

    // Notify the rest of the app — analytics scripts can flip on
    // immediately when the customer just opted in.
    window.dispatchEvent(new CustomEvent("gifteeng:cookieConsent", { detail: stored }));
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[300] border-t border-border bg-card/95 backdrop-blur p-4 shadow-2xl"
    >
      <div className="mx-auto max-w-5xl">
        {!customising ? (
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
            <div className="flex-1 text-xs leading-relaxed text-foreground">
              We use cookies & similar tech for essential checkout, optional analytics
              (page speed + crash reports), and optional marketing (cart reminders, retargeting).
              Pick what you&apos;re OK with — you can change it any time from your account settings.
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => persist({ analytics: false, marketing: false, ai_personalization: false })}
                className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Reject all
              </button>
              <button
                onClick={() => setCustomising(true)}
                className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Customize
              </button>
              <button
                onClick={() => persist({ analytics: true, marketing: true, ai_personalization: true })}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Accept all
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-sm">Customize cookie & data settings</div>
            <Toggle label="Essential" disabled help="Login, cart, checkout. Required." />
            <Toggle
              label="Analytics"
              checked={picks.analytics}
              onChange={(v) => setPicks((p) => ({ ...p, analytics: v }))}
              help="Page views, errors, performance. Helps us fix bugs."
            />
            <Toggle
              label="Marketing"
              checked={picks.marketing}
              onChange={(v) => setPicks((p) => ({ ...p, marketing: v }))}
              help="Cart-abandonment reminders, promotional pushes."
            />
            <Toggle
              label="AI personalization"
              checked={picks.ai_personalization}
              onChange={(v) => setPicks((p) => ({ ...p, ai_personalization: v }))}
              help="Smart recommendations, gift suggestions."
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setCustomising(false)}
                className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Back
              </button>
              <button
                onClick={() => persist(picks)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                Save preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle(props: {
  label: string; help: string;
  checked?: boolean; disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border bg-background p-2">
      <div className="flex-1 min-w-0">
        <div className="font-medium">{props.label}</div>
        <div className="text-[11px] text-muted-foreground">{props.help}</div>
      </div>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange?.(!props.checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          props.disabled ? "bg-emerald-500"
          : props.checked ? "bg-primary"
          : "bg-muted"
        } disabled:opacity-70`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
          (props.disabled || props.checked) ? "translate-x-5" : "translate-x-1"
        }`} />
      </button>
    </div>
  );
}

export default CookieConsent;

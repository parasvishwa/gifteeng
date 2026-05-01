"use client";

// Marketing & analytics tags admin page.
//
// Stores its config under the single SiteSetting key `marketing_config`
// (JSON blob). The b2c web layout fetches that key at first paint via the
// already-public `/api/settings/marketing_config` endpoint and injects:
//   - Google Tag Manager   (one container, drives everything below)
//   - Google Analytics 4   (also reachable through GTM, kept here as a
//                           direct fallback for non-GTM installs)
//   - Meta Pixel           (browser pixel; CAPI is server-side and reads
//                           the same setting key from /admin/settings)
//   - Google Ads conversion (id + optional purchase label)
//   - Search Console verification meta tag
//
// Secrets (Meta CAPI access token, Google Ads conversion API key) are
// stored under separate keys NOT in the public allowlist — the API reads
// them server-side directly and never echoes them to the browser.

import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Input,
  Label,
} from "@gifteeng/ui";
import {
  Megaphone,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { authHeaders, getApiBase } from "@/lib/admin-api";

interface MarketingConfig {
  // Google Tag Manager — single container for everything else.
  gtmContainerId: string;          // e.g. "GTM-XXXXXXX"
  // Google Analytics 4 — direct injection fallback (GTM is preferred).
  ga4MeasurementId: string;        // e.g. "G-XXXXXXXXXX"
  // Meta Pixel — browser-side. CAPI access token lives separately.
  metaPixelId: string;             // e.g. "123456789012345"
  // Google Ads — conversion ID + optional purchase label.
  googleAdsId: string;             // e.g. "AW-12345678"
  googleAdsPurchaseLabel: string;  // e.g. "abc123xyz"
  // Search Console verification meta tag content.
  googleSiteVerification: string;  // 43-char string from Search Console
  // Mobile app store URLs — surfaced as "Also available on" badges on the
  // b2c home. Storing URLs (not IDs) lets you point at any store listing.
  playStoreUrl: string;            // https://play.google.com/store/apps/details?id=…
  appStoreUrl:  string;            // https://apps.apple.com/in/app/…/id…
  // Master switch — when false, no scripts are injected at all (useful
  // during private staging or to honour a global "do not track" mode).
  enabled: boolean;
}

const empty: MarketingConfig = {
  gtmContainerId: "",
  ga4MeasurementId: "",
  metaPixelId: "",
  googleAdsId: "",
  googleAdsPurchaseLabel: "",
  googleSiteVerification: "",
  playStoreUrl: "",
  appStoreUrl:  "",
  enabled: true,
};

// Server CAPI / secret fields. Stored under a separate `marketing_secrets`
// key that's NOT in the public allowlist — the API reads it server-side
// for outbound CAPI calls and never returns it to the browser.
interface MarketingSecrets {
  metaCapiAccessToken: string;
  metaTestEventCode: string; // for Meta's test events sandbox
}
const emptySecrets: MarketingSecrets = {
  metaCapiAccessToken: "",
  metaTestEventCode: "",
};

async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: string; json: any }> {
  try {
    const r = await fetch(`${getApiBase()}/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init.headers || {}),
      },
    });
    const body = await r.text();
    let json: any = null;
    try { json = JSON.parse(body); } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, body, json };
  } catch (e) {
    return { ok: false, status: 0, body: String(e), json: null };
  }
}

export default function MarketingSettingsPage() {
  const [cfg,    setCfg]    = useState<MarketingConfig>(empty);
  const [sec,    setSec]    = useState<MarketingSecrets>(emptySecrets);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{kind: "ok"|"err"; text: string} | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pubRes, secRes] = await Promise.all([
      apiFetch("/admin/settings/marketing_config"),
      apiFetch("/admin/settings/marketing_secrets"),
    ]);
    if (pubRes.ok && pubRes.json?.value && typeof pubRes.json.value === "object") {
      setCfg({ ...empty, ...pubRes.json.value });
    } else {
      setCfg(empty);
    }
    if (secRes.ok && secRes.json?.value && typeof secRes.json.value === "object") {
      setSec({ ...emptySecrets, ...secRes.json.value });
    } else {
      setSec(emptySecrets);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const [r1, r2] = await Promise.all([
      apiFetch(`/admin/settings/marketing_config`, {
        method: "PATCH",
        body: JSON.stringify({ value: cfg }),
      }),
      apiFetch(`/admin/settings/marketing_secrets`, {
        method: "PATCH",
        body: JSON.stringify({ value: sec }),
      }),
    ]);
    setSaving(false);
    if (r1.ok && r2.ok) {
      setMsg({ kind: "ok", text: "Saved. Trackers go live on the next page render." });
    } else {
      setMsg({ kind: "err", text: `Save failed: ${r1.status} / ${r2.status}` });
    }
  };

  const set = <K extends keyof MarketingConfig>(k: K, v: MarketingConfig[K]) =>
    setCfg(p => ({ ...p, [k]: v }));
  const setS = <K extends keyof MarketingSecrets>(k: K, v: MarketingSecrets[K]) =>
    setSec(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-pink-500/10">
          <Megaphone className="w-5 h-5 text-pink-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Marketing & Analytics</h1>
          <p className="text-xs text-muted-foreground">
            One place to plug in every tracking pixel. Saves to the DB and
            takes effect on next page render — no redeploy needed.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* Master switch */}
          <Section
            title="Master switch"
            help="When off, NO trackers are injected — useful for staging, internal QA, or a privacy-mode rollout."
          >
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={cfg.enabled}
                onChange={e => set("enabled", e.target.checked)}
              />
              Tracking enabled site-wide
            </label>
          </Section>

          {/* GTM */}
          <Section
            title="Google Tag Manager"
            help="Strongly recommended — one container drives every other tag below without code changes."
            link={{ href: "https://tagmanager.google.com/", label: "Open Tag Manager" }}
          >
            <Field
              label="GTM Container ID"
              placeholder="GTM-XXXXXXX"
              value={cfg.gtmContainerId}
              onChange={v => set("gtmContainerId", v.trim())}
              hint="Format: GTM- followed by 7 alphanumeric characters."
            />
          </Section>

          {/* GA4 */}
          <Section
            title="Google Analytics 4"
            help="Optional if you've already configured GA4 inside GTM. Set it here only if you want a direct gtag() injection."
            link={{ href: "https://analytics.google.com/", label: "Open GA4" }}
          >
            <Field
              label="GA4 Measurement ID"
              placeholder="G-XXXXXXXXXX"
              value={cfg.ga4MeasurementId}
              onChange={v => set("ga4MeasurementId", v.trim())}
              hint="Format: G- followed by 10 alphanumeric characters."
            />
          </Section>

          {/* Meta Pixel + CAPI */}
          <Section
            title="Meta Pixel + Conversions API"
            help="Pixel alone misses 30–40% of iOS users. Pair it with the CAPI access token below for accurate ad attribution."
            link={{ href: "https://business.facebook.com/events_manager", label: "Events Manager" }}
          >
            <Field
              label="Meta Pixel ID"
              placeholder="123456789012345"
              value={cfg.metaPixelId}
              onChange={v => set("metaPixelId", v.trim())}
              hint="15-digit numeric Pixel ID from Events Manager."
            />
            <Field
              label="CAPI Access Token (server-side, secret)"
              placeholder="EAAxxxx…"
              value={sec.metaCapiAccessToken}
              onChange={v => setS("metaCapiAccessToken", v.trim())}
              type="password"
              hint="Generated in Events Manager → Settings → Conversions API. Never sent to the browser."
            />
            <Field
              label="Test Event Code (optional)"
              placeholder="TEST12345"
              value={sec.metaTestEventCode}
              onChange={v => setS("metaTestEventCode", v.trim())}
              hint="Use a code from Test Events while validating CAPI; clear it before going live."
            />
          </Section>

          {/* Google Ads */}
          <Section
            title="Google Ads conversion tracking"
            help="Install this even before running ads — Google Ads needs 30+ days of conversion history to optimise auto-bidding."
            link={{ href: "https://ads.google.com/", label: "Open Google Ads" }}
          >
            <Field
              label="Conversion ID"
              placeholder="AW-12345678"
              value={cfg.googleAdsId}
              onChange={v => set("googleAdsId", v.trim())}
              hint="Format: AW- followed by 8–11 digits."
            />
            <Field
              label="Purchase conversion label"
              placeholder="abcDEFghij1234567890"
              value={cfg.googleAdsPurchaseLabel}
              onChange={v => set("googleAdsPurchaseLabel", v.trim())}
              hint="Found under Tools → Conversions → click the conversion → Tag setup. Used for the order-success page."
            />
          </Section>

          {/* Search Console */}
          <Section
            title="Google Search Console"
            help="Paste the verification meta tag content from Search Console to verify ownership without a DNS record."
            link={{ href: "https://search.google.com/search-console", label: "Open Search Console" }}
          >
            <Field
              label="Verification meta content"
              placeholder="A1BcDeFGhIjKlMNopQRsTuVWxYz0123456789aBcDeFG"
              value={cfg.googleSiteVerification}
              onChange={v => set("googleSiteVerification", v.trim())}
              hint="Just the value from the content=&quot;…&quot; attribute of the verification tag."
            />
          </Section>

          {/* App store URLs */}
          <Section
            title="Mobile app stores"
            help="Drives the 'Also available on Android / iOS' badges on the home page. Leave a field blank to hide that badge."
          >
            <Field
              label="Google Play store URL"
              placeholder="https://play.google.com/store/apps/details?id=com.gifteeng"
              value={cfg.playStoreUrl}
              onChange={v => set("playStoreUrl", v.trim())}
              hint="Full Play Store listing URL for the Android app."
            />
            <Field
              label="Apple App Store URL"
              placeholder="https://apps.apple.com/in/app/gifteeng/id1234567890"
              value={cfg.appStoreUrl}
              onChange={v => set("appStoreUrl", v.trim())}
              hint="Full App Store listing URL for the iOS app. India region preferred (apps.apple.com/in/...)."
            />
          </Section>

          {/* Save bar */}
          <div className="sticky bottom-0 bg-background border-t border-border/60 -mx-6 px-6 py-3 flex items-center gap-3 justify-end">
            {msg && (
              <span className={`text-xs flex items-center gap-1 ${msg.kind === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
                {msg.kind === "ok" ? <CheckCircle2 className="w-3.5 h-3.5"/> : <AlertCircle className="w-3.5 h-3.5"/>}
                {msg.text}
              </span>
            )}
            <Button onClick={save} disabled={saving} size="sm" className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
              Save changes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────

function Section({
  title, help, link, children,
}: {
  title: string;
  help: string;
  link?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{help}</p>
        </div>
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary inline-flex items-center gap-1 shrink-0 mt-0.5"
          >
            {link.label} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label, hint, value, onChange, placeholder, type = "text",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        className="font-mono text-xs"
      />
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

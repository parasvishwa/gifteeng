// Site-wide marketing / analytics tag injector.
//
// Two-component split (DPDP compliance, May 2026):
//   - The CONFIG fetch stays server-side (we want fresh values on each
//     paint, not a client round-trip per page load).
//   - The actual <Script> tags are emitted from a CLIENT component
//     (MarketingScriptsClient) which reads the cookie-consent decision
//     from localStorage and ONLY loads trackers when the customer has
//     granted the relevant consent.
//
// Before this split, we injected GTM / GA4 / Meta Pixel server-side
// regardless of consent — the cookie banner saved "Reject all" but the
// trackers had already fired. That's a real DPDP violation.
//
// Categories → script mapping (matches CookieConsent.tsx):
//   marketing → GTM, Meta Pixel, Google Ads
//   analytics → GA4
//   essential → Google Search Console verification (no tracking, just
//               a meta tag — counts as essential because removing it
//               would degrade Gifteeng's ability to operate the site)

import { MarketingScriptsClient } from "./MarketingScriptsClient";

const API_BASE =
  process.env.INTERNAL_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "http://127.0.0.1:4000";

export interface MarketingConfig {
  gtmContainerId?: string;
  ga4MeasurementId?: string;
  metaPixelId?: string;
  googleAdsId?: string;
  googleAdsPurchaseLabel?: string;
  googleSiteVerification?: string;
  enabled?: boolean;
}

async function loadConfig(): Promise<MarketingConfig> {
  try {
    const r = await fetch(`${API_BASE}/api/settings/marketing_config`, {
      next: { revalidate: 60 },
    });
    if (!r.ok) return {};
    const data = await r.json();
    if (data?.value && typeof data.value === "object") {
      return data.value as MarketingConfig;
    }
  } catch { /* settings endpoint can fail during cold-boot */ }
  return {};
}

export default async function MarketingScripts() {
  const cfg = await loadConfig();
  if (cfg.enabled === false) return null;

  return (
    <>
      {/* Search Console verification — pure meta tag with no JS, no
          third-party request, no cookie. Fires regardless of consent
          because removing it would prevent us from operating SEO
          for our own site. Categorised as "essential". */}
      {cfg.googleSiteVerification?.trim() && (
        <meta name="google-site-verification" content={cfg.googleSiteVerification.trim()} />
      )}

      {/* Tracker scripts — gated client-side by cookie consent. */}
      <MarketingScriptsClient config={cfg} />
    </>
  );
}

/**
 * GTM <noscript> fallback — must sit immediately after <body>.
 * Render this from the layout in addition to <MarketingScripts/>.
 *
 * Note: this fallback fires for users with JS disabled. We can't ask
 * them for consent without JS, so we err on the side of NOT loading
 * trackers — render an empty fragment. Affects <0.5% of traffic and
 * the safer compliance choice.
 */
export function MarketingNoScript() {
  return null;
}

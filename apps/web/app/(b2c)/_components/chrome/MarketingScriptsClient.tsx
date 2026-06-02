"use client";

// ─────────────────────────────────────────────────────────────────────
// Cookie-consent-gated marketing script loader.
// ─────────────────────────────────────────────────────────────────────
//
// Reads `gifteeng.cookieConsent` from localStorage on mount and
// re-checks whenever the CookieConsent banner dispatches the
// `gifteeng:cookieConsent` custom event (so toggling consent in the
// banner takes effect without a page reload).
//
// Renders trackers only when the matching consent category is granted:
//   marketing → GTM, Meta Pixel, Google Ads conversion tag
//   analytics → GA4
//
// When consent is missing or rejected we render NOTHING — no scripts
// hit the network, no cookies set, no tracker IDs leaked in the
// initial HTML.

import Script from "next/script";
import { useEffect, useState } from "react";
import type { MarketingConfig } from "./MarketingScripts";

interface ConsentSnapshot {
  analytics: boolean;
  marketing: boolean;
  ai_personalization: boolean;
  decidedAt?: string;
  version?: string;
}

const STORAGE_KEY = "gifteeng.cookieConsent";

function readConsent(): ConsentSnapshot {
  if (typeof window === "undefined") {
    return { analytics: false, marketing: false, ai_personalization: false };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { analytics: false, marketing: false, ai_personalization: false };
    const parsed = JSON.parse(raw);
    return {
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
      ai_personalization: !!parsed.ai_personalization,
      decidedAt: parsed.decidedAt,
      version: parsed.version,
    };
  } catch {
    return { analytics: false, marketing: false, ai_personalization: false };
  }
}

export function MarketingScriptsClient({ config }: { config: MarketingConfig }) {
  // Start with no consent so the initial server-rendered HTML is the
  // same as the first client paint (no hydration mismatch). We pull
  // the real value after mount.
  const [consent, setConsent] = useState<ConsentSnapshot>(() => ({
    analytics: false, marketing: false, ai_personalization: false,
  }));

  useEffect(() => {
    setConsent(readConsent());
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<ConsentSnapshot>).detail;
      if (d) setConsent(d);
      else setConsent(readConsent());
    };
    window.addEventListener("gifteeng:cookieConsent", onChange);
    return () => window.removeEventListener("gifteeng:cookieConsent", onChange);
  }, []);

  const gtm = config.gtmContainerId?.trim();
  const ga4 = config.ga4MeasurementId?.trim();
  const pix = config.metaPixelId?.trim();
  const ads = config.googleAdsId?.trim();

  return (
    <>
      {/* GTM, Meta Pixel, Google Ads → marketing consent */}
      {consent.marketing && gtm && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      )}

      {/* GA4 → analytics consent */}
      {consent.analytics && ga4 && (
        <>
          <Script
            id="ga4-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4}');
${consent.marketing && ads ? `gtag('config', '${ads}');` : ""}`}
          </Script>
        </>
      )}

      {/* Google Ads conversion — marketing consent. Standalone path
          when GA4 isn't loaded; otherwise the GA4 block above also
          configures it. */}
      {consent.marketing && ads && !(consent.analytics && ga4) && (
        <>
          <Script
            id="gads-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${ads}`}
            strategy="afterInteractive"
          />
          <Script id="gads-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ads}');`}
          </Script>
        </>
      )}

      {/* Meta Pixel → marketing consent */}
      {consent.marketing && pix && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pix}');
fbq('track', 'PageView');`}
        </Script>
      )}
    </>
  );
}

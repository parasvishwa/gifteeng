// Site-wide marketing / analytics tag injector.
//
// Reads the public `marketing_config` setting (managed at
// /super-admin/marketing) and injects the configured trackers into the
// <head>. Single Next.js Script per provider so there's exactly one
// network request per tracker, and each is gated by its own ID — empty
// IDs render nothing, no console warnings, no broken pixels.
//
// Why server component: we want the scripts in the initial HTML so:
//   1. There's no flash where the page renders before tracking attaches
//   2. The `next/script` strategies ("afterInteractive") still work
//   3. The Search Console verification meta tag is in raw HTML before any
//      hydration runs (Search Console reads the bot fetch, not the SPA)

import Script from "next/script";

const API_BASE =
  process.env.INTERNAL_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "http://127.0.0.1:4000";

interface MarketingConfig {
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
      // Cache for a minute so a tag-change doesn't require a full deploy
      // but a single page render isn't slowed down by an extra round-trip.
      next: { revalidate: 60 },
    });
    if (!r.ok) return {};
    const data = await r.json();
    if (data?.value && typeof data.value === "object") {
      return data.value as MarketingConfig;
    }
  } catch {
    // Settings endpoint can fail during cold-boot; just don't inject anything.
  }
  return {};
}

export default async function MarketingScripts() {
  const cfg = await loadConfig();
  if (cfg.enabled === false) return null;

  const gtm = cfg.gtmContainerId?.trim();
  const ga4 = cfg.ga4MeasurementId?.trim();
  const pix = cfg.metaPixelId?.trim();
  const ads = cfg.googleAdsId?.trim();
  const ver = cfg.googleSiteVerification?.trim();

  return (
    <>
      {/* Google Search Console verification — pure meta tag, no JS. */}
      {ver && (
        <meta name="google-site-verification" content={ver} />
      )}

      {/* Google Tag Manager — preferred entry point, drives every other
          provider you connect inside GTM. Loaded with 'afterInteractive'
          so it doesn't block the LCP paint. */}
      {gtm && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtm}');
          `}
        </Script>
      )}

      {/* GA4 direct injection — for installs that aren't using GTM yet.
          Skipped automatically if no G-XXXX is configured. */}
      {ga4 && (
        <>
          <Script
            id="ga4-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga4}');
              ${ads ? `gtag('config', '${ads}');` : ""}
            `}
          </Script>
        </>
      )}

      {/* Google Ads conversion tag — loaded standalone if GA4 isn't set
          (otherwise piggybacks on the gtag() loader above). */}
      {ads && !ga4 && (
        <>
          <Script
            id="gads-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${ads}`}
            strategy="afterInteractive"
          />
          <Script id="gads-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ads}');
            `}
          </Script>
        </>
      )}

      {/* Meta Pixel — browser side. Conversions API runs server-side
          off the same Pixel ID + the access token stored in
          marketing_secrets (read by the API, never sent to the browser). */}
      {pix && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pix}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
    </>
  );
}

/**
 * GTM <noscript> fallback — must sit immediately after <body>.
 * Render this from the layout in addition to <MarketingScripts/>.
 */
export async function MarketingNoScript() {
  const cfg = await loadConfig();
  if (cfg.enabled === false) return null;
  const gtm = cfg.gtmContainerId?.trim();
  if (!gtm) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}

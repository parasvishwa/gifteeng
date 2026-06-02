import { Navbar } from "./_components/Navbar";
import { Footer } from "./_components/Footer";
import { ThemeProvider } from "@/lib/theme";
import AnalyticsTracker from "./_components/chrome/AnalyticsTracker";
import FloatingSpinWheel from "./_components/chrome/SpinWheel";
import BirthdayCityPopup from "./_components/chrome/BirthdayCityPopup";
import MilestonePopup from "./_components/chrome/MilestonePopup";
import DeliveryZonePopup from "./_components/DeliveryZonePopup";
import MarketingScripts, { MarketingNoScript } from "./_components/chrome/MarketingScripts";
import RealtimeSync from "./_components/chrome/RealtimeSync";
// CookieConsent banner removed — Indian e-commerce convention (Flipkart,
// Myntra, Amazon.in, Nykaa) doesn't show a proactive cookie banner; we
// match the local norm. Customers retain full control over consent
// categories, data export, and deletion from /b2c/account/privacy. The
// component file is kept in the codebase in case we ever need to mount
// it again (DPDP enforcement tightens, EU expansion, etc.).

// Dynamic so the marketing config (driven from the admin panel) reflects
// changes without a redeploy — settings are revalidated every 60s.
export const dynamic = "force-dynamic";

export default async function B2CLayout({ children }: { children: React.ReactNode }) {
  return (
  <ThemeProvider>
    {/* Site-wide trackers — GTM, GA4, Meta Pixel, Google Ads, Search
        Console verification. All driven from /super-admin/marketing. */}
    <MarketingScripts />
    <MarketingNoScript />
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* CRED-style 2px gradient accent line at very top */}
      <div
        className="fixed top-0 left-0 right-0 z-[100] h-[2px] w-full"
        style={{
          background: "hsl(351 85% 58%)",
        }}
        aria-hidden
      />

      {/* Push content below the accent line */}
      <div className="pt-[2px]">
        <AnalyticsTracker />
        {/* Realtime cross-device sync — opens an SSE connection to
            /api/me/events for the logged-in customer and broadcasts
            invalidation events to cart/wishlist/orders/goins consumers. */}
        <RealtimeSync />
        {/* CookieConsent banner intentionally NOT mounted — see import
            comment for rationale. Privacy controls available at
            /b2c/account/privacy. */}
        <Navbar />
        {/*
          Spacer for the fixed navbar so page content is never hidden behind it.
          Mobile:  accent(2px) + announcement(30px) + nav h-14(56px)           = 88px
          Desktop: accent(2px) + announcement(30px) + nav h-16(64px) + cat-nav(40px) = 136px
        */}
        <div className="h-[88px] md:h-[136px] shrink-0" aria-hidden />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>

      {/* Floating Goins spin wheel — visible site-wide for logged-in users */}
      <FloatingSpinWheel />

      {/* One-time profile completion popup — birthday + city, awards 100 Goins */}
      <BirthdayCityPopup />

      {/* Every-Nth-signup celebration popup */}
      <MilestonePopup />

      {/* First-visit delivery zone picker — "Mumbai or Other than Mumbai?".
          Replaces the legacy GPS-prompt flow with an explicit one-tap
          choice. Persists in localStorage so we never nag returning users. */}
      <DeliveryZonePopup />
    </div>
  </ThemeProvider>
  );
}

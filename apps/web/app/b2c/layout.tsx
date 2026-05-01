import { Navbar } from "./_components/Navbar";
import { Footer } from "./_components/Footer";
import { ThemeProvider } from "@/lib/theme";
import AnalyticsTracker from "./_components/chrome/AnalyticsTracker";
import FloatingSpinWheel from "./_components/chrome/SpinWheel";
import BirthdayCityPopup from "./_components/chrome/BirthdayCityPopup";
import MilestonePopup from "./_components/chrome/MilestonePopup";
import MarketingScripts, { MarketingNoScript } from "./_components/chrome/MarketingScripts";
import RealtimeSync from "./_components/chrome/RealtimeSync";
import CookieConsent from "./_components/chrome/CookieConsent";

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
        {/* DPDP cookie consent — first-touch banner, dismissed once
            the user picks any of {Reject all / Customize / Accept all}.
            Marketing scripts (GTM, Pixel) read the same localStorage
            key before initializing so a "reject" choice prevents
            third-party loads. */}
        <CookieConsent />
        <Navbar />
        {/*
          Spacer for the fixed navbar so page content is never hidden behind it.
          Height = accent line (2px) + announcement bar (30px) + nav h-14 (56px) = 88px.
          Pages that want a full-bleed hero (e.g. homepage) use -mt-[88px] on their first section
          to pull the hero flush with the top of the viewport.
        */}
        <div className="h-[88px] shrink-0" aria-hidden />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>

      {/* Floating Goins spin wheel — visible site-wide for logged-in users */}
      <FloatingSpinWheel />

      {/* One-time profile completion popup — birthday + city, awards 100 Goins */}
      <BirthdayCityPopup />

      {/* Every-Nth-signup celebration popup */}
      <MilestonePopup />
    </div>
  </ThemeProvider>
  );
}

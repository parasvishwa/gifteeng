"use client";

// ─── Delivery Zone Popup (web) ───────────────────────────────────────────────
//
// On first visit (or after the user clears their saved zone) we surface a
// one-question modal: "Are you in Mumbai or other than Mumbai?". Mumbai →
// same-day pricing & ETA; Other → standard 3–5 day. We persist the choice
// to `localStorage` so we never nag the user twice, and write a
// representative pincode under the existing `gifteeng.deliveryPincode` key
// so the SameDayBadge keeps working without modification.
//
// Storage keys
//   gifteeng.delivery_zone_choice  → "mumbai" | "other"
//   gifteeng.deliveryPincode       → "400001" (Mumbai) | "560001" (default)

import { useEffect, useState } from "react";
import { MapPin, Zap, Globe2 } from "lucide-react";

const CHOICE_KEY  = "gifteeng.delivery_zone_choice";
const PINCODE_KEY = "gifteeng.deliveryPincode";

// Representative pincodes used to derive same-day status downstream. Mumbai
// metro (400001) is on the API's MUMBAI same-day list; Bangalore (560001)
// is a safe pan-India default that flips sameDay=false.
const PINCODE_FOR = { mumbai: "400001", other: "560001" } as const;

export default function DeliveryZonePopup() {
  const [open, setOpen] = useState(false);

  // Decide once on mount whether to show. Falls back to "open" only when
  // no saved choice exists — so a returning user never sees this twice.
  // Also subscribe to a custom event so any "Change delivery zone" link
  // anywhere in the app (account/settings, footer, etc.) can pop the
  // picker back open without reloading.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CHOICE_KEY);
      if (saved !== "mumbai" && saved !== "other") {
        setOpen(true);
      }
    } catch { /* ignore — open it just in case */ setOpen(true); }

    const onOpen = () => setOpen(true);
    window.addEventListener("gifteeng:open-delivery-zone", onOpen);
    return () => window.removeEventListener("gifteeng:open-delivery-zone", onOpen);
  }, []);

  const pick = (choice: "mumbai" | "other") => {
    try {
      window.localStorage.setItem(CHOICE_KEY, choice);
      window.localStorage.setItem(PINCODE_KEY, PINCODE_FOR[choice]);
      // Tell other components (SameDayBadge, hero pincode chip) to re-read.
      window.dispatchEvent(new Event("gifteeng:delivery-zone-changed"));
    } catch { /* non-fatal */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="zone-popup-title"
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-4"
    >
      <div className="w-full sm:max-w-md rounded-3xl bg-card text-foreground shadow-2xl overflow-hidden">
        <div className="p-6">
          {/* Pin icon */}
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <MapPin className="w-5 h-5 text-primary" />
          </div>

          <h2
            id="zone-popup-title"
            className="text-lg sm:text-xl font-display font-black tracking-tight leading-tight"
          >
            Where are you ordering from?
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            We use this to show the correct delivery options and ETA.
          </p>

          <div className="mt-5 space-y-2.5">
            <ZoneCard
              icon={<Zap className="w-5 h-5" strokeWidth={2} />}
              accent="#EF3752"
              title="I'm in Mumbai"
              subtitle="Same-day & next-day delivery available"
              onClick={() => pick("mumbai")}
            />
            <ZoneCard
              icon={<Globe2 className="w-5 h-5" strokeWidth={2} />}
              accent="#6C3FFF"
              title="Other than Mumbai"
              subtitle="Pan-India delivery in 3–5 days"
              onClick={() => pick("other")}
            />
          </div>

          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            You can change this later from the delivery picker
          </p>
        </div>
      </div>
    </div>
  );
}

function ZoneCard(props: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      className="w-full flex items-center gap-3 rounded-2xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors px-3.5 py-3 text-left"
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${props.accent}1A`, color: props.accent }}
      >
        {props.icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold leading-tight">{props.title}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">
          {props.subtitle}
        </span>
      </span>
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4 text-muted-foreground shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

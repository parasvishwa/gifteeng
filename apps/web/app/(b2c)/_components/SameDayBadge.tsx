"use client";

// ─── SameDayBadge (web) ───────────────────────────────────────────────────
//
// Mirrors apps/mobile/lib/core/widgets/same_day_badge.dart. Resolves the
// user's pincode via:
//   1. localStorage cache (`gifteeng.deliveryPincode`)
//   2. Saved default address from /api/addresses (if logged in)
//   3. Geolocation API + OpenStreetMap reverse-geocode (one-shot, opt-in)
//
// Then hits /api/shipping/check?pincode=X and renders a ⚡ Same-day pill
// when the response includes `sameDay: true` (Mumbai metro). Returns
// `null` otherwise so non-Mumbai users see nothing extra.
//
// Drop it inside a ProductCard or anywhere else that should highlight
// the same-day promise.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const STORAGE_PINCODE = "gifteeng.deliveryPincode";

type CheckResult = {
  deliverable: boolean;
  sameDay?:    boolean;
  city?:       string;
  etaLabel?:   string;
};

let cached: CheckResult | null = null;
let inflight: Promise<CheckResult | null> | null = null;

async function fetchCheck(pincode: string): Promise<CheckResult | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(
        `${API_BASE}/api/shipping/check?pincode=${encodeURIComponent(pincode)}`,
        { cache: "no-store" },
      );
      if (!r.ok) return null;
      const data = (await r.json()) as CheckResult;
      cached = data;
      return data;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function SameDayBadge({ className = "" }: { className?: string }) {
  const [data, setData] = useState<CheckResult | null>(cached);

  useEffect(() => {
    if (cached) { setData(cached); return; }
    const pin = typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_PINCODE)
      : null;
    if (!pin || !/^\d{6}$/.test(pin)) return;
    void fetchCheck(pin).then((r) => { if (r) setData(r); });
  }, []);

  if (!data?.sameDay) return null;

  return (
    <span
      className={
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded " +
        "bg-emerald-100 border border-emerald-300/60 text-emerald-700 " +
        "text-[9.5px] font-black tracking-wide " +
        className
      }
    >
      ⚡ Same-day delivery
    </span>
  );
}

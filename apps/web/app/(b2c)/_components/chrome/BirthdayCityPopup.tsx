"use client";

/**
 * BirthdayCityPopup — one-time profile completion modal.
 *
 * Asks for birthday (month + day, no year) and city. Skippable.
 * Awards 100 Goins on the FIRST completion (server enforces single-payout).
 *
 * Trigger logic:
 * - Only for logged-in customers
 * - Only if birthday OR city is missing on /api/auth/b2c/me
 * - Suppressed if user has dismissed in last 7 days (localStorage flag)
 * - Shows ~6 seconds after page load (lets the page settle first)
 */

import { useEffect, useState } from "react";
import { Cake, MapPin, X, Sparkles, Check } from "lucide-react";
import { apiB2c, getB2cToken } from "@/lib/api";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DISMISS_KEY = "gifteeng.profile_popup_dismissed_at";
const DISMISS_DAYS = 7;

interface MeResponse {
  id?: string;
  fullName?: string | null;
  metadata?: {
    birthMonth?: number;
    birthDay?:   number;
    city?:       string;
    profileBonusAwardedAt?: string;
  } | null;
}

export default function BirthdayCityPopup() {
  const [open, setOpen]           = useState(false);
  const [me, setMe]               = useState<MeResponse | null>(null);
  const [month, setMonth]         = useState<number | "">("");
  const [day, setDay]             = useState<number | "">("");
  const [city, setCity]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState<{ goins: number } | null>(null);

  // Decide if we should show the popup
  useEffect(() => {
    const token = getB2cToken();
    if (!token) return; // Anonymous — never show

    // Recently dismissed?
    if (typeof window !== "undefined") {
      const last = localStorage.getItem(DISMISS_KEY);
      if (last) {
        const ms = Date.now() - parseInt(last, 10);
        if (Number.isFinite(ms) && ms < DISMISS_DAYS * 86_400_000) return;
      }
    }

    apiB2c().get<MeResponse>("/api/auth/b2c/me").then((data) => {
      if (!data) return;
      setMe(data);
      const meta = data.metadata ?? {};
      const hasBday = !!(meta.birthMonth && meta.birthDay);
      const hasCity = !!(meta.city && meta.city.length > 0);
      // Already completed both → never show again
      if (hasBday && hasCity) return;
      // Pre-fill what we have
      if (meta.birthMonth) setMonth(meta.birthMonth);
      if (meta.birthDay)   setDay(meta.birthDay);
      if (meta.city)       setCity(meta.city);
      // Delay to avoid covering CTAs immediately on landing
      setTimeout(() => setOpen(true), 6000);
    }).catch(() => {});
  }, []);

  const dismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
    setOpen(false);
  };

  const submit = async () => {
    if (!month || !day || !city.trim()) return;
    setSaving(true);
    try {
      const res = await apiB2c().patch<MeResponse & { bonusAwarded?: boolean; bonusAmount?: number }>(
        "/api/auth/b2c/me",
        {
          birthMonth: Number(month),
          birthDay:   Number(day),
          city:       city.trim(),
        },
      );
      if (res?.bonusAwarded && res.bonusAmount) {
        setSuccess({ goins: res.bonusAmount });
      } else {
        setSuccess({ goins: 0 });
      }
    } catch {
      // silent fail — keep modal open so user can retry
    } finally {
      setSaving(false);
    }
  };

  if (!open && !success) return null;

  // Success state (replaces form for 3s)
  if (success) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div className="bg-card rounded-2xl border border-border max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-xl font-black mb-2">Thank you!</h3>
          {success.goins > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                We've added <span className="font-black text-amber-500">{success.goins} Goins</span> to your wallet.
              </p>
              <p className="text-xs text-muted-foreground">Use them on any Gifteeng order.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mb-4">Your profile has been updated.</p>
          )}
          <button
            onClick={() => { setSuccess(null); setOpen(false); dismiss(); }}
            className="mt-5 w-full py-2.5 rounded-xl bg-[#EF3752] text-white font-bold text-sm"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border border-border max-w-sm w-full overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-[#EF3752]/10 to-amber-500/10 px-6 pt-6 pb-4">
          <button
            onClick={dismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-card/60 hover:bg-card text-muted-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-black text-amber-600 uppercase tracking-wider">Earn 100 Goins</span>
          </div>
          <h2 className="text-xl font-black mb-1">Tell us a little about you</h2>
          <p className="text-sm text-muted-foreground">
            We'll wish you on your birthday and surface the right gifts.
          </p>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Birthday */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold mb-2">
              <Cake className="w-3.5 h-3.5 text-[#EF3752]" />
              Your birthday <span className="text-muted-foreground font-normal">(no year needed)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : "")}
                className="px-3 py-2.5 rounded-lg bg-muted border border-border text-sm font-medium"
              >
                <option value="">Month</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value ? Number(e.target.value) : "")}
                className="px-3 py-2.5 rounded-lg bg-muted border border-border text-sm font-medium"
              >
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
          </div>

          {/* City */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold mb-2">
              <MapPin className="w-3.5 h-3.5 text-[#EF3752]" />
              Your city
            </label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Mumbai, Bengaluru"
              maxLength={60}
              className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={dismiss}
              className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground text-sm font-bold hover:bg-muted"
            >
              Skip
            </button>
            <button
              onClick={submit}
              disabled={!month || !day || !city.trim() || saving}
              className="flex-[1.5] py-2.5 rounded-xl bg-[#EF3752] text-white text-sm font-black disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & Earn 100 Goins"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

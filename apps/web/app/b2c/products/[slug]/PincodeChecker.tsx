"use client";

// ─── Pincode delivery checker ─────────────────────────────────────────────
//
// Priority order for pincode resolution:
//   1. Last-used pincode in localStorage (instant, no network)
//   2. Browser geolocation (if permission already granted) → Nominatim reverse-geocode
//   3. User's default/first saved address from /api/addresses
//   4. Manual entry with optional 📍 button to trigger geolocation
//
// Shows delivery date returned by /api/shipping/check so the user sees
// "Delivered by Mon, 5 May" rather than a generic estimate.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { MapPin, Truck, Package, RotateCcw, Wallet, XCircle, Loader2, LocateFixed } from "lucide-react";

type DeliveryEstimate = {
  deliverable: boolean;
  pincode: string;
  city?: string;
  zone?: string;
  cod?: boolean;
  dispatchInBusinessDays?: number;
  deliveryInBusinessDays?: number;
  dispatchDate?: string;
  deliveryDate?: string;
  etaLabel?: string;
  message?: string;
};

const PINCODE_RE = /^\d{6}$/;
const LS_KEY = "gifteeng.pincode";

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "");

function prettyDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function PincodeChecker() {
  const [pincode, setPincode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeliveryEstimate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  // ref so inner async callbacks can read/write without stale closure issues
  const pincodeRef = useRef(pincode);
  pincodeRef.current = pincode;

  // ── Core check function ────────────────────────────────────────────────
  async function check(pin: string, opts: { silent?: boolean } = {}) {
    if (!PINCODE_RE.test(pin)) {
      if (!opts.silent) setErr("Enter a valid 6-digit pincode");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/shipping/check?pincode=${pin}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DeliveryEstimate;
      setResult(data);
      try { localStorage.setItem(LS_KEY, pin); } catch {}
    } catch {
      setErr("Couldn't check pincode. Please try again.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  // ── Geolocation → Nominatim reverse-geocode → pincode ─────────────────
  async function detectFromGeo(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        resolve(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
              { headers: { "Accept-Language": "en" } },
            );
            if (!res.ok) { resolve(false); return; }
            const data = await res.json() as { address?: { postcode?: string } };
            const pin = (data.address?.postcode ?? "").replace(/\D/g, "").slice(0, 6);
            if (pin && PINCODE_RE.test(pin)) {
              setPincode(pin);
              void check(pin, { silent: true });
              resolve(true);
              return;
            }
          } catch {}
          resolve(false);
        },
        () => resolve(false),
        { timeout: 10000, maximumAge: 600000 },
      );
    });
  }

  // ── Saved address fallback ─────────────────────────────────────────────
  async function tryLoadFromAddress() {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2c.token") : null;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/addresses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: unknown = await res.json();
      const addrs: Array<{ pincode?: string; isDefault?: boolean }> = Array.isArray(data)
        ? (data as typeof addrs)
        : ((data as { items?: typeof addrs }).items ?? []);
      const defaultAddr = addrs.find((a) => a.isDefault) ?? addrs[0];
      const pin = defaultAddr?.pincode ?? "";
      if (pin && PINCODE_RE.test(pin)) {
        setPincode(pin);
        void check(pin, { silent: true });
      }
    } catch {}
  }

  // ── On mount: resolve pincode from best available source ──────────────
  useEffect(() => {
    // 1. localStorage — instant
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && PINCODE_RE.test(saved)) {
        setPincode(saved);
        void check(saved, { silent: true });
        return;
      }
    } catch {}

    // 2. Geolocation — only if permission already granted (no popup on load)
    if (typeof navigator !== "undefined" && "permissions" in navigator) {
      void (async () => {
        try {
          const perm = await navigator.permissions.query({ name: "geolocation" });
          if (perm.state === "granted") {
            const found = await detectFromGeo();
            if (found) return;
          }
        } catch {}
        // 3. Saved addresses
        await tryLoadFromAddress();
      })();
      return;
    }

    // 3. Saved addresses (browsers without Permissions API)
    void tryLoadFromAddress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual geolocation button ──────────────────────────────────────────
  async function handleGeoDetect() {
    if (geoLoading || loading) return;
    setGeoLoading(true);
    setErr(null);
    const found = await detectFromGeo();
    if (!found) {
      setErr("Couldn't detect location. Enter pincode manually.");
    }
    setGeoLoading(false);
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <MapPin size={11} />
        Delivery to your pincode
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter 6-digit pincode"
          value={pincode}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
            setPincode(val);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void check(pincode);
            }
          }}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold tracking-wider focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition"
        />

        {/* Location detect button */}
        <button
          type="button"
          title="Detect my location"
          onClick={() => void handleGeoDetect()}
          disabled={geoLoading || loading}
          className="px-3 rounded-md border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/50 disabled:opacity-40 transition flex items-center justify-center"
        >
          {geoLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <LocateFixed className="w-4 h-4" />
          }
        </button>

        {/* Check button */}
        <button
          type="button"
          disabled={!PINCODE_RE.test(pincode) || loading}
          onClick={() => void check(pincode)}
          className="px-4 rounded-md text-sm font-black text-primary-foreground disabled:opacity-40 transition-opacity inline-flex items-center gap-1.5"
          style={{ background: "hsl(351 85% 58%)" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? "Checking…" : "Check"}
        </button>
      </div>

      {err && (
        <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">
          <XCircle className="w-3 h-3" />
          {err}
        </p>
      )}

      {result && !loading && (
        <div className="mt-3 space-y-2.5">
          {result.deliverable ? (
            <>
              {/* Hero delivery line */}
              <div className="flex items-start gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 px-3 py-2.5">
                <Truck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-black text-emerald-800 dark:text-emerald-300">
                    {result.etaLabel ?? `Delivers in ${result.deliveryInBusinessDays} business days`}
                  </p>
                  {result.city && (
                    <p className="text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-400/70 mt-0.5">
                      {result.city}
                      {result.zone ? ` · ${result.zone} zone` : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* Dispatch + delivered-by chips */}
              {result.dispatchDate && result.deliveryDate && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border bg-background p-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      <Package className="w-2.5 h-2.5" />
                      Dispatched by
                    </p>
                    <p className="text-[12px] font-bold text-foreground">{prettyDate(result.dispatchDate)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      ~{result.dispatchInBusinessDays} business day{result.dispatchInBusinessDays === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background p-2.5">
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      <Truck className="w-2.5 h-2.5" />
                      Delivered by
                    </p>
                    <p className="text-[12px] font-bold text-foreground">{prettyDate(result.deliveryDate)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      on or before this date
                    </p>
                  </div>
                </div>
              )}

              {/* Feature chips */}
              <div className="flex flex-wrap gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${
                    result.cod
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  <Wallet className="w-2.5 h-2.5" />
                  {result.cod ? "Cash on Delivery available" : "Prepaid only"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-2.5 py-1 text-[10px] font-black dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/40">
                  <RotateCcw className="w-2.5 h-2.5" />
                  Easy 7-day returns
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/40 px-3 py-2.5">
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-black text-red-800 dark:text-red-300">
                  Not deliverable to this pincode
                </p>
                {result.message && (
                  <p className="text-[11px] font-semibold text-red-700/80 dark:text-red-400/70 mt-0.5">
                    {result.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PincodeChecker;

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight, Lock, CheckCircle2, Loader2, Sparkles,
  CreditCard, ShoppingBag, ArrowLeft, Gift, User, Package,
  Coins, Tag, Receipt, Mail, AlertTriangle, Truck, RotateCcw,
} from "lucide-react";
import { cartFetch, ensureCartSessionKey, getB2cToken, API_BASE_URL } from "@/lib/api";
import { useCartStore, onB2cLogin } from "@/lib/stores/cart";

// ── Types ─────────────────────────────────────────────────────────────────────
type Address = {
  fullName: string; line1: string; city: string; state: string;
  pincode: string; phone: string; email: string;
};
function emptyAddress(): Address {
  return { fullName: "", line1: "", city: "", state: "", pincode: "", phone: "", email: "" };
}
function parsePrice(label: string): number {
  const n = parseFloat(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ── Delivery helpers ──────────────────────────────────────────────────────────
const MUMBAI_MIN_DAYS = 3, MAHA_MIN_DAYS = 5, ROI_MIN_DAYS = 7;
function getMinDays(city: string, state: string) {
  const c = city.toLowerCase(), s = state.toLowerCase();
  if (c.includes("mumbai") || c.includes("thane") || c.includes("navi mumbai"))
    return { days: MUMBAI_MIN_DAYS, note: `Mumbai / MMR: delivered in ${MUMBAI_MIN_DAYS} business days` };
  if (s === "maharashtra")
    return { days: MAHA_MIN_DAYS, note: `Maharashtra: delivered in ${MAHA_MIN_DAYS} business days` };
  return { days: ROI_MIN_DAYS, note: "Rest of India: 5–7 business days" };
}
function addDays(date: Date, n: number): Date { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function toDateInput(d: Date): string { return d.toISOString().slice(0, 10); }

// ── Pincode lookup ────────────────────────────────────────────────────────────
async function lookupPincode(pin: string): Promise<{ city: string; state: string } | null> {
  if (!/^\d{6}$/.test(pin)) return null;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    if (!res.ok) return null;
    const data = await res.json() as Array<{ Status: string; PostOffice: Array<{ District: string; State: string }> }>;
    if (data[0]?.Status !== "Success") return null;
    const po = data[0].PostOffice?.[0];
    return po ? { city: po.District, state: po.State } : null;
  } catch { return null; }
}

// ── GSTIN ─────────────────────────────────────────────────────────────────────
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
async function lookupGstin(gstin: string): Promise<{ name: string } | null> {
  if (!GSTIN_RE.test(gstin)) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/gst/verify?gstin=${encodeURIComponent(gstin)}`);
    if (!res.ok) return null;
    const data = await res.json() as { ok?: boolean; name?: string };
    return data?.ok && data?.name ? { name: data.name } : null;
  } catch { return null; }
}

// ── Step bar ──────────────────────────────────────────────────────────────────
function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const STEPS = ["Contact", "Delivery", "Payment"];
  return (
    <div className="flex items-center justify-center gap-0 py-5">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all
                ${done ? "bg-[#EF3752] text-white shadow-sm"
                  : active ? "bg-[#EF3752] text-white shadow-sm"
                  : "bg-muted text-muted-foreground"}`}>
                {done ? <CheckCircle2 className="w-4.5 h-4.5" /> : n}
              </div>
              <span className={`text-[11px] font-bold tracking-wide ${active ? "text-[#EF3752]" : done ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                {label}
              </span>
            </div>
            {i < 2 && (
              <div className={`w-14 md:w-24 h-0.5 mx-1 mb-5 transition-colors ${n < step ? "bg-[#EF3752]" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
const bigInput = "w-full rounded-xl border border-border bg-card px-4 py-[11px] text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#EF3752] transition-all";
const bigInputRO = "w-full rounded-xl border border-border bg-card px-4 py-[11px] text-[15px] text-muted-foreground opacity-70";

function BField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-bold text-foreground mb-2">{label}</p>
      {children}
      {hint && <p className="mt-2 text-xs text-amber-600 font-medium">{hint}</p>}
    </div>
  );
}

function BigBtn({ onClick, disabled, loading, children, variant = "primary" }: {
  onClick?: () => void; disabled?: boolean; loading?: boolean;
  children: React.ReactNode; variant?: "primary" | "outline";
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      className={`w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50
        ${variant === "primary"
          ? "text-white bg-[#EF3752]"
          : "bg-muted border border-border text-foreground"}`}>
      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
    </button>
  );
}

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-black text-foreground">{title}</h2>
          {sub && <p className="text-sm text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Pincode field ─────────────────────────────────────────────────────────────
function PincodeInput({ value, onChange, onResolved }: {
  value: string; onChange: (v: string) => void; onResolved: (c: string, s: string) => void;
}) {
  const [looking, setLooking] = useState(false);
  const [err, setErr] = useState("");
  const handle = useCallback(async (raw: string) => {
    const pin = raw.replace(/\D/g, "").slice(0, 6);
    onChange(pin); setErr("");
    if (pin.length === 6) {
      setLooking(true);
      const r = await lookupPincode(pin);
      setLooking(false);
      if (r) { onResolved(r.city, r.state); }
      else { setErr("Pincode not found — enter city & state below"); onResolved("", ""); }
    }
  }, [onChange, onResolved]);
  return (
    <div className="relative">
      <input className={bigInput} value={value} onChange={e => handle(e.target.value)}
        placeholder="6-digit pincode" inputMode="numeric" maxLength={6} />
      {looking && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-primary" />}
      {err && <p className="mt-1.5 text-xs text-amber-600">{err}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore(s => s.items);
  const addons = useCartStore(s => s.addons);
  const setAddon = useCartStore(s => s.setAddon);
  const clearCart = useCartStore(s => s.clear);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [authed, setAuthed] = useState(false);
  // cartReady: false until we've checked / synced the server cart so we don't
  // redirect logged-in users to /cart before onB2cLogin() restores their items.
  const [cartReady, setCartReady] = useState(false);

  // OTP
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  // Track the phone that was verified so we can auto-reset if user edits it
  const verifiedPhoneRef = useRef<string | null>(null);

  // Address
  const [addr, setAddr] = useState<Address>(emptyAddress());
  const [isGift, setIsGift] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState<Address>(emptyAddress());

  // GST
  const [gstRequired, setGstRequired] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [gstLookup, setGstLookup] = useState<"idle" | "loading" | "ok" | "error" | "invalid">("idle");

  const handleVerifyGstin = useCallback(async () => {
    if (!GSTIN_RE.test(gstin)) { setGstLookup("invalid"); return; }
    setGstLookup("loading");
    const r = await lookupGstin(gstin);
    if (r) { setCompanyName(r.name); setGstLookup("ok"); } else setGstLookup("error");
  }, [gstin]);

  // Delivery date
  const [deliveryDate, setDeliveryDate] = useState("");
  const [removePrice, setRemovePrice] = useState(false);
  const [giftWrap, setGiftWrap] = useState(false);

  // Thank-you cards
  type TyCard = {
    id: string; size: string; template_label?: string | null; template_image?: string | null;
    background_image?: string | null; foreground_image?: string | null; price: number;
    text_area_x: number; text_area_y: number; text_area_width: number; text_area_height: number;
    max_font_size: number; text_color: string; text_align: string; is_active: boolean;
  };
  const [tyCards, setTyCards] = useState<TyCard[]>([]);
  const [tyCardId, setTyCardId] = useState<string | null>(null);
  const [tyMessage, setTyMessage] = useState("");
  const selectedTyCard = useMemo(() => tyCards.find(c => c.id === tyCardId) ?? null, [tyCards, tyCardId]);

  // Coins
  const [coinBalance, setCoinBalance] = useState(0);
  const [coinsApplied, setCoinsApplied] = useState(true);

  // Referral
  const [referral, setReferral] = useState("");
  const [referralMsg, setReferralMsg] = useState<string | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Payment method & site settings
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "razorpay">("cod");
  // Seed key_id from the NEXT_PUBLIC env var (baked at build time) so Razorpay
  // works even before the admin saves settings in the DB for the first time.
  const [publicSettings, setPublicSettings] = useState({
    cod_enabled: "true",
    cod_charge: "50",
    razorpay_enabled: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ? "true" : "false",
    razorpay_key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "",
    delivery_charge: "0",
    free_delivery_above: "499",
  });

  // ── Init ──
  // D1: re-sync server cart on mount (removes ghost/stale items from old sessions)
  // D2: auto-verify phone & pre-fill profile for already-logged-in users
  useEffect(() => {
    const token = getB2cToken();
    const sessionKey = ensureCartSessionKey();
    setAuthed(!!token);

    if (!token) {
      setCartReady(true); // guest — Zustand/localStorage is already the truth
      return;
    }

    // D2: already logged in → no OTP needed
    setOtpVerified(true);

    // D1: pull server-side cart to replace stale local state.
    // Mark cart ready AFTER the sync so we don't redirect before items arrive.
    void onB2cLogin(sessionKey).finally(() => setCartReady(true));

    // D2 + address auto-fill: load profile to pre-fill Step 1 fields
    void (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/auth/b2c/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const c = await r.json() as { fullName?: string | null; phone?: string | null; email?: string | null };
        const phone = (c.phone ?? "").replace(/^\+91/, "").replace(/\D/g, "").slice(0, 10);
        setAddr(a => ({
          ...a,
          fullName: a.fullName || (c.fullName ?? ""),
          phone:    a.phone    || phone,
          email:    a.email    || (c.email ?? ""),
        }));
        // Record this as the verified phone so we can detect manual edits
        if (phone) verifiedPhoneRef.current = phone;
      } catch { /* silent */ }
    })();

    // Address auto-fill: load first saved address for Step 2 delivery form
    void (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/addresses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return;
        const data: unknown = await r.json();
        const list: Array<{
          name?: string; phone?: string; line1?: string;
          city?: string; state?: string; pincode?: string; isDefault?: boolean;
        }> = Array.isArray(data) ? data as typeof list : ((data as { items?: typeof list }).items ?? []);
        const def = list.find(a => a.isDefault) ?? list[0];
        if (!def) return;
        setAddr(a => ({
          ...a,
          fullName: a.fullName || def.name || "",
          phone:    a.phone    || (def.phone?.replace(/^\+91/, "").replace(/\D/g, "").slice(0, 10) ?? ""),
          line1:    a.line1    || def.line1   || "",
          city:     a.city     || def.city    || "",
          state:    a.state    || def.state   || "",
          pincode:  a.pincode  || def.pincode || "",
        }));
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user types a different phone after auto-verification, reset OTP state
  // so they must re-verify the new number before proceeding.
  useEffect(() => {
    if (!otpVerified) return;
    if (verifiedPhoneRef.current === null) return;
    if (addr.phone && addr.phone !== verifiedPhoneRef.current) {
      setOtpVerified(false);
      setOtpSent(false);
      setOtpCode("");
      setOtpError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr.phone]);

  // Load public settings (COD charge, Razorpay toggle, key id)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings/public`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPublicSettings(d as typeof publicSettings); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect if cart empty — only after cart sync completes so logged-in users
  // aren't bounced before onB2cLogin() restores their server-side items.
  useEffect(() => {
    if (!cartReady) return;
    if (items.length === 0) {
      const t = setTimeout(() => router.replace("/cart"), 300);
      return () => clearTimeout(t);
    }
  }, [cartReady, items.length, router]);

  // Load thank-you cards
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/thank-you-cards`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list: TyCard[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setTyCards(list.filter(c => c.is_active));
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load coin balance
  useEffect(() => {
    const token = getB2cToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE_URL}/api/coins/balance`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const d = await r.json() as { balance?: number };
        if (!cancelled && d?.balance !== undefined) setCoinBalance(d.balance);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [authed]);

  // Auto-apply coins
  useEffect(() => {
    if (!coinsApplied || coinBalance <= 0 || subtotal <= 0) {
      if ((addons.coinsToRedeem ?? 0) > 0) {
        setAddon("coinsToRedeem", 0); setAddon("coinDiscountInr", 0);
      }
      return;
    }
    const maxByBalance = coinBalance;
    // Single source of truth: 100 G = ₹1 (Deploy 97). Keep the 20 % cart cap.
    const COIN_VALUE_INR = 0.01;
    const maxByCap = Math.floor((subtotal * 0.20) / COIN_VALUE_INR);
    const coins = Math.max(0, Math.min(maxByBalance, maxByCap));
    const discount = Math.round(coins * COIN_VALUE_INR * 100) / 100;
    if (coins !== (addons.coinsToRedeem ?? 0)) { setAddon("coinsToRedeem", coins); setAddon("coinDiscountInr", discount); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinsApplied, coinBalance, items]);

  const deliveryInfo = useMemo(() => {
    const a = isGift ? giftRecipient : addr;
    if (!a.city && !a.state) return null;
    return getMinDays(a.city, a.state);
  }, [addr, giftRecipient, isGift]);

  const minDeliveryDate = useMemo(
    () => deliveryInfo ? toDateInput(addDays(new Date(), deliveryInfo.days)) : toDateInput(addDays(new Date(), ROI_MIN_DAYS)),
    [deliveryInfo],
  );

  // Pre-fill delivery date with the minimum allowed date when it first becomes available
  useEffect(() => {
    if (minDeliveryDate && !deliveryDate) setDeliveryDate(minDeliveryDate);
  }, [minDeliveryDate]);

  const subtotal = useMemo(() => items.reduce((a, i) => a + parsePrice(i.priceLabel) * i.quantity, 0), [items]);
  const coinDiscount = addons.coinDiscountInr ?? 0;
  const giftWrapFee = (addons.giftWrap || giftWrap) ? (addons.giftWrapPrice ?? 49) : 0;
  const tyCardFee = selectedTyCard ? selectedTyCard.price : 0;
  const delivery = subtotal >= 499 ? 0 : 59;
  // COD handling fee — shown as informational surcharge (collected on delivery)
  const codFee = paymentMethod === "cod" ? (parseFloat(publicSettings.cod_charge) || 0) : 0;
  const total = Math.max(0, subtotal + giftWrapFee + tyCardFee + delivery + codFee - coinDiscount);

  // ── OTP ──
  async function requestOtp() {
    if (!addr.phone.trim()) { setOtpError("Enter your phone number first"); return; }
    setOtpError(null); setOtpLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/b2c/otp/request`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: addr.phone }),
      });
      if (!res.ok) throw new Error();
      setOtpSent(true);
    } catch { setOtpError("Could not send OTP. Try again."); }
    finally { setOtpLoading(false); }
  }

  async function verifyOtp() {
    setOtpError(null); setOtpLoading(true);
    try {
      const sessionKey = ensureCartSessionKey();
      const res = await fetch(`${API_BASE_URL}/api/auth/b2c/otp/verify`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Cart-Session": sessionKey },
        body: JSON.stringify({ phone: addr.phone, code: otpCode }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { accessToken: string };
      localStorage.setItem("gifteeng.b2c.token", data.accessToken);
      window.dispatchEvent(new CustomEvent("b2c-auth-change"));
      await onB2cLogin(sessionKey);
      setAuthed(true);
      setOtpVerified(true);
      verifiedPhoneRef.current = addr.phone;
    } catch { setOtpError("Invalid OTP. Try again."); }
    finally { setOtpLoading(false); }
  }

  async function applyReferral() {
    setReferralMsg(null);
    if (!referral.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/discounts/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: referral }),
      });
      setReferralMsg(res.ok ? "✓ Code applied!" : "Invalid code.");
    } catch { setReferralMsg("Could not validate."); }
  }

  // ── Validation ──
  function validateStep1(): string | null {
    if (!addr.fullName.trim()) return "Please enter your full name";
    if (!addr.phone.trim()) return "Please enter your phone number";
    return null;
  }

  function validateStep2(): string | null {
    if (isGift) {
      if (!giftRecipient.fullName.trim()) return "Enter recipient's name";
      if (!giftRecipient.phone.trim()) return "Enter recipient's phone";
      if (!giftRecipient.pincode.trim()) return "Enter recipient's pincode";
      if (!giftRecipient.line1.trim()) return "Enter recipient's address";
      if (!giftRecipient.city.trim()) return "Enter recipient's city";
      if (!giftRecipient.state.trim()) return "Enter recipient's state";
    } else {
      if (!addr.pincode.trim()) return "Enter your pincode";
      if (!addr.line1.trim()) return "Enter your address";
      if (!addr.city.trim()) return "City is required (auto-filled from pincode)";
      if (!addr.state.trim()) return "State is required (auto-filled from pincode)";
    }
    if (gstRequired) {
      if (!companyName.trim()) return "Enter company name for GST invoice";
      if (!gstin.trim()) return "Enter GSTIN for GST invoice";
    }
    return null;
  }

  function handleNext1() {
    setFormError(null);
    const e = validateStep1();
    if (e) { setFormError(e); return; }
    if (!authed && !otpVerified) {
      setFormError("Please verify your phone number with OTP to continue");
      return;
    }
    setStep(2);
  }

  function handleNext2() {
    setFormError(null);
    const e = validateStep2();
    if (e) { setFormError(e); return; }
    setStep(3);
  }

  // ── Razorpay helpers ──
  function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).Razorpay) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      document.body.appendChild(s);
    });
  }

  async function openRazorpayCheckout(
    orderId: string,
    orderSlug: string,
    rzpOrder: { id: string; amount: number; currency: string },
  ) {
    await loadRazorpayScript();
    return new Promise<void>((resolve, reject) => {
      const opts = {
        key: publicSettings.razorpay_key_id || (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? ""),
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        order_id: rzpOrder.id,
        name: "Gifteeng",
        description: "Gifteeng Gift Order",
        prefill: {
          name: addr.fullName,
          contact: addr.phone ? `+91${addr.phone}` : undefined,
          email: addr.email || undefined,
        },
        theme: { color: "#EF3752" },
        handler: async (res: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await cartFetch("/checkout/razorpay/capture", {
              method: "POST",
              body: JSON.stringify({
                razorpay_order_id: res.razorpay_order_id,
                razorpay_payment_id: res.razorpay_payment_id,
                razorpay_signature: res.razorpay_signature,
              }),
              authed,
            });
            clearCart();
            router.push(`/orders/${orderSlug}/success`);
            resolve();
          } catch {
            setError(
              `Payment captured but verification failed. ` +
              `Save your payment ID: ${res.razorpay_payment_id} and contact support.`
            );
            setSubmitting(false);
            reject(new Error("capture_failed"));
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            setError("Payment was cancelled. Please try again.");
            // Track abandonment so admin sees it in the activity feed.
            if (typeof window !== "undefined" && (window as { gifteengTrack?: (e: string, p?: Record<string, unknown>) => void }).gifteengTrack) {
              (window as { gifteengTrack?: (e: string, p?: Record<string, unknown>) => void }).gifteengTrack!("payment_dismissed", {
                gateway: "razorpay",
                orderId,
              });
            }
            reject(new Error("dismissed"));
          },
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rzp = new (window as any).Razorpay(opts);

      // Hook Razorpay's failure event — fired when Razorpay rejects the
      // payment (card declined, insufficient funds, OTP timeout, etc.).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rzp.on("payment.failed", (resp: any) => {
        const err = resp?.error ?? {};
        if (typeof window !== "undefined" && (window as { gifteengTrack?: (e: string, p?: Record<string, unknown>) => void }).gifteengTrack) {
          (window as { gifteengTrack?: (e: string, p?: Record<string, unknown>) => void }).gifteengTrack!("payment_failed", {
            gateway:     "razorpay",
            orderId,
            code:        err.code        ?? "UNKNOWN",
            description: (err.description ?? "").slice(0, 200),
            source:      err.source      ?? "",
            step:        err.step        ?? "",
            reason:      err.reason      ?? "",
            paymentId:   err.metadata?.payment_id ?? "",
          });
        }
      });

      rzp.open();
    });
  }

  // ── Place order ──
  async function placeOrder() {
    setError(null); setSubmitting(true);
    try {
      // ── Step 1: Sync local cart → server ───────────────────────────────
      // The checkout API reads items from the server-side cart DB, not from
      // the request body. We must flush any stale items and replace with
      // exactly what the user sees on screen before calling /place.
      if (authed) {
        await cartFetch("/cart/items", { method: "DELETE", authed: true });
        for (const item of items) {
          await cartFetch("/cart/items", {
            method: "POST",
            authed: true,
            body: JSON.stringify({
              productId: item.productId,
              qty: item.quantity,
              variantOptions: item.variantOptions ?? undefined,
              customization: item.customization ?? undefined,
            }),
          });
        }
      }

      // ── Step 2: Place order ─────────────────────────────────────────────
      const shippingAddr = { ...addr, country: "IN" };
      const deliveryAddr = isGift ? { ...giftRecipient, country: "IN" } : shippingAddr;
      const body = {
        shippingAddress: deliveryAddr,
        billingAddress: shippingAddr,
        discountCode: referral || undefined,
        paymentMethod,
        preferredDeliveryDate: deliveryDate || undefined,
        removePrice,
        addons: {
          giftWrap: addons.giftWrap || giftWrap,
          giftWrapPrice: giftWrapFee,
          thankYouMessage: tyMessage.trim() || addons.thankYouMessage || undefined,
          thankYouTemplateId: tyCardId || addons.thankYouTemplateId || undefined,
          thankYouCardFee: tyCardFee,
          coinsToRedeem: addons.coinsToRedeem || 0,
          coinDiscountInr: addons.coinDiscountInr || 0,
        },
        gstin: gstRequired ? gstin : undefined,
        companyName: gstRequired ? companyName : undefined,
      };
      const result = await cartFetch<{
        order: { id: string; orderNumber?: string };
        razorpayOrder?: { id: string; amount: number; currency: string };
      }>("/checkout/b2c/place", {
        method: "POST", body: JSON.stringify(body), authed,
      });

      if (paymentMethod === "razorpay" && result.razorpayOrder) {
        // Razorpay modal takes over — handler calls clearCart + redirect.
        // Don't setSubmitting(false) here; modal's ondismiss handles that.
        await openRazorpayCheckout(result.order.id, result.order.orderNumber ?? result.order.id, result.razorpayOrder);
        return;
      }

      // COD — done immediately
      clearCart();
      router.push(`/orders/${result.order.orderNumber ?? result.order.id}/success`);
    } catch (err) {
      // Surface the actual server error instead of the old catch-all string,
      // so users (and us) can tell empty-cart from invalid-address from
      // out-of-stock etc.
      const e = err as { body?: { message?: string; errors?: unknown }; message?: string };
      const msg =
        e?.body?.message ??
        (typeof e?.body?.errors === "string" ? e.body.errors : undefined) ??
        e?.message ??
        "Could not place order. Please check your details and try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Empty cart state (only render after cart sync so logged-in users don't
  //    see this flash before server items are restored) ──
  if (cartReady && items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background px-6">
        <ShoppingBag className="w-16 h-16 text-gray-300" />
        <div className="text-center">
          <p className="text-lg font-bold text-gray-700">Your cart is empty</p>
          <p className="text-sm text-gray-400 mt-1">Add items before checking out</p>
        </div>
        <Link href="/products"
          className="h-11 px-5 rounded-xl text-white font-bold text-sm flex items-center gap-2 bg-[#EF3752]">
          Browse Gifts <ChevronRight className="w-5 h-5" />
        </Link>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4" style={{ paddingTop: "72px", paddingBottom: "48px" }}>

        <StepBar step={step} />

        {/* ════════════════════════ STEP 1: CONTACT ════════════════════════ */}
        {step === 1 && (
          <div className="space-y-5">
            <SectionHead icon={<User className="h-5 w-5 text-primary" strokeWidth={1.75} />} title="Who's ordering?" sub="Your contact details" />

            {/* Full Name */}
            <BField label="Full Name *">
              <input className={bigInput} value={addr.fullName}
                onChange={e => setAddr(a => ({ ...a, fullName: e.target.value }))}
                placeholder="Enter your full name" autoComplete="name" />
            </BField>

            {/* Phone + OTP */}
            <BField label="Phone Number *">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input className={`${bigInput} flex-1`} type="tel" inputMode="numeric"
                    value={addr.phone}
                    onChange={e => setAddr(a => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    placeholder="10-digit number"
                    autoComplete="tel" />
                  {!otpVerified && (
                    <button type="button" onClick={otpSent ? undefined : requestOtp}
                      disabled={otpLoading}
                      className="shrink-0 px-5 rounded-xl font-bold text-sm text-white bg-[#EF3752] transition-colors disabled:opacity-50 whitespace-nowrap">
                      {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : otpSent ? "Resend" : "Verify"}
                    </button>
                  )}
                  {otpVerified && (
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <div className="h-11 px-4 rounded-xl bg-muted border border-border flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-bold text-emerald-500">Verified</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpVerified(false);
                          setOtpSent(false);
                          setOtpCode("");
                          setOtpError(null);
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>
                {otpSent && !otpVerified && (
                  <div className="flex gap-2">
                    <input className={`${bigInput} flex-1 tracking-[0.3em] text-center font-bold`}
                      value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Enter OTP" maxLength={6} inputMode="numeric" />
                    <button type="button" onClick={verifyOtp} disabled={otpLoading || otpCode.length < 4}
                      className="shrink-0 h-11 px-5 rounded-xl text-white font-bold text-sm bg-[#EF3752] disabled:opacity-50">
                      {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
                    </button>
                  </div>
                )}
                {otpError && <p className="text-sm text-red-500">{otpError}</p>}
              </div>
            </BField>

            {/* Email */}
            <BField label="Email (for order updates)">
              <input className={bigInput} type="email" value={addr.email}
                onChange={e => setAddr(a => ({ ...a, email: e.target.value }))}
                placeholder="your@email.com" autoComplete="email" />
            </BField>

            {formError && <ErrorBox>{formError}</ErrorBox>}
            <BigBtn onClick={handleNext1}>
              Continue to Delivery <ChevronRight className="w-5 h-5" />
            </BigBtn>
          </div>
        )}

        {/* ════════════════════════ STEP 2: DELIVERY ════════════════════════ */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Back */}
            <button type="button" onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground font-semibold -mb-1">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <SectionHead icon={<Package className="h-5 w-5 text-primary" strokeWidth={1.75} />} title="Delivery address" sub="Where should we send it?" />

            {/* Gift toggle */}
            <button type="button" onClick={() => setIsGift(g => !g)}
              className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition-all text-left ${isGift ? "bg-[#EF3752]/10 border-[#EF3752]/30" : "bg-muted border-border"}`}>
              <div className={`relative w-12 h-6 rounded-full shrink-0 transition-colors ${isGift ? "bg-[#EF3752]" : "bg-[#1E2030]"}`}>
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isGift ? "translate-x-6" : ""}`} />
              </div>
              <Gift className="w-5 h-5 text-[#EF3752] shrink-0" />
              <div>
                <p className="text-[15px] font-bold text-gray-800">Buying this as a gift?</p>
                <p className="text-xs text-gray-400 mt-0.5">Deliver to recipient's address</p>
              </div>
            </button>

            {/* Recipient details when gift */}
            {isGift && (
              <div className="rounded-2xl bg-card border border-border p-4 space-y-4">
                <p className="text-xs font-bold text-[#EF3752] uppercase tracking-wider flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5" /> Recipient Details
                </p>
                <BField label="Recipient's Name *">
                  <input className={bigInput} value={giftRecipient.fullName}
                    onChange={e => setGiftRecipient(a => ({ ...a, fullName: e.target.value }))}
                    placeholder="Who's receiving the gift?" />
                </BField>
                <BField label="Recipient's Phone *">
                  <input className={bigInput} type="tel" value={giftRecipient.phone}
                    onChange={e => setGiftRecipient(a => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    placeholder="10-digit number" />
                </BField>
                <BField label="Pincode *">
                  <PincodeInput value={giftRecipient.pincode}
                    onChange={v => setGiftRecipient(a => ({ ...a, pincode: v }))}
                    onResolved={(city, state) => setGiftRecipient(a => ({ ...a, city, state }))} />
                </BField>
                <BField label="Address *">
                  <input className={bigInput} value={giftRecipient.line1}
                    onChange={e => setGiftRecipient(a => ({ ...a, line1: e.target.value }))}
                    placeholder="House no., street, area" />
                </BField>
                <div className="grid grid-cols-2 gap-3">
                  <BField label="City *">
                    {giftRecipient.city
                      ? <div className={bigInputRO}>{giftRecipient.city}</div>
                      : <input className={bigInput} value={giftRecipient.city}
                          onChange={e => setGiftRecipient(a => ({ ...a, city: e.target.value }))} placeholder="City" />}
                  </BField>
                  <BField label="State *">
                    {giftRecipient.state
                      ? <div className={bigInputRO}>{giftRecipient.state}</div>
                      : <input className={bigInput} value={giftRecipient.state}
                          onChange={e => setGiftRecipient(a => ({ ...a, state: e.target.value }))} placeholder="State" />}
                  </BField>
                </div>
              </div>
            )}

            {/* Your address when not gift */}
            {!isGift && (
              <>
                <BField label="Pincode *">
                  <PincodeInput value={addr.pincode}
                    onChange={v => setAddr(a => ({ ...a, pincode: v }))}
                    onResolved={(city, state) => setAddr(a => ({ ...a, city, state }))} />
                </BField>
                <BField label="Address *">
                  <input className={bigInput} value={addr.line1}
                    onChange={e => setAddr(a => ({ ...a, line1: e.target.value }))}
                    placeholder="House no., street, area" autoComplete="address-line1" />
                </BField>
                <div className="grid grid-cols-2 gap-3">
                  <BField label="City *">
                    {addr.city
                      ? <div className={bigInputRO}>{addr.city}</div>
                      : <input className={bigInput} value={addr.city}
                          onChange={e => setAddr(a => ({ ...a, city: e.target.value }))} placeholder="City" />}
                  </BField>
                  <BField label="State *">
                    {addr.state
                      ? <div className={bigInputRO}>{addr.state}</div>
                      : <input className={bigInput} value={addr.state}
                          onChange={e => setAddr(a => ({ ...a, state: e.target.value }))} placeholder="State" />}
                  </BField>
                </div>
              </>
            )}

            {/* Preferred delivery date */}
            {deliveryInfo && (
              <BField label="Preferred Delivery Date" hint={deliveryInfo.note}>
                <input className={bigInput} type="date" value={deliveryDate}
                  min={minDeliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </BField>
            )}

            {/* Divider */}
            <div className="border-t border-border pt-2">
              <p className="text-sm font-bold text-muted-foreground mb-4">Add-ons</p>
            </div>

            {/* Gift wrap */}
            <label className="flex items-center gap-4 rounded-xl bg-muted border border-border px-4 py-3 cursor-pointer transition-all">
              <Gift className="h-5 w-5 text-[#EF3752] shrink-0" strokeWidth={1.75} />
              <div className="flex-1">
                <p className="text-[15px] font-bold text-gray-800">Add Gift Wrap</p>
                <p className="text-xs text-gray-400">Premium gift wrapping</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-foreground">+₹49</span>
                <input type="checkbox" checked={giftWrap || addons.giftWrap}
                  onChange={e => setGiftWrap(e.target.checked)}
                  className="w-5 h-5 accent-primary rounded-md" />
              </div>
            </label>

            {/* Coins */}
            <label className={`flex items-center gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
              coinBalance > 0 ? "bg-muted border-border" : "bg-muted border-border opacity-60 cursor-not-allowed"
            }`}>
              <Coins className="h-5 w-5 text-amber-500 shrink-0" strokeWidth={1.75} />
              <div className="flex-1">
                <p className="text-[15px] font-bold text-gray-800">Gifteeng Coins</p>
                <p className="text-xs text-gray-500">
                  {!authed ? "Sign in to use coins"
                    : coinBalance === 0 ? "0 coins · earn by shopping"
                    : coinsApplied && coinDiscount > 0 ? `${addons.coinsToRedeem} coins applied = -₹${coinDiscount.toFixed(0)}`
                    : `${coinBalance} coins (worth ₹${(coinBalance * 0.01).toFixed(2)})`}
                </p>
              </div>
              {coinsApplied && coinDiscount > 0 && (
                <span className="text-sm font-bold text-foreground shrink-0">-₹{coinDiscount.toFixed(0)}</span>
              )}
              <input type="checkbox" disabled={coinBalance === 0}
                checked={coinsApplied && coinBalance > 0}
                onChange={e => setCoinsApplied(e.target.checked)}
                className="w-5 h-5 accent-[#EF3752] rounded-md disabled:opacity-40" />
            </label>

            {/* Thank-you card */}
            {tyCards.length > 0 && (
              <div>
                <p className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Mail className="h-4 w-4" strokeWidth={1.75} />
                  Add a Thank-You Card
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {tyCards.map(card => (
                    <button key={card.id} type="button"
                      onClick={() => setTyCardId(p => p === card.id ? null : card.id)}
                      className={`rounded-lg overflow-hidden text-left transition-all border-2 ${
                        tyCardId === card.id ? "border-[#EF3752]" : "border-border"
                      }`}>
                      <div className="aspect-[3/4] bg-muted/30 flex items-center justify-center overflow-hidden">
                        {card.template_image || card.background_image
                          ? <img src={card.template_image || card.background_image || ""} alt="" className="w-full h-full object-cover" />
                          : <CreditCard className="w-6 h-6 text-gray-300" />}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] font-semibold text-foreground truncate">{card.template_label || card.size}</p>
                        <p className="text-[10px] font-bold text-foreground">+₹{card.price}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {selectedTyCard && (
                  <div className="mt-3">
                    <textarea value={tyMessage}
                      onChange={e => setTyMessage(e.target.value.slice(0, 200))}
                      placeholder="Your heartfelt message..."
                      rows={3} className={`${bigInput} resize-none`} />
                  </div>
                )}
              </div>
            )}

            {/* Extras */}
            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-4 py-3 cursor-pointer">
                <input type="checkbox" checked={removePrice} onChange={e => setRemovePrice(e.target.checked)}
                  className="w-5 h-5 accent-[#EF3752] rounded-md" />
                <span className="text-[15px] text-foreground font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                  Remove price from package
                </span>
              </label>
              <label className="flex items-center gap-4 py-3 cursor-pointer">
                <input type="checkbox" checked={gstRequired} onChange={e => setGstRequired(e.target.checked)}
                  className="w-5 h-5 accent-[#EF3752] rounded-md" />
                <span className="text-[15px] text-foreground font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                  I need a GST invoice
                </span>
              </label>
            </div>

            {gstRequired && (
              <div className="space-y-4 rounded-2xl bg-card border border-border p-4">
                <BField label="GSTIN *">
                  <div className="flex gap-2">
                    <input className={`${bigInput} flex-1`} value={gstin}
                      onChange={e => { setGstin(e.target.value.toUpperCase()); setGstLookup("idle"); }}
                      placeholder="27XXXXX1234X1ZX" maxLength={15} />
                    <button type="button" onClick={handleVerifyGstin} disabled={gstLookup === "loading" || !gstin}
                      className="shrink-0 h-10 px-4 rounded-xl text-white text-sm font-bold disabled:opacity-50 bg-[#EF3752]">
                      {gstLookup === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                    </button>
                  </div>
                  {gstLookup === "ok" && <p className="mt-1.5 text-xs text-green-600">✓ Verified</p>}
                  {gstLookup === "error" && <p className="mt-1.5 text-xs text-amber-600">Enter company name manually</p>}
                </BField>
                <BField label="Company Name *">
                  <input className={bigInput} value={companyName} onChange={e => setCompanyName(e.target.value)}
                    placeholder="Your Company Pvt Ltd" />
                </BField>
              </div>
            )}

            {formError && <ErrorBox>{formError}</ErrorBox>}
            <BigBtn onClick={handleNext2}>
              Continue to Payment <ChevronRight className="w-5 h-5" />
            </BigBtn>
          </div>
        )}

        {/* ════════════════════════ STEP 3: PAYMENT ════════════════════════ */}
        {step === 3 && (
          <div className="space-y-5">
            <button type="button" onClick={() => setStep(2)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground font-semibold -mb-1">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <SectionHead icon={<Sparkles className="h-5 w-5 text-primary" strokeWidth={1.75} />} title="Almost done!" sub="Review and place your order" />

            {/* Order items */}
            <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
              {items.map(it => (
                <div key={it.productId} className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                    {(() => {
                      const preview = (it.customization as { previewDataUrl?: string } | null)?.previewDataUrl;
                      const thumb = preview || it.image;
                      return thumb
                        ? <img src={thumb} alt={it.title} className="w-full h-full object-cover" />
                        : <Package className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{it.title}</p>
                    <p className="text-xs text-muted-foreground">Qty {it.quantity}</p>
                  </div>
                  <span className="text-sm font-bold text-foreground shrink-0">{it.priceLabel}</span>
                </div>
              ))}
            </div>

            {/* Referral code */}
            <div className="flex gap-2">
              <input className={`${bigInput} flex-1`} value={referral}
                onChange={e => setReferral(e.target.value)}
                placeholder="Referral / promo code" />
              <button type="button" onClick={applyReferral}
                className="shrink-0 h-10 px-4 rounded-xl text-white text-sm font-bold bg-[#EF3752]">
                Apply
              </button>
            </div>
            {referralMsg && <p className={`text-sm -mt-2 ${referralMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{referralMsg}</p>}

            {/* Order totals */}
            <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
              <TotalRow label="Subtotal" value={`₹${subtotal.toFixed(0)}`} />
              {(giftWrap || addons.giftWrap) && <TotalRow label="Gift wrap" value={`+₹${giftWrapFee}`} />}
              {selectedTyCard && <TotalRow label="Thank-you card" value={`+₹${tyCardFee}`} />}
              {coinDiscount > 0 && <TotalRow label="Coins" value={`-₹${coinDiscount.toFixed(0)}`} highlight />}
              <TotalRow label="Delivery"
                value={delivery === 0 ? "FREE" : `₹${delivery}`}
                green={delivery === 0} />
              {delivery > 0 && <p className="text-xs text-gray-400">Free delivery above ₹499</p>}
              {codFee > 0 && (
                <TotalRow label="COD handling fee" value={`+₹${codFee}`} />
              )}
              <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                <span className="font-bold text-base text-gray-800">Total</span>
                <span className="font-black text-xl text-foreground">₹{total.toFixed(0)}</span>
              </div>
            </div>

            {/* Payment method selector */}
            <div className="space-y-2.5">
              <p className="text-sm font-bold text-foreground">Payment Method</p>

              {/* Online payment (Razorpay) */}
              {publicSettings.razorpay_enabled === "true" && publicSettings.razorpay_key_id && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("razorpay")}
                  className={`w-full rounded-2xl border p-4 flex items-center gap-4 text-left transition-all ${
                    paymentMethod === "razorpay"
                      ? "border-[#EF3752]/60 bg-[#EF3752]/5 ring-1 ring-[#EF3752]/30"
                      : "border-border bg-card hover:border-foreground/20"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    paymentMethod === "razorpay" ? "border-[#EF3752]" : "border-muted-foreground/40"
                  }`}>
                    {paymentMethod === "razorpay" && <div className="w-2.5 h-2.5 rounded-full bg-[#EF3752]" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground text-[15px]">Pay Online</p>
                    <p className="text-xs text-muted-foreground mt-0.5">UPI · Cards · Net Banking · Wallets</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {["UPI", "Card", "NB"].map(p => (
                      <span key={p} className="text-[9px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground font-bold">{p}</span>
                    ))}
                  </div>
                </button>
              )}

              {/* Cash on Delivery */}
              {publicSettings.cod_enabled !== "false" && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cod")}
                  className={`w-full rounded-2xl border p-4 flex items-center gap-4 text-left transition-all ${
                    paymentMethod === "cod"
                      ? "border-[#EF3752]/60 bg-[#EF3752]/5 ring-1 ring-[#EF3752]/30"
                      : "border-border bg-card hover:border-foreground/20"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    paymentMethod === "cod" ? "border-[#EF3752]" : "border-muted-foreground/40"
                  }`}>
                    {paymentMethod === "cod" && <div className="w-2.5 h-2.5 rounded-full bg-[#EF3752]" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground text-[15px]">Cash on Delivery</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pay when your gift arrives
                      {codFee > 0 && <span className="text-amber-600 font-semibold"> · ₹{codFee} handling fee</span>}
                    </p>
                  </div>
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              )}
            </div>

            {/* Delivery address summary */}
            <div className="rounded-2xl bg-card border border-border px-5 py-4">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Delivering to</p>
              <p className="text-sm font-semibold text-foreground">{isGift ? giftRecipient.fullName : addr.fullName}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isGift
                  ? `${giftRecipient.line1}, ${giftRecipient.city}, ${giftRecipient.state} – ${giftRecipient.pincode}`
                  : `${addr.line1}, ${addr.city}, ${addr.state} – ${addr.pincode}`}
              </p>
            </div>

            {error && <ErrorBox>{error}</ErrorBox>}

            <BigBtn onClick={placeOrder} loading={submitting}>
              {paymentMethod === "razorpay"
                ? <>Pay ₹{total.toFixed(0)} Online <ChevronRight className="w-5 h-5" /></>
                : <>Place Order · ₹{total.toFixed(0)} <ChevronRight className="w-5 h-5" /></>
              }
            </BigBtn>

            <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
              {([
                { Icon: Lock, label: "SSL Secured" },
                { Icon: RotateCcw, label: "7-Day Returns" },
                { Icon: Truck, label: "Track Anytime" },
              ] as const).map(({ Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted border border-border px-2.5 py-1.5 rounded-xl">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {label}
                </span>
              ))}
            </div>

            {/* Powered by */}
            <div className="flex items-center justify-center gap-2 pt-0.5">
              <span className="text-[11px] text-muted-foreground">Secured by</span>
              <span className="text-xs font-bold text-muted-foreground">Razorpay</span>
              {["UPI", "GPay", "Visa"].map(p => (
                <span key={p} className="text-[10px] px-2 py-0.5 rounded border border-border bg-muted text-muted-foreground">{p}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini helpers ──────────────────────────────────────────────────────────────
function TotalRow({ label, value, highlight, green }: {
  label: string; value: string; highlight?: boolean; green?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={highlight ? "text-[#EF3752] font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={highlight ? "text-[#EF3752] font-bold" : green ? "text-emerald-500 font-bold" : "text-foreground font-medium"}>{value}</span>
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card border border-red-500/30 px-4 py-3 text-sm text-red-400 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} /> {children}
    </div>
  );
}

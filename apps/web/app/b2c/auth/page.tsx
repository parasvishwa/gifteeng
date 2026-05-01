"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, ArrowLeft, Loader2, ShieldCheck, Lock, MapPin } from "lucide-react";
import { API_BASE_URL, ensureCartSessionKey } from "@/lib/api";
import { onB2cLogin } from "@/lib/stores/cart";

// Normalize: always produce +91XXXXXXXXXX (canonical format matching backend)
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  return `+91${local}`;
}

function AuthInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/account";

  const [step, setStep]       = useState<"phone" | "code">("phone");
  const [phone, setPhone]     = useState("");   // 10-digit only (no country code)
  const [code, setCode]       = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === "code") setTimeout(() => codeRef.current?.focus(), 150);
  }, [step]);

  // Resend countdown
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/b2c/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalisePhone(phone) }),
      });
      if (!res.ok) throw new Error("failed");
      setStep("code");
      setResendCountdown(30);
    } catch {
      setError("Could not send OTP. Please check the number and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (resendCountdown > 0 || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/b2c/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalisePhone(phone) }),
      });
      if (!res.ok) throw new Error("failed");
      setResendCountdown(30);
      setCode("");
    } catch {
      setError("Could not resend OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const sessionKey = ensureCartSessionKey();
      const res = await fetch(`${API_BASE_URL}/api/auth/b2c/otp/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cart-Session": sessionKey,
        },
        body: JSON.stringify({ phone: normalisePhone(phone), code }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { accessToken: string };
      localStorage.setItem("gifteeng.b2c.token", data.accessToken);
      await onB2cLogin(sessionKey);
      window.dispatchEvent(new Event("b2c-auth-change"));
      router.replace(returnTo);
    } catch {
      setError("Invalid or expired OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const maskedPhone = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`.trim();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16 pt-28 bg-background">

      {/* Card */}
      <div className="w-full max-w-sm">

        {/* Logo / brand */}
        <div className="flex flex-col items-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-12 mb-4" />
          <h1 className="text-2xl font-bold text-foreground">
            {step === "phone" ? "Welcome back" : "Enter OTP"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            {step === "phone"
              ? "Sign in with your mobile number"
              : `Code sent to +91 ${phone.slice(0, 5)} ${phone.slice(5)}`}
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border/40 shadow-sm p-6">

          {/* ── Phone step ── */}
          {step === "phone" && (
            <form onSubmit={sendCode} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Mobile Number
                </label>

                {/* Input with +91 prefix chip */}
                <div className="flex items-center rounded-xl border border-border/70 bg-background overflow-hidden focus-within:ring-2 focus-within:ring-[#EF3752]/30 focus-within:border-[#EF3752]/60 transition-all">
                  <div className="flex items-center gap-1.5 px-3 py-3 border-r border-border/50 shrink-0 bg-muted/40">
                    <span className="text-base">🇮🇳</span>
                    <span className="text-sm font-bold text-foreground">+91</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Enter 10-digit number"
                    className="flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground/50"
                    autoComplete="tel-national"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive bg-destructive/8 rounded-xl px-3 py-2">{error}</p>}

              <button
                type="submit"
                disabled={loading || phone.length < 10}
                className="w-full h-11 rounded-xl font-bold text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] bg-[#EF3752]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                {loading ? "Sending OTP…" : "Send OTP"}
              </button>

              <p className="text-[11px] text-center text-muted-foreground">
                By continuing you agree to our{" "}
                <a href="/terms" className="underline">Terms &amp; Privacy</a>
              </p>
            </form>
          )}

          {/* ── OTP step ── */}
          {step === "code" && (
            <form onSubmit={verifyCode} className="space-y-5">

              {/* Back button */}
              <button
                type="button"
                onClick={() => { setStep("phone"); setCode(""); setError(null); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Change number
              </button>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  6-digit OTP
                </label>
                <input
                  ref={codeRef}
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="• • • • • •"
                  className="w-full rounded-xl border border-border/70 bg-background px-4 py-3.5 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:ring-2 focus:ring-[#EF3752]/30 focus:border-[#EF3752]/60 transition-all placeholder:text-muted-foreground/30 placeholder:tracking-[0.4em]"
                  autoComplete="one-time-code"
                />
              </div>

              {error && <p className="text-sm text-destructive bg-destructive/8 rounded-xl px-3 py-2">{error}</p>}

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full h-11 rounded-xl font-bold text-sm text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] bg-[#EF3752]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {loading ? "Verifying…" : "Verify & Sign In"}
              </button>

              {/* Resend */}
              <div className="text-center">
                {resendCountdown > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Resend OTP in <span className="font-bold text-foreground">{resendCountdown}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={resendCode}
                    disabled={loading}
                    className="text-xs text-primary underline hover:opacity-80 transition-opacity disabled:opacity-40"
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Reassurance */}
        <div className="flex items-center justify-center gap-4 mt-8 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Secure login</span>
          <span>·</span>
          <span>No password needed</span>
          <span>·</span>
          <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> India only</span>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    }>
      <AuthInner />
    </Suspense>
  );
}

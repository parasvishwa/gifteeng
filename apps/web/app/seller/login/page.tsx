"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Loader2, ArrowRight } from "lucide-react";
import { sellerApi, setSellerToken, setOnboardToken } from "@/lib/seller-api";

// Two-step OTP login. New numbers receive an onboarding token and are sent
// to the onboarding form; existing sellers get a session token → dashboard.
export default function SellerLogin() {
  const router = useRouter();
  const [step, setStep]   = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode]   = useState("");
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestOtp = async () => {
    setError(null);
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) { setError("Enter a valid 10-digit mobile number"); return; }
    setBusy(true);
    try {
      await sellerApi.post("/seller/auth/request-otp", { phone: digits }, "none");
      setStep("code");
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Could not send OTP");
    } finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    setError(null);
    if (code.replace(/\D/g, "").length < 4) { setError("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const res = await sellerApi.post<{
        needsOnboarding: boolean;
        accessToken?: string;
        onboardingToken?: string;
      }>("/seller/auth/verify-otp", { phone: phone.replace(/\D/g, ""), code }, "none");

      if (res.needsOnboarding && res.onboardingToken) {
        setOnboardToken(res.onboardingToken);
        router.replace("/seller/onboard");
      } else if (res.accessToken) {
        setSellerToken(res.accessToken);
        router.replace("/seller/dashboard");
      } else {
        setError("Unexpected response — please try again");
      }
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Invalid or expired code");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-display text-xl font-black tracking-tight">Gifteeng Seller Portal</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {step === "phone"
              ? "Sign in or start selling — verify your mobile number"
              : `Enter the 6-digit code sent to ${phone}`}
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
          {step === "phone" ? (
            <div className="space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Mobile number
              </label>
              <div className="flex items-center rounded-xl border border-border bg-background">
                <span className="px-3 text-sm font-semibold text-muted-foreground">+91</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  onKeyDown={(e) => e.key === "Enter" && requestOtp()}
                  inputMode="numeric"
                  placeholder="98765 43210"
                  className="flex-1 bg-transparent py-2.5 pr-3 text-sm outline-none"
                  autoFocus
                />
              </div>
              <button
                onClick={requestOtp}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Verification code
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                inputMode="numeric"
                placeholder="• • • • • •"
                className="w-full rounded-xl border border-border bg-background py-2.5 px-3 text-center text-lg font-black tracking-[0.3em] outline-none focus:border-primary/50"
                autoFocus
              />
              <button
                onClick={verifyOtp}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white transition-[transform,opacity] hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & continue"}
              </button>
              <button
                onClick={() => { setStep("phone"); setCode(""); setError(null); }}
                className="w-full text-center text-[11px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Change number
              </button>
            </div>
          )}

          {error && <p className="mt-3 text-center text-xs font-medium text-destructive">{error}</p>}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          By continuing you agree to Gifteeng&apos;s seller terms. Genuine business
          details are required — all sellers are verified before going live.
        </p>
      </div>
    </div>
  );
}

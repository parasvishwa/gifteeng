"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store, Loader2, Building2, User, CheckCircle2, ShieldCheck,
  AlertCircle, Check, X,
} from "lucide-react";
import { sellerApi, setSellerToken, getOnboardToken } from "@/lib/seller-api";

type SellerType = "individual" | "business";
type SellerMode = "vendor_only" | "full_seller";
type BrandStatus = "idle" | "checking" | "available" | "taken";
type GstStatus   = "idle" | "verifying" | "verified" | "failed";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const FIELD =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/15";
const LABEL = "block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1";

export default function SellerOnboard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getOnboardToken()) { router.replace("/seller/login"); return; }
    setReady(true);
  }, [router]);

  const [type, setType] = useState<SellerType>("business");
  const [mode, setMode] = useState<SellerMode>("full_seller");
  const [f, setF] = useState({
    brandName: "", legalName: "", email: "",
    gstNumber: "", panNumber: "",
    contactName: "", contactPhone: "", contactEmail: "",
    addressLine: "", city: "", state: "", pincode: "",
    bankAccountName: "", bankAccountNumber: "", bankIfsc: "",
  });
  const [legalNameLocked, setLegalNameLocked] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  // ── Brand name availability ──────────────────────────────────────────────
  const [brandStatus, setBrandStatus] = useState<BrandStatus>("idle");
  const brandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkBrand = useCallback((name: string) => {
    if (brandTimer.current) clearTimeout(brandTimer.current);
    if (name.trim().length < 2) { setBrandStatus("idle"); return; }
    setBrandStatus("checking");
    brandTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/seller/auth/brand-check?name=${encodeURIComponent(name.trim())}`,
        );
        const data = await res.json() as { available: boolean };
        setBrandStatus(data.available ? "available" : "taken");
      } catch {
        setBrandStatus("idle");
      }
    }, 500);
  }, []);

  // ── GST verification ─────────────────────────────────────────────────────
  const [gstStatus, setGstStatus] = useState<GstStatus>("idle");

  const verifyGst = async () => {
    const gstin = f.gstNumber.trim().toUpperCase();
    if (!GSTIN_RE.test(gstin)) { return; }
    setGstStatus("verifying");
    try {
      const res  = await fetch(`/api/gst/verify?gstin=${gstin}`);
      const data = await res.json() as { ok: boolean; name?: string; address?: string; status?: string };
      if (data.ok && data.name) {
        setF((p) => ({
          ...p,
          legalName: data.name!,
          state: data.address?.split(",").at(-1)?.trim() || p.state,
        }));
        setLegalNameLocked(true);
        setGstStatus("verified");
      } else {
        setGstStatus("failed");
      }
    } catch {
      setGstStatus("failed");
    }
  };

  // ── Trademark ────────────────────────────────────────────────────────────
  const [hasTrademark, setHasTrademark] = useState<boolean | null>(null);
  const [trademarkNumber, setTrademarkNumber] = useState("");

  // ── Submit ───────────────────────────────────────────────────────────────
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (f.brandName.trim().length < 2)   { setError("Brand name is required"); return; }
    if (brandStatus === "taken")         { setError("This brand name is already taken"); return; }
    if (f.legalName.trim().length < 2)   { setError(type === "business" ? "Registered company name is required" : "Your full legal name is required"); return; }
    if (f.contactName.trim().length < 2) { setError("Contact person name is required"); return; }
    if (f.pincode.trim().length < 4)     { setError("A valid pincode is required"); return; }
    if (type === "business" && !f.gstNumber.trim()) { setError("GST number is required for a business"); return; }

    setBusy(true);
    try {
      const res = await sellerApi.post<{ accessToken: string }>(
        "/seller/auth/onboard",
        {
          type, mode,
          brandName: f.brandName, legalName: f.legalName,
          email: f.email || undefined,
          gstNumber: f.gstNumber || undefined,
          panNumber: f.panNumber || undefined,
          contactName: f.contactName,
          contactPhone: f.contactPhone || undefined,
          contactEmail: f.contactEmail || undefined,
          addressLine: f.addressLine || undefined,
          city: f.city || undefined,
          state: f.state || undefined,
          pincode: f.pincode,
          bankAccountName: f.bankAccountName || undefined,
          bankAccountNumber: f.bankAccountNumber || undefined,
          bankIfsc: f.bankIfsc || undefined,
          hasTrademark: hasTrademark ?? undefined,
          trademarkNumber: hasTrademark && trademarkNumber ? trademarkNumber : undefined,
        },
        "onboard",
      );
      setSellerToken(res.accessToken);
      router.replace("/seller/dashboard");
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Could not submit — please try again");
    } finally { setBusy(false); }
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const gstValid = GSTIN_RE.test(f.gstNumber.trim().toUpperCase());

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 shrink-0">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-lg font-black tracking-tight">Become a Gifteeng Seller</h1>
          <p className="text-xs text-muted-foreground">
            Tell us about your business. Your details are verified before you go live.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Seller type */}
        <section className="rounded-2xl border border-border/50 bg-card p-4">
          <p className={LABEL}>I am registering as</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "business",   icon: Building2, label: "Business", sub: "Company / firm with GST" },
              { v: "individual", icon: User,      label: "Individual", sub: "Sole proprietor / maker" },
            ] as const).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setType(o.v)}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                  type === o.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <o.icon className={`h-4 w-4 ${type === o.v ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-bold">{o.label}</span>
                <span className="text-[10px] text-muted-foreground">{o.sub}</span>
              </button>
            ))}
          </div>

          <p className={`${LABEL} mt-4`}>How do you want to work with Gifteeng</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: "full_seller", label: "Sell my products", sub: "List & sell your own catalogue" },
              { v: "vendor_only", label: "Manufacturing only", sub: "Print / produce for Gifteeng orders" },
            ] as const).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setMode(o.v)}
                className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors ${
                  mode === o.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <span className="text-sm font-bold">{o.label}</span>
                <span className="text-[10px] text-muted-foreground">{o.sub}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Business identity */}
        <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
          <h2 className="text-sm font-black">Business identity</h2>

          {/* Brand name + availability */}
          <div>
            <label className={LABEL}>Brand name *</label>
            <div className="relative">
              <input
                value={f.brandName}
                onChange={(e) => {
                  set("brandName")(e);
                  checkBrand(e.target.value);
                }}
                className={`${FIELD} pr-8`}
                placeholder="The name buyers will see"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {brandStatus === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {brandStatus === "available" && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                {brandStatus === "taken"     && <X     className="h-3.5 w-3.5 text-destructive" />}
              </span>
            </div>
            {brandStatus === "taken" && (
              <p className="mt-1 text-[11px] text-destructive">This brand name is already registered.</p>
            )}
            {brandStatus === "available" && (
              <p className="mt-1 text-[11px] text-emerald-600">Brand name is available.</p>
            )}
          </div>

          {/* GST number with verify button */}
          <div>
            <label className={LABEL}>GST number {type === "business" ? "*" : "(optional)"}</label>
            <div className="flex gap-2">
              <input
                value={f.gstNumber}
                onChange={(e) => {
                  set("gstNumber")({ ...e, target: { ...e.target, value: e.target.value.toUpperCase() } } as React.ChangeEvent<HTMLInputElement>);
                  setGstStatus("idle");
                  if (legalNameLocked) { setLegalNameLocked(false); setF((p) => ({ ...p, legalName: "" })); }
                }}
                className={`${FIELD} flex-1 font-mono uppercase`}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
              <button
                type="button"
                onClick={verifyGst}
                disabled={!gstValid || gstStatus === "verifying"}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold transition-colors hover:bg-muted/50 disabled:opacity-40"
              >
                {gstStatus === "verifying" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : gstStatus === "verified" ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                Verify
              </button>
            </div>
            {gstStatus === "verified" && (
              <p className="mt-1 text-[11px] text-emerald-600">GST verified. Legal name auto-filled from MCA records.</p>
            )}
            {gstStatus === "failed" && (
              <p className="mt-1 text-[11px] text-destructive">GST verification failed. Enter your legal name manually.</p>
            )}
          </div>

          {/* Legal name — locked if GST-verified */}
          <div>
            <label className={LABEL}>
              {type === "business" ? "Registered company name *" : "Your full legal name *"}
              {legalNameLocked && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-emerald-600 normal-case font-normal">
                  <ShieldCheck className="h-2.5 w-2.5" /> GST verified
                </span>
              )}
            </label>
            <input
              value={f.legalName}
              onChange={legalNameLocked ? undefined : set("legalName")}
              readOnly={legalNameLocked}
              className={`${FIELD} ${legalNameLocked ? "bg-muted/40 text-muted-foreground cursor-default select-none" : ""}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>PAN number</label>
              <input value={f.panNumber} onChange={set("panNumber")} className={`${FIELD} font-mono uppercase`} placeholder="AAAAA0000A" />
            </div>
            <div>
              <label className={LABEL}>Business email</label>
              <input value={f.email} onChange={set("email")} className={FIELD} placeholder="you@brand.com" type="email" />
            </div>
          </div>

          {/* Trademark */}
          <div className="pt-1">
            <p className={LABEL}>Do you have a registered trademark?</p>
            <div className="flex gap-2">
              {([
                { v: true,  label: "Yes, I have a trademark" },
                { v: false, label: "No trademark yet" },
              ] as const).map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => setHasTrademark(o.v)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-bold transition-colors ${
                    hasTrademark === o.v ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {hasTrademark === true && (
              <div className="mt-2">
                <label className={LABEL}>Trademark / TM application number</label>
                <input
                  value={trademarkNumber}
                  onChange={(e) => setTrademarkNumber(e.target.value)}
                  className={FIELD}
                  placeholder="e.g. 1234567"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Upload your TM registration certificate from the dashboard after account approval.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Contact person */}
        <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
          <h2 className="text-sm font-black">{type === "business" ? "Proprietor / director" : "Contact details"}</h2>
          <div>
            <label className={LABEL}>Contact person name *</label>
            <input value={f.contactName} onChange={set("contactName")} className={FIELD} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Contact phone</label>
              <input value={f.contactPhone} onChange={set("contactPhone")} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Contact email</label>
              <input value={f.contactEmail} onChange={set("contactEmail")} className={FIELD} type="email" />
            </div>
          </div>
        </section>

        {/* Location */}
        <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
          <h2 className="text-sm font-black">Pickup location</h2>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Orders are routed to the nearest seller first — your pincode matters.
          </p>
          <div>
            <label className={LABEL}>Address line</label>
            <input value={f.addressLine} onChange={set("addressLine")} className={FIELD} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>City</label>
              <input value={f.city} onChange={set("city")} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>State</label>
              <input value={f.state} onChange={set("state")} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Pincode *</label>
              <input value={f.pincode} onChange={set("pincode")} className={`${FIELD} font-mono`} inputMode="numeric" />
            </div>
          </div>
        </section>

        {/* Payout */}
        <section className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
          <h2 className="text-sm font-black">Payout bank account</h2>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Where Gifteeng settles your earnings. You can add this later from the dashboard.
          </p>
          <div>
            <label className={LABEL}>Account holder name</label>
            <input value={f.bankAccountName} onChange={set("bankAccountName")} className={FIELD} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Account number</label>
              <input value={f.bankAccountNumber} onChange={set("bankAccountNumber")} className={`${FIELD} font-mono`} />
            </div>
            <div>
              <label className={LABEL}>IFSC</label>
              <input value={f.bankIfsc} onChange={set("bankIfsc")} className={`${FIELD} font-mono uppercase`} />
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <p className="text-xs font-semibold text-destructive">{error}</p>
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || brandStatus === "taken"}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-white transition-[transform,opacity] hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Submit for verification</>}
        </button>
        <p className="pb-4 text-center text-[11px] text-muted-foreground">
          Gifteeng reviews every seller before they go live. You&apos;ll be notified once approved.
        </p>
      </div>
    </div>
  );
}

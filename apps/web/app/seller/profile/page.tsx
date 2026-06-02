"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Loader2, Save, CheckCircle2, AlertCircle,
  User, Building2, MapPin, CreditCard, Truck, Phone, Mail,
} from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

interface Seller {
  id: string;
  phone: string;
  email: string | null;
  type: string;
  mode: string;
  brandName: string;
  legalName: string;
  gstNumber: string | null;
  panNumber: string | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  chargesCourier: boolean;
  dispatchDays: number;
  status: string;
  ratingAvg: number;
  ratingCount: number;
}

type FormState = {
  brandName: string;
  email: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  dispatchDays: number;
};

function toForm(s: Seller): FormState {
  return {
    brandName:         s.brandName ?? "",
    email:             s.email ?? "",
    contactName:       s.contactName ?? "",
    contactPhone:      s.contactPhone ?? "",
    contactEmail:      s.contactEmail ?? "",
    addressLine:       s.addressLine ?? "",
    city:              s.city ?? "",
    state:             s.state ?? "",
    pincode:           s.pincode ?? "",
    bankAccountName:   s.bankAccountName ?? "",
    bankAccountNumber: s.bankAccountNumber ?? "",
    bankIfsc:          s.bankIfsc ?? "",
    dispatchDays:      s.dispatchDays ?? 2,
  };
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/20">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full h-9 rounded-lg border border-border/60 bg-background px-3 text-sm outline-none focus:border-primary/60 transition-colors disabled:opacity-50 disabled:bg-muted";

export default function SellerProfilePage() {
  const router = useRouter();
  const [seller, setSeller]   = useState<Seller | null>(null);
  const [form,   setForm]     = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState<"idle" | "ok" | "err">("idle");
  const [errMsg,  setErrMsg]  = useState("");

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    sellerApi.get<Seller>("/seller/auth/me")
      .then(data => { setSeller(data); setForm(toForm(data)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof FormState, v: string | number) =>
    setForm(prev => prev ? { ...prev, [k]: v } : prev);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true); setStatus("idle"); setErrMsg("");
    try {
      const payload: Record<string, unknown> = {
        brandName:    form.brandName    || undefined,
        email:        form.email        || null,
        contactName:  form.contactName  || undefined,
        contactPhone: form.contactPhone || null,
        contactEmail: form.contactEmail || null,
        addressLine:  form.addressLine  || null,
        city:         form.city         || null,
        state:        form.state        || null,
        pincode:      form.pincode      || undefined,
        bankAccountName:   form.bankAccountName   || null,
        bankAccountNumber: form.bankAccountNumber || null,
        bankIfsc:          form.bankIfsc          || null,
        dispatchDays: form.dispatchDays,
      };
      const updated = await sellerApi.patch<Seller>("/seller/auth/me", payload);
      setSeller(updated);
      setForm(toForm(updated));
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Save failed");
      setStatus("err");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!form || !seller) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Could not load profile. <button onClick={() => router.back()} className="text-primary hover:underline">Go back</button></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-16">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold text-sm">Edit Profile</h1>
          <p className="text-[10px] text-muted-foreground">{seller.phone} · {seller.legalName}</p>
        </div>
        <div className="flex items-center gap-2">
          {status === "ok" && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {status === "err" && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {errMsg || "Error"}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-90"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 space-y-4">

        {/* Read-only identity */}
        <div className="bg-card rounded-xl border border-border/40 p-4 space-y-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Legal name</p>
              <p className="font-medium mt-0.5">{seller.legalName}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">GST number</p>
              <p className="font-medium mt-0.5">{seller.gstNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">PAN</p>
              <p className="font-medium mt-0.5">{seller.panNumber ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Account status</p>
              <p className="font-medium mt-0.5 capitalize">{seller.status}</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            Legal name, GST, and PAN cannot be changed. Contact support if these need to be updated.
          </p>
        </div>

        {/* Brand */}
        <Section icon={Building2} title="Brand">
          <Field label="Brand name (shown to buyers)" id="brandName">
            <input id="brandName" value={form.brandName} onChange={e => set("brandName", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Email" id="email">
            <input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="seller@email.com" className={inputCls} />
          </Field>
        </Section>

        {/* Contact person */}
        <Section icon={User} title="Contact person">
          <Field label="Name" id="contactName">
            <input id="contactName" value={form.contactName} onChange={e => set("contactName", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" id="contactPhone">
              <input id="contactPhone" value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
            </Field>
            <Field label="Email" id="contactEmail">
              <input id="contactEmail" type="email" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Pickup address */}
        <Section icon={MapPin} title="Pickup address">
          <Field label="Address line" id="addressLine">
            <input id="addressLine" value={form.addressLine} onChange={e => set("addressLine", e.target.value)} placeholder="Shop / building / street" className={inputCls} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" id="city">
              <input id="city" value={form.city} onChange={e => set("city", e.target.value)} className={inputCls} />
            </Field>
            <Field label="State" id="state">
              <input id="state" value={form.state} onChange={e => set("state", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Pincode" id="pincode">
              <input id="pincode" value={form.pincode} onChange={e => set("pincode", e.target.value)} maxLength={6} className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* Dispatch slot */}
        <Section icon={Truck} title="Dispatch settings">
          <Field label="Typical dispatch time (days after order accepted)" id="dispatchDays">
            <div className="flex items-center gap-3">
              <input id="dispatchDays" type="range" min={1} max={14} value={form.dispatchDays}
                onChange={e => set("dispatchDays", Number(e.target.value))}
                className="flex-1 accent-primary" />
              <span className="w-20 text-center rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm font-semibold tabular-nums">
                {form.dispatchDays} {form.dispatchDays === 1 ? "day" : "days"}
              </span>
            </div>
          </Field>
          <p className="text-[10px] text-muted-foreground">
            This is shown to customers as your estimated dispatch time.
          </p>
        </Section>

        {/* Bank details */}
        <Section icon={CreditCard} title="Bank / payout details">
          <Field label="Account holder name" id="bankAccountName">
            <input id="bankAccountName" value={form.bankAccountName} onChange={e => set("bankAccountName", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account number" id="bankAccountNumber">
              <input id="bankAccountNumber" value={form.bankAccountNumber} onChange={e => set("bankAccountNumber", e.target.value)} className={inputCls} />
            </Field>
            <Field label="IFSC code" id="bankIfsc">
              <input id="bankIfsc" value={form.bankIfsc} onChange={e => set("bankIfsc", e.target.value)} placeholder="SBIN0001234" className={inputCls} />
            </Field>
          </div>
        </Section>

      </div>
    </div>
  );
}

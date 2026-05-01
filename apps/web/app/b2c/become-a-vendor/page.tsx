"use client";

/**
 * Become a Vendor — simple expression-of-interest form.
 *
 * Posts to the existing /api/contact-messages endpoint with
 * subject="Vendor Application" so the admin can see all entries
 * in the Messages page (filterable by subject).
 *
 * Goal: capture interested vendors (count + contact details). No vetting
 * or onboarding flow yet — that's a future workflow once we have volume.
 */

import { useState } from "react";
import { Briefcase, Check, ArrowRight, MapPin, Phone, Mail, User, Package } from "lucide-react";
import { apiB2c } from "@/lib/api";

export default function BecomeVendorPage() {
  const [name, setName]         = useState("");
  const [phone, setPhone]       = useState("");
  const [email, setEmail]       = useState("");
  const [businessName, setBiz]  = useState("");
  const [city, setCity]         = useState("");
  const [productType, setType]  = useState("");
  const [yearsActive, setYears] = useState("");
  const [message, setMessage]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const valid =
    name.trim().length >= 2 &&
    phone.trim().length >= 10 &&
    email.includes("@") &&
    businessName.trim().length >= 2 &&
    city.trim().length >= 2 &&
    productType.trim().length >= 2;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const body = [
      `Business name: ${businessName.trim()}`,
      `City: ${city.trim()}`,
      `Product type: ${productType.trim()}`,
      yearsActive.trim() ? `Years active: ${yearsActive.trim()}` : null,
      message.trim() ? `\nMessage:\n${message.trim()}` : null,
    ].filter(Boolean).join("\n");
    try {
      await apiB2c().post("/api/contact-messages", {
        name:    name.trim(),
        email:   email.trim(),
        phone:   phone.trim(),
        subject: "Vendor Application",
        body,
      });
      setDone(true);
    } catch (e) {
      setError("Could not submit. Please try again or email us at vendors@gifteeng.com.");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center mb-5">
            <Check className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-black mb-3">We've got your application!</h1>
          <p className="text-muted-foreground mb-6">
            Our partnerships team will review your details and reach out within 3–5 business days at <span className="font-bold text-foreground">{phone}</span> or <span className="font-bold text-foreground">{email}</span>.
          </p>
          <a href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#EF3752] text-white font-bold">
            Back to Home <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-[#EF3752]/10 to-purple-500/10 border border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#EF3752]/15 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-[#EF3752]" />
          </div>
          <div>
            <h1 className="text-xl font-black">Become a Gifteeng Vendor</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Sell your handcrafted gifts to thousands of buyers across India.</p>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 text-xs mt-4">
          <Bullet text="Pan-India delivery handled by us" />
          <Bullet text="Marketing &amp; SEO support" />
          <Bullet text="Weekly settlement payouts" />
          <Bullet text="Dedicated vendor dashboard" />
        </ul>
      </div>

      {/* Form */}
      <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
        <h2 className="font-black text-base">Tell us about your business</h2>

        <Field icon={User} label="Your full name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rohan Sharma"
            className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field icon={Phone} label="Phone *">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile"
              inputMode="numeric"
              className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
            />
          </Field>
          <Field icon={Mail} label="Email *">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              type="email"
              className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
            />
          </Field>
        </div>

        <Field icon={Briefcase} label="Business name *">
          <input
            value={businessName}
            onChange={(e) => setBiz(e.target.value)}
            placeholder="e.g. Sharma Crafts &amp; Gifts"
            className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field icon={MapPin} label="City *">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Jaipur"
              className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
            />
          </Field>
          <Field icon={Package} label="What do you make? *">
            <input
              value={productType}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. wooden frames"
              className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
            />
          </Field>
        </div>

        <Field icon={Briefcase} label="Years in business (optional)">
          <input
            value={yearsActive}
            onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="e.g. 5"
            inputMode="numeric"
            className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm"
          />
        </Field>

        <Field icon={null} label="Anything else (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Tell us about your products, capacity, MOQs, etc."
            className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm resize-none"
          />
        </Field>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>
        )}

        <button
          onClick={submit}
          disabled={!valid || saving}
          className="w-full py-3 rounded-xl bg-[#EF3752] text-white font-black disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? "Submitting…" : (<>Submit Application <ArrowRight className="w-4 h-4" /></>)}
        </button>
        <p className="text-[11px] text-muted-foreground text-center">
          We typically respond within 3–5 business days. By submitting, you agree to our{" "}
          <a href="/b2c/terms" className="underline">Terms</a>.
        </p>
      </div>
    </div>
  );
}

function Field({
  label, icon: Icon, children,
}: { label: string; icon: React.ElementType | null; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-bold mb-1.5 text-muted-foreground">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {label}
      </label>
      {children}
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-1.5">
      <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-500 shrink-0" />
      <span dangerouslySetInnerHTML={{ __html: text }} />
    </li>
  );
}

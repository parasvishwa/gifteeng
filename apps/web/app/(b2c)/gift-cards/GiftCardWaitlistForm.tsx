"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

export function GiftCardWaitlistForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
      const res = await fetch(`${base}/api/contact-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Gift Card Waitlist",
          email: email.trim(),
          subject: "Gift Card Waitlist Signup",
          message: "Please notify me when e-gift cards are available.",
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setSent(true);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-card rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="font-display font-bold text-xl mb-2">You&apos;re on the list!</h2>
        <p className="text-muted-foreground text-sm">
          We&apos;ll email you as soon as Gifteeng gift cards are live.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card rounded-2xl p-6 md:p-8 space-y-4"
    >
      <label className="text-[11px] font-semibold text-muted-foreground block uppercase tracking-wider">
        Notify me when it&apos;s ready
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        className="w-full px-4 py-3 rounded-xl border border-border bg-muted font-body text-sm text-foreground outline-none focus:border-[#EF3752]"
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 rounded-xl bg-[#EF3752] text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-60"
      >
        <Send className="w-4 h-4" /> {submitting ? "Subscribing..." : "Keep Me Posted"}
      </button>
    </form>
  );
}

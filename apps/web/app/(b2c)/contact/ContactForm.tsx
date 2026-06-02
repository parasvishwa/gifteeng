"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
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
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
        }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setSent(true);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-card rounded-2xl p-8 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="font-display font-bold text-xl mb-2">Message sent!</h2>
        <p className="text-muted-foreground text-sm mb-4">We&apos;ll get back to you within 24 hours.</p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-primary text-sm font-medium hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  const inputCls =
    "w-full px-4 py-3 rounded-xl border border-border bg-muted font-body text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-[#EF3752] focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Send className="w-4 h-4 text-primary" />
        </div>
        <h2 className="font-display font-bold text-lg tracking-tight">Send us a message</h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
            Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your full name"
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
            Phone
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91 00000 00000"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
          Email
        </label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="you@example.com"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
          Subject
        </label>
        <input
          type="text"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="How can we help?"
          className={inputCls}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5 uppercase tracking-wider">
          Message
        </label>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us how we can help..."
          required
          rows={5}
          className={`${inputCls} resize-none`}
        />
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-4 rounded-xl bg-[#EF3752] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4" /> {submitting ? "Sending..." : "Send Message"}
      </button>
      <p className="text-center text-[10px] text-muted-foreground">
        We typically respond within 2 hours during business hours.
      </p>
    </form>
  );
}

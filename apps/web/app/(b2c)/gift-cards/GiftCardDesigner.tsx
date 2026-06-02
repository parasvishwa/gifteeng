"use client";

/**
 * E-Gift Card Designer — premium, fully interactive UI (Deploy 115).
 *
 * Flow:
 *   1. Pick a design template (6 themed looks)
 *   2. Pick an amount (₹500–₹10,000 presets OR custom)
 *   3. Enter recipient name + delivery channel (Email or WhatsApp)
 *   4. Enter your name + personal message
 *   5. Optional: schedule delivery for a future date
 *   6. Live preview updates as you type
 *   7. Add to cart → goes through the regular checkout
 *
 * Backend commits later — for now purchase goes into cart as a "gift-card"
 * pseudo-product with the full designer JSON stored in customization. Any
 * future gift-card module just consumes that payload.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Gift, Mail, MessageCircle, Sparkles, Calendar, ChevronRight, Check,
  CreditCard, Heart, Cake, PartyPopper, Flower2, Crown, Leaf,
} from "lucide-react";

// ─── Design templates ──────────────────────────────────────────────────
type Template = {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  // Card visual — a CSS-only gradient + accent so we don't depend on assets
  gradient: string;          // background
  textColor: string;         // main copy color
  accent: string;            // accent shape colour
  pattern?: "hearts" | "stars" | "confetti" | "floral" | "luxe" | "leaves";
};

const TEMPLATES: Template[] = [
  { id: "birthday",    name: "Birthday",    icon: Cake,         gradient: "linear-gradient(135deg,#ff6b9d 0%,#feca57 100%)", textColor: "#fff", accent: "#ff3d7f", pattern: "confetti" },
  { id: "anniversary", name: "Anniversary", icon: Heart,        gradient: "linear-gradient(135deg,#c2185b 0%,#6a1b9a 100%)", textColor: "#fff", accent: "#ec407a", pattern: "hearts" },
  { id: "festive",     name: "Festive",     icon: PartyPopper,  gradient: "linear-gradient(135deg,#f59e0b 0%,#ef4444 100%)", textColor: "#fff", accent: "#fde047", pattern: "stars" },
  { id: "floral",      name: "Thank You",   icon: Flower2,      gradient: "linear-gradient(135deg,#fbcfe8 0%,#c4b5fd 100%)", textColor: "#1f2937", accent: "#f472b6", pattern: "floral" },
  { id: "luxe",        name: "Luxe Black",  icon: Crown,        gradient: "linear-gradient(135deg,#0f0f0f 0%,#2d1b48 100%)", textColor: "#fde68a", accent: "#fbbf24", pattern: "luxe" },
  { id: "minimal",     name: "Minimal",     icon: Leaf,         gradient: "linear-gradient(135deg,#f0fdf4 0%,#d1fae5 100%)", textColor: "#065f46", accent: "#10b981", pattern: "leaves" },
];

const PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000] as const;

type Channel = "email" | "whatsapp";

export default function GiftCardDesigner() {
  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0].id);
  const [amount, setAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [channel, setChannel] = useState<Channel>("email");
  const [toName, setToName] = useState("");
  const [toContact, setToContact] = useState("");
  const [fromName, setFromName] = useState("");
  const [message, setMessage] = useState("Wishing you something special today. 🎁");
  const [scheduled, setScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("10:00");
  const [submitting, setSubmitting] = useState(false);
  const [added, setAdded] = useState(false);

  const template = useMemo(
    () => TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0],
    [templateId],
  );
  const finalAmount = customAmount.trim() ? Math.max(100, Math.min(100000, parseInt(customAmount, 10) || 0)) : amount;
  const canSubmit =
    finalAmount >= 100 &&
    toName.trim().length > 0 &&
    toContact.trim().length > 0 &&
    fromName.trim().length > 0 &&
    message.trim().length > 0 &&
    (!scheduled || !!scheduleDate);

  async function addToCart() {
    if (!canSubmit) return;
    setSubmitting(true);
    // Stash in localStorage — the checkout picks it up as a gift-card line
    // until the dedicated gift-card module lands.
    try {
      const payload = {
        kind: "gift-card" as const,
        templateId: template.id,
        templateName: template.name,
        amount: finalAmount,
        channel,
        toName: toName.trim(),
        toContact: toContact.trim(),
        fromName: fromName.trim(),
        message: message.trim(),
        scheduledAt: scheduled && scheduleDate ? `${scheduleDate}T${scheduleTime}` : null,
        createdAt: new Date().toISOString(),
      };
      const existing = JSON.parse(localStorage.getItem("gifteeng.giftCardCart") || "[]");
      existing.push(payload);
      localStorage.setItem("gifteeng.giftCardCart", JSON.stringify(existing));
      setAdded(true);
      setTimeout(() => setAdded(false), 4000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">
      {/* Hero */}
      <div className="text-center mb-8 md:mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted border border-border text-foreground px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]">
          <Sparkles className="w-3 h-3" /> INSTANT DELIVERY
        </span>
        <h1 className="mt-3 text-3xl md:text-5xl font-black tracking-tight">
          The perfect e-gift in 60 seconds
        </h1>
        <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
          Pick a design, set the amount, write a note — we&apos;ll deliver it instantly to their inbox or WhatsApp.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 md:gap-8">
        {/* ── Left: designer form ───────────────────────────────── */}
        <div className="space-y-6">
          {/* 1) Design template picker */}
          <SectionCard step={1} title="Choose a design" subtitle="Six premium looks, each themed for an occasion">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const sel = t.id === templateId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`group relative aspect-[16/10] rounded-xl overflow-hidden text-left transition-all duration-300 ${
                      sel ? "scale-[1.02] outline outline-2 outline-[#EF3752]" : "opacity-80 hover:opacity-100"
                    }`}
                    style={{ background: t.gradient }}
                  >
                    <TemplatePattern pattern={t.pattern} />
                    <div className="absolute inset-0 p-2.5 flex flex-col justify-between">
                      <span style={{ color: t.textColor, opacity: 0.9 }}>
                        <Icon className="w-5 h-5" />
                      </span>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider opacity-80" style={{ color: t.textColor }}>{t.name}</p>
                      </div>
                    </div>
                    {sel && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/95 flex items-center justify-center shadow-md">
                        <Check className="w-3 h-3 text-pink-600" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* 2) Amount */}
          <SectionCard step={2} title="Choose an amount" subtitle="₹100 minimum · ₹1,00,000 maximum">
            <div className="flex flex-wrap gap-2">
              {PRESET_AMOUNTS.map((v) => {
                const sel = !customAmount.trim() && amount === v;
                return (
                  <button
                    key={v}
                    onClick={() => { setAmount(v); setCustomAmount(""); }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                      sel
                        ? "bg-[#EF3752] text-white scale-105"
                        : "bg-muted border border-border text-foreground hover:border-[#EF3752]/50"
                    }`}
                  >
                    ₹{v.toLocaleString("en-IN")}
                  </button>
                );
              })}
            </div>
            <label className="block mt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Or enter a custom amount (₹)
              </span>
              <div className="mt-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₹</span>
                <input
                  type="number" inputMode="numeric" min={100} max={100000}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="e.g. 1500"
                  className="w-full rounded-xl border border-border bg-muted pl-7 pr-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:border-[#EF3752]"
                />
              </div>
            </label>
          </SectionCard>

          {/* 3) Recipient + channel */}
          <SectionCard step={3} title="Recipient details" subtitle="We'll deliver the card here">
            {/* Channel tabs */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => setChannel("email")}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  channel === "email"
                    ? "bg-[#EF3752] text-white"
                    : "bg-muted border border-border text-foreground hover:border-[#EF3752]/50"
                }`}
              >
                <Mail className="w-4 h-4" /> Email
              </button>
              <button
                onClick={() => setChannel("whatsapp")}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  channel === "whatsapp"
                    ? "bg-[#EF3752] text-white"
                    : "bg-muted border border-border text-foreground hover:border-[#EF3752]/50"
                }`}
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <LabeledInput
                label="Recipient name"
                value={toName} onChange={setToName}
                placeholder="e.g. Aarav Sharma" maxLength={48}
              />
              <LabeledInput
                label={channel === "email" ? "Recipient email" : "Recipient WhatsApp number"}
                value={toContact} onChange={setToContact}
                placeholder={channel === "email" ? "aarav@example.com" : "+91 98765 43210"}
                type={channel === "email" ? "email" : "tel"}
              />
            </div>
          </SectionCard>

          {/* 4) Your message */}
          <SectionCard step={4} title="Your message" subtitle="Keep it personal — they'll read this when they open the card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
              <LabeledInput
                label="Your name (shown as sender)"
                value={fromName} onChange={setFromName}
                placeholder="e.g. Priya" maxLength={32}
              />
              <div />
            </div>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                <span>Personal message</span>
                <span className={message.length > 220 ? "text-amber-500" : "text-muted-foreground/60"}>{message.length}/240</span>
              </span>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value.slice(0, 240))}
                rows={3}
                placeholder="Write something heartfelt…"
                className="mt-1 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground leading-relaxed focus:outline-none focus:border-[#EF3752] resize-none"
              />
            </label>
          </SectionCard>

          {/* 5) Schedule */}
          <SectionCard step={5} title="When to deliver" subtitle="Send now or pick a date in the future">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setScheduled(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  !scheduled
                    ? "bg-[#EF3752] text-white"
                    : "bg-muted border border-border text-foreground hover:border-[#EF3752]/50"
                }`}
              >
                <Sparkles className="w-4 h-4" /> Send immediately
              </button>
              <button
                onClick={() => setScheduled(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  scheduled
                    ? "bg-muted border border-[#EF3752] text-foreground"
                    : "bg-muted border border-border text-foreground hover:border-[#EF3752]/50"
                }`}
              >
                <Calendar className="w-4 h-4" /> Schedule
              </button>
            </div>
            {scheduled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Delivery date</span>
                  <input
                    type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().slice(0, 10)}
                    className="mt-1 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-[#EF3752]"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Delivery time (IST)</span>
                  <input
                    type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-[#EF3752]"
                  />
                </label>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Right: sticky preview + CTA ───────────────────────── */}
        <aside className="lg:sticky lg:top-20 lg:self-start space-y-4">
          <div className="rounded-2xl bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground mb-3">Live preview</p>

            {/* Gift card visual */}
            <div
              className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)]"
              style={{ background: template.gradient }}
            >
              <TemplatePattern pattern={template.pattern} />
              <div className="absolute inset-0 p-5 flex flex-col justify-between" style={{ color: template.textColor }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">Gifteeng E-Gift</p>
                    <p className="text-[9px] uppercase tracking-widest opacity-60 mt-0.5">{template.name}</p>
                  </div>
                  <Gift className="w-6 h-6 opacity-80" />
                </div>
                <div>
                  <p className="text-[10px] opacity-70 mb-0.5">To</p>
                  <p className="text-base md:text-lg font-black leading-tight truncate">{toName || "Recipient name"}</p>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] opacity-70 mb-0.5">From</p>
                    <p className="text-xs font-bold">{fromName || "Your name"}</p>
                  </div>
                  <p className="text-2xl md:text-3xl font-black tracking-tight">
                    ₹{finalAmount.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>

            {/* Message bubble */}
            <div className="mt-3 rounded-xl bg-muted/40 px-3 py-2.5 text-[12px] leading-relaxed text-foreground/80 italic">
              &ldquo;{message || "Your message will appear here…"}&rdquo;
            </div>

            {/* Meta */}
            <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                {channel === "email" ? <Mail className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}
                <span className="truncate">{toContact || (channel === "email" ? "recipient@email" : "+91 …")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {scheduled && scheduleDate
                  ? <><Calendar className="w-3 h-3" /> Delivers {scheduleDate} · {scheduleTime} IST</>
                  : <><Sparkles className="w-3 h-3" /> Delivers instantly on purchase</>}
              </div>
            </div>

            {/* Total + CTA */}
            <div className="mt-4 pt-3 border-t border-border/40">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground">Total</span>
                <span className="text-xl font-black">₹{finalAmount.toLocaleString("en-IN")}</span>
              </div>
              <button
                onClick={addToCart}
                disabled={!canSubmit || submitting}
                className={`w-full py-3 rounded-xl text-sm font-black text-white transition-all ${
                  !canSubmit
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : added
                      ? "bg-muted border border-border"
                      : "bg-[#EF3752] hover:opacity-90 active:scale-[0.98]"
                }`}
              >
                {added
                  ? <><Check className="inline w-4 h-4 mr-1" /> Added — go to cart</>
                  : submitting
                    ? "Adding…"
                    : <><CreditCard className="inline w-4 h-4 mr-1.5" /> Add to cart · ₹{finalAmount.toLocaleString("en-IN")}</>}
              </button>
              {added && (
                <Link href="/cart" className="mt-2 block text-center text-xs font-semibold text-pink-600 hover:underline">
                  Go to cart →
                </Link>
              )}
              {!canSubmit && (
                <p className="mt-2 text-[11px] text-center text-muted-foreground/80">
                  Fill recipient, your name, and message to continue
                </p>
              )}
            </div>
          </div>

          {/* Trust strip */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { icon: Sparkles, label: "Instant delivery" },
              { icon: Mail,     label: "Email or WhatsApp" },
              { icon: Gift,     label: "No expiry" },
            ].map(({ icon: I, label }) => (
              <div key={label} className="rounded-xl bg-card p-2.5">
                <I className="w-4 h-4 text-pink-500 mx-auto mb-1" />
                <p className="text-[10px] font-bold text-foreground/80 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* FAQ strip */}
      <section className="mt-12 md:mt-16">
        <h2 className="text-xl md:text-2xl font-black tracking-tight mb-4 flex items-center gap-2">
          <span className="inline-block h-5 w-1 rounded-full bg-[#EF3752]" />
          Frequently asked
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group rounded-xl bg-card p-3 md:p-4">
              <summary className="cursor-pointer flex items-center justify-between gap-3 list-none">
                <span className="text-sm font-bold">{q}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function SectionCard({ step, title, subtitle, children }: {
  step: number; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-4 md:p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[#EF3752] text-white text-[12px] font-black flex items-center justify-center">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-black tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function LabeledInput({
  label, value, onChange, placeholder, type = "text", maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength}
        className="mt-1 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-[#EF3752]"
      />
    </label>
  );
}

// Decorative pattern overlay — CSS only, mirrors the template theme
function TemplatePattern({ pattern }: { pattern?: Template["pattern"] }) {
  if (!pattern) return null;
  const emojiMap: Record<NonNullable<Template["pattern"]>, string[]> = {
    hearts:   ["❤️", "💕", "🌹"],
    stars:    ["✨", "⭐", "🌟"],
    confetti: ["🎉", "🎊", "🎈"],
    floral:   ["🌸", "🌺", "💐"],
    luxe:     ["✦", "◆", "◇"],
    leaves:   ["🌿", "🍃", "🌱"],
  };
  const icons = emojiMap[pattern];
  return (
    <>
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
        {[...Array(9)].map((_, i) => {
          const top = (i * 37) % 100;
          const left = (i * 61) % 100;
          const icon = icons[i % icons.length];
          const rot = (i * 53) % 360;
          const size = 12 + (i % 3) * 6;
          return (
            <span
              key={i}
              className="absolute select-none"
              style={{ top: `${top}%`, left: `${left}%`, fontSize: `${size}px`, transform: `rotate(${rot}deg)` }}
            >
              {icon}
            </span>
          );
        })}
      </div>
      {/* Subtle sheen */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/10 via-transparent to-black/10" />
    </>
  );
}

const FAQ = [
  { q: "How is the gift card delivered?", a: "The recipient gets a premium email (or WhatsApp message) with the card design, your message, and a unique redemption code. They just click the link to browse and pay using the card value." },
  { q: "Does it expire?", a: "No. Gifteeng e-gift cards don't expire — the recipient can redeem them whenever they want." },
  { q: "Can I edit or cancel after purchase?", a: "You can edit the recipient and message right up until delivery. For scheduled cards, you can also reschedule or cancel. Instant-send cards can't be recalled once delivered." },
  { q: "Is the amount fixed?", a: "No. You can pick any amount from ₹100 to ₹1,00,000 — preset buttons make the common choices one-tap." },
  { q: "Can it be used on personalised gifts?", a: "Yes. The redemption code works on every product on Gifteeng including custom canvas designs." },
  { q: "What if the recipient doesn't have a Gifteeng account?", a: "They don't need one to redeem. The link takes them through a guest flow — they pay nothing, just pick their gift." },
];

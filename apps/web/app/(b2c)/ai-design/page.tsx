"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronRight, Loader2, Check, Wand2, Bell, Gift, Zap, ArrowRight } from "lucide-react";

// ── How it works steps ───────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: "01",
    emoji: "🎁",
    title: "Pick a product",
    desc: "Browse our 500+ customisable gifts — frames, mugs, keychains, name plates & more.",
    color: "#ec4899",
  },
  {
    step: "02",
    emoji: "✨",
    title: "Describe the occasion",
    desc: "Tell AI who it's for and what the occasion is. AI writes the perfect personalised text.",
    color: "#8b5cf6",
  },
  {
    step: "03",
    emoji: "🖼️",
    title: "Preview & order",
    desc: "See the design live, tweak anything, then place your order. Delivered in 5–7 days.",
    color: "#f59e0b",
  },
];

// ── Example prompts ──────────────────────────────────────────────────────────
const EXAMPLE_PROMPTS = [
  "Birthday gift for Mom who loves gardening",
  "Anniversary surprise for my husband — romantic",
  "Farewell gift for a colleague who's moving to London",
  "Diwali gift for my boss — professional but warm",
  "Thank you gift for my teacher",
  "New baby gift for my best friend",
];

// ── Product category cards ────────────────────────────────────────────────────
const AI_READY_CATEGORIES = [
  { emoji: "🖼️", label: "Photo Frames",   href: "/products?category=Photo+Frames&customizable=true",   color: "#ec4899" },
  { emoji: "☕", label: "Custom Mugs",    href: "/products?category=Mugs&customizable=true",             color: "#f59e0b" },
  { emoji: "🏷️", label: "Name Plates",   href: "/products?category=Name+Plates&customizable=true",      color: "#8b5cf6" },
  { emoji: "🔑", label: "Keychains",      href: "/products?category=Keychains&customizable=true",        color: "#14b8a6" },
  { emoji: "👕", label: "Custom T-Shirts", href: "/products?category=Fashion&customizable=true",         color: "#0ea5e9" },
  { emoji: "📒", label: "Notebooks",      href: "/products?category=Notebooks&customizable=true",        color: "#f97316" },
];

// ── AI text demo ──────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function AiDesignPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [used, setUsed] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const generateDemo = async (p?: string) => {
    const text = (p ?? prompt).trim();
    if (!text) return;
    setLoading(true);
    setResult(null);
    setUsed(text);
    try {
      const r = await fetch(`${API_BASE}/api/ai/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Write a warm, heartfelt personalised message for a gift. Context: "${text}". Under 25 words. Return only the message text.`,
        }),
      });
      if (!r.ok) throw new Error(`Server error (${r.status})`);
      const d = (await r.json()) as { text: string };
      setResult(d.text?.trim() || "Something went wrong. Try again!");
    } catch {
      setResult("Could not generate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (ex: string) => {
    setPrompt(ex);
    generateDemo(ex);
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-background font-body pt-20 pb-16">

      {/* ══════════ HERO ══════════ */}
      <section className="relative overflow-hidden pb-16 pt-10 md:pt-16">

        <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">AI-Powered Personalisation</span>
          </div>

          <h1 className="font-display text-3xl md:text-5xl font-black leading-[1.05] tracking-[-0.02em] mb-4">
            Design Your Gift{" "}
            <span className="italic text-brand">
              with AI
            </span>
          </h1>

          <div className="mx-auto mb-5 h-[2px] w-12 rounded-full bg-brand" />

          <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-8 max-w-xl mx-auto">
            Just tell us the occasion and who it&apos;s for — our AI instantly generates heartfelt, personalised text for your gift. No creative blocks, no generic messages.
          </p>

          {/* Demo AI input */}
          <div className="bg-card border border-border/60 rounded-3xl p-4 md:p-6 shadow-xl shadow-primary/5 text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2 px-1">
              ✨ Try it now — describe your gift occasion
            </p>
            <div className="relative">
              <textarea
                ref={inputRef}
                rows={2}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generateDemo(); } }}
                placeholder="e.g. Birthday gift for my Mom who loves cooking..."
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <button
                onClick={() => generateDemo()}
                disabled={!prompt.trim() || loading}
                className="absolute right-2 bottom-2 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 transition-all active:scale-95"
                style={{ background: "hsl(351 85% 58%)" }}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Generate
              </button>
            </div>

            {/* Example prompts */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {EXAMPLE_PROMPTS.slice(0, 4).map(ex => (
                <button
                  key={ex}
                  onClick={() => handleExampleClick(ex)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  {ex}
                </button>
              ))}
            </div>

            {/* AI result */}
            {(loading || result) && (
              <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>AI is crafting your message…</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center mt-0.5 bg-brand">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                          Generated for: {used}
                        </p>
                        <p className="text-sm text-foreground font-medium leading-relaxed italic">
                          &ldquo;{result}&rdquo;
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/products?customizable=true"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:gap-2.5 transition-all mt-1"
                    >
                      Now pick a product to apply this → <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-4xl">

        {/* ══════════ HOW IT WORKS ══════════ */}
        <section className="py-10 md:py-12">
          <div className="text-center mb-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">Simple as 1-2-3</p>
            <h2 className="text-xl md:text-2xl font-bold">How AI Customisation Works</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
            {/* Connector lines on desktop */}
            <div className="hidden md:block absolute top-11 left-[33%] w-[8%] border-t-2 border-dashed border-primary/20" />
            <div className="hidden md:block absolute top-11 left-[60%] w-[8%] border-t-2 border-dashed border-primary/20" />

            {HOW_IT_WORKS.map((item, i) => (
              <div key={item.step} className="relative flex items-start md:flex-col md:items-center md:text-center gap-4 md:gap-3 rounded-2xl border border-border/50 bg-card p-5 md:p-6">
                {/* Step number badge */}
                <div className="absolute -top-3 left-5 md:left-1/2 md:-translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-black text-white" style={{ background: item.color }}>
                  {item.step}
                </div>
                {/* Emoji */}
                <div className="shrink-0 mt-3 md:mt-4 w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-md"
                  style={{ background: `${item.color}15`, boxShadow: `0 4px 16px ${item.color}25` }}>
                  {item.emoji}
                </div>
                <div className="md:mt-1">
                  <h3 className="font-bold text-sm md:text-base mb-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════ AI-READY CATEGORIES ══════════ */}
        <section className="py-8">
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary mb-1">Shop by type</p>
              <h2 className="text-lg md:text-xl font-bold">AI-Ready Customisable Gifts</h2>
            </div>
            <Link href="/products?customizable=true" className="text-xs font-bold text-primary flex items-center gap-0.5 hover:gap-1 transition-all">
              All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {AI_READY_CATEGORIES.map(cat => (
              <Link key={cat.label} href={cat.href}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card p-3 md:p-4 hover:border-primary/30 hover:shadow-md transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-transform duration-200 group-hover:scale-110"
                  style={{ background: `${cat.color}15`, boxShadow: `0 0 0 1.5px ${cat.color}30` }}>
                  {cat.emoji}
                </div>
                <p className="text-[10px] md:text-xs font-semibold text-foreground/70 group-hover:text-primary transition-colors text-center leading-tight">{cat.label}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ══════════ USP HIGHLIGHTS ══════════ */}
        <section className="py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: <Wand2 className="w-5 h-5 text-white" />,
                title: "AI That Understands You",
                desc: "Not just a text template — our AI reads the context, the relationship, the emotion, and crafts something genuinely personal.",
                color: "#ec4899",
              },
              {
                icon: <Bell className="w-5 h-5 text-white" />,
                title: "Never Miss a Moment",
                desc: "Set birthday & anniversary reminders — the app nudges you 7 days before so you have time to order the perfect personalised gift.",
                color: "#f59e0b",
              },
              {
                icon: <Zap className="w-5 h-5 text-white" />,
                title: "Instant Preview",
                desc: "See your customised gift live before you order. What you see is what gets printed — no surprises.",
                color: "#8b5cf6",
              },
            ].map(usp => (
              <div key={usp.title} className="rounded-2xl border border-border/50 bg-card p-5 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                  style={{ background: usp.color }}>
                  {usp.icon}
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1">{usp.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{usp.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════ CLOSING CTA ══════════ */}
        <section className="py-8 mb-4">
          <div
            className="relative overflow-hidden rounded-2xl p-8 md:p-12 text-center text-white bg-brand"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {["♥","★","✦","◆"].map((s, i) => (
                <span key={i} className="absolute text-white/10" style={{ top: `${15 + i * 20}%`, left: `${8 + i * 25}%`, fontSize: `${16 + i * 6}px` }}>{s}</span>
              ))}
            </div>
            <div className="relative z-10">
              <Gift className="w-10 h-10 mx-auto mb-4 opacity-80" />
              <h2 className="font-display text-2xl md:text-3xl font-black mb-3 leading-tight">
                Ready to create something special?
              </h2>
              <p className="text-sm text-white/80 mb-6 max-w-sm mx-auto">
                Browse 500+ customisable gifts. Let AI do the heavy lifting.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/products?customizable=true"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold shadow-xl transition-all hover:scale-[1.03] active:scale-95"
                  style={{ color: "#be185d" }}
                >
                  Browse Customisable Gifts <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/account"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-white/30 px-7 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition-all"
                >
                  <Bell className="w-4 h-4" /> Set a Reminder
                </Link>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

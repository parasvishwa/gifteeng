"use client";

// ─── Trust & Quality strip — the homepage's single trust band ────────────────
// One horizontal row, 5 promises, divider-separated. This replaced TWO
// competing strips (an under-hero lucide strip + this one, which previously
// used emoji in 5 different pastel chips). Now: one strip, one icon
// language (lucide line icons), restrained brand-tinted treatment — no
// rainbow chips. Emoji-as-icon was also removed (inconsistent rendering
// across OS/browser, not a controlled icon set).
// ─────────────────────────────────────────────────────────────────────────────

import { Truck, MapPin, Award, RotateCcw, Headphones, type LucideIcon } from "lucide-react";

const BADGES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Truck,      title: "Free Delivery",   desc: "On orders ₹199+" },
  { icon: MapPin,     title: "Made in India",   desc: "Proudly crafted here" },
  { icon: Award,      title: "Premium Quality", desc: "Print-shop grade" },
  { icon: RotateCcw,  title: "7-Day Returns",   desc: "Hassle-free" },
  { icon: Headphones, title: "24/7 Support",    desc: "Always here to help" },
];

export default function TrustQualitySection() {
  return (
    <section className="py-4 mb-2">
      <div className="rounded-2xl border border-border/40 overflow-hidden bg-card">
        <div
          className="flex items-stretch divide-x divide-border/40 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {BADGES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex-1 min-w-[124px] flex items-center justify-center gap-2.5 py-4 px-3"
            >
              <Icon className="w-[18px] h-[18px] text-primary/75 shrink-0" strokeWidth={1.75} aria-hidden />
              <div className="leading-tight">
                <p className="text-[11px] md:text-xs font-bold text-foreground">{title}</p>
                <p className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

// ─── How Gifteeng Works + Make Your Gift Extra Special ───────────────────────
//
// Two-column card. Previous version was technically clean but bland — the
// step circles were tiny grey rings against a flat connector line. This
// polish:
//   • Brand-filled step badges with the icon ABOVE the number (icon carries
//     the meaning, number gives the sequence).
//   • Dashed brand connector instead of flat grey hairline.
//   • Add-ons get a subtle gradient surface treatment (not flat muted)
//     plus chip hover-lift.
//   • Both columns get a 3-px brand accent above the eyebrow so they read
//     as paired sections, not just sliced halves.

import Link from "next/link";
import { ArrowRight, Upload, Sparkles, PackageCheck } from "lucide-react";

const STEPS = [
  { num: "1", Icon: Upload,       label: "Upload",      desc: "Photo + custom text" },
  { num: "2", Icon: Sparkles,     label: "Customise",   desc: "We craft your gift"  },
  { num: "3", Icon: PackageCheck, label: "Delivered",   desc: "To your doorstep"    },
] as const;

const ADDONS = [
  { emoji: "🎁", title: "Gift Wraps"      },
  { emoji: "💌", title: "Thank You Cards" },
  { emoji: "📱", title: "Message Cards"   },
] as const;

export default function HowItWorksSection() {
  return (
    <div
      id="how-it-works"
      className="my-6 rounded-2xl overflow-hidden border border-border/30 bg-card shadow-[0_1px_3px_hsl(230_20%_0%/0.08),0_1px_6px_-1px_hsl(230_20%_0%/0.06)]"
    >
      <div className="grid grid-cols-1 md:grid-cols-2">

        {/* ── LEFT: How it works ─────────────────────────────────────────── */}
        <div className="relative px-5 py-6 md:px-6 md:py-7">
          {/* Tiny brand accent at the top of the column */}
          <span
            className="absolute top-0 left-5 md:left-6 h-[3px] w-8 rounded-b-full bg-primary"
            aria-hidden
          />
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary mb-1">
            Simple steps
          </p>
          <h2 className="text-[15px] md:text-base font-black text-foreground leading-tight mb-6">
            How Gifteeng Works
          </h2>

          {/* Steps — icon-led badges over a dashed brand connector */}
          <div className="relative flex items-start">
            {/* Dashed brand connector behind the badges */}
            <div
              className="absolute top-[22px] flex"
              style={{ left: "calc(100% / 6)", right: "calc(100% / 6)" }}
              aria-hidden
            >
              <div
                className="w-full"
                style={{
                  height: 2,
                  backgroundImage:
                    "repeating-linear-gradient(to right, hsl(var(--primary) / 0.35) 0 6px, transparent 6px 12px)",
                }}
              />
            </div>

            {STEPS.map(({ num, Icon, label, desc }) => (
              <div
                key={num}
                className="flex-1 flex flex-col items-center text-center px-1 relative z-10"
              >
                {/* Brand-filled badge with the icon. The numbered counter
                    sits below as small typographic context, not the hero. */}
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_4px_10px_-2px_hsl(var(--primary)/0.4)]">
                    <Icon className="w-[18px] h-[18px]" strokeWidth={2.25} aria-hidden />
                  </div>
                  <span
                    className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full bg-card ring-1 ring-border/60 text-[9px] font-black text-foreground/70 flex items-center justify-center"
                    aria-hidden
                  >
                    {num}
                  </span>
                </div>
                <p className="text-[11.5px] font-black text-foreground leading-tight mt-3">
                  {label}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Add-ons — soft brand-tinted gradient surface ───────── */}
        <div
          className="relative px-5 py-6 md:px-6 md:py-7 border-t md:border-t-0 md:border-l border-border/20"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--primary) / 0.04) 0%, hsl(var(--primary) / 0.01) 50%, transparent 100%)",
          }}
        >
          {/* Accent bar paired with the left column's */}
          <span
            className="absolute top-0 left-5 md:left-6 h-[3px] w-8 rounded-b-full bg-foreground/15"
            aria-hidden
          />
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground mb-1">
                At checkout
              </p>
              <h2 className="text-[15px] md:text-base font-black text-foreground leading-tight">
                Make It Extra Special
              </h2>
            </div>
            <Link
              href="/products?type=addon"
              className="text-[11px] font-bold text-primary inline-flex items-center gap-0.5 shrink-0 mt-0.5 hover:gap-1.5 transition-all"
            >
              Browse <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
            </Link>
          </div>

          {/* Chip list — hover-lift, no per-chip card containers */}
          <div className="flex flex-wrap gap-2">
            {ADDONS.map((a) => (
              <div
                key={a.title}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 py-2 transition-all hover:border-primary/40 hover:shadow-[0_4px_10px_-3px_hsl(var(--primary)/0.20)] hover:-translate-y-0.5 cursor-default"
              >
                <span className="text-base leading-none transition-transform group-hover:scale-110" aria-hidden>
                  {a.emoji}
                </span>
                <span className="text-[11px] font-bold text-foreground">{a.title}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

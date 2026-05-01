"use client";

// ─── Shop by Occasion — vibrant gradient cards ────────────────────────────────
//
// Each occasion gets a unique gradient card with white icon + label.
// Mobile: horizontal scroll row  |  Desktop: 6-column grid
//
// Tap → /b2c/products?tag=occasion:<slug>
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Cake, Gem, Briefcase, Flame, Home, Heart } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Spec {
  slug: string;
  label: string;
  Icon: LucideIcon;
  gradient: string;
  shadow: string;
  emoji: string;
}

const OCCASIONS: Spec[] = [
  {
    slug: "birthday",
    label: "Birthday",
    Icon: Cake,
    gradient: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
    shadow: "rgba(244,63,94,0.35)",
    emoji: "🎂",
  },
  {
    slug: "anniversary",
    label: "Anniversary",
    Icon: Gem,
    gradient: "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
    shadow: "rgba(168,85,247,0.35)",
    emoji: "💍",
  },
  {
    slug: "corporate",
    label: "Corporate",
    Icon: Briefcase,
    gradient: "linear-gradient(135deg, #3b82f6 0%, #4338ca 100%)",
    shadow: "rgba(59,130,246,0.35)",
    emoji: "💼",
  },
  {
    slug: "festival",
    label: "Festival",
    Icon: Flame,
    gradient: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    shadow: "rgba(245,158,11,0.35)",
    emoji: "🎉",
  },
  {
    slug: "housewarming",
    label: "Housewarming",
    Icon: Home,
    gradient: "linear-gradient(135deg, #10b981 0%, #0d9488 100%)",
    shadow: "rgba(16,185,129,0.35)",
    emoji: "🏠",
  },
  {
    slug: "just-because",
    label: "Just Because",
    Icon: Heart,
    gradient: "linear-gradient(135deg, #f472b6 0%, #db2777 100%)",
    shadow: "rgba(244,114,182,0.35)",
    emoji: "💝",
  },
];

export default function OccasionChips() {
  return (
    <section className="mt-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base md:text-lg font-black tracking-tight text-foreground">
          Shop by Occasion
        </h2>
        <span className="text-[11px] text-muted-foreground italic">What&apos;s the moment?</span>
      </div>

      {/* py-3 gives vertical room so hover:scale doesn't get clipped by overflow-x container */}
      <div
        className="flex gap-3 overflow-x-auto -mx-4 px-4 py-3 md:grid md:grid-cols-6 md:gap-4 md:-mx-0 md:px-0 md:py-3 md:overflow-visible [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {OCCASIONS.map((o) => (
          <Link
            key={o.slug}
            href={`/b2c/products?tag=occasion:${o.slug}`}
            className="group relative shrink-0 w-[108px] md:w-auto h-[100px] md:h-[116px] rounded-2xl flex flex-col items-center justify-center gap-2.5 overflow-hidden transition-all duration-200 hover:scale-[1.05] hover:-translate-y-0.5 active:scale-95"
            style={{
              background: o.gradient,
              boxShadow: `0 6px 20px -4px ${o.shadow}`,
            }}
          >
            {/* Radial shine on hover */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{
                background:
                  "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18) 0%, transparent 60%)",
              }}
            />
            {/* Subtle dot pattern texture */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)",
                backgroundSize: "14px 14px",
              }}
            />
            {/* Icon */}
            <o.Icon
              aria-hidden
              className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow relative z-10"
              strokeWidth={1.8}
            />
            {/* Label */}
            <span className="text-[11px] md:text-[12px] font-bold text-white relative z-10 text-center leading-tight px-2">
              {o.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

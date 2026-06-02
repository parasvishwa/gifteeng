"use client";

// ─── Shop by Occasion — hardcoded occasions with Lucide SVG icons ─────────────
// UI/UX Pro Max §4: SVG icons only, no emoji for navigation tiles.
// Each occasion uses a Lucide icon inside a colored block tile so it renders
// consistently across all platforms without font/emoji rendering variance.
// Mobile: horizontal scroll  |  Desktop: single row grid
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  Cake, HeartHandshake, User, UserRound,
  Heart, Users, Plane, Home, ArrowRight,
} from "lucide-react";

// Icon + brand-blush surface — consistent, scalable, accessible.
// Color variants give each tile a distinct identity without a rainbow clash.
const OCCASIONS = [
  {
    slug: "birthday",
    label: "Birthday",
    Icon: Cake,
    href: "/products?tag=occasion:birthday",
    color: "text-rose-500",
    bg: "bg-rose-50 border-rose-100 group-hover:bg-rose-100",
  },
  {
    slug: "anniversary",
    label: "Anniversary",
    Icon: HeartHandshake,
    href: "/products?tag=occasion:anniversary",
    color: "text-pink-500",
    bg: "bg-pink-50 border-pink-100 group-hover:bg-pink-100",
  },
  {
    slug: "for-him",
    label: "For Him",
    Icon: User,
    href: "/products?tag=recipient:him",
    color: "text-blue-500",
    bg: "bg-blue-50 border-blue-100 group-hover:bg-blue-100",
  },
  {
    slug: "for-her",
    label: "For Her",
    Icon: UserRound,
    href: "/products?tag=recipient:her",
    color: "text-violet-500",
    bg: "bg-violet-50 border-violet-100 group-hover:bg-violet-100",
  },
  {
    slug: "valentines",
    label: "Valentine's",
    Icon: Heart,
    href: "/products?tag=occasion:valentine",
    color: "text-red-500",
    bg: "bg-red-50 border-red-100 group-hover:bg-red-100",
  },
  {
    slug: "friendship",
    label: "Friendship",
    Icon: Users,
    href: "/products?tag=occasion:friendship",
    color: "text-amber-500",
    bg: "bg-amber-50 border-amber-100 group-hover:bg-amber-100",
  },
  {
    slug: "farewell",
    label: "Farewell",
    Icon: Plane,
    href: "/products?tag=occasion:farewell",
    color: "text-sky-500",
    bg: "bg-sky-50 border-sky-100 group-hover:bg-sky-100",
  },
  {
    slug: "housewarming",
    label: "New Home",
    Icon: Home,
    href: "/products?tag=occasion:housewarming",
    color: "text-emerald-500",
    bg: "bg-emerald-50 border-emerald-100 group-hover:bg-emerald-100",
  },
] as const;

export default function OccasionScroll() {
  return (
    <section className="mt-5 mb-6">
      {/* Header — Rubik font via font-display */}
      <div className="text-center mb-4">
        <h2 className="text-lg md:text-xl font-display font-black tracking-tight text-foreground">
          Shop By Occasion
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Birthday, anniversary, farewell and more
        </p>
      </div>

      {/* Scroll row */}
      <div
        className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-3
                   md:grid md:grid-cols-9 md:gap-3 md:-mx-0 md:px-0 md:overflow-visible
                   [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {OCCASIONS.map((o, i) => (
          <Link
            key={o.slug}
            href={o.href}
            className="group flex-shrink-0 flex flex-col items-center gap-2 w-[68px] md:w-auto animate-stagger-in"
            style={{ animationDelay: `${i * 35}ms` }}
          >
            {/* Tile — colored block, Lucide SVG icon, 44×44 min touch target */}
            <div
              className={`w-[68px] h-[68px] md:w-[76px] md:h-[76px] rounded-2xl flex items-center justify-center
                         border ${o.bg}
                         transition-[transform,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]
                         group-hover:-translate-y-1 group-hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.15)]
                         group-active:scale-95`}
            >
              <o.Icon className={`w-7 h-7 ${o.color}`} aria-hidden strokeWidth={1.75} />
            </div>
            {/* Label */}
            <span className="text-[10px] md:text-[11px] font-bold text-foreground/90 text-center leading-tight line-clamp-2 max-w-[68px] md:max-w-full">
              {o.label}
            </span>
          </Link>
        ))}

        {/* View All */}
        <Link
          href="/products"
          className="group flex-shrink-0 flex flex-col items-center gap-2 w-[68px] md:w-auto animate-stagger-in"
          style={{ animationDelay: `${OCCASIONS.length * 35}ms` }}
        >
          <div
            className="w-[68px] h-[68px] md:w-[76px] md:h-[76px] rounded-2xl flex items-center justify-center
                       bg-primary/[0.07] border border-primary/15
                       transition-[transform,background-color,box-shadow] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]
                       group-hover:bg-primary/[0.12] group-hover:-translate-y-1 group-hover:shadow-[0_8px_20px_-8px_hsl(350_80%_55%/0.25)]
                       group-active:scale-95"
          >
            <ArrowRight className="w-6 h-6 text-primary" aria-hidden strokeWidth={2} />
          </div>
          <span className="text-[10px] md:text-[11px] font-bold text-foreground/90 text-center leading-tight">
            View All
          </span>
        </Link>
      </div>
      {/* Swipe hint — mobile only */}
      <p className="md:hidden text-center text-[10px] text-muted-foreground/45 font-medium tracking-wide mt-1 select-none pointer-events-none" aria-hidden>
        swipe →
      </p>
    </section>
  );
}

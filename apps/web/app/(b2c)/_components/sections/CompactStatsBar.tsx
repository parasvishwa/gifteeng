"use client";

// Compact horizontal stats bar.
// UI/UX Pro Max: SVG icons only — no emoji (§4 no-emoji-icons rule).
// Gold (amber) is coins/rewards UI only — rating star uses text-primary (brand red).
// The largest stat (happy customers) gets a slight size bump for hierarchy.

import { Users, Star, Zap, MessageCircle, Gift } from "lucide-react";

// Value, label, icon. lead=true bumps the value scale.
const STATS: {
  icon: React.ReactNode;
  value: string;
  label: string;
  lead?: boolean;
}[] = [
  {
    icon: <Users className="w-4 h-4 text-primary" aria-hidden />,
    value: "3,00,000+",
    label: "Happy Customers",
    lead: true,
  },
  {
    icon: <Star className="w-4 h-4 text-primary fill-primary" aria-hidden />,
    value: "4.5",
    label: "Avg Rating",
  },
  {
    icon: <Zap className="w-4 h-4 text-amber-500" aria-hidden />,
    value: "24 Hrs",
    label: "Dispatch Time",
  },
  {
    icon: <MessageCircle className="w-4 h-4 text-primary" aria-hidden />,
    value: "5,000+",
    label: "5-Star Reviews",
  },
  {
    icon: <Gift className="w-4 h-4 text-primary" aria-hidden />,
    value: "500+",
    label: "Gift Designs",
  },
];

export default function CompactStatsBar() {
  return (
    <div className="my-3">
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
        <div
          className="flex items-stretch divide-x divide-border/50 overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {STATS.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-center gap-2 text-center py-2 px-3 md:px-4 shrink-0 flex-1 min-w-[110px]"
            >
              {/* Icon is now inline with the text — sits to the LEFT of the
                  number/label stack. Previous vertical layout (icon over
                  value over label, py-3.5) ate ~96px of height. Inline
                  brings it to ~46px and reads tighter as a "stats strip"
                  rather than five stacked cards. */}
              <span className="text-base leading-none shrink-0">{s.icon}</span>
              <div className="flex flex-col items-start leading-tight">
                <span
                  className={`font-black text-foreground leading-tight ${
                    s.lead ? "text-[13px] md:text-sm" : "text-[12px] md:text-[13px]"
                  }`}
                >
                  {s.value}
                </span>
                <span className="text-[9px] md:text-[10px] text-muted-foreground leading-tight">
                  {s.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Swipe hint — mobile only */}
      <p className="md:hidden text-center text-[10px] text-muted-foreground/45 font-medium tracking-wide mt-1 select-none pointer-events-none" aria-hidden>
        swipe →
      </p>
    </div>
  );
}

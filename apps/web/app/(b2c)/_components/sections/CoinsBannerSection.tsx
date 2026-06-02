"use client";

// ─── Play Games Win Coins Redeem & Save! ─────────────────────────────────────
// Shares the "celebrative maroon" recipe with the Return Gifts / Bulk Orders
// card on the homepage so the two dark hero cards read as one family rather
// than competing purple-vs-charcoal surfaces. Recipe:
//   • Deep wine linear-gradient base (#4A0E1F → #2D0712 → #1A040A)
//   • Brand-pink radial halo top-left + warm amber halo bottom-right
//   • Scattered sparkle dots (gold + white + brand-pink) with glow shadows
// CTA stays amber so it pops cleanly against the maroon.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

export default function CoinsBannerSection() {
  return (
    <section className="py-3 mb-2">
      <div
        className="relative overflow-hidden rounded-2xl p-5 md:p-8 border border-white/[0.06]"
        style={{
          background:
            "radial-gradient(ellipse 55% 55% at 18% 12%, rgba(239,55,82,0.28) 0%, transparent 70%)," +
            "radial-gradient(ellipse 55% 50% at 88% 85%, rgba(255,180,80,0.18) 0%, transparent 70%)," +
            "linear-gradient(135deg, #4A0E1F 0%, #2D0712 55%, #1A040A 100%)",
        }}
      >
        {/* Sparkle confetti — same palette as the Return Gifts card so the
            two banners glitter the same way. */}
        <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
          {[
            { top: "10%", left: "8%",  size: 4, color: "#fbbf24", opacity: 0.7  },
            { top: "20%", left: "85%", size: 3, color: "#ffffff", opacity: 0.5  },
            { top: "55%", left: "92%", size: 5, color: "#fbbf24", opacity: 0.55 },
            { top: "70%", left: "5%",  size: 3, color: "#ffffff", opacity: 0.45 },
            { top: "85%", left: "40%", size: 4, color: "#EF3752", opacity: 0.5  },
            { top: "15%", left: "55%", size: 2, color: "#fbbf24", opacity: 0.5  },
            { top: "42%", left: "32%", size: 2, color: "#ffffff", opacity: 0.4  },
            { top: "78%", left: "72%", size: 3, color: "#fbbf24", opacity: 0.45 },
          ].map((dot, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                top: dot.top, left: dot.left,
                width: dot.size, height: dot.size,
                background: dot.color,
                opacity: dot.opacity,
                boxShadow: `0 0 ${dot.size * 2}px ${dot.color}`,
              }}
            />
          ))}
          {/* Soft amber glow behind the controller emoji on the right */}
          <div
            className="absolute right-6 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full"
            style={{ background: "radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10 flex items-center gap-4 md:gap-8">
          {/* Text block */}
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl md:text-2xl font-black text-white leading-tight mb-2">
              Play Games. Win Coins.<br />
              <span className="text-amber-400">Redeem &amp; Save!</span>
            </h2>
            <p className="text-xs md:text-sm text-white/65 leading-relaxed mb-5 max-w-xs">
              Play exciting games, earn coins and use them to get amazing discounts on your cart.
            </p>
            <Link
              href="/play"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 text-[#2D0712] font-black text-sm px-6 py-3 shadow-lg shadow-black/40 hover:bg-amber-300 hover:scale-[1.03] active:scale-95 transition-all duration-200"
            >
              Play Now &amp; Earn 🪙
            </Link>
            <p className="text-[10px] text-white/55 mt-2">
              It&apos;s fun, easy &amp; rewarding!
            </p>
          </div>

          {/* Decorative gift trophy — right side */}
          <div className="shrink-0 text-[80px] md:text-[100px] leading-none select-none pointer-events-none">
            🎮
          </div>
        </div>
      </div>
    </section>
  );
}

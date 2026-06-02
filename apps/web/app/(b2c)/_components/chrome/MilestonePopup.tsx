"use client";

/**
 * MilestonePopup — confetti celebration for the every-Nth-signup winner.
 *
 * Reads /api/auth/b2c/me, looks for `metadata.milestoneClaim` with `seen=false`,
 * shows a celebratory modal once, then marks it seen via
 * POST /api/auth/b2c/me/milestone-claim/seen so it never fires again.
 */

import { useEffect, useState } from "react";
import { Sparkles, X, Coins } from "lucide-react";
import { apiB2c, getB2cToken } from "@/lib/api";

interface MilestoneClaim {
  kind:      "web" | "app";
  position:  number;
  amount:    number;
  awardedAt: string;
  seen:      boolean;
}

interface MeResponse {
  metadata?: { milestoneClaim?: MilestoneClaim } | null;
}

export default function MilestonePopup() {
  const [claim, setClaim] = useState<MilestoneClaim | null>(null);

  useEffect(() => {
    const token = getB2cToken();
    if (!token) return;
    apiB2c().get<MeResponse>("/api/auth/b2c/me").then((data) => {
      const c = data?.metadata?.milestoneClaim;
      if (c && c.seen === false) setClaim(c);
    }).catch(() => {});
  }, []);

  const dismiss = async () => {
    setClaim(null);
    try { await apiB2c().post("/api/auth/b2c/me/milestone-claim/seen", {}); }
    catch { /* non-fatal */ }
  };

  if (!claim) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-300">
      {/* Confetti via emoji rain — simple, no extra libs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <span
            key={i}
            className="absolute text-2xl animate-confetti"
            style={{
              left:           `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          >{["🎉","🎊","✨","🪙","🎁","⭐"][i % 6]}</span>
        ))}
      </div>

      <style jsx global>{`
        @keyframes confetti {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti { animation: confetti 3s linear infinite; }
      `}</style>

      <div className="relative bg-card rounded-3xl border border-border max-w-md w-full overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
        {/* Hero gradient */}
        <div className="bg-gradient-to-br from-amber-400 via-[#EF3752] to-purple-500 px-6 pt-8 pb-6 text-center">
          <button onClick={dismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white">
            <X className="w-4 h-4" />
          </button>
          <div className="text-7xl mb-3 inline-block animate-bounce">🎉</div>
          <h2 className="text-3xl font-black text-white">You're our {claim.position.toLocaleString()}{ordinal(claim.position)}!</h2>
          <p className="text-white/90 text-sm mt-2">
            {claim.kind === "web" ? "Website visitor" : "App downloader"}
          </p>
        </div>

        {/* Goins reward */}
        <div className="px-6 py-6 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Coins className="w-6 h-6" />
            <span className="text-3xl font-black">+{claim.amount.toLocaleString()}</span>
            <span className="font-bold">Goins</span>
          </div>
          <p className="text-sm text-muted-foreground">
            We've credited <strong className="text-foreground">{claim.amount.toLocaleString()} Goins</strong> to your wallet.
            Use them on your next purchase, or play games to earn more!
          </p>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={dismiss}
            className="w-full py-3 rounded-xl bg-[#EF3752] text-white font-black flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Continue Shopping
          </button>
        </div>
      </div>
    </div>
  );
}

// 1 → 1st, 2 → 2nd, 3 → 3rd, others → th
function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

"use client";

/**
 * CartWinnings — "Your Winnings" panel shown at top of cart page.
 * Lists user's pending + applied rewards with one-tap apply/remove.
 * Stack rules enforced server-side; we just reflect the server state.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gift, Check, Clock, Sparkles, ChevronRight } from "lucide-react";
import { cartFetch, getB2cToken } from "@/lib/api";

type Reward = {
  id: string;
  code: string;
  type: "goins" | "discount_pct" | "discount_flat" | "free_shipping" | "free_gift_wrap" | "free_product" | "miss";
  value: string;
  label: string;
  status: "pending" | "applied";
  source: string;
  minCartInr: number;
  expiresAt: string | null;
};

type Props = {
  /** Current cart subtotal — used to show eligibility warnings */
  subtotalInr: number;
  /** Called whenever a reward is applied or removed so the cart can recompute */
  onChange?: () => void;
};

const REWARD_ICON: Record<Reward["type"], string> = {
  goins:          "🪙",
  discount_pct:   "🎯",
  discount_flat:  "💸",
  free_shipping:  "🚚",
  free_gift_wrap: "🎀",
  free_product:   "🎁",
  miss:           "💨",
};

export default function CartWinnings({ subtotalInr, onChange }: Props) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState<string | null>(null);
  const [authed, setAuthed]   = useState(false);
  const [showAll, setShowAll] = useState(false);

  // ── Load active rewards ───────────────────────────────────────────────────
  useEffect(() => {
    const token = getB2cToken();
    setAuthed(!!token);
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await cartFetch<Reward[]>("/rewards/active", { authed: true });
        setRewards(r);
      } catch { /* no-op: not logged in or no rewards */ }
      setLoading(false);
    })();
  }, []);

  const handleToggle = async (reward: Reward) => {
    if (busy) return;
    setBusy(reward.id);
    try {
      await cartFetch("/rewards/apply", {
        method: "POST",
        body: JSON.stringify({ rewardId: reward.id }),
        authed: true,
      });
      // Refresh
      const r = await cartFetch<Reward[]>("/rewards/active", { authed: true });
      setRewards(r);
      onChange?.();
    } catch { /* no-op */ }
    setBusy(null);
  };

  if (loading) return null;
  if (!authed) return null;
  if (rewards.length === 0) {
    return (
      <Link
        href="/b2c/play"
        className="block rounded-2xl border border-dashed border-amber-400/30 bg-muted/30 p-4 mb-4 hover:border-amber-400/50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xl bg-gold/15"
          >
            🎰
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              Play & unlock discounts
            </p>
            <p className="text-xs text-white/40">
              Free scratch cards, mystery boxes & jackpots
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-white/40 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
        </div>
      </Link>
    );
  }

  return (
    <div className="mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-black uppercase tracking-wider text-white">
            Your Winnings
            <span className="ml-1.5 text-[10px] font-bold text-primary">
              ({rewards.length})
            </span>
          </h3>
        </div>
        <Link
          href="/b2c/play"
          className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-0.5"
        >
          Play more <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Rewards — show max 3 collapsed, expand on demand */}
      <div className="space-y-2">
        {(showAll ? rewards : rewards.slice(0, 3)).map((r) => {
          const isApplied = r.status === "applied";
          const eligible = r.minCartInr === 0 || subtotalInr >= r.minCartInr;
          const needsMore = !eligible ? r.minCartInr - subtotalInr : 0;
          const expiresIn = r.expiresAt ? daysUntil(r.expiresAt) : null;
          const isWorking = busy === r.id;

          return (
            <div
              key={r.id}
              className={`relative rounded-2xl overflow-hidden border transition-all ${
                isApplied
                  ? "bg-brand/8 border-brand/40"
                  : eligible
                  ? "bg-[#12131A] border-white/10"
                  : "bg-white/5 border-white/10"
              }`}
            >

              <div className="relative flex items-center gap-3 p-3">
                {/* Icon */}
                <div
                  className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xl ${
                    isApplied ? "bg-brand/15" : "bg-white/10/50"
                  }`}
                >
                  {REWARD_ICON[r.type]}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {r.label}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[10px] text-white/40">
                    {r.code && (
                      <span className="font-mono font-semibold">{r.code}</span>
                    )}
                    {r.minCartInr > 0 && (
                      <span>min ₹{r.minCartInr}</span>
                    )}
                    {expiresIn !== null && expiresIn > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {expiresIn}d left
                      </span>
                    )}
                    <span className="capitalize opacity-60">· from {r.source.replace("_", " ")}</span>
                  </div>
                  {!eligible && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-semibold">
                      Add ₹{needsMore} more to unlock
                    </p>
                  )}
                </div>

                {/* Action */}
                {r.type === "goins" || r.type === "miss" ? (
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/40 px-2 py-1 rounded-full bg-muted/50">
                    In wallet
                  </span>
                ) : isApplied ? (
                  <button
                    onClick={() => handleToggle(r)}
                    disabled={isWorking}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-black text-white bg-brand hover:bg-brand-dark transition-colors active:scale-95 disabled:opacity-60"
                  >
                    <Check className="w-3 h-3" />
                    Applied
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggle(r)}
                    disabled={!eligible || isWorking}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                      eligible ? "bg-brand hover:bg-brand-dark text-white" : "bg-white/10 text-white/40"
                    }`}
                  >
                    {isWorking ? "…" : "Apply"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show all / Show less toggle */}
      {rewards.length > 3 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="mt-2 w-full text-[11px] font-bold text-primary hover:text-primary/80 transition-colors py-1.5 rounded-xl border border-white/10/40 hover:bg-white/5"
        >
          {showAll
            ? "Show less ↑"
            : `Show all ${rewards.length} rewards ↓`}
        </button>
      )}
    </div>
  );
}

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

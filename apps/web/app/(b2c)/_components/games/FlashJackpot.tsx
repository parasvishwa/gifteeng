"use client";

/**
 * FlashJackpot — one random winner per hour (IST).
 * User clicks "Try Flash" — we roll the dice; if won, they get a
 * ready-to-use discount code valid for 24 hours.
 * Live feed of last 5 winners shown below.
 */

import { useEffect, useState, useRef } from "react";
import { X, Zap, Clock, Trophy } from "lucide-react";
import ConfettiBurst from "../chrome/ConfettiBurst";
import { cartFetch } from "@/lib/api";

type State = {
  hourBucket: string;
  hasWinner: boolean;
  isMe: boolean;
  winner: { name: string; rewardLabel: string } | null;
};
type FeedItem = { id: string; name: string; rewardLabel: string; createdAt: string };
type RollResult = {
  won: boolean;
  alreadyWinner?: boolean;
  isMe?: boolean;
  rewardCode?: string;
  rewardLabel?: string;
  message: string;
};

type Props = { onClose: () => void };

export default function FlashJackpot({ onClose }: Props) {
  const [state, setState]       = useState<State | null>(null);
  const [feed, setFeed]         = useState<FeedItem[]>([]);
  const [rolling, setRolling]   = useState(false);
  const [result, setResult]     = useState<RollResult | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [nextHourIn, setNextHourIn] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Load state + feed
  const load = async () => {
    try {
      const [s, f] = await Promise.all([
        cartFetch<State>("/flash-jackpot/state", { authed: true }).catch(() => null),
        cartFetch<FeedItem[]>("/flash-jackpot/feed?limit=5").catch(() => []),
      ]);
      if (s) setState(s);
      setFeed(f ?? []);
    } catch {}
  };
  useEffect(() => { void load(); }, []);

  // Countdown to next hour
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const mins = 59 - ist.getUTCMinutes();
      const secs = 59 - ist.getUTCSeconds();
      setNextHourIn(`${mins}m ${secs}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const roll = async () => {
    if (rolling) return;
    setRolling(true);
    setResult(null);
    try {
      // Short dramatic delay — sporty feel
      await new Promise((r) => setTimeout(r, 400));
      const r = await cartFetch<RollResult>("/flash-jackpot/roll", {
        method: "POST",
        authed: true,
      });
      setResult(r);
      if (r.won) {
        setShowConfetti(true);
      }
      await load();
    } catch (e: any) {
      setResult({ won: false, message: e?.body?.message ?? "Something went wrong" });
    }
    setRolling(false);
  };

  const canRoll = state && !state.hasWinner && !result;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <ConfettiBurst active={showConfetti} onDone={() => setShowConfetti(false)} />
      <div
        ref={rootRef}
        className="relative w-full max-w-md rounded-2xl bg-[#12131A] border border-white/10 p-6 shadow-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 z-10"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>

        {/* Header */}
        <div className="text-center mb-5 relative">
          <p className="text-amber-300/80 text-[9px] font-black uppercase tracking-[0.22em] mb-1 flex items-center justify-center gap-1">
            <Zap className="w-3 h-3" fill="currentColor" />
            Flash Jackpot · Every Hour
          </p>
          <h2 className="text-white text-xl font-black">One lucky Gifteer wins</h2>
          <p className="text-white/50 text-xs mt-0.5">
            {state?.hasWinner
              ? "This hour's winner already picked"
              : `Next draw in ${nextHourIn}`}
          </p>
        </div>

        {/* Current state */}
        {state?.hasWinner && state.winner && !result && (
          <div
            className="rounded-2xl p-4 mb-4 border border-amber-400/40 bg-amber-500/10"
          >
            <div className="flex items-center gap-3">
              <Trophy className="w-10 h-10 text-amber-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-amber-300/80 text-[9px] font-black uppercase tracking-[0.2em]">
                  This hour's winner
                </p>
                <p className="text-white font-black text-base">
                  {state.isMe ? "You 🎉" : state.winner.name}
                </p>
                <p className="text-white/70 text-xs mt-0.5">{state.winner.rewardLabel}</p>
              </div>
            </div>
          </div>
        )}

        {/* Roll result */}
        {result && (
          <div
            className={`rounded-2xl p-4 mb-4 text-center ${result.won ? "bg-brand" : "bg-white/5"}`}
          >
            {result.won ? (
              <>
                <div className="text-4xl mb-1 scr-pop">⚡</div>
                <p className="text-white font-black text-lg">You won!</p>
                <p className="text-white/90 text-sm mt-0.5">{result.rewardLabel}</p>
                {result.rewardCode && (
                  <p className="mt-2 text-[11px] font-mono bg-black/30 text-white px-3 py-1 rounded-lg inline-block">
                    {result.rewardCode}
                  </p>
                )}
                <p className="text-white/70 text-[10px] mt-2">Valid for 24 hours only!</p>
              </>
            ) : (
              <>
                {/* Miss state — animated so it doesn't feel broken. The bolt
                    twitches + a soft shockwave ring fades out to communicate
                    "roll was real, just unlucky". */}
                <div className="relative w-16 h-16 mx-auto mb-2">
                  <div className="absolute inset-0 rounded-full bg-amber-400/30 blur-xl" style={{ animation: "fj-miss-ring 2.4s ease-out infinite" }} />
                  <div className="relative w-full h-full rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                    <span className="text-3xl" style={{ animation: "fj-miss-twitch 2.4s ease-in-out infinite" }}>⚡</span>
                  </div>
                </div>
                <p className="text-white/85 font-black text-sm">{result.message || "So close! Try again next hour."}</p>
                <p className="text-white/40 text-[11px] mt-0.5">New winner every hour — the dice reroll automatically.</p>
                <style>{`
                  @keyframes fj-miss-twitch{0%,88%,100%{transform:rotate(-4deg) scale(1)}92%{transform:rotate(6deg) scale(1.12)}96%{transform:rotate(-6deg) scale(1.12)}}
                  @keyframes fj-miss-ring{0%{transform:scale(.8);opacity:.6}100%{transform:scale(1.6);opacity:0}}
                `}</style>
              </>
            )}
          </div>
        )}

        {/* Roll button */}
        {canRoll && (
          <button
            onClick={roll}
            disabled={rolling}
            className="w-full py-3.5 rounded-2xl text-sm font-black bg-brand hover:bg-brand-dark text-white transition-colors active:scale-95 disabled:opacity-60"
          >
            {rolling ? "Rolling the dice…" : "⚡ TRY FLASH JACKPOT"}
          </button>
        )}

        {state?.hasWinner && !result && (
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-sm font-black text-white bg-white/10 hover:bg-white/20"
          >
            Come back in {nextHourIn}
          </button>
        )}

        {/* Live feed */}
        {feed.length > 0 && (
          <div className="mt-5">
            <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.22em] mb-2">
              Recent Winners
            </p>
            <div className="space-y-1.5">
              {feed.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <span className="text-base">⚡</span>
                  <span className="text-white/80 font-semibold flex-1 truncate">
                    <span className="text-amber-300">{w.name}</span> won {w.rewardLabel}
                  </span>
                  <span className="text-white/30 text-[10px]">{timeAgo(w.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <style>{`
          @keyframes scr-pop {
            0%   { transform: scale(0.5); opacity: 0; }
            60%  { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(1); }
          }
          .scr-pop { animation: scr-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both; }
        `}</style>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

"use client";

/**
 * GoinWager — Stake Goins, double-or-nothing with tiered payouts. Deploy 119.
 *
 * POST /api/games/goin-wager { stake } → { won, multiplier, payout, net, outcomeLabel }
 *
 * Max 5 plays/day (server-enforced). Stakes clamped 50–2000.
 */

import { useState, useEffect, useRef } from "react";
import { X, TrendingUp, TrendingDown } from "lucide-react";
import ConfettiBurst from "../chrome/ConfettiBurst";
import { cartFetch } from "@/lib/api";
import { flyCoinsToNavbar } from "@/lib/coins-fx";

type WagerResult = {
  stake: number;
  won: boolean;
  multiplier: number;
  payout: number;
  net: number;
  outcomeLabel: string;
};

const PRESETS = [50, 100, 250, 500, 1000];

// Unicode die faces ⚀–⚅
const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

/** Animate a number counting up from 0 to target over ~700 ms. */
function useCountUp(target: number, active: boolean) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!active || target === 0) { setDisplay(target); return; }
    const steps = 28;
    const delay = 700 / steps;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setDisplay(Math.round((target * step) / steps));
      if (step >= steps) clearInterval(id);
    }, delay);
    return () => clearInterval(id);
  }, [target, active]);
  return display;
}

export default function GoinWager({ onClose }: { onClose: () => void }) {
  const [stake, setStake] = useState(100);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [diceFrame, setDiceFrame] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<WagerResult | null>(null);
  const [confetti, setConfetti] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const displayNet = useCountUp(result?.net ?? 0, !!result?.won);

  // Cycle through dice faces while rolling
  useEffect(() => {
    if (rolling) {
      let frame = 0;
      intervalRef.current = setInterval(() => {
        frame = (frame + 1) % DICE_FACES.length;
        setDiceFrame(frame);
      }, 80);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [rolling]);

  const play = async () => {
    setBusy(true);
    setRolling(true);
    setErr(null);
    setResult(null);
    try {
      const res = await cartFetch<WagerResult>(
        "/games/goin-wager",
        { method: "POST", authed: true, body: JSON.stringify({ stake }) },
      );
      // Brief dramatic pause before revealing result
      await new Promise((r) => setTimeout(r, 600));
      setRolling(false);
      setResult(res);
      if (res.won) {
        setConfetti(true);
        // Fly coins from result card to navbar
        setTimeout(() => {
          if (resultRef.current) {
            flyCoinsToNavbar(resultRef.current, {
              amount: res.payout,
              redeemable: true,
              source: "goin_wager",
            });
          }
        }, 300);
      }
    } catch (e: any) {
      setRolling(false);
      const msg =
        (e?.body as any)?.message ??
        e?.message ??
        "Couldn't place wager";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const playAgain = () => {
    setResult(null);
    setConfetti(false);
    setErr(null);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <ConfettiBurst active={confetti} onDone={() => setConfetti(false)} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#12131A] border border-white/10 shadow-lg p-6 text-white">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#1A1B24] hover:bg-[#22232e] border border-white/10 flex items-center justify-center text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>

          {/* Header — dice icon animates while rolling */}
          <div className="text-center mb-5">
            <div
              className="text-5xl mb-2 inline-block"
              style={rolling ? { animation: "diceRoll 0.15s ease-in-out infinite alternate" } : {}}
            >
              {rolling ? DICE_FACES[diceFrame] : result?.won ? (result.multiplier >= 10 ? "🏆" : result.multiplier >= 5 ? "💎" : "🎲") : "🎲"}
            </div>
            <h2 className="text-xl font-black">Goin Wager</h2>
            <p className="text-xs text-white/40 mt-1">
              Stake Goins. Roll the dice. 2×, 3×, 5×, 10× — or bust.
            </p>
          </div>

          {/* Inline keyframes for the dice wobble */}
          <style>{`
            @keyframes diceRoll {
              from { transform: rotate(-18deg) scale(1.2); }
              to   { transform: rotate(18deg) scale(0.88); }
            }
            @keyframes netPop {
              0%   { transform: scale(0.5); opacity: 0; }
              70%  { transform: scale(1.12); opacity: 1; }
              100% { transform: scale(1);   opacity: 1; }
            }
            @keyframes winGlow {
              0%,100% { opacity: 1; }
              50%     { opacity: 0.85; }
            }
          `}</style>

          {rolling ? (
            /* ── Rolling state ── */
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="flex gap-2">
                {DICE_FACES.map((face, i) => (
                  <span
                    key={i}
                    className="text-3xl"
                    style={{
                      opacity: diceFrame === i ? 1 : 0.18,
                      transform: diceFrame === i ? "scale(1.4)" : "scale(1)",
                      transition: "transform 80ms, opacity 80ms",
                    }}
                  >
                    {face}
                  </span>
                ))}
              </div>
              <p className="text-sm font-bold text-white/40 animate-pulse">
                Rolling the dice…
              </p>
            </div>

          ) : !result ? (
            /* ── Bet form ── */
            <>
              <div className="mb-4">
                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">
                  Your stake
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    value={stake}
                    min={50}
                    max={2000}
                    onChange={(e) =>
                      setStake(Math.max(50, Math.min(2000, parseInt(e.target.value, 10) || 0)))
                    }
                    className="flex-1 rounded-xl border border-white/10 bg-[#1A1B24] px-3 py-2.5 text-lg font-bold text-white"
                  />
                  <span className="text-sm font-bold text-white/40">G</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setStake(p)}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                        stake === p
                          ? "bg-rose-500 text-white"
                          : "bg-white/10 text-white/40 hover:bg-white/5"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 rounded-xl bg-white/5 p-3 text-[11px] space-y-0.5 text-white/70">
                <div className="flex justify-between"><span>2× payout</span><span className="text-white/40">40% odds</span></div>
                <div className="flex justify-between"><span>3× payout</span><span className="text-white/40">20% odds</span></div>
                <div className="flex justify-between"><span>5× payout</span><span className="text-white/40">8% odds</span></div>
                <div className="flex justify-between"><span>10× JACKPOT</span><span className="text-amber-500 font-bold">2% odds</span></div>
                <div className="flex justify-between text-rose-500"><span>House wins</span><span>30% odds</span></div>
              </div>

              <button
                onClick={play}
                disabled={busy}
                className="w-full rounded-xl bg-brand hover:bg-brand-dark text-white font-black py-3 text-base transition-colors disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-2">
                  ⚄ Wager {stake} G
                </span>
              </button>
              {err && (
                <div className="mt-3 text-center text-xs text-rose-500 font-semibold">
                  {err}
                </div>
              )}
              <p className="mt-3 text-[10px] text-center text-white/40">
                Max 5 wagers per day · Stake returns as deduction in your Goin history
              </p>
            </>

          ) : (
            /* ── Result ── */
            <div
              ref={resultRef}
              className="text-center py-4 rounded-2xl transition-all"
              style={result.won ? { animation: "winGlow 1.2s ease-in-out 2" } : {}}
            >
              {/* Win/loss burst emoji */}
              <div className={`text-6xl mb-3 ${result.won ? "animate-bounce" : "opacity-70"}`}>
                {result.won
                  ? result.multiplier >= 10 ? "🏆"
                  : result.multiplier >= 5  ? "💎"
                  : "🎉"
                  : "💨"}
              </div>

              <div className="text-xl font-black mb-1">{result.outcomeLabel}</div>

              {/* Animated net amount */}
              <div
                className={`text-5xl font-black my-4 ${result.net > 0 ? "text-emerald-500" : "text-rose-500"}`}
                style={{ animation: "netPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both" }}
              >
                {result.net > 0 ? "+" : ""}{result.won ? displayNet : result.net} G
              </div>

              {/* Multiplier badge on win */}
              {result.won && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-bold px-3 py-1 mb-3">
                  <TrendingUp className="w-3 h-3" />
                  {result.multiplier}× multiplier · {result.payout} G won
                </div>
              )}

              {!result.won && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 text-rose-500 text-xs font-semibold px-3 py-1 mb-3">
                  <TrendingDown className="w-3 h-3" />
                  Staked {result.stake} · stake lost
                </div>
              )}

              <div className="flex gap-2 justify-center mt-2">
                <button
                  onClick={playAgain}
                  className="rounded-full bg-rose-500 hover:bg-rose-600 text-white font-bold px-5 py-2 text-sm"
                >
                  Go again
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full bg-white/10 border border-white/15 hover:bg-white/15 text-white font-semibold px-5 py-2 text-sm transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

"use client";

/**
 * TreasureHunt — Pick 1 of 12 boxes. Deploy 119.
 *
 * POST /api/games/treasure-hunt { pickIndex } → { reward: { coins, label }, pickIndex }
 */

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import ConfettiBurst from "../chrome/ConfettiBurst";
import { cartFetch } from "@/lib/api";
import { flyCoinsToNavbar } from "@/lib/coins-fx";

const BOX_COUNT = 12;

type Reward = { type: string; value: string; label: string; coins: number };

export default function TreasureHunt({ onClose }: { onClose: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  const pick = async (idx: number, e: React.MouseEvent) => {
    if (picked !== null || busy) return;
    setPicked(idx);
    setBusy(true);
    setErr(null);
    try {
      const res = await cartFetch<{ reward: Reward; pickIndex: number }>(
        "/games/treasure-hunt",
        { method: "POST", authed: true, body: JSON.stringify({ pickIndex: idx }) },
      );
      setReward(res.reward);
      if (res.reward.coins > 0) {
        setTimeout(() => flyCoinsToNavbar(e.currentTarget as HTMLElement, { amount: res.reward.coins, redeemable: true, source: "treasure" }), 300);
        setConfetti(true); // confetti for any coin reward
      }
    } catch (e: any) {
      setErr((e?.body as any)?.message ?? e?.message ?? "Couldn't open the box");
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <ConfettiBurst active={confetti} onDone={() => setConfetti(false)} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#12131A] border border-white/10 shadow-lg p-6">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-[#1A1B24] hover:bg-[#22232e] border border-white/10 flex items-center justify-center text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
          <div className="text-center mb-5">
            <div className="text-5xl mb-2">🗺️</div>
            <h2 className="text-xl font-black">Treasure Hunt</h2>
            <p className="text-xs text-white/40 mt-1">
              Pick 1 of {BOX_COUNT} boxes. One hides a 1,500 G jackpot.
            </p>
          </div>

          {!reward ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: BOX_COUNT }).map((_, i) => {
                const isPicked = picked === i;
                return (
                  <button
                    key={i}
                    onClick={(e) => pick(i, e)}
                    disabled={picked !== null}
                    className={`relative aspect-square rounded-xl transition-all ${
                      isPicked
                        ? "scale-110 shadow-lg"
                        : picked === null
                          ? "hover:scale-105 hover:shadow-md cursor-pointer"
                          : "opacity-40"
                    }`}
                    style={{
                      background: ["#059669","#0ea5e9","#7c3aed","#ec4899","#f59e0b","#be123c"][i % 6],
                    }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-3xl">
                      {isPicked && busy ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : "📦"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <style>{`
                @keyframes treasurePop {
                  0%   { transform: scale(0.3) rotate(-15deg); opacity: 0; }
                  70%  { transform: scale(1.2) rotate(4deg); opacity: 1; }
                  100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes coinsBadgePop {
                  0%   { transform: scale(0.5); opacity: 0; }
                  80%  { transform: scale(1.1); opacity: 1; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
              <div
                className="text-6xl mb-3"
                style={{ animation: "treasurePop 0.6s cubic-bezier(0.34,1.56,0.64,1) both" }}
              >
                {reward.coins >= 1500 ? "🏆" : reward.coins >= 500 ? "💎" : reward.coins > 0 ? "🪙" : "📦"}
              </div>
              <div className="text-2xl font-black mb-1">{reward.label}</div>
              {reward.coins > 0 && (
                <div
                  className="text-2xl font-black text-emerald-500 my-2"
                  style={{ animation: "coinsBadgePop 0.5s 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}
                >
                  +{reward.coins} Goins
                </div>
              )}
              {reward.coins === 0 && (
                <div className="text-sm text-white/40 mt-1">Better luck next time!</div>
              )}
              <button
                onClick={onClose}
                className="mt-5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold px-6 py-2 transition-colors"
              >
                Awesome!
              </button>
            </div>
          )}

          {err && <div className="mt-3 text-center text-xs text-rose-500">{err}</div>}
          <p className="mt-3 text-[10px] text-center text-white/40">One hunt per day · Comes back at midnight IST</p>
      </div>
    </div>
  );
}

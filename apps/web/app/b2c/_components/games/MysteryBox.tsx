"use client";

/**
 * MysteryBox — Pick one of 6 wrapped boxes. Calls /api/games/mystery-box.
 * The picked box opens and reveals the prize with confetti.
 */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ConfettiBurst from "../chrome/ConfettiBurst";
import { flyCoinsToNavbar } from "@/lib/coins-fx";
import { cartFetch } from "@/lib/api";
import type { ScratchPrize } from "./ScratchCard";

type Props = { onClose: () => void; onRevealed?: (p: ScratchPrize) => void };

const BOX_COLORS = [
  { bg: "#EF3752", emoji: "🎀" },
  { bg: "#1A1B24", emoji: "🎁" },
  { bg: "#EF3752", emoji: "✨" },
  { bg: "#1A1B24", emoji: "🍬" },
  { bg: "#EF3752", emoji: "🧸" },
  { bg: "#1A1B24", emoji: "🪅" },
];

export default function MysteryBox({ onClose, onRevealed }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [prize, setPrize]   = useState<ScratchPrize | null>(null);
  const [err, setErr]       = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const pickBox = async (idx: number) => {
    if (picked !== null || loading) return;
    setPicked(idx);
    setLoading(true);
    try {
      const res = await cartFetch<ScratchPrize>("/games/mystery-box", {
        method: "POST",
        authed: true,
      });
      setPrize(res);
      setLoading(false);
      // Delay the reveal animation
      setTimeout(() => {
        if (!res.isMiss) setShowConfetti(true);
        if (res.goinsAwarded > 0) {
          flyCoinsToNavbar(cardRef.current, {
            amount: res.goinsAwarded,
            redeemable: true,
            source: "spin",
          });
        }
        onRevealed?.(res);
      }, 350);
    } catch (e: any) {
      setErr(e?.body?.message ?? "Could not open box");
      setLoading(false);
      setPicked(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <ConfettiBurst active={showConfetti} onDone={() => setShowConfetti(false)} />
      <div
        ref={cardRef}
        className="relative w-full max-w-md rounded-2xl bg-[#12131A] p-6 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>

        <div className="text-center mb-5">
          <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.22em] mb-1">
            🎁 Mystery Box
          </p>
          <h2 className="text-white text-lg font-black">
            {prize ? "You opened a box!" : "Pick a box, any box"}
          </h2>
          <p className="text-white/50 text-xs mt-0.5">
            {prize ? prize.rewardLabel : "One free pick per day — what's inside?"}
          </p>
        </div>

        {err && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-center text-red-300 text-sm mb-4">
            {err}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {BOX_COLORS.map((c, i) => {
            const isPicked = picked === i;
            const isOther  = picked !== null && picked !== i;
            return (
              <button
                key={i}
                onClick={() => pickBox(i)}
                disabled={picked !== null}
                className="relative aspect-square rounded-2xl overflow-hidden transition-all active:scale-90 disabled:cursor-default"
                style={{
                  background: c.bg,
                  border: `1px solid #1E2030`,
                  opacity: isOther ? 0.3 : 1,
                  transform: isPicked
                    ? prize ? "rotateY(180deg) scale(1.05)" : "scale(1.08)"
                    : "scale(1)",
                  transformStyle: "preserve-3d",
                  transition: "transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease-out",
                }}
              >
                {/* Ribbon cross */}
                <div
                  className="absolute top-1/2 left-0 right-0 h-2 -translate-y-1/2"
                  style={{
                    background: "rgba(255,255,255,0.25)",
                    opacity: prize && isPicked ? 0 : 1,
                    transition: "opacity 0.3s",
                  }}
                />
                <div
                  className="absolute left-1/2 top-0 bottom-0 w-2 -translate-x-1/2"
                  style={{
                    background: "rgba(255,255,255,0.25)",
                    opacity: prize && isPicked ? 0 : 1,
                    transition: "opacity 0.3s",
                  }}
                />
                {/* Bow */}
                <div
                  className="absolute top-1 left-1/2 -translate-x-1/2 text-xl"
                  style={{
                    opacity: prize && isPicked ? 0 : 1,
                    transition: "opacity 0.3s",
                  }}
                >
                  {c.emoji}
                </div>
                {/* Number */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-white/80 text-[10px] font-black">
                  #{i + 1}
                </div>
                {/* Revealed prize inside */}
                {isPicked && prize && (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-center p-2"
                    style={{
                      background: "linear-gradient(160deg, rgba(0,0,0,0.85), rgba(0,0,0,0.6))",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    <div>
                      <div className="text-2xl">{prize.isMiss ? "🎐" : prize.rewardType === "goins" ? "🪙" : "🎁"}</div>
                      <p className="text-white text-[11px] font-black mt-1 leading-tight px-1">
                        {prize.isMiss ? "Empty!" : prize.rewardLabel}
                      </p>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* CTA after reveal */}
        {prize && (
          <div className="mt-5 space-y-2">
            {prize.rewardCode && (
              <div className="text-center py-2 px-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-white/50 text-[10px] uppercase tracking-wider mb-0.5">Your code</p>
                <p className="text-white font-mono font-bold text-sm">{prize.rewardCode}</p>
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-black text-white bg-[#EF3752] shadow-sm"
            >
              Awesome, got it 🎉
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * Jackpot — 3-reel slot machine. Costs 500 Goins per spin.
 * Reels spin independently, land on random gift symbols.
 * If the API returns goins ≥ 1000 → "JACKPOT" banner.
 */

import { useRef, useState, useEffect } from "react";
import { X } from "lucide-react";
import ConfettiBurst from "../chrome/ConfettiBurst";
import { flyCoinsToNavbar } from "@/lib/coins-fx";
import { cartFetch } from "@/lib/api";
import type { ScratchPrize } from "./ScratchCard";

type Props = { onClose: () => void; goinBalance: number; costGoins: number };

const SYMBOLS = ["🎁", "🎂", "🎀", "💍", "🎊", "🧸", "🌹", "💎"];

export default function Jackpot({ onClose, goinBalance, costGoins }: Props) {
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels]       = useState<[number, number, number]>([0, 3, 5]);
  const [prize, setPrize]       = useState<ScratchPrize | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    if (audioRef.current) try { audioRef.current.close(); } catch {}
  }, []);

  const playReelSound = () => {
    try {
      if (!audioRef.current) {
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AC) return;
        audioRef.current = new AC();
      }
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 420;
      gain.gain.value = 0.02;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  };

  const playWin = () => {
    try {
      if (!audioRef.current) {
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AC) return;
        audioRef.current = new AC();
      }
      const ctx = audioRef.current;
      const notes = [392, 523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = f;
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.42);
      });
    } catch {}
  };

  const startSpin = async () => {
    if (spinning) return;
    if (goinBalance < costGoins) {
      setErr(`Not enough Goins — you need ${costGoins}.`);
      return;
    }
    setErr(null);
    setPrize(null);
    setSpinning(true);

    // Animation: spin reels FAST with staggered stops (sporty feel)
    const ticker = setInterval(() => {
      setReels([
        Math.floor(Math.random() * SYMBOLS.length),
        Math.floor(Math.random() * SYMBOLS.length),
        Math.floor(Math.random() * SYMBOLS.length),
      ] as [number, number, number]);
      playReelSound();
    }, 55);

    try {
      const res = await cartFetch<ScratchPrize>("/games/jackpot", {
        method: "POST",
        authed: true,
      });

      // Stop reels one by one — total 1200ms (was 2400ms)
      setTimeout(() => {
        setReels((r) => [Math.floor(Math.random() * SYMBOLS.length), r[1], r[2]]);
      }, 600);
      setTimeout(() => {
        setReels((r) => [r[0], Math.floor(Math.random() * SYMBOLS.length), r[2]]);
      }, 900);
      setTimeout(() => {
        clearInterval(ticker);

        // Final reels: if big win → all 3 same; if goins only → mixed
        const isJackpot = res.rewardType !== "miss" && res.goinsAwarded >= 500;
        const finalReels: [number, number, number] = isJackpot
          ? [0, 0, 0] // three gifts
          : res.isMiss
          ? [1, 3, 5]
          : [Math.floor(Math.random() * 3), Math.floor(Math.random() * 3) + 2, Math.floor(Math.random() * 3) + 4];
        setReels(finalReels);
        setSpinning(false);
        setPrize(res);
        if (!res.isMiss) {
          setShowConfetti(true);
          playWin();
        }
        if (res.goinsAwarded > 0) {
          flyCoinsToNavbar(rootRef.current, {
            amount: res.goinsAwarded,
            redeemable: true,
            source: "spin",
          });
        }
      }, 1200);
    } catch (e: any) {
      clearInterval(ticker);
      setSpinning(false);
      setErr(e?.body?.message ?? "Spin failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <ConfettiBurst active={showConfetti} onDone={() => setShowConfetti(false)} />

      <div
        ref={rootRef}
        className="relative w-full max-w-md rounded-2xl bg-[#12131A] p-6 shadow-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
        >
          <X className="w-4 h-4 text-white/70" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.22em] mb-1">
            🎰 Grand Gift Jackpot
          </p>
          <h2 className="text-white text-lg font-black">3 reels — match gifts, win big</h2>
          <p className="text-white/50 text-xs mt-0.5">Cost: {costGoins} Goins · Balance: {goinBalance}</p>
        </div>

        {/* Reels */}
        <div
          className="relative rounded-2xl p-4 mb-4 bg-[#1A1B24] border border-[#1E2030]"
        >
          <div className="grid grid-cols-3 gap-2">
            {reels.map((symbolIdx, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-xl overflow-hidden bg-[#12131A] border border-[#1E2030]"
              >
                <div
                  className="absolute inset-0 flex items-center justify-center text-4xl"
                  style={{
                    animation: spinning ? `jp-blur 0.05s linear infinite` : "jp-land 0.35s cubic-bezier(0.34,1.8,0.64,1)",
                  }}
                >
                  {SYMBOLS[symbolIdx]}
                </div>
                {/* Highlight border on match */}
                {!spinning && prize && reels[0] === reels[1] && reels[1] === reels[2] && (
                  <div
                    className="absolute inset-0 pointer-events-none rounded-xl border-2 border-[#EF3752]"
                    style={{ animation: "jp-glow 1s ease-in-out infinite" }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {err && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 text-center text-red-300 text-xs mb-3">
            {err}
          </div>
        )}

        {/* Prize banner */}
        {prize && !spinning && (
          <div
            className={`rounded-2xl p-4 text-center mb-4 ${prize.isMiss ? "bg-[#1A1B24] border border-[#1E2030]" : "bg-[#EF3752]"} text-white`}
          >
            {prize.isMiss ? (
              <p className="text-sm font-bold text-white/70">
                💨 Close one! {prize.goinsAwarded > 0 ? `+${prize.goinsAwarded} Goins consolation` : "Try again tomorrow"}
              </p>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/70 mb-1">You won</p>
                <p className="text-2xl font-black">{prize.rewardLabel}</p>
                {prize.rewardCode && (
                  <p className="mt-1 text-[10px] font-mono opacity-70">{prize.rewardCode}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Spin button */}
        <button
          onClick={startSpin}
          disabled={spinning || goinBalance < costGoins}
          className="w-full py-3.5 rounded-2xl text-sm font-black transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: spinning ? "#1A1B24" : "#EF3752",
            color: spinning ? "rgba(255,255,255,0.4)" : "#fff",
          }}
        >
          {spinning ? "Spinning…" : prize ? "🎰 Spin Again" : `🎰 SPIN  ·  −${costGoins}`}
        </button>

        <style>{`
          @keyframes jp-blur {
            0%   { filter: blur(1.2px); transform: translateY(-6px); }
            100% { filter: blur(1.2px); transform: translateY(6px); }
          }
          @keyframes jp-land {
            0%   { transform: translateY(10px) scale(0.85); filter: blur(1px); }
            60%  { transform: translateY(-3px) scale(1.1); filter: blur(0); }
            100% { transform: translateY(0) scale(1); }
          }
          @keyframes jp-glow {
            0%,100% { opacity: 0.3; }
            50%     { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

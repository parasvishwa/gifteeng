"use client";

/**
 * ScratchCard — canvas-based scratch-to-reveal with elegant gift-casino design.
 *
 * UX:
 *  - Foil overlay with geometric gift pattern; drag finger/cursor to scratch
 *  - Once ~55% is scratched, auto-reveals the full card with confetti + sound
 *  - Optional "Reveal all" tap-to-finish button after 30% scratched
 *
 * Props:
 *  - onPlay(): () => Promise<Prize>       — calls /api/games/scratch
 *  - onClose?: () => void                 — dismiss handler (only shown if provided)
 *  - triggerRef?: string                  — optional orderId / origin for analytics
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";
import ConfettiBurst from "../chrome/ConfettiBurst";
import { flyCoinsToNavbar } from "@/lib/coins-fx";
import { cartFetch } from "@/lib/api";

export type ScratchPrize = {
  rewardType: "goins" | "discount_pct" | "discount_flat" | "free_shipping" | "free_gift_wrap" | "free_product" | "miss";
  rewardValue: string;
  rewardLabel: string;
  goinsAwarded: number;
  rewardCode: string | null;
  minCartInr: number;
  expiresAt: string | null;
  newBalance: number;
  isMiss: boolean;
};

type Props = {
  triggerRef?: string;
  title?: string;
  subtitle?: string;
  onClose?: () => void;
  onRevealed?: (prize: ScratchPrize) => void;
  /** Play audio effects — default true, user can opt out in settings */
  sound?: boolean;
};

export default function ScratchCard({
  triggerRef,
  title  = "Your Scratch Card",
  subtitle = "Scratch to reveal your prize",
  onClose,
  onRevealed,
  sound = true,
}: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const cardRef        = useRef<HTMLDivElement>(null);
  const scratchedRef   = useRef(false);
  const isDrawingRef   = useRef(false);
  const audioRef       = useRef<AudioContext | null>(null);
  const scratchPctRef  = useRef(0);
  const [prize, setPrize]           = useState<ScratchPrize | null>(null);
  const [loading, setLoading]       = useState(true);
  const [revealed, setRevealed]     = useState(false);
  const [scratchPct, setScratchPct] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Fetch prize on mount ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await cartFetch<ScratchPrize>("/games/scratch", {
          method: "POST",
          body: JSON.stringify({ triggerRef: triggerRef ?? undefined }),
          authed: true,
        });
        setPrize(res);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.body?.message ?? "Could not load scratch card. Try again later.");
        setLoading(false);
      }
    })();
    return () => {
      if (audioRef.current) {
        try { audioRef.current.close(); } catch { /* no-op */ }
      }
    };
  }, [triggerRef]);

  // ── Paint foil overlay once canvas is ready ──────────────────────────────
  useEffect(() => {
    if (!prize || loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Foil gradient — copper/rose/amber metallic
    const grad = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    grad.addColorStop(0,    "#d97706");
    grad.addColorStop(0.35, "#ec4899");
    grad.addColorStop(0.7,  "#a855f7");
    grad.addColorStop(1,    "#f59e0b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Shimmer highlights
    const shimmer = ctx.createLinearGradient(0, 0, rect.width, 0);
    shimmer.addColorStop(0,   "rgba(255,255,255,0)");
    shimmer.addColorStop(0.5, "rgba(255,255,255,0.18)");
    shimmer.addColorStop(1,   "rgba(255,255,255,0)");
    ctx.fillStyle = shimmer;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Geometric gift pattern — tiny rotated gift boxes + dots
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    const tile = 36;
    for (let y = 0; y < rect.height + tile; y += tile) {
      for (let x = 0; x < rect.width + tile; x += tile) {
        const ox = (y / tile) % 2 === 0 ? 0 : tile / 2;
        ctx.save();
        ctx.translate(x + ox, y);
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(-4, -4, 8, 8);
        ctx.fillRect(-1, -8, 2, 16);
        ctx.fillRect(-8, -1, 16, 2);
        ctx.restore();
      }
    }

    // Prompt text
    ctx.font = "bold 16px ui-sans-serif, system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textAlign = "center";
    ctx.fillText("✨ SCRATCH HERE ✨", rect.width / 2, rect.height / 2 - 6);
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Drag your finger to reveal", rect.width / 2, rect.height / 2 + 14);

    // Switch to destination-out for scratching
    ctx.globalCompositeOperation = "destination-out";
  }, [prize, loading]);

  // ── Scratch helper ───────────────────────────────────────────────────────
  const playScratchSound = useCallback(() => {
    if (!sound) return;
    try {
      if (!audioRef.current) {
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AC) return;
        audioRef.current = new AC();
      }
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 120 + Math.random() * 40;
      gain.gain.value = 0.015;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.stop(ctx.currentTime + 0.1);
    } catch { /* no-op */ }
  }, [sound]);

  const playWinSound = useCallback(() => {
    if (!sound) return;
    try {
      if (!audioRef.current) {
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AC) return;
        audioRef.current = new AC();
      }
      const ctx = audioRef.current;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + i * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.35);
      });
    } catch { /* no-op */ }
  }, [sound]);

  const scratchAt = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const cx = x - rect.left;
    const cy = y - rect.top;
    // Huge brush — one swipe covers ~half the card
    ctx.beginPath();
    ctx.arc(cx, cy, 110, 0, Math.PI * 2);
    ctx.fill();
    // Wide gradient halo erodes surrounding pixels
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 130);
    grad.addColorStop(0, "rgba(0,0,0,0.8)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fill();
  }, []);

  const computeScratchPct = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    // Sample every 8th pixel for performance
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 32) {
      if (data[i] === 0) clear++;
      total++;
    }
    return clear / total;
  }, []);

  const tryReveal = useCallback(() => {
    if (scratchedRef.current) return;
    const pct = computeScratchPct();
    scratchPctRef.current = pct;
    setScratchPct(pct);
    // One swipe = reveal. Threshold 5% — any movement triggers it.
    if (pct > 0.05) {
      scratchedRef.current = true;
      setRevealed(true);
      // Fade overlay out — sporty snap
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.transition = "opacity 0.28s cubic-bezier(0.22,1,0.36,1), transform 0.28s cubic-bezier(0.34,1.8,0.64,1)";
        canvas.style.opacity = "0";
        canvas.style.transform = "scale(1.08)";
      }
      if (prize && !prize.isMiss) {
        setShowConfetti(true);
        playWinSound();
      }
      // Fly coins to navbar if any goins awarded
      if (prize && prize.goinsAwarded > 0) {
        flyCoinsToNavbar(cardRef.current, {
          amount: prize.goinsAwarded,
          redeemable: true,
          source: "spin",
        });
      }
      onRevealed?.(prize!);
    }
  }, [computeScratchPct, prize, playWinSound, onRevealed]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (scratchedRef.current) return;
    isDrawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    scratchAt(e.clientX, e.clientY);
    playScratchSound();
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || scratchedRef.current) return;
    scratchAt(e.clientX, e.clientY);
    if (Math.random() < 0.15) playScratchSound();
    // Check reveal on every move — don't wait for pointer-up
    tryReveal();
  };
  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    tryReveal();
  };

  const handleRevealAll = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    scratchedRef.current = true;
    setRevealed(true);
    canvas.style.transition = "opacity 0.6s ease";
    canvas.style.opacity = "0";
    if (prize && !prize.isMiss) {
      setShowConfetti(true);
      playWinSound();
    }
    if (prize && prize.goinsAwarded > 0) {
      flyCoinsToNavbar(cardRef.current, {
        amount: prize.goinsAwarded,
        redeemable: true,
        source: "spin",
      });
    }
    onRevealed?.(prize!);
  };

  // ── Prize visual ────────────────────────────────────────────────────────
  const prizeVisual = prize && (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 select-none">
      {prize.isMiss ? (
        <>
          <div className="text-5xl mb-2" style={{ animation: "scr-shake 0.6s ease-in-out 2" }}>🎐</div>
          <p className="text-white/90 font-black text-lg">So close!</p>
          <p className="text-white/60 text-xs mt-1">
            {prize.goinsAwarded > 0
              ? `Here's ${prize.goinsAwarded} Goins to soften the blow`
              : "Try tomorrow — better luck next time"}
          </p>
        </>
      ) : prize.rewardType === "goins" ? (
        <>
          <div className="text-5xl mb-2 scr-pop">🪙</div>
          <p className="text-white font-black text-2xl">{prize.goinsAwarded} Goins</p>
          <p className="text-white/60 text-xs mt-1">Added to your wallet</p>
        </>
      ) : prize.rewardType === "discount_pct" ? (
        <>
          <div className="text-5xl mb-2 scr-pop">🎯</div>
          <p className="text-white font-black text-2xl">{prize.rewardValue}% OFF</p>
          <p className="text-white/70 text-xs mt-1">
            {prize.minCartInr > 0 ? `On orders above ₹${prize.minCartInr}` : "On your next order"}
          </p>
          {prize.rewardCode && (
            <p className="mt-2 text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded">{prize.rewardCode}</p>
          )}
        </>
      ) : prize.rewardType === "discount_flat" ? (
        <>
          <div className="text-5xl mb-2 scr-pop">💸</div>
          <p className="text-white font-black text-2xl">₹{prize.rewardValue} OFF</p>
          <p className="text-white/70 text-xs mt-1">
            {prize.minCartInr > 0 ? `On orders above ₹${prize.minCartInr}` : "On your next order"}
          </p>
          {prize.rewardCode && (
            <p className="mt-2 text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded">{prize.rewardCode}</p>
          )}
        </>
      ) : prize.rewardType === "free_shipping" ? (
        <>
          <div className="text-5xl mb-2 scr-pop">🚚</div>
          <p className="text-white font-black text-xl">Free Shipping</p>
          <p className="text-white/70 text-xs mt-1">Auto-applied at checkout</p>
        </>
      ) : prize.rewardType === "free_gift_wrap" ? (
        <>
          <div className="text-5xl mb-2 scr-pop">🎁</div>
          <p className="text-white font-black text-xl">Free Gift Wrap</p>
          <p className="text-white/70 text-xs mt-1">On your next cart</p>
        </>
      ) : (
        <>
          <div className="text-5xl mb-2 scr-pop">✨</div>
          <p className="text-white font-black text-lg">{prize.rewardLabel}</p>
        </>
      )}
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <ConfettiBurst active={showConfetti} onDone={() => setShowConfetti(false)} />

      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: revealed ? "linear-gradient(160deg, #2D1B69 0%, #1a0e40 100%)" : "#1a1b2e" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Star decorations */}
        {revealed && (
          <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
            {["top-4 left-6 text-lg", "top-8 right-8 text-sm", "top-16 left-16 text-xs",
              "bottom-32 left-4 text-base", "bottom-40 right-6 text-xs"].map((cls, i) => (
              <span key={i} className={`absolute ${cls} opacity-70 scr-pop`}
                style={{ animationDelay: `${i * 80}ms` }}>✦</span>
            ))}
          </div>
        )}

        {/* Close */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-20"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        )}

        {/* Header — "Congratulations" reveal state */}
        <div className="text-center pt-8 pb-4 px-6">
          {revealed ? (
            <>
              <p className="text-white font-black text-3xl tracking-tight">Congratulations</p>
              <p className="text-white/60 text-sm mt-1">You have won a scratch card 🎉</p>
            </>
          ) : (
            <>
              <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.22em] mb-1">
                🎫 Gifteeng Scratch Card
              </p>
              <h2 className="text-white text-lg font-black">{title}</h2>
              <p className="text-white/50 text-xs mt-0.5">{subtitle}</p>
            </>
          )}
        </div>

        {/* Card */}
        <div
          ref={cardRef}
          className="relative mx-auto aspect-[1.6/1] w-full rounded-2xl overflow-hidden mx-6"
          style={{ width: "calc(100% - 48px)", background: revealed ? "linear-gradient(135deg,#4c1d95,#6d28d9)" : "#1A1B24", border: revealed ? "2px solid rgba(167,139,250,0.4)" : "1px solid #1E2030" }}
        >
          {/* Underlying prize visual */}
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
              <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Preparing your card…
            </div>
          ) : err ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
              <div className="text-3xl mb-2">😕</div>
              <p className="text-rose-300 text-sm">{err}</p>
            </div>
          ) : (
            prizeVisual
          )}

          {/* Scratch overlay */}
          {!loading && !err && (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
              style={{ imageRendering: "pixelated" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          )}

          {/* Scratch progress bar */}
          {!loading && !err && !revealed && scratchPct > 0.02 && (
            <div className="absolute left-3 right-3 bottom-2 h-1 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full bg-[#EF3752] transition-all duration-150"
                style={{ width: `${Math.min(100, (scratchPct / 0.4) * 100)}%`, transition: "width 0.1s linear" }}
              />
            </div>
          )}
        </div>

        {/* Reveal-all shortcut */}
        {!loading && !err && !revealed && (
          <div className="text-center mt-3 pb-4 px-6">
            <button
              onClick={handleRevealAll}
              className="text-[12px] font-bold text-white/70 hover:text-white underline underline-offset-2 transition-colors"
            >
              Tap to reveal instantly ✨
            </button>
          </div>
        )}

        {/* After reveal: CTAs */}
        {revealed && prize && (
          <div className="mt-5 px-6 pb-8 space-y-3">
            {/* "NO CODE NEEDED" or code display — dashed pill */}
            {prize.rewardCode && (prize.rewardType === "discount_pct" || prize.rewardType === "discount_flat") ? (
              <div className="text-center py-2.5 px-4 rounded-xl border-2 border-dashed border-purple-400/50 bg-purple-900/30">
                <p className="text-purple-300/60 text-[9px] uppercase tracking-widest mb-1">Your code</p>
                <p className="text-white font-mono font-black text-base">{prize.rewardCode}</p>
                <button
                  onClick={() => { if (prize.rewardCode) navigator.clipboard.writeText(prize.rewardCode); }}
                  className="mt-1 text-[10px] text-purple-300 hover:text-white"
                >
                  Tap to copy
                </button>
              </div>
            ) : (
              <div className="text-center py-2.5 px-4 rounded-xl border-2 border-dashed border-purple-400/40 bg-purple-900/20">
                <p className="text-purple-200 text-xs font-black tracking-wider">NO CODE NEEDED</p>
                <p className="text-purple-300/50 text-[10px] mt-0.5">Auto-applied at checkout</p>
              </div>
            )}

            {/* Claim now CTA */}
            <button
              onClick={() => { window.location.href = "/b2c/products"; }}
              className="w-full py-3.5 rounded-2xl text-sm font-black text-white bg-[#EF3752] shadow-lg shadow-rose-900/40 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              🎁 Claim now
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="w-full py-2.5 text-sm font-semibold text-white/50 hover:text-white/80 transition-colors"
              >
                Save for later
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes scr-shake {
          0%, 100% { transform: rotate(0deg); }
          25%       { transform: rotate(-8deg); }
          75%       { transform: rotate(8deg); }
        }
        @keyframes scr-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); }
        }
        .scr-pop {
          animation: scr-pop 0.38s cubic-bezier(0.34,1.8,0.64,1) both;
        }
      `}</style>
    </div>
  );
}

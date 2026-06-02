"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Gift } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import ConfettiBurst from "./ConfettiBurst";
import { flyCoinsToNavbar } from "@/lib/coins-fx";
import { getB2cToken, API_BASE_URL } from "@/lib/api";

// ── Identical segments to account/page.tsx ────────────────────────────────────
const SW_SEGS = [
  { label: "MISS", goins: 0,   color: "#64748b" },
  { label: "5G",   goins: 5,   color: "#ec4899" },
  { label: "10G",  goins: 10,  color: "#f97316" },
  { label: "MISS", goins: 0,   color: "#94a3b8" },
  { label: "25G",  goins: 25,  color: "#7c3aed" },
  { label: "15G",  goins: 15,  color: "#db2777" },
  { label: "50G",  goins: 50,  color: "#f59e0b" },
  { label: "20G",  goins: 20,  color: "#10b981" },
];

// ── Same SVG wheel as account page ───────────────────────────────────────────
function SpinWheelSVG({ deg, spinning }: { deg: number; spinning: boolean }) {
  const n = SW_SEGS.length;
  return (
    <div className="relative w-56 h-56 mx-auto select-none">
      {/* Pointer */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <div style={{
          width: 0, height: 0,
          borderLeft: "11px solid transparent",
          borderRight: "11px solid transparent",
          borderTop: "26px solid #facc15",
          filter: "drop-shadow(0 3px 8px rgba(250,204,21,0.9))",
        }} />
      </div>
      {/* Wheel */}
      <div
        className="w-full h-full rounded-full"
        style={{
          transform: `rotate(${deg}deg)`,
          transition: spinning ? "transform 4.5s cubic-bezier(0.17,0.67,0.08,0.99)" : "none",
          boxShadow: spinning ? "0 8px 32px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.25)",
        }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full rounded-full">
          <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          {SW_SEGS.map((seg, i) => {
            const a1 = ((i * 360 / n) - 90) * Math.PI / 180;
            const a2 = (((i + 1) * 360 / n) - 90) * Math.PI / 180;
            const x1 = 50 + 48 * Math.cos(a1), y1 = 50 + 48 * Math.sin(a1);
            const x2 = 50 + 48 * Math.cos(a2), y2 = 50 + 48 * Math.sin(a2);
            const ma = (a1 + a2) / 2;
            const lx = 50 + 32 * Math.cos(ma), ly = 50 + 32 * Math.sin(ma);
            const sx = 50 + 44 * Math.cos(ma), sy = 50 + 44 * Math.sin(ma);
            return (
              <g key={i}>
                <path d={`M50,50 L${x1},${y1} A48,48 0 0,1 ${x2},${y2} Z`}
                  fill={seg.color} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize="5.5" fontWeight="bold"
                  transform={`rotate(${i * 360 / n + 360 / n / 2 + 90},${lx},${ly})`}
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                  {seg.label}
                </text>
                <circle cx={sx} cy={sy} r="1.2" fill="rgba(255,255,255,0.4)" />
              </g>
            );
          })}
          {/* Centre hub */}
          <circle cx="50" cy="50" r="10" fill="#0d0d1a" stroke="#facc15" strokeWidth="2" />
          <circle cx="50" cy="50" r="5" fill="#facc15" />
          <circle cx="50" cy="50" r="2" fill="#0d0d1a" />
        </svg>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function SpinWheelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router      = useRouter();
  const wheelRef    = useRef<HTMLDivElement>(null);
  const degRef      = useRef(0);
  const [deg, setDeg]             = useState(0);
  const [spinning, setSpinning]   = useState(false);
  const [result, setResult]       = useState<{ g: number } | null>(null);
  const [alreadySpun, setAlreadySpun] = useState(false);
  const [error, setError]         = useState("");
  const [showConfetti, setShowConfetti] = useState(false);

  const spin = useCallback(async () => {
    const token = getB2cToken();
    if (!token) { router.push("/auth"); onClose(); return; }
    if (spinning || alreadySpun) return;

    setSpinning(true);
    setResult(null);
    setError("");

    try {
      const r = await fetch(`${API_BASE_URL}/api/coins/spin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json() as {
        coinsEarned?: number; newBalance?: number; segment?: number; message?: string;
      };

      if (r.ok && data.coinsEarned !== undefined) {
        const coinsEarned = data.coinsEarned!;
        // Find the segment whose goins value matches what the server awarded so
        // the wheel pointer and the result banner always agree. Falls back to
        // data.segment if no exact match (e.g. server applied a bonus multiplier).
        const matchingSegIdx = SW_SEGS.findIndex(s => s.goins === coinsEarned);
        const segIdx = matchingSegIdx !== -1 ? matchingSegIdx : (data.segment ?? 0);
        const segDeg  = (360 / SW_SEGS.length) * segIdx;
        const finalDeg = degRef.current + 5 * 360 + (360 - segDeg - (360 / SW_SEGS.length) / 2);
        degRef.current = finalDeg;
        setDeg(finalDeg);

        setTimeout(() => {
          setSpinning(false);
          setResult({ g: data.coinsEarned! });
          setAlreadySpun(true);
          if (data.coinsEarned! > 0) {
            setShowConfetti(true);
            flyCoinsToNavbar(wheelRef.current, {
              amount: data.coinsEarned!,
              redeemable: true,
              source: "spin",
            });
          }
        }, 4500);
      } else {
        setSpinning(false);
        const msg = data.message ?? "";
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("tomorrow")) {
          setAlreadySpun(true);
          setError("You've already spun today! Come back tomorrow 🌅");
        } else {
          setError(msg || "Could not spin. Please try again.");
        }
      }
    } catch {
      setSpinning(false);
      setError("Network error. Please try again.");
    }
  }, [spinning, alreadySpun, router, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <ConfettiBurst active={showConfetti} onDone={() => setShowConfetti(false)} />

      <div
        className="relative rounded-2xl shadow-2xl p-6 max-w-[340px] w-[92vw] border border-white/10"
        style={{ background: "#12131A" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.22em] mb-0.5">Daily Spin Wheel</p>
          <p className="text-white/50 text-xs">Spin once a day · Win up to 50 Goins</p>
        </div>

        {/* Wheel */}
        <div ref={wheelRef}>
          <SpinWheelSVG deg={deg} spinning={spinning} />
        </div>

        {/* Segment legend pills */}
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {SW_SEGS.filter((s, i, arr) => arr.findIndex(x => x.label === s.label) === i).map(seg => (
            <span
              key={seg.label}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
              style={{ background: seg.color + "99", border: `1px solid ${seg.color}66` }}
            >
              {seg.goins === 0 ? "💨 Miss" : `🪙 ${seg.goins}G`}
            </span>
          ))}
        </div>

        {/* Result / CTA */}
        <div className="mt-5">
          {result !== null ? (
            <div className="space-y-2 text-center">
              <div
                className="rounded-2xl py-3.5 px-5 font-black text-sm text-white"
                style={{
                  background: result.g > 0
                    ? "hsl(351 85% 58%)"
                    : "rgba(255,255,255,0.06)",
                }}
              >
                {result.g > 0 ? `🎉 You won ${result.g} Goins!` : "💨 Miss — better luck tomorrow!"}
              </div>
              <p className="text-[10px] text-white/25">Come back tomorrow · Next spin in ~24h</p>
            </div>
          ) : error ? (
            <p className="text-sm text-amber-400 text-center">{error}</p>
          ) : (
            <button
              onClick={spin}
              disabled={spinning || alreadySpun}
              className="w-full py-3.5 rounded-xl text-sm font-black text-white transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: spinning ? "rgba(255,255,255,0.08)" : "hsl(351 85% 58%)",
              }}
            >
              {spinning ? "Spinning… 🎡" : alreadySpun ? "Come back tomorrow 🌅" : "🎰 SPIN NOW!"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Floating trigger button (site-wide) ───────────────────────────────────────
export default function FloatingSpinWheel() {
  const router                  = useRouter();
  const [open, setOpen]         = useState(false);
  const [enabled, setEnabled]   = useState(false);
  const [pulse, setPulse]       = useState(true);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = getB2cToken();
    setEnabled(!!token);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setPulse(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Fade out while scrolling, reappear 600ms after scroll stops
  useEffect(() => {
    const onScroll = () => {
      setScrolling(true);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => setScrolling(false), 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  const pathname = usePathname();
  if (!enabled) return null;
  // Don't show the floating button when already on the casino page
  if (pathname === "/play") return null;

  return (
    <>
      <button
        onClick={() => router.push("/play")}
        className="fixed bottom-24 md:bottom-8 left-4 z-50 group flex flex-col items-center gap-0.5"
        title="Gift Casino — Play & Win!"
        style={{
          opacity: scrolling ? 0 : 1,
          pointerEvents: scrolling ? "none" : "auto",
          transition: "opacity 0.3s ease",
        }}
      >
        {pulse && (
          <span className="absolute inset-0 rounded-xl bg-primary/20 animate-ping" />
        )}
        {/* Card — reduced from w-16 to w-12 */}
        <span
          className="relative flex flex-col items-center justify-center gap-0.5 w-12 rounded-xl shadow-xl group-hover:scale-105 transition-transform overflow-hidden py-2 px-1"
          style={{
            background: "linear-gradient(145deg,#1a0533 0%,#3b0764 60%,#6d28d9 100%)",
            border: "1.5px solid rgba(167,139,250,0.35)",
            boxShadow: "0 6px 20px rgba(109,40,217,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset",
          }}
        >
          <span className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />
          <span className="text-base leading-none select-none">🎰</span>
          <span className="text-white font-black text-[8px] tracking-widest uppercase leading-none">Gift</span>
          <span className="text-violet-300 font-bold text-[7px] tracking-widest uppercase leading-none">Casino</span>
        </span>

        <span className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />
      </button>

      <SpinWheelModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

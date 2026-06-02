"use client";

/**
 * GifterTree — visual tree component that levels up with every gift sent.
 * Levels: 🌱 Seed → 🌿 Seedling → 🌳 Sapling → 🌲 Great Oak → 🏯 Legendary Banyan.
 * Used on /b2c/play hub and /b2c/account profile.
 */

import { useEffect, useState } from "react";
import { cartFetch, getB2cToken } from "@/lib/api";

type Tree = {
  giftsSent: number;
  levelIndex: number;
  levelName: string;
  levelEmoji: string;
  perks: string[];
  nextLevelName: string | null;
  nextLevelEmoji: string | null;
  giftsToNext: number | null;
  progress: number;
};

const LEVEL_COLORS = [
  "#64748b",  // seed
  "#10b981",  // seedling
  "#16a34a",  // sapling
  "#059669",  // great oak
  "#f59e0b",  // legendary
];

type Props = { variant?: "compact" | "full" };

export default function GifterTree({ variant = "compact" }: Props) {
  const [tree, setTree] = useState<Tree | null>(null);

  useEffect(() => {
    if (!getB2cToken()) return;
    (async () => {
      try {
        const t = await cartFetch<Tree>("/games/tree", { authed: true });
        setTree(t);
      } catch { /* no-op */ }
    })();
  }, []);

  if (!tree) return null;

  const color = LEVEL_COLORS[tree.levelIndex] ?? "#10b981";

  if (variant === "compact") {
    return (
      <div
        className="relative rounded-2xl p-4 md:p-5 border border-white/10 overflow-hidden bg-[#12131A]"
        style={{ borderTop: `2px solid ${color}` }}
      >
        {/* Leaves pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-xl"
              style={{
                top: `${Math.random() * 90}%`,
                left: `${Math.random() * 90}%`,
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            >
              🍃
            </span>
          ))}
        </div>

        <div className="relative flex items-center gap-4">
          <div
            className="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-4xl md:text-5xl"
            style={{ background: `${color}22` }}
          >
            {tree.levelEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-amber-300/80 text-[9px] font-black uppercase tracking-[0.2em]">
              Gifter's Tree
            </p>
            <p className="text-white font-black text-lg md:text-xl leading-tight">
              {tree.levelName}
            </p>
            <p className="text-white/50 text-xs mt-0.5">
              {tree.giftsSent} {tree.giftsSent === 1 ? "gift" : "gifts"} sent
              {tree.nextLevelName && tree.giftsToNext !== null
                ? ` · ${tree.giftsToNext} more to ${tree.nextLevelEmoji}`
                : " · MAX LEVEL"}
            </p>
          </div>
        </div>

        {/* Progress bar to next level */}
        {tree.nextLevelName && (
          <div className="relative mt-3">
            <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: `${tree.progress * 100}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full variant
  return (
    <div
      className="relative rounded-2xl p-6 border border-white/10 bg-[#12131A] overflow-hidden"
    >
      <div className="relative flex flex-col items-center text-center">
        <div
          className="w-28 h-28 rounded-2xl flex items-center justify-center text-6xl mb-3"
          style={{ background: `${color}22` }}
        >
          {tree.levelEmoji}
        </div>
        <p className="text-amber-300/80 text-[10px] font-black uppercase tracking-[0.22em]">
          Gifter's Tree · Level {tree.levelIndex + 1}
        </p>
        <p className="text-white font-black text-2xl mt-1">{tree.levelName}</p>
        <p className="text-white/50 text-sm mt-1">
          {tree.giftsSent} {tree.giftsSent === 1 ? "gift" : "gifts"} sent · growing every day 🌱
        </p>

        {tree.nextLevelName && (
          <div className="w-full mt-5">
            <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
              <span>{tree.levelEmoji} {tree.levelName}</span>
              <span>{tree.nextLevelEmoji} {tree.nextLevelName}</span>
            </div>
            <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: `${tree.progress * 100}%`,
                  background: color,
                }}
              />
            </div>
            <p className="text-center text-white/60 text-xs mt-1">
              {tree.giftsToNext} more gifts → {tree.nextLevelEmoji} {tree.nextLevelName}
            </p>
          </div>
        )}

        {tree.perks.length > 0 && (
          <div className="w-full mt-5">
            <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.22em] mb-2">
              Level Perks
            </p>
            <ul className="space-y-1.5">
              {tree.perks.map((p, i) => (
                <li key={i} className="text-white/70 text-xs flex items-center gap-2 justify-center">
                  <span className="text-amber-300">✦</span> {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

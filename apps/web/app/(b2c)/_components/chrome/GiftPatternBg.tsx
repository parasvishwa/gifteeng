"use client";

import { useMemo } from "react";

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SHAPES = ["♦", "●", "✦", "♥", "★", "◆", "✧", "○"];

export function GiftPatternBg({ seed = 0 }: { seed?: number }) {
  const particles = useMemo(() => {
    const rng = seededRandom(seed + 42);
    return Array.from({ length: 10 }, (_, i) => ({
      id: i,
      shape: SHAPES[Math.floor(rng() * SHAPES.length)],
      x: rng() * 100,
      y: rng() * 100,
      size: 12 + rng() * 14,
      rotate: rng() * 360,
      delay: rng() * 8,
      duration: 14 + rng() * 14,
      opacity: 0.06 + rng() * 0.06,
    }));
  }, [seed]);

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
      style={{ zIndex: 0 }}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute animate-gift-float text-primary select-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: p.size,
            opacity: p.opacity,
            transform: `rotate(${p.rotate}deg)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.shape}
        </span>
      ))}
    </div>
  );
}

export default GiftPatternBg;

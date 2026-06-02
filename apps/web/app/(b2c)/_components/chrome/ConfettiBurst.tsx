"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; w: number; h: number; rotation: number; rotSpeed: number;
  life: number; delay: number; wobble: number; wobbleSpeed: number;
}

const COLORS = [
  "#FF5733", "#FFC300", "#FF6B81", "#7C3AED", "#10B981",
  "#F59E0B", "#EF3752", "#3B82F6", "#14B8A6", "#F97316",
  "#8B5CF6", "#EF4444", "#06B6D4", "#84CC16",
];

interface Props {
  active: boolean;
  onDone?: () => void;
  duration?: number; // ms, default 4000
  particleCount?: number; // default 200
}

export default function ConfettiBurst({ active, onDone, duration = 4000, particleCount = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const particles: Particle[] = [];

    // Rain from top across full width
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.5,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w: 5 + Math.random() * 7,
        h: 3 + Math.random() * 4,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        life: 1,
        delay: Math.random() * 60, // stagger frames
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.03 + Math.random() * 0.05,
      });
    }

    // Burst particles from center
    const cx = w / 2;
    const cy = h * 0.35;
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 5 + Math.random() * 10;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w: 6 + Math.random() * 8,
        h: 3 + Math.random() * 5,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 15,
        life: 1,
        delay: 0,
        wobble: 0,
        wobbleSpeed: 0,
      });
    }

    let frame = 0;
    const startTime = Date.now();
    let raf: number;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      frame++;

      for (const p of particles) {
        if (p.delay > 0) { p.delay--; continue; }
        if (p.life <= 0) continue;
        alive = true;

        p.x += p.vx + Math.sin(p.wobble) * 0.8;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.vx *= 0.995;
        p.rotation += p.rotSpeed;
        p.wobble += p.wobbleSpeed;

        // Fade out based on duration
        const fadeStart = duration * 0.6;
        if (elapsed > fadeStart) {
          p.life -= 0.015;
        }

        // Off-screen check
        if (p.y > h + 50) { p.life = 0; continue; }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;

        // Draw ribbon/confetti shape
        ctx.beginPath();
        ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 1);
        ctx.fill();

        ctx.restore();
      }

      if (alive && elapsed < duration + 2000) {
        raf = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, w, h);
        onDoneRef.current?.();
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [particleCount, duration]);

  useEffect(() => {
    if (!active) return;
    return init();
  }, [active, init]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[100] pointer-events-none"
    />
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, Zap } from "lucide-react";
import Link from "next/link";

interface FlashSaleConfig {
  enabled: boolean;
  title: string;
  subtitle: string;
  end_time: string; // ISO string
  discount_text: string;
  link: string;
  bg_color?: string;
}

function getTimeLeft(endTime: string) {
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s };
}

export default function CountdownDeal() {
  const [config, setConfig] = useState<FlashSaleConfig | null>(null);
  const [time, setTime] = useState<{ d: number; h: number; m: number; s: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    // Config stubbed — disabled until backend wiring lands
    setConfig(null);
  }, []);

  useEffect(() => {
    if (!config) return;
    intervalRef.current = setInterval(() => {
      const t = getTimeLeft(config.end_time);
      setTime(t);
      if (!t && intervalRef.current) clearInterval(intervalRef.current);
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [config]);

  if (!config || !time) return null;

  const blocks = [
    { val: time.d, label: "Days" },
    { val: time.h, label: "Hrs" },
    { val: time.m, label: "Min" },
    { val: time.s, label: "Sec" },
  ];

  return (
    <section className="py-5 md:py-8">
      <div className="container mx-auto px-4">
        <div className="relative overflow-hidden rounded-2xl bg-card p-5 md:p-8 text-center">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 bg-white/15 text-white text-[10px] font-bold px-3 py-1 rounded-full mb-3">
              <Zap className="w-3 h-3" /> FLASH SALE
            </div>
            <h3 className="font-display text-xl md:text-3xl font-black text-white mb-1 tracking-tight">
              {config.title}
            </h3>
            <p className="text-white/60 text-xs md:text-sm mb-5">{config.subtitle}</p>

            <div className="flex items-center justify-center gap-2 md:gap-3 mb-5">
              {blocks.map((b, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/10">
                    <span className="font-display text-xl md:text-3xl font-black text-white tabular-nums">
                      {String(b.val).padStart(2, "0")}
                    </span>
                  </div>
                  <span className="text-[8px] md:text-[10px] text-white/50 font-semibold mt-1 uppercase tracking-wider">
                    {b.label}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-white font-bold text-sm md:text-base mb-4">
              {config.discount_text}
            </p>

            <Link
              href={config.link || "/products"}
              className="inline-flex items-center gap-2 bg-white text-primary font-bold text-xs md:text-sm px-6 py-2.5 rounded-xl hover:bg-white/90 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" /> Shop Now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

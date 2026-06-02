"use client";

// ─── Announcement Bar ─────────────────────────────────────────────────────────
// Dark maroon background (#4D1414) matching the reference image.
// Left: scrolling marquee with admin-configurable messages.
// Right (desktop): fixed "Track Order | Help | Offers" links.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";

const FALLBACK_TEXTS = [
  "🎁 PLAY & WIN COINS",
  "Win Coins & Redeem on Cart",
  "🎁 Gift Wraps & Thank You Cards available at checkout",
];

export const AnnouncementBar = () => {
  const [texts, setTexts] = useState<string[]>(FALLBACK_TEXTS);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    fetch(`/api/settings/homepage_announcement_bar`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((d: { value?: string[] } | null) => {
        if (Array.isArray(d?.value) && d.value.length > 0) setTexts(d.value);
      })
      .catch(() => {})
      .finally(() => clearTimeout(t));
    return () => { clearTimeout(t); ctrl.abort(); };
  }, []);

  const items = [...texts, ...texts];

  return (
    <div
      className="relative flex items-stretch overflow-hidden text-[10px] md:text-[11px] font-medium"
      style={{
        backgroundColor: "#4D1414",
        color: "rgba(255,255,255,0.90)",
        height: "30px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Left: scrolling marquee */}
      <div className="flex-1 overflow-hidden relative flex items-center">
        <div
          className="flex items-center"
          style={{ width: "max-content", animation: "marquee 50s linear infinite" }}
        >
          {items.map((text, i) => (
            <span key={i} className="flex-shrink-0 inline-flex items-center gap-1.5 mx-8 md:mx-12">
              <span className="w-1 h-1 rounded-full bg-current opacity-40 shrink-0" />
              {text}
            </span>
          ))}
        </div>
      </div>

      {/* Right: static links — desktop only */}
      <div className="hidden md:flex items-stretch shrink-0 border-l border-white/10">
        <Link
          href="/orders"
          className="flex items-center gap-1 px-3 text-[10px] text-white/80 hover:text-white hover:bg-white/10 transition-colors border-r border-white/10"
        >
          👤 Track Order
        </Link>
        <Link
          href="/help"
          className="flex items-center px-3 text-[10px] text-white/80 hover:text-white hover:bg-white/10 transition-colors border-r border-white/10"
        >
          Help
        </Link>
        <Link
          href="/products?deals=true"
          className="flex items-center px-3 text-[10px] text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          Offers
        </Link>
      </div>
    </div>
  );
};

export default AnnouncementBar;

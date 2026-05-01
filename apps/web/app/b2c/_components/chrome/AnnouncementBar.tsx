"use client";

import { useEffect, useState } from "react";

const FALLBACK_TEXTS = [
  "🎉 Free shipping on orders above ₹499",
  "✨ Use code WELCOME10 for 10% off your first order",
  "📦 7-day easy returns",
  "⭐ 1L+ happy customers across India",
];

export const AnnouncementBar = () => {
  const [texts, setTexts] = useState<string[]>(FALLBACK_TEXTS);

  useEffect(() => {
    // Same-origin request via the Next.js /api/* rewrite proxy. Avoids
    // a cross-origin CORS preflight, and (more importantly) survives
    // backend deploy windows: when the API restarts, nginx briefly
    // returns 502 with no CORS headers, which a direct cross-origin
    // fetch sees as `status: 0 / "Failed to fetch"`. Going through the
    // Next.js rewrite means Next reuses keep-alive sockets to upstream
    // and the failure surfaces as a clean 502/503 the browser doesn't
    // strip into status-0.
    //
    // Wrapped in an AbortController + 6 s timeout so a stalled API
    // can't hold the request indefinitely.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);

    fetch(`/api/settings/homepage_announcement_bar`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then((d: { value?: string[] } | null) => {
        if (Array.isArray(d?.value) && d.value.length > 0) setTexts(d.value);
      })
      .catch(() => { /* network blip / abort — keep fallback texts */ })
      .finally(() => clearTimeout(t));

    return () => { clearTimeout(t); ctrl.abort(); };
  }, []);

  // Duplicate for seamless loop
  const items = [...texts, ...texts];

  return (
    <div
      className="relative overflow-hidden text-[10px] md:text-[11px] font-medium whitespace-nowrap"
      style={{
        // Bumped opacity 55 → 82 for iPhone readability — a 55% white on a
        // near-black background is legible on desktop but washed out on
        // high-brightness mobile screens with glare.
        backgroundColor: "hsl(240 14% 7%)",
        color: "rgba(255,255,255,0.82)",
        height: "30px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="flex items-center h-full"
        style={{ width: "max-content", animation: "marquee 50s linear infinite" }}
      >
        {items.map((text, i) => (
          <span key={i} className="flex-shrink-0 inline-flex items-center gap-1.5 mx-10 md:mx-14">
            <span className="w-1 h-1 rounded-full bg-current opacity-40 shrink-0" />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
};

export default AnnouncementBar;

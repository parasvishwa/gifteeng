"use client";

// "Also available on Android / iOS" — pulls Play/App Store URLs from the
// public marketing_config setting (set in /super-admin/marketing) and
// renders the official-style badges. Renders nothing if both URLs are
// empty, so the component is safe to mount unconditionally.

import Link from "next/link";
import { useEffect, useState } from "react";

function apiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

export default function AppStoreBadges() {
  const [play, setPlay] = useState<string>("");
  const [ios, setIos]   = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/settings/marketing_config`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const d = await r.json();
        if (alive && d?.value && typeof d.value === "object") {
          setPlay((d.value.playStoreUrl ?? "").trim());
          setIos((d.value.appStoreUrl ?? "").trim());
        }
      } catch { /* swallow */ }
    })();
    return () => { alive = false; };
  }, []);

  if (!play && !ios) return null;

  return (
    <div className="mx-auto max-w-md text-center mt-4 mb-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 mb-2">
        Also available on
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {play && (
          <Link
            href={play}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Get it on Google Play"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.06] px-3.5 py-2 transition-colors hover:bg-foreground/[0.10] active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <defs>
                <linearGradient id="ps-a" x1="3" y1="2" x2="21" y2="22"><stop stopColor="#00C8FF"/><stop offset="1" stopColor="#0080FF"/></linearGradient>
                <linearGradient id="ps-b" x1="3" y1="22" x2="21" y2="2"><stop stopColor="#FFCE00"/><stop offset="1" stopColor="#FF8000"/></linearGradient>
                <linearGradient id="ps-c" x1="0" y1="12" x2="24" y2="12"><stop stopColor="#FF3A44"/><stop offset="1" stopColor="#C31162"/></linearGradient>
              </defs>
              <path d="M3.4 2.2 13.7 12 3.4 21.8c-.3-.3-.4-.7-.4-1.1V3.3c0-.4.1-.8.4-1.1z" fill="url(#ps-a)"/>
              <path d="m13.7 12 3-3 4.3 2.5c.6.4.6 1.6 0 2L16.7 16l-3-3z" fill="url(#ps-b)"/>
              <path d="M3.4 2.2 16.7 8 13.7 12 3.4 2.2z" fill="#00E1B5"/>
              <path d="M3.4 21.8 13.7 12l3 3-13.3 6.8c-.5.3-1 0-1-.6V21.8z" fill="url(#ps-c)"/>
            </svg>
            <span className="text-left">
              <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/80">Get it on</span>
              <span className="block text-sm font-semibold text-foreground -mt-0.5">Google Play</span>
            </span>
          </Link>
        )}
        {ios && (
          <Link
            href={ios}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download on the App Store"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.06] px-3.5 py-2 transition-colors hover:bg-foreground/[0.10] active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-foreground" aria-hidden>
              <path d="M18.7 17.3c-.4.9-.6 1.3-1.1 2.1-.7 1.1-1.6 2.4-2.7 2.5-1 0-1.3-.6-2.6-.6s-1.6.6-2.6.6c-1.1 0-2-1.2-2.7-2.3-1.9-3.1-2.1-6.7-.9-8.7.8-1.4 2.2-2.2 3.4-2.2s2 .7 3 .7 1.6-.7 3-.7c1.1 0 2.2.6 3 1.6-2.6 1.4-2.2 5.1.2 7zM13.6 5.6c.5-.7.9-1.6.8-2.6-.9 0-1.9.6-2.5 1.3-.5.7-1 1.6-.8 2.6 1 .1 2-.6 2.5-1.3z"/>
            </svg>
            <span className="text-left">
              <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/80">Download on the</span>
              <span className="block text-sm font-semibold text-foreground -mt-0.5">App Store</span>
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

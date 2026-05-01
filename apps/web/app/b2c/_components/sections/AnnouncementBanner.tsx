"use client";

// Home-screen announcement banner (festival / event reminder).
// Consumes /api/announcements?placement=home&active=true — backend
// auto-filters by time window (startsAt / endsAt), so admins can schedule
// banners months ahead. The first active announcement renders; multiple
// are rotated below (optional future enhancement).
//
// Mirrors mobile's event_reminder_banner — same endpoint, same shape.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, ChevronRight } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  subtitle?: string | null;
  emoji?: string | null;
  placement: string;
  link: string;
  eventDate?: string | null;
  gradient?: string[] | null;
  bannerImage?: string | null;
}

function apiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

export default function AnnouncementBanner() {
  const [item, setItem] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `${apiBase()}/api/announcements?placement=home&active=true&pageSize=1`,
          { cache: "no-store" },
        );
        if (!r.ok) { setLoading(false); return; }
        const data = await r.json();
        const items: Announcement[] = Array.isArray(data) ? data : (data.items ?? []);
        if (alive) setItem(items[0] ?? null);
      } catch { /* silent — section just hides */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  if (loading || !item) return null;

  // Compute days-until display if eventDate is set
  let countdown: string | null = null;
  if (item.eventDate) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ev = new Date(item.eventDate);
    const evDay = new Date(ev.getFullYear(), ev.getMonth(), ev.getDate());
    const days = Math.round((evDay.getTime() - today.getTime()) / 86_400_000);
    if (days === 0)       countdown = "Today";
    else if (days === 1)  countdown = "Tomorrow";
    else if (days > 1 && days <= 60) countdown = `${days} days away`;
  }

  return (
    <section className="mt-4 mb-2">
      <Link
        href={item.link || "/b2c/products"}
        className="relative block rounded-2xl overflow-hidden bg-[#12131A] hover:-translate-y-0.5 transition-all group"
      >
        {item.bannerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.bannerImage}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay"
          />
        )}
        <div className="relative p-4 md:p-5 flex items-center gap-4">
          <div className="shrink-0 text-4xl md:text-5xl drop-shadow">{item.emoji || "🎉"}</div>
          <div className="flex-1 min-w-0 text-white">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-base md:text-lg leading-tight drop-shadow-sm">
                {item.title}
              </h3>
              {countdown && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/25 backdrop-blur-md border border-white/40 text-[10px] font-bold">
                  <Calendar className="w-3 h-3" /> {countdown}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-xs md:text-sm text-white/85 mt-0.5 line-clamp-1">
                {item.subtitle}
              </p>
            )}
          </div>
          <div className="shrink-0 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
            <ChevronRight className="w-4 h-4 text-white" />
          </div>
        </div>
      </Link>
    </section>
  );
}

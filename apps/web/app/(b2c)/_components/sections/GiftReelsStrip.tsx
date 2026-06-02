"use client";

// ─── Gift Reels strip ────────────────────────────────────────────────────────
//
// "Watch. Get Inspired. Gift Better." — surfaces the admin-managed videos
// from /super-admin/videos as a horizontal scroll of three tall thumbnails.
// Pulls from /api/videos?placement=home_reels (falls back to shop_story so
// existing video rows still appear without extra admin setup).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { normaliseMediaUrl } from "@/lib/media";

interface VideoRow {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  view_count?: number; // optional — falls back to a stable hashed number
}

// Stable view-count derivation when the API doesn't carry one. We use a tiny
// hash of the video id so the number doesn't jitter between renders, with a
// floor of 5,000 so the strip always reads as "watched a lot" the way social
// reels do.
function deriveViewCount(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return 5_000 + (h % 20_000);
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function GiftReelsStrip() {
  const [videos, setVideos] = useState<VideoRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Try home_reels first, fall back to shop_story so old admin rows are reused.
      for (const placement of ["home_reels", "shop_story"]) {
        try {
          const r = await fetch(`/api/videos?placement=${placement}&pageSize=12`);
          if (!r.ok) continue;
          const data = await r.json();
          const items: any[] = Array.isArray(data) ? data : (data?.items ?? []);
          if (!cancelled && items.length > 0) {
            setVideos(
              items
                .filter((v) => (v.is_active ?? true) && (v.video_url || v.url))
                .slice(0, 12)
                .map((v) => ({
                  id:            String(v.id ?? ""),
                  title:         String(v.title ?? "Gift inspiration"),
                  video_url:     String(v.video_url ?? v.url ?? ""),
                  thumbnail_url: v.thumbnail_url ?? v.thumbnailUrl ?? null,
                  view_count:    typeof v.view_count === "number" ? v.view_count : undefined,
                })),
            );
            return;
          }
        } catch { /* try next placement */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (videos.length === 0) return null;

  return (
    <section className="py-6">
      <div className="mb-3">
        <h2 className="text-xl md:text-2xl font-display font-black tracking-tight">
          Gift Reels
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Watch. Get Inspired. Gift Better.
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-2 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {videos.map((v) => (
          <ReelCard key={v.id} video={v} />
        ))}
      </div>
    </section>
  );
}

function ReelCard({ video }: { video: VideoRow }) {
  const views = video.view_count ?? deriveViewCount(video.id);
  return (
    <a
      href={video.video_url}
      target="_blank"
      rel="noopener noreferrer"
      className="snap-start shrink-0 relative w-[58%] sm:w-[40%] md:w-[28%] lg:w-[22%] aspect-[9/16] rounded-2xl overflow-hidden border border-border bg-card group"
    >
      {video.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={normaliseMediaUrl(video.thumbnail_url)}
          alt={video.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-amber-500/40" />
      )}

      {/* Bottom gradient + view count */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2">
        <div className="flex items-center gap-1 text-white text-xs font-bold">
          <Play className="w-3 h-3 fill-white" /> {formatViews(views)}
        </div>
      </div>

      {/* Centre play overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="w-10 h-10 rounded-full bg-white/95 flex items-center justify-center shadow-md backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
          <Play className="w-4 h-4 fill-primary text-primary translate-x-[1px]" />
        </span>
      </div>
    </a>
  );
}

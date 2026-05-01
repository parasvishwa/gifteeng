import type { Metadata } from "next";
import { Play } from "lucide-react";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Video Gallery — Gifteeng",
  description: "Watch Gifteeng's personalized gifts in action. Product demos, unboxings, and customer stories.",
};

type VideoItem = {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url?: string | null;
  product_id?: string | null;
};

async function fetchVideos(): Promise<VideoItem[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${base}/api/videos?placement=home`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as VideoItem[] | { videos?: VideoItem[] } | null;
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.videos)) return json.videos;
    return [];
  } catch {
    return [];
  }
}

export default async function VideosPage() {
  const videos = await fetchVideos();

  return (
    <div className="relative">
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h1 className="font-display text-3xl md:text-5xl font-black mb-3 tracking-tight">Video Gallery</h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
            Watch our products in action &mdash; unboxings, demos, and heart-warming reveals.
          </p>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-6xl px-4">
          {videos.length === 0 ? (
            <div className="text-center py-16 bg-muted rounded-2xl border border-border">
              <Play className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No videos available yet. Check back soon!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {videos.map((v) => (
                <a
                  key={v.id}
                  href={v.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative block bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all"
                >
                  <div className="aspect-video bg-muted relative">
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail_url}
                        alt={v.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={v.video_url}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-primary text-primary-foreground rounded-full p-4 shadow-xl group-hover:scale-110 transition-transform">
                        <Play className="w-6 h-6 fill-current" />
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-white text-sm font-bold line-clamp-2">{v.title}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

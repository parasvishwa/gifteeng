"use client";

/**
 * VideoStoriesSection — Instagram-style story carousel on the shop page.
 *
 * Pulls videos with placement="shop_story" from /api/videos. Each story is a
 * circular thumbnail; tapping opens a fullscreen video viewer. When a story
 * is tagged with a productId, the viewer shows a "View product" button that
 * deep-links to /b2c/products/{slug}.
 *
 * Hidden when no active stories exist.
 */

import { useEffect, useRef, useState } from "react";
import { X, ShoppingBag, Play } from "lucide-react";
import { apiB2c } from "@/lib/api";

interface VideoRow {
  id:           string;
  title:        string;
  description?: string | null;
  url:          string;
  thumbnailUrl?: string | null;
  productId?:   string | null;
  placement?:   string;
  isActive?:    boolean;
  sortOrder?:   number;
}

interface ProductLite {
  id:    string;
  slug:  string;
  title: string;
  basePrice?: number;
}

export default function VideoStoriesSection() {
  const [stories, setStories] = useState<VideoRow[]>([]);
  const [productMap, setProductMap] = useState<Record<string, ProductLite>>({});
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Fetch videos
  useEffect(() => {
    apiB2c().get<{ items?: VideoRow[] } | VideoRow[]>(
      "/api/videos?placement=shop_story&isActive=true",
    ).then((data) => {
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      const active = list
        .filter((v) => v.isActive !== false && !!v.url)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setStories(active);

      // Bulk-fetch product details for tagged stories
      const productIds = Array.from(new Set(
        active.map((s) => s.productId).filter((x): x is string => !!x)
      ));
      if (productIds.length > 0) {
        Promise.all(productIds.map((id) =>
          apiB2c().get<ProductLite>(`/api/products/${id}`).catch(() => null)
        )).then((products) => {
          const map: Record<string, ProductLite> = {};
          products.forEach((p) => { if (p && p.id) map[p.id] = p; });
          setProductMap(map);
        });
      }
    }).catch(() => {});
  }, []);

  if (stories.length === 0) return null;

  return (
    <>
      <section className="container max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Play className="w-4 h-4 text-[#EF3752] fill-[#EF3752]" />
          <h2 className="text-base font-black">Stories</h2>
          <span className="text-xs text-muted-foreground">· tap to watch</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {stories.map((s, i) => {
            const product = s.productId ? productMap[s.productId] : null;
            return (
              <button
                key={s.id}
                onClick={() => setActiveIdx(i)}
                className="shrink-0 group"
                aria-label={`Watch ${s.title}`}
              >
                <div className="relative w-[72px] h-[72px] rounded-full p-[2px] bg-gradient-to-tr from-[#EF3752] via-amber-500 to-purple-500 group-hover:scale-105 transition-transform">
                  <div className="w-full h-full rounded-full bg-card p-[2px]">
                    {s.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.thumbnailUrl} alt={s.title}
                        className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
                        <Play className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  {product && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#EF3752] border-2 border-card flex items-center justify-center">
                      <ShoppingBag className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[10px] text-center font-semibold max-w-[72px] truncate">
                  {s.title}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Fullscreen viewer */}
      {activeIdx !== null && (
        <StoryViewer
          stories={stories}
          startIdx={activeIdx}
          productMap={productMap}
          onClose={() => setActiveIdx(null)}
        />
      )}
    </>
  );
}

// ── Fullscreen video viewer ──────────────────────────────────────────────────
function StoryViewer({
  stories, startIdx, productMap, onClose,
}: {
  stories: VideoRow[];
  startIdx: number;
  productMap: Record<string, ProductLite>;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIdx);
  const story = stories[idx];
  const product = story.productId ? productMap[story.productId] : null;
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-advance when video ends
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const handler = () => {
      if (idx < stories.length - 1) setIdx(idx + 1);
      else onClose();
    };
    v.addEventListener("ended", handler);
    return () => v.removeEventListener("ended", handler);
  }, [idx, stories.length, onClose]);

  // Tap left/right to navigate
  const goPrev = () => idx > 0 && setIdx(idx - 1);
  const goNext = () => idx < stories.length - 1 ? setIdx(idx + 1) : onClose();

  return (
    <div className="fixed inset-0 z-[300] bg-black flex items-center justify-center">
      {/* Top progress bars */}
      <div className="absolute top-2 left-2 right-2 flex gap-1 z-10">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden bg-white/30">
            <div
              className={`h-full bg-white ${i < idx ? "w-full" : i === idx ? "w-full animate-pulse" : "w-0"}`}
            />
          </div>
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-3 z-20 p-2 rounded-full bg-white/10 text-white"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Title overlay */}
      <div className="absolute top-7 left-3 z-10 max-w-[60%]">
        <p className="text-white font-bold text-sm truncate">{story.title}</p>
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        key={story.id}
        src={story.url}
        autoPlay
        playsInline
        className="max-h-screen max-w-full object-contain"
        controls={false}
      />

      {/* Tap zones for prev/next */}
      <button
        onClick={goPrev}
        className="absolute left-0 top-0 bottom-0 w-1/3 z-0"
        aria-label="Previous story"
      />
      <button
        onClick={goNext}
        className="absolute right-0 top-0 bottom-0 w-1/3 z-0"
        aria-label="Next story"
      />

      {/* Product CTA */}
      {product && (
        <a
          href={`/products/${product.slug}`}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-5 py-3 rounded-full bg-white text-black font-bold text-sm shadow-2xl"
        >
          <ShoppingBag className="w-4 h-4" />
          View {product.title.length > 24 ? product.title.slice(0, 24) + "…" : product.title}
        </a>
      )}
    </div>
  );
}

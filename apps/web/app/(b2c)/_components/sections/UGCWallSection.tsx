"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface UGCPhoto {
  id: string;
  imageUrl: string;
  caption?: string;
}

export default function UGCWallSection() {
  const [photos, setPhotos] = useState<UGCPhoto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    fetch(`${base}/api/ugc?status=approved&pageSize=10`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const raw: UGCPhoto[] = Array.isArray(d) ? d : (d?.items ?? []);
        setPhotos(raw);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // Hide until loaded; hide permanently if no real photos
  if (!loaded || photos.length === 0) return null;

  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 240, behavior: "smooth" });
  };

  return (
    <section className="py-8 md:py-10">
      <div className="flex items-center justify-between mb-4">
        <div className="text-center flex-1">
          <h2 className="text-lg md:text-xl font-black tracking-tight text-foreground">
            Real Gifts. Real People. Real Smiles.{" "}
            <span className="text-[#EF3752]">❤️</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tag us{" "}
            <span className="font-bold text-foreground/70">@gifteeng.official</span>{" "}
            to get featured
          </p>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-2.5 overflow-x-auto -mx-4 px-4 pb-2 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="shrink-0 rounded-2xl overflow-hidden border border-border/20 shadow-sm bg-muted"
              style={{ width: "140px", aspectRatio: "3/4" }}
            >
              <img
                src={photo.imageUrl}
                alt={photo.caption ?? "Customer gift photo"}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          ))}
          <div className="shrink-0 w-12" aria-hidden />
        </div>

        <button
          onClick={scrollRight}
          aria-label="Scroll right"
          className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-card/90 backdrop-blur-sm border border-border/50 shadow-lg flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-card transition-all active:scale-90"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="text-center mt-5">
        <Link
          href="/products"
          className="inline-flex items-center justify-center px-8 py-2.5 rounded-full border-2 border-[#EF3752] text-[#EF3752] text-sm font-bold hover:bg-[#EF3752] hover:text-white transition-all duration-200 active:scale-95"
        >
          View More
        </Link>
      </div>
    </section>
  );
}

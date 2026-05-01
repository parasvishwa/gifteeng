"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Star, Play, X } from "lucide-react";

interface VideoTestimonial {
  id: string;
  name: string;
  text: string;
  rating: number;
  video_url: string;
  image_url: string | null;
  date_label: string;
}

const CARD_WIDTH = 300;

export default function VideoTestimonialsSection({ testimonials = [] }: { testimonials?: VideoTestimonial[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (!testimonials || testimonials.length === 0) return null;

  const scroll = (dir: number) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * CARD_WIDTH, behavior: "smooth" });
  };

  return (
    <section className="py-8 md:py-12 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-5 md:mb-8">
          <span className="section-tag">🎥 Video Reviews</span>
          <h2 className="section-heading">
            Real Stories, <span className="text-gradient-vivid italic">Real People</span>
          </h2>
          <p className="section-subtitle">Watch what our customers have to say</p>
        </div>

        <div className="relative group">
          <button
            onClick={() => scroll(-1)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 md:w-9 md:h-9 rounded-full bg-background/90 border border-border/50 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-background"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>

          <div
            ref={scrollRef}
            className="overflow-x-auto pb-3 scrollbar-hide"
            style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex gap-3 md:gap-4">
              {testimonials.map((t) => (
                <div
                  key={t.id}
                  className="min-w-[260px] w-[260px] md:min-w-[300px] md:w-[300px] shrink-0 snap-start bg-card rounded-xl border border-border/40 overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300"
                >
                  {/* Video thumbnail / player */}
                  <div className="relative aspect-[9/16] max-h-[340px] bg-foreground/5">
                    {playingId === t.id ? (
                      <div className="relative w-full h-full">
                        <video
                          src={t.video_url}
                          className="w-full h-full object-cover"
                          controls
                          autoPlay
                          playsInline
                        />
                        <button
                          onClick={() => setPlayingId(null)}
                          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-foreground/60 flex items-center justify-center"
                        >
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPlayingId(t.id)}
                        className="w-full h-full relative group/play"
                      >
                        {t.image_url ? (
                          <img
                            src={t.image_url}
                            alt={`Video review by ${t.name}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center">
                            <Play className="w-12 h-12 text-primary/30" />
                          </div>
                        )}
                        {/* Play overlay */}
                        <div className="absolute inset-0 bg-foreground/20 group-hover/play:bg-foreground/30 transition-colors flex items-center justify-center">
                          <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg group-hover/play:scale-110 transition-transform">
                            <Play className="w-5 h-5 md:w-6 md:h-6 text-primary-foreground ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 md:p-4">
                    <div className="flex items-center gap-0.5 mb-1.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${i < t.rating ? "text-secondary fill-secondary" : "text-border"}`}
                        />
                      ))}
                    </div>
                    {t.text && (
                      <p className="text-foreground text-xs leading-relaxed line-clamp-2 mb-2 font-body">
                        "{t.text}"
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-primary">
                          {t.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground truncate">{t.name}</p>
                        {t.date_label && (
                          <p className="text-[9px] text-muted-foreground">{t.date_label}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => scroll(1)}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 md:w-9 md:h-9 rounded-full bg-background/90 border border-border/50 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-background"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </div>
    </section>
  );
}

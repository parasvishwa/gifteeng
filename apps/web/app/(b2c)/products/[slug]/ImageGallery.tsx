"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";

interface ImageGalleryProps {
  images: string[];
  title: string;
  /** SEO alt texts generated per-image by SeoEnrichmentService. Falls back to title. */
  altTexts?: string[];
}

export function ImageGallery({ images: initialImages, title, altTexts = [] }: ImageGalleryProps) {
  // Live gallery state — can be overridden by a custom "gifteeng:variant-swap"
  // event dispatched from ProductDetailClient when the user picks a variant
  // option with its own images (e.g. "America" / "New York").
  const [images, setImages] = useState<string[]>(initialImages);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [swapping, setSwapping] = useState(false);

  // Sync with parent prop changes (in case page re-renders)
  useEffect(() => { setImages(initialImages); }, [initialImages]);

  // Listen for variant-driven image swaps
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { images?: string[] } | null;
      const next = detail?.images;
      if (!next || next.length === 0) {
        // Reset to base product images
        setImages(initialImages);
      } else {
        setImages(next);
      }
      setActiveIndex(0);
      setSwapping(true);
      setTimeout(() => setSwapping(false), 260);
    };
    window.addEventListener("gifteeng:variant-swap", handler);
    return () => window.removeEventListener("gifteeng:variant-swap", handler);
  }, [initialImages]);

  // Broken-image fallback: track which src URLs have failed to load
  const [brokenSrcs, setBrokenSrcs] = useState<Set<string>>(new Set());
  const handleImgError = useCallback((src: string) => {
    setBrokenSrcs(prev => { const s = new Set(prev); s.add(src); return s; });
  }, []);

  // Zoom state
  const [zoomed, setZoomed] = useState(false);
  const [transformOrigin, setTransformOrigin] = useState("50% 50%");
  const mainImgRef = useRef<HTMLDivElement>(null);

  // Touch / swipe state
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const MIN_SWIPE = 50;

  const prev = useCallback(
    (idx: number) => (idx - 1 + images.length) % images.length,
    [images.length],
  );
  const next = useCallback(
    (idx: number) => (idx + 1) % images.length,
    [images.length],
  );

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setLightboxIndex((i) => prev(i));
      if (e.key === "ArrowRight") setLightboxIndex((i) => next(i));
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxOpen, prev, next]);

  // Zoom: track cursor position to set transformOrigin
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mainImgRef.current) return;
    const rect = mainImgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTransformOrigin(`${x}% ${y}%`);
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].clientX;
    touchEndX.current = null;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
  };
  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) >= MIN_SWIPE) {
      setActiveIndex((i) => (delta > 0 ? next(i) : prev(i)));
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const openLightbox = (idx: number) => {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };

  // Lock body scroll AND hide any sibling content that owns its own stacking
  // context. The PDP wraps the image column and the right-side detail column
  // in a grid; if any ancestor up the tree applies `transform`, `filter`, or
  // `will-change`, our `fixed inset-0 z-[1000]` lightbox gets trapped inside
  // that ancestor's stacking context and the design picker / variant chips
  // start bleeding through. The portal below already escapes most cases, but
  // locking <body> overflow also kills any residual scroll-jank during open.
  useEffect(() => {
    if (!lightboxOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [lightboxOpen]);

  if (images.length === 0) return null;

  return (
    <>
      {/* Main image */}
      <div
        ref={mainImgRef}
        className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted cursor-zoom-in select-none"
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => setZoomed(false)}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => openLightbox(activeIndex)}
      >
        {brokenSrcs.has(images[activeIndex]) ? (
          <div className="h-full w-full flex items-center justify-center bg-gray-100">
            <span className="text-4xl">🎁</span>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={images[activeIndex]}
            src={images[activeIndex]}
            alt={altTexts[activeIndex] || `${title} — image ${activeIndex + 1}`}
            className="h-full w-full object-cover transition-transform duration-200"
            style={{
              transform: zoomed ? "scale(2)" : "scale(1)",
              transformOrigin: transformOrigin,
              animation: swapping ? "variant-swap-in 0.3s cubic-bezier(0.22,1,0.36,1) both" : undefined,
            }}
            draggable={false}
            onError={() => handleImgError(images[activeIndex])}
          />
        )}

        {/* Zoom hint icon — shown when not zoomed, desktop only */}
        <span className="pointer-events-none absolute right-3 top-3 hidden rounded-full bg-black/40 p-1.5 text-white md:flex">
          <ZoomIn size={14} />
        </span>

        {/* Image counter pill */}
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs font-medium text-white">
            {activeIndex + 1} / {images.length}
          </span>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.slice(0, 8).map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={`View image ${i + 1}`}
              className={
                "aspect-square overflow-hidden rounded-lg border-2 bg-muted transition-all " +
                (i === activeIndex
                  ? "border-[#EF3752]"
                  : "border-transparent opacity-60 hover:opacity-100")
              }
            >
              {brokenSrcs.has(src) ? (
                <div className="h-full w-full flex items-center justify-center bg-gray-100">
                  <span className="text-lg">🎁</span>
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={src}
                  alt={altTexts[i] || `${title} thumbnail ${i + 1}`}
                  className="h-full w-full object-cover"
                  onError={() => handleImgError(src)}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox modal — rendered via portal directly into <body> so it
          escapes any ancestor stacking context (transform/filter/will-change
          on parent columns was trapping the previous inline lightbox, which
          let the design picker, "Set of N" variant chips, and "You may also
          like" rail bleed through the supposedly-fullscreen overlay).
          z-[2147483000] is the documented "near-max" portal layer; we also
          lock <body> scroll for the duration via the effect above. */}
      {lightboxOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black p-4"
          style={{ zIndex: 2147483000 }}
          onClick={() => setLightboxOpen(false)}
        >
          {/* Stop propagation on inner container */}
          <div
            className="relative flex max-h-full max-w-4xl flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close lightbox"
              className="absolute -top-10 right-0 text-white/80 hover:text-white"
            >
              <X size={28} />
            </button>

            {/* Image */}
            <div className="relative flex items-center justify-center">
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((i) => prev(i))}
                  aria-label="Previous image"
                  className="absolute left-0 z-10 -translate-x-12 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[lightboxIndex]}
                alt={altTexts[lightboxIndex] || `${title} — image ${lightboxIndex + 1}`}
                className="max-h-[80vh] max-w-full rounded-lg object-contain"
                onError={() => handleImgError(images[lightboxIndex])}
              />

              {images.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex((i) => next(i))}
                  aria-label="Next image"
                  className="absolute right-0 z-10 translate-x-12 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {/* Lightbox counter */}
            {images.length > 1 && (
              <p className="mt-3 text-sm text-white/60">
                {lightboxIndex + 1} / {images.length}
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}

      <style>{`
        @keyframes variant-swap-in {
          0%   { opacity: 0; transform: scale(1.04); }
          60%  { opacity: 1; }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

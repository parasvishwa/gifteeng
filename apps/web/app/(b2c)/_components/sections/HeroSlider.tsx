"use client";

/**
 * HeroSlider — primary homepage hero carousel.
 *
 * Each banner is a full hero "slide":
 *   • Left half (≈50%) — optional text overlay: tagline + heading +
 *     headingAccent + subtitle + up to 2 CTA buttons. Rendered on a clean
 *     light surface so the H1 stays legible regardless of image content.
 *   • Right half (≈50%) — banner image, object-cover.
 *
 * When all text fields on a slide are empty, the slide collapses to its
 * legacy full-bleed image-only rendering. This means existing image-only
 * banners keep working without any admin intervention.
 *
 * Mobile: text stacks above image (rather than 50/50 columns) so neither
 * side gets cramped at ≤640 px widths.
 *
 * Source of truth: GET /api/banners?placement=home (admin-managed).
 * Same data shape feeds the Flutter app's hero carousel.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { normaliseMediaUrl } from "@/lib/media";
import { ChevronLeft, ChevronRight, PlayCircle } from "lucide-react";

export interface HeroSlide {
  id:             string;
  imageUrl:       string;
  mobileImageUrl?: string | null;  // phone/Flutter image — falls back to imageUrl if null
  linkUrl?:       string;
  altText?:       string | null;
  // Per-slide text overlay
  tagline?:       string | null;
  heading?:       string | null;
  headingAccent?: string | null;
  subtitle?:      string | null;
  button1Text?:   string | null;
  button1Link?:   string | null;
  button2Text?:   string | null;
  button2Link?:   string | null;
  // Per-slide color overrides (admin-configurable)
  textBgColor?:   string | null;  // left-half background (color or gradient)
  textColor?:     string | null;  // headline + subtitle text color
  accentColor?:   string | null;  // headingAccent highlight color
  buttonColor?:   string | null;  // primary button background
  // Legacy / config-driven fields (kept for back-compat with /api/homepage/config)
  title?:         string;
  ctaText?:       string;
  ctaLink?:       string;
  active?:        boolean;
  order?:         number;
}

function hasTextOverlay(s: HeroSlide): boolean {
  return Boolean(
    (s.tagline ?? "").trim() ||
    (s.heading ?? "").trim() ||
    (s.headingAccent ?? "").trim() ||
    (s.subtitle ?? "").trim() ||
    (s.button1Text ?? "").trim(),
  );
}

export default function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  // Legacy data may still be in `active`/`order` shape; new data is filtered
  // by the API and arrives sorted, so just take what we get.
  const list = slides.filter((s) => s.active !== false && !!s.imageUrl);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const go = (n: number) => setIdx((n + list.length) % list.length);

  useEffect(() => {
    if (list.length <= 1) return;
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % list.length), 6000);
    return () => clearInterval(timerRef.current);
  }, [list.length]);

  if (list.length === 0) return null;

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-card border border-border/40"
      // Hero aspect ratio matches the previous standalone hero section so the
      // homepage doesn't visibly grow/shrink when banners switch between
      // image-only and text-overlay modes. ~16:9-ish for desktop, content
      // stacks taller on mobile via the per-slide flex layout below.
      style={{ minHeight: "clamp(360px, 38vw, 520px)" }}
      onMouseEnter={() => clearInterval(timerRef.current)}
      onMouseLeave={() => {
        if (list.length > 1) {
          timerRef.current = setInterval(() => setIdx((i) => (i + 1) % list.length), 6000);
        }
      }}
    >
      {list.map((s, i) => (
        <Slide key={s.id} slide={s} active={i === idx} />
      ))}

      {/* Prev/next arrows + pagination — only when more than one slide */}
      {list.length > 1 && (
        <>
          <button
            onClick={() => go(idx - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 text-white flex items-center justify-center transition-colors"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => go(idx + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 text-white flex items-center justify-center transition-colors"
            aria-label="Next slide"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Pagination dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {list.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-7 bg-white" : "w-1.5 bg-white/60 hover:bg-white/85"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Per-slide composition ───────────────────────────────────────────────────

function Slide({ slide, active }: { slide: HeroSlide; active: boolean }) {
  const wrapperStyle = {
    opacity: active ? 1 : 0,
    zIndex:  active ? 1 : 0,
    pointerEvents: active ? ("auto" as const) : ("none" as const),
    transition: "opacity 700ms ease",
  };

  // Resolve link target — slide.linkUrl on text-overlay banners is treated
  // as the secondary "default" CTA but per-button links take precedence.
  const fallbackHref = slide.linkUrl || slide.ctaLink || "/shop";

  if (!hasTextOverlay(slide)) {
    // Legacy image-only rendering — image fills entire slide, wrapped in
    // a link so the whole banner is tappable like before.
    return (
      <Link
        href={fallbackHref}
        className="absolute inset-0"
        style={wrapperStyle}
        aria-label={slide.altText ?? slide.title ?? "Banner"}
      >
        <picture className="w-full h-full">
          {/* Mobile — use mobileImageUrl when available (9:20 portrait fits better) */}
          {slide.mobileImageUrl && (
            <source
              media="(max-width: 767px)"
              srcSet={normaliseMediaUrl(slide.mobileImageUrl)}
            />
          )}
          {/* Desktop fallback */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={normaliseMediaUrl(slide.imageUrl)}
            alt={slide.altText ?? slide.title ?? ""}
            className="w-full h-full object-cover"
            loading={active ? "eager" : "lazy"}
            fetchPriority={active ? "high" : "auto"}
          />
        </picture>
      </Link>
    );
  }

  // ── Text-overlay rendering ─────────────────────────────────────────────────
  // Desktop: left 50% text, right 50% image
  // Mobile (≤md): text top, image bottom
  //
  // Per-slide color overrides: when the admin sets textBgColor / textColor /
  // accentColor / buttonColor on a banner, those values win. Otherwise the
  // brand-default cream gradient + foreground/primary colors apply.
  const accent = slide.accentColor || "hsl(var(--primary))";
  const buttonBg = slide.buttonColor || "#EF3752";
  const textColor = slide.textColor || "inherit";
  // Default left-half background = the legacy cream gradient. When the admin
  // pastes a single color (e.g. "#fff5f7") we use it as a solid; when they
  // paste a gradient string ("linear-gradient(...)" / "radial-gradient(...)")
  // we pass it through unchanged.
  const textBg = slide.textBgColor
    ? (slide.textBgColor.includes("gradient")
        ? slide.textBgColor
        : slide.textBgColor)
    : "linear-gradient(135deg, #fff5f7 0%, #ffe8ee 50%, #ffd6e0 100%)";

  return (
    <div className="absolute inset-0 flex flex-col md:flex-row" style={wrapperStyle}>
      {/* Text column */}
      <div
        className="md:w-1/2 flex items-center px-6 md:px-12 py-8 md:py-10"
        style={{ background: textBg }}
      >
        <div className="w-full max-w-xl">
          {slide.tagline && (
            <p className="text-[11px] md:text-xs font-black uppercase tracking-[0.22em] mb-3" style={{ color: accent, opacity: 0.85 }}>
              {slide.tagline}
            </p>
          )}

          {(slide.heading || slide.headingAccent) && (
            <h2
              className="font-display font-black leading-[1.05] tracking-tight mb-3
                         text-[1.7rem] sm:text-[2.1rem] md:text-[2.4rem] lg:text-[2.8rem]"
              style={{ color: textColor }}
            >
              {slide.heading}
              {slide.headingAccent && (
                <>
                  <br />
                  <span style={{ color: accent }}>{slide.headingAccent}</span>
                </>
              )}
            </h2>
          )}

          {slide.subtitle && (
            <p className="text-sm md:text-base mb-5 leading-relaxed" style={{ color: textColor, opacity: 0.7 }}>
              {slide.subtitle}
            </p>
          )}

          {(slide.button1Text || slide.button2Text) && (
            <div className="flex items-center gap-3 flex-wrap">
              {slide.button1Text && (
                <Link
                  href={slide.button1Link || fallbackHref}
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md active:scale-[0.97]"
                  style={{ backgroundColor: buttonBg, transition: "background-color 160ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)" }}
                >
                  {slide.button1Text}
                </Link>
              )}
              {slide.button2Text && (
                <Link
                  href={slide.button2Link || "#how-it-works"}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors"
                  style={{ color: textColor, opacity: 0.75 }}
                >
                  <PlayCircle className="w-5 h-5" style={{ opacity: 0.5 }} />
                  {slide.button2Text}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image column — object-cover so the photo fills its half edge to
          edge. object-contain previously left mismatched empty bands when
          the image aspect didn't match the column. */}
      <Link
        href={fallbackHref}
        className="md:w-1/2 relative overflow-hidden block"
        aria-label={slide.altText ?? slide.heading ?? "Banner"}
        style={{ background: textBg }}
      >
        <picture className="absolute inset-0 w-full h-full">
          {slide.mobileImageUrl && (
            <source media="(max-width: 767px)" srcSet={normaliseMediaUrl(slide.mobileImageUrl)} />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={normaliseMediaUrl(slide.imageUrl)}
            alt={slide.altText ?? slide.heading ?? ""}
            className="w-full h-full object-cover"
            loading={active ? "eager" : "lazy"}
            fetchPriority={active ? "high" : "auto"}
          />
        </picture>
      </Link>
    </div>
  );
}

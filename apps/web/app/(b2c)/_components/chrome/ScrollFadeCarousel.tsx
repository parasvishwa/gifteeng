"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";

interface Props {
  id?: string;
  children: ReactNode;
  className?: string;
}

export function ScrollFadeCarousel({ id, children, className = "" }: Props) {
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 8);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  return (
    <div className="relative">
      <div
        ref={ref}
        id={id}
        className={`overflow-x-auto pb-2 scrollbar-hide scroll-smooth ${className}`}
        style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" } as any}
        onScroll={handleScroll}
      >
        {children}
      </div>
      {/* Thin edge hints — only 3px wide so they don't cover products */}
      {showLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-2 w-3 z-10 bg-gradient-to-r from-background/60 to-transparent" />
      )}
      {showRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-3 bg-gradient-to-l from-background/60 to-transparent" />
      )}
    </div>
  );
}

export default ScrollFadeCarousel;

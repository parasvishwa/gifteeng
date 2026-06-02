"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";

interface LazySectionProps {
  children: ReactNode;
  className?: string;
  /** How far before viewport to start rendering (px) */
  rootMargin?: string;
}

export function LazySection({ children, className = "", rootMargin = "200px" }: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : <div style={{ minHeight: 200 }} />}
    </div>
  );
}

export default LazySection;

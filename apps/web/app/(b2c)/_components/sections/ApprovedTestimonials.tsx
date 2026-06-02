"use client";

// Thin wrapper around the existing TestimonialsCarousel that fetches
// admin-approved testimonials from the /testimonials endpoint and maps
// them to the carousel's expected shape. Falls back to carousel's built-in
// defaults (which it always uses if the `testimonials` prop is empty) so
// the section never disappears while the admin team seeds content.
//
// Backend contract (same data web + mobile consume):
//   GET /api/testimonials?status=approved&pageSize=10
//   → { items: [{ id, name, text, rating, avatar, location, productImage, ... }] }

import { useEffect, useState } from "react";
import TestimonialsCarousel from "./TestimonialsCarousel";

interface ApiTestimonial {
  id: string;
  name: string;
  text: string;
  rating: number;
  avatar?: string | null;
  location?: string | null;
  productImage?: string | null;
}

interface CarouselTestimonial {
  id: string;
  name: string;
  text: string;
  rating: number;
  image_url: string | null;
  product_id: string;
  date_label: string;
}

function apiBase() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
}

export default function ApprovedTestimonials() {
  const [items, setItems] = useState<CarouselTestimonial[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `${apiBase()}/api/testimonials?status=approved&pageSize=10`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const data = await r.json();
        const raw: ApiTestimonial[] = Array.isArray(data) ? data : (data.items ?? []);
        if (!alive) return;
        setItems(raw.map((t) => ({
          id:         t.id,
          name:       t.name,
          text:       t.text,
          rating:     t.rating,
          image_url:  t.avatar ?? t.productImage ?? null,
          product_id: "",
          date_label: t.location ?? "",
        })));
      } catch { /* fall back to carousel defaults */ }
    })();
    return () => { alive = false; };
  }, []);

  return <TestimonialsCarousel testimonials={items} />;
}

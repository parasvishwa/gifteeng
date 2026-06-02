"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

interface Photo {
  id: string;
  image_url: string;
}

const UGC_POSTS: Photo[] = [];

export default function UGCWall() {
  const [photos] = useState<Photo[]>(UGC_POSTS);

  if (photos.length === 0) return null;

  return (
    <section className="py-6 md:py-10 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-5 md:mb-8">
          <span className="section-tag"><Camera className="w-3 h-3 inline mr-1" />Customer Gallery</span>
          <h2 className="section-heading">
            Our Customers <span className="text-gradient-vivid italic">Love It</span>
          </h2>
          <p className="section-subtitle">Real photos from real customers</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {photos.map((p, i) => (
            <div
              key={p.id}
              className={`relative overflow-hidden rounded-xl group cursor-pointer ${
                i === 0 ? "row-span-2 md:row-span-2" : ""
              }`}
            >
              <div className={`${i === 0 ? "aspect-[3/4]" : "aspect-square"}`}>
                <img
                  src={p.image_url}
                  alt="Customer photo"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

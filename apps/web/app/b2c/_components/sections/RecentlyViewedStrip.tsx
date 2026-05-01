"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProductCard from "./ProductCard";
import { Clock, Sparkles, ArrowRight } from "lucide-react";

interface ViewedProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  original_price: number;
  customizable: boolean;
  hasCustomization: boolean;
  previewImage: string | null;
}

export default function RecentlyViewedStrip() {
  const router = useRouter();
  const [products, setProducts] = useState<ViewedProduct[]>([]);

  useEffect(() => {
    try {
      const stored: string[] = JSON.parse(localStorage.getItem("recently_viewed") || "[]");
      const ids = stored.slice(0, 8);
      if (ids.length === 0) return;
      // Supabase removed — no remote product data available in this port.
      // Component renders nothing when there is no hydrated product data.
    } catch {}
  }, []);

  if (products.length === 0) return null;

  const hasAnyCustomization = products.some(p => p.hasCustomization);
  const title = hasAnyCustomization ? "Continue Where You Left Off" : "Recently Viewed";
  const subtitle = hasAnyCustomization ? "Your designs are waiting" : null;

  return (
    <section className="py-6 md:py-8">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/12 to-secondary/8 flex items-center justify-center shrink-0">
            {hasAnyCustomization ? <Sparkles className="w-4 h-4 text-primary" /> : <Clock className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div>
            <h2 className="font-display font-bold text-sm md:text-base tracking-tight">{title}</h2>
            {subtitle && <p className="text-[10px] text-muted-foreground/50 font-medium">{subtitle}</p>}
          </div>
        </div>
        <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 md:gap-3">
            {/* Show products with customization first */}
            {[...products].sort((a, b) => (b.hasCustomization ? 1 : 0) - (a.hasCustomization ? 1 : 0)).map((p) => (
              <div key={p.id} className="min-w-[42%] max-w-[42%] md:min-w-[18%] md:max-w-[18%] flex-shrink-0 snap-start relative overflow-hidden rounded-xl">
                {p.hasCustomization && p.previewImage ? (
                  <button
                    onClick={() => router.push(`/product/${p.id}?customized=true`)}
                    className="w-full text-left group"
                  >
                    <div className="relative rounded-xl overflow-hidden border-2 border-primary/30 shadow-sm group-hover:shadow-md transition-all">
                      <img src={p.previewImage} alt={p.name} className="w-full aspect-square object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
                      <div className="absolute bottom-0 inset-x-0 p-2.5">
                        <p className="text-[10px] text-background font-bold truncate">{p.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-black text-background">₹{p.price}</span>
                          <span className="text-[9px] font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded-full flex items-center gap-0.5">
                            Continue <ArrowRight className="w-2.5 h-2.5" />
                          </span>
                        </div>
                      </div>
                      {/* Progress badge */}
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[8px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <Sparkles className="w-2.5 h-2.5" /> Your Design
                      </div>
                    </div>
                  </button>
                ) : (
                  <ProductCard
                    name={p.name}
                    image={p.image}
                    price={p.price}
                    originalPrice={p.original_price}
                    customizable={p.customizable}
                    onCustomize={() => router.push(`/product/${p.id}`)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

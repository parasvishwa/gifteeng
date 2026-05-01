"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Heart, ChevronRight, X } from "lucide-react";
import ProductCard from "../_components/sections/ProductCard";
import { apiB2c, getB2cToken } from "@/lib/api";

type ApiWishlistItem = {
  id: string;
  productId: string;
  product: {
    id: string;
    title: string;
    slug: string;
    images: string[];
    basePrice: number;
  };
};

type DisplayItem = {
  id: string;
  productId: string;
  name: string;
  image: string;
  price: number;
};

function toDisplayItem(raw: ApiWishlistItem): DisplayItem {
  return {
    id: raw.id,
    productId: raw.productId,
    name: raw.product.title,
    image: raw.product.images?.[0] ?? "",
    price: raw.product.basePrice,
  };
}

export default function WishlistPage() {
  const router = useRouter();
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Redirect if not logged in
    if (!getB2cToken()) {
      router.replace("/auth");
      return;
    }

    const load = async () => {
      try {
        const data = await apiB2c().get<ApiWishlistItem[]>("/api/wishlist");
        setItems(
          Array.isArray(data) ? data.map(toDisplayItem) : [],
        );
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const handleRemove = async (productId: string) => {
    // Optimistic removal
    const prev = [...items];
    setItems((cur) => cur.filter((i) => i.productId !== productId));
    setRemoving((cur) => new Set(cur).add(productId));

    try {
      await apiB2c().delete(`/api/wishlist/${productId}`);
    } catch {
      // Restore on failure
      setItems(prev);
    } finally {
      setRemoving((cur) => {
        const next = new Set(cur);
        next.delete(productId);
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="pt-16 md:pt-20">
        <div className="container mx-auto px-4 pt-20 md:pt-24 pb-24 md:pb-12 max-w-6xl">
          <div className="mb-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold">My Wishlist</h1>
              <p className="text-xs text-muted-foreground">Your saved favourites, all in one place</p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="rounded bg-card border border-border/20 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-muted" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-4/5 bg-muted rounded" />
                    <div className="h-4 w-1/3 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-card rounded border border-border/20 p-12 text-center">
              <div className="w-16 h-16 rounded bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-display font-bold text-lg mb-2">Your wishlist is empty</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Your wishlist is empty. Start adding products you love.
              </p>
              <Link
                href="/b2c/products"
                className="btn-primary inline-flex items-center gap-2 text-sm px-6 py-3"
              >
                Browse Products <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
              {items.map((p) => (
                <div key={p.id} className="relative">
                  <ProductCard
                    productId={p.productId}
                    name={p.name}
                    image={p.image}
                    price={p.price}
                    isWished={true}
                  />
                  {/* Remove button overlay */}
                  <button
                    onClick={() => void handleRemove(p.productId)}
                    disabled={removing.has(p.productId)}
                    aria-label="Remove from wishlist"
                    className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm border border-border/30 flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

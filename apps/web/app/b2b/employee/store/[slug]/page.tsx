"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiB2b } from "@/lib/api";

interface Variant {
  id: string;
  name?: string;
  price?: number;
}

interface Product {
  id: string;
  slug: string;
  title: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  variants?: Variant[];
}

export default function EmployeeProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params.slug;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const res = await api.get<Product>(
        `/api/products/b2b/catalog/${encodeURIComponent(slug)}`
      );
      setProduct(res);
      if (res?.variants?.[0]) setVariantId(res.variants[0].id);
    } catch {
      setError("Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (slug) void load();
  }, [slug, load]);

  async function addToCart() {
    if (!product) return;
    setAdding(true);
    setError(null);
    try {
      const api = apiB2b();
      await api.post("/api/cart/items", {
        productId: product.id,
        variantId: variantId || undefined,
        quantity: qty,
      });
      router.push("/employee/cart");
    } catch {
      setError("Failed to add to cart");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-destructive">{error ?? "Product not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="aspect-square rounded-lg bg-muted">
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.title}
              className="h-full w-full rounded-lg object-cover"
            />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{product.title}</h1>
          {product.price != null && (
            <div className="mt-1 text-lg font-semibold">
              ₹{product.price.toLocaleString("en-IN")}
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {product.description ?? ""}
          </p>

          {product.variants && product.variants.length > 0 && (
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium">Variant</label>
              <select
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name ?? v.id}
                    {v.price != null ? ` — ₹${v.price}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <label className="text-sm font-medium">Qty</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="rounded border px-3 py-1"
              >
                −
              </button>
              <span className="w-8 text-center text-sm">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="rounded border px-3 py-1"
              >
                +
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 text-sm text-destructive">{error}</div>
          )}

          <button
            type="button"
            disabled={adding}
            onClick={() => void addToCart()}
            className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

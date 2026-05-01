"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiB2b } from "@/lib/api";
import ProductEditor, { type Product } from "../_editor";

export default function SuperAdminProductEditorPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    apiB2b()
      .get<Product>(`/api/products/admin/by-slug/${encodeURIComponent(slug)}`)
      .then((p) => {
        if (!cancelled) setProduct(p);
      })
      .catch(async (err) => {
        if (cancelled) return;
        // Fallback to public endpoint for legacy/compat
        try {
          const p = await apiB2b().get<Product>(`/api/products/${slug}`);
          if (!cancelled) setProduct(p);
        } catch {
          const message =
            (err as { body?: { message?: string }; message?: string })?.body?.message ||
            (err as { message?: string })?.message ||
            "Failed to load product";
          if (!cancelled) setError(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error && !product) {
    return <div className="text-sm text-destructive">{error}</div>;
  }
  if (!product) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <ProductEditor
      mode="edit"
      initial={product}
      productId={product.id}
      onSaved={(p) => setProduct(p)}
    />
  );
}

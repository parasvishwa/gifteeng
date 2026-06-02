"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";
import SellerProductEditor, { type Product } from "../_editor";

interface SellerOffer {
  id: string;
  price: string | number;
  stock: number;
  status: "pending" | "approved" | "rejected";
  rejectedReason: string | null;
  isOwnListing: boolean;
  product: Product & { variantOptions?: unknown[] };
}

export default function EditSellerProductPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [offer, setOffer] = useState<SellerOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    sellerApi.get<SellerOffer>(`/seller/products/${id}`)
      .then((r) => setOffer(r))
      .catch((e: { message?: string }) => setError(e.message ?? "Failed to load listing"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error ?? "Listing not found"}</p>
        <button onClick={() => router.push("/seller/products")} className="mt-4 text-xs text-muted-foreground underline">
          Back to products
        </button>
      </div>
    );
  }

  if (!offer.isOwnListing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          This listing is for a catalogue product. Only the price and stock can be updated.
        </p>
        <button onClick={() => router.push("/seller/products")} className="mt-4 text-xs text-muted-foreground underline">
          Back to products
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <SellerProductEditor
        mode="edit"
        sellerProductId={offer.id}
        initialProduct={offer.product}
        initialOffer={{
          price:          offer.price,
          stock:          offer.stock,
          status:         offer.status,
          rejectedReason: offer.rejectedReason,
          isOwnListing:   offer.isOwnListing,
        }}
        onSaved={() => router.push("/seller/products")}
      />
    </div>
  );
}

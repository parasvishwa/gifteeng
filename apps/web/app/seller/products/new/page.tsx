"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSellerToken } from "@/lib/seller-api";
import SellerProductEditor from "../_editor";

export default function NewSellerProductPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getSellerToken()) router.replace("/seller/login");
  }, [router]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <SellerProductEditor
        mode="create"
        onSaved={() => router.push("/seller/products")}
      />
    </div>
  );
}

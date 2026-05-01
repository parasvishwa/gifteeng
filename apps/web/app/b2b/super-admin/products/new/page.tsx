"use client";

import { useRouter } from "next/navigation";
import ProductEditor from "../_editor";

export default function NewProductPage() {
  const router = useRouter();
  return (
    <ProductEditor
      mode="create"
      onSaved={(p) => router.push(`/super-admin/products/${p.slug}`)}
    />
  );
}

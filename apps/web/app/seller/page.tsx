"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSellerToken } from "@/lib/seller-api";

// Entry point — bounce to dashboard if a token exists, else to login.
export default function SellerEntry() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getSellerToken() ? "/seller/dashboard" : "/seller/login");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

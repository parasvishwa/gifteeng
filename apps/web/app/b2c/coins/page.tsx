"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CoinsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/account?tab=goins"); }, [router]);
  return null;
}

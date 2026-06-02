"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GoinsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/account?tab=goins"); }, [router]);
  return null;
}

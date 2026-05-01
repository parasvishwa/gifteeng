"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function ProductionQueuePage() {
  const router = useRouter();
  useEffect(() => { router.replace("/super-admin/production"); }, [router]);
  return null;
}

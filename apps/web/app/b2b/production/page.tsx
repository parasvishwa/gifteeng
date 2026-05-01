"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProductionIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/production/queue");
  }, [router]);
  return null;
}

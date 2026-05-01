"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EmployeeIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/employee/store");
  }, [router]);
  return null;
}

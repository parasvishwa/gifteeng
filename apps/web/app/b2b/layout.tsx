"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { B2bHeader } from "./_components/B2bHeader";
import { useB2bAuth } from "@/lib/auth/b2b";

export default function B2BLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useB2bAuth();

  const isLoginRoute = pathname === "/" || pathname === "/login" || pathname === "/b2b/login";

  useEffect(() => {
    if (isLoading) return;
    if (!user && !isLoginRoute) {
      const returnTo = pathname ? encodeURIComponent(pathname) : "";
      router.replace(returnTo ? `/login?returnTo=${returnTo}` : "/login");
    }
  }, [user, isLoading, isLoginRoute, pathname, router]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <B2bHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}

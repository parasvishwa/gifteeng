"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { B2bHeader } from "./_components/B2bHeader";
import { useB2bAuth, roleLandingPath } from "@/lib/auth/b2b";

export default function B2BLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useB2bAuth();

  const isLoginPage = pathname === "/login" || pathname === "/b2b/login";

  useEffect(() => {
    if (isLoading) return;
    // Root: always redirect — to dashboard if signed in, to login if not.
    if (pathname === "/") {
      router.replace(user ? roleLandingPath(user.role) : "/login");
      return;
    }
    // Protected routes: redirect unauthenticated visitors to login.
    if (!user && !isLoginPage) {
      const returnTo = encodeURIComponent(pathname ?? "");
      router.replace(returnTo ? `/login?returnTo=${returnTo}` : "/login");
    }
  }, [user, isLoading, isLoginPage, pathname, router]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <B2bHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  useB2bAuth,
  roleLandingPath,
} from "@/lib/auth/b2b";

export function B2bHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useB2bAuth();

  function onLogout() {
    signOut();
    router.replace("/");
  }

  const roleLabel = user?.role
    ? user.role.replace("_", " ").toUpperCase()
    : null;

  return (
    <header className="border-b border-white/10 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold text-white">Gifteeng</span>
          <span className="px-1.5 py-0.5 bg-teal-500 text-white text-[9px] font-black rounded tracking-widest">BUSINESS</span>
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden items-center gap-2 text-sm md:flex">
              {user.email && <span className="text-slate-300">{user.email}</span>}
              {roleLabel && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/80">
                  {roleLabel}
                </span>
              )}
            </div>
          )}
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/10"
            >
              Log out
            </button>
          ) : null}
        </div>
      </div>
      {user && pathname === "/" && (
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pb-3">
          <div className="text-sm text-slate-300">
            Signed in as <strong className="text-white">{user.email ?? user.companyUserId}</strong>
          </div>
          <Link
            href={roleLandingPath(user.role)}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            {user.role === "hr_admin" && "Go to HR dashboard"}
            {user.role === "production" && "Go to queue"}
            {user.role === "employee" && "Go to store"}
            {(user.role === "super_admin" || user.role === "sales_admin") &&
              "Go to admin"}
          </Link>
        </div>
      )}
    </header>
  );
}

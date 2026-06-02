"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Package, ShoppingBag, Wallet,
  LogOut, Store, ChevronRight,
} from "lucide-react";
import { getSellerToken, clearSellerToken, sellerApi } from "@/lib/seller-api";

const NAV = [
  { href: "/seller/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/seller/products",  label: "Products",  icon: Package },
  { href: "/seller/orders",    label: "Orders",    icon: ShoppingBag },
  { href: "/seller/payouts",   label: "Payouts",   icon: Wallet },
];

const AUTH_PATHS = ["/seller/login", "/seller/onboard", "/seller"];

export function SellerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router   = useRouter();
  const [brand, setBrand] = useState("");

  const isAuthPage = AUTH_PATHS.some(
    (p) => pathname === p || (p !== "/seller" && pathname.startsWith(p + "/")),
  );

  useEffect(() => {
    if (isAuthPage) return;
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    sellerApi
      .get<{ brandName: string }>("/seller/auth/me")
      .then((m) => setBrand(m.brandName))
      .catch(() => { clearSellerToken(); router.replace("/seller/login"); });
  }, [isAuthPage, router]);

  if (isAuthPage) return <>{children}</>;

  const signOut = () => { clearSellerToken(); router.replace("/seller/login"); };

  return (
    <div className="min-h-screen flex bg-muted/20">

      {/* ── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-card border-r border-border/60 sticky top-0 h-screen">

        {/* Brand */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border/60 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate leading-tight">{brand || "Seller Portal"}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Gifteeng Marketplace</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="p-2 border-t border-border/60 shrink-0">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col pb-16 lg:pb-0">
        {children}
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border/60 flex z-40 safe-area-bottom">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={signOut}
          className="flex-none w-14 flex flex-col items-center gap-0.5 py-2 text-muted-foreground"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-[10px] font-medium">Exit</span>
        </button>
      </nav>
    </div>
  );
}

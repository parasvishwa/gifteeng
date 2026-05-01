"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@gifteeng/ui";
import { CompanyProvider, useCompany } from "./_components/CompanyContext";

type NavItem = {
  href: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/hr-admin", label: "Dashboard" },
  { href: "/hr-admin/employees", label: "Employees" },
  { href: "/hr-admin/campaigns", label: "Campaigns" },
  { href: "/hr-admin/bulk-customizer", label: "Bulk Customizer" },
  { href: "/hr-admin/wallet", label: "Wallet" },
  { href: "/hr-admin/orders", label: "Orders" },
  { href: "/hr-admin/settings", label: "Settings" },
];

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 h-screen w-60 shrink-0 border-r bg-background">
      <div className="px-6 py-6">
        <Link href="/hr-admin" className="text-xl font-bold">
          Gifteeng
        </Link>
        <div className="text-xs text-muted-foreground">HR Admin</div>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/hr-admin"
              ? pathname === "/hr-admin"
              : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar() {
  const { company, loading } = useCompany();
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="text-sm font-medium">
        {loading ? "Loading..." : company?.name ?? "No company"}
      </div>
      <div className="text-xs text-muted-foreground">HR Admin Portal</div>
    </header>
  );
}

export default function HrAdminLayout({ children }: { children: ReactNode }) {
  return (
    <CompanyProvider>
      <div className="flex min-h-screen bg-muted/20">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </CompanyProvider>
  );
}

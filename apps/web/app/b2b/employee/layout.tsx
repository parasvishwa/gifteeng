"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";

const NAV = [
  { href: "/employee/store", label: "Store" },
  { href: "/employee/cart", label: "Cart" },
  { href: "/employee/orders", label: "Orders" },
  { href: "/employee/wallet", label: "Wallet" },
  { href: "/employee/profile", label: "Profile" },
];

interface Allocation {
  id: string;
  amount?: number;
  redeemedAmount?: number;
}
interface AllocationsResponse {
  allocations?: Allocation[];
}
interface WalletResponse {
  balance?: number;
}

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [wallet, setWallet] = useState<number | null>(null);
  const [allocTotal, setAllocTotal] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const api = apiB2b();
        const [w, a] = await Promise.all([
          api
            .get<any>("/api/wallet/employee")
            .catch(() => ({ balance: 0 })),
          api
            .get<any>("/api/campaigns/me/allocations")
            .catch(() => []),
        ]);
        // Wallet balance is a Prisma Decimal (serializes as string) — coerce to number
        setWallet(Number(w?.balance ?? 0));
        // Allocations endpoint returns a plain array, not { allocations: [] }
        const allocList: Allocation[] = Array.isArray(a) ? a : (a?.allocations ?? []);
        const total = allocList.reduce(
          (sum, al) => sum + Math.max(0, Number(al.amount ?? 0) - Number(al.redeemedAmount ?? 0)),
          0
        );
        setAllocTotal(total);
      } catch {
        setWallet(0);
        setAllocTotal(0);
      }
    }
    void load();
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <nav className="hidden gap-4 text-sm md:flex">
            {NAV.map((n) => {
              const active = pathname?.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={
                    "rounded-md px-3 py-1.5 " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary")
                  }
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-full bg-secondary px-3 py-1">
              Wallet: ₹{(wallet ?? 0).toLocaleString("en-IN")}
            </span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
              Allocation: ₹{(allocTotal ?? 0).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>
      <main className="flex-1 pb-20 md:pb-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-card py-2 md:hidden">
        {NAV.map((n) => {
          const active = pathname?.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={
                "px-2 py-1 text-[11px] " +
                (active ? "text-primary font-semibold" : "text-muted-foreground")
              }
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

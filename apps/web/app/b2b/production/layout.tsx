"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/production/queue", label: "Queue" },
  { href: "/production/shipping", label: "Shipping" },
  { href: "/production/notifications", label: "Notifications" },
];

export default function ProductionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
      <aside className="w-48 shrink-0">
        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "block rounded-md px-3 py-2 text-sm " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}

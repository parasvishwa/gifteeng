"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronRight, Bell } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { useB2bAuth, roleLandingPath } from "@/lib/auth/b2b";

const routeTitles: Record<string, string> = {
  "/super-admin": "Dashboard",
  "/super-admin/analytics": "Analytics",
  "/super-admin/setup": "Setup",
  "/super-admin/orders": "Orders",
  "/super-admin/production": "Production",
  "/super-admin/invoices": "Invoices",
  "/super-admin/delivery": "Delivery",
  "/super-admin/products": "Products",
  "/super-admin/variants": "Variant Options",
  "/super-admin/categories": "Categories",
  "/super-admin/collections": "Collections",
  "/super-admin/catalogs": "Catalogs",
  "/super-admin/leads": "Leads",
  "/super-admin/enquiries": "Enquiries",
  "/super-admin/combo-products": "Combo Products",
  "/super-admin/free-gifts": "Free Gifts",
  "/super-admin/customers": "Customers",
  "/super-admin/users": "Users",
  "/super-admin/contact-messages": "Messages",
  "/super-admin/discounts": "Discounts",
  "/super-admin/referrals": "Referrals",
  "/super-admin/coins": "Goins & Loyalty",
  "/super-admin/sections": "Homepage Sections",
  "/super-admin/homepage-content": "Homepage Content",
  "/super-admin/reviews": "Reviews",
  "/super-admin/amazon-reviews": "Amazon Reviews",
  "/super-admin/videos": "Videos",
  "/super-admin/stock-images": "Stock Images",
  "/super-admin/pages": "Pages",
  "/super-admin/marketplace": "Marketplace",
  "/super-admin/navigation": "Navigation",
  "/super-admin/product-import": "Import",
  "/super-admin/theme": "Theme",
  "/super-admin/festival-theme": "Festival Theme",
  "/super-admin/customizer": "Customizer",
  "/super-admin/templates": "Template Studio",
  "/super-admin/files": "Files",
  "/super-admin/settings": "Settings",
  "/super-admin/ai-settings": "AI Settings",
  "/super-admin/production-queue": "Production Queue",
};

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useB2bAuth();
  const router = useRouter();
  const pathname = usePathname() || "/super-admin";

  useEffect(() => {
    if (isLoading) return;
    if (user && user.role !== "super_admin" && user.role !== "sales_admin") {
      router.push(roleLandingPath(user.role));
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-muted/30">
        <div className="h-7 w-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }
  if (user.role !== "super_admin" && user.role !== "sales_admin") return null;

  const currentTitle = routeTitles[pathname] || "Admin";
  const isSubPage = pathname !== "/super-admin";

  return (
    <div className="min-h-screen flex w-full bg-muted/30">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Modern header */}
        <header className="h-14 flex items-center justify-between border-b border-border/60 px-4 bg-card/80 backdrop-blur-md shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <nav className="flex items-center gap-1 text-sm min-w-0">
                <span className="text-muted-foreground text-xs font-medium hidden sm:inline">Admin</span>
                {isSubPage && (
                  <>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0 hidden sm:block" />
                    <span className="text-foreground font-semibold text-sm truncate">{currentTitle}</span>
                  </>
                )}
                {!isSubPage && (
                  <span className="text-foreground font-semibold text-sm">Dashboard</span>
                )}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <button className="relative w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
              </button>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-pink-dark flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground">
                  {user.email?.[0]?.toUpperCase() || "A"}
                </span>
              </div>
            </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

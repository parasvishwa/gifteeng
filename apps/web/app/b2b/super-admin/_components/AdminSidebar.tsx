"use client";

import {
  LayoutDashboard, BarChart3, ShoppingBag, Factory, FileText, Truck,
  Package, Folder, Layers, Palette, Grid3X3,
  Building2, UserCog, Megaphone, Wallet,
  Tag, Gift, Share2, Star, Sparkles, ShoppingCart,
  Users, MessageSquare,
  Home, LayoutList, Video, Image as ImageIcon,
  Download, Settings, Brain, HardDrive,
  ChevronDown, LogOut, Search, PanelLeftClose, PanelLeftOpen, Wrench,
  Coins, CreditCard, LayoutTemplate, ShieldAlert,
  // New v2 features
  MessageSquareQuote, CalendarClock, Send, Zap, Ticket,
  Activity, Trophy,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useRef } from "react";
import { useB2bAuth } from "@/lib/auth/b2b";

interface NavItem { label: string; href: string; icon: React.ElementType; keywords?: string }
interface NavGroup { section: string; items: NavItem[] }

const ADMIN_NAV: NavGroup[] = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
      { label: "Analytics", href: "/super-admin/analytics", icon: BarChart3, keywords: "stats visitors" },
      { label: "Product Analytics", href: "/super-admin/product-analytics", icon: Zap, keywords: "funnel events conversion" },
      { label: "Activity Feed", href: "/super-admin/activity-feed", icon: Activity, keywords: "live monitor log user actions purchases errors abandonment" },
    ],
  },
  {
    section: "Commerce",
    items: [
      { label: "Orders", href: "/super-admin/orders", icon: ShoppingBag },
      { label: "Production", href: "/super-admin/production", icon: Factory, keywords: "queue manufacturing" },
      { label: "Invoices", href: "/super-admin/invoices", icon: FileText },
      { label: "Delivery", href: "/super-admin/delivery", icon: Truck, keywords: "shipping track awb" },
    ],
  },
  {
    section: "Catalog",
    items: [
      { label: "Products", href: "/super-admin/products", icon: Package },
      { label: "Categories", href: "/super-admin/categories", icon: Folder },
      { label: "Variants", href: "/super-admin/variants", icon: Layers },
      { label: "Collections", href: "/super-admin/collections", icon: Grid3X3 },
      { label: "Customizer", href: "/super-admin/customizer", icon: Palette },
      { label: "Thank-You Cards", href: "/super-admin/thank-you-cards", icon: CreditCard, keywords: "thankyou greeting card checkout addon" },
      { label: "Template Studio", href: "/super-admin/templates", icon: LayoutTemplate, keywords: "canvas design template customise" },
      { label: "Import", href: "/super-admin/products/import", icon: Download, keywords: "amazon shopify csv url" },
    ],
  },
  {
    section: "Corporate",
    items: [
      { label: "Companies", href: "/super-admin/companies", icon: Building2 },
      { label: "HR Admins", href: "/super-admin/hr-admins", icon: UserCog },
      { label: "Campaigns", href: "/super-admin/campaigns", icon: Megaphone },
      { label: "Wallets", href: "/super-admin/wallets", icon: Wallet, keywords: "balance topup" },
    ],
  },
  {
    section: "Growth",
    items: [
      { label: "Discounts", href: "/super-admin/discounts", icon: Tag, keywords: "coupon code" },
      { label: "Free Gifts", href: "/super-admin/free-gifts", icon: Gift },
      { label: "Cart Recovery", href: "/super-admin/cart-recovery", icon: ShoppingCart, keywords: "abandonment notification push emotion driven nudge" },
      { label: "Inactivity Rewards", href: "/super-admin/inactivity-rewards", icon: Coins, keywords: "dormant inactive goins drop reengagement winback" },
      { label: "Milestone Rewards", href: "/super-admin/milestone-rewards", icon: Trophy, keywords: "100th visitor app downloader signup celebration counter" },
      { label: "Referrals", href: "/super-admin/referrals", icon: Share2 },
      { label: "Coins", href: "/super-admin/coins", icon: Sparkles, keywords: "loyalty points" },
      { label: "Reviews", href: "/super-admin/reviews", icon: Star, keywords: "amazon ratings" },
      { label: "External Reviews", href: "/super-admin/external-reviews", icon: MessageSquareQuote, keywords: "amazon flipkart myntra google marketplace import" },
      { label: "Testimonials", href: "/super-admin/testimonials", icon: MessageSquareQuote, keywords: "home carousel reviews quotes" },
      { label: "Stickers", href: "/super-admin/stickers", icon: Ticket, keywords: "album pack collect goins" },
      { label: "Product Drops", href: "/super-admin/product-drops", icon: Gift, keywords: "drop game lottery shipping win" },
      { label: "Fraud Watch", href: "/super-admin/fraud-watch", icon: ShieldAlert, keywords: "audit freeze goin earners suspicious" },
    ],
  },
  {
    section: "Customers",
    items: [
      { label: "Customers", href: "/super-admin/customers", icon: Users },
      { label: "Messages", href: "/super-admin/contact-messages", icon: MessageSquare, keywords: "contact enquiry" },
      { label: "Reminders", href: "/super-admin/reminders", icon: CalendarClock, keywords: "gift birthday anniversary cron nudge" },
      { label: "Broadcast", href: "/super-admin/broadcast", icon: Send, keywords: "push notification fcm announce" },
    ],
  },
  {
    section: "Content",
    items: [
      { label: "Homepage", href: "/super-admin/homepage-content", icon: Home },
      { label: "Banners", href: "/super-admin/banners", icon: ImageIcon, keywords: "hero slider carousel home top" },
      { label: "Announcements", href: "/super-admin/announcements", icon: Megaphone, keywords: "banner festival event valentine diwali" },
      { label: "Pages", href: "/super-admin/pages", icon: LayoutList, keywords: "cms custom" },
      { label: "Videos", href: "/super-admin/videos", icon: Video },
      { label: "Stock Images", href: "/super-admin/stock-images", icon: ImageIcon, keywords: "backgrounds" },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Settings", href: "/super-admin/settings", icon: Settings },
      { label: "AI Settings", href: "/super-admin/ai-settings", icon: Brain, keywords: "seo generator" },
      { label: "Marketing", href: "/super-admin/marketing", icon: Megaphone, keywords: "gtm ga4 google analytics meta pixel facebook tracking conversion ads" },
      { label: "Shopify Migrate", href: "/super-admin/data-import/shopify", icon: Download, keywords: "import customers orders csv shopify migration" },
      { label: "Files", href: "/super-admin/files", icon: HardDrive, keywords: "uploads assets" },
    ],
  },
];

// Flat list for search
const ALL_ITEMS = ADMIN_NAV.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section })));

const roleAccent: Record<string, string> = {
  super_admin: 'border-l-4 border-red-500',
  sales_admin: 'border-l-4 border-blue-500',
  hr_admin: 'border-l-4 border-green-500',
};

const roleAccentColor: Record<string, string> = {
  super_admin: 'bg-red-500',
  sales_admin: 'bg-blue-500',
  hr_admin: 'bg-green-500',
};

const roleDotColor: Record<string, string> = {
  super_admin: 'bg-red-500',
  sales_admin: 'bg-blue-500',
  hr_admin: 'bg-green-500',
};

function NavLink({
  item,
  isActive,
  collapsed,
  accentColor,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  accentColor: string;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all duration-150 ${
        isActive
          ? "bg-primary/10 font-semibold text-primary shadow-sm"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      {isActive && !collapsed && (
        <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ${accentColor}`} />
      )}
      <Icon className={`h-[15px] w-[15px] shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"}`} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

// localStorage key for persisting open/closed state per group
const GROUP_OPEN_KEY = "gifteeng.admin.sidebar.groups";

function readGroupState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(GROUP_OPEN_KEY) ?? "{}") as Record<string, boolean>;
  } catch { return {}; }
}

function writeGroupState(state: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify(state)); } catch { /* quota full, ignore */ }
}

function GroupSection({
  group,
  collapsed,
  search,
  accentColor,
  activeGroup,
}: {
  group: NavGroup;
  collapsed: boolean;
  search: string;
  accentColor: string;
  activeGroup: string;
}) {
  const pathname = usePathname();
  const isActiveGroup = activeGroup === group.section;
  // Default rule: only the group containing the active page opens on load.
  // Everything else collapses so the sidebar is scannable at a glance.
  // User overrides are persisted in localStorage.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return isActiveGroup;
    const saved = readGroupState();
    return saved[group.section] ?? isActiveGroup;
  });

  // When the user navigates to another section, auto-open that group the
  // first time (even if they'd previously collapsed it) — but don't
  // auto-close groups the user has manually opened elsewhere.
  useEffect(() => {
    if (isActiveGroup && !open) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveGroup]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const saved = readGroupState();
    saved[group.section] = next;
    writeGroupState(saved);
  };

  const visible = useMemo(() => {
    if (!search) return group.items;
    const q = search.toLowerCase();
    return group.items.filter(
      (i) => i.label.toLowerCase().includes(q) || (i.keywords ?? "").toLowerCase().includes(q),
    );
  }, [search, group.items]);

  if (visible.length === 0) return null;

  return (
    <div className="mb-0.5">
      {!collapsed && (
        <button
          type="button"
          onClick={toggle}
          className={`flex w-full items-center justify-between px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] transition-colors ${
            isActiveGroup
              ? "text-primary/80"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          }`}
        >
          <span>{group.section}</span>
          <span className="flex items-center gap-1">
            {!open && !search && (
              <span className="text-muted-foreground/40 font-semibold normal-case tracking-normal">
                {group.items.length}
              </span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          </span>
        </button>
      )}
      {(open || search) && (
        <ul className="mt-0.5 space-y-px">
          {visible.map((item) => {
            const isActive = item.href === "/super-admin"
              ? pathname === "/super-admin"
              : pathname?.startsWith(item.href) ?? false;
            return (
              <li key={item.href}>
                <NavLink item={item} isActive={isActive} collapsed={collapsed} accentColor={accentColor} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useB2bAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Determine which group the current URL belongs to — used to pre-open that
  // group on first render and highlight its header.
  const activeGroup = useMemo(() => {
    const p = pathname ?? "";
    let best = { section: "", score: 0 };
    for (const g of ADMIN_NAV) {
      for (const i of g.items) {
        if (i.href === "/super-admin" ? p === "/super-admin" : p.startsWith(i.href)) {
          // Longer match wins (so /products/import beats /products).
          if (i.href.length > best.score) best = { section: g.section, score: i.href.length };
        }
      }
    }
    return best.section || "Overview";
  }, [pathname]);

  // Cmd/Ctrl+K → focus the quick-find field. Makes the growing menu jumpable
  // without forcing the user to hunt for the search box each time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (collapsed) setCollapsed(false);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed]);

  const roleLabel = user?.role ? user.role.replace("_", " ").toUpperCase() : null;
  const initials = user?.email?.[0]?.toUpperCase() ?? "A";

  const asideAccent = user?.role ? (roleAccent[user.role] ?? "") : "";
  const accentColor = user?.role ? (roleAccentColor[user.role] ?? "bg-primary") : "bg-primary";
  const dotColor = user?.role ? (roleDotColor[user.role] ?? "bg-primary") : "bg-primary";

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border/40 bg-card transition-all duration-200 ${
        collapsed ? "w-14" : "w-64"
      } ${asideAccent}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-3">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-icon.png" alt="" className="h-7 w-7 rounded-lg object-contain" />
            <div className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-4 w-auto" />
              <span className="text-[8px] font-bold uppercase tracking-widest text-primary/50">Admin</span>
            </div>
          </div>
        )}
        <button
          onClick={() => { setCollapsed((v) => !v); setSearch(""); }}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <PanelLeftOpen className="h-3.5 w-3.5" />
            : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-2 py-2 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Quick find…"
              className="w-full rounded-md border border-border/40 bg-muted/30 py-1 pl-6 pr-10 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            {search ? (
              <button onClick={() => setSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
                ×
              </button>
            ) : (
              <kbd className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-border/60 bg-background px-1 py-[1px] text-[8px] font-semibold text-muted-foreground/60">
                ⌘K
              </kbd>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
        {ADMIN_NAV.map((group) => (
          <GroupSection
            key={group.section}
            group={group}
            collapsed={collapsed}
            search={search}
            accentColor={accentColor}
            activeGroup={activeGroup}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/40 p-2 space-y-px">
        {user && !collapsed && (
          <div className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-pink-dark text-[9px] font-bold text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-foreground">{user.email ?? user.companyUserId}</div>
              {roleLabel && (
                <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-primary/60">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                  {roleLabel}
                </div>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => router.push("/")}
          title="Back to site"
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground ${collapsed ? "justify-center" : ""}`}
        >
          <Home className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span>Back to site</span>}
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          title="Sign out"
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-destructive/60 transition-colors hover:bg-destructive/10 hover:text-destructive ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

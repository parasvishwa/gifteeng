"use client";

import {
  LayoutDashboard, BarChart3, ShoppingBag, Factory, FileText, Truck, Store,
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
  // v3 — pinned/recents
  Pin,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useB2bAuth, getB2bToken, userHasPermission } from "@/lib/auth/b2b";
import { CommandPalette } from "./CommandPalette";

/// Permission strings — keep in sync with apps/api/src/modules/auth-b2b/permissions.ts.
/// An item with `permission` set is hidden when the user doesn't have it.
/// Items without `permission` are visible to anyone who can see the admin
/// shell (basic nav like Dashboard, Files, Settings detail page).
interface NavItem { label: string; href: string; icon: React.ElementType; keywords?: string; permission?: string }
interface NavGroup { section: string; items: NavItem[] }

const ADMIN_NAV: NavGroup[] = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "/super-admin", icon: LayoutDashboard },
      { label: "Analytics", href: "/super-admin/analytics", icon: BarChart3, keywords: "stats visitors", permission: "analytics.view" },
      { label: "Product Analytics", href: "/super-admin/product-analytics", icon: Zap, keywords: "funnel events conversion", permission: "analytics.view" },
      { label: "Activity Feed", href: "/super-admin/activity-feed", icon: Activity, keywords: "live monitor log user actions purchases errors abandonment", permission: "analytics.view" },
    ],
  },
  {
    section: "Commerce",
    items: [
      { label: "Orders", href: "/super-admin/orders", icon: ShoppingBag, permission: "orders.view" },
      { label: "Sellers", href: "/super-admin/sellers", icon: Store, keywords: "marketplace vendor seller approval kyc onboarding" },
      { label: "Product Listings", href: "/super-admin/seller-products", icon: Package, keywords: "marketplace seller product offer verify approve listing" },
      { label: "Order Assignments", href: "/super-admin/order-assignments", icon: Zap, keywords: "marketplace seller routing assignment floating cascade dispatch" },
      { label: "Seller Payouts", href: "/super-admin/payouts", icon: Wallet, keywords: "payout commission earnings payment seller bank transfer" },
      { label: "Production", href: "/super-admin/production", icon: Factory, keywords: "queue manufacturing", permission: "shipments.view" },
      { label: "Invoices", href: "/super-admin/invoices", icon: FileText, permission: "orders.view" },
      { label: "Delivery", href: "/super-admin/delivery", icon: Truck, keywords: "shipping track awb", permission: "shipments.view" },
    ],
  },
  {
    section: "Catalog",
    items: [
      { label: "Products", href: "/super-admin/products", icon: Package, permission: "products.view" },
      { label: "Categories", href: "/super-admin/categories", icon: Folder, permission: "categories.view" },
      { label: "Variants", href: "/super-admin/variants", icon: Layers, permission: "variants.view" },
      { label: "Collections", href: "/super-admin/collections", icon: Grid3X3, permission: "collections.view" },
      { label: "Customizer", href: "/super-admin/customizer", icon: Palette, permission: "products.edit" },
      { label: "Thank-You Cards", href: "/super-admin/thank-you-cards", icon: CreditCard, keywords: "thankyou greeting card checkout addon", permission: "products.edit" },
      { label: "Template Studio", href: "/super-admin/templates", icon: LayoutTemplate, keywords: "canvas design template customise", permission: "products.edit" },
      { label: "Import", href: "/super-admin/products/import", icon: Download, keywords: "amazon shopify csv url", permission: "products.import" },
    ],
  },
  {
    section: "Growth",
    items: [
      { label: "Discounts", href: "/super-admin/discounts", icon: Tag, keywords: "coupon code", permission: "discounts.view" },
      { label: "Free Gifts", href: "/super-admin/free-gifts", icon: Gift, permission: "discounts.view" },
      { label: "Cart Recovery", href: "/super-admin/cart-recovery", icon: ShoppingCart, keywords: "abandonment notification push emotion driven nudge", permission: "campaigns.view" },
      { label: "Inactivity Rewards", href: "/super-admin/inactivity-rewards", icon: Coins, keywords: "dormant inactive goins drop reengagement winback", permission: "coins.edit" },
      { label: "Milestone Rewards", href: "/super-admin/milestone-rewards", icon: Trophy, keywords: "100th visitor app downloader signup celebration counter", permission: "coins.edit" },
      { label: "Referrals", href: "/super-admin/referrals", icon: Share2, permission: "referrals.view" },
      { label: "Goins", href: "/super-admin/coins", icon: Sparkles, keywords: "loyalty points coins goins", permission: "coins.view" },
      { label: "Reviews", href: "/super-admin/reviews", icon: Star, keywords: "amazon ratings", permission: "reviews.view" },
      { label: "External Reviews", href: "/super-admin/external-reviews", icon: MessageSquareQuote, keywords: "amazon flipkart myntra google marketplace import", permission: "reviews.view" },
      { label: "Testimonials", href: "/super-admin/testimonials", icon: MessageSquareQuote, keywords: "home carousel reviews quotes", permission: "testimonials.view" },
      { label: "Stickers", href: "/super-admin/stickers", icon: Ticket, keywords: "album pack collect goins", permission: "games.edit" },
      { label: "Product Drops", href: "/super-admin/product-drops", icon: Gift, keywords: "drop game lottery shipping win", permission: "games.edit" },
      { label: "Fraud Watch", href: "/super-admin/fraud-watch", icon: ShieldAlert, keywords: "audit freeze goin earners suspicious", permission: "coins.edit" },
    ],
  },
  {
    section: "Customers",
    items: [
      { label: "Customers", href: "/super-admin/customers", icon: Users, permission: "customers.view" },
      { label: "Messages", href: "/super-admin/contact-messages", icon: MessageSquare, keywords: "contact enquiry", permission: "customers.view" },
      { label: "Reminders", href: "/super-admin/reminders", icon: CalendarClock, keywords: "gift birthday anniversary cron nudge", permission: "campaigns.view" },
      { label: "Broadcast", href: "/super-admin/broadcast", icon: Send, keywords: "push notification fcm announce", permission: "campaigns.edit" },
    ],
  },
  {
    section: "Content",
    items: [
      { label: "Homepage", href: "/super-admin/homepage-content", icon: Home, permission: "homepage.edit" },
      { label: "Banners", href: "/super-admin/banners", icon: ImageIcon, keywords: "hero slider carousel home top", permission: "hero_banners.view" },
      { label: "Announcements", href: "/super-admin/announcements", icon: Megaphone, keywords: "banner festival event valentine diwali", permission: "announcements.edit" },
      { label: "Pages", href: "/super-admin/pages", icon: LayoutList, keywords: "cms custom", permission: "pages.edit" },
      { label: "Videos", href: "/super-admin/videos", icon: Video, permission: "pages.edit" },
      { label: "Stock Images", href: "/super-admin/stock-images", icon: ImageIcon, keywords: "backgrounds", permission: "stock_images.view" },
    ],
  },
  {
    section: "System",
    items: [
      { label: "Team", href: "/super-admin/users", icon: Users, keywords: "members invite roles permissions admin", permission: "users.view" },
      { label: "Settings", href: "/super-admin/settings", icon: Settings, permission: "settings.view" },
      { label: "SEO Command Centre", href: "/super-admin/seo", icon: Search, keywords: "seo sitemap meta title description keywords score bulk regenerate ai", permission: "settings.edit" },
      { label: "AI Settings", href: "/super-admin/ai-settings", icon: Brain, keywords: "seo generator", permission: "settings.edit" },
      { label: "Marketing", href: "/super-admin/marketing", icon: Megaphone, keywords: "gtm ga4 google analytics meta pixel facebook tracking conversion ads", permission: "settings.edit" },
      { label: "Shopify Migrate", href: "/super-admin/data-import/shopify", icon: Download, keywords: "import customers orders csv shopify migration", permission: "products.import" },
      { label: "Files", href: "/super-admin/files", icon: HardDrive, keywords: "uploads assets", permission: "files.view" },
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
  badge,
  isPinned,
  onTogglePin,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  accentColor: string;
  badge?: number;
  isPinned?: boolean;
  onTogglePin?: () => void;
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
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && typeof badge === "number" && badge > 0 && (
        <span className={`ml-auto rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
          isActive ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"
        }`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {!collapsed && onTogglePin && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }}
          title={isPinned ? "Unpin" : "Pin to top"}
          className={`ml-1 -mr-1 rounded p-0.5 transition-opacity ${
            isPinned
              ? "text-primary opacity-100"
              : "text-muted-foreground/60 opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
          }`}
        >
          {isPinned ? <Pin className="h-3 w-3 fill-current" /> : <Pin className="h-3 w-3" />}
        </button>
      )}
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

// ── Pinned items ──────────────────────────────────────────────────────────────
const PINNED_KEY = "gifteeng.admin.sidebar.pinned";

function readPinned(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(PINNED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function writePinned(hrefs: string[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(hrefs)); } catch { /* ignore */ }
}

// ── Recently visited ──────────────────────────────────────────────────────────
const RECENT_KEY = "gifteeng.admin.sidebar.recent";
const RECENT_MAX = 5;

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function pushRecent(href: string): string[] {
  if (typeof window === "undefined") return [];
  const cur = readRecent().filter((h) => h !== href);
  const next = [href, ...cur].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

// ── Badge counts ──────────────────────────────────────────────────────────────
// Maps href → live count. Cheap one-shot fetch on mount + every 60s.
type BadgeMap = Record<string, number>;

function useBadgeCounts(): BadgeMap {
  const [counts, setCounts] = useState<BadgeMap>({});
  useEffect(() => {
    const tick = async () => {
      const token = getB2bToken();
      if (!token) return;
      try {
        const r = await fetch("/api/admin/sidebar-counts", { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const data = (await r.json()) as { orders?: number; production?: number; messages?: number };
        setCounts({
          "/super-admin/orders": data.orders ?? 0,
          "/super-admin/production": data.production ?? 0,
          "/super-admin/contact-messages": data.messages ?? 0,
        });
      } catch { /* network hiccup — keep stale counts */ }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return counts;
}

function GroupSection({
  group,
  collapsed,
  accentColor,
  activeGroup,
  badges,
  pinned,
  togglePin,
}: {
  group: NavGroup;
  collapsed: boolean;
  accentColor: string;
  activeGroup: string;
  badges: BadgeMap;
  pinned: Set<string>;
  togglePin: (href: string) => void;
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

  // Re-sync from localStorage when the user clicks "Collapse all" / "Expand all".
  useEffect(() => {
    const onReset = () => {
      const saved = readGroupState();
      if (group.section in saved) setOpen(saved[group.section]!);
    };
    window.addEventListener("gifteeng:sidebar:groups-reset", onReset);
    return () => window.removeEventListener("gifteeng:sidebar:groups-reset", onReset);
  }, [group.section]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const saved = readGroupState();
    saved[group.section] = next;
    writeGroupState(saved);
  };

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
            {!open && (
              <span className="text-muted-foreground/40 font-semibold normal-case tracking-normal">
                {group.items.length}
              </span>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          </span>
        </button>
      )}
      {open && (
        <ul className="mt-0.5 space-y-px">
          {group.items.map((item) => {
            const isActive = item.href === "/super-admin"
              ? pathname === "/super-admin"
              : pathname?.startsWith(item.href) ?? false;
            return (
              <li key={item.href}>
                <NavLink
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                  accentColor={accentColor}
                  badge={badges[item.href]}
                  isPinned={pinned.has(item.href)}
                  onTogglePin={() => togglePin(item.href)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function VirtualSection({
  label,
  items,
  collapsed,
  accentColor,
  pathname,
  badges,
  pinned,
  togglePin,
  trailing,
}: {
  label: string;
  items: NavItem[];
  collapsed: boolean;
  accentColor: string;
  pathname: string | null;
  badges: BadgeMap;
  pinned: Set<string>;
  togglePin: (href: string) => void;
  trailing?: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1.5">
      {!collapsed && (
        <div className="flex items-center justify-between px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50">
          <span>{label}</span>
          {trailing}
        </div>
      )}
      <ul className="mt-0.5 space-y-px">
        {items.map((item) => {
          const isActive = item.href === "/super-admin"
            ? pathname === "/super-admin"
            : pathname?.startsWith(item.href) ?? false;
          return (
            <li key={item.href}>
              <NavLink
                item={item}
                isActive={isActive}
                collapsed={collapsed}
                accentColor={accentColor}
                badge={badges[item.href]}
                isPinned={pinned.has(item.href)}
                onTogglePin={() => togglePin(item.href)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useB2bAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const badges = useBadgeCounts();

  // ── Permission-gated nav ─────────────────────────────────────────────────
  // Filter ADMIN_NAV down to only the items the current user has permission
  // for. super_admin bypasses (sees everything). Other users see only what
  // their role-default OR per-user permission grants allow. Empty groups
  // are dropped so we don't render an empty header. Items without a
  // `permission` field are always visible.
  const visibleNav = useMemo(() => {
    if (!user) return [] as NavGroup[];
    return ADMIN_NAV
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.permission || userHasPermission(user, i.permission)),
      }))
      .filter((g) => g.items.length > 0);
  }, [user]);

  const visibleAllItems = useMemo(
    () => visibleNav.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section }))),
    [visibleNav],
  );

  // Hydrate pinned + recent from localStorage on mount (SSR-safe).
  useEffect(() => {
    setPinned(readPinned());
    setRecent(readRecent());
  }, []);

  // Track navigation: every time the path changes to a known admin item,
  // bump it to the top of the recent list.
  useEffect(() => {
    if (!pathname) return;
    const match = visibleAllItems.find((i) =>
      i.href === "/super-admin" ? pathname === "/super-admin" : pathname.startsWith(i.href),
    );
    if (match) setRecent(pushRecent(match.href));
  }, [pathname, visibleAllItems]);

  const togglePin = useCallback((href: string) => {
    setPinned((cur) => {
      const next = cur.includes(href) ? cur.filter((h) => h !== href) : [...cur, href];
      writePinned(next);
      return next;
    });
  }, []);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const pinnedItems = useMemo(
    () => pinned
      .map((h) => visibleAllItems.find((i) => i.href === h))
      .filter((x): x is typeof visibleAllItems[number] => Boolean(x)),
    [pinned, visibleAllItems],
  );

  // Recent excludes anything already pinned to avoid duplicate rows.
  const recentItems = useMemo(
    () =>
      recent
        .filter((h) => !pinnedSet.has(h))
        .map((h) => visibleAllItems.find((i) => i.href === h))
        .filter((x): x is typeof visibleAllItems[number] => Boolean(x)),
    [recent, pinnedSet, visibleAllItems],
  );

  // Determine which group the current URL belongs to — used to pre-open that
  // group on first render and highlight its header.
  const activeGroup = useMemo(() => {
    const p = pathname ?? "";
    let best = { section: "", score: 0 };
    for (const g of visibleNav) {
      for (const i of g.items) {
        if (i.href === "/super-admin" ? p === "/super-admin" : p.startsWith(i.href)) {
          // Longer match wins (so /products/import beats /products).
          if (i.href.length > best.score) best = { section: g.section, score: i.href.length };
        }
      }
    }
    return best.section || "Overview";
  }, [pathname]);

  // Cmd/Ctrl+K → open the global command palette. The palette has its own
  // Escape handler for closing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const roleLabel = user?.role ? user.role.replace("_", " ").toUpperCase() : null;
  // Display name: prefer fullName, then email, then a friendly role label.
  // Never fall back to the UUID — that's what the user was seeing before.
  const displayName = user?.fullName?.trim()
    || user?.email
    || (user?.role === "super_admin" ? "Super Admin" : roleLabel)
    || "Admin";
  const initials = (user?.fullName?.trim() || user?.email || "A")[0]!.toUpperCase();

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
            <img src="/brand/icon.svg" alt="" className="h-7 w-7 rounded-lg object-contain" />
            <div className="min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-4 w-auto" />
              <span className="text-[8px] font-bold uppercase tracking-widest text-primary/50">Admin</span>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <PanelLeftOpen className="h-3.5 w-3.5" />
            : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Search button — opens the command palette. One unified search UX
          instead of an inline filter that competes with the palette. */}
      {!collapsed && (
        <div className="px-2 py-2 border-b border-border/30 bg-card">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group flex w-full items-center gap-2 rounded-md border border-border/40 bg-muted/30 py-1.5 px-2 text-xs text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Search className="h-3 w-3" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-border/60 bg-background px-1 py-[1px] text-[8px] font-semibold text-muted-foreground/60">
              ⌘K
            </kbd>
          </button>
          <div className="flex items-center justify-between px-0.5 pt-1.5">
            <button
              type="button"
              onClick={() => {
                const allClosed: Record<string, boolean> = {};
                for (const g of visibleNav) allClosed[g.section] = false;
                writeGroupState(allClosed);
                window.dispatchEvent(new Event("gifteeng:sidebar:groups-reset"));
              }}
              className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-foreground"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={() => {
                const allOpen: Record<string, boolean> = {};
                for (const g of visibleNav) allOpen[g.section] = true;
                writeGroupState(allOpen);
                window.dispatchEvent(new Event("gifteeng:sidebar:groups-reset"));
              }}
              className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-foreground"
            >
              Expand all
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
        {/* Pinned — only renders when the user has pinned at least one item. */}
        <VirtualSection
          label="Pinned"
          items={pinnedItems}
          collapsed={collapsed}
          accentColor={accentColor}
          pathname={pathname}
          badges={badges}
          pinned={pinnedSet}
          togglePin={togglePin}
          trailing={
            pinnedItems.length > 0 ? (
              <span className="flex items-center gap-1 text-muted-foreground/40 font-semibold normal-case tracking-normal">
                <Pin className="h-2.5 w-2.5 fill-current" />
                {pinnedItems.length}
              </span>
            ) : undefined
          }
        />

        {recentItems.length > 0 && (
          <VirtualSection
            label="Recent"
            items={recentItems}
            collapsed={collapsed}
            accentColor={accentColor}
            pathname={pathname}
            badges={badges}
            pinned={pinnedSet}
            togglePin={togglePin}
            trailing={
              <button
                type="button"
                onClick={() => {
                  try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
                  setRecent([]);
                }}
                title="Clear recent"
                className="rounded px-1 text-muted-foreground/40 normal-case tracking-normal hover:text-foreground"
              >
                clear
              </button>
            }
          />
        )}

        {(pinnedItems.length > 0 || recentItems.length > 0) && !collapsed && (
          <div className="my-1.5 mx-2 border-t border-border/30" />
        )}

        {visibleNav.map((group) => (
          <GroupSection
            key={group.section}
            group={group}
            collapsed={collapsed}
            accentColor={accentColor}
            activeGroup={activeGroup}
            badges={badges}
            pinned={pinnedSet}
            togglePin={togglePin}
          />
        ))}
      </nav>

      {/* Global command palette — opens on ⌘K. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={ALL_ITEMS}
        recentHrefs={recent}
      />

      {/* Footer */}
      <div className="border-t border-border/40 p-2 space-y-px">
        {user && !collapsed && (
          <div className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-pink-dark text-[9px] font-bold text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-foreground">{displayName}</div>
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

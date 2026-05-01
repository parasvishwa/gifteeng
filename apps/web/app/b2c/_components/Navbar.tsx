"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AnnouncementBar } from "./chrome/AnnouncementBar";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ShoppingCart, ChevronDown, Package,
  Sun, Moon, Monitor, User, LogOut,
  FileText, HelpCircle, ChevronRight,
  Palette, Home, Briefcase, Car, Shirt, Gift,
  CalendarHeart, Trophy, Wallet, Star, Heart,
} from "lucide-react";
import { useCartStore } from "@/lib/stores/cart";
import { API_BASE_URL } from "@/lib/api";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { COINS_EARNED_EVENT, type CoinsEarnedDetail } from "@/lib/coins-fx";

// ── Auth hook ────────────────────────────────────────────────────────────────

interface B2cUser { id: string; phone?: string; email?: string; name?: string; }

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

function useAuth() {
  const [user, setUser] = useState<B2cUser | null>(null);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [pendingCoins, setPendingCoins] = useState<number>(0);

  const refreshBalance = useCallback(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("gifteeng.b2c.token");
    if (!token) return;
    fetch(`${API_BASE_URL}/api/coins/balance`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((d: { balance?: number; pendingBalance?: number } | null) => {
        if (d?.balance !== undefined) setCoinBalance(d.balance);
        if (d?.pendingBalance !== undefined) setPendingCoins(d.pendingBalance);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("gifteeng.b2c.token");
    if (!token) { setUser(null); setCoinBalance(null); setPendingCoins(0); return; }
    const payload = decodeJwt(token);
    if (!payload || (payload.exp as number) * 1000 < Date.now()) {
      localStorage.removeItem("gifteeng.b2c.token");
      setUser(null); setCoinBalance(null); setPendingCoins(0); return;
    }
    const u: B2cUser = {
      id: String(payload.sub ?? ""),
      phone: payload.phone as string | undefined,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    };
    setUser(u);
    refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    load();
    window.addEventListener("storage", load);
    window.addEventListener("b2c-auth-change", load);
    // When any screen reports a coin earn, re-fetch the authoritative
    // balance + optimistically bump the chip so the number changes in sync
    // with the flying-coin animation.
    const onEarn = (e: Event) => {
      const detail = (e as CustomEvent<CoinsEarnedDetail>).detail;
      if (!detail) return;
      if (detail.redeemable) {
        setCoinBalance((cur) => (cur ?? 0) + detail.amount);
      } else {
        setPendingCoins((cur) => cur + detail.amount);
      }
      // Always reconcile with the server after the animation completes.
      window.setTimeout(refreshBalance, 1100);
    };
    window.addEventListener(COINS_EARNED_EVENT, onEarn);
    // Realtime cross-device sync — when the SSE stream tells us the
    // goin balance changed (e.g. customer redeemed coins from Flutter),
    // refetch the authoritative balance so the navbar chip updates.
    const onRealtime = (e: Event) => {
      const scope = (e as CustomEvent).detail?.scope;
      if (scope === "goins") refreshBalance();
    };
    window.addEventListener("gifteeng:invalidate", onRealtime);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("b2c-auth-change", load);
      window.removeEventListener(COINS_EARNED_EVENT, onEarn);
      window.removeEventListener("gifteeng:invalidate", onRealtime);
    };
  }, [load, refreshBalance]);

  const signOut = useCallback(() => {
    localStorage.removeItem("gifteeng.b2c.token");
    setUser(null); setCoinBalance(null); setPendingCoins(0);
    window.dispatchEvent(new Event("b2c-auth-change"));
  }, []);

  return { user, coinBalance, pendingCoins, signOut };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPhone(raw: string | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;
  if (local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  return `+${digits}`;
}

function initials(u: B2cUser): string {
  if (u.name) return u.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  if (u.email) return u.email[0].toUpperCase();
  return "U";
}

// ── Theme toggle row ──────────────────────────────────────────────────────────

const THEMES: { id: ThemeMode; icon: React.ReactNode; label: string }[] = [
  { id: "light",  icon: <Sun  className="w-4 h-4" />, label: "Light"  },
  { id: "dark",   icon: <Moon className="w-4 h-4" />, label: "Dark"   },
  { id: "system", icon: <Monitor className="w-4 h-4" />, label: "Auto" },
];

// Compact desktop theme toggle — always visible in the navbar for guests + users
function DesktopThemeToggle() {
  const { theme, setTheme } = useTheme();
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[2]!;
  // Cycle on click: light → dark → system → light
  const cycle = () => {
    const idx = THEMES.findIndex((t) => t.id === theme);
    const next = THEMES[(idx + 1) % THEMES.length]!;
    setTheme(next.id);
  };
  return (
    <button
      onClick={cycle}
      title={`Theme: ${current.label} (click to change)`}
      aria-label={`Current theme: ${current.label}. Click to change.`}
      className="w-9 h-9 rounded-full border border-border/60 bg-card/60 hover:bg-card hover:border-border text-foreground/80 hover:text-foreground flex items-center justify-center transition-colors"
    >
      {current.icon}
    </button>
  );
}

function ThemeRow() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl">
      {THEMES.map(t => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          title={t.label}
          className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-lg text-[10px] font-semibold transition-all duration-200 ${
            theme === t.id
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-card/60"
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Shared menu items list ────────────────────────────────────────────────────

const MENU_ITEMS = [
  { icon: User,       label: "Your Profile",     path: "/b2c/account"   },
  { icon: Package,    label: "My Orders",         path: "/b2c/orders"    },
  { icon: Heart,      label: "Wishlist",          path: "/b2c/wishlist"  },
  { icon: FileText,   label: "Terms & Policies",  path: "/b2c/terms"     },
  { icon: HelpCircle, label: "Help & Support",    path: "/b2c/help"      },
] as const;

// ── Profile bottom sheet (mobile) ─────────────────────────────────────────────
// Full-screen overlay + slide-up drawer — easy large tap targets on phones.

function ProfileSheet({ user, coinBalance, signOut, onClose }: {
  user: B2cUser;
  coinBalance: number | null;
  signOut: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const go = (path: string) => { onClose(); router.push(path); };

  const displayName = user.name || user.email?.split("@")[0] || fmtPhone(user.phone) || "My Account";
  const subtitle    = user.email || user.phone || "";

  return (
    <div className="fixed inset-0 z-[300] flex flex-col justify-end" onPointerDown={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Sheet — capped at 85 vh so it never overflows above the top of the screen */}
      <div
        className="relative bg-card rounded-t-3xl shadow-2xl overflow-y-auto"
        style={{ maxHeight: "85dvh", animation: "sheet-up 0.22s cubic-bezier(0.32,0.72,0,1) both" }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>

        {/* User header */}
        <div className="flex items-center gap-4 px-5 py-4 border-b border-border/30">
          <div className="w-12 h-12 rounded-full bg-[#EF3752] flex items-center justify-center text-white font-bold text-base shrink-0 shadow-sm">
            {initials(user)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{displayName}</p>
            {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
            {coinBalance !== null && (
              <p className="text-xs text-amber-600 font-semibold mt-0.5">🪙 {coinBalance} Goins</p>
            )}
          </div>
        </div>

        {/* Theme switcher — big buttons */}
        <div className="px-4 py-4 border-b border-border/30">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Appearance</p>
          <BigThemeRow />
        </div>

        {/* Nav items */}
        <div className="py-2">
          {MENU_ITEMS.map(({ icon: Icon, label, path }) => (
            <button
              key={path}
              onPointerUp={() => go(path)}
              className="w-full flex items-center gap-4 px-5 py-4 text-base text-foreground/80 active:bg-muted/60 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "hsl(var(--muted))" }}>
                <Icon className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* Log out */}
        <div className="border-t border-border/30 px-4 py-4" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
          <button
            onPointerUp={() => { signOut(); onClose(); router.push("/"); }}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-base font-semibold text-destructive active:bg-destructive/10 transition-colors"
            style={{ background: "hsl(var(--destructive) / 0.06)" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-destructive/10">
              <LogOut className="w-5 h-5 text-destructive" />
            </div>
            Log out
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sheet-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Big theme buttons for the sheet (44px+ tap targets)
function BigThemeRow() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex gap-2">
      {THEMES.map(t => (
        <button
          key={t.id}
          onPointerUp={() => setTheme(t.id)}
          className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-2xl text-sm font-semibold transition-all border-2 ${
            theme === t.id
              ? "border-primary bg-primary/8 text-primary shadow-sm"
              : "border-border/40 bg-muted/40 text-muted-foreground"
          }`}
          style={theme === t.id ? { borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.08)" } : {}}
        >
          <span className="w-6 h-6 flex items-center justify-center">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Profile dropdown (desktop only) ──────────────────────────────────────────

function ProfileDropdown({ user, coinBalance, signOut, onClose, align = "right" }: {
  user: B2cUser;
  coinBalance: number | null;
  signOut: () => void;
  onClose: () => void;
  align?: "left" | "right";
}) {
  const router = useRouter();
  const go = (path: string) => { onClose(); router.push(path); };
  const displayName = user.name || user.email?.split("@")[0] || fmtPhone(user.phone) || "My Account";
  const subtitle    = user.email || user.phone || "";

  return (
    <div
      className={`absolute ${align === "left" ? "left-0" : "right-0"} top-[calc(100%+10px)] w-72 rounded-2xl border border-border/40 bg-card shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18)] overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2 duration-150`}
    >
      {/* User header */}
      <div className="px-4 py-3.5 border-b border-border/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#EF3752] flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
            {initials(user)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
            {coinBalance !== null && (
              <p className="text-[10px] text-amber-600 font-semibold mt-0.5">🪙 {coinBalance} Goins</p>
            )}
          </div>
        </div>
      </div>

      {/* Theme switcher */}
      <div className="px-3 py-2.5 border-b border-border/30">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Appearance</p>
        <ThemeRow />
      </div>

      {/* Nav items */}
      <div className="py-1.5">
        {MENU_ITEMS.slice(0, 2).map(({ icon: Icon, label, path }) => (
          <button key={path} onClick={() => go(path)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors text-left">
            <Icon className="w-4 h-4 text-muted-foreground" /> {label}
          </button>
        ))}
      </div>

      <div className="border-t border-border/30 py-1.5">
        {MENU_ITEMS.slice(2).map(({ icon: Icon, label, path }) => (
          <button key={path} onClick={() => go(path)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors text-left">
            <Icon className="w-4 h-4 text-muted-foreground" /> {label}
          </button>
        ))}
      </div>

      {/* Sign out */}
      <div className="border-t border-border/30 py-1.5">
        <button
          onClick={() => { signOut(); onClose(); router.push("/"); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </div>
  );
}

// ── Nav data ──────────────────────────────────────────────────────────────────

interface NavItem { label: string; path: string; highlight?: boolean; }
const DEFAULT_LINKS: NavItem[] = [
  { label: "Corporate", path: "/b2c/corporate", highlight: true },
];

interface CategoryItem { label: string; href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; }
const DEFAULT_CATEGORIES: CategoryItem[] = [
  { label: "Personalized Gifts",     href: "/b2c/products?category=Personalized%20Gifts",        icon: Palette,   color: "#ec4899" },
  { label: "Home Decor",             href: "/b2c/products?category=Home%20Decor",                 icon: Home,      color: "#f59e0b" },
  { label: "Desk & Daily Use",       href: "/b2c/products?category=Desk%20%26%20Daily%20Use",     icon: Briefcase, color: "#6366f1" },
  { label: "Car Accessories",        href: "/b2c/products?category=Car%20Accessories",            icon: Car,       color: "#14b8a6" },
  { label: "Fashion & Accessories",  href: "/b2c/products?category=Fashion%20%26%20Accessories",  icon: Shirt,     color: "#f43f5e" },
  { label: "Corporate Gifts",        href: "/b2c/products?category=Corporate%20Gifts",            icon: Gift,      color: "#8b5cf6" },
];
const DEFAULT_SHOPBY: CategoryItem[] = [
  { label: "By Occasion",    href: "/b2c/collections/occasion",    icon: CalendarHeart, color: "#ec4899" },
  { label: "By Recipient",   href: "/b2c/collections/recipient",   icon: User,          color: "#f59e0b" },
  { label: "By Price",       href: "/b2c/collections/price",       icon: Wallet,        color: "#10b981" },
  { label: "Bestsellers",    href: "/b2c/collections/bestsellers", icon: Trophy,        color: "#f59e0b" },
];

// ── Navbar ────────────────────────────────────────────────────────────────────

// ── DB category shape ────────────────────────────────────────────────────
interface DbCategory {
  id: string;
  name: string;
  image?: string | null;
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
}
interface CategoryNode {
  name: string;
  href: string;
  children: { name: string; href: string }[];
  // Optional icon + colour from the static mapping for parents whose names
  // match the legacy CategoryItem list. Falls back to defaults in render.
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
}

function buildCategoryTree(rows: DbCategory[]): CategoryNode[] {
  const byId = new Map<string, DbCategory>();
  for (const r of rows) if (r.is_active !== false) byId.set(r.id, r);
  const parents = Array.from(byId.values()).filter((c) => !c.parent_id);
  parents.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  // Map parent.name (lowercased) → icon/color from static list if available.
  const iconMap = new Map(DEFAULT_CATEGORIES.map((d) => [d.label.toLowerCase(), d]));
  return parents.map((p) => {
    const hit = iconMap.get(p.name.toLowerCase());
    const children = Array.from(byId.values())
      .filter((c) => c.parent_id === p.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((c) => ({
        name: c.name,
        href: `/b2c/products?category=${encodeURIComponent(c.name)}`,
      }));
    return {
      name: p.name,
      href: `/b2c/products?category=${encodeURIComponent(p.name)}`,
      children,
      icon: hit?.icon,
      color: hit?.color,
    };
  });
}

export function Navbar() {
  // ── Collection types ─────────────────────────────────────────────────────
  interface NavCollection { id: string; name?: string; title?: string; slug: string; description?: string; }

  const [scrolled, setScrolled]       = useState(false);
  const [shopByOpen, setShopByOpen]   = useState(false);
  const [catOpen, setCatOpen]         = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [catTree, setCatTree]         = useState<CategoryNode[]>([]);
  const [hoveredParent, setHoveredParent] = useState<string | null>(null);
  const [collections, setCollections] = useState<NavCollection[]>([]);

  const shopByRef  = useRef<HTMLDivElement>(null);
  const catRef     = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const router   = useRouter();
  const pathname = usePathname() || "/";
  const items    = useCartStore(s => s.items);
  const totalItems = useMemo(() => items.reduce((s, i) => s + (i.quantity || 0), 0), [items]);
  const { user, coinBalance, pendingCoins, signOut } = useAuth();

  const displayName = user?.name || user?.email?.split("@")[0] || fmtPhone(user?.phone) || "";

  // Scroll detection
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  // Category tree — pulled from /api/categories (DB is source of truth).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const r = await fetch(`${base}/api/categories?pageSize=500`);
        if (!r.ok) return;
        const rows = (await r.json()) as DbCategory[] | { items?: DbCategory[] };
        const list = Array.isArray(rows) ? rows : (rows.items ?? []);
        if (!cancelled) setCatTree(buildCategoryTree(list));
      } catch { /* ignore — fall back to DEFAULT_CATEGORIES in the JSX */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Collections — for the "Collections" nav dropdown.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const r = await fetch(`${base}/api/collections`);
        if (!r.ok) return;
        const raw = (await r.json()) as NavCollection[] | { items?: NavCollection[] };
        const list = Array.isArray(raw) ? raw : (raw.items ?? []);
        if (!cancelled) setCollections(list.slice(0, 16)); // cap at 16 in menu
      } catch { /* use DEFAULT_SHOPBY fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (shopByRef.current  && !shopByRef.current.contains(e.target as Node))  setShopByOpen(false);
      if (catRef.current     && !catRef.current.contains(e.target as Node))     setCatOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const regularLinks   = DEFAULT_LINKS.filter(l => !l.highlight);
  const highlightLinks = DEFAULT_LINKS.filter(l => l.highlight);

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Pink announcement bar — very top */}
      <AnnouncementBar />
      <nav className={`transition-all duration-500 ${
        scrolled
          ? "bg-card/90 backdrop-blur-2xl shadow-[0_1px_3px_0_hsl(0,0%,0%/0.04),0_4px_20px_-4px_hsl(0,0%,0%/0.06)] border-b border-border/40"
          : "bg-card/70 backdrop-blur-xl"
      }`}>

        {/* ── Mobile header ── */}
        <div className="md:hidden container mx-auto px-3 flex items-center justify-between h-14">
          {/* Left: coins chip (profile accessible via bottom nav ME tab) */}
          <div className="flex items-center gap-1">
            {user && coinBalance !== null && (
              <Link
                href="/b2c/account?tab=goins"
                data-nav-coin-chip
                title={
                  pendingCoins > 0
                    ? `${coinBalance} available · ${pendingCoins} pending (unlock on delivery)`
                    : `${coinBalance} Gifteeng Goins`
                }
                className="relative flex items-center gap-1.5 bg-amber-400/20 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 px-2.5 py-1.5 rounded-xl text-[12px] font-black border border-amber-400/50 dark:border-amber-700 shadow-sm transition-all hover:scale-[1.04] hover:bg-amber-400/30 active:scale-95"
              >
                <span className="text-sm leading-none">🪙</span>
                <span className="tabular-nums">
                  {coinBalance}
                  {pendingCoins > 0 && (
                    <span className="ml-1 text-[10px] font-bold text-amber-500/80">+{pendingCoins}</span>
                  )}
                </span>
              </Link>
            )}
            {!user && (
              <Link href="/auth" className="text-[12px] font-semibold text-foreground/80 hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/5">
                Login
              </Link>
            )}
          </div>

          {/* Center: logo */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-8" />
          </Link>

          {/* Right: cart */}
          <Link href="/b2c/cart" className="p-2 rounded-xl hover:bg-accent transition-all relative">
            <ShoppingCart className="w-5 h-5 text-foreground" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-primary text-primary-foreground text-[9px] rounded-full flex items-center justify-center font-bold shadow-sm shadow-primary/30 animate-scale-in">
                {totalItems}
              </span>
            )}
          </Link>
        </div>

        {/* ── Desktop header ── */}
        <div className="hidden md:block">
          <div className="container mx-auto px-4 flex items-center justify-between h-16">

            {/* Left nav */}
            <div className="flex items-center gap-7">
              {regularLinks.map(link => (
                <Link
                  key={link.label}
                  href={link.path}
                  className={`text-[13px] font-medium transition-all duration-200 relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-primary after:rounded-full after:transition-transform after:duration-300 after:origin-left ${
                    pathname === link.path
                      ? "text-primary after:scale-x-100"
                      : "text-foreground/80 hover:text-foreground after:scale-x-0 hover:after:scale-x-100"
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {/* Categories */}
              <div ref={catRef} className="relative">
                <button
                  onClick={() => { setCatOpen(p => !p); setShopByOpen(false); }}
                  className={`text-[13px] font-medium flex items-center gap-1 transition-colors ${
                    catOpen || pathname === "/products" ? "text-primary" : "text-foreground/80 hover:text-foreground"
                  }`}
                >
                  Categories
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${catOpen ? "rotate-180" : ""}`} />
                </button>
                {catOpen && (() => {
                  // Prefer real DB categories; fall back to the static list so
                  // the menu works even on first render before the fetch lands.
                  const source: CategoryNode[] = catTree.length > 0
                    ? catTree
                    : DEFAULT_CATEGORIES.map((d) => ({
                        name: d.label, href: d.href, children: [], icon: d.icon, color: d.color,
                      }));
                  return (
                    <div className="absolute top-full left-0 mt-2 bg-card border border-border/30 rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18)] p-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-150 flex items-start"
                      onMouseLeave={() => setHoveredParent(null)}
                    >
                      {/* ── Parents column — capped height so it never fills screen ── */}
                      <div className="w-52 flex flex-col">
                        <p className="px-3 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/50 shrink-0">Shop by Category</p>
                        <div className="overflow-y-auto max-h-[min(62vh,480px)] scrollbar-hide">
                        {source.map((cat) => {
                          const Icon = cat.icon;
                          const hasChildren = cat.children.length > 0;
                          const isHovered = hoveredParent === cat.name;
                          return (
                            <div
                              key={cat.name}
                              onMouseEnter={() => setHoveredParent(cat.name)}
                              className="relative"
                            >
                              <Link
                                href={cat.href}
                                onClick={() => { setCatOpen(false); setHoveredParent(null); }}
                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all duration-150 group ${
                                  isHovered ? "bg-primary/8 text-primary" : "hover:bg-muted/60"
                                }`}
                              >
                                {Icon ? (
                                  <span
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-all duration-150"
                                    style={{ background: `${cat.color ?? "#ec4899"}18` }}
                                  >
                                    <Icon className="w-3 h-3" style={{ color: cat.color ?? "#ec4899" }} />
                                  </span>
                                ) : (
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted">
                                    <Gift className="w-3 h-3 text-muted-foreground/60" />
                                  </span>
                                )}
                                <span className={`text-[12.5px] font-medium transition-colors flex-1 truncate ${isHovered ? "text-primary" : "text-foreground/80 group-hover:text-foreground"}`}>
                                  {cat.name}
                                </span>
                                {hasChildren && (
                                  <ChevronRight className={`w-3 h-3 shrink-0 transition-colors ${isHovered ? "text-primary" : "text-muted-foreground/30 group-hover:text-muted-foreground/60"}`} />
                                )}
                              </Link>
                            </div>
                          );
                        })}
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-border/30 shrink-0">
                          <Link
                            href="/b2c/products"
                            onClick={() => { setCatOpen(false); setHoveredParent(null); }}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-primary transition-all hover:bg-muted/60"
                          >
                            View all products →
                          </Link>
                        </div>
                      </div>

                      {/* ── Subcategories pane — slides in to the right on hover ── */}
                      {(() => {
                        const active = source.find((c) => c.name === hoveredParent && c.children.length > 0);
                        if (!active) return null;
                        return (
                          <div className="w-52 border-l border-border/30 pl-2 ml-1 overflow-y-auto max-h-[min(62vh,480px)] scrollbar-hide">
                            <p className="px-3 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/50 truncate">
                              {active.name}
                            </p>
                            {active.children.map((ch) => (
                              <Link
                                key={ch.name}
                                href={ch.href}
                                onClick={() => { setCatOpen(false); setHoveredParent(null); }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-muted/60 transition-colors group"
                              >
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active.color ?? "#ec4899" }} />
                                <span className="text-[12px] text-foreground/80 group-hover:text-foreground truncate">
                                  {ch.name}
                                </span>
                              </Link>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>

              {/* Collections */}
              <div ref={shopByRef} className="relative">
                <button
                  onClick={() => { setShopByOpen(p => !p); setCatOpen(false); }}
                  className={`text-[13px] font-medium flex items-center gap-1 transition-colors ${
                    shopByOpen || pathname.startsWith("/b2c/collections") ? "text-primary" : "text-foreground/80 hover:text-foreground"
                  }`}
                >
                  Collections
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${shopByOpen ? "rotate-180" : ""}`} />
                </button>
                {shopByOpen && (() => {
                  // Prefer live collections; fall back to static DEFAULT_SHOPBY
                  const liveItems = collections.map((c) => {
                    const name = c.title ?? c.name ?? c.slug;
                    const slug = c.slug ?? name.toLowerCase().replace(/\s+/g, "-");
                    return { label: name, href: `/b2c/collections/${encodeURIComponent(slug)}` };
                  });
                  const menuItems = liveItems.length > 0
                    ? liveItems
                    : DEFAULT_SHOPBY.map((c) => ({ label: c.label, href: c.href }));
                  return (
                    <div className="absolute top-full left-0 mt-2 w-52 bg-card border border-border/30 rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18)] p-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-150 max-h-[70vh] overflow-y-auto">
                      <p className="px-3 pt-1 pb-2 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/50">Collections</p>
                      {menuItems.map((c) => (
                        <Link
                          key={c.href} href={c.href}
                          onClick={() => setShopByOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-150 group hover:bg-muted/60"
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-primary/40" />
                          <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors truncate">
                            {c.label}
                          </span>
                        </Link>
                      ))}
                      <div className="mt-1 pt-1 border-t border-border/30">
                        <Link
                          href="/b2c/collections"
                          onClick={() => setShopByOpen(false)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-primary hover:bg-muted/60 transition-all"
                        >
                          View all collections →
                        </Link>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {highlightLinks.map(link => (
                <Link
                  key={link.label} href={link.path}
                  className="text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Center: logo */}
            <Link href="/" className="absolute left-1/2 -translate-x-1/2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-9 transition-transform hover:scale-105" />
            </Link>

            {/* Right: theme + coins + profile + cart */}
            <div className="flex items-center gap-2">
              <DesktopThemeToggle />

              {user && coinBalance !== null && (
                <Link
                  href="/b2c/account?tab=goins"
                  data-nav-coin-chip
                  title={
                    pendingCoins > 0
                      ? `${coinBalance} available · ${pendingCoins} pending (unlock on delivery)`
                      : "Your Gifteeng Goins"
                  }
                  className="relative flex items-center gap-1 bg-amber-500/10 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-amber-500/20 transition-all border border-amber-500/20"
                >
                  🪙 {coinBalance}
                  {pendingCoins > 0 && (
                    <span
                      className="ml-1 text-[10px] font-bold text-amber-600/80 tabular-nums"
                      aria-label={`${pendingCoins} pending`}
                    >
                      +{pendingCoins}
                    </span>
                  )}
                </Link>
              )}

              {user ? (
                /* ── Profile icon → account page ── */
                <Link
                  href="/b2c/account"
                  className="p-2 rounded-xl hover:bg-accent transition-all flex items-center justify-center"
                  aria-label="My Account"
                >
                  <User className="w-5 h-5 text-foreground/80 hover:text-foreground transition-colors" />
                </Link>
              ) : (
                <Link
                  href="/auth"
                  className="text-[13px] font-medium text-foreground/80 hover:text-foreground transition-colors px-3 py-1.5 rounded-xl hover:bg-muted"
                >
                  Login / Register
                </Link>
              )}

              {/* Cart */}
              <Link href="/b2c/cart" className="p-2.5 rounded-xl hover:bg-accent transition-all relative group">
                <ShoppingCart className="w-5 h-5 text-foreground/80 group-hover:text-foreground transition-colors" />
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-primary text-primary-foreground text-[9px] rounded-full flex items-center justify-center font-bold shadow-sm shadow-primary/30">
                    {totalItems}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ProfileSheet lives OUTSIDE <nav> so backdrop-filter cannot trap its fixed positioning.
          It still works because position:fixed ignores parent layout — but backdrop-filter on
          an ancestor breaks that rule, causing the sheet to clip to the nav's bounds on iOS/Chrome. */}
      {profileOpen && user && (
        <ProfileSheet
          user={user}
          coinBalance={coinBalance}
          signOut={signOut}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}

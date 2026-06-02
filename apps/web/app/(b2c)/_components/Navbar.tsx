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
  CalendarHeart, Trophy, Wallet, Star, Heart, Search, Menu,
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
  { icon: User,       label: "Your Profile",     path: "/account"   },
  { icon: Package,    label: "My Orders",         path: "/orders"    },
  { icon: Heart,      label: "Wishlist",          path: "/wishlist"  },
  { icon: FileText,   label: "Terms & Policies",  path: "/terms"     },
  { icon: HelpCircle, label: "Help & Support",    path: "/help"      },
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
// Corporate offering discontinued — the "Corporate" promo link was removed.
const DEFAULT_LINKS: NavItem[] = [];

interface CategoryItem { label: string; href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string; }
const DEFAULT_CATEGORIES: CategoryItem[] = [
  { label: "Personalized Gifts",     href: "/products?category=Personalized%20Gifts",        icon: Palette,   color: "#ec4899" },
  { label: "Home Decor",             href: "/products?category=Home%20Decor",                 icon: Home,      color: "#f59e0b" },
  { label: "Desk & Daily Use",       href: "/products?category=Desk%20%26%20Daily%20Use",     icon: Briefcase, color: "#6366f1" },
  { label: "Car Accessories",        href: "/products?category=Car%20Accessories",            icon: Car,       color: "#14b8a6" },
  { label: "Fashion & Accessories",  href: "/products?category=Fashion%20%26%20Accessories",  icon: Shirt,     color: "#f43f5e" },
];
const DEFAULT_SHOPBY: CategoryItem[] = [
  { label: "By Occasion",    href: "/collections/occasion",    icon: CalendarHeart, color: "#ec4899" },
  { label: "By Recipient",   href: "/collections/recipient",   icon: User,          color: "#f59e0b" },
  { label: "By Price",       href: "/collections/price",       icon: Wallet,        color: "#10b981" },
  { label: "Bestsellers",    href: "/collections/bestsellers", icon: Trophy,        color: "#f59e0b" },
];

// ── Nav search bar (desktop) — animated cycling hint ─────────────────────────
const NAV_FALLBACK_HINTS = [
  "Birthday gifts for dad", "Gifts under ₹500", "Valentine gift ideas",
  "Anniversary gifts", "Personalized photo frames", "Corporate gifts",
  "Return gifts", "Wedding gifts", "Name plates for home",
];

function NavSearchBar() {
  const [q, setQ] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [hints, setHints] = useState<string[]>(NAV_FALLBACK_HINTS);
  const [hintIdx, setHintIdx] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const router = useRouter();

  // Fetch live trending terms from API
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/products?sort=popular&pageSize=10", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json() as { items?: Array<{ title?: string; category?: string }> };
        const items = d.items ?? [];
        const phrases = new Set<string>();
        for (const p of items) {
          if (p.title) {
            const cleaned = p.title.replace(/^gifteeng\s+/i, "").split(/[\-–—|,.()]/)[0].trim().split(/\s+/).slice(0, 4).join(" ");
            if (cleaned && cleaned.length >= 5) phrases.add(cleaned);
          }
          if (p.category) phrases.add(p.category);
        }
        const result = Array.from(phrases).slice(0, 12);
        if (result.length >= 3) setHints(result);
      } catch { /* keep fallback */ }
    })();
  }, []);

  // Cycle hint every 2.5s with fade transition
  useEffect(() => {
    if (!hints.length) return;
    const id = setInterval(() => {
      setHintVisible(false);
      const t = setTimeout(() => { setHintIdx(i => (i + 1) % hints.length); setHintVisible(true); }, 220);
      return () => clearTimeout(t);
    }, 2500);
    return () => clearInterval(id);
  }, [hints]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <form onSubmit={submit} className="relative w-full">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={isFocused ? "Search for gifts, occasions or categories…" : ""}
        className="w-full h-10 rounded-full border border-border/60 bg-background/60 pl-10 pr-12 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-card transition-all"
      />
      {/* Animated cycling hint — hidden when focused or typing */}
      {!q && !isFocused && (
        <span
          aria-hidden
          className="absolute left-10 right-12 top-1/2 -translate-y-1/2 pointer-events-none select-none
                     text-sm text-muted-foreground/50 truncate transition-opacity duration-200"
          style={{ opacity: hintVisible ? 1 : 0 }}
        >
          Search for&nbsp;
          <span className="font-medium text-muted-foreground/70">
            {hints[hintIdx] ?? "personalized gifts"}
          </span>
          …
        </span>
      )}
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label="Search"
      >
        <Search className="w-3.5 h-3.5 text-primary-foreground" />
      </button>
    </form>
  );
}

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
        href: `/products?category=${encodeURIComponent(c.name)}`,
      }));
    return {
      name: p.name,
      href: `/products?category=${encodeURIComponent(p.name)}`,
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
                href="/account?tab=goins"
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
            <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-8 dark:[filter:brightness(0)_invert(1)]" />
          </Link>

          {/* Right: cart */}
          <Link href="/cart" className="p-2 rounded-xl hover:bg-accent transition-all relative">
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
          <div className="container mx-auto px-4 flex items-center gap-4 h-16">

            {/* LEFT: Logo + tagline */}
            <Link href="/" className="flex items-center gap-2 shrink-0 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-8 transition-transform group-hover:scale-105 dark:[filter:brightness(0)_invert(1)_opacity(0.9)]" />
              <span className="hidden lg:block text-[9px] text-muted-foreground/60 italic leading-tight max-w-[90px]">
                Make Every Gift Personal
              </span>
            </Link>

            {/* CENTER: Search bar */}
            <div className="flex-1 max-w-2xl mx-auto">
              <NavSearchBar />
            </div>

            {/* RIGHT: theme + coins + wishlist + login/account + cart */}
            <div className="flex items-center gap-1 shrink-0">
              <DesktopThemeToggle />

              {user && coinBalance !== null && (
                <Link
                  href="/account?tab=goins"
                  data-nav-coin-chip
                  title={pendingCoins > 0 ? `${coinBalance} available · ${pendingCoins} pending` : "Your Gifteeng Goins"}
                  className="flex items-center gap-1 bg-amber-500/10 text-amber-700 px-2.5 py-1.5 rounded-full text-xs font-bold hover:bg-amber-500/20 transition-all border border-amber-500/20"
                >
                  🪙 {coinBalance}
                  {pendingCoins > 0 && (
                    <span className="ml-0.5 text-[10px] font-bold text-amber-600/80">+{pendingCoins}</span>
                  )}
                </Link>
              )}

              {/* Wishlist */}
              <Link
                href="/wishlist"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-muted/60 transition-colors text-foreground/70 hover:text-foreground"
              >
                <Heart className="w-4 h-4" />
                <span className="text-[12px] font-medium hidden lg:block">Wishlist</span>
              </Link>

              {/* Login / Account */}
              {user ? (
                <Link
                  href="/account"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-muted/60 transition-colors text-foreground/70 hover:text-foreground"
                  aria-label="My Account"
                >
                  <User className="w-4 h-4" />
                  <span className="text-[12px] font-medium hidden lg:block">
                    {displayName ? displayName.split(" ")[0] : "Account"}
                  </span>
                </Link>
              ) : (
                <Link
                  href="/auth"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-muted/60 transition-colors text-foreground/70 hover:text-foreground"
                >
                  <User className="w-4 h-4" />
                  <span className="text-[12px] font-medium">Login / Sign up</span>
                </Link>
              )}

              {/* Cart */}
              <Link
                href="/cart"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-muted/60 transition-all relative text-foreground/70 hover:text-foreground"
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="text-[12px] font-medium hidden lg:block">Cart</span>
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-primary text-primary-foreground text-[9px] rounded-full flex items-center justify-center font-bold shadow-sm">
                    {totalItems}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Category nav row — desktop only, below main nav ── */}
      <div className={`hidden md:block border-b border-border/30 transition-all duration-500 ${
        scrolled ? "bg-card/90 backdrop-blur-2xl" : "bg-card/80 backdrop-blur-xl"
      }`}>
        <div className="container mx-auto px-4">
          <div
            className="flex items-center h-10 overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            {/* All Categories — opens existing dropdown */}
            <div ref={catRef} className="relative h-full flex items-center shrink-0 border-r border-border/30 pr-1 mr-1">
              <button
                onClick={() => { setCatOpen(p => !p); setShopByOpen(false); }}
                className="flex items-center gap-1.5 px-3 h-full text-[12px] font-semibold text-foreground/80 hover:text-foreground hover:bg-muted/50 transition-colors whitespace-nowrap rounded"
              >
                {/* lucide Menu — replaces a bare ☰ Unicode glyph so the
                    "All Categories" trigger matches the app's icon set. */}
                <Menu className="w-3.5 h-3.5" />
                All Categories
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${catOpen ? "rotate-180" : ""}`} />
              </button>
              {catOpen && (() => {
                const source: CategoryNode[] = catTree.length > 0
                  ? catTree
                  : DEFAULT_CATEGORIES.map((d) => ({ name: d.label, href: d.href, children: [], icon: d.icon, color: d.color }));
                return (
                  <div
                    className="absolute top-[calc(100%+2px)] left-0 bg-card border border-border/30 rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18)] p-2 z-[60] animate-in fade-in slide-in-from-top-2 duration-150 flex items-start"
                    onMouseLeave={() => setHoveredParent(null)}
                  >
                    <div className="w-52 flex flex-col">
                      <p className="px-3 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/50 shrink-0">Shop by Category</p>
                      <div className="overflow-y-auto max-h-[min(62vh,480px)] scrollbar-hide">
                        {source.map((cat) => {
                          const Icon = cat.icon;
                          const hasChildren = cat.children.length > 0;
                          const isHovered = hoveredParent === cat.name;
                          return (
                            <div key={cat.name} onMouseEnter={() => setHoveredParent(cat.name)} className="relative">
                              <Link
                                href={cat.href}
                                onClick={() => { setCatOpen(false); setHoveredParent(null); }}
                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all duration-150 group ${isHovered ? "bg-primary/8 text-primary" : "hover:bg-muted/60"}`}
                              >
                                {Icon ? (
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg" style={{ background: `${cat.color ?? "#ec4899"}18` }}>
                                    <Icon className="w-3 h-3" style={{ color: cat.color ?? "#ec4899" }} />
                                  </span>
                                ) : (
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted">
                                    <Gift className="w-3 h-3 text-muted-foreground/60" />
                                  </span>
                                )}
                                <span className={`text-[12.5px] font-medium flex-1 truncate ${isHovered ? "text-primary" : "text-foreground/80 group-hover:text-foreground"}`}>
                                  {cat.name}
                                </span>
                                {hasChildren && <ChevronRight className={`w-3 h-3 shrink-0 ${isHovered ? "text-primary" : "text-muted-foreground/30"}`} />}
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-border/30 shrink-0">
                        <Link href="/products" onClick={() => { setCatOpen(false); setHoveredParent(null); }}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-primary hover:bg-muted/60">
                          View all products →
                        </Link>
                      </div>
                    </div>
                    {(() => {
                      const active = source.find((c) => c.name === hoveredParent && c.children.length > 0);
                      if (!active) return null;
                      return (
                        <div className="w-52 border-l border-border/30 pl-2 ml-1 overflow-y-auto max-h-[min(62vh,480px)] scrollbar-hide">
                          <p className="px-3 pt-1 pb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/50 truncate">{active.name}</p>
                          {active.children.map((ch) => (
                            <Link key={ch.name} href={ch.href} onClick={() => { setCatOpen(false); setHoveredParent(null); }}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-muted/60 transition-colors group">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active.color ?? "#ec4899" }} />
                              <span className="text-[12px] text-foreground/80 group-hover:text-foreground truncate">{ch.name}</span>
                            </Link>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>

            {/* Hardcoded nav links */}
            {([
              { label: "Bestsellers",        href: "/products?sort=popular" },
              { label: "Personalized Gifts", href: "/products?category=Personalized+Gifts" },
              { label: "Occasions",          href: "/collections/occasion" },
              { label: "By Recipient",       href: "/collections/recipient", dropdown: true },
              { label: "Home Decor",         href: "/products?category=Home+Decor" },
              { label: "New Arrivals",       href: "/products?sort=newest" },
            ] as const).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-0.5 px-3 h-full text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  pathname?.startsWith(item.href)
                    ? "text-primary font-semibold border-primary"
                    : "border-transparent text-foreground/70 hover:text-foreground hover:bg-muted/40"
                }`}
              >
                {item.label}
                {"dropdown" in item && item.dropdown && <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />}
              </Link>
            ))}

            {/* Right-side filler — keeps category items left-aligned without
                the previous "Deals of the Day" pill (removed per design). */}
            <div className="flex-1" />
          </div>
        </div>
      </div>

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

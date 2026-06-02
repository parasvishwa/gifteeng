"use client";

// ─── Bottom nav — matches mobile shell_screen.dart ────────────────────────────
//
// Layout: HOME · SHOP · [REWARDS hero ↑] · CART · ME
// The center button floats 14px above the bar (same as Flutter's top: -14).
// Active color: #EF3752 (brand red).  Inactive: muted-foreground.
// Labels are ALL-CAPS 9px Inter 700/500 — identical to mobile.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Store, ShoppingBag, User, ChevronRight,
} from "lucide-react";
import { useCartStore } from "@/lib/stores/cart";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@gifteeng/ui";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CategoryItem  { id: string; name: string; parent_id: string | null; }
interface CollectionItem { id: string; name: string; description: string; }

const categoryEmojis: Record<string, string> = {
  "Personalized Gifts":     "🎯",
  "Home Decor":             "🏡",
  "Desk & Daily Use":       "🖥️",
  "Car Accessories":        "🚗",
  "Fashion & Accessories":  "👕",
  "Kids Zone":              "🧸",
  "Business & Office":      "🏢",
  "Fridge Magnets":         "🧲",
  "Return Gifts":           "🎁",
  "Others":                 "📦",
};

const collectionGroupEmojis: Record<string, string> = {
  "By Relation":   "❤️",
  "By Occasion":   "🎉",
  "By Theme":      "🎨",
  "By Profession": "👨‍⚕️",
  "By Use Case":   "🛍️",
};

async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");
    const res = await fetch(`${base}/api${path}`);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// ── Regular tab ───────────────────────────────────────────────────────────────
function RegularTab({
  icon: Icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-[3px] h-full relative group active:scale-90 transition-transform duration-100"
    >
      <div className="relative">
        <Icon
          className="transition-colors duration-200"
          style={{
            width: 22, height: 22,
            color: active ? "#EF3752" : "hsl(var(--muted-foreground))",
            strokeWidth: active ? 2.4 : 1.8,
          }}
        />
        {badge != null && badge > 0 && (
          <span
            className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 bg-[#EF4444] text-white text-[9px] rounded-full flex items-center justify-center font-bold px-[3px] border-2 border-card"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      <span
        className="text-[9px] tracking-[0.08em] transition-colors duration-200"
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontWeight: active ? 700 : 500,
          color: active ? "#EF3752" : "hsl(var(--muted-foreground))",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ── Hero tab — REWARDS ────────────────────────────────────────────────────────
function HeroTab({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center relative">
      {/* The button floats 14px above the bar — mirrors Flutter's top: -14 */}
      <button
        onClick={onClick}
        className="absolute flex flex-col items-center gap-0.5 active:scale-90 transition-transform duration-100"
        style={{ bottom: 8 }}
      >
        {/* Circular brand icon — slimmer, more integrated */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200"
          style={{
            background: active
              ? "#EF3752"
              : "hsl(var(--card))",
            border: `2px solid ${active ? "#EF3752" : "hsl(var(--border))"}`,
            boxShadow: active
              ? "0 2px 10px -2px rgba(239,55,82,0.35)"
              : "0 1px 4px -1px rgba(0,0,0,0.10)",
          }}
        >
          <span
            className="select-none font-black leading-none"
            style={{
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: 22,
              color: active ? "#fff" : "#EF3752",
              letterSpacing: "-0.04em",
            }}
          >
            g
          </span>
        </div>
        <span
          className="text-[7px] tracking-[0.06em] leading-none"
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: active ? 700 : 400,
            color: active ? "#EF3752" : "hsl(var(--muted-foreground))",
          }}
        >
          CASINO
        </span>
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const MobileBottomNav = () => {
  const pathname  = usePathname();
  const router    = useRouter();
  const totalItems = useCartStore((s) =>
    s.items.reduce((sum, i) => sum + (i.quantity || 0), 0),
  );

  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab,  setShopTab]  = useState<"categories" | "collections">("categories");
  const [categories,  setCategories]  = useState<CategoryItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  useEffect(() => {
    safeGet<CategoryItem[]>("/categories", []).then((d) =>
      setCategories(Array.isArray(d) ? d : []),
    );
    safeGet<CollectionItem[]>("/collections", []).then((d) =>
      setCollections(Array.isArray(d) ? d : []),
    );
  }, []);

  const categoryTree = useMemo(() => {
    const parents  = categories.filter((c) => !c.parent_id);
    const children = categories.filter((c) =>  c.parent_id);
    return parents.map((p) => ({
      ...p,
      subcategories: children.filter((c) => c.parent_id === p.id),
    }));
  }, [categories]);

  const collectionGroups = useMemo(() => {
    const groups: Record<string, CollectionItem[]> = {};
    collections.forEach((c) => {
      const g = c.description || "Other";
      groups[g] = [...(groups[g] ?? []), c];
    });
    return groups;
  }, [collections]);

  const navTo = (path: string) => { setShopOpen(false); router.push(path); };

  const isHome   = pathname === "/b2c" || pathname === "/";
  const isShop   = shopOpen || (!isHome && pathname.startsWith("/products"));
  const isCasino = pathname === "/play";
  const isCart   = pathname === "/cart";
  const isMe     = pathname === "/account";

  return (
    <>
      {/* ── Bar ─────────────────────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50">
        {/* Extra padding for home indicator on iOS */}
        <div
          className="border-t border-border/40 backdrop-blur-2xl"
          style={{ background: "hsl(var(--card) / 0.95)" }}
        >
          <div className="flex items-stretch" style={{ height: 58 }}>
            <RegularTab
              icon={Home}
              label="HOME"
              active={isHome}
              onClick={() => router.push("/b2c")}
            />
            <RegularTab
              icon={Store}
              label="SHOP"
              active={isShop}
              onClick={() => setShopOpen(true)}
            />

            {/* Center hero — floats above bar */}
            <HeroTab
              active={isCasino}
              onClick={() => { setShopOpen(false); router.push("/play"); }}
            />

            <RegularTab
              icon={ShoppingBag}
              label="CART"
              active={isCart}
              badge={totalItems}
              onClick={() => router.push("/cart")}
            />
            <RegularTab
              icon={User}
              label="ME"
              active={isMe}
              onClick={() => router.push("/account")}
            />
          </div>
          {/* iOS safe-area bottom padding */}
          <div className="h-safe-bottom" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
        </div>
      </div>

      {/* ── Shop sheet — tabbed: Categories | Collections ────────────── */}
      <Sheet open={shopOpen} onOpenChange={(o) => { setShopOpen(o); if (!o) setShopTab("categories"); }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] flex flex-col pb-0">
          <SheetHeader className="shrink-0 pb-0">
            <SheetTitle className="text-lg font-bold">Shop</SheetTitle>
          </SheetHeader>

          {/* Quick links — always visible, compact 2-col grid */}
          <div className="shrink-0 grid grid-cols-4 gap-2 mt-3 mb-3">
            {[
              { label: "All",       path: "/products",              emoji: "🛍️" },
              { label: "Top",       path: "/products?sort=popular", emoji: "⭐" },
              { label: "New",       path: "/products?sort=newest",  emoji: "✨" },
              { label: "Quiz",      path: "/gift-quiz",             emoji: "🎁" },
            ].map((q) => (
              <button
                key={q.label}
                onClick={() => navTo(q.path)}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-2xl bg-primary/8 text-foreground text-[11px] font-semibold hover:bg-primary/12 transition-all active:scale-95"
              >
                <span className="text-xl">{q.emoji}</span>
                {q.label}
              </button>
            ))}
          </div>

          {/* Tab switcher */}
          <div className="shrink-0 flex gap-1 p-1 rounded-xl bg-muted mb-3">
            {(["categories", "collections"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setShopTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  shopTab === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {t === "categories" ? "Categories" : "Collections"}
              </button>
            ))}
          </div>

          {/* Scrollable tab content */}
          <div className="flex-1 overflow-y-auto pb-28 min-h-0">

            {/* ── Categories tab ── */}
            {shopTab === "categories" && (
              <div className="space-y-1">
                {categoryTree.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
                ) : (
                  categoryTree.map((cat) => (
                    <div key={cat.id} className="rounded-xl overflow-hidden">
                      <button
                        onClick={() => navTo(`/products?category=${encodeURIComponent(cat.name)}`)}
                        className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-sm font-bold text-foreground hover:bg-muted/60 transition-all rounded-xl"
                      >
                        <span className="text-lg w-6 text-center">{categoryEmojis[cat.name] || "📌"}</span>
                        <span className="flex-1">{cat.name}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                      </button>
                      {cat.subcategories.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 pl-12 pb-1 pr-2">
                          {cat.subcategories.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() =>
                                navTo(`/products?category=${encodeURIComponent(sub.name)}`)
                              }
                              className="text-left text-xs py-1.5 px-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
                            >
                              {sub.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Collections tab ── */}
            {shopTab === "collections" && (
              <div className="space-y-5">
                {/* View all collections CTA */}
                <button
                  onClick={() => navTo("/collections")}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl bg-primary/8 text-primary text-sm font-bold hover:bg-primary/12 transition-all active:scale-95"
                >
                  <span>🗂️ View all collections</span>
                  <span className="text-xs opacity-70">→</span>
                </button>

                {Object.keys(collectionGroups).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
                ) : (
                  Object.entries(collectionGroups).map(([group, cols]) => (
                    <div key={group}>
                      <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5 px-1">
                        <span className="text-sm">{collectionGroupEmojis[group] || "📌"}</span>
                        {group}
                      </p>
                      <div className="grid grid-cols-2 gap-0.5">
                        {cols.map((c) => {
                          const slug = c.name.toLowerCase().replace(/\s+/g, "-");
                          return (
                            <button
                              key={c.id}
                              onClick={() => navTo(`/collections/${encodeURIComponent(slug)}`)}
                              className="text-left text-xs py-2 px-3 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all"
                            >
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default MobileBottomNav;

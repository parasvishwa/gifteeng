"use client";

// ─── Product Badges (web parity with mobile product_badges.dart) ──────────────
//
// Priority-ordered chips sitting on top of a product card (grid OR list view)
// OR at the top of the PDP info panel. Logic mirrors the mobile Flutter widget
// at apps/mobile/lib/features/shop/presentation/widgets/product_badges.dart
// so a product that shows "🔥 TRENDING" on the Android app also shows it on
// the web — no second source of truth.
//
// Supported states:
//   SOLD OUT       inventory === 0                              (top priority)
//   Only N left    inventory 1..5                               (urgency)
//   TRENDING       metadata.trending === true OR tag "trending"
//   BEST SELLER    metadata.bestseller / bestSeller OR tag
//   FEATURED       metadata.featured OR tag
//   NEW            createdAt within last 30 days
//   CUSTOMIZABLE   isCustomizable flag
//
// Caller picks `size`:
//   "card"   — compact, designed to overlay a product thumbnail
//   "detail" — larger, rendered inline on PDP
//
// Usage:
//   <ProductBadges product={product} size="card" max={2} />
//
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ReactNode } from "react";
import {
  Ban,
  AlertTriangle,
  Flame,
  Trophy,
  Star,
  Sparkles,
  Pencil,
} from "lucide-react";

export type BadgeProduct = {
  inventory?: number | null;
  isCustomizable?: boolean | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type BadgeKind =
  | "soldout"
  | "low_stock"
  | "trending"
  | "bestseller"
  | "featured"
  | "new"
  | "customizable";

type BadgeSpec = {
  kind: BadgeKind;
  icon: ReactNode;
  label: string;
  bg: string;    // background color (light card bg)
  fg: string;    // text color
  ring: string;  // subtle border
  priority: number; // lower = higher priority
};

// Icon nodes are size-agnostic; the wrapping span in the renderer controls
// the visible footprint. Lucide's `size` prop sets the SVG viewBox dimensions.
const ICON_SIZE = 12; // rendered into a fixed-size container — looks crisp at both card+detail

function buildSpec(kind: BadgeKind, inventory?: number): BadgeSpec {
  switch (kind) {
    case "soldout":
      return { kind, icon: <Ban size={ICON_SIZE} strokeWidth={2.5} />, label: "SOLD OUT", bg: "#374151", fg: "#F9FAFB", ring: "#1F2937", priority: 0 };
    case "low_stock":
      return { kind, icon: <AlertTriangle size={ICON_SIZE} strokeWidth={2.5} />, label: `Only ${inventory ?? 0} left`, bg: "#FEF2F2", fg: "#DC2626", ring: "#FCA5A5", priority: 1 };
    case "trending":
      return { kind, icon: <Flame size={ICON_SIZE} strokeWidth={2.5} />, label: "TRENDING", bg: "#FFF7ED", fg: "#C2410C", ring: "#FED7AA", priority: 2 };
    case "bestseller":
      return { kind, icon: <Trophy size={ICON_SIZE} strokeWidth={2.5} />, label: "BEST SELLER", bg: "#FEF3C7", fg: "#92400E", ring: "#FDE68A", priority: 3 };
    case "featured":
      return { kind, icon: <Star size={ICON_SIZE} strokeWidth={2.5} />, label: "FEATURED", bg: "#FEF3C7", fg: "#A16207", ring: "#FDE68A", priority: 4 };
    case "new":
      return { kind, icon: <Sparkles size={ICON_SIZE} strokeWidth={2.5} />, label: "NEW", bg: "#ECFDF5", fg: "#047857", ring: "#A7F3D0", priority: 5 };
    case "customizable":
      return { kind, icon: <Pencil size={ICON_SIZE} strokeWidth={2.5} />, label: "CUSTOMIZABLE", bg: "#F5F3FF", fg: "#6D28D9", ring: "#DDD6FE", priority: 6 };
  }
}

/**
 * Decide which badges apply to a product. Returns them pre-sorted by priority.
 */
export function computeBadges(p: BadgeProduct): BadgeSpec[] {
  const result: BadgeSpec[] = [];
  const meta = (p.metadata ?? {}) as Record<string, unknown>;
  const rawTags = meta.tags;
  const tagSet = new Set<string>();
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (typeof t === "string") tagSet.add(t.toLowerCase());
    }
  }

  // 1. Stock first — trumps everything visual
  if (p.inventory === 0) {
    result.push(buildSpec("soldout"));
    return result.sort((a, b) => a.priority - b.priority);
  }
  if (typeof p.inventory === "number" && p.inventory > 0 && p.inventory <= 5) {
    result.push(buildSpec("low_stock", p.inventory));
  }

  // 2. Promo / social proof
  if (meta.trending === true || tagSet.has("trending")) {
    result.push(buildSpec("trending"));
  }
  if (meta.bestseller === true || meta.bestSeller === true || tagSet.has("bestseller") || tagSet.has("best-seller")) {
    result.push(buildSpec("bestseller"));
  }
  if (meta.featured === true || tagSet.has("featured")) {
    result.push(buildSpec("featured"));
  }

  // 3. New arrival: createdAt within 30 days
  if (p.createdAt) {
    const t = Date.parse(p.createdAt);
    if (Number.isFinite(t)) {
      const ageDays = (Date.now() - t) / 86_400_000;
      if (ageDays >= 0 && ageDays <= 30) {
        result.push(buildSpec("new"));
      }
    }
  }

  // 4. Customizable
  if (p.isCustomizable) {
    result.push(buildSpec("customizable"));
  }

  return result.sort((a, b) => a.priority - b.priority);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function chipStyle(spec: BadgeSpec, size: "card" | "detail"): CSSProperties {
  const fontSize = size === "card" ? 9 : 11;
  const paddingY = size === "card" ? 2 : 4;
  const paddingX = size === "card" ? 6 : 9;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: size === "card" ? 3 : 5,
    background: spec.bg,
    color: spec.fg,
    border: `1px solid ${spec.ring}`,
    borderRadius: 999,
    padding: `${paddingY}px ${paddingX}px`,
    fontSize,
    fontWeight: 900,
    letterSpacing: 0.3,
    lineHeight: 1,
    whiteSpace: "nowrap",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  };
}

export function ProductBadges({
  product,
  size = "card",
  max = 2,
  className,
}: {
  product: BadgeProduct;
  size?: "card" | "detail";
  max?: number;
  className?: string;
}) {
  const badges = computeBadges(product).slice(0, max);
  if (badges.length === 0) return null;
  const gap = size === "card" ? 4 : 6;
  return (
    <div
      className={className}
      style={{ display: "flex", flexWrap: "wrap", gap }}
    >
      {badges.map((b) => (
        <span key={b.kind} style={chipStyle(b, size)}>
          <span
            aria-hidden
            style={{
              display: "flex",
              width: size === "card" ? 10 : 12,
              height: size === "card" ? 10 : 12,
              flexShrink: 0,
            }}
          >
            {/* Lucide icon inherits currentColor from the chip's fg */}
            {b.icon}
          </span>
          <span>{b.label}</span>
        </span>
      ))}
    </div>
  );
}

export default ProductBadges;

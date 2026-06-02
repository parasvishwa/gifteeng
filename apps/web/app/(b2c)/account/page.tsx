"use client";

import { useEffect, useState, useCallback, useRef, Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getB2cToken, API_BASE_URL } from "@/lib/api";
import { normaliseMediaUrl } from "@/lib/media";
import { flyCoinsToNavbar } from "@/lib/coins-fx";
import { useTheme } from "@/lib/theme";
import {
  Package, Coins, Gift, Settings, LogOut, Copy, Share2,
  MapPin, Edit3, ChevronDown, ChevronUp, Plus, Heart,
  Sun, Moon, Monitor, Bell, X, ShoppingBag,
  CheckCircle2, Truck, Clock, XCircle, AlertCircle,
  ArrowRight, Sparkles, Award, ShoppingCart, Users, Star,
  User, Mail, Smartphone, Calendar, ArrowUpDown, RotateCcw,
  FileText, Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Customer = {
  id: string; phone: string; fullName?: string | null; email?: string | null;
  phoneVerified?: boolean; createdAt?: string;
};
type OrderItem = {
  qty?: number; quantity?: number;
  name?: string; imageUrl?: string;
  snapshot?: { title?: string; images?: string[] | null; [k: string]: unknown };
};
type Order = {
  id: string; number?: string; orderNumber?: string; status?: string;
  placedAt?: string; createdAt?: string;
  totalLabel?: string; total?: number; grandTotal?: string | number;
  items?: OrderItem[];
};
type CoinTx = { id: string; description?: string; reason?: string; amount: number; createdAt: string; };
type CoinBalance = {
  balance: number;
  canSpin: boolean;
  // Added Deploy 97 — read ₹-value from API instead of hardcoding 0.01 / 0.25
  valueInr?: number;
  coinValueInr?: number;
  pendingBalance?: number;
  pendingValueInr?: number;
  // Added Deploy 116 — per-order redemption cap + Goin TTL for the wallet UI
  maxRedemptionPct?: number;
  maxRedemptionInrPerOrder?: number;
  coinExpiryDays?: number;
  nextExpiryAt?: string | null;
};
type ReferralInfo = { code: string; uses_count?: number; } | null;
type Address = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
};
type Tab = "orders" | "goins" | "referral" | "profile";

// ── Reminders ─────────────────────────────────────────────────────────────────
type ReminderType = "birthday" | "anniversary" | "other";
type Reminder = { id: string; name: string; relation: string; type: ReminderType; month: number; day: number; };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const REMINDER_TYPES: { value: ReminderType; label: string }[] = [
  { value: "birthday",    label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "other",       label: "Other" },
];

function loadReminders(): Reminder[] {
  try { return JSON.parse(localStorage.getItem("gifteeng.reminders") ?? "[]") as Reminder[]; } catch { return []; }
}
function saveReminders(list: Reminder[]) { localStorage.setItem("gifteeng.reminders", JSON.stringify(list)); }
function daysUntil(month: number, day: number): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(now.getFullYear(), month - 1, day);
  if (target.getTime() < now.getTime()) target.setFullYear(target.getFullYear() + 1);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000));
}
function reminderIcon(type: ReminderType): React.ElementType {
  if (type === "birthday") return Gift;
  if (type === "anniversary") return Star;
  return Calendar;
}

// ─── Order status config ──────────────────────────────────────────────────────
const ORDER_STATUSES = ["All", "New", "Confirmed", "In Production", "Ready to Ship", "Shipped", "Delivered", "Cancelled", "Returned"];

const STATUS_CFG: Record<string, { color: string; bg: string; icon: React.ElementType; label: string }> = {
  new_order:         { color: "#2563eb", bg: "#dbeafe", icon: Clock,        label: "New"            },
  confirmed:         { color: "#059669", bg: "#d1fae5", icon: CheckCircle2, label: "Confirmed"      },
  in_production:     { color: "#7c3aed", bg: "#ede9fe", icon: Clock,        label: "In Production"  },
  ready_to_ship:     { color: "#0891b2", bg: "#cffafe", icon: Truck,        label: "Ready to Ship"  },
  processing:        { color: "#7c3aed", bg: "#ede9fe", icon: Clock,        label: "Processing"     },
  shipped:           { color: "#2563eb", bg: "#dbeafe", icon: Truck,        label: "Shipped"        },
  delivered:         { color: "#16a34a", bg: "#dcfce7", icon: CheckCircle2, label: "Delivered"      },
  cancelled:         { color: "#dc2626", bg: "#fee2e2", icon: XCircle,      label: "Cancelled"      },
  returned:          { color: "#dc2626", bg: "#fee2e2", icon: RotateCcw,    label: "Returned"       },
  incomplete:        { color: "#d97706", bg: "#fef3c7", icon: AlertCircle,  label: "Incomplete"     },
  "payment pending": { color: "#ca8a04", bg: "#fef9c3", icon: AlertCircle,  label: "Payment"        },
  pending:           { color: "#ca8a04", bg: "#fef9c3", icon: AlertCircle,  label: "Pending"        },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toast(msg: string, ok = true) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:600;color:#fff;background:${ok ? "#059669" : "#dc2626"};box-shadow:0 4px 20px rgba(0,0,0,0.18);pointer-events:none;white-space:nowrap;`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

async function authedFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const token = getB2cToken();
    const r = await fetch(`${API_BASE_URL}/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch { return fallback; }
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length > 10 ? digits.slice(2) : digits;
  if (local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  return `+${digits}`;
}

function initials(c: Customer) {
  if (c.fullName) return c.fullName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  if (c.email) return c.email[0].toUpperCase();
  return "U";
}

function doLogout() {
  try { localStorage.removeItem("gifteeng.b2c.token"); } catch { /* */ }
  try { localStorage.removeItem("gifteeng.b2c.cart"); } catch { /* */ }
  window.location.href = "/auth";
}

// ─── Invoice helpers ─────────────────────────────────────────────────────────
function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&"']/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&#39;"} as Record<string,string>)[c]);
}
function openPrint(html: string, title: string) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) { alert("Please allow popups to download the invoice"); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; color: #111; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  h2 { font-size: 14px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.12em; color: #666; }
  .brand { font-size: 26px; font-weight: 900; background: linear-gradient(135deg,#ec4899,#a855f7); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eee; }
  th { background: #f8f8f8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; }
  .r { text-align: right; } .c { text-align: center; }
  .mono { font-family: ui-monospace, monospace; }
  .big { font-size: 22px; font-weight: 900; }
  @media print { body { padding: 0 } }
</style>
</head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script></body></html>`);
  w.document.close();
}
function generateB2cInvoice(order: Record<string, unknown>) {
  const items: unknown[] = (order.items as unknown[] | undefined) ?? [];
  const lines = items.map((it) => {
    const i = it as Record<string, unknown>;
    return `<tr>
      <td>${esc(i.product_name ?? i.productName ?? i.name ?? "Item")}</td>
      <td class="c">${esc(i.quantity ?? i.qty ?? 1)}</td>
      <td class="r mono">₹${Number(i.unit_price ?? i.unitPrice ?? 0).toFixed(2)}</td>
      <td class="r mono">₹${Number(i.total_price ?? i.totalPrice ?? (Number(i.unit_price ?? i.unitPrice ?? 0) * Number(i.quantity ?? i.qty ?? 1))).toFixed(2)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="4" class="c" style="color:#999;padding:20px">No line items recorded</td></tr>`;

  const meta = (order.metadata as Record<string, unknown> | undefined) ?? {};
  const subtotal = Number(order.subtotal ?? 0);
  const delivery = Number(order.delivery_charge ?? order.shippingTotal ?? order.deliveryCharge ?? 0);
  const total = Number(order.total ?? order.grandTotal ?? 0);
  const tax = total - subtotal - delivery > 0 ? total - subtotal - delivery : 0;
  const orderNo = esc(order.order_number ?? order.orderNumber ?? order.number ?? (String(order.id ?? "").slice(0, 8).toUpperCase()) ?? "—");
  const createdRaw = order.created_at ?? order.createdAt;
  const created = createdRaw ? new Date(String(createdRaw)).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }) : "—";

  // shipping address
  const addr = (order.shippingAddress ?? order.shipping_address ?? meta.shippingAddress) as Record<string,unknown> | string | undefined;
  const addrLine = typeof addr === "string" ? addr : addr ? [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ") : "";
  const custName = esc(order.customer_name ?? order.customerName ?? (addr && typeof addr === "object" ? addr.name : "") ?? "—");
  const custPhone = esc(order.customer_phone ?? order.customerPhone ?? (addr && typeof addr === "object" ? addr.phone : "") ?? "");
  const gstNumber = esc(order.gst_number ?? order.gstNumber ?? meta.gstNumber ?? "");
  const payMethod = esc(order.payment_method ?? order.paymentMethod ?? "—");
  const payStatus = esc(order.payment_status ?? order.paymentStatus ?? "—");

  const html = `
    <div class="row" style="align-items:flex-start">
      <div>
        <div class="brand">Gifteeng</div>
        <div style="font-size:11px;color:#666">gifteeng.com · Mumbai, India</div>
      </div>
      <div style="text-align:right">
        <h1>${gstNumber ? "Tax Invoice" : "Invoice"}</h1>
        <div style="font-size:12px">No: <span class="mono">${orderNo}</span></div>
        <div style="font-size:11px;color:#666">Date: ${created}</div>
      </div>
    </div>
    <div class="row">
      <div class="card" style="flex:1">
        <h2>Bill To</h2>
        <div style="font-weight:700">${custName}</div>
        <div style="font-size:12px;color:#555;margin-top:4px">${esc(addrLine)}</div>
        ${custPhone ? `<div style="font-size:12px;color:#555">${custPhone}</div>` : ""}
        ${gstNumber ? `<div style="font-size:11px;color:#555;margin-top:6px">GSTIN: <span class="mono">${gstNumber}</span></div>` : ""}
      </div>
      <div class="card" style="flex:1">
        <h2>Payment</h2>
        <div style="font-size:12px"><b>Method:</b> ${payMethod}</div>
        <div style="font-size:12px"><b>Status:</b> ${payStatus}</div>
      </div>
    </div>
    <table style="margin-top:14px">
      <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <div class="row" style="margin-top:14px">
      <div style="flex:1"></div>
      <div style="min-width:260px">
        ${subtotal ? `<div class="row" style="padding:4px 0"><span>Subtotal</span><span class="mono">₹${subtotal.toFixed(2)}</span></div>` : ""}
        ${delivery ? `<div class="row" style="padding:4px 0"><span>Shipping</span><span class="mono">₹${delivery.toFixed(2)}</span></div>` : ""}
        ${tax ? `<div class="row" style="padding:4px 0"><span>Tax (GST)</span><span class="mono">₹${tax.toFixed(2)}</span></div>` : ""}
        <div class="row" style="padding:10px 0 4px;border-top:2px solid #111;margin-top:6px"><span class="big">Total</span><span class="big mono">₹${total.toFixed(2)}</span></div>
      </div>
    </div>
    <div style="margin-top:28px;font-size:11px;color:#888;text-align:center">
      Thank you for shopping with Gifteeng! Questions? hello@gifteeng.com
    </div>
  `;
  openPrint(html, `Invoice-${orderNo}`);
}

// ─── Spin wheel segments — all values in GOINS (not ₹) ───────────────────────
// Order must match backend segment indices (0-7)
const SW_SEGS = [
  { label: "MISS", goins: 0,   color: "#64748b" },
  { label: "5G",   goins: 5,   color: "#ec4899" },
  { label: "10G",  goins: 10,  color: "#f97316" },
  { label: "MISS", goins: 0,   color: "#94a3b8" },
  { label: "25G",  goins: 25,  color: "#7c3aed" },
  { label: "15G",  goins: 15,  color: "#db2777" },
  { label: "50G",  goins: 50,  color: "#f59e0b" },
  { label: "20G",  goins: 20,  color: "#10b981" },
];

// ─── Pick Me gift boxes ───────────────────────────────────────────────────────
const PICK_PRIZES = [0, 5, 10, 20, 0, 50]; // mapped client-side; server decides real value
function SpinWheelSVG({ deg, spinning }: { deg: number; spinning: boolean }) {
  const n = SW_SEGS.length;
  return (
    <div className="relative w-60 h-60 mx-auto select-none">
      {/* Pointer */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
        <div style={{ width:0,height:0,borderLeft:"11px solid transparent",borderRight:"11px solid transparent",
          borderTop:"26px solid #facc15",filter:"drop-shadow(0 3px 8px rgba(250,204,21,0.9))" }}/>
      </div>
      {/* Wheel */}
      <div className="w-full h-full rounded-full"
        style={{ transform:`rotate(${deg}deg)`,
          transition: spinning ? "transform 4.5s cubic-bezier(0.17,0.67,0.08,0.99)" : "none" }}>
        <svg viewBox="0 0 100 100" className="w-full h-full rounded-full">
          {/* Outer ring */}
          <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
          {SW_SEGS.map((seg, i) => {
            const a1=((i*360/n)-90)*Math.PI/180, a2=(((i+1)*360/n)-90)*Math.PI/180;
            const x1=50+48*Math.cos(a1),y1=50+48*Math.sin(a1);
            const x2=50+48*Math.cos(a2),y2=50+48*Math.sin(a2);
            const ma=(a1+a2)/2;
            const lx=50+32*Math.cos(ma),ly=50+32*Math.sin(ma);
            const sx=50+44*Math.cos(ma),sy=50+44*Math.sin(ma);
            return (
              <g key={i}>
                <path d={`M50,50 L${x1},${y1} A48,48 0 0,1 ${x2},${y2} Z`}
                  fill={seg.color} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5"/>
                {/* Value */}
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize="5.5" fontWeight="bold"
                  transform={`rotate(${i*360/n+360/n/2+90},${lx},${ly})`}
                  style={{ textShadow:"0 1px 3px rgba(0,0,0,0.5)" }}>{seg.label}</text>
                {/* Dot near rim */}
                <circle cx={sx} cy={sy} r="1.2" fill="rgba(255,255,255,0.4)"/>
              </g>
            );
          })}
          {/* Center hub */}
          <circle cx="50" cy="50" r="10" fill="#0d0d1a" stroke="#facc15" strokeWidth="2"/>
          <circle cx="50" cy="50" r="5" fill="#facc15"/>
          <circle cx="50" cy="50" r="2" fill="#0d0d1a"/>
        </svg>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <h3 className="font-bold text-base text-foreground">{title}</h3>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-2xl border border-border/40 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ─── TabSyncer — isolated so useSearchParams is inside a Suspense boundary ────
// Next.js requires useSearchParams() to be in a component wrapped with <Suspense>.
// We keep this tiny so the large AccountPage component is unaffected.
function TabSyncer({ setTab }: { setTab: (t: Tab) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "goins" || t === "orders" || t === "referral" || t === "profile") {
      setTab(t);
    }
  }, [searchParams, setTab]);
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccountPage() {
  const router = useRouter();
  const { theme, setTheme, resolved } = useTheme();
  const isDark = resolved === "dark";
  const [ready, setReady]   = useState(false);
  const [tab, setTab]       = useState<Tab>(() => {
    // Read tab from URL on first render (e.g. ?tab=goins from navbar coin chip)
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return (t === "goins" || t === "orders" || t === "referral" || t === "profile") ? t : "orders";
  });

  const swWheelRef = useRef<HTMLDivElement>(null);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders]     = useState<Order[] | null>(null);
  const [coins, setCoins]       = useState<CoinBalance | null>(null);
  const [coinTxs, setCoinTxs]   = useState<CoinTx[] | null>(null);
  const [referral, setReferral] = useState<ReferralInfo>(null);

  const [statusFilter, setStatusFilter]   = useState("All");
  const [sortOrder, setSortOrder]         = useState("Newest First");
  const [timeFilter, setTimeFilter]       = useState("All Time");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);

  const [editing, setEditing]     = useState(false);
  const [formName, setFormName]   = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [saving, setSaving]       = useState(false);

  // ── Spin wheel state ──────────────────────────────────────────────────────
  const [swDeg, setSwDeg]           = useState(0);
  const swDegRef                    = useRef(0);
  const [swSpinning, setSwSpinning] = useState(false);
  const [swResult, setSwResult]     = useState<{ g: number } | null>(null);
  const [swError, setSwError]       = useState("");
  // ── Pick Me state ─────────────────────────────────────────────────────────
  const [pickMode, setPickMode]     = useState<"idle"|"picking"|"revealed">("idle");
  const [pickedBox, setPickedBox]   = useState<number | null>(null);
  const [pickResult, setPickResult] = useState<{ g: number } | null>(null);
  const [pickError, setPickError]   = useState("");
  const [gameView, setGameView]     = useState<"spin"|"pick">("spin"); // which game is shown

  const handleSwSpin = useCallback(async () => {
    if (swSpinning || !coins?.canSpin) return;
    setSwSpinning(true);
    setSwResult(null);
    setSwError("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/coins/spin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getB2cToken()}` },
      });
      const data = await r.json() as { coinsEarned?: number; newBalance?: number; segment?: number; message?: string };
      if (r.ok && data.coinsEarned !== undefined) {
        const segIdx = data.segment ?? Math.floor(Math.random() * SW_SEGS.length);
        const segDeg = (360 / SW_SEGS.length) * segIdx;
        const finalDeg = swDegRef.current + 5 * 360 + (360 - segDeg - (360 / SW_SEGS.length) / 2);
        swDegRef.current = finalDeg;
        setSwDeg(finalDeg);
        setTimeout(() => {
          setSwSpinning(false);
          setSwResult({ g: data.coinsEarned! });
          // Fire event so navbar chip updates immediately
          flyCoinsToNavbar(swWheelRef.current, { amount: data.coinsEarned!, redeemable: true, source: "spin" });
          // Update balance immediately from response, then verify from server
          if (data.newBalance !== undefined) setCoins(prev => ({ ...prev!, balance: data.newBalance!, canSpin: false }));
          authedFetch<CoinBalance>("/coins/balance", coins ?? { balance: 0, canSpin: false }).then(b => { if (b) setCoins(b); });
          setCoinTxs(null);
          authedFetch<CoinTx[]>("/coins/history?limit=20", []).then(setCoinTxs);
        }, 4400);
      } else {
        setSwSpinning(false);
        setSwError((data as { message?: string }).message ?? "Could not spin. Try again.");
      }
    } catch {
      setSwSpinning(false);
      setSwError("Network error. Please try again.");
    }
  }, [swSpinning, coins?.canSpin]);

  // Pick Me handler — uses same /coins/spin endpoint; server decides real prize
  const handlePickMe = useCallback(async (boxIdx: number) => {
    if (pickMode !== "idle" || !coins?.canSpin) return;
    setPickedBox(boxIdx);
    setPickMode("picking");
    setPickResult(null);
    setPickError("");
    try {
      const r = await fetch(`${API_BASE_URL}/api/coins/spin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getB2cToken()}` },
      });
      const data = await r.json() as { coinsEarned?: number; message?: string };
      if (r.ok && data.coinsEarned !== undefined) {
        setTimeout(() => {
          setPickMode("revealed");
          setPickResult({ g: data.coinsEarned! });
          if (data.coinsEarned! > 0) {
            flyCoinsToNavbar(swWheelRef.current, { amount: data.coinsEarned!, redeemable: true, source: "spin" });
          }
          if ((data as { newBalance?: number }).newBalance !== undefined) setCoins(prev => ({ ...prev!, balance: (data as { newBalance?: number }).newBalance!, canSpin: false }));
          authedFetch<CoinBalance>("/coins/balance", coins ?? { balance: 0, canSpin: false }).then(b => { if (b) setCoins(b); });
          setCoinTxs(null);
          authedFetch<CoinTx[]>("/coins/history?limit=20", []).then(setCoinTxs);
        }, 900);
      } else {
        setPickMode("idle");
        setPickedBox(null);
        setPickError((data as { message?: string }).message ?? "Could not pick. Try again.");
      }
    } catch {
      setPickMode("idle");
      setPickedBox(null);
      setPickError("Network error. Please try again.");
    }
  }, [pickMode, coins?.canSpin]);

  // ── Download Invoice ──────────────────────────────────────────────────────
  const downloadInvoice = useCallback(async (orderId: string) => {
    if (downloadingInvoice) return;
    setDownloadingInvoice(orderId);
    try {
      const fullOrder = await authedFetch<Record<string, unknown> | null>(`/orders/b2c/mine/${orderId}`, null);
      if (!fullOrder) { toast("Could not load order details", false); return; }
      generateB2cInvoice(fullOrder);
    } catch {
      toast("Could not generate invoice", false);
    } finally {
      setDownloadingInvoice(null);
    }
  }, [downloadingInvoice]);

  const [reminders, setReminders]             = useState<Reminder[]>([]);
  const [addingReminder, setAddingReminder]   = useState(false);
  const [newRName, setNewRName]               = useState("");
  const [newRRelation, setNewRRelation]       = useState("");
  const [newRType, setNewRType]               = useState<ReminderType>("birthday");
  const [newRMonth, setNewRMonth]             = useState(1);
  const [newRDay, setNewRDay]                 = useState(1);

  // ── Saved addresses ───────────────────────────────────────────────────────
  const [addresses, setAddresses]             = useState<Address[] | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addrBusy, setAddrBusy]               = useState(false);
  const [addrName, setAddrName]               = useState("");
  const [addrPhone, setAddrPhone]             = useState("");
  const [addrLine1, setAddrLine1]             = useState("");
  const [addrLine2, setAddrLine2]             = useState("");
  const [addrCity, setAddrCity]               = useState("");
  const [addrState, setAddrState]             = useState("");
  const [addrPincode, setAddrPincode]         = useState("");

  useEffect(() => {
    if (!getB2cToken()) { router.replace("/auth?returnTo=/account"); return; }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    authedFetch<Customer | null>("/auth/b2c/me", null).then(c => {
      if (c) { setCustomer(c); setFormName(c.fullName ?? ""); setFormEmail(c.email ?? ""); }
      else { router.replace("/auth?returnTo=/account"); }
    });
    // Pre-fetch coins for header display
    authedFetch<CoinBalance>("/coins/balance", { balance: 0, canSpin: false }).then(setCoins);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (tab === "orders" && orders === null) {
      authedFetch<Order[] | { items: Order[] }>("/orders/b2c/mine?pageSize=100", []).then(d => {
        setOrders(Array.isArray(d) ? d : (d.items ?? []));
      });
    }
    if (tab === "goins" && coinTxs === null) {
      authedFetch<CoinTx[]>("/coins/history?limit=20", []).then(setCoinTxs);
    }
    if (tab === "referral" && referral === null) {
      authedFetch<ReferralInfo>("/referrals/me", null).then(setReferral);
    }
    if (tab === "profile" && addresses === null) {
      authedFetch<Address[]>("/addresses", []).then(setAddresses);
    }
  }, [ready, tab, orders, coinTxs, referral, addresses]);

  useEffect(() => { if (ready) setReminders(loadReminders()); }, [ready]);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      const token = getB2cToken();
      const r = await fetch(`${API_BASE_URL}/api/auth/b2c/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fullName: formName || undefined, email: formEmail || undefined }),
      });
      if (!r.ok) throw new Error();
      const updated = await r.json() as Customer;
      setCustomer(updated); setEditing(false); toast("Profile updated ✓");
    } catch { toast("Couldn't save. Try again.", false); }
    finally { setSaving(false); }
  }, [formName, formEmail]);

  const addReminder = useCallback(() => {
    if (!newRName.trim()) return;
    const r: Reminder = { id: Date.now().toString(), name: newRName.trim(), relation: newRRelation.trim() || newRName.trim(), type: newRType, month: newRMonth, day: newRDay };
    const updated = [...loadReminders(), r];
    saveReminders(updated); setReminders(updated);
    setNewRName(""); setNewRRelation(""); setNewRType("birthday"); setNewRMonth(1); setNewRDay(1); setAddingReminder(false);
    toast("Reminder saved ✓");
  }, [newRName, newRRelation, newRType, newRMonth, newRDay]);

  const deleteReminder = useCallback((id: string) => {
    const updated = loadReminders().filter(r => r.id !== id);
    saveReminders(updated); setReminders(updated);
  }, []);

  const saveAddress = useCallback(async () => {
    if (!addrName.trim() || !addrPhone.trim() || !addrLine1.trim() || !addrCity.trim() || !addrPincode.trim()) {
      toast("Please fill all required fields", false); return;
    }
    setAddrBusy(true);
    try {
      const token = getB2cToken();
      const r = await fetch(`${API_BASE_URL}/api/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: addrName.trim(), phone: addrPhone.trim(),
          line1: addrLine1.trim(), line2: addrLine2.trim() || undefined,
          city: addrCity.trim(), state: addrState.trim(), pincode: addrPincode.trim(),
        }),
      });
      if (!r.ok) throw new Error();
      const newAddr = await r.json() as Address;
      setAddresses(prev => [...(prev ?? []), newAddr]);
      setShowAddressForm(false);
      setAddrName(""); setAddrPhone(""); setAddrLine1(""); setAddrLine2("");
      setAddrCity(""); setAddrState(""); setAddrPincode("");
      toast("Address saved ✓");
    } catch { toast("Couldn't save address. Try again.", false); }
    finally { setAddrBusy(false); }
  }, [addrName, addrPhone, addrLine1, addrLine2, addrCity, addrState, addrPincode]);

  const deleteAddress = useCallback(async (id: string) => {
    try {
      const token = getB2cToken();
      await fetch(`${API_BASE_URL}/api/addresses/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setAddresses(prev => (prev ?? []).filter(a => a.id !== id));
      toast("Address removed");
    } catch { toast("Couldn't remove. Try again.", false); }
  }, []);

  const filteredOrders = useMemo(() => {
    let result = [...(orders ?? [])];

    // Status filter — match against raw status, underscore-normalized, or cfg label
    if (statusFilter !== "All") {
      const f = statusFilter.toLowerCase();
      result = result.filter(o => {
        const s = (o.status ?? "").toLowerCase();
        const cfg = STATUS_CFG[s];
        return s === f
          || s.replace(/_/g, " ") === f
          || (cfg?.label ?? "").toLowerCase() === f;
      });
    }

    // Time filter
    if (timeFilter !== "All Time") {
      const now = new Date();
      result = result.filter(o => {
        const d = new Date(o.placedAt ?? o.createdAt ?? "");
        if (isNaN(d.getTime())) return true;
        if (timeFilter === "This Month")
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (timeFilter === "Last 3 Months")
          return d >= new Date(now.getFullYear(), now.getMonth() - 3, 1);
        if (timeFilter === "This Year")
          return d.getFullYear() === now.getFullYear();
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      const ta = new Date(a.placedAt ?? a.createdAt ?? "").getTime() || 0;
      const tb = new Date(b.placedAt ?? b.createdAt ?? "").getTime() || 0;
      return sortOrder === "Newest First" ? tb - ta : ta - tb;
    });

    return result;
  }, [orders, statusFilter, timeFilter, sortOrder]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (!ready) return (
    <div className="min-h-screen pt-20" style={{ background: "hsl(30 20% 98%)" }}>
      <div className="max-w-2xl mx-auto px-4 space-y-3">
        <div className="h-36 rounded-2xl bg-muted animate-pulse" />
        <div className="flex gap-2">{[1,2,3,4].map(i=><div key={i} className="h-10 flex-1 rounded-full bg-muted animate-pulse"/>)}</div>
        {[1,2,3].map(i=><div key={i} className="h-20 rounded-2xl bg-muted animate-pulse"/>)}
      </div>
    </div>
  );

  const TABS: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: "orders",   label: "Orders",       icon: Package },
    { key: "goins",    label: "Goins",        icon: Coins   },
    { key: "referral", label: "Refer & Earn", icon: Gift    },
    { key: "profile",  label: "Profile",      icon: Settings},
  ];

  return (
    <div className="min-h-screen pt-16 md:pt-20 pb-28 md:pb-12"
      style={isDark ? {
        background: "hsl(230 23% 6%)",
        color: "hsl(0 0% 98%)",
        ["--card" as any]: "230 20% 10%",
        ["--card-foreground" as any]: "0 0% 98%",
        ["--foreground" as any]: "0 0% 98%",
        ["--muted-foreground" as any]: "230 10% 60%",
        ["--border" as any]: "230 15% 20%",
        ["--muted" as any]: "230 15% 15%",
        ["--background" as any]: "230 23% 6%",
        ["--input" as any]: "230 15% 18%",
      } : {
        background: "hsl(30 20% 98%)",
      }}>
      {/* Syncs ?tab= URL param → tab state; needs Suspense for Next.js static build */}
      <Suspense fallback={null}>
        <TabSyncer setTab={setTab} />
      </Suspense>

      <div className="max-w-2xl mx-auto px-4 pt-6">

        {/* ── Profile header ── */}
        <div className="rounded-2xl overflow-hidden mb-6 shadow-sm bg-card border border-border/40">

          {/* Top: avatar + info + coins chip */}
          <div className="flex items-center gap-4 px-5 pt-5 pb-3">
            <div className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center text-white font-black text-xl shrink-0 bg-[#1A1B24]">
              {customer ? initials(customer) : "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.18em]">Welcome back</p>
              <h1 className="text-foreground font-bold text-[17px] leading-snug truncate mt-0.5">
                {customer?.fullName ?? fmtPhone(customer?.phone) ?? "…"}
              </h1>
              {customer?.fullName && customer?.phone && (
                <p className="text-muted-foreground text-xs mt-0.5">{fmtPhone(customer.phone)}</p>
              )}
            </div>
            {/* Coins chip — tapping opens Goins tab */}
            {coins !== null && (
              <button
                onClick={() => setTab("goins")}
                className="shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl active:scale-95 transition-transform bg-muted border border-border/40">
                <Coins className="w-4 h-4 text-[#F59E0B]" />
                <span className="text-[#F59E0B] font-black text-sm leading-none">{coins.balance}</span>
                <span className="text-muted-foreground text-[9px] font-semibold">Goins</span>
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-white/10 mb-3" />

          {/* Quick actions */}
          <div className="flex gap-2 px-5 pb-5">
            {/* Gift Casino — eye-catching casino entry point */}
            <button
              onClick={() => router.push("/play")}
              className="flex-[2] flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black text-white transition-all active:scale-95 hover:opacity-90 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #12131A 0%, #1e1230 50%, #12131A 100%)" }}
            >
              <span className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><circle cx=%2210%22 cy=%2210%22 r=%221.5%22 fill=%22rgba(239,55,82,0.15)%22/></svg>')] opacity-60" />
              <span className="relative flex items-center gap-1.5">
                <span className="text-base leading-none">🎰</span>
                <span>
                  <span className="text-[#EF3752]">Gift</span> Casino
                </span>
                <Sparkles className="w-3 h-3 text-amber-400" />
              </span>
            </button>
            <button onClick={() => router.push("/wishlist")}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-bold text-rose-500/80 transition-all active:scale-95 bg-muted border border-border/40 hover:text-rose-500">
              <Heart className="w-4 h-4" />
              Wishlist
            </button>
            <button onClick={doLogout}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-bold text-destructive/70 transition-all active:scale-95 bg-muted border border-border/40 hover:text-destructive">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1.5 overflow-x-auto sticky z-20 top-16 md:top-20 -mx-4 px-4 py-2 mb-4"
          style={{
            scrollbarWidth: "none",
            background: isDark ? "rgba(6,8,18,0.97)" : "rgba(250,249,252,0.97)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all shrink-0 ${
                tab === key
                  ? "bg-[#EF3752] text-white shadow-sm"
                  : "bg-card border border-border/40 text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════
            ORDERS TAB
        ════════════════════════════════════════════════ */}
        {tab === "orders" && (
          <div className="space-y-5">
            {/* Filters row — Status + Time + Sort as dropdowns */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex-1 min-w-[130px]">
                <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1 block">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full text-xs font-semibold border border-border/50 rounded-xl px-3 py-2.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  {ORDER_STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1 block">Period</label>
                <select
                  value={timeFilter}
                  onChange={e => setTimeFilter(e.target.value)}
                  className="w-full text-xs font-semibold border border-border/50 rounded-xl px-3 py-2.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  {["All Time","This Month","Last 3 Months","This Year"].map(o => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60 mb-1 block">Sort</label>
                <select
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value)}
                  className="w-full text-xs font-semibold border border-border/50 rounded-xl px-3 py-2.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  {["Newest First","Oldest First"].map(o => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Orders list */}
            {orders === null ? (
              <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-20 rounded-2xl bg-muted animate-pulse"/>)}</div>
            ) : filteredOrders.length === 0 ? (
              <Card className="py-14 text-center">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-muted">
                  <ShoppingBag className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="font-bold text-foreground mb-1">No {statusFilter !== "All" ? statusFilter : ""} orders yet</p>
                <p className="text-sm text-muted-foreground mb-5">Your orders will appear here once you place one.</p>
                <Link href="/products"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-[#EF3752]">
                  Shop Now <ArrowRight className="w-4 h-4" />
                </Link>
              </Card>
            ) : (
              filteredOrders.map(o => {
                const isOpen = expandedOrder === o.id;
                const statusKey = (o.status ?? "").toLowerCase();
                const cfg = STATUS_CFG[statusKey];
                const StatusIcon = cfg?.icon ?? Clock;
                const firstItem = o.items?.[0];
                const itemThumb = normaliseMediaUrl(firstItem?.snapshot?.images?.[0] ?? firstItem?.imageUrl);
                const itemName  = firstItem?.snapshot?.title ?? firstItem?.name;
                const orderDate = o.placedAt ?? o.createdAt;
                const orderTotal = o.totalLabel
                  ?? (o.grandTotal !== undefined ? Math.round(Number(o.grandTotal)) : o.total);
                return (
                  <Card key={o.id} className="overflow-hidden">
                    <button className="w-full px-4 py-4 flex items-center gap-3 text-left"
                      onClick={() => setExpandedOrder(isOpen ? null : o.id)}>
                      {/* Thumbnail or icon */}
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                        {itemThumb
                          ? <img src={itemThumb} alt="" className="w-full h-full object-cover" />
                          : <Package className="w-5 h-5 text-muted-foreground/50" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground">#{o.orderNumber ?? o.number ?? o.id.slice(0,8).toUpperCase()}</p>
                        {itemName && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {itemName}{(o.items?.length ?? 0) > 1 ? ` +${o.items!.length-1} more` : ""}
                          </p>
                        )}
                        {orderDate && <p className="text-xs text-muted-foreground mt-0.5">{fmt(orderDate)}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {cfg && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: cfg.bg, color: cfg.color }}>
                            <StatusIcon className="w-2.5 h-2.5" /> {cfg.label}
                          </span>
                        )}
                        {orderTotal !== undefined && orderTotal !== null && (
                          <p className="font-bold text-sm text-foreground">₹{orderTotal}</p>
                        )}
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />}
                    </button>
                    {isOpen && (
                      <div className="border-t border-border/40 px-4 py-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <Link href={`/orders/${o.id}`}
                            className="text-center py-2.5 rounded-xl border border-primary/40 text-primary text-xs font-bold hover:bg-primary/5 transition-colors">
                            View Details
                          </Link>
                          <Link href={`/track/${o.id}`}
                            className="text-center py-2.5 rounded-xl text-white text-xs font-bold transition-colors bg-[#EF3752]">
                            Track Order
                          </Link>
                        </div>
                        <button
                          onClick={() => downloadInvoice(o.id)}
                          disabled={downloadingInvoice === o.id}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/60 text-muted-foreground text-xs font-bold hover:bg-muted/40 transition-colors disabled:opacity-50"
                        >
                          {downloadingInvoice === o.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                            : <><FileText className="w-3.5 h-3.5" /> Download Invoice</>
                          }
                        </button>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════
            GOINS TAB
        ════════════════════════════════════════════════ */}
        {tab === "goins" && (
          <div className="space-y-4">

            {/* ── 1. Balance Card — light, gold accent ─────────────────────── */}
            <div className="rounded-2xl bg-white shadow-md overflow-hidden" style={{ border: "1px solid #FDE68A" }}>
              {/* Gold gradient bar */}
              <div className="h-1.5" style={{ background: "linear-gradient(90deg, #F59E0B, #FCD34D, #F59E0B)" }} />
              <div className="px-6 pt-6 pb-7 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] mb-5" style={{ color: "#D97706" }}>
                  Your Goins Balance
                </p>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center" style={{ background: "#FEF3C7" }}>
                    <Coins className="w-6 h-6" style={{ color: "#F59E0B" }} />
                  </div>
                  <span className="text-6xl font-black leading-none tabular-nums" style={{ color: "#F59E0B" }}>
                    {coins?.balance ?? 0}
                  </span>
                </div>
                <p className="text-xs mb-1" style={{ color: "#9CA3AF" }}>Goins</p>
                <p className="text-sm font-semibold mb-1" style={{ color: "#374151" }}>
                  = ₹{(coins?.valueInr ?? (coins?.balance ?? 0) * (coins?.coinValueInr ?? 0.01)).toFixed(2)} off your next order
                </p>
                <p className="text-[11px] font-medium mb-6" style={{ color: "#9CA3AF" }}>
                  Max ₹{coins?.maxRedemptionInrPerOrder ?? 25} or {coins?.maxRedemptionPct ?? 20}% per order · Expires after {coins?.coinExpiryDays ?? 90} days
                </p>
                <Link href="/cart"
                  className="inline-flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-95"
                  style={{ background: "#EF3752", boxShadow: "0 4px 14px rgba(239,55,82,0.25)" }}>
                  <Coins className="w-4 h-4" /> Use Coins
                </Link>
              </div>
            </div>

            {/* ── 2. Game selector — pill tabs ─────────────────────────────── */}
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl w-fit mx-auto" style={{ background: "#F3F4F6" }}>
              {([
                { key: "spin" as const, icon: RotateCcw, label: "Spin Now"  },
                { key: "pick" as const, icon: Gift,      label: "Try Luck" },
              ]).map(g => (
                <button key={g.key} onClick={() => setGameView(g.key)}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 whitespace-nowrap"
                  style={gameView === g.key
                    ? { background: "#EF3752", color: "#fff", boxShadow: "0 2px 8px rgba(239,55,82,0.3)" }
                    : { background: "transparent", color: "#9CA3AF" }}>
                  <g.icon className="w-3.5 h-3.5" /> {g.label}
                </button>
              ))}
            </div>

            {/* ── 3. Spin Wheel — DARK premium card (only dark element) ──────── */}
            {gameView === "spin" && (
              <div className="rounded-2xl overflow-hidden relative"
                style={{
                  background: "linear-gradient(160deg, #0d0f1d 0%, #111420 100%)",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}>
                {/* Amber glow line at top */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(245,158,11,0.7), transparent)" }} />
                {/* Floating particles */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
                  {["🪙","⭐","✨","💫","🎁","🏆"].map((sym, i) => (
                    <span key={i} className="absolute text-sm" style={{
                      left: `${5 + i * 16}%`, bottom: "-10px", opacity: 0,
                      animation: `sw-float-up ${2.5 + i * 0.5}s ease-out infinite`,
                      animationDelay: `${i * 0.7}s`,
                    }}>{sym}</span>
                  ))}
                </div>
                <div className="relative z-10 px-6 pt-7 pb-8 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-0.5"
                    style={{ color: "rgba(255,255,255,0.35)" }}>Daily Spin Wheel</p>
                  <p className="text-[10px] mb-6" style={{ color: "rgba(255,255,255,0.22)" }}>
                    Spin once a day · Win up to 50 Goins
                  </p>

                  {/* Slightly larger wheel */}
                  <div ref={swWheelRef} style={{ transform: "scale(1.08)", transformOrigin: "center" }}>
                    <SpinWheelSVG deg={swDeg} spinning={swSpinning} />
                  </div>

                  {/* Segment legend */}
                  <div className="mt-7 flex flex-wrap justify-center gap-1.5">
                    {SW_SEGS.filter((s, i, arr) => arr.findIndex(x => x.label === s.label) === i).map(seg => (
                      <span key={seg.label}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
                        style={{ background: seg.color + "bb" }}>
                        {seg.goins === 0 ? "💨 Miss" : `🪙 ${seg.goins}G`}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 space-y-3">
                    {swResult && (
                      <div className="rounded-2xl py-3.5 px-5 font-black text-sm animate-bounce-once"
                        style={{ background: swResult.g > 0 ? "#EF3752" : "rgba(255,255,255,0.06)", color: "white" }}>
                        {swResult.g > 0 ? `🎉 You won ${swResult.g} Goins!` : "Better luck tomorrow 🤞"}
                      </div>
                    )}
                    <button onClick={handleSwSpin} disabled={swSpinning || !coins?.canSpin}
                      className="w-full py-4 rounded-xl text-sm font-black transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={coins?.canSpin && !swSpinning
                        ? { background: "linear-gradient(135deg, #EF3752 0%, #c2185b 100%)", color: "#fff",
                            boxShadow: "0 4px 24px rgba(239,55,82,0.45)" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }}>
                      {swSpinning ? "Spinning… 🎡" : coins?.canSpin ? "🎰 Spin Now!" : "Come back tomorrow"}
                    </button>
                    {!coins?.canSpin && !swSpinning && (
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                        Next spin available in ~24h
                      </p>
                    )}
                    {swError && <p className="text-[11px] text-red-400">{swError}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ── 3b. Try Luck / Pick Me — DARK premium card ───────────────── */}
            {gameView === "pick" && (
              <div className="rounded-2xl overflow-hidden relative"
                style={{
                  background: "linear-gradient(160deg, #0d0f1d 0%, #111420 100%)",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}>
                {/* Red glow line at top */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(239,55,82,0.7), transparent)" }} />
                <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
                  {["🎁","🎀","⭐","✨","🎊","💫"].map((sym, i) => (
                    <span key={i} className="absolute text-sm" style={{
                      left: `${5 + i * 16}%`, bottom: "-10px", opacity: 0,
                      animation: `sw-float-up ${2.5 + i * 0.5}s ease-out infinite`,
                      animationDelay: `${i * 0.8}s`,
                    }}>{sym}</span>
                  ))}
                </div>
                <div className="relative z-10 px-6 pt-7 pb-8 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] mb-0.5"
                    style={{ color: "rgba(255,255,255,0.35)" }}>Try Your Luck</p>
                  <p className="text-[10px] mb-5" style={{ color: "rgba(255,255,255,0.22)" }}>
                    Pick a gift box to reveal your Goins
                  </p>
                  <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                    {[0,1,2,3,4,5].map(idx => {
                      const isPicked = pickedBox === idx;
                      const isRevealed = pickMode === "revealed" && isPicked;
                      const isDimmed   = pickMode === "revealed" && !isPicked;
                      const isAnimating = pickMode === "picking" && isPicked;
                      const EMOJIS = ["🎁","🎀","🎊","🎈","🏆","🌟"];
                      return (
                        <button key={idx}
                          onClick={() => pickMode === "idle" && coins?.canSpin && handlePickMe(idx)}
                          disabled={pickMode !== "idle" || !coins?.canSpin}
                          className={`relative h-24 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-500 ${
                            isRevealed ? "scale-110" : isDimmed ? "opacity-30 scale-95" : "hover:scale-105 active:scale-95"
                          } ${!coins?.canSpin ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                          style={{
                            background: isRevealed
                              ? (pickResult?.g ?? 0) > 0 ? "#EF3752" : "rgba(255,255,255,0.08)"
                              : isAnimating ? "rgba(239,55,82,0.15)" : "rgba(255,255,255,0.07)",
                            border: isRevealed && (pickResult?.g ?? 0) > 0
                              ? "2px solid rgba(239,55,82,0.6)"
                              : "1px solid rgba(255,255,255,0.12)",
                          }}>
                          <span className={`text-3xl transition-all duration-500 ${isAnimating ? "animate-bounce" : ""}`}>
                            {isRevealed ? ((pickResult?.g ?? 0) > 0 ? "🪙" : "💨") : EMOJIS[idx]}
                          </span>
                          {isRevealed && (
                            <span className="text-white font-black text-sm leading-none">
                              {(pickResult?.g ?? 0) > 0 ? `${pickResult!.g}G` : "Miss"}
                            </span>
                          )}
                          {!isRevealed && !isAnimating && (
                            <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>Tap to pick</span>
                          )}
                          {isAnimating && (
                            <span className="text-amber-400 text-[9px] font-bold animate-pulse">Opening…</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-5 space-y-2">
                    {pickMode === "revealed" && pickResult && (
                      <div className="rounded-2xl py-3 px-5 font-black text-sm"
                        style={{ background: pickResult.g > 0 ? "#EF3752" : "rgba(255,255,255,0.05)", color: "white" }}>
                        {pickResult.g > 0 ? `🎉 You found ${pickResult.g} Goins!` : "Empty box — better luck tomorrow! 🍀"}
                      </div>
                    )}
                    {pickMode === "idle" && !coins?.canSpin && (
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                        Come back tomorrow for your next pick
                      </p>
                    )}
                    {pickError && <p className="text-[11px] text-red-400">{pickError}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ── 4. Membership Progress — light card ──────────────────────── */}
            <div className="rounded-2xl bg-white shadow-sm p-5" style={{ border: "1px solid #F3F4F6" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#FEF3C7" }}>
                    <Award className="w-5 h-5" style={{ color: "#F59E0B" }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#111827" }}>
                      {(coins?.balance ?? 0) < 100  ? "Bronze"
                      : (coins?.balance ?? 0) < 500  ? "Silver"
                      : (coins?.balance ?? 0) < 2000 ? "Gold" : "Platinum"} Member
                    </p>
                    <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{coins?.balance ?? 0} Goins earned</p>
                  </div>
                </div>
                <span className="text-sm font-black" style={{ color: "#EF3752" }}>
                  {(coins?.balance ?? 0) < 100  ? `${100  - (coins?.balance ?? 0)}G to Silver`
                  : (coins?.balance ?? 0) < 500  ? `${500  - (coins?.balance ?? 0)}G to Gold`
                  : (coins?.balance ?? 0) < 2000 ? `${2000 - (coins?.balance ?? 0)}G to Platinum`
                  : "Max Rank! 🏆"}
                </span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    background: "linear-gradient(90deg, #F59E0B, #FCD34D)",
                    width: `${Math.min(100, ((coins?.balance ?? 0) % (
                      (coins?.balance ?? 0) < 100 ? 100 :
                      (coins?.balance ?? 0) < 500 ? 500 :
                      (coins?.balance ?? 0) < 2000 ? 2000 : 2000
                    )) / (
                      (coins?.balance ?? 0) < 100 ? 100 :
                      (coins?.balance ?? 0) < 500 ? 400 :
                      (coins?.balance ?? 0) < 2000 ? 1500 : 1
                    ) * 100)}%`,
                  }} />
              </div>
            </div>

            {/* ── 5. Ways to Earn — light card with colored icon accents ───── */}
            <div className="rounded-2xl bg-white shadow-sm overflow-hidden" style={{ border: "1px solid #F3F4F6" }}>
              <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
                <Sparkles className="w-4 h-4" style={{ color: "#F59E0B" }} />
                <h3 className="font-bold text-base" style={{ color: "#111827" }}>Ways to Earn Goins</h3>
              </div>
              {[
                { Icon: ShoppingCart, label: "Place a prepaid order", note: "Per order · = ₹10",       value: "+100", iconBg: "#FEF3C7", iconClr: "#D97706" },
                { Icon: RotateCcw,    label: "Spin or Pick daily",    note: "Once per day",              value: "0–50",  iconBg: "#F0FDF4", iconClr: "#16A34A" },
                { Icon: Users,        label: "Refer a friend",        note: "When they order · = ₹50",  value: "+500", iconBg: "#FDF4FF", iconClr: "#9333EA" },
                { Icon: Star,         label: "Write a review",        note: "After delivery",            value: "+20",  iconBg: "#EFF6FF", iconClr: "#2563EB" },
              ].map((item) => (
                <div key={item.label}
                  className="flex items-center gap-3 px-5 py-3.5"
                  style={{ borderTop: "1px solid #F3F4F6" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: item.iconBg }}>
                    <item.Icon className="w-5 h-5" style={{ color: item.iconClr }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#111827" }}>{item.label}</p>
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>{item.note}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-sm shrink-0"
                    style={{ background: "#FEF3C7", color: "#D97706" }}>
                    {item.value} <Coins className="w-3 h-3" />
                  </span>
                </div>
              ))}
              <div className="h-1" />
            </div>

            {/* ── 6. Transaction History — light card ──────────────────────── */}
            <div className="rounded-2xl bg-white shadow-sm p-5" style={{ border: "1px solid #F3F4F6" }}>
              <div className="flex items-center gap-2.5 mb-4">
                <ArrowUpDown className="w-4 h-4" style={{ color: "#9CA3AF" }} />
                <h3 className="font-bold text-base" style={{ color: "#111827" }}>Transaction History</h3>
              </div>
              {coinTxs === null ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: "#F3F4F6" }} />
                  ))}
                </div>
              ) : coinTxs.length === 0 ? (
                <div className="text-center py-8">
                  <Coins className="w-8 h-8 mx-auto mb-2" style={{ color: "#D1D5DB" }} />
                  <p className="text-sm" style={{ color: "#9CA3AF" }}>No transactions yet. Spin or pick to start!</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "#F3F4F6" }}>
                  {coinTxs.map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 py-3.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                        style={{
                          background: tx.amount > 0 ? "#DCFCE7" : "#FEE2E2",
                          color: tx.amount > 0 ? "#16a34a" : "#dc2626",
                        }}>
                        {tx.amount > 0 ? "+" : "−"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "#111827" }}>
                          {tx.description ?? tx.reason ?? "Goins transaction"}
                        </p>
                        <p className="text-xs" style={{ color: "#9CA3AF" }}>{fmt(tx.createdAt)}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 font-bold text-sm shrink-0"
                        style={{ color: tx.amount > 0 ? "#16a34a" : "#dc2626" }}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount} <Coins className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <style>{`
              @keyframes sw-float-up {
                0%   { transform: translateY(0) rotate(0deg); opacity:0.6; }
                100% { transform: translateY(-100px) rotate(180deg); opacity:0; }
              }
              @keyframes bounce-once {
                0%, 100% { transform: translateY(0); }
                30% { transform: translateY(-8px); }
                60% { transform: translateY(-4px); }
              }
              .animate-bounce-once { animation: bounce-once 0.6s ease; }
            `}</style>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            REFER & EARN TAB
        ════════════════════════════════════════════════ */}
        {tab === "referral" && (
          <div className="space-y-6">
            {/* Hero */}
            <div className="rounded-2xl overflow-hidden shadow-sm text-center bg-card border border-border/40"
              style={{ borderTop: "2px solid #EF3752" }}>
              <div className="px-6 pt-8 pb-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Gift className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-foreground font-black text-xl mb-1">Refer & Earn 50 Goins</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Friend gets ₹50 off · You earn 50 Goins
                </p>
                {/* Code box */}
                <div className="mx-auto max-w-xs mb-4">
                  <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-2">Your Referral Code</p>
                  <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted border border-border/40">
                    <span className="flex-1 font-mono font-black text-xl tracking-[0.2em] text-foreground">
                      {referral?.code ?? "—"}
                    </span>
                    <button
                      onClick={() => { if(referral?.code){ navigator.clipboard.writeText(referral.code); toast("Code copied!"); }}}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground active:scale-95 transition-all bg-card border border-border/40 hover:text-foreground">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  {referral?.uses_count !== undefined && referral.uses_count > 0 && (
                    <p className="text-muted-foreground text-xs mt-2">Used {referral.uses_count} {referral.uses_count === 1 ? "time" : "times"}</p>
                  )}
                </div>
                {/* Share buttons */}
                <div className="flex gap-2 justify-center">
                  <a href={referral?.code
                      ? `https://wa.me/?text=${encodeURIComponent(`🎁 Use my Gifteeng code *${referral.code}* to get ₹50 off! Shop personalised gifts → gifteeng.com`)}`
                      : "#"}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#25D366] text-white shadow-sm active:scale-95 transition-all">
                    <Share2 className="w-4 h-4" /> WhatsApp
                  </a>
                  <button
                    onClick={() => {
                      if (referral?.code && navigator.share) {
                        void navigator.share({ title:"Gifteeng Referral", text:`Use my code ${referral.code} for ₹50 off!`, url:"https://gifteeng.com" });
                      } else if (referral?.code) {
                        navigator.clipboard.writeText(referral.code); toast("Code copied!");
                      }
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground active:scale-95 transition-all bg-muted border border-border/40 hover:text-foreground">
                    <Copy className="w-4 h-4" /> Copy Link
                  </button>
                </div>
              </div>
            </div>

            {/* How it works */}
            <Card className="p-5">
              <SectionHeader icon={CheckCircle2} title="How it works" />
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-5 bottom-5 w-px bg-border/40" />
                {([
                  { icon: Share2,       text: "Share your unique referral code" },
                  { icon: ShoppingCart, text: "Friend enters code at checkout" },
                  { icon: CheckCircle2, text: "They place their first order" },
                  { icon: Coins,        text: "You earn 50 Goins instantly!" },
                ] as const).map((step, i) => (
                  <div key={i} className="flex items-center gap-4 py-3 relative">
                    <div className="w-8 h-8 rounded-full bg-card border-2 border-primary flex items-center justify-center shrink-0 z-10">
                      <step.icon className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm text-foreground">{step.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            PROFILE TAB
        ════════════════════════════════════════════════ */}
        {tab === "profile" && (
          <div className="space-y-6">
            {/* Personal details */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-5">
                <SectionHeader icon={User} title="Personal Details" />
                {!editing && (
                  <button onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/5 transition-colors">
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div className="space-y-4">
                  {[
                    { label: "Full Name",  val: formName,  set: setFormName,  ph: "Your full name",  type: "text"  },
                    { label: "Email",      val: formEmail, set: setFormEmail, ph: "your@email.com",  type: "email" },
                  ].map(({ label, val, set, ph, type }) => (
                    <div key={label}>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">{label}</label>
                      <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                        className="w-full rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/50 transition-all" />
                    </div>
                  ))}
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setEditing(false)}
                      className="flex-1 py-3 rounded-xl border border-border/60 text-sm font-semibold text-muted-foreground hover:bg-muted/40 transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveProfile} disabled={saving}
                      className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-all bg-[#EF3752]">
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {([
                    { icon: User,       label: "Name",  value: customer?.fullName },
                    { icon: Mail,       label: "Email", value: customer?.email },
                    { icon: Smartphone, label: "Phone", value: fmtPhone(customer?.phone) },
                  ] as const).map(f => (
                    <div key={f.label} className="flex items-center gap-3 py-3.5">
                      <f.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{f.label}</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                          {f.value || <span className="text-muted-foreground font-normal italic text-xs">Not set</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Delivery zone — reopens the Mumbai / Pan-India picker.
                Clears the saved choice so the popup mounts fresh and the
                SameDayBadge / pricing re-evaluates against the new pick. */}
            <Card className="p-5">
              <SectionHeader icon={MapPin} title="Delivery zone" />
              <p className="text-xs text-muted-foreground -mt-2 mb-3">
                Switch between Mumbai (same-day) and Pan-India (3–5 days).
              </p>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("gifteeng.delivery_zone_choice");
                    localStorage.removeItem("gifteeng.deliveryPincode");
                  } catch { /* ignore */ }
                  window.dispatchEvent(new Event("gifteeng:open-delivery-zone"));
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-primary/30 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
              >
                Change zone
              </button>
            </Card>

            {/* Appearance */}
            <Card className="p-5">
              <SectionHeader icon={Monitor} title="Appearance" />
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "light",  label: "Light",  Icon: Sun     },
                  { id: "dark",   label: "Dark",   Icon: Moon    },
                  { id: "system", label: "System", Icon: Monitor },
                ] as const).map(({ id, label, Icon }) => (
                  <button key={id} onClick={() => setTheme(id)}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-xs font-bold transition-all ${
                      theme === id
                        ? "border-[#EF3752] text-[#EF3752] bg-[#EF3752]/5"
                        : "border-border/40 text-muted-foreground hover:border-[#EF3752]/30 bg-muted"
                    }`}>
                    <Icon className="w-5 h-5" />
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            {/* Occasion Reminders */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader icon={Bell} title="Occasion Reminders" />
                {!addingReminder && (
                  <button onClick={() => setAddingReminder(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/5 transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>

              {reminders.length === 0 && !addingReminder && (
                <div className="text-center py-6">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Add birthdays & anniversaries —<br />we&apos;ll remind you to order in time!</p>
                </div>
              )}

              <div className="divide-y divide-border/40">
                {reminders.map(r => {
                  const days = daysUntil(r.month, r.day);
                  return (
                    <div key={r.id} className="flex items-center gap-3 py-3.5">
                      <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                        {(() => { const RIcon = reminderIcon(r.type); return <RIcon className="w-5 h-5 text-muted-foreground" />; })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{r.name}
                          <span className="text-muted-foreground font-normal text-xs ml-1">· {r.relation}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{MONTHS_LONG[r.month-1]} {r.day}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                          style={days === 0 ? { background: "#c2185b", color: "#fff" } : days <= 7 ? {
                            color: isDark ? "#f87171" : "#e11d48",
                            background: isDark ? "rgba(239,68,68,0.15)" : "#fff1f2",
                          } : {
                            color: "hsl(var(--muted-foreground))",
                            background: "hsl(var(--muted) / 0.6)",
                          }}>
                          {days === 0 ? "Today!" : `${days}d`}
                        </span>
                        <button onClick={() => deleteReminder(r.id)}
                          className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {addingReminder && (
                <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                  <input placeholder="Person's name (e.g. Mom)" value={newRName} onChange={e => setNewRName(e.target.value)}
                    className="w-full rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <input placeholder="Your relation (e.g. Wife, Best Friend)" value={newRRelation} onChange={e => setNewRRelation(e.target.value)}
                    className="w-full rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <select value={newRType} onChange={e => setNewRType(e.target.value as ReminderType)}
                    className="w-full rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none">
                    {REMINDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <select value={newRMonth} onChange={e => setNewRMonth(Number(e.target.value))}
                      className="flex-1 rounded-xl border border-border/70 bg-background px-3 py-3 text-sm focus:outline-none">
                      {MONTHS_LONG.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                    <select value={newRDay} onChange={e => setNewRDay(Number(e.target.value))}
                      className="w-24 rounded-xl border border-border/70 bg-background px-3 py-3 text-sm focus:outline-none">
                      {Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setAddingReminder(false)}
                      className="flex-1 py-3 rounded-xl border border-border/60 text-sm font-semibold text-muted-foreground">Cancel</button>
                    <button onClick={addReminder}
                      className="flex-1 py-3 rounded-xl text-white text-sm font-bold bg-[#EF3752]">Save</button>
                  </div>
                </div>
              )}
            </Card>

            {/* Saved Addresses */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader icon={MapPin} title="Saved Addresses" />
                {!showAddressForm && (
                  <button onClick={() => setShowAddressForm(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/5 transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                )}
              </div>

              {/* Loading skeleton */}
              {addresses === null && (
                <div className="space-y-2">
                  {[1,2].map(i=><div key={i} className="h-16 rounded-xl bg-muted animate-pulse"/>)}
                </div>
              )}

              {/* Existing addresses */}
              {addresses !== null && addresses.length === 0 && !showAddressForm && (
                <div className="text-center py-6">
                  <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground mb-3">No saved addresses yet.</p>
                  <button onClick={() => setShowAddressForm(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:opacity-80 transition-opacity">
                    <Plus className="w-4 h-4" /> Add New Address
                  </button>
                </div>
              )}

              {addresses !== null && addresses.length > 0 && (
                <div className="divide-y divide-border/40">
                  {addresses.map(a => (
                    <div key={a.id} className="flex items-start gap-3 py-3.5">
                      <div className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {a.name}
                          {a.isDefault && (
                            <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Default</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} – {a.pincode}
                        </p>
                        <p className="text-xs text-muted-foreground">{a.phone}</p>
                      </div>
                      <button onClick={() => deleteAddress(a.id)}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add address form */}
              {showAddressForm && (
                <div className={`${(addresses?.length ?? 0) > 0 ? "mt-4 pt-4 border-t border-border/40 " : ""}space-y-3`}>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">New Address</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Full name *" value={addrName} onChange={e => setAddrName(e.target.value)}
                      className="col-span-2 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input placeholder="Phone *" value={addrPhone} onChange={e => setAddrPhone(e.target.value)}
                      className="col-span-2 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input placeholder="Address line 1 *" value={addrLine1} onChange={e => setAddrLine1(e.target.value)}
                      className="col-span-2 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input placeholder="Line 2 (optional)" value={addrLine2} onChange={e => setAddrLine2(e.target.value)}
                      className="col-span-2 rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input placeholder="City *" value={addrCity} onChange={e => setAddrCity(e.target.value)}
                      className="rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input placeholder="State" value={addrState} onChange={e => setAddrState(e.target.value)}
                      className="rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input placeholder="Pincode *" value={addrPincode} onChange={e => setAddrPincode(e.target.value)} maxLength={6}
                      className="rounded-xl border border-border/70 bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowAddressForm(false); setAddrName(""); setAddrPhone(""); setAddrLine1(""); setAddrLine2(""); setAddrCity(""); setAddrState(""); setAddrPincode(""); }}
                      className="flex-1 py-3 rounded-xl border border-border/60 text-sm font-semibold text-muted-foreground hover:bg-muted/40 transition-colors">
                      Cancel
                    </button>
                    <button onClick={saveAddress} disabled={addrBusy}
                      className="flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-all bg-[#EF3752]">
                      {addrBusy ? "Saving…" : "Save Address"}
                    </button>
                  </div>
                </div>
              )}
            </Card>

            {/* Sign Out */}
            <button onClick={doLogout}
              className="w-full py-4 rounded-2xl border border-destructive/30 text-destructive font-bold text-sm hover:bg-destructive/5 transition-colors flex items-center justify-center gap-2 bg-card">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

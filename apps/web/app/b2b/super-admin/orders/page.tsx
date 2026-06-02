"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import JSZip from "jszip";
import {
  ShoppingCart, Eye, Download, Clock, CheckCircle2, XCircle, Banknote,
  Smartphone, Package, ChevronDown, Search, Image, Type,
  Palette, Ruler, Printer, Sparkles, Box, Phone, Mail, MapPin, X, Link as LinkIcon, ExternalLink,
  Truck, Loader2, MessageCircle, Send, Copy, Check, Archive, Trash2, FileText, Tag, Gift,
  AlertTriangle, Flame, ArrowUpDown, Filter, CalendarDays, Paintbrush, ShoppingBag, Zap, Timer, Building2,
  Brain,
} from "lucide-react";
import {
  toast, useToast,
  Badge, Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Popover, PopoverContent, PopoverTrigger,
  Textarea, Checkbox,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeDelete, safeGet, safePatch, safePost } from "@/lib/admin-api";

// ─── Local stubs ──────────────────────────────────────────────
const useAuth = () => ({ user: { id: "stub" }, profile: { role: "super_admin" } });

// thermalPrint stubs
type PrintQueueItem = { order: any; items: any[] };
// Prints in a popup window; user hits Ctrl+S or "Save as PDF" in the browser
// print dialog. Zero deps, works offline.
function openPrint(html: string, title: string) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) { alert("Please allow popups to print"); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; color: #111; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  h2 { font-size: 14px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.12em; color: #666; }
  .brand { font-size: 26px; font-weight: 900; color: #EF3752; letter-spacing: -0.01em; }
  .row { display: flex; justify-content: space-between; gap: 16px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eee; }
  th { background: #f8f8f8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; }
  .r { text-align: right; } .c { text-align: center; }
  .mono { font-family: ui-monospace, monospace; }
  .big { font-size: 22px; font-weight: 900; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eef; color: #336; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  @media print { body { padding: 0 } .no-print { display: none } }
</style>
</head><body>${html}<script>window.onload=()=>setTimeout(()=>window.print(),300);</script></body></html>`);
  w.document.close();
}

function esc(s: any): string {
  return String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" } as any)[c]);
}

const generateInvoicePDF = (order: any, items: any[] = []) => {
  const lines = (items || []).map((it) => `
    <tr>
      <td>${esc(it.product_name || it.productId || "Item")}</td>
      <td class="c">${esc(it.quantity || it.qty || 1)}</td>
      <td class="r mono">₹${Number(it.unit_price ?? it.unitPrice ?? 0).toFixed(2)}</td>
      <td class="r mono">₹${Number(it.total_price ?? it.totalPrice ?? 0).toFixed(2)}</td>
    </tr>`).join("") || `<tr><td colspan="4" class="c" style="color:#999;padding:20px">No line items recorded</td></tr>`;
  const subtotal = Number(order.subtotal ?? 0);
  const delivery = Number(order.delivery_charge ?? order.shippingTotal ?? 0);
  const total = Number(order.total ?? order.grandTotal ?? 0);
  const tax = total - subtotal - delivery > 0 ? total - subtotal - delivery : 0;
  const orderNo = esc(order.order_number ?? order.orderNumber ?? order.id?.slice(0, 8).toUpperCase() ?? "—");
  const createdRaw = order.created_at ?? order.createdAt;
  const created = createdRaw ? new Date(createdRaw).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const html = `
    <div class="row" style="align-items:flex-start">
      <div>
        <div class="brand">Gifteeng</div>
        <div style="font-size:11px;color:#666">gifteeng.com · Mumbai, India</div>
      </div>
      <div style="text-align:right">
        <h1>Tax Invoice</h1>
        <div style="font-size:12px">No: <span class="mono">${orderNo}</span></div>
        <div style="font-size:11px;color:#666">Date: ${created}</div>
      </div>
    </div>
    <div class="row">
      <div class="card" style="flex:1">
        <h2>Bill To</h2>
        ${order.company_name
          ? `<div style="font-weight:800;font-size:14px">${esc(order.company_name)}</div>
             <div style="font-size:11px;color:#666;margin-top:1px">Contact: ${esc(order.customer_name || "—")}</div>`
          : `<div style="font-weight:700">${esc(order.customer_name || "—")}</div>`}
        <div style="font-size:12px;color:#555;margin-top:4px">${esc(order.shipping_address || "")}</div>
        <div style="font-size:12px;color:#555">${esc([order.shipping_city, order.shipping_state, order.shipping_pincode].filter(Boolean).join(", "))}</div>
        <div style="font-size:12px;color:#555">${esc(order.customer_phone || "")}</div>
        ${order.gst_number ? `<div style="font-size:11px;color:#555;margin-top:6px">GSTIN: <span class="mono">${esc(order.gst_number)}</span></div>` : ""}
      </div>
      <div class="card" style="flex:1">
        <h2>Payment</h2>
        <div style="font-size:12px"><b>Method:</b> ${esc(order.payment_method || "—")}</div>
        <div style="font-size:12px"><b>Status:</b> ${esc(order.payment_status || "—")}</div>
        ${order.coupon_code ? `<div style="font-size:12px"><b>Coupon:</b> ${esc(order.coupon_code)}</div>` : ""}
      </div>
    </div>
    <table style="margin-top:14px">
      <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Unit</th><th class="r">Total</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>
    <div class="row" style="margin-top:14px">
      <div style="flex:1"></div>
      <div style="min-width:260px">
        <div class="row" style="padding:4px 0"><span>Subtotal</span><span class="mono">₹${subtotal.toFixed(2)}</span></div>
        ${delivery ? `<div class="row" style="padding:4px 0"><span>Shipping</span><span class="mono">₹${delivery.toFixed(2)}</span></div>` : ""}
        ${tax ? `<div class="row" style="padding:4px 0"><span>Tax (GST)</span><span class="mono">₹${tax.toFixed(2)}</span></div>` : ""}
        <div class="row" style="padding:10px 0 4px;border-top:2px solid #111;margin-top:6px"><span class="big">Total</span><span class="big">₹${total.toFixed(2)}</span></div>
      </div>
    </div>
    <div style="margin-top:28px;font-size:11px;color:#888;text-align:center">
      Thank you for shopping with Gifteeng! Questions? hello@gifteeng.com
    </div>
  `;
  openPrint(html, `Invoice-${orderNo}`);
};

const generateLabelPDF = (order: any, _items: any[] = []) => {
  const orderNo = esc(order.order_number ?? order.orderNumber ?? order.id?.slice(0, 8).toUpperCase() ?? "—");
  const html = `
    <div style="width:4in;border:2px solid #000;padding:12px;font-family:monospace">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px">
        <div style="font-weight:900;font-size:18px">GIFTEENG</div>
        <div style="text-align:right;font-size:10px">Tracking</div>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:#666">ORDER</div>
        <div style="font-size:16px;font-weight:900">#${orderNo}</div>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:#666">SHIP TO</div>
        <div style="font-size:13px;font-weight:700">${esc(order.customer_name || "—")}</div>
        <div style="font-size:11px">${esc(order.shipping_address || "")}</div>
        <div style="font-size:11px">${esc([order.shipping_city, order.shipping_state, order.shipping_pincode].filter(Boolean).join(", "))}</div>
        <div style="font-size:11px">${esc(order.customer_phone || "")}</div>
      </div>
      <div style="border-top:1px dashed #000;padding-top:8px;margin-top:8px;display:flex;justify-content:space-between;font-size:10px">
        <span>Method: <b>${esc(order.payment_method || "—")}</b></span>
        <span>COD: <b>${order.payment_method === "cod" ? "₹" + Number(order.total ?? 0).toFixed(0) : "—"}</b></span>
      </div>
      ${order.gift_packaging ? `<div style="margin-top:8px;padding:6px;background:#fce7f3;border:1px dashed #ec4899;font-size:10px;text-align:center;font-weight:700">🎁 GIFT PACKAGING</div>` : ""}
      ${order.gift_message ? `<div style="margin-top:6px;padding:6px;background:#fef3c7;font-size:10px;font-style:italic">"${esc(order.gift_message)}"</div>` : ""}
    </div>
  `;
  openPrint(html, `Label-${orderNo}`);
};
const generateCombinedPDF = (order: any, items: any[] = []) => {
  generateInvoicePDF(order, items);
  setTimeout(() => generateLabelPDF(order, items), 600);
};
const batchDownloadLabels = (queue: any[]) => {
  (queue || []).forEach((o, i) => setTimeout(() => generateLabelPDF(o, o.items || []), i * 400));
};
const batchDownloadInvoices = (queue: any[]) => {
  (queue || []).forEach((o, i) => setTimeout(() => generateInvoicePDF(o, o.items || []), i * 400));
};
const batchDownloadCombined = (queue: any[]) => {
  (queue || []).forEach((o, i) => setTimeout(() => generateCombinedPDF(o, o.items || []), i * 900));
};

// ─── API helpers ──────────────────────────────────────────────

// ─── API shape adapter ──────────────────────────────────────────
// Backend returns camelCase Prisma models; this page was written expecting
// snake_case. Rather than rewrite the whole page, we map once on fetch.
function mapApiOrderToUi(api: any): any {
  if (!api || typeof api !== "object") return api;
  const ship = api.shippingAddress ?? {};
  const bill = api.billingAddress  ?? {};
  const addrStr = (a: any) => {
    if (!a) return "";
    return [a.line1, a.line2].filter(Boolean).join(", ");
  };
  return {
    ...api,
    // ids & numbers
    order_number:       api.orderNumber       ?? api.order_number       ?? `${(api.id ?? "").toString().slice(0, 8).toUpperCase()}`,
    payment_method:     api.paymentMethod     ?? api.payment_method     ?? "",
    payment_status:     api.paymentStatus     ?? api.payment_status     ?? "",
    // Normalise API status names (new_order→pending, in_production→processing, etc.)
    status:             API_TO_UI_STATUS[api.status] ?? api.status ?? "",
    // customer
    customer_name:      ship.fullName         ?? api.customer_name      ?? api.customer?.fullName ?? "",
    customer_phone:     ship.phone            ?? api.customer_phone     ?? api.customer?.phone    ?? "",
    customer_email:     api.customer?.email   ?? api.customer_email     ?? "",
    // addresses
    shipping_address:   addrStr(ship)         || api.shipping_address   || "",
    shipping_city:      ship.city             ?? api.shipping_city      ?? "",
    shipping_state:     ship.state            ?? api.shipping_state     ?? "",
    shipping_pincode:   ship.pincode          ?? api.shipping_pincode   ?? "",
    billing_name:       bill.fullName         ?? "",
    billing_address:    addrStr(bill),
    // totals
    subtotal:           Number(api.subtotal ?? 0),
    delivery_charge:    Number(api.shippingTotal ?? api.delivery_charge ?? 0),
    total:              Number(api.grandTotal   ?? api.total ?? 0),
    // dates
    // Order model uses placedAt (not createdAt) as the order timestamp
    created_at:         (api.placedAt ?? api.createdAt ?? api.created_at)?.toString() ?? null,
    updated_at:         (api.updatedAt ?? api.updated_at)?.toString()  ?? null,
    // gifting extras
    gift_packaging:     !!api.giftPackaging,
    gift_message:       api.giftMessage       ?? api.gift_message       ?? "",
    gst_number:         api.gstNumber         ?? api.gst_number         ?? "",
    company_name:       api.companyName       ?? api.company_name       ?? "",
    coupon_code:        api.discountCode      ?? api.coupon_code        ?? "",
    tracking_url:       api.trackingUrl       ?? api.tracking_url       ?? "",
    notes:              api.notes             ?? "",
    // Customer-requested delivery date (stored in order.metadata.requestedDeliveryDate)
    requested_delivery_date:        api.metadata?.requestedDeliveryDate        ?? null,
    requested_delivery_updated_at:  api.metadata?.requestedDeliveryUpdatedAt   ?? null,
    items:              Array.isArray(api.items) ? api.items.map(mapApiOrderItemToUi) : [],
  };
}
function mapApiOrderItemToUi(api: any): any {
  if (!api || typeof api !== "object") return api;
  const snap = api.snapshot ?? {};
  const firstImg = Array.isArray(snap.images) && snap.images.length > 0
    ? (typeof snap.images[0] === "string" ? snap.images[0] : snap.images[0]?.url ?? "")
    : "";
  const v = api.variantOptions ?? {};
  const cust = api.customization ?? {};

  // ── Multi-design format: { designs: [{ canvasJSON, previewDataUrl }] }
  const rawDesigns: any[] = Array.isArray(cust.designs) && cust.designs.length > 0
    ? cust.designs
    : cust.previewDataUrl                            // legacy single-design
      ? [{ canvasJSON: cust.canvasJSON ?? null, previewDataUrl: cust.previewDataUrl }]
      : [];

  // Extract per-design previews, fonts, and text strings from canvasJSON
  const designPreviews: string[] = rawDesigns.map((d: any) => d.previewDataUrl ?? "").filter(Boolean);
  const fontsSet = new Set<string>();
  const textsArr: string[] = [];

  rawDesigns.forEach((d: any) => {
    try {
      const canvas = typeof d.canvasJSON === "string" ? JSON.parse(d.canvasJSON) : (d.canvasJSON ?? {});

      // ── SimpleZoneCustomizer format ──────────────────────────────────────
      if (canvas.__simpleZones) {
        // Photos stored in fills.images as { zoneId: dataUrl }
        const imgFills: Record<string, string> = canvas.fills?.images ?? {};
        // (photos are already captured separately; skip here to avoid duplication)
        void imgFills; // used in ZIP download, not for text/font extraction

        // Text stored in fills.texts as { zoneId: textString }
        const txtFills: Record<string, string> = canvas.fills?.texts ?? {};
        for (const t of Object.values(txtFills)) {
          if (typeof t === "string" && t.trim()) textsArr.push(t.trim());
        }
        // Fonts from textZones config
        for (const tz of (canvas.textZones ?? [])) {
          if (tz.fontFamily) fontsSet.add(tz.fontFamily);
        }
        return; // done for this design
      }

      // ── Fabric.js canvas format (5.x lowercase / 6.x capitalized types) ──
      (canvas?.objects ?? []).forEach((obj: any) => {
        if (obj.fontFamily) fontsSet.add(obj.fontFamily);
        const t = (obj.type ?? "").toLowerCase();
        if ((t === "textbox" || t === "i-text" || t === "text" || t === "itext") && obj.text?.trim()) {
          textsArr.push(obj.text.trim());
        }
      });
    } catch { /* malformed JSON — skip silently */ }
  });

  return {
    ...api,
    product_id:    api.productId    ?? api.product_id    ?? "",
    product_name:  snap.title       ?? api.title         ?? api.product_name   ?? "",
    product_image: firstImg         ?? api.product_image ?? "",
    quantity:      api.qty          ?? api.quantity      ?? 1,
    unit_price:    Number(api.unitPrice  ?? api.unit_price  ?? 0),
    total_price:   Number(api.totalPrice ?? api.total_price ?? 0),
    selected_size:       v.Size        ?? v.size        ?? "",
    selected_color:      v.Color       ?? v.color       ?? "",
    selected_material:   v.Material    ?? v.material    ?? "",
    selected_finish:     v.Finish      ?? v.finish      ?? "",
    selected_printing:   v.Printing    ?? v.printing    ?? "",
    // legacy single-design fields (kept for backward compat)
    custom_text:         cust.text        ?? "",
    custom_photo_url:    cust.photoUrl    ?? "",
    preview_image_url:   designPreviews[0] ?? cust.previewDataUrl ?? "",
    // new multi-design fields
    designs:         rawDesigns,
    design_previews: designPreviews,
    fonts_from_designs: [...fontsSet],
    texts_from_designs: textsArr,
  };
}

// ─── AI helper ────────────────────────────────────────────────
async function aiWrite(prompt: string, context?: string): Promise<string> {
  const result = await safePost<{ text?: string }>(
    "/admin/ai/write",
    { prompt, context, field: "tags" },
    {}
  );
  return result?.text ?? "";
}

// ─── Types ────────────────────────────────────────────────────
interface OrderItem {
  id: string; product_id: string; product_name: string; product_image: string;
  quantity: number; unit_price: number; total_price: number;
  selected_size: string; selected_color: string; selected_material: string;
  selected_finish: string; selected_printing: string;
  // legacy single-design
  custom_text: string; custom_font: string; custom_color_code: string;
  custom_photo_url: string; preview_image_url: string;
  fonts_used: string[]; images_used: string[];
  // multi-design (new customizer)
  designs: Array<{ canvasJSON: any; previewDataUrl: string }>;
  design_previews: string[];
  fonts_from_designs: string[];
  texts_from_designs: string[];
}

interface Order {
  id: string; order_number: string; status: string; payment_method: string; payment_status: string;
  customer_name: string; customer_phone: string; customer_email: string;
  shipping_address: string; shipping_city: string; shipping_pincode: string; shipping_state: string;
  subtotal: number; delivery_charge: number; cod_charge: number; total: number;
  notes: string; tracking_url: string; created_at: string; updated_at: string;
  coupon_code: string; gift_packaging: boolean; gift_packaging_charge: number; gift_message: string;
  invoice_number?: string; gst_number?: string; company_name?: string;
  cgst?: number | null; sgst?: number | null; igst?: number | null;
  requested_delivery_date?: string | null;
  requested_delivery_updated_at?: string | null;
  _hasCustomization?: boolean;
  _ageHours?: number;
  _urgency?: "overdue" | "urgent" | "today" | "normal";
}

// ─── AI Tag colors ────────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  "high-value": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "urgent": "bg-red-100 text-red-700 border-red-300",
  "repeat-customer": "bg-blue-100 text-blue-700 border-blue-300",
  "gift-occasion": "bg-pink-100 text-pink-700 border-pink-300",
  "corporate": "bg-indigo-100 text-indigo-700 border-indigo-300",
  "first-time": "bg-emerald-100 text-emerald-700 border-emerald-300",
  "vip": "bg-purple-100 text-purple-700 border-purple-300",
  "standard": "bg-gray-100 text-gray-600 border-gray-300",
  "gift-recipient-bd": "bg-pink-100 text-pink-700 border-pink-300",
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] ?? "bg-gray-100 text-gray-600 border-gray-300";
}

const LS_TAG_KEY = (orderId: string) => `gifteeng.order.tags.${orderId}`;

function loadStoredTags(orderId: string): string[] {
  try {
    const raw = localStorage.getItem(LS_TAG_KEY(orderId));
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch { return []; }
}

function saveStoredTags(orderId: string, tags: string[]) {
  localStorage.setItem(LS_TAG_KEY(orderId), JSON.stringify(tags));
}

// Map API (DB) status names → UI display names (one-way normalisation on load)
const API_TO_UI_STATUS: Record<string, string> = {
  new_order:     "pending",
  in_production: "processing",
  ready_to_ship: "printed",
};
// Reverse map: what we send back to PATCH /status
const UI_TO_API_STATUS: Record<string, string> = {
  pending:    "new_order",
  processing: "in_production",
  printed:    "ready_to_ship",
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  incomplete:     { label: "Incomplete",      color: "bg-amber-500/10 text-amber-600 border-amber-500/20",   icon: Clock },
  pending:        { label: "Pending",          color: "bg-blue-500/10 text-blue-600 border-blue-500/20",      icon: Clock },
  new_order:      { label: "New Order",        color: "bg-blue-500/10 text-blue-600 border-blue-500/20",      icon: Clock },
  confirmed:      { label: "Confirmed",        color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  payment_pending:{ label: "Payment Pending",  color: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: Banknote },
  processing:     { label: "Processing",       color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",  icon: Package },
  in_production:  { label: "In Production",    color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",  icon: Package },
  printed:        { label: "Printed",          color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",      icon: Printer },
  ready_to_ship:  { label: "Ready to Ship",    color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",      icon: Printer },
  shipped:        { label: "Shipped",          color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Truck },
  delivered:      { label: "Delivered",        color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20", icon: CheckCircle2 },
  cancelled:      { label: "Cancelled",        color: "bg-red-500/10 text-red-600 border-red-500/20",         icon: XCircle },
  returned:       { label: "Returned",         color: "bg-red-500/10 text-red-700 border-red-500/20",         icon: XCircle },
  archived:       { label: "Archived",         color: "bg-muted text-muted-foreground border-border/30",       icon: Archive },
};
// Status options shown in the update select (de-duplicated, UI terms only)
const STATUS_SELECT_OPTIONS = [
  { value: "new_order",  label: "Pending / New" },
  { value: "confirmed",  label: "Confirmed" },
  { value: "in_production", label: "In Production" },
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "shipped",    label: "Shipped" },
  { value: "delivered",  label: "Delivered" },
  { value: "cancelled",  label: "Cancelled" },
  { value: "returned",   label: "Returned" },
];

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending;
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>;
};

const PayBadge = ({ method }: { method: string }) => {
  if (method === "cod") return <Badge variant="outline" className="gap-1 text-[9px] px-1.5 py-0 h-4"><Banknote className="w-2.5 h-2.5" /> COD</Badge>;
  if (method === "upi") return <Badge variant="outline" className="gap-1 text-[9px] px-1.5 py-0 h-4"><Smartphone className="w-2.5 h-2.5" /> UPI</Badge>;
  return <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{method || "—"}</Badge>;
};

function getOrderUrgency(order: Order): "overdue" | "urgent" | "today" | "normal" {
  const activeStatuses = ["pending", "confirmed", "processing", "payment_pending", "printed"];
  if (!activeStatuses.includes(order.status)) return "normal";
  const ageMs = Date.now() - new Date(order.created_at).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > 48) return "overdue";
  if (ageHours > 36) return "urgent";
  if (ageHours > 24) return "today";
  return "normal";
}

function getUrgencyLabel(u: Order["_urgency"]) {
  switch (u) {
    case "overdue": return { text: "OVERDUE — Ship NOW!", bg: "bg-red-600 text-white animate-pulse", icon: Flame };
    case "urgent": return { text: "Ship Today!", bg: "bg-orange-500 text-white", icon: AlertTriangle };
    case "today": return { text: "Ship Tomorrow", bg: "bg-yellow-400 text-yellow-900", icon: Timer };
    default: return null;
  }
}

function timeAgo(date: string | null | undefined) {
  if (!date) return "—";
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return "—";
  const h = (Date.now() - t) / (1000 * 60 * 60);
  if (h < 0.02) return "just now";
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${Math.round(h % 24)}h ago`;
}

function fmtDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  const t = new Date(date);
  if (isNaN(t.getTime())) return "—";
  return t.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(date: string | null | undefined): string {
  if (!date) return "—";
  const t = new Date(date);
  if (isNaN(t.getTime())) return "—";
  return t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const TABS = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "⚡ Needs Action" },
  { key: "incomplete", label: "Incomplete" },
  { key: "active", label: "Active" },
  { key: "printed", label: "Printed" },
  { key: "shipped", label: "Shipped" },
  { key: "completed", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "archived", label: "Archived" },
];

type SortKey = "newest" | "oldest" | "urgency" | "total_high" | "total_low";
type TypeFilter = "all" | "customized" | "non_customized";

const WA_TEMPLATES = (order: Order) => [
  { key: "order_confirmed", label: "✅ Confirmed", message: `Hi ${order.customer_name?.split(" ")[0] || "there"}! 👋\n\nYour order *#${order.order_number}* has been *confirmed*! 🎉\n\n🛍️ Total: ₹${order.total}\n📦 We'll start processing it right away.\n\nThank you! 💛` },
  { key: "order_processing", label: "🔧 Processing", message: `Hi ${order.customer_name?.split(" ")[0] || "there"}! 👋\n\nYour order *#${order.order_number}* is now being *processed & printed*. 🖨️✨\n\nWe'll notify you once it ships!\n\nThank you 🙏` },
  { key: "order_shipped", label: "🚚 Shipped", message: `Hi ${order.customer_name?.split(" ")[0] || "there"}! 👋\n\nYour order *#${order.order_number}* has been *shipped*! 🚀📦\n\n${order.tracking_url ? `🔍 Track: ${order.tracking_url}\n\n` : ""}📍 To: ${order.shipping_city || "your address"}\n\nExpected 2-4 business days 😊` },
  { key: "order_delivered", label: "🎉 Delivered", message: `Hi ${order.customer_name?.split(" ")[0] || "there"}! 🎉\n\nYour order *#${order.order_number}* has been *delivered*! 📦✅\n\nWe hope you love it! 💛\n\nThank you 🙏` },
  { key: "payment_pending", label: "💳 Payment", message: `Hi ${order.customer_name?.split(" ")[0] || "there"}! 👋\n\nYour order *#${order.order_number}* is awaiting *payment*.\n\n💰 Amount: ₹${order.total}\n\nPlease complete payment to proceed 🙏` },
  { key: "custom", label: "✍️ Custom", message: `Hi ${order.customer_name?.split(" ")[0] || "there"}! 👋\n\nRegarding order *#${order.order_number}*...\n\n` },
];

function WhatsAppPanel({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  const [selKey, setSelKey] = useState("order_confirmed");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const templates = WA_TEMPLATES(order);

  const pick = (key: string) => { setSelKey(key); const t = templates.find(t => t.key === key); if (t) setMessage(t.message); };
  const handleOpen = (o: boolean) => { setOpen(o); if (o && !message) pick(selKey); };
  const phone = order.customer_phone?.replace(/\D/g, "");
  const send = () => { if (!phone) return; const fp = phone.startsWith("91") ? phone : `91${phone}`; window.open(`https://wa.me/${fp}?text=${encodeURIComponent(message)}`, "_blank"); setOpen(false); };
  const copy = () => { navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700">
          <MessageCircle className="w-3 h-3" /> WhatsApp
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="end">
        <div className="p-3 border-b border-border bg-green-50 dark:bg-green-950/30 rounded-t-lg">
          <p className="text-xs font-semibold text-green-800 dark:text-green-300 flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</p>
          <p className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">{phone ? `+91 ${phone.slice(-10)}` : "⚠️ No phone"}</p>
        </div>
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-3 gap-1">
            {templates.map(t => (
              <button key={t.key} onClick={() => pick(t.key)}
                className={`text-[10px] px-2 py-1.5 rounded-lg border transition-colors text-left ${selKey === t.key ? "bg-green-100 border-green-400 text-green-800 dark:bg-green-900/40" : "border-border hover:bg-muted/50"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <Textarea value={message} onChange={e => { setMessage(e.target.value); setSelKey("custom"); }} rows={6} className="text-xs resize-none font-mono" />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gap-1 bg-green-600 hover:bg-green-700 text-white text-xs h-8" onClick={send} disabled={!phone}>
              <Send className="w-3 h-3" /> Send
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={copy}>
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TrackingInput({ orderId, initialValue, onSaved }: { orderId: string; initialValue: string; onSaved: (url: string) => void }) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const save = async () => {
    setSaving(true);
    await safePatch(`/orders/${orderId}/tracking`, { tracking_url: value }, null);
    onSaved(value);
    toast({ title: "Tracking saved" });
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2">
      <LinkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Input value={value} onChange={e => setValue(e.target.value)} placeholder="Paste tracking URL..." className="flex-1 h-7 text-xs" />
      {value?.startsWith("http") && <a href={value} target="_blank" rel="noopener noreferrer"><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><ExternalLink className="w-3 h-3" /></Button></a>}
      <Button size="sm" className="h-7 text-[10px] px-2" onClick={save} disabled={saving}>{saving ? "..." : "Save"}</Button>
    </div>
  );
}

function ShiprocketShip({ order, onShipped }: { order: Order; onShipped: (url: string) => void }) {
  const [shipping, setShipping] = useState(false);
  const [dims, setDims] = useState({ weight: "0.5", length: "20", breadth: "15", height: "10" });
  const [showDims, setShowDims] = useState(false);
  const { toast } = useToast();

  const ship = async () => {
    setShipping(true);
    try {
      const data = await safePost<any>("/shipping/create", {
        action: "create_order", order_id: order.id,
        weight: parseFloat(dims.weight), length: parseInt(dims.length), breadth: parseInt(dims.breadth), height: parseInt(dims.height),
      }, null);
      if (!data) throw new Error("Shipping failed");
      if (data?.error) throw new Error(data.error);
      toast({ title: "Shipped via Shiprocket! 🚀" });
      onShipped(data.tracking_url || "");
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
    setShipping(false);
  };

  return (
    <div className="space-y-2 p-3 rounded-lg border border-border/40 bg-muted/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1.5"><Truck className="w-3.5 h-3.5 text-primary" /> Shiprocket</span>
        <button onClick={() => setShowDims(!showDims)} className="text-[10px] text-muted-foreground hover:text-foreground">
          Dimensions <ChevronDown className={`w-3 h-3 inline ml-0.5 transition-transform ${showDims ? "rotate-180" : ""}`} />
        </button>
      </div>
      {showDims && (
        <div className="grid grid-cols-4 gap-2">
          {[{ l: "Wt (kg)", k: "weight" }, { l: "L (cm)", k: "length" }, { l: "B (cm)", k: "breadth" }, { l: "H (cm)", k: "height" }].map(f => (
            <div key={f.k}><Label className="text-[9px] text-muted-foreground">{f.l}</Label><Input value={(dims as any)[f.k]} onChange={e => setDims(p => ({ ...p, [f.k]: e.target.value }))} className="h-6 text-[10px]" /></div>
          ))}
        </div>
      )}
      <Button onClick={ship} disabled={shipping} size="sm" className="w-full gap-1.5 h-8 text-xs">
        {shipping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
        {shipping ? "Creating..." : "Ship Now"}
      </Button>
    </div>
  );
}

function UrgencyBanner({ label }: { label: NonNullable<ReturnType<typeof getUrgencyLabel>> }) {
  const Icon = label.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${label.bg}`}>
      <Icon className="w-2.5 h-2.5" /> {label.text}
    </span>
  );
}

function GstInvoiceSection({ order, onUpdate }: { order: Order; onUpdate: (fields: Partial<Order>) => void }) {
  const [isGst, setIsGst] = useState(!!(order.gst_number || order.company_name));
  const [companyName, setCompanyName] = useState(order.company_name || "");
  const [gstNumber, setGstNumber] = useState(order.gst_number || "");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    const fields = isGst
      ? { company_name: companyName, gst_number: gstNumber }
      : { company_name: "", gst_number: "" };
    await safePatch(`/orders/${order.id}`, fields, null);
    onUpdate(fields);
    toast({ title: "GST details saved" });
    setSaving(false);
  };

  return (
    <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/30 bg-muted/10 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Building2 className="w-3 h-3" /> GST Invoice
        </p>
        <div className="flex items-center gap-2">
          <Checkbox id={`gst-toggle-${order.id}`} checked={isGst} onCheckedChange={(v) => setIsGst(!!v)} />
          <label htmlFor={`gst-toggle-${order.id}`} className="text-[10px] text-muted-foreground cursor-pointer">Customer wants GST invoice</label>
        </div>
      </div>
      {isGst && (
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Company Name</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company Pvt Ltd" className="h-7 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-[10px]">GSTIN</Label>
              <Input value={gstNumber} onChange={e => setGstNumber(e.target.value.toUpperCase())} placeholder="27XXXXX1234X1ZX" className="h-7 text-xs mt-1 font-mono" maxLength={15} />
            </div>
          </div>
          <Button size="sm" className="h-7 text-[10px]" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save GST Details"}
          </Button>
          {order.gst_number && (
            <p className="text-[9px] text-muted-foreground">Saved: {order.company_name} · GSTIN: {order.gst_number}</p>
          )}
        </div>
      )}
    </div>
  );
}

type SummaryFilterKey = "overdue" | "urgent" | "today" | "active" | "customized" | "todays_orders" | null;

function SummaryCards({ orders, activeSummaryFilter, onFilter }: { orders: Order[]; activeSummaryFilter: SummaryFilterKey; onFilter: (key: SummaryFilterKey) => void }) {
  const active = orders.filter(o => ["pending", "confirmed", "processing", "payment_pending", "printed"].includes(o.status));
  const overdue = active.filter(o => o._urgency === "overdue").length;
  const urgent = active.filter(o => o._urgency === "urgent").length;
  const shipToday = active.filter(o => o._urgency === "today").length;
  const customized = active.filter(o => o._hasCustomization).length;
  const todayOrders = orders.filter(o => {
    const d = new Date(o.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  // Color discipline: only the three URGENCY tiers carry hue, and they form
  // one coherent red → orange → amber severity ramp (color = meaning here).
  // The three operational counts (Active, Customized, Today's) are neutral —
  // they're metrics, not alerts, so they shouldn't shout. Selection feedback
  // on the neutral cards uses the brand accent (the one accent the restrained
  // palette allows). This kills the previous 6-hue rainbow.
  const NEUTRAL = "bg-muted/40 border-border/70 text-foreground";
  const NEUTRAL_ACTIVE = "bg-primary/5 border-primary/40 ring-2 ring-primary/25 text-foreground";
  const cards: { key: SummaryFilterKey; label: string; value: number; color: string; activeColor: string; icon: React.ElementType }[] = [
    { key: "overdue", label: "Overdue (>48h)", value: overdue, color: "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800", activeColor: "bg-red-100 border-red-400 ring-2 ring-red-400/60 text-red-800 dark:bg-red-900/50 dark:border-red-600", icon: Flame },
    { key: "urgent", label: "Ship Today", value: urgent, color: "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800", activeColor: "bg-orange-100 border-orange-400 ring-2 ring-orange-400/60 text-orange-800 dark:bg-orange-900/50 dark:border-orange-600", icon: AlertTriangle },
    { key: "today", label: "Ship Tomorrow", value: shipToday, color: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800", activeColor: "bg-amber-100 border-amber-400 ring-2 ring-amber-400/60 text-amber-800 dark:bg-amber-900/50 dark:border-amber-600", icon: Timer },
    { key: "active", label: "Active Orders", value: active.length, color: NEUTRAL, activeColor: NEUTRAL_ACTIVE, icon: Package },
    { key: "customized", label: "Customized", value: customized, color: NEUTRAL, activeColor: NEUTRAL_ACTIVE, icon: Paintbrush },
    { key: "todays_orders", label: "Today's Orders", value: todayOrders, color: NEUTRAL, activeColor: NEUTRAL_ACTIVE, icon: CalendarDays },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {cards.map(c => {
        const Icon = c.icon;
        const isActive = activeSummaryFilter === c.key;
        return (
          <button key={c.key} onClick={() => onFilter(isActive ? null : c.key)}
            className={`rounded-xl border p-2.5 text-center cursor-pointer transition-[transform,box-shadow,background-color,border-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] [@media(hover:hover)]:hover:-translate-y-0.5 ${isActive ? c.activeColor : c.color} ${isActive ? "shadow-md" : "hover:shadow-sm"}`}>
            <Icon className="w-4 h-4 mx-auto mb-1 opacity-60" />
            <p className="text-xl font-black leading-none tabular-nums">{c.value}</p>
            <p className="text-[9px] font-semibold uppercase tracking-wide mt-1 opacity-70">{c.label}</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── AI Insights Panel ────────────────────────────────────────
function AiInsightsPanel({ orders }: { orders: Order[] }) {
  const [open, setOpen] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const analyze = async () => {
    setLoading(true);
    const context = JSON.stringify(
      orders.slice(0, 50).map(o => ({
        order_number: o.order_number,
        status: o.status,
        total: o.total,
        payment_method: o.payment_method,
        created_at: o.created_at,
        urgency: o._urgency,
        has_customization: o._hasCustomization,
      }))
    );
    const result = await safePost<{ text?: string }>(
      "/admin/ai/write",
      { prompt: "Analyze these orders and give 3 actionable business insights:", context, field: "description" },
      {}
    );
    setInsight(result?.text ?? "No insights returned.");
    setLoading(false);
  };

  const copy = () => {
    if (insight) { navigator.clipboard.writeText(insight); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  return (
    <div className="bg-card rounded-xl border border-primary/20 overflow-hidden">
      <button
        onClick={() => { setOpen(v => !v); if (!open && !insight) analyze(); }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="w-4 h-4" /> AI Insights
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Analyzing {orders.length} orders...
            </div>
          ) : insight ? (
            <div className="space-y-2">
              <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                <p className="flex items-start gap-1.5 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  {insight}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={analyze}>
                  <Loader2 className="w-3 h-3" /> Refresh analysis
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={copy}>
                  {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── AI Auto-tagger ───────────────────────────────────────────
function AiAutoTagger({ orders, onTagsUpdated }: { orders: Order[]; onTagsUpdated: (tagsMap: Record<string, string[]>) => void }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const run = async () => {
    setRunning(true);
    setDone(false);
    setProgress(0);
    const newTagsMap: Record<string, string[]> = {};
    const batch = orders.slice(0, 50); // tag up to 50 orders

    for (let i = 0; i < batch.length; i++) {
      const order = batch[i];
      const orderJson = JSON.stringify({
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        total: order.total,
        payment_method: order.payment_method,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        orders_count: (order as any).customer_orders_count,
        created_at: order.created_at,
        gift_packaging: order.gift_packaging,
        company_name: order.company_name,
        coupon_code: order.coupon_code,
      });
      const prompt = `Tag this order with 1-3 short labels from: high-value, urgent, repeat-customer, gift-occasion, corporate, first-time, vip, standard. Order: ${orderJson}. Reply with JSON array only.`;
      const text = await aiWrite(prompt);
      try {
        const match = text.match(/\[.*?\]/s);
        const tags: string[] = match ? JSON.parse(match[0]) : ["standard"];
        newTagsMap[order.id] = tags.slice(0, 3);
        saveStoredTags(order.id, tags.slice(0, 3));
      } catch {
        newTagsMap[order.id] = ["standard"];
        saveStoredTags(order.id, ["standard"]);
      }
      setProgress(i + 1);
    }

    onTagsUpdated(newTagsMap);
    setRunning(false);
    setDone(true);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
        onClick={run}
        disabled={running}
      >
        {running ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Tagging {progress}/{Math.min(orders.length, 50)}...</>
        ) : (
          <><Brain className="w-3.5 h-3.5" /> AI Auto-tag</>
        )}
      </Button>
      {done && <span className="text-[10px] text-emerald-600 font-medium">Tags applied!</span>}
    </div>
  );
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [shippingMode, setShippingMode] = useState("manual");
  const [sortBy, setSortBy] = useState<SortKey>("urgency");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilterKey>(null);
  const [printQueue, setPrintQueue] = useState<PrintQueueItem[]>([]);
  const [printQueueIds, setPrintQueueIds] = useState<Set<string>>(new Set());
  const [orderTagsMap, setOrderTagsMap] = useState<Record<string, string[]>>({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { toast } = useToast();

  // ── ZIP download: preview images + fonts.txt + texts.txt + uploaded photos ──
  const downloadCustomizationZip = useCallback(async (item: any, orderNumber: string): Promise<Blob> => {
    const zip = new JSZip();
    const allFonts: string[] = [...new Set([...(item.fonts_from_designs ?? []), ...(item.fonts_used ?? []), ...(item.custom_font ? [item.custom_font] : [])])];
    const allTexts: string[] = [...new Set([...(item.texts_from_designs ?? []), ...(item.custom_text ? [item.custom_text] : [])])];

    if (allFonts.length > 0) zip.file("fonts_used.txt", allFonts.join("\n"));
    if (allTexts.length > 0) zip.file("text_content.txt", allTexts.join("\n\n---\n\n"));

    // Design previews
    for (let i = 0; i < (item.design_previews ?? []).length; i++) {
      const dataUrl: string = item.design_previews[i];
      if (dataUrl?.startsWith("data:")) {
        const b64 = dataUrl.split(",")[1];
        if (b64) zip.file(`preview_${i + 1}.png`, b64, { base64: true });
      } else if (dataUrl?.startsWith("http")) {
        try {
          const buf = await fetch(dataUrl).then(r => r.arrayBuffer());
          zip.file(`preview_${i + 1}.png`, buf);
        } catch { /* skip */ }
      }
    }

    // Uploaded photos extracted from canvas JSON (original quality)
    let photoIdx = 1;
    for (let dIdx = 0; dIdx < (item.designs ?? []).length; dIdx++) {
      const d = item.designs[dIdx];
      try {
        const canvas = typeof d.canvasJSON === "string" ? JSON.parse(d.canvasJSON) : (d.canvasJSON ?? {});

        // ── SimpleZoneCustomizer: photos in fills.images ─────────────────
        if (canvas.__simpleZones) {
          const imgFills: Record<string, string> = canvas.fills?.images ?? {};
          for (const [zoneId, src] of Object.entries(imgFills)) {
            if (!src) continue;
            if (src.startsWith("data:")) {
              const b64 = src.split(",")[1];
              const mimeMatch = src.match(/data:image\/(\w+);/);
              const ext = mimeMatch?.[1] ?? "jpg";
              if (b64) zip.file(`photo_design${dIdx + 1}_${zoneId}.${ext}`, b64, { base64: true });
            } else if (src.startsWith("http") || src.startsWith("/")) {
              const url = src.startsWith("/") ? `${window.location.origin}${src}` : src;
              try {
                const buf = await fetch(url).then(r => r.arrayBuffer());
                const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
                zip.file(`photo_design${dIdx + 1}_${photoIdx++}.${ext}`, buf);
              } catch { /* skip */ }
            }
          }
          continue; // skip Fabric.js object scan for this design
        }

        // ── Fabric.js canvas: images in objects[] ────────────────────────
        for (const obj of (canvas?.objects ?? [])) {
          const t = (obj.type ?? "").toLowerCase();
          if (t === "image" && obj.src) {
            const src: string = obj.src;
            if (src.startsWith("data:")) {
              const b64 = src.split(",")[1];
              const mimeMatch = src.match(/data:image\/(\w+);/);
              const ext = mimeMatch?.[1] ?? "jpg";
              if (b64) zip.file(`photo_design${dIdx + 1}_${photoIdx++}.${ext}`, b64, { base64: true });
            } else if (src.startsWith("http") || src.startsWith("/")) {
              const url = src.startsWith("/") ? `${window.location.origin}${src}` : src;
              try {
                const buf = await fetch(url).then(r => r.arrayBuffer());
                const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
                zip.file(`photo_design${dIdx + 1}_${photoIdx++}.${ext}`, buf);
              } catch { /* skip */ }
            }
          }
        }
      } catch { /* skip */ }
    }

    // Legacy single-photo fallback
    if (item.custom_photo_url && photoIdx === 1) {
      try {
        const buf = await fetch(item.custom_photo_url).then(r => r.arrayBuffer());
        zip.file("uploaded_photo.jpg", buf);
      } catch { /* skip */ }
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${orderNumber}_customization.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return blob;
  }, []);

  // ── WhatsApp share ──────────────────────────────────────────────────────────
  const shareWhatsApp = useCallback(async (item: any, order: Order) => {
    const allFonts: string[] = [...new Set([...(item.fonts_from_designs ?? []), ...(item.fonts_used ?? []), ...(item.custom_font ? [item.custom_font] : [])])];
    const allTexts: string[] = [...new Set([...(item.texts_from_designs ?? []), ...(item.custom_text ? [item.custom_text] : [])])];
    const phone = (order.customer_phone ?? "").replace(/\D/g, "");
    const fp = phone.startsWith("91") ? phone : `91${phone}`;
    const blob = await downloadCustomizationZip(item, order.order_number);
    // Mobile: native share API can attach the ZIP file directly
    if (typeof navigator.share === "function") {
      const file = new File([blob], `${order.order_number}_customization.zip`, { type: "application/zip" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `Order ${order.order_number} Customization` }); return; } catch { /* fall through to desktop */ }
      }
    }
    // Desktop: open WhatsApp with order text details. ZIP is already in Downloads.
    // We open the chat directly so the admin can click the paperclip and attach the ZIP.
    const msg = `*Gifteeng Order #${order.order_number}*\n`
      + `Customer: ${order.customer_name}\n\n`
      + (allTexts.length > 0 ? `📝 *Text on design:*\n${allTexts.map(t => `• ${t}`).join("\n")}\n\n` : "")
      + (allFonts.length > 0 ? `🔤 *Font(s):* ${allFonts.join(", ")}\n\n` : "");
    window.open(`https://wa.me/${fp}?text=${encodeURIComponent(msg)}`, "_blank");
    // Show instruction toast — ZIP is already downloaded
    toast({ title: "📎 ZIP saved to Downloads", description: "Attach it in the WhatsApp chat that just opened using the paperclip icon." });
  }, [downloadCustomizationZip]);

  type OrderItemData_ = { product_name: string; quantity: number; unit_price: number; total_price: number; selected_size: string; selected_color: string; hsn_code?: string };

  const addToQueue = (order: Order, items: OrderItemData_[]) => {
    if (printQueueIds.has(order.id)) return;
    setPrintQueue(q => [...q, { order: order as any, items: items as any }]);
    setPrintQueueIds(s => new Set(s).add(order.id));
    toast({ title: `Added #${order.order_number} to print queue` });
  };

  const removeFromQueue = (orderId: string) => {
    setPrintQueue(q => q.filter(qi => (qi.order as any).id !== orderId));
    setPrintQueueIds(s => { const ns = new Set(s); ns.delete(orderId); return ns; });
  };

  const clearQueue = () => { setPrintQueue([]); setPrintQueueIds(new Set()); };

  useEffect(() => {
    const load = async () => {
      const ordersRes = await safeGet<{ items: any[]; total?: number }>("/orders/admin/all?pageSize=200", { items: [] });
      // Map camelCase API response → snake_case shape expected by this page.
      const rawOrders = (((ordersRes?.items as any[]) || []).map(mapApiOrderToUi)) as Order[];

      const customMap: Record<string, boolean> = {};
      const itemsByOrder: Record<string, OrderItem[]> = {};
      for (const o of rawOrders as any[]) {
        const items: any[] = o.items || o.order_items || [];
        for (const item of items) {
          const oid = item.order_id || o.id;
          if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
          itemsByOrder[oid].push(item);
          if (item.custom_text || item.custom_photo_url || item.preview_image_url || (item.fonts_used?.length > 0) || (item.images_used?.length > 0)) {
            customMap[oid] = true;
          }
        }
      }

      const enriched = rawOrders.map(o => {
        const t = o.created_at ? new Date(o.created_at).getTime() : NaN;
        return {
          ...o,
          _hasCustomization: !!customMap[o.id],
          _ageHours: Number.isFinite(t) ? (Date.now() - t) / (1000 * 60 * 60) : 0,
          _urgency: getOrderUrgency(o),
        };
      });

      setOrders(enriched);
      setOrderItemsMap(itemsByOrder);

      // Load persisted tags from localStorage
      const storedTags: Record<string, string[]> = {};
      for (const o of enriched) {
        const tags = loadStoredTags(o.id);
        if (tags.length > 0) storedTags[o.id] = tags;
      }
      setOrderTagsMap(storedTags);

      setLoading(false);

      const settings = await safeGet<{ value?: any }>("/settings/shipping_mode", { value: "manual" });
      if (settings?.value) {
        const v = typeof settings.value === "string" ? settings.value : JSON.stringify(settings.value);
        setShippingMode(v.replace(/^"|"$/g, "") || "manual");
      }
    };
    load();
  }, []);

  const openDetail = async (order: Order) => {
    setSelectedOrder(order); setDetailLoading(true);
    // GET /api/orders/:id returns the full order with items[] included.
    // The old /orders/:id/items path never existed — it always returned the fallback [].
    const data = await safeGet<any>(`/orders/${order.id}`, null);
    const rawItems: any[] = Array.isArray(data?.items) ? data.items : [];
    setDetailItems(rawItems.map(mapApiOrderItemToUi));
    setDetailLoading(false);
  };

  const updateStatus = async (id: string, status: string) => {
    // Translate UI status name back to the API's enum value before PATCHing
    const apiStatus = UI_TO_API_STATUS[status] ?? status;
    await safePatch(`/orders/${id}/status`, { status: apiStatus }, null);
    // Keep UI state in normalised (UI) terms
    setOrders(p => p.map(o => o.id === id ? { ...o, status, _urgency: getOrderUrgency({ ...o, status }) } : o));
    if (selectedOrder?.id === id) setSelectedOrder(p => p ? { ...p, status } : null);
    toast({ title: `Status → ${STATUS_CFG[status]?.label || status}` });
  };

  const archive = async (id: string) => {
    await safePatch(`/orders/${id}/status`, { status: "archived" }, null);
    setOrders(p => p.map(o => o.id === id ? { ...o, status: "archived", _urgency: "normal" as const } : o));
    if (selectedOrder?.id === id) setSelectedOrder(p => p ? { ...p, status: "archived" } : null);
    toast({ title: "Archived" });
  };

  const deleteOrder = async (id: string) => {
    await safeDelete(`/orders/${id}`, null);
    setOrders(p => p.filter(o => o.id !== id));
    if (selectedOrder?.id === id) setSelectedOrder(null);
    toast({ title: "Deleted" });
  };

  const downloadData = (order: Order, items: OrderItem[]) => {
    const blob = new Blob([JSON.stringify({
      order: { order_number: order.order_number, status: order.status, payment_method: order.payment_method, created_at: order.created_at },
      customer: { name: order.customer_name, phone: order.customer_phone, email: order.customer_email, address: `${order.shipping_address}, ${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pincode}` },
      pricing: { subtotal: order.subtotal, delivery_charge: order.delivery_charge, cod_charge: order.cod_charge, total: order.total },
      items: items.map(i => ({ product: i.product_name, quantity: i.quantity, unit_price: i.unit_price, total_price: i.total_price, size: i.selected_size, color: i.selected_color, material: i.selected_material, finish: i.selected_finish, printing: i.selected_printing, custom_text: i.custom_text, preview_image: i.preview_image_url, photo: i.custom_photo_url, fonts_used: i.fonts_used, images_used: i.images_used })),
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `order-${order.order_number}.json`; a.click();
  };

  const counts = useMemo(() => {
    const needsAction = orders.filter(o => o._urgency && o._urgency !== "normal").length;
    return {
      all: orders.filter(o => o.status !== "archived").length,
      needs_action: needsAction,
      incomplete: orders.filter(o => o.status === "incomplete").length,
      active: orders.filter(o => ["pending", "confirmed", "processing", "payment_pending"].includes(o.status)).length,
      printed: orders.filter(o => o.status === "printed").length,
      shipped: orders.filter(o => o.status === "shipped").length,
      completed: orders.filter(o => o.status === "delivered").length,
      cancelled: orders.filter(o => o.status === "cancelled").length,
      archived: orders.filter(o => o.status === "archived").length,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    let result = orders.filter(o => {
      const q = search.toLowerCase();
      const matchSearch = !search || o.order_number?.toLowerCase().includes(q) || o.customer_name?.toLowerCase().includes(q) || o.customer_phone?.includes(search) || o.customer_email?.toLowerCase().includes(q);
      if (!matchSearch) return false;

      if (typeFilter === "customized" && !o._hasCustomization) return false;
      if (typeFilter === "non_customized" && o._hasCustomization) return false;

      if (summaryFilter) {
        const activeStatuses = ["pending", "confirmed", "processing", "payment_pending", "printed"];
        const isActive = activeStatuses.includes(o.status);
        if (summaryFilter === "overdue") return isActive && o._urgency === "overdue";
        if (summaryFilter === "urgent") return isActive && o._urgency === "urgent";
        if (summaryFilter === "today") return isActive && o._urgency === "today";
        if (summaryFilter === "active") return isActive;
        if (summaryFilter === "customized") return isActive && o._hasCustomization;
        if (summaryFilter === "todays_orders") {
          const d = new Date(o.created_at);
          const now = new Date();
          return d.toDateString() === now.toDateString();
        }
        return false;
      }

      if (activeTab === "all") return o.status !== "archived";
      if (activeTab === "needs_action") return o._urgency !== "normal" && !["shipped", "delivered", "cancelled", "archived"].includes(o.status);
      if (activeTab === "incomplete") return o.status === "incomplete";
      if (activeTab === "active") return ["pending", "confirmed", "processing", "payment_pending"].includes(o.status);
      if (activeTab === "printed") return o.status === "printed";
      if (activeTab === "shipped") return o.status === "shipped";
      if (activeTab === "completed") return o.status === "delivered";
      if (activeTab === "cancelled") return o.status === "cancelled";
      if (activeTab === "archived") return o.status === "archived";
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "urgency") {
        const urgencyOrder: Record<string, number> = { overdue: 0, urgent: 1, today: 2, normal: 3 };
        const diff = (urgencyOrder[a._urgency || "normal"] ?? 3) - (urgencyOrder[b._urgency || "normal"] ?? 3);
        if (diff !== 0) return diff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "total_high") return b.total - a.total;
      if (sortBy === "total_low") return a.total - b.total;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [orders, search, activeTab, typeFilter, sortBy, summaryFilter]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="max-w-5xl w-full space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ShoppingCart className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-display font-bold tracking-tight">Order Management</h1>
          <p className="text-xs text-muted-foreground">{counts.active} active · {counts.needs_action} need action · {counts.all} total</p>
        </div>
      </div>

      <AiInsightsPanel orders={orders} />

      <SummaryCards orders={orders} activeSummaryFilter={summaryFilter} onFilter={(key) => { setSummaryFilter(key); if (key) { setActiveTab("all"); setTypeFilter("all"); } }} />

      {counts.needs_action > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800 dark:text-red-300">{counts.needs_action} order{counts.needs_action > 1 ? "s" : ""} need immediate attention!</p>
            <p className="text-xs text-red-600 dark:text-red-400">Orders older than 24h should be shipped ASAP to maintain delivery SLA.</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 border-red-300 text-red-700 hover:bg-red-100 text-xs h-8" onClick={() => { setActiveTab("needs_action"); setSortBy("urgency"); setSummaryFilter(null); }}>
            <Zap className="w-3 h-3 mr-1" /> View All
          </Button>
        </div>
      )}

      {/* Tab Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setSummaryFilter(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === t.key
                ? t.key === "needs_action"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-primary text-primary-foreground shadow-sm"
                : t.key === "needs_action" && (counts as any)[t.key] > 0
                  ? "bg-red-100 text-red-700 border border-red-200 hover:bg-red-200"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}>
            {t.label}
            <span className={`ml-1.5 text-[10px] min-w-[18px] text-center px-1 py-0.5 rounded-full font-bold leading-none inline-block ${
              activeTab === t.key ? "bg-white/20" : "bg-background"
            }`}>
              {(counts as any)[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email, order #..." className="pl-8 h-8 text-xs pr-8" />
          {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
        </div>

        <Select value={typeFilter} onValueChange={(v: TypeFilter) => setTypeFilter(v)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="customized">🎨 Customized</SelectItem>
            <SelectItem value="non_customized">📦 Non-Customized</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v: SortKey) => setSortBy(v)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <ArrowUpDown className="w-3 h-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgency">🔥 By Urgency</SelectItem>
            <SelectItem value="newest">📅 Newest First</SelectItem>
            <SelectItem value="oldest">📅 Oldest First</SelectItem>
            <SelectItem value="total_high">💰 Amount ↓</SelectItem>
            <SelectItem value="total_low">💰 Amount ↑</SelectItem>
          </SelectContent>
        </Select>

        {/* AI Auto-tag button */}
        <AiAutoTagger
          orders={filtered}
          onTagsUpdated={(newTags) => setOrderTagsMap(prev => ({ ...prev, ...newTags }))}
        />
      </div>

      {/* Results count + Print Queue */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-muted-foreground">{filtered.length} order{filtered.length !== 1 ? "s" : ""} shown</p>
          {summaryFilter && (
            <button onClick={() => setSummaryFilter(null)} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold flex items-center gap-1 hover:bg-primary/20 transition-colors">
              Filtered: {summaryFilter === "todays_orders" ? "Today's Orders" : summaryFilter === "overdue" ? "Overdue" : summaryFilter === "urgent" ? "Ship Today" : summaryFilter === "today" ? "Ship Tomorrow" : summaryFilter === "active" ? "Active" : "Customized"}
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {printQueue.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5">
            <Printer className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold">{printQueue.length} in print queue</span>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={() => batchDownloadLabels(printQueue)}>
                <Tag className="w-2.5 h-2.5" /> Labels
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={() => batchDownloadInvoices(printQueue)}>
                <FileText className="w-2.5 h-2.5" /> Invoices
              </Button>
              <Button size="sm" className="h-6 text-[10px] px-2 gap-1 bg-primary text-primary-foreground" onClick={() => batchDownloadCombined(printQueue)}>
                <Download className="w-2.5 h-2.5" /> All (Label+Invoice)
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-destructive" onClick={clearQueue}>
                <X className="w-2.5 h-2.5" /> Clear
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Orders List */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/40 py-16 text-center">
          <ShoppingCart className="w-10 h-10 text-muted-foreground/15 mx-auto mb-2" />
          <p className="text-sm font-medium">{search ? "No matches" : "No orders"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Orders will appear here</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(order => {
            const cfg = STATUS_CFG[order.status] || STATUS_CFG.pending;
            const Icon = cfg.icon;
            const urgencyLabel = getUrgencyLabel(order._urgency);
            // Urgency signalling: a FULL tinted border (+ faint background
            // wash for the two critical tiers) rather than a colored
            // `border-l-4` side-stripe. The stripe was a decorative accent
            // that fought the row's leading status icon; a full border reads
            // as "this whole row is flagged" and the existing UrgencyBanner
            // pill inside the row already carries the explicit label.
            const borderClass = order._urgency === "overdue"
              ? "border-red-300 bg-red-50/60 dark:border-red-800/70 dark:bg-red-950/20"
              : order._urgency === "urgent"
                ? "border-orange-300 bg-orange-50/50 dark:border-orange-800/70 dark:bg-orange-950/20"
                : order._urgency === "today"
                  ? "border-amber-200 dark:border-amber-800/60"
                  : "border-border/40";
            const tags = orderTagsMap[order.id] || [];

            return (
              <div key={order.id} onClick={() => openDetail(order)}
                className={`bg-card rounded-xl border p-3 flex items-center gap-3 cursor-pointer group transition-[box-shadow,background-color] duration-150 hover:shadow-[0_4px_16px_-4px_hsl(230_20%_0%/0.14),0_2px_8px_-2px_hsl(230_20%_0%/0.10)] active:bg-muted/30 ${borderClass}`}>
                <Checkbox
                  checked={printQueueIds.has(order.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const oi = orderItemsMap[order.id] || [];
                      addToQueue(order, oi.map(i => ({ product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price, total_price: i.total_price, selected_size: i.selected_size, selected_color: i.selected_color })));
                    } else {
                      removeFromQueue(order.id);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                />
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${cfg.color.split(" ").find(c => c.startsWith("bg-")) || "bg-muted"}`}>
                  <Icon className={`w-5 h-5 ${cfg.color.split(" ").find(c => c.startsWith("text-")) || "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-sm font-bold">#{order.order_number}</span>
                    <StatusBadge status={order.status} />
                    <PayBadge method={order.payment_method} />
                    {urgencyLabel && <UrgencyBanner label={urgencyLabel} />}
                    {order._hasCustomization && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 font-semibold dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700">
                        🎨 Custom
                      </span>
                    )}
                    {order.notes?.includes("🎁 GIFT ORDER") && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-200 font-semibold">🎁 Gift</span>}
                    {order.coupon_code && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 font-semibold"><Tag className="w-2.5 h-2.5 inline mr-0.5" />{order.coupon_code}</span>}
                    {/* AI Tags */}
                    {tags.map(tag => (
                      <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${getTagColor(tag)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {order.customer_name || "—"} · {order.customer_phone || order.customer_email || ""}
                    <span className="ml-2 text-[10px] opacity-70">
                      {timeAgo(order.created_at)} · {fmtDateShort(order.created_at)}
                    </span>
                    {order.requested_delivery_date && (
                      <span className="ml-2 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
                        📅 Deliver by {new Date(order.requested_delivery_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">₹{order.total?.toLocaleString("en-IN")}</p>
                  {order.cod_charge > 0 && <p className="text-[10px] text-muted-foreground">+₹{order.cod_charge} COD</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {order.customer_phone && (
                    <a href={`tel:${order.customer_phone}`} onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg hover:bg-green-50 transition-colors" title="Call customer">
                      <Phone className="w-4 h-4 text-green-600" />
                    </a>
                  )}
                  {order.status !== "archived" ? (
                    <button onClick={e => { e.stopPropagation(); archive(order.id); }} className="p-1.5 rounded-lg hover:bg-muted" title="Archive"><Archive className="w-4 h-4 text-muted-foreground" /></button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); if (confirm("Delete permanently?")) deleteOrder(order.id); }} className="p-1.5 rounded-lg hover:bg-destructive/10" title="Delete"><Trash2 className="w-4 h-4 text-destructive" /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="w-[96vw] max-w-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
                  #{selectedOrder.order_number}
                  <StatusBadge status={selectedOrder.status} />
                  <PayBadge method={selectedOrder.payment_method} />
                  {(() => { const u = getUrgencyLabel(getOrderUrgency(selectedOrder)); return u ? <UrgencyBanner label={u} /> : null; })()}
                  {selectedOrder._hasCustomization && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 font-semibold">🎨 Customized Order</span>
                  )}
                  {/* Show AI tags in dialog header */}
                  {(orderTagsMap[selectedOrder.id] || []).map(tag => (
                    <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${getTagColor(tag)}`}>{tag}</span>
                  ))}
                </DialogTitle>
              </DialogHeader>

              {/* Incomplete-order guard — shows a friendly empty state and
                  hides WhatsApp / Label / Invoice / status tooling that can't
                  work without customer info + items. */}
              {selectedOrder.status === "incomplete" && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 mt-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Incomplete order — no action required</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        The customer started checkout but didn't finish (no payment, no items committed).
                        This order record is kept for analytics only. You can safely archive it.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => archive(selectedOrder.id)}>
                          <Archive className="w-3 h-3 mr-1" /> Archive
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setSelectedOrder(null)}>
                          Close
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedOrder.status !== "incomplete" && (
              <div className="space-y-4 mt-1">
                {(() => {
                  const u = getOrderUrgency(selectedOrder);
                  if (u === "overdue") return (
                    <div className="bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
                      <Flame className="w-5 h-5 text-red-600 shrink-0 animate-pulse" />
                      <div>
                        <p className="text-sm font-bold text-red-800 dark:text-red-300">⚠️ OVERDUE — This order is older than 48 hours!</p>
                        <p className="text-xs text-red-600 dark:text-red-400">Ship immediately or contact the customer. Ordered {timeAgo(selectedOrder.created_at)}.</p>
                      </div>
                    </div>
                  );
                  if (u === "urgent") return (
                    <div className="bg-orange-100 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 rounded-xl p-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-orange-800 dark:text-orange-300">Ship Today! Order is {timeAgo(selectedOrder.created_at)} old.</p>
                        <p className="text-xs text-orange-600 dark:text-orange-400">Process and ship today to meet delivery timeline.</p>
                      </div>
                    </div>
                  );
                  if (u === "today") return (
                    <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 flex items-center gap-2">
                      <Timer className="w-5 h-5 text-yellow-600 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-yellow-800 dark:text-yellow-300">Ship by tomorrow. Ordered {timeAgo(selectedOrder.created_at)}.</p>
                      </div>
                    </div>
                  );
                  return null;
                })()}

                {/* Quick Action Buttons */}
                <div className="bg-muted/20 rounded-xl border border-border/30 p-3 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground shrink-0 uppercase tracking-wider font-semibold">Status</span>
                      <Select value={UI_TO_API_STATUS[selectedOrder.status] ?? selectedOrder.status} onValueChange={v => updateStatus(selectedOrder.id, API_TO_UI_STATUS[v] ?? v)}>
                        <SelectTrigger className="w-44 h-7 text-xs"><SelectValue placeholder="Select status…" /></SelectTrigger>
                        <SelectContent>
                          {STATUS_SELECT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedOrder.created_at ? (
                      <span className="text-xs font-medium text-foreground/70 bg-muted/50 rounded px-2 py-0.5 border border-border/30">
                        🕐 Ordered: <strong>{fmtDateTime(selectedOrder.created_at)}</strong> &nbsp;·&nbsp; {timeAgo(selectedOrder.created_at)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Date unavailable</span>
                    )}
                    {selectedOrder.requested_delivery_date && (
                      <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 rounded px-2 py-0.5 flex items-center gap-1">
                        📅 Customer requested delivery by: <strong>{new Date(selectedOrder.requested_delivery_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {selectedOrder.status === "pending" && (
                      <Button size="sm" className="gap-1 text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(selectedOrder.id, "confirmed")}>
                        <CheckCircle2 className="w-3 h-3" /> Confirm
                      </Button>
                    )}
                    {["confirmed", "processing"].includes(selectedOrder.status) && (
                      <Button size="sm" className="gap-1 text-[10px] h-7 bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => updateStatus(selectedOrder.id, "printed")}>
                        <Printer className="w-3 h-3" /> Mark Printed
                      </Button>
                    )}
                    {selectedOrder.status === "printed" && (
                      <Button size="sm" className="gap-1 text-[10px] h-7 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => updateStatus(selectedOrder.id, "shipped")}>
                        <Truck className="w-3 h-3" /> Mark Shipped
                      </Button>
                    )}
                    {selectedOrder.status === "shipped" && (
                      <Button size="sm" className="gap-1 text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => updateStatus(selectedOrder.id, "delivered")}>
                        <CheckCircle2 className="w-3 h-3" /> Mark Delivered
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    <WhatsAppPanel order={selectedOrder} />
                    <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7" onClick={() => {
                      const enrichedItems = detailItems.map(i => ({ ...i, hsn_code: (i as any).hsn_code || "" }));
                      generateCombinedPDF(selectedOrder as any, enrichedItems);
                    }}><Download className="w-3 h-3" /> Label + Invoice</Button>
                    <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7" onClick={() => {
                      const enrichedItems = detailItems.map(i => ({ ...i, hsn_code: (i as any).hsn_code || "" }));
                      generateInvoicePDF(selectedOrder as any, enrichedItems);
                    }}><FileText className="w-3 h-3" /> Invoice</Button>
                    <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7" onClick={() => generateLabelPDF(selectedOrder as any, detailItems)}><Tag className="w-3 h-3" /> Label</Button>
                    {!printQueueIds.has(selectedOrder.id) ? (
                      <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7 border-primary/30 text-primary hover:bg-primary/5" onClick={() => {
                        const enrichedItems = detailItems.map(i => ({ ...i, hsn_code: (i as any).hsn_code || "" }));
                        addToQueue(selectedOrder, enrichedItems);
                      }}><Printer className="w-3 h-3" /> Add to Queue</Button>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7 border-green-300 text-green-700 bg-green-50" disabled>
                        <Check className="w-3 h-3" /> In Queue
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7" onClick={() => downloadData(selectedOrder, detailItems)}><Download className="w-3 h-3" /> JSON</Button>
                    {selectedOrder.status !== "archived" && <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7" onClick={() => archive(selectedOrder.id)}><Archive className="w-3 h-3" /> Archive</Button>}
                    {selectedOrder.status === "archived" && <Button variant="destructive" size="sm" className="gap-1 text-[10px] h-7" onClick={() => { if (confirm("Delete permanently?")) deleteOrder(selectedOrder.id); }}><Trash2 className="w-3 h-3" /> Delete</Button>}
                  </div>
                </div>

                {/* Shipping */}
                <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/30 bg-muted/10">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Truck className="w-3 h-3" /> Shipping · {shippingMode === "shiprocket" ? "Shiprocket" : "Manual"}
                    </p>
                  </div>
                  <div className="p-3 space-y-3">
                    {shippingMode === "shiprocket" && !["shipped", "delivered"].includes(selectedOrder.status) && (
                      <ShiprocketShip order={selectedOrder} onShipped={url => {
                        setOrders(p => p.map(o => o.id === selectedOrder.id ? { ...o, tracking_url: url, status: "shipped" } : o));
                        setSelectedOrder(p => p ? { ...p, tracking_url: url, status: "shipped" } : null);
                      }} />
                    )}
                    <TrackingInput orderId={selectedOrder.id} initialValue={selectedOrder.tracking_url || ""} onSaved={url => {
                      setOrders(p => p.map(o => o.id === selectedOrder.id ? { ...o, tracking_url: url } : o));
                      setSelectedOrder(p => p ? { ...p, tracking_url: url } : null);
                    }} />
                  </div>
                </div>

                {/* Customer + Address */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-card rounded-xl border border-border/40 p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                    <p className="text-sm font-medium">{selectedOrder.customer_name || "—"}</p>
                    {selectedOrder.customer_phone && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" /> {selectedOrder.customer_phone}</p>}
                    {selectedOrder.customer_email && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="w-3 h-3" /> {selectedOrder.customer_email}</p>}
                  </div>
                  <div className="bg-card rounded-xl border border-border/40 p-3 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address</p>
                    <p className="text-xs flex items-start gap-1.5">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                      <span>{selectedOrder.shipping_address}{selectedOrder.shipping_city && `, ${selectedOrder.shipping_city}`}{selectedOrder.shipping_state && `, ${selectedOrder.shipping_state}`}{selectedOrder.shipping_pincode && ` - ${selectedOrder.shipping_pincode}`}</span>
                    </p>
                  </div>
                </div>

                {/* Pricing */}
                <div className="bg-card rounded-xl border border-border/40 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-4 flex-wrap text-xs">
                    <span className="text-muted-foreground">Subtotal: <strong className="text-foreground">₹{selectedOrder.subtotal}</strong></span>
                    <span className="text-muted-foreground">Delivery: <strong className="text-foreground">₹{selectedOrder.delivery_charge}</strong></span>
                    {selectedOrder.cod_charge > 0 && <span className="text-muted-foreground">COD: <strong className="text-foreground">₹{selectedOrder.cod_charge}</strong></span>}
                    {selectedOrder.gift_packaging_charge > 0 && <span className="text-muted-foreground">Gift Wrap: <strong className="text-foreground">₹{selectedOrder.gift_packaging_charge}</strong></span>}
                    {selectedOrder.coupon_code && <span className="text-muted-foreground">Coupon: <strong className="text-green-600">{selectedOrder.coupon_code}</strong></span>}
                    <span className="ml-auto text-base font-bold text-primary">₹{selectedOrder.total?.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <GstInvoiceSection order={selectedOrder} onUpdate={(fields) => {
                  setOrders(p => p.map(o => o.id === selectedOrder.id ? { ...o, ...fields } : o));
                  setSelectedOrder(p => p ? { ...p, ...fields } : null);
                }} />

                {(selectedOrder.notes || selectedOrder.gift_message || selectedOrder.gift_packaging) && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/30 p-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">📝 Order Notes</p>
                    {selectedOrder.gift_packaging && (
                      <p className="text-sm flex items-center gap-1.5"><Gift className="w-4 h-4 text-pink-500" /> <strong>Gift Wrapped</strong> {selectedOrder.gift_packaging_charge > 0 && `(₹${selectedOrder.gift_packaging_charge})`}</p>
                    )}
                    {selectedOrder.gift_message && (
                      <p className="text-sm"><strong>Gift Message:</strong> "{selectedOrder.gift_message}"</p>
                    )}
                    {selectedOrder.notes && (
                      <p className="text-sm whitespace-pre-wrap">{selectedOrder.notes}</p>
                    )}
                  </div>
                )}

                {/* Items */}
                <div>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-primary" /> Items ({detailItems.length})</p>
                  {detailLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : detailItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No items (incomplete order)</p>
                  ) : (
                    <div className="space-y-2">
                      {detailItems.map(item => {
                        const hasMultiDesign = item.design_previews?.length > 0;
                        const isCustom = hasMultiDesign || !!(item.custom_text || item.custom_photo_url || item.preview_image_url || item.fonts_used?.length > 0 || item.images_used?.length > 0);
                        const allFonts = [...new Set([...(item.fonts_from_designs ?? []), ...(item.fonts_used ?? []), ...(item.custom_font ? [item.custom_font] : [])])];
                        const allTexts = [...new Set([...(item.texts_from_designs ?? []), ...(item.custom_text ? [item.custom_text] : [])])];
                        return (
                          <div key={item.id} className={`bg-card rounded-xl border p-3 ${isCustom ? "border-purple-200 dark:border-purple-800" : "border-border/40"}`}>
                            {isCustom && (
                              <div className="mb-2 flex items-center gap-1">
                                <Paintbrush className="w-3 h-3 text-purple-600" />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-purple-600">Customized Item — Check details carefully</span>
                              </div>
                            )}
                            <div className="flex gap-3">
                              {/* Thumbnail: first design preview or product image */}
                              <div className="shrink-0">
                                {item.preview_image_url ? (
                                  <a href={item.preview_image_url} target="_blank" rel="noopener noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={item.preview_image_url} alt="" className="w-20 h-20 rounded-lg object-cover border border-purple-200 hover:opacity-90 transition-opacity" />
                                  </a>
                                ) : item.product_image ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={item.product_image} alt="" className="w-20 h-20 rounded-lg object-cover border border-border/30" />
                                ) : (
                                  <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center"><Package className="w-6 h-6 text-muted-foreground/20" /></div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div>
                                  <h4 className="text-sm font-semibold truncate">{item.product_name}</h4>
                                  <p className="text-[10px] text-muted-foreground">Qty {item.quantity} × ₹{item.unit_price} = <strong>₹{item.total_price}</strong></p>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {item.selected_size && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Ruler className="w-2.5 h-2.5" /> {item.selected_size}</Badge>}
                                  {item.selected_color && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Palette className="w-2.5 h-2.5" /> {item.selected_color}</Badge>}
                                  {item.selected_material && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Box className="w-2.5 h-2.5" /> {item.selected_material}</Badge>}
                                  {item.selected_finish && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Sparkles className="w-2.5 h-2.5" /> {item.selected_finish}</Badge>}
                                  {item.selected_printing && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Printer className="w-2.5 h-2.5" /> {item.selected_printing}</Badge>}
                                </div>

                                {/* ── Customization details block ─────────────────── */}
                                {isCustom && (() => {
                                  // Extract per-object canvas details for ALL designs
                                  const canvasObjects: { designIdx: number; type: string; text?: string; src?: string }[] = [];
                                  for (let dIdx = 0; dIdx < (item.designs ?? []).length; dIdx++) {
                                    const d = item.designs[dIdx];
                                    try {
                                      const canvas = typeof d.canvasJSON === "string" ? JSON.parse(d.canvasJSON) : (d.canvasJSON ?? {});

                                      // SimpleZone format: images in fills.images, texts in fills.texts
                                      if (canvas.__simpleZones) {
                                        const imgFills: Record<string, string> = canvas.fills?.images ?? {};
                                        for (const src of Object.values(imgFills)) {
                                          if (src) canvasObjects.push({ designIdx: dIdx, type: "image", src });
                                        }
                                        const txtFills: Record<string, string> = canvas.fills?.texts ?? {};
                                        for (const t of Object.values(txtFills)) {
                                          if (typeof t === "string" && t.trim()) canvasObjects.push({ designIdx: dIdx, type: "text", text: t.trim() });
                                        }
                                        continue;
                                      }

                                      // Fabric.js canvas: objects[] with case-insensitive type check
                                      for (const obj of (canvas?.objects ?? [])) {
                                        const t = (obj.type ?? "").toLowerCase();
                                        if ((t === "textbox" || t === "i-text" || t === "itext" || t === "text") && obj.text?.trim()) {
                                          canvasObjects.push({ designIdx: dIdx, type: "text", text: obj.text.trim() });
                                        } else if (t === "image" && obj.src) {
                                          canvasObjects.push({ designIdx: dIdx, type: "image", src: obj.src as string });
                                        }
                                      }
                                    } catch { /* skip */ }
                                  }
                                  return (
                                    <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-3 space-y-3 border border-purple-100 dark:border-purple-800 mt-2">
                                      <div className="flex items-center justify-between flex-wrap gap-2">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-purple-600">🎨 Customization Details</p>
                                        {/* Bulk actions */}
                                        <div className="flex gap-1.5">
                                          <Button
                                            size="sm" variant="outline"
                                            className="h-6 text-[9px] px-2 gap-1 border-purple-300 text-purple-700 hover:bg-purple-100"
                                            onClick={() => downloadCustomizationZip(item, selectedOrder!.order_number)}
                                          >
                                            <Download className="w-2.5 h-2.5" /> Download ZIP
                                          </Button>
                                          <Button
                                            size="sm" variant="outline"
                                            className="h-6 text-[9px] px-2 gap-1 border-green-400 text-green-700 hover:bg-green-50"
                                            onClick={() => shareWhatsApp(item, selectedOrder!)}
                                          >
                                            <MessageCircle className="w-2.5 h-2.5" /> WhatsApp
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Design previews — click → lightbox */}
                                      {hasMultiDesign && (
                                        <div>
                                          <p className="text-[9px] text-purple-500 mb-1.5 font-semibold">
                                            Design Preview{item.design_previews.length > 1 ? `s (${item.design_previews.length})` : ""}
                                            <span className="ml-1 text-purple-400 font-normal">(tap to enlarge)</span>
                                          </p>
                                          <div className="flex flex-wrap gap-2">
                                            {item.design_previews.map((url: string, idx: number) => (
                                              <div key={idx} className="relative group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                  src={url} alt={`Design ${idx + 1}`}
                                                  onClick={() => setLightboxUrl(url)}
                                                  className="w-20 h-20 rounded-lg object-cover border-2 border-purple-200 hover:border-purple-500 cursor-zoom-in transition-all group-hover:scale-105"
                                                />
                                                <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-purple-600 text-white text-[8px] font-bold flex items-center justify-center">{idx + 1}</span>
                                                <a
                                                  href={url} download={`design_${idx + 1}.png`}
                                                  className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-purple-300 shadow flex items-center justify-center hover:bg-purple-50"
                                                  title="Download"
                                                >
                                                  <Download className="w-2.5 h-2.5 text-purple-600" />
                                                </a>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Per-object details: texts with copy, images with download */}
                                      {canvasObjects.length > 0 && (
                                        <div className="space-y-1.5">
                                          <p className="text-[9px] text-purple-500 font-semibold">Canvas Objects</p>
                                          {canvasObjects.map((obj, i) => {
                                            if (obj.type === "text") {
                                              return (
                                                <div key={i} className="flex items-start gap-1.5 bg-white dark:bg-purple-950/40 rounded px-2 py-1 border border-purple-100 dark:border-purple-700">
                                                  <Type className="w-3 h-3 text-purple-400 mt-0.5 shrink-0" />
                                                  <span className="text-[11px] font-medium text-foreground flex-1 min-w-0 break-words">"{obj.text}"</span>
                                                  <button
                                                    onClick={() => { navigator.clipboard.writeText(obj.text ?? ""); toast({ title: "Copied!" }); }}
                                                    className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-semibold flex items-center gap-0.5"
                                                  >
                                                    <Copy className="w-2.5 h-2.5" /> Copy
                                                  </button>
                                                </div>
                                              );
                                            }
                                            if (obj.type === "image") {
                                              const src = obj.src ?? "";
                                              const isData = src.startsWith("data:");
                                              const thumb = isData ? src : src;
                                              return (
                                                <div key={i} className="flex items-center gap-2 bg-white dark:bg-purple-950/40 rounded px-2 py-1 border border-purple-100 dark:border-purple-700">
                                                  <Image className="w-3 h-3 text-purple-400 shrink-0" />
                                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                                  <img
                                                    src={thumb} alt="uploaded"
                                                    onClick={() => setLightboxUrl(src)}
                                                    className="w-10 h-10 rounded object-cover border border-purple-200 cursor-zoom-in hover:scale-105 transition-transform"
                                                  />
                                                  <span className="text-[9px] text-muted-foreground flex-1">Design {obj.designIdx + 1} · uploaded photo</span>
                                                  <a
                                                    href={src}
                                                    download={`photo_design${obj.designIdx + 1}.jpg`}
                                                    className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-semibold flex items-center gap-0.5"
                                                  >
                                                    <Download className="w-2.5 h-2.5" /> Download
                                                  </a>
                                                </div>
                                              );
                                            }
                                            return null;
                                          })}
                                        </div>
                                      )}

                                      {/* Fonts */}
                                      {allFonts.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <Type className="w-2.5 h-2.5 text-purple-500 shrink-0" />
                                          <span className="text-[9px] text-purple-500 font-semibold">Font{allFonts.length > 1 ? "s" : ""}:</span>
                                          {allFonts.map(f => (
                                            <span key={f} className="text-[9px] bg-white dark:bg-purple-950/50 border border-purple-200 dark:border-purple-700 rounded px-1.5 py-0.5 font-mono text-foreground">{f}</span>
                                          ))}
                                        </div>
                                      )}

                                      {/* Legacy: color swatch */}
                                      {item.custom_color_code && (
                                        <p className="text-[10px] flex items-center gap-1">
                                          <span className="w-3 h-3 rounded-sm border border-border shrink-0" style={{ backgroundColor: item.custom_color_code }} />
                                          <span className="font-mono">{item.custom_color_code}</span>
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <p className="text-[9px] text-muted-foreground text-center">
                  Created {fmtDateTime(selectedOrder.created_at)} · Updated {fmtDateTime(selectedOrder.updated_at)}
                </p>
              </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Lightbox overlay ─────────────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={e => e.key === "Escape" && setLightboxUrl(null)}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Design preview"
              className="rounded-xl shadow-2xl object-contain"
              style={{ width: "90vw", height: "90vh", objectFit: "contain" }}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow flex items-center justify-center text-foreground hover:bg-red-50"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <a
              href={lightboxUrl}
              download="design_preview.png"
              onClick={e => e.stopPropagation()}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white text-foreground text-xs font-medium rounded-full px-4 py-1.5 shadow hover:bg-purple-50 border border-purple-200"
            >
              <Download className="w-3.5 h-3.5 text-purple-600" /> Download full-res
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
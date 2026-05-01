"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Package, Printer, Truck, CheckCircle2, Clock, Flame, AlertTriangle,
  Timer, Paintbrush, ChevronRight, Image, Download, Type, Palette,
  Ruler, Sparkles, Box, Phone, MapPin, Loader2, RefreshCw, Volume2, CheckSquare, Square,
  VolumeX, Eye, ArrowRight, Zap, Filter, FileText,
} from "lucide-react";
import {
  toast, useToast,
  Button, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@gifteeng/ui";
import { authHeaders, getApiBase, safeGet, safePatch } from "@/lib/admin-api";

// ─── Local stubs ──────────────────────────────────────────────
const useAuth = () => ({ user: { id: "stub" }, profile: { role: "super_admin" } });

// ─── API helpers ──────────────────────────────────────────────

interface OrderItem {
  id: string; order_id: string; product_id: string; product_name: string; product_image: string;
  quantity: number; unit_price: number; total_price: number;
  selected_size: string; selected_color: string; selected_material: string;
  selected_finish: string; selected_printing: string;
  custom_text: string; custom_font: string; custom_color_code: string;
  custom_photo_url: string; preview_image_url: string;
  fonts_used: string[]; images_used: string[];
}

interface Order {
  id: string; order_number: string; status: string; payment_method: string;
  customer_name: string; customer_phone: string; customer_email: string;
  shipping_city: string; shipping_state: string;
  total: number; created_at: string; notes: string;
  gift_packaging: boolean; gift_message: string;
}

interface EnrichedOrder extends Order {
  items: OrderItem[];
  hasCustomization: boolean;
  ageHours: number;
  urgency: "overdue" | "urgent" | "today" | "normal";
}

const LANES = [
  { key: "new_orders", label: "🆕 New Orders", statuses: ["new_order", "pending", "confirmed"], color: "bg-blue-500", headerBg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" },
  { key: "in_production", label: "🔧 In Production", statuses: ["processing", "in_production"], color: "bg-indigo-500", headerBg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800" },
  { key: "printed", label: "🖨️ Printed / Ready", statuses: ["printed", "ready_to_ship"], color: "bg-cyan-500", headerBg: "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800" },
  { key: "shipped", label: "🚚 Shipped", statuses: ["shipped"], color: "bg-purple-500", headerBg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800" },
];

// ─── Normalize camelCase API → snake_case Order ───────────────────────────────
function normalizeOrder(raw: any): Order {
  return {
    id:               raw.id ?? "",
    order_number:     raw.order_number ?? raw.orderNumber ?? "",
    status:           raw.status ?? "",
    payment_method:   raw.payment_method ?? raw.paymentMethod ?? "",
    customer_name:    raw.customer_name ?? raw.customerName ?? "",
    customer_phone:   raw.customer_phone ?? raw.customerPhone ?? "",
    customer_email:   raw.customer_email ?? raw.customerEmail ?? "",
    shipping_city:    raw.shipping_city  ?? raw.shippingCity  ?? raw.city  ?? "",
    shipping_state:   raw.shipping_state ?? raw.shippingState ?? raw.state ?? "",
    total:            parseFloat(String(raw.total ?? raw.grandTotal ?? raw.grand_total ?? 0)) || 0,
    created_at:       raw.created_at ?? raw.createdAt ?? raw.placedAt ?? raw.placed_at ?? "",
    notes:            raw.notes ?? "",
    gift_packaging:   raw.gift_packaging ?? raw.giftPackaging ?? false,
    gift_message:     raw.gift_message   ?? raw.giftMessage   ?? "",
  };
}

function getUrgency(order: Order): "overdue" | "urgent" | "today" | "normal" {
  const active = ["pending", "confirmed", "processing", "printed"];
  if (!active.includes(order.status)) return "normal";
  const h = (Date.now() - new Date(order.created_at).getTime()) / 3600000;
  if (h > 48) return "overdue";
  if (h > 36) return "urgent";
  if (h > 24) return "today";
  return "normal";
}

function timeAgo(date: string) {
  const h = (Date.now() - new Date(date).getTime()) / 3600000;
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
}

const urgencyStyles: Record<string, { border: string; bg: string; text: string; icon: React.ElementType; label: string }> = {
  overdue: { border: "border-red-500 dark:border-red-600", bg: "bg-red-50 dark:bg-red-950/50", text: "text-red-700 dark:text-red-300", icon: Flame, label: "OVERDUE" },
  urgent: { border: "border-orange-400 dark:border-orange-600", bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", icon: AlertTriangle, label: "SHIP TODAY" },
  today: { border: "border-yellow-400 dark:border-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950/30", text: "text-yellow-700 dark:text-yellow-300", icon: Timer, label: "SHIP TOMORROW" },
  normal: { border: "border-border/40", bg: "bg-card", text: "text-muted-foreground", icon: Clock, label: "" },
};

const NEXT_STATUS: Record<string, { status: string; label: string; icon: React.ElementType; color: string }> = {
  new_order:    { status: "in_production", label: "Start Production", icon: Zap, color: "bg-indigo-600 hover:bg-indigo-700 text-white" },
  pending:      { status: "confirmed",    label: "Confirm",          icon: CheckCircle2, color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
  confirmed:    { status: "in_production", label: "Start Production", icon: Zap, color: "bg-indigo-600 hover:bg-indigo-700 text-white" },
  processing:   { status: "printed",      label: "Mark Printed",    icon: Printer, color: "bg-cyan-600 hover:bg-cyan-700 text-white" },
  in_production:{ status: "ready_to_ship", label: "Mark Ready",     icon: Printer, color: "bg-cyan-600 hover:bg-cyan-700 text-white" },
  printed:      { status: "shipped",      label: "Mark Shipped",    icon: Truck, color: "bg-purple-600 hover:bg-purple-700 text-white" },
  ready_to_ship:{ status: "shipped",      label: "Mark Shipped",    icon: Truck, color: "bg-purple-600 hover:bg-purple-700 text-white" },
  shipped:      { status: "delivered",    label: "Delivered",        icon: CheckCircle2, color: "bg-emerald-600 hover:bg-emerald-700 text-white" },
};

function OrderCard({ order, onBump, onView, selected, onToggleSelect }: { order: EnrichedOrder; onBump: (id: string, status: string) => void; onView: (order: EnrichedOrder) => void; selected: boolean; onToggleSelect: (id: string) => void }) {
  const u = urgencyStyles[order.urgency];
  const next = NEXT_STATUS[order.status];
  const UIcon = u.icon;

  return (
    <div className={`rounded-xl border-2 ${u.border} ${selected ? "ring-2 ring-primary ring-offset-1" : ""} overflow-hidden transition-all hover:shadow-md`}>
      <div className={`px-3 py-2 ${u.bg} flex items-center justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={(e) => { e.stopPropagation(); onToggleSelect(order.id); }} className="shrink-0 hover:opacity-70 transition-opacity">
            {selected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground/40" />}
          </button>
          <span className="text-sm font-black tracking-tight">#{order.order_number}</span>
          {order.urgency !== "normal" && (
            <span className={`inline-flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-full ${
              order.urgency === "overdue" ? "bg-red-600 text-white animate-pulse" :
              order.urgency === "urgent" ? "bg-orange-500 text-white" :
              "bg-yellow-400 text-yellow-900"
            }`}>
              <UIcon className="w-2.5 h-2.5" /> {u.label}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{timeAgo(order.created_at)}</span>
      </div>

      <div className="p-2 space-y-1.5">
        {order.items.slice(0, 4).map(item => {
          const isCustom = !!(item.custom_text || item.custom_photo_url || item.preview_image_url || (item.fonts_used?.length > 0) || (item.images_used?.length > 0));
          return (
            <div key={item.id} className={`flex gap-2 p-1.5 rounded-lg ${isCustom ? "bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800" : "bg-muted/30"}`}>
              <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 bg-muted">
                {item.preview_image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.preview_image_url} alt="" className="w-full h-full object-cover" />
                ) : item.product_image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.product_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground/30" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate">{item.product_name}</p>
                <p className="text-[10px] text-muted-foreground">Qty: <strong>{item.quantity}</strong></p>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {item.selected_size && <span className="text-[8px] px-1 py-0 rounded bg-muted text-muted-foreground">{item.selected_size}</span>}
                  {item.selected_color && <span className="text-[8px] px-1 py-0 rounded bg-muted text-muted-foreground">{item.selected_color}</span>}
                  {item.selected_material && <span className="text-[8px] px-1 py-0 rounded bg-muted text-muted-foreground">{item.selected_material}</span>}
                </div>
                {isCustom && (
                  <div className="mt-1 flex items-center gap-1">
                    <Paintbrush className="w-2.5 h-2.5 text-purple-600" />
                    <span className="text-[9px] font-bold text-purple-600">CUSTOMIZED</span>
                    {item.custom_text && <span className="text-[9px] text-purple-500 truncate max-w-[80px]">"{item.custom_text}"</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {order.items.length > 4 && (
          <p className="text-[10px] text-muted-foreground text-center">+{order.items.length - 4} more items</p>
        )}
      </div>

      <div className="px-3 py-1.5 bg-muted/20 border-t border-border/30 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          {order.hasCustomization && <span className="font-bold text-purple-600">🎨 Custom</span>}
          {order.gift_packaging && <span className="font-bold text-pink-600">🎁 Gift</span>}
          <span className="text-muted-foreground">{order.items.length} item{order.items.length > 1 ? "s" : ""}</span>
        </div>
        <span className="font-bold">₹{order.total?.toLocaleString("en-IN")}</span>
      </div>

      <div className="px-3 py-1.5 border-t border-border/20 text-[10px] text-muted-foreground truncate">
        {order.customer_name} · {order.shipping_city || order.shipping_state || ""}
      </div>

      <div className="px-2 py-2 border-t border-border/30 flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1 h-8 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); onView(order); }}>
          <Eye className="w-3 h-3" /> Details
        </Button>
        {next && (
          <Button size="sm" className={`flex-1 h-8 text-[10px] gap-1 ${next.color}`} onClick={(e) => { e.stopPropagation(); onBump(order.id, next.status); }}>
            <next.icon className="w-3 h-3" /> {next.label}
          </Button>
        )}
      </div>
    </div>
  );
}

function OrderDetailModal({ order, onClose, onBump }: { order: EnrichedOrder | null; onClose: () => void; onBump: (id: string, status: string) => void }) {
  if (!order) return null;
  const next = NEXT_STATUS[order.status];

  return (
    <Dialog open={!!order} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-black">#{order.order_number}</span>
            {order.urgency !== "normal" && (
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                order.urgency === "overdue" ? "bg-red-600 text-white animate-pulse" :
                order.urgency === "urgent" ? "bg-orange-500 text-white" :
                "bg-yellow-400 text-yellow-900"
              }`}>{urgencyStyles[order.urgency].label}</span>
            )}
            {order.hasCustomization && <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold border border-purple-200">🎨 Customized</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {order.urgency === "overdue" && (
            <div className="bg-red-100 dark:bg-red-950/40 border border-red-300 rounded-xl p-3 flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-600 animate-pulse shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-800">⚠️ OVERDUE — Order placed {timeAgo(order.created_at)} ago!</p>
                <p className="text-xs text-red-600">Ship immediately to avoid customer complaints.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/20 rounded-xl border border-border/30 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Customer</p>
              <p className="text-sm font-semibold">{order.customer_name}</p>
              {order.customer_phone && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{order.customer_phone}</p>}
            </div>
            <div className="bg-muted/20 rounded-xl border border-border/30 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Shipping</p>
              <p className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground" />{order.shipping_city}{order.shipping_state && `, ${order.shipping_state}`}</p>
              <p className="text-xs text-muted-foreground mt-0.5">₹{order.total?.toLocaleString("en-IN")} · {order.payment_method?.toUpperCase() || "—"}</p>
            </div>
          </div>

          {(order.gift_packaging || order.gift_message) && (
            <div className="bg-pink-50 dark:bg-pink-950/30 border border-pink-200 dark:border-pink-800 rounded-xl p-3">
              <p className="text-xs font-bold text-pink-700">🎁 Gift Order</p>
              {order.gift_message && <p className="text-xs mt-1">Message: <em>"{order.gift_message}"</em></p>}
            </div>
          )}

          {order.notes && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-xl p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mb-1">📝 Notes</p>
              <p className="text-xs whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-primary" /> Production Items ({order.items.length})
            </p>
            <div className="space-y-3">
              {order.items.map(item => {
                const isCustom = !!(item.custom_text || item.custom_photo_url || item.preview_image_url || (item.fonts_used?.length > 0) || (item.images_used?.length > 0));
                return (
                  <div key={item.id} className={`rounded-xl border-2 p-3 ${isCustom ? "border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20" : "border-border/40 bg-card"}`}>
                    {isCustom && (
                      <div className="flex items-center gap-1 mb-2 pb-2 border-b border-purple-200 dark:border-purple-800">
                        <Paintbrush className="w-3.5 h-3.5 text-purple-600" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">⚠ CUSTOMIZED — Verify Before Production</span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <div className="shrink-0 space-y-1.5">
                        <div className="w-24 h-24 rounded-lg overflow-hidden border border-border/30 bg-muted">
                          {item.product_image ? (
                            <a href={item.product_image} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.product_image} alt="" className="w-full h-full object-cover hover:opacity-90" />
                            </a>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-muted-foreground/20" /></div>
                          )}
                        </div>
                        {item.product_image && (
                          <a href={item.product_image} download target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="w-full h-6 text-[8px] gap-0.5"><Download className="w-2 h-2" /> Base</Button>
                          </a>
                        )}
                      </div>

                      {item.preview_image_url && (
                        <div className="shrink-0 space-y-1.5">
                          <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-purple-400 bg-muted relative">
                            <a href={item.preview_image_url} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.preview_image_url} alt="" className="w-full h-full object-cover hover:opacity-90" />
                            </a>
                            <span className="absolute top-0.5 left-0.5 text-[7px] bg-purple-600 text-white px-1 rounded font-bold">PREVIEW</span>
                          </div>
                          <a href={item.preview_image_url} download target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm" className="w-full h-6 text-[8px] gap-0.5 border-purple-300 text-purple-700"><Download className="w-2 h-2" /> Preview</Button>
                          </a>
                        </div>
                      )}

                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <h4 className="text-sm font-bold">{item.product_name}</h4>
                          <p className="text-xs text-muted-foreground">Qty: <strong className="text-foreground text-sm">{item.quantity}</strong> · ₹{item.unit_price} each</p>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {item.selected_size && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Ruler className="w-2.5 h-2.5" /> {item.selected_size}</Badge>}
                          {item.selected_color && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Palette className="w-2.5 h-2.5" /> {item.selected_color}</Badge>}
                          {item.selected_material && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Box className="w-2.5 h-2.5" /> {item.selected_material}</Badge>}
                          {item.selected_finish && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Sparkles className="w-2.5 h-2.5" /> {item.selected_finish}</Badge>}
                          {item.selected_printing && <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0 h-4"><Printer className="w-2.5 h-2.5" /> {item.selected_printing}</Badge>}
                        </div>

                        {isCustom && (
                          <div className="bg-white dark:bg-background rounded-lg p-2.5 border border-purple-200 dark:border-purple-700 space-y-1">
                            <p className="text-[9px] font-black uppercase tracking-wider text-purple-600 mb-1">📋 Customization Specs</p>
                            {item.custom_text && (
                              <div className="bg-purple-50 dark:bg-purple-950/30 rounded p-1.5">
                                <p className="text-[9px] text-muted-foreground">Text to Print:</p>
                                <p className="text-sm font-bold text-purple-800 dark:text-purple-200">"{item.custom_text}"</p>
                              </div>
                            )}
                            {item.custom_font && <p className="text-[10px]"><span className="text-muted-foreground">Font:</span> <strong>{item.custom_font}</strong></p>}
                            {item.custom_color_code && (
                              <p className="text-[10px] flex items-center gap-1">
                                <span className="text-muted-foreground">Color:</span>
                                <span className="w-4 h-4 rounded border border-border" style={{ backgroundColor: item.custom_color_code }} />
                                <strong className="font-mono">{item.custom_color_code}</strong>
                              </p>
                            )}
                            {item.fonts_used?.length > 0 && <p className="text-[10px]"><span className="text-muted-foreground">Fonts Used:</span> <strong>{item.fonts_used.join(", ")}</strong></p>}
                          </div>
                        )}

                        {(item.custom_photo_url || (item.images_used?.length > 0)) && (
                          <div>
                            <p className="text-[9px] font-bold uppercase text-muted-foreground mb-1">Customer Images</p>
                            <div className="flex flex-wrap gap-1.5">
                              {item.custom_photo_url && (
                                <a href={item.custom_photo_url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={item.custom_photo_url} alt="" className="w-14 h-14 rounded-lg object-cover border-2 border-purple-300 hover:opacity-90" />
                                </a>
                              )}
                              {item.images_used?.map((img, idx) => (
                                <a key={idx} href={img} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={img} alt="" className="w-14 h-14 rounded-lg object-cover border border-border/30 hover:opacity-90" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {next && (
            <Button className={`w-full h-12 text-sm font-bold gap-2 ${next.color}`} onClick={() => { onBump(order.id, next.status); onClose(); }}>
              <next.icon className="w-4 h-4" /> {next.label} <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function playOrderChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + 1);
    });
  } catch {}
}

function requestPushPermission() {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotification(orderNumber: string, customerName: string) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(`🛒 New Order #${orderNumber}`, {
        body: `From ${customerName}. Open Production Dashboard to process.`,
        icon: "/placeholder.svg",
        tag: `order-${orderNumber}`,
      });
    } catch {}
  }
}

export default function AdminProduction() {
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewOrder, setViewOrder] = useState<EnrichedOrder | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "customized" | "non_customized">("all");
  const [soundOn, setSoundOn] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const knownOrderIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    requestPushPermission();
    setPushEnabled(typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted");
  }, []);

  const loadOrders = useCallback(async () => {
    const res = await safeGet<{ items: any[] }>("/orders/admin/all?pageSize=200&statuses=new_order,pending,confirmed,processing,in_production,printed,ready_to_ship,shipped", { items: [] });
    const rawOrders = (res?.items || []) as any[];

    const itemsByOrder: Record<string, OrderItem[]> = {};
    for (const o of rawOrders) {
      const items: OrderItem[] = o.items || o.order_items || [];
      itemsByOrder[o.id] = items;
    }

    const enriched: EnrichedOrder[] = rawOrders.map((o) => {
      const norm = normalizeOrder(o);
      const items: OrderItem[] = (itemsByOrder[norm.id] || []).map((i: any) => ({
        id: i.id ?? "",
        order_id: i.order_id ?? i.orderId ?? "",
        product_id: i.product_id ?? i.productId ?? "",
        product_name: i.product_name ?? i.productName ?? i.name ?? "",
        product_image: i.product_image ?? i.productImage ?? i.imageUrl ?? "",
        quantity: i.quantity ?? i.qty ?? 1,
        unit_price: parseFloat(String(i.unit_price ?? i.unitPrice ?? i.price ?? 0)) || 0,
        total_price: parseFloat(String(i.total_price ?? i.totalPrice ?? 0)) || 0,
        selected_size: i.selected_size ?? i.selectedSize ?? i.size ?? "",
        selected_color: i.selected_color ?? i.selectedColor ?? i.color ?? "",
        selected_material: i.selected_material ?? i.selectedMaterial ?? "",
        selected_finish: i.selected_finish ?? i.selectedFinish ?? "",
        selected_printing: i.selected_printing ?? i.selectedPrinting ?? "",
        custom_text: i.custom_text ?? i.customText ?? "",
        custom_font: i.custom_font ?? i.customFont ?? "",
        custom_color_code: i.custom_color_code ?? i.customColorCode ?? "",
        custom_photo_url: i.custom_photo_url ?? i.customPhotoUrl ?? "",
        preview_image_url: i.preview_image_url ?? i.previewImageUrl ?? "",
        fonts_used: i.fonts_used ?? i.fontsUsed ?? [],
        images_used: i.images_used ?? i.imagesUsed ?? [],
      }));
      const hasCustomization = items.some(i => !!(i.custom_text || i.custom_photo_url || i.preview_image_url || (i.fonts_used?.length > 0) || (i.images_used?.length > 0)));
      return {
        ...norm,
        items,
        hasCustomization,
        ageHours: norm.created_at ? (Date.now() - new Date(norm.created_at).getTime()) / 3600000 : 0,
        urgency: getUrgency(norm),
      } as EnrichedOrder;
    });

    enriched.sort((a, b) => {
      const uo: Record<string, number> = { overdue: 0, urgent: 1, today: 2, normal: 3 };
      const diff = (uo[a.urgency] ?? 3) - (uo[b.urgency] ?? 3);
      if (diff !== 0) return diff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    if (!isFirstLoad.current) {
      const newOrders = enriched.filter(o => !knownOrderIds.current.has(o.id) && ["pending", "confirmed"].includes(o.status));
      if (newOrders.length > 0) {
        if (soundOn) playOrderChime();
        newOrders.forEach(o => {
          showBrowserNotification(o.order_number, o.customer_name);
          toast({
            title: `🛒 New Order #${o.order_number}`,
            description: `${o.customer_name} · ₹${o.total?.toLocaleString("en-IN")}${o.hasCustomization ? " · 🎨 Customized" : ""}`,
          });
        });
      }
    }
    isFirstLoad.current = false;

    knownOrderIds.current = new Set(enriched.map(o => o.id));

    setOrders(enriched);
    setLoading(false);
  }, [soundOn, toast]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const bumpStatus = async (orderId: string, newStatus: string) => {
    await safePatch(`/orders/${orderId}/status`, { status: newStatus }, null);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, urgency: getUrgency({ ...o, status: newStatus }) } : o));
    if (viewOrder?.id === orderId) setViewOrder(prev => prev ? { ...prev, status: newStatus } : null);
    toast({ title: `✅ Order bumped to ${newStatus}` });
    if (newStatus === "delivered") {
      setTimeout(() => setOrders(prev => prev.filter(o => o.id !== orderId)), 1500);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredOrders = useMemo(() => {
    if (typeFilter === "all") return orders;
    if (typeFilter === "customized") return orders.filter(o => o.hasCustomization);
    return orders.filter(o => !o.hasCustomization);
  }, [orders, typeFilter]);

  const selectAllInLane = (statuses: string[]) => {
    const ids = filteredOrders.filter(o => statuses.includes(o.status)).map(o => o.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const bulkBump = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id => safePatch(`/orders/${id}/status`, { status: newStatus }, null)));
    setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, status: newStatus, urgency: getUrgency({ ...o, status: newStatus }) } : o));
    setSelectedIds(new Set());
    setBulkLoading(false);
    toast({ title: `✅ ${ids.length} orders marked as ${newStatus}` });
    if (newStatus === "delivered") {
      setTimeout(() => setOrders(prev => prev.filter(o => !ids.includes(o.id))), 1500);
    }
  };

  const batchPrint = () => {
    const selected = orders.filter(o => selectedIds.has(o.id));
    if (selected.length === 0) return;

    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Please allow popups for printing" }); return; }

    const html = `<!DOCTYPE html><html><head><title>Production Orders</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
  .order { page-break-after: always; padding: 20px; }
  .order:last-child { page-break-after: auto; }
  .header { border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
  .header h2 { font-size: 18px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; color: #fff; margin-left: 8px; }
  .badge-custom { background: #7c3aed; }
  .badge-gift { background: #ec4899; }
  .badge-overdue { background: #dc2626; }
  .badge-urgent { background: #ea580c; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .meta-box { border: 1px solid #ddd; padding: 8px; border-radius: 4px; }
  .meta-label { font-size: 9px; text-transform: uppercase; font-weight: bold; color: #888; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; font-size: 11px; }
  th { background: #f5f5f5; font-weight: bold; }
  .custom-box { background: #faf5ff; border: 2px solid #c084fc; border-radius: 6px; padding: 10px; margin-top: 8px; }
  .custom-box h4 { color: #7c3aed; font-size: 11px; margin-bottom: 6px; }
  .custom-detail { margin-bottom: 4px; }
  .img-row { display: flex; gap: 8px; margin-top: 6px; }
  .img-row img { width: 80px; height: 80px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; }
  .preview-img { border-color: #c084fc !important; border-width: 2px !important; }
  .notes { background: #fffbeb; border: 1px solid #fbbf24; padding: 8px; border-radius: 4px; margin-bottom: 12px; }
  @media print { .no-print { display: none; } }
</style></head><body>
<div style="padding:10px 20px; text-align:right;" class="no-print">
  <button onclick="window.print()" style="padding:8px 20px; font-size:14px; cursor:pointer; background:#4f46e5; color:#fff; border:none; border-radius:6px;">🖨️ Print All</button>
</div>
${selected.map(order => {
  const isCustom = (i: OrderItem) => !!(i.custom_text || i.custom_photo_url || i.preview_image_url || (i.fonts_used?.length > 0) || (i.images_used?.length > 0));
  return `<div class="order">
    <div class="header">
      <h2>Order #${order.order_number}
        ${order.hasCustomization ? '<span class="badge badge-custom">🎨 CUSTOMIZED</span>' : ''}
        ${order.gift_packaging ? '<span class="badge badge-gift">🎁 GIFT</span>' : ''}
        ${order.urgency === "overdue" ? '<span class="badge badge-overdue">OVERDUE</span>' : ''}
        ${order.urgency === "urgent" ? '<span class="badge badge-urgent">SHIP TODAY</span>' : ''}
      </h2>
      <div style="text-align:right; font-size:11px; color:#666;">
        <div>Placed: ${new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
        <div>Status: <strong>${order.status.toUpperCase()}</strong></div>
      </div>
    </div>
    <div class="meta">
      <div class="meta-box"><div class="meta-label">Customer</div><strong>${order.customer_name}</strong><br/>${order.customer_phone}<br/>${order.customer_email}</div>
      <div class="meta-box"><div class="meta-label">Shipping</div>${order.shipping_city || ""}${order.shipping_state ? ", " + order.shipping_state : ""}<br/>Payment: ${order.payment_method?.toUpperCase() || "—"}<br/><strong>Total: ₹${order.total?.toLocaleString("en-IN")}</strong></div>
    </div>
    ${order.notes ? `<div class="notes"><strong>📝 Notes:</strong> ${order.notes}</div>` : ""}
    ${order.gift_message ? `<div class="notes" style="background:#fdf2f8; border-color:#f9a8d4;"><strong>🎁 Gift Message:</strong> ${order.gift_message}</div>` : ""}
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Size</th><th>Color</th><th>Material</th><th>Finish</th><th>Price</th></tr></thead>
      <tbody>${order.items.map((item, idx) => `<tr${isCustom(item) ? ' style="background:#faf5ff;"' : ''}>
        <td>${idx + 1}</td><td><strong>${item.product_name}</strong>${isCustom(item) ? " 🎨" : ""}</td><td>${item.quantity}</td>
        <td>${item.selected_size || "—"}</td><td>${item.selected_color || "—"}</td><td>${item.selected_material || "—"}</td><td>${item.selected_finish || "—"}</td>
        <td>₹${item.total_price?.toLocaleString("en-IN") || "—"}</td></tr>`).join("")}
      </tbody>
    </table>
    ${order.items.filter(isCustom).map(item => `<div class="custom-box">
      <h4>🎨 Customization — ${item.product_name}</h4>
      ${item.custom_text ? `<div class="custom-detail"><strong>Text:</strong> "${item.custom_text}"</div>` : ""}
      ${item.custom_font ? `<div class="custom-detail"><strong>Font:</strong> ${item.custom_font}</div>` : ""}
      ${item.custom_color_code ? `<div class="custom-detail"><strong>Color:</strong> <span style="display:inline-block;width:14px;height:14px;background:${item.custom_color_code};border:1px solid #ccc;vertical-align:middle;border-radius:2px;"></span> ${item.custom_color_code}</div>` : ""}
      ${item.fonts_used?.length ? `<div class="custom-detail"><strong>Fonts Used:</strong> ${item.fonts_used.join(", ")}</div>` : ""}
      <div class="img-row">
        ${item.product_image ? `<img src="${item.product_image}" alt="Base"/>` : ""}
        ${item.preview_image_url ? `<img src="${item.preview_image_url}" class="preview-img" alt="Preview"/>` : ""}
        ${item.custom_photo_url ? `<img src="${item.custom_photo_url}" alt="Customer Photo"/>` : ""}
        ${(item.images_used || []).map((img: string) => `<img src="${img}" alt="Upload"/>`).join("")}
      </div>
    </div>`).join("")}
  </div>`;
}).join("")}
</body></html>`;

    w.document.write(html);
    w.document.close();
  };

  const overdueCount = orders.filter(o => o.urgency === "overdue").length;
  const customCount = orders.filter(o => o.hasCustomization && ["pending", "confirmed", "processing", "printed"].includes(o.status)).length;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold tracking-tight">Production Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              {orders.filter(o => !["shipped", "delivered"].includes(o.status)).length} in pipeline
              {overdueCount > 0 && <span className="text-red-600 font-bold ml-2">· {overdueCount} overdue!</span>}
              {customCount > 0 && <span className="text-purple-600 font-bold ml-2">· {customCount} customized</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="customized">🎨 Customized</SelectItem>
              <SelectItem value="non_customized">📦 Standard</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setSoundOn(!soundOn)}>
            {soundOn ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={loadOrders}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="bg-red-600 text-white rounded-xl p-3 flex items-center gap-3 animate-pulse">
          <Flame className="w-6 h-6 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-black">🚨 {overdueCount} OVERDUE ORDER{overdueCount > 1 ? "S" : ""} — SHIP IMMEDIATELY!</p>
            <p className="text-xs opacity-80">These orders are older than 48 hours. Customers are waiting!</p>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="sticky top-14 z-20 bg-primary text-primary-foreground rounded-xl p-3 flex items-center justify-between gap-3 shadow-lg animate-in slide-in-from-top-2">
          <span className="text-sm font-bold">{selectedIds.size} order{selectedIds.size > 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1" onClick={() => bulkBump("confirmed")} disabled={bulkLoading}>
              <CheckCircle2 className="w-3 h-3" /> Confirm All
            </Button>
            <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1" onClick={() => bulkBump("processing")} disabled={bulkLoading}>
              <Zap className="w-3 h-3" /> Start Production
            </Button>
            <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1" onClick={() => bulkBump("printed")} disabled={bulkLoading}>
              <Printer className="w-3 h-3" /> Mark Printed
            </Button>
            <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1" onClick={() => bulkBump("shipped")} disabled={bulkLoading}>
              <Truck className="w-3 h-3" /> Mark Shipped
            </Button>
            <div className="w-px h-5 bg-primary-foreground/20" />
            <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1" onClick={batchPrint}>
              <FileText className="w-3 h-3" /> 🖨️ Print Selected
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-primary-foreground/70 hover:text-primary-foreground" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            {bulkLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {LANES.map(lane => {
          const laneOrders = filteredOrders.filter(o => lane.statuses.includes(o.status));
          const laneSelectedCount = laneOrders.filter(o => selectedIds.has(o.id)).length;
          return (
            <div key={lane.key} className="min-h-[300px]">
              <div className={`rounded-t-xl border px-3 py-2 ${lane.headerBg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {laneOrders.length > 0 && (
                      <button onClick={() => selectAllInLane(lane.statuses)} className="hover:opacity-70 transition-opacity" title="Select all in lane">
                        {laneSelectedCount === laneOrders.length && laneOrders.length > 0
                          ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          : <Square className="w-3.5 h-3.5 text-muted-foreground/40" />}
                      </button>
                    )}
                    <span className="text-xs font-bold">{lane.label}</span>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full text-white ${lane.color}`}>
                    {laneOrders.length}
                  </span>
                </div>
              </div>

              <div className="border border-t-0 border-border/30 rounded-b-xl bg-muted/10 p-2 space-y-2 min-h-[250px]">
                {laneOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/30">
                    <CheckCircle2 className="w-8 h-8 mb-1" />
                    <p className="text-[10px] font-medium">All clear! 🎉</p>
                  </div>
                ) : (
                  laneOrders.map(order => (
                    <OrderCard key={order.id} order={order} onBump={bumpStatus} onView={setViewOrder} selected={selectedIds.has(order.id)} onToggleSelect={toggleSelect} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-muted-foreground text-center">Auto-refreshes every 30 seconds · Last updated {new Date().toLocaleTimeString()}</p>

      <OrderDetailModal order={viewOrder} onClose={() => setViewOrder(null)} onBump={bumpStatus} />
    </div>
  );
}

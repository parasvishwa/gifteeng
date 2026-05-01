"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  FileText, Download, Search, X, Plus, Trash2, Printer,
  Filter, Loader2, RefreshCw, Mail, Building2, IndianRupee,
  Settings2, Save, MessageCircle, Clock, Receipt, ChevronRight,
  CheckCircle2, AlertCircle, Banknote, ArrowLeft,
} from "lucide-react";
import {
  Button, Input, Badge,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@gifteeng/ui";
import Link from "next/link";
import { authHeaders, getApiBase, safeGet } from "@/lib/admin-api";

// ─── API helpers ──────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────
interface BusinessSettings {
  name: string; gstin: string; pan: string;
  address: string; city: string; state: string; pincode: string;
  phone: string; email: string; logoUrl: string;
  prefix: string; dueDays: number; defaultNotes: string; terms: string;
  bankName: string; bankAccount: string; bankIfsc: string; bankBranch: string; bankUpi: string;
}
interface LineItem {
  id: string; productName: string; hsnCode: string;
  qty: number; unitPrice: number; gstPct: 0 | 5 | 12 | 18 | 28;
}
interface InvoiceCustomer {
  name: string; email: string; phone: string;
  gstin: string; address: string; city: string; state: string; pincode: string;
}
interface CustomInvoice {
  id: string; invNumber: string; invDate: string; dueDate: string;
  customer: InvoiceCustomer; items: LineItem[];
  notes: string; paymentTerms: string; placeOfSupply: string;
  reverseCharge: boolean; status: "draft" | "sent" | "paid";
  createdAt: string; grandTotal: number;
}
interface Order {
  id: string; orderNumber: string; customerName: string;
  customerEmail: string; status: string; grandTotal: string;
  placedAt: string; channel: string; invoiceNumber: string; companyName: string;
}
type PaymentStatus = "paid" | "unpaid" | "partial";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_BIZ: BusinessSettings = {
  name: "Imazyn Ecommerce Pvt Ltd", gstin: "27AAICI1928A1ZV", pan: "",
  address: "D 03, Plot 12, Akurli Godavari CHS, Mhada Rd No. 2, Opp MTNL, Lokhandwala, Kandivali East",
  city: "Mumbai", state: "Maharashtra", pincode: "400101",
  phone: "", email: "billing@gifteeng.com", logoUrl: "",
  prefix: "INV", dueDays: 30,
  defaultNotes: "Thank you for shopping with Gifteeng — Engineer Your Emotions!",
  terms: "Payment due within 30 days of invoice date. Late payments attract 18% p.a. interest.",
  bankName: "", bankAccount: "", bankIfsc: "", bankBranch: "", bankUpi: "",
};

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Delhi","Jammu & Kashmir","Ladakh","Chandigarh","Puducherry",
];

// GST state codes (first two digits of a GSTIN). Used to render the correct
// "Place of Supply: <State> (<code>)" on the tax invoice. Keys are lower-cased
// so comparison is case-insensitive.
const GST_STATE_CODES: Record<string, string> = {
  "jammu & kashmir": "01", "jammu and kashmir": "01",
  "himachal pradesh": "02",
  "punjab": "03",
  "chandigarh": "04",
  "uttarakhand": "05",
  "haryana": "06",
  "delhi": "07",
  "rajasthan": "08",
  "uttar pradesh": "09",
  "bihar": "10",
  "sikkim": "11",
  "arunachal pradesh": "12",
  "nagaland": "13",
  "manipur": "14",
  "mizoram": "15",
  "tripura": "16",
  "meghalaya": "17",
  "assam": "18",
  "west bengal": "19",
  "jharkhand": "20",
  "odisha": "21", "orissa": "21",
  "chhattisgarh": "22",
  "madhya pradesh": "23",
  "gujarat": "24",
  "daman & diu": "25", "daman and diu": "25",
  "dadra & nagar haveli": "26", "dadra and nagar haveli": "26",
  "maharashtra": "27",
  "andhra pradesh": "28",
  "karnataka": "29",
  "goa": "30",
  "lakshadweep": "31",
  "kerala": "32",
  "tamil nadu": "33",
  "puducherry": "34", "pondicherry": "34",
  "andaman & nicobar islands": "35", "andaman and nicobar islands": "35",
  "telangana": "36",
  "ladakh": "38",
};
function gstStateCodeFor(stateName: string | undefined | null): string {
  if (!stateName) return "";
  return GST_STATE_CODES[stateName.trim().toLowerCase()] ?? "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genId() { return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2); }

function fmtDate(s?: string) {
  if (!s || s === "undefined") return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function fmtCurr(v: string | number | undefined) {
  const n = parseFloat(String(v ?? "0")) || 0;
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function amountToWords(amount: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function toW(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? " " + ones[n%10] : "");
    if (n < 1000) return ones[Math.floor(n/100)] + " Hundred" + (n%100 ? " " + toW(n%100) : "");
    if (n < 100000) return toW(Math.floor(n/1000)) + " Thousand" + (n%1000 ? " " + toW(n%1000) : "");
    if (n < 10000000) return toW(Math.floor(n/100000)) + " Lakh" + (n%100000 ? " " + toW(n%100000) : "");
    return toW(Math.floor(n/10000000)) + " Crore" + (n%10000000 ? " " + toW(n%10000000) : "");
  }
  const r = Math.floor(amount);
  const p = Math.round((amount - r) * 100);
  return "Rupees " + (r === 0 ? "Zero" : toW(r)) + (p > 0 ? " and " + toW(p) + " Paise" : "") + " Only";
}

function getFinancialYear() {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}
function nextInvNumber(prefix: string) {
  if (typeof window === "undefined") return `${prefix}/0001`;
  const key = `gifteeng.inv.seq.${getFinancialYear()}`;
  const seq = (parseInt(localStorage.getItem(key) || "0")) + 1;
  localStorage.setItem(key, String(seq));
  return `${prefix}/${getFinancialYear()}/${String(seq).padStart(4, "0")}`;
}

function parseSettings(data: Record<string, any>): BusinessSettings {
  const g = (k: string, def = "") => {
    const v = data[k];
    if (v === undefined || v === null) return def;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.replace(/^"|"$/g, "") || def;
  };
  return {
    name: g("invoice_business_name", "Imazyn Ecommerce Pvt Ltd"),
    gstin: g("invoice_gstin", "27AAICI1928A1ZV"),
    pan: g("invoice_pan"),
    address: g("invoice_address", "D 03, Plot 12, Akurli Godavari CHS, Mhada Rd No. 2, Opp MTNL, Lokhandwala, Kandivali East"),
    city: g("invoice_city", "Mumbai"),
    state: g("invoice_state", "Maharashtra"),
    pincode: g("invoice_pincode", "400101"),
    phone: g("invoice_phone", ""),
    email: g("invoice_email", "billing@gifteeng.com"),
    logoUrl: g("invoice_logo_url"),
    prefix: g("invoice_prefix", "INV"),
    dueDays: parseInt(g("invoice_due_days", "30")) || 30,
    defaultNotes: g("invoice_default_notes", "Thank you for your business!"),
    terms: g("invoice_terms", "Payment due within 30 days of invoice date."),
    bankName: g("invoice_bank_name"),
    bankAccount: g("invoice_bank_account"),
    bankIfsc: g("invoice_bank_ifsc"),
    bankBranch: g("invoice_bank_branch"),
    bankUpi: g("invoice_bank_upi"),
  };
}

function normalizeOrder(o: Record<string, unknown>): Order {
  return {
    id: String(o.id ?? ""),
    orderNumber: String(o.orderNumber ?? o.order_number ?? ""),
    customerName: String(o.customerName ?? o.customer_name ?? "—"),
    customerEmail: String(o.customerEmail ?? o.customer_email ?? ""),
    status: String(o.status ?? ""),
    grandTotal: String(o.grandTotal ?? o.total ?? "0"),
    placedAt: String(o.placedAt ?? o.placed_at ?? o.createdAt ?? o.created_at ?? ""),
    channel: String(o.channel ?? "b2c"),
    invoiceNumber: String(o.invoiceNumber ?? o.invoice_number ?? ""),
    companyName: String(o.companyName ?? o.company_name ?? ""),
  };
}

function inferPayStatus(o: Order): PaymentStatus {
  if (["delivered", "shipped", "processing", "confirmed"].includes(o.status)) return "paid";
  return "unpaid";
}

function loadCustomInvoices(): CustomInvoice[] {
  try { return JSON.parse(localStorage.getItem("gifteeng.custom.invoices") || "[]"); } catch { return []; }
}
function saveCustomInvoices(list: CustomInvoice[]) {
  localStorage.setItem("gifteeng.custom.invoices", JSON.stringify(list));
}

// ─── In-page toast ────────────────────────────────────────────────────────────
let _setToast: ((t: { msg: string; ok?: boolean } | null) => void) | null = null;
function toast(msg: string, ok = true) { _setToast?.({ msg, ok }); setTimeout(() => _setToast?.(null), 3000); }
function ToastBanner() {
  const [t, setT] = useState<{ msg: string; ok?: boolean } | null>(null);
  useEffect(() => { _setToast = setT; return () => { _setToast = null; }; }, []);
  if (!t) return null;
  return (
    <div className={`fixed bottom-4 right-4 z-[300] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-medium animate-in slide-in-from-bottom-2 ${t.ok !== false ? "bg-card border-border text-foreground" : "bg-destructive text-white border-destructive/30"}`}>
      {t.ok !== false ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5" />}
      {t.msg}
    </div>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────
function PayBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    paid:    "bg-emerald-100 text-emerald-700 border-emerald-300",
    unpaid:  "bg-red-100 text-red-700 border-red-300",
    partial: "bg-amber-100 text-amber-700 border-amber-300",
    draft:   "bg-slate-100 text-slate-600 border-slate-300",
    sent:    "bg-blue-100 text-blue-700 border-blue-300",
  };
  const labels: Record<string, string> = { paid: "Paid", unpaid: "Unpaid", partial: "Partial", draft: "Draft", sent: "Sent" };
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg[status] ?? cfg.unpaid}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── PDF generation ───────────────────────────────────────────────────────────
function printInvoice(params: {
  sender: BusinessSettings; customer: InvoiceCustomer; items: LineItem[];
  invNumber: string; invDate: string; dueDate: string;
  paymentTerms: string; notes: string; placeOfSupply: string; reverseCharge: boolean;
}) {
  const { sender, customer, items, invNumber, invDate, dueDate, paymentTerms, notes, placeOfSupply, reverseCharge } = params;
  const sameState = (placeOfSupply || customer.state).trim().toLowerCase() === sender.state.trim().toLowerCase();

  const lineCalcs = items.filter(i => i.productName).map(item => {
    const base = item.qty * item.unitPrice;
    const taxAmt = (base * item.gstPct) / 100;
    return { ...item, base, taxAmt, lineTotal: base + taxAmt };
  });
  const subtotal = lineCalcs.reduce((s, l) => s + l.base, 0);
  const totalTax = lineCalcs.reduce((s, l) => s + l.taxAmt, 0);
  const grandTotal = subtotal + totalTax;

  // The GST "Place of Supply" code is the destination state's code, NOT the
  // sender's. Earlier this was hardcoded to the sender's GSTIN prefix, so an
  // invoice shipped to Bihar still rendered "Bihar (27)" (Maharashtra's code).
  // Derive the correct code from the POS state name via the official map; fall
  // back to whatever the GSTIN prefix says only if the name lookup fails.
  const posStateName = (placeOfSupply || customer.state || "").trim();
  const stateCode =
    gstStateCodeFor(posStateName) ||
    sender.gstin?.slice(0, 2) ||
    "27";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Invoice ${invNumber}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
@media print {
  @page { margin: 12mm 14mm; size: A4; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: #fff; }

/* ── Header ── */
.header {
  padding: 28px 32px 20px;
  display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 3px solid #c2185b;
}
.brand-wrap { display: flex; align-items: center; gap: 10px; }
.brand-icon { width: 40px; height: 40px; border-radius: 9px; background: #fce4ec; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.brand-name { font-size: 20px; font-weight: 900; color: #1a1a2e; letter-spacing: -0.5px; line-height: 1; }
.brand-sub { font-size: 7.5px; letter-spacing: 2.5px; text-transform: uppercase; color: #9ca3af; margin-top: 3px; }
.inv-meta { text-align: right; }
.inv-type { font-size: 8px; letter-spacing: 3px; text-transform: uppercase; color: #9ca3af; font-weight: 600; }
.inv-num { font-size: 18px; font-weight: 900; color: #c2185b; margin-top: 2px; letter-spacing: 0.3px; }
.inv-dates { font-size: 9.5px; color: #6b7280; margin-top: 5px; line-height: 1.9; }
.inv-dates strong { color: #374151; font-weight: 600; }

/* ── Info bar ── */
.pos-bar {
  background: #f9fafb; border-bottom: 1px solid #e5e7eb;
  padding: 7px 32px; display: flex; gap: 28px; font-size: 9px; color: #6b7280;
}
.pos-item strong { color: #374151; font-weight: 700; }

/* ── Addresses ── */
.addr-grid { display: grid; grid-template-columns: 1fr 1fr; }
.addr-block { padding: 18px 32px; }
.addr-block + .addr-block { border-left: 1px solid #f3f4f6; }
.addr-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 2px; color: #c2185b; font-weight: 700; margin-bottom: 9px; }
.addr-main { font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 3px; }
.addr-gstin { font-family: monospace; font-size: 9.5px; color: #7c3aed; font-weight: 600; margin-bottom: 4px; }
.addr-detail { font-size: 10px; color: #4b5563; line-height: 1.8; }

.divider { height: 1px; background: #e5e7eb; margin: 0 32px; }

/* ── Items table ── */
.items-wrap { padding: 16px 32px 0; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: #f3f4f6; border-top: 2px solid #e5e7eb; border-bottom: 2px solid #e5e7eb; }
thead th { color: #374151; padding: 8px 10px; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; text-align: left; }
thead th.r { text-align: right; }
tbody tr { border-bottom: 1px solid #f3f4f6; }
tbody tr:last-child { border-bottom: 2px solid #e5e7eb; }
tbody td { padding: 9px 10px; font-size: 10.5px; color: #374151; vertical-align: top; }
tbody td.r { text-align: right; font-variant-numeric: tabular-nums; }
tbody td.mono { font-family: monospace; font-size: 9px; color: #6b7280; }
tbody td.bold { font-weight: 600; color: #1a1a2e; }

/* ── Totals ── */
.totals-row-wrap { display: flex; justify-content: flex-end; padding: 12px 32px 0; }
.totals-box { width: 260px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.t-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 14px; border-bottom: 1px solid #f3f4f6; font-size: 10.5px; }
.t-row:last-child { border-bottom: none; }
.t-row .lbl { color: #6b7280; }
.t-row .val { font-weight: 600; font-variant-numeric: tabular-nums; color: #374151; }
.t-row.grand { background: #1a1a2e; padding: 11px 14px; }
.t-row.grand .lbl { color: rgba(255,255,255,0.7); font-size: 11px; font-weight: 600; }
.t-row.grand .val { color: #f9fafb; font-size: 15px; font-weight: 800; }
.t-row.sub-tax { background: #fafafa; }

/* ── Amount in words ── */
.words-wrap { margin: 10px 32px 0; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 14px; font-size: 9.5px; color: #374151; }
.words-wrap strong { font-weight: 700; color: #1a1a2e; }

.rc-notice { margin: 10px 32px 0; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 7px 12px; font-size: 9px; color: #92400e; }

/* ── Bank details ── */
.bank-section { margin: 14px 32px 0; }
.bank-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 2px; color: #c2185b; font-weight: 700; margin-bottom: 8px; }
.bank-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; font-size: 10px; }
.bank-item .bk { color: #9ca3af; font-size: 8px; }
.bank-item .bv { color: #1f2937; font-weight: 600; font-family: monospace; font-size: 10px; }

/* ── Notes / Terms ── */
.bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 14px 0 0; border-top: 1px solid #f3f4f6; }
.notes-block { padding: 12px 32px; }
.notes-block + .notes-block { border-left: 1px solid #f3f4f6; }
.notes-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 2px; color: #c2185b; font-weight: 700; margin-bottom: 6px; }
.notes-text { font-size: 9.5px; color: #4b5563; line-height: 1.8; }

/* ── Signature ── */
.sig-section { display: flex; justify-content: space-between; align-items: flex-end; padding: 8px 32px 20px; }
.sig-note { font-size: 8px; color: #9ca3af; max-width: 200px; line-height: 1.6; }
.sig-box { text-align: center; }
.sig-space { height: 38px; }
.sig-line { border-top: 1px solid #d1d5db; padding-top: 5px; font-size: 8.5px; color: #6b7280; }
.sig-company { font-size: 8px; color: #9ca3af; margin-top: 2px; }

/* ── Footer ── */
.footer {
  border-top: 2px solid #c2185b;
  padding: 10px 32px;
  display: flex; justify-content: space-between; align-items: center;
  background: #f9fafb;
}
.footer-left { color: #6b7280; font-size: 8.5px; line-height: 1.7; }
.footer-left strong { color: #1a1a2e; font-size: 9px; }
.footer-right { color: #9ca3af; font-size: 8px; text-align: right; }
.footer-right strong { color: #374151; font-size: 10px; display: block; }
</style>
</head>
<body>
<!-- HEADER -->
<div class="header">
  <div class="brand-wrap">
    <div class="brand-icon">🎁</div>
    <div class="brand-text">
      <div class="brand-name">Gifteeng</div>
      <div class="brand-sub" style="font-size:8.5px;letter-spacing:0.5px;color:#555;text-transform:none;margin-top:2px;">${sender.name}</div>
      <div class="brand-sub">Engineer Your Emotions</div>
    </div>
  </div>
  <div class="inv-meta">
    <div class="inv-type">Tax Invoice</div>
    <div class="inv-num">#${invNumber}</div>
    <div class="inv-dates">
      <strong>Date:</strong> ${fmtDate(invDate)}<br/>
      <strong>Due:</strong> ${fmtDate(dueDate)}
    </div>
  </div>
</div>

<!-- PLACE OF SUPPLY BAR -->
<div class="pos-bar">
  <span class="pos-item"><strong>GSTIN:</strong> ${sender.gstin}</span>
  ${sender.pan ? `<span class="pos-item"><strong>PAN:</strong> ${sender.pan}</span>` : ""}
  <span class="pos-item"><strong>Place of Supply:</strong> ${placeOfSupply || customer.state} (${stateCode})</span>
  <span class="pos-item"><strong>Tax:</strong> ${sameState ? "CGST + SGST (Intra-state)" : "IGST (Inter-state)"}</span>
  ${reverseCharge ? '<span class="pos-item" style="color:#b45309"><strong>Reverse Charge:</strong> Yes</span>' : ""}
</div>

<!-- ADDRESSES -->
<div class="addr-grid">
  <div class="addr-block">
    <div class="addr-label">Bill To</div>
    <div class="addr-main">${customer.name}</div>
    ${customer.gstin ? `<div class="addr-gstin">GSTIN: ${customer.gstin}</div>` : ""}
    <div class="addr-detail">
      ${customer.address}<br/>
      ${customer.city}${customer.city && customer.state ? ", " : ""}${customer.state}${customer.pincode ? " — " + customer.pincode : ""}
      ${customer.email ? "<br/>" + customer.email : ""}
      ${customer.phone ? "<br/>" + customer.phone : ""}
    </div>
  </div>
  <div class="addr-block">
    <div class="addr-label">Supply From</div>
    <div class="addr-main">${sender.name}</div>
    <div class="addr-gstin">GSTIN: ${sender.gstin}</div>
    <div class="addr-detail">
      ${sender.address}<br/>
      ${sender.city}, ${sender.state} — ${sender.pincode}<br/>
      ${sender.email} · ${sender.phone}
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- ITEMS TABLE -->
<div class="items-wrap">
  <table>
    <thead>
      <tr>
        <th style="width:26px">#</th>
        <th>Item / Description</th>
        <th style="width:64px">HSN/SAC</th>
        <th class="r" style="width:36px">Qty</th>
        <th class="r" style="width:80px">Rate (₹)</th>
        <th class="r" style="width:52px">GST%</th>
        <th class="r" style="width:54px">GST (₹)</th>
        <th class="r" style="width:88px">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${lineCalcs.map((l, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${l.productName}</td>
          <td class="mono">${l.hsnCode || "—"}</td>
          <td class="r">${l.qty}</td>
          <td class="r">${fmtCurr(l.unitPrice)}</td>
          <td class="r">${l.gstPct}%</td>
          <td class="r">${fmtCurr(l.taxAmt)}</td>
          <td class="r bold">${fmtCurr(l.lineTotal)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

<!-- TOTALS -->
<div class="totals-row-wrap">
  <div class="totals-box">
    <div class="t-row sub-tax"><span class="lbl">Subtotal (Taxable)</span><span class="val">₹${fmtCurr(subtotal)}</span></div>
    ${sameState
      ? `<div class="t-row"><span class="lbl">CGST</span><span class="val">₹${fmtCurr(totalTax / 2)}</span></div>
         <div class="t-row"><span class="lbl">SGST</span><span class="val">₹${fmtCurr(totalTax / 2)}</span></div>`
      : `<div class="t-row"><span class="lbl">IGST</span><span class="val">₹${fmtCurr(totalTax)}</span></div>`
    }
    <div class="t-row grand"><span class="lbl">Grand Total</span><span class="val">₹${fmtCurr(grandTotal)}</span></div>
  </div>
</div>

<!-- AMOUNT IN WORDS -->
<div class="words-wrap">
  <strong>Amount in Words:</strong> ${amountToWords(grandTotal)}
</div>

${reverseCharge ? `<div class="rc-notice">⚠️ <strong>Reverse Charge:</strong> Tax is payable on reverse charge basis — YES. The recipient is liable to pay GST under Reverse Charge Mechanism (RCM).</div>` : ""}

<!-- BANK DETAILS -->
${sender.bankName ? `
<div class="bank-section">
  <div class="bank-label">💳 Payment Details</div>
  <div class="bank-box">
    <div class="bank-item"><div class="bk">Bank Name</div><div class="bv">${sender.bankName}</div></div>
    <div class="bank-item"><div class="bk">Account Number</div><div class="bv">${sender.bankAccount}</div></div>
    <div class="bank-item"><div class="bk">IFSC Code</div><div class="bv">${sender.bankIfsc}</div></div>
    <div class="bank-item"><div class="bk">Branch</div><div class="bv">${sender.bankBranch}</div></div>
    ${sender.bankUpi ? `<div class="bank-item"><div class="bk">UPI ID</div><div class="bv">${sender.bankUpi}</div></div>` : ""}
  </div>
</div>` : ""}

<!-- NOTES & TERMS -->
<div class="bottom-grid">
  <div class="notes-block">
    <div class="notes-label">Notes</div>
    <div class="notes-text">${notes || sender.defaultNotes}</div>
    ${paymentTerms ? `<div class="notes-text" style="margin-top:6px"><strong>Payment Terms:</strong> ${paymentTerms}</div>` : ""}
  </div>
  <div class="notes-block">
    <div class="notes-label">Terms &amp; Conditions</div>
    <div class="notes-text">${sender.terms}</div>
  </div>
</div>

<!-- SIGNATURE -->
<div class="sig-section">
  <div class="sig-note">This is a computer-generated invoice.<br/>Subject to ${sender.city} jurisdiction.</div>
  <div class="sig-box">
    <div class="sig-space"></div>
    <div class="sig-line">Authorised Signatory</div>
    <div class="sig-company">For ${sender.name}</div>
  </div>
</div>

<!-- FOOTER -->
<div class="footer">
  <div class="footer-left">
    <strong>🎁 Gifteeng</strong> &nbsp;<span style="font-weight:400;color:#6b7280;font-size:8px;">(${sender.name})</span><br/>
    GSTIN: ${sender.gstin}${sender.email ? " · " + sender.email : ""}
  </div>
  <div class="footer-right">
    <strong>Page 1 / 1</strong>
    ${sameState ? "CGST + SGST (Intra-state supply)" : "IGST (Inter-state supply)"}
  </div>
</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Please allow popups to generate PDF."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
function openWhatsApp(customer: InvoiceCustomer, invNumber: string, grandTotal: number, items: LineItem[], sender: BusinessSettings) {
  const raw = customer.phone.replace(/\D/g, "");
  const wa = raw.startsWith("91") ? raw : `91${raw}`;
  const lines = items.filter(i => i.productName).map(i =>
    `• ${i.productName} × ${i.qty} = ₹${fmtCurr(i.qty * i.unitPrice)}`
  ).join("\n");
  const msg = `Dear *${customer.name || "Customer"}*,\n\nYour invoice *${invNumber}* from *${sender.name}* is ready. 🎁\n\n${lines}\n\n💰 *Grand Total: ₹${fmtCurr(grandTotal)}*\n\nFor any queries, reach us at ${sender.email}\n\nThank you for your business! 🙏\n_${sender.name} Team_`;
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, "_blank");
}

// ─── New Invoice Modal ────────────────────────────────────────────────────────
function NewInvoiceModal({ onClose, bizSettings, onSaved }: {
  onClose: () => void;
  bizSettings: BusinessSettings;
  onSaved: (inv: CustomInvoice) => void;
}) {
  const [customer, setCustomer] = useState<InvoiceCustomer>({
    name: "", email: "", phone: "", gstin: "", address: "", city: "", state: "", pincode: "",
  });
  const [items, setItems] = useState<LineItem[]>([
    { id: genId(), productName: "", hsnCode: "", qty: 1, unitPrice: 0, gstPct: 18 },
  ]);
  const [invNumber, setInvNumber] = useState(() => nextInvNumber(bizSettings.prefix));
  const [invDate, setInvDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + bizSettings.dueDays); return d.toISOString().slice(0, 10);
  });
  const [paymentTerms, setPaymentTerms] = useState(`Net ${bizSettings.dueDays}`);
  const [notes, setNotes] = useState(bizSettings.defaultNotes);
  const [placeOfSupply, setPlaceOfSupply] = useState(bizSettings.state);
  const [reverseCharge, setReverseCharge] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const setCF = (k: keyof InvoiceCustomer, v: string) => setCustomer(p => ({ ...p, [k]: v }));
  const addItem = () => setItems(p => [...p, { id: genId(), productName: "", hsnCode: "", qty: 1, unitPrice: 0, gstPct: 18 }]);
  const removeItem = (id: string) => setItems(p => p.filter(i => i.id !== id));
  const updateItem = (id: string, k: keyof LineItem, v: unknown) => setItems(p => p.map(i => i.id === id ? { ...i, [k]: v } : i));

  const lineCalcs = useMemo(() => items.map(item => {
    const base = item.qty * item.unitPrice;
    const taxAmt = (base * item.gstPct) / 100;
    return { ...item, base, taxAmt, lineTotal: base + taxAmt };
  }), [items]);
  const subtotal = useMemo(() => lineCalcs.reduce((s, l) => s + l.base, 0), [lineCalcs]);
  const totalTax = useMemo(() => lineCalcs.reduce((s, l) => s + l.taxAmt, 0), [lineCalcs]);
  const grandTotal = subtotal + totalTax;
  const sameState = placeOfSupply.trim().toLowerCase() === bizSettings.state.trim().toLowerCase();

  const handlePrint = () => printInvoice({ sender: bizSettings, customer, items, invNumber, invDate, dueDate, paymentTerms, notes, placeOfSupply, reverseCharge });

  const handleSave = () => {
    if (!customer.name) { toast("Enter customer name", false); return; }
    setSaving(true);
    const inv: CustomInvoice = {
      id: genId(), invNumber, invDate, dueDate, customer, items,
      notes, paymentTerms, placeOfSupply, reverseCharge,
      status: "draft", createdAt: new Date().toISOString(), grandTotal,
    };
    const list = loadCustomInvoices();
    list.unshift(inv);
    saveCustomInvoices(list);
    onSaved(inv);
    setSaving(false);
    toast("Invoice saved as draft");
    onClose();
  };

  const handleEmail = async () => {
    if (!customer.email) { toast("Enter customer email", false); return; }
    setSendingEmail(true);
    await new Promise(r => setTimeout(r, 1200));
    setSendingEmail(false);
    toast("Email sent (stub)");
  };

  const inp = "flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl border border-border my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-gradient-to-r from-primary/5 to-transparent rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold">New Invoice</h2>
              <p className="text-[10px] text-muted-foreground font-mono">{invNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[80vh] overflow-y-auto">

          {/* Invoice meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Invoice #", el: <input className={inp} value={invNumber} onChange={e => setInvNumber(e.target.value)} /> },
              { label: "Invoice Date", el: <input type="date" className={inp} value={invDate} onChange={e => setInvDate(e.target.value)} /> },
              { label: "Due Date", el: <input type="date" className={inp} value={dueDate} onChange={e => setDueDate(e.target.value)} /> },
              { label: "Payment Terms", el: <input className={inp} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="Net 30" /> },
            ].map(({ label, el }) => (
              <div key={label} className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</label>
                {el}
              </div>
            ))}
          </div>

          {/* Customer */}
          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-bold flex items-center gap-1.5 text-foreground">
              <Building2 className="w-3.5 h-3.5 text-primary" /> Customer / Bill To
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Full Name *", k: "name", ph: "John Doe / Acme Corp" },
                { label: "GSTIN", k: "gstin", ph: "27XXXXX1234X1ZX", mono: true, upper: true, max: 15 },
                { label: "Email", k: "email", ph: "customer@example.com", type: "email" },
                { label: "Phone", k: "phone", ph: "+91 98765 43210" },
              ].map(({ label, k, ph, mono, upper, max, type }) => (
                <div key={k} className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</label>
                  <input
                    type={type || "text"}
                    className={`${inp}${mono ? " font-mono" : ""}`}
                    value={customer[k as keyof InvoiceCustomer]}
                    onChange={e => setCF(k as keyof InvoiceCustomer, upper ? e.target.value.toUpperCase() : e.target.value)}
                    placeholder={ph} maxLength={max}
                  />
                </div>
              ))}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Address</label>
                <input className={inp} value={customer.address} onChange={e => setCF("address", e.target.value)} placeholder="Street, Area, Locality" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">City</label>
                <input className={inp} value={customer.city} onChange={e => setCF("city", e.target.value)} placeholder="Mumbai" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">State</label>
                  <select className={`${inp} appearance-none`} value={customer.state} onChange={e => setCF("state", e.target.value)}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase">Pincode</label>
                  <input className={inp} value={customer.pincode} onChange={e => setCF("pincode", e.target.value)} placeholder="400001" maxLength={6} />
                </div>
              </div>
            </div>
          </div>

          {/* GST Config */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Place of Supply</label>
              <select className={`${inp} appearance-none`} value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <div className={`text-[11px] px-3 py-2 rounded-lg border flex-1 font-medium ${
                sameState ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
              }`}>
                {sameState ? "✓ Intra-state — CGST + SGST applies" : "⚠ Inter-state — IGST applies"}
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <input type="checkbox" id="rc" checked={reverseCharge} onChange={e => setReverseCharge(e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
              <label htmlFor="rc" className="text-[11px] text-muted-foreground cursor-pointer">Reverse Charge Applicable (RCM)</label>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <p className="text-xs font-bold flex items-center gap-1.5"><IndianRupee className="w-3.5 h-3.5 text-primary" /> Line Items</p>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase w-[28%]">Product / Description</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase w-[12%]">HSN/SAC</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase w-[8%]">Qty</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase w-[14%]">Rate (₹)</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase w-[11%]">GST%</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase w-[17%]">Amount (₹)</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {lineCalcs.map((item, idx) => {
                    const inpInline = "flex h-8 w-full rounded border-0 bg-transparent shadow-none text-xs focus-visible:outline-none focus-visible:ring-0 focus-visible:bg-muted/30 px-1";
                    return (
                      <tr key={item.id} className="hover:bg-muted/20">
                        <td className="px-2 py-1.5">
                          <input className={inpInline} value={item.productName} onChange={e => updateItem(item.id, "productName", e.target.value)} placeholder={`Item ${idx + 1}`} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input className={`${inpInline} font-mono`} value={item.hsnCode} onChange={e => updateItem(item.id, "hsnCode", e.target.value)} placeholder="9619" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min={1} className={`${inpInline} text-right`} value={item.qty} onChange={e => updateItem(item.id, "qty", parseInt(e.target.value) || 1)} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min={0} className={`${inpInline} text-right`} value={item.unitPrice || ""} onChange={e => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)} placeholder="0.00" />
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={item.gstPct} onChange={e => updateItem(item.id, "gstPct", parseInt(e.target.value) as LineItem["gstPct"])} className="h-8 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring">
                            {[0, 5, 12, 18, 28].map(g => <option key={g} value={g}>{g}%</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          ₹{fmtCurr(item.lineTotal)}
                          {item.gstPct > 0 && <span className="block text-[9px] text-muted-foreground">+₹{fmtCurr(item.taxAmt)} GST</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(item.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive/50 hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={addItem} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1">
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>

          {/* Tax summary */}
          <div className="ml-auto w-full max-w-xs rounded-xl border border-border bg-primary/3 p-4 space-y-1.5">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal (Taxable)</span><span className="font-medium">₹{fmtCurr(subtotal)}</span></div>
            {sameState ? (
              <>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">CGST</span><span className="font-medium">₹{fmtCurr(totalTax / 2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">SGST</span><span className="font-medium">₹{fmtCurr(totalTax / 2)}</span></div>
              </>
            ) : (
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">IGST</span><span className="font-medium">₹{fmtCurr(totalTax)}</span></div>
            )}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-2 mt-2">
              <span>Grand Total</span><span className="text-primary">₹{fmtCurr(grandTotal)}</span>
            </div>
            <p className="text-[9px] text-muted-foreground italic">{amountToWords(grandTotal)}</p>
          </div>

          {/* Notes + Sender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">Notes</label>
              <textarea className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">From</label>
              <div className="rounded-lg border border-primary/20 bg-primary/3 p-3 text-[10px] space-y-0.5">
                <p className="font-bold text-foreground text-xs">{bizSettings.name}</p>
                {bizSettings.gstin && <p className="font-mono text-primary">GSTIN: {bizSettings.gstin}</p>}
                {bizSettings.pan && <p className="text-muted-foreground">PAN: {bizSettings.pan}</p>}
                <p className="text-muted-foreground">{bizSettings.address}</p>
                <p className="text-muted-foreground">{bizSettings.city}, {bizSettings.state} — {bizSettings.pincode}</p>
                <p className="text-muted-foreground">{bizSettings.email}</p>
                <Link href="/super-admin/settings?tab=invoice" className="text-primary hover:underline inline-flex items-center gap-0.5 mt-1">
                  <Settings2 className="w-2.5 h-2.5" /> Edit in Settings
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 bg-muted/20 rounded-b-2xl">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          <div className="flex items-center gap-2 flex-wrap">
            {/* WhatsApp */}
            <button
              onClick={() => openWhatsApp(customer, invNumber, grandTotal, items, bizSettings)}
              disabled={!customer.phone}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-[#25d366]/40 text-[#128c3e] hover:bg-[#25d366]/10 transition-colors disabled:opacity-40 font-medium"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </button>
            {/* Email */}
            <button
              onClick={handleEmail}
              disabled={sendingEmail || !customer.email}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-40"
            >
              {sendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Send Email
            </button>
            {/* Save Draft */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors font-medium"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Draft
            </button>
            {/* PDF */}
            <button
              onClick={handlePrint}
              disabled={!customer.name || items.every(i => !i.productName)}
              className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 font-semibold"
            >
              <Printer className="w-3.5 h-3.5" /> Generate PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminInvoicesPage() {
  const [orders, setOrders]                   = useState<Order[]>([]);
  const [customInvoices, setCustomInvoices]   = useState<CustomInvoice[]>([]);
  const [bizSettings, setBizSettings]         = useState<BusinessSettings>(DEFAULT_BIZ);
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [search, setSearch]                   = useState("");
  const [channelFilter, setChannelFilter]     = useState("all");
  const [typeFilter, setTypeFilter]           = useState<"all"|"order"|"custom">("all");
  const [dateFrom, setDateFrom]               = useState("");
  const [dateTo, setDateTo]                   = useState("");

  const fetchAll = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    const [settingsRaw, ordersRaw] = await Promise.all([
      safeGet<Record<string, any>>("/admin/settings", {}),
      safeGet<{ items?: unknown[]; data?: unknown[] }>("/orders/admin/all?pageSize=100", { items: [] }),
    ]);
    setBizSettings(parseSettings(settingsRaw));
    const raw = (ordersRaw.items ?? (ordersRaw as any).data ?? []) as Record<string, unknown>[];
    setOrders(raw.map(normalizeOrder));
    setCustomInvoices(loadCustomInvoices());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const orderRows = typeFilter !== "custom" ? orders.filter(o => {
      if (q && !(o.orderNumber + o.customerName + o.companyName + o.invoiceNumber).toLowerCase().includes(q)) return false;
      if (channelFilter !== "all" && o.channel !== channelFilter) return false;
      const d = o.placedAt ? new Date(o.placedAt) : null;
      if (dateFrom && d && d < new Date(dateFrom)) return false;
      if (dateTo && d && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    }) : [];
    const customRows = typeFilter !== "order" ? customInvoices.filter(c => {
      if (q && !(c.invNumber + c.customer.name + c.customer.email).toLowerCase().includes(q)) return false;
      if (dateFrom && c.invDate < dateFrom) return false;
      if (dateTo && c.invDate > dateTo) return false;
      return true;
    }) : [];
    return { orderRows, customRows };
  }, [orders, customInvoices, search, channelFilter, typeFilter, dateFrom, dateTo]);

  const deleteCustom = (id: string) => {
    const list = loadCustomInvoices().filter(c => c.id !== id);
    saveCustomInvoices(list);
    setCustomInvoices(list);
    toast("Invoice deleted");
  };

  const totalOrderVal = orders.reduce((s, o) => s + (parseFloat(o.grandTotal) || 0), 0);
  const totalCustomVal = customInvoices.reduce((s, c) => s + c.grandTotal, 0);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-xs text-muted-foreground">Loading invoices…</p>
    </div>
  );

  return (
    <>
      <ToastBanner />
      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          bizSettings={bizSettings}
          onSaved={inv => { setCustomInvoices(p => [inv, ...p]); }}
        />
      )}

      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/super-admin" className="inline-flex items-center gap-1 hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold tracking-tight">Invoice Management</h1>
              <p className="text-xs text-muted-foreground">{orders.length} orders · {customInvoices.length} custom invoices</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/super-admin/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" /> Invoice Settings
            </Link>
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Invoice
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Website Orders", val: orders.length, sub: `₹${fmtCurr(totalOrderVal)}`, icon: Receipt, color: "text-blue-500" },
            { label: "Custom Invoices", val: customInvoices.length, sub: `₹${fmtCurr(totalCustomVal)}`, icon: FileText, color: "text-violet-500" },
            { label: "Paid Orders", val: orders.filter(o => inferPayStatus(o) === "paid").length, sub: "delivered/shipped", icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Pending", val: orders.filter(o => inferPayStatus(o) === "unpaid").length, sub: "awaiting payment", icon: Clock, color: "text-amber-500" },
          ].map(({ label, val, sub, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border/40 rounded-xl p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 shrink-0 ${color}`} />
              <div>
                <p className="text-lg font-bold leading-none">{val}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                <p className="text-[9px] text-muted-foreground/60">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card border border-border/40 rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-xs" />
              {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-muted-foreground" /></button>}
            </div>
            <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <Filter className="w-3 h-3 mr-1 text-muted-foreground" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="order">Website Orders</SelectItem>
                <SelectItem value="custom">Custom Invoices</SelectItem>
              </SelectContent>
            </Select>
            {typeFilter !== "custom" && (
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  <SelectItem value="b2c">B2C</SelectItem>
                  <SelectItem value="b2b">B2B</SelectItem>
                </SelectContent>
              </Select>
            )}
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring" />
            <span className="text-[10px] text-muted-foreground">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring" />
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }}><X className="w-3 h-3 text-muted-foreground" /></button>}
          </div>

          {/* Combined table */}
          {(filtered.orderRows.length === 0 && filtered.customRows.length === 0) ? (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm font-medium">No invoices found</p>
              <p className="text-xs text-muted-foreground mt-0.5">Try adjusting filters or create a new invoice</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {/* Website orders */}
                  {filtered.orderRows.map(o => {
                    const invNum = o.invoiceNumber || `INV-${o.orderNumber}`;
                    const payStatus = inferPayStatus(o);
                    return (
                      <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium">{invNum}</span>
                          <span className="block text-[9px] text-muted-foreground font-mono">#{o.orderNumber}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium truncate max-w-[160px]">{o.companyName || o.customerName || "—"}</p>
                          {o.companyName && o.customerName && <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{o.customerName}</p>}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(o.placedAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${(o.channel ?? "b2c") === "b2b" ? "bg-violet-50 border-violet-200 text-violet-700" : "bg-sky-50 border-sky-200 text-sky-700"}`}>
                            {(o.channel ?? "B2C").toUpperCase()} Order
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-sm">₹{fmtCurr(o.grandTotal)}</td>
                        <td className="px-4 py-3"><PayBadge status={payStatus} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={async () => {
                                try {
                                  const r = await fetch(`${getApiBase()}/api/orders/${o.id}/invoice.pdf`, { headers: authHeaders() });
                                  if (!r.ok) { toast("PDF generation failed — check order details", false); return; }
                                  const blob = await r.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url; a.download = `${invNum}.pdf`; a.click();
                                  URL.revokeObjectURL(url);
                                } catch { toast("Download failed", false); }
                              }}
                              className="h-7 px-2.5 rounded border border-border text-[10px] font-medium hover:bg-muted transition-colors inline-flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" /> PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Custom invoices */}
                  {filtered.customRows.map(c => (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium">{c.invNumber}</span>
                        <span className="block text-[9px] text-primary/60">Custom</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium truncate max-w-[160px]">{c.customer.name || "—"}</p>
                        {c.customer.email && <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{c.customer.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(c.invDate)}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-purple-50 border-purple-200 text-purple-700">Custom</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-sm">₹{fmtCurr(c.grandTotal)}</td>
                      <td className="px-4 py-3"><PayBadge status={c.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openWhatsApp(c.customer, c.invNumber, c.grandTotal, c.items, bizSettings)}
                            className="h-7 w-7 rounded border border-[#25d366]/30 text-[#128c3e] hover:bg-[#25d366]/10 transition-colors inline-flex items-center justify-center"
                            title="Send WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => printInvoice({ sender: bizSettings, customer: c.customer, items: c.items, invNumber: c.invNumber, invDate: c.invDate, dueDate: c.dueDate, paymentTerms: c.paymentTerms, notes: c.notes, placeOfSupply: c.placeOfSupply, reverseCharge: c.reverseCharge })}
                            className="h-7 px-2.5 rounded border border-border text-[10px] font-medium hover:bg-muted transition-colors inline-flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" /> PDF
                          </button>
                          <button
                            onClick={() => deleteCustom(c.id)}
                            className="h-7 w-7 rounded border border-destructive/20 text-destructive/50 hover:text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick tip */}
        <div className="rounded-xl border border-primary/20 bg-primary/3 p-4 flex items-start gap-3">
          <Receipt className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold">Custom Invoices are saved locally</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Click <strong>New Invoice</strong> to generate a GST-compliant tax invoice for walk-in or external customers.
              Go to <Link href="/super-admin/settings" className="text-primary hover:underline">Settings → Invoice & GST</Link> to prefill your business details, bank info, and default terms.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

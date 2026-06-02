"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Printer, Loader2, ArrowLeft } from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  seller: { brandName: string; legalName: string; gstin: string; city: string; state: string; pincode: string; phone: string };
  buyer: { name: string; line1: string; line2: string; city: string; state: string; pincode: string; phone: string };
  item: { title: string; hsn: string; qty: number; unitPrice: number; taxable: number; cgst: number; sgst: number; igst: number; totalGst: number; total: number };
  totals: { taxable: number; cgst: number; sgst: number; igst: number; totalGst: number; total: number };
  supplyType: string;
}

function inWords(n: number): string {
  const ones = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function c(x: number): string {
    if (!x) return "";
    if (x < 20) return (ones[x] ?? "") + " ";
    if (x < 100) return (tens[Math.floor(x/10)] ?? "") + " " + (x%10 ? (ones[x%10] ?? "") + " " : "");
    if (x < 1000) return (ones[Math.floor(x/100)] ?? "") + " Hundred " + c(x%100);
    if (x < 100000) return c(Math.floor(x/1000)) + "Thousand " + c(x%1000);
    if (x < 10000000) return c(Math.floor(x/100000)) + "Lakh " + c(x%100000);
    return c(Math.floor(x/10000000)) + "Crore " + c(x%10000000);
  }
  const r = Math.floor(n), p = Math.round((n-r)*100);
  return (c(r).trim() || "Zero") + " Rupees" + (p ? " and " + c(p).trim() + " Paise" : "") + " Only";
}

function r2(n: number) { return n.toFixed(2); }

export default function TaxInvoicePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [err,  setErr]  = useState("");

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    sellerApi.get<InvoiceData>(`/seller/orders/${id}/invoice`)
      .then(setData)
      .catch(() => setErr("Invoice not available — order may not be delivered yet."));
  }, [id, router]);

  if (err) return <div className="p-8 text-center text-sm text-destructive">{err}<br /><button onClick={() => router.back()} className="mt-3 text-primary underline text-xs">Go back</button></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const { item, totals } = data;
  const inter = data.supplyType === "Interstate";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 10mm; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b px-4 py-2.5 flex items-center gap-3 shadow-sm">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground p-1">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="flex-1 text-sm font-semibold text-muted-foreground">{data.invoiceNumber}</span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90"
        >
          <Printer className="w-3.5 h-3.5" /> Print / Save PDF
        </button>
      </div>

      <div className="max-w-[820px] mx-auto bg-white p-8 my-6 shadow-sm print:shadow-none print:my-0">

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-primary pb-4 mb-5">
          <div>
            <p className="text-2xl font-black tracking-tight text-primary">gifteeng</p>
            <p className="text-xs text-muted-foreground">gifteeng.com</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black uppercase tracking-widest">Tax Invoice</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Original for Recipient</p>
          </div>
        </div>

        {/* Invoice meta */}
        <div className="grid grid-cols-2 gap-4 mb-5 text-xs">
          <table>
            <tbody>
              {[
                ["Invoice No.", data.invoiceNumber],
                ["Invoice Date", data.invoiceDate],
                ["Order No.", data.orderNumber],
                ["Supply Type", data.supplyType],
              ].map(([l, v]) => (
                <tr key={l}>
                  <td className="text-muted-foreground pr-3 py-0.5 whitespace-nowrap">{l}</td>
                  <td className="font-semibold">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Seller & Buyer */}
        <div className="grid grid-cols-2 gap-5 border rounded-lg p-4 mb-5 text-xs">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Sold By</p>
            <p className="font-bold text-sm">{data.seller.legalName}</p>
            {data.seller.brandName !== data.seller.legalName && <p className="text-muted-foreground">({data.seller.brandName})</p>}
            <p className="text-muted-foreground mt-0.5">{[data.seller.city, data.seller.state, data.seller.pincode].filter(Boolean).join(", ")}</p>
            <p className="mt-1"><span className="text-muted-foreground">GSTIN: </span><span className="font-mono font-semibold">{data.seller.gstin}</span></p>
            {data.seller.phone && <p className="text-muted-foreground">Ph: {data.seller.phone}</p>}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Bill To / Ship To</p>
            <p className="font-bold text-sm">{data.buyer.name}</p>
            {data.buyer.line1 && <p className="text-muted-foreground">{data.buyer.line1}</p>}
            {data.buyer.line2 && <p className="text-muted-foreground">{data.buyer.line2}</p>}
            <p className="text-muted-foreground">{[data.buyer.city, data.buyer.state, data.buyer.pincode].filter(Boolean).join(", ")}</p>
            {data.buyer.phone && <p className="text-muted-foreground mt-0.5">Ph: {data.buyer.phone}</p>}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-xs border-collapse mb-1">
          <thead>
            <tr className="bg-muted/50">
              <th className="border border-border/60 px-2 py-2 text-left font-black">Description of Goods</th>
              <th className="border border-border/60 px-2 py-2 text-center font-black">HSN</th>
              <th className="border border-border/60 px-2 py-2 text-center font-black">Qty</th>
              <th className="border border-border/60 px-2 py-2 text-right font-black">Unit Price (₹)</th>
              <th className="border border-border/60 px-2 py-2 text-right font-black">Taxable (₹)</th>
              {inter ? (
                <th className="border border-border/60 px-2 py-2 text-center font-black">IGST 12% (₹)</th>
              ) : (
                <>
                  <th className="border border-border/60 px-2 py-2 text-center font-black">CGST 6% (₹)</th>
                  <th className="border border-border/60 px-2 py-2 text-center font-black">SGST 6% (₹)</th>
                </>
              )}
              <th className="border border-border/60 px-2 py-2 text-right font-black">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border/60 px-2 py-2">{item.title}</td>
              <td className="border border-border/60 px-2 py-2 text-center font-mono">{item.hsn}</td>
              <td className="border border-border/60 px-2 py-2 text-center">{item.qty}</td>
              <td className="border border-border/60 px-2 py-2 text-right">{r2(item.unitPrice)}</td>
              <td className="border border-border/60 px-2 py-2 text-right">{r2(item.taxable)}</td>
              {inter ? (
                <td className="border border-border/60 px-2 py-2 text-center">{r2(item.igst)}</td>
              ) : (
                <>
                  <td className="border border-border/60 px-2 py-2 text-center">{r2(item.cgst)}</td>
                  <td className="border border-border/60 px-2 py-2 text-center">{r2(item.sgst)}</td>
                </>
              )}
              <td className="border border-border/60 px-2 py-2 text-right font-bold">{r2(item.total)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-4">
          <table className="text-xs w-60">
            <tbody>
              <tr><td className="py-0.5 text-muted-foreground">Taxable Amount</td><td className="text-right font-semibold">₹{r2(totals.taxable)}</td></tr>
              {inter ? (
                <tr><td className="py-0.5 text-muted-foreground">IGST @ 12%</td><td className="text-right">₹{r2(totals.igst)}</td></tr>
              ) : (
                <>
                  <tr><td className="py-0.5 text-muted-foreground">CGST @ 6%</td><td className="text-right">₹{r2(totals.cgst)}</td></tr>
                  <tr><td className="py-0.5 text-muted-foreground">SGST @ 6%</td><td className="text-right">₹{r2(totals.sgst)}</td></tr>
                </>
              )}
              <tr className="border-t border-border">
                <td className="pt-1.5 font-black">Grand Total</td>
                <td className="pt-1.5 text-right font-black text-base">₹{r2(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount in words */}
        <div className="border border-border/50 rounded px-3 py-2 text-xs mb-6">
          <span className="text-muted-foreground">Amount in words: </span>
          <span className="font-semibold">{inWords(totals.total)}</span>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground border-t pt-4">
          <div>
            <p className="font-semibold text-foreground mb-1">Terms & Conditions</p>
            <p>1. Goods once sold will not be taken back or exchanged.</p>
            <p>2. Subject to jurisdiction of courts as per seller location.</p>
            <p>3. This is a computer-generated invoice.</p>
            <p className="mt-1 text-[10px]">HSN 4911 — GST 12% (inclusive). Verify rates with your CA.</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">For {data.seller.legalName}</p>
            <div className="h-10" />
            <p className="font-bold text-foreground border-t border-border/40 pt-1">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </>
  );
}

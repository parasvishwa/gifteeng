"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Printer, Loader2, ArrowLeft } from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

interface CommInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  platform: { legalName: string; gstin: string; address: string; city: string; state: string; pincode: string };
  seller: { legalName: string; gstin: string; city: string; state: string; pincode: string };
  service: { description: string; hsn: string; taxable: number; cgst: number; sgst: number; igst: number; totalGst: number; total: number };
  payout: { grossAmount: number; commissionRate: number; commissionAmount: number; netAmount: number; status: string; paidAt: string | null };
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

export default function CommissionInvoicePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CommInvoice | null>(null);
  const [err,  setErr]  = useState("");

  useEffect(() => {
    if (!getSellerToken()) { router.replace("/seller/login"); return; }
    sellerApi.get<CommInvoice>(`/seller/payouts/${id}/invoice`)
      .then(setData)
      .catch(() => setErr("Invoice not found."));
  }, [id, router]);

  if (err) return <div className="p-8 text-center text-sm text-destructive">{err}<br /><button onClick={() => router.back()} className="mt-3 text-primary underline text-xs">Go back</button></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const { service } = data;
  const inter = data.supplyType === "Interstate";
  const commPct = (data.payout.commissionRate * 100).toFixed(0);

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
            <p className="text-[11px] text-muted-foreground mt-0.5">Supplier Tax Invoice — Platform Commission</p>
          </div>
        </div>

        {/* Invoice meta */}
        <div className="mb-5 text-xs">
          <table>
            <tbody>
              {[
                ["Invoice No.", data.invoiceNumber],
                ["Invoice Date", data.invoiceDate],
                ["Supply Type", data.supplyType],
                ["Payout Status", data.payout.status.charAt(0).toUpperCase() + data.payout.status.slice(1)],
              ].map(([l, v]) => (
                <tr key={l}>
                  <td className="text-muted-foreground pr-3 py-0.5">{l}</td>
                  <td className="font-semibold">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Platform & Seller */}
        <div className="grid grid-cols-2 gap-5 border rounded-lg p-4 mb-5 text-xs">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Issued By (Service Provider)</p>
            <p className="font-bold text-sm">{data.platform.legalName}</p>
            {data.platform.address && <p className="text-muted-foreground">{data.platform.address}</p>}
            <p className="text-muted-foreground">{[data.platform.city, data.platform.state, data.platform.pincode].filter(Boolean).join(", ")}</p>
            <p className="mt-1"><span className="text-muted-foreground">GSTIN: </span><span className="font-mono font-semibold">{data.platform.gstin}</span></p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Issued To (Recipient)</p>
            <p className="font-bold text-sm">{data.seller.legalName}</p>
            <p className="text-muted-foreground">{[data.seller.city, data.seller.state, data.seller.pincode].filter(Boolean).join(", ")}</p>
            <p className="mt-1"><span className="text-muted-foreground">GSTIN: </span><span className="font-mono font-semibold">{data.seller.gstin}</span></p>
          </div>
        </div>

        {/* Services table */}
        <table className="w-full text-xs border-collapse mb-1">
          <thead>
            <tr className="bg-muted/50">
              <th className="border border-border/60 px-2 py-2 text-left font-black">Description of Service</th>
              <th className="border border-border/60 px-2 py-2 text-center font-black">SAC</th>
              <th className="border border-border/60 px-2 py-2 text-right font-black">Taxable (₹)</th>
              {inter ? (
                <th className="border border-border/60 px-2 py-2 text-center font-black">IGST 18% (₹)</th>
              ) : (
                <>
                  <th className="border border-border/60 px-2 py-2 text-center font-black">CGST 9% (₹)</th>
                  <th className="border border-border/60 px-2 py-2 text-center font-black">SGST 9% (₹)</th>
                </>
              )}
              <th className="border border-border/60 px-2 py-2 text-right font-black">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-border/60 px-2 py-2">{service.description}</td>
              <td className="border border-border/60 px-2 py-2 text-center font-mono">{service.hsn}</td>
              <td className="border border-border/60 px-2 py-2 text-right">{r2(service.taxable)}</td>
              {inter ? (
                <td className="border border-border/60 px-2 py-2 text-center">{r2(service.igst)}</td>
              ) : (
                <>
                  <td className="border border-border/60 px-2 py-2 text-center">{r2(service.cgst)}</td>
                  <td className="border border-border/60 px-2 py-2 text-center">{r2(service.sgst)}</td>
                </>
              )}
              <td className="border border-border/60 px-2 py-2 text-right font-bold">{r2(service.total)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-4">
          <table className="text-xs w-64">
            <tbody>
              <tr><td className="py-0.5 text-muted-foreground">Taxable (Commission)</td><td className="text-right font-semibold">₹{r2(service.taxable)}</td></tr>
              {inter ? (
                <tr><td className="py-0.5 text-muted-foreground">IGST @ 18%</td><td className="text-right">₹{r2(service.igst)}</td></tr>
              ) : (
                <>
                  <tr><td className="py-0.5 text-muted-foreground">CGST @ 9%</td><td className="text-right">₹{r2(service.cgst)}</td></tr>
                  <tr><td className="py-0.5 text-muted-foreground">SGST @ 9%</td><td className="text-right">₹{r2(service.sgst)}</td></tr>
                </>
              )}
              <tr className="border-t border-border">
                <td className="pt-1.5 font-black">Invoice Total</td>
                <td className="pt-1.5 text-right font-black text-base">₹{r2(service.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Amount in words */}
        <div className="border border-border/50 rounded px-3 py-2 text-xs mb-5">
          <span className="text-muted-foreground">Amount in words: </span>
          <span className="font-semibold">{inWords(service.total)}</span>
        </div>

        {/* Payout reference */}
        <div className="rounded-lg bg-muted/30 border border-border/40 p-3 text-xs mb-5">
          <p className="font-black uppercase tracking-wider text-muted-foreground text-[10px] mb-2">Payout Reference</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["Gross Sales", `₹${r2(data.payout.grossAmount)}`],
              [`Commission (${commPct}%)`, `−₹${r2(data.payout.commissionAmount)}`],
              ["GST on Commission", `₹${r2(service.totalGst)}`],
              ["Net Transferred", `₹${r2(data.payout.netAmount)}`],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-muted-foreground text-[10px]">{l}</p>
                <p className="font-bold">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Note: GST on platform commission is payable by you to the government. The net payout above is after deducting commission only (GST on commission is your input tax credit if GST-registered).
          </p>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground border-t pt-4">
          <div>
            <p className="font-semibold text-foreground mb-1">Terms</p>
            <p>SAC 998314 — IT & platform support services @ 18% GST.</p>
            <p>This is a computer-generated tax invoice.</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">For {data.platform.legalName}</p>
            <div className="h-10" />
            <p className="font-bold text-foreground border-t border-border/40 pt-1">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { sellerApi, getSellerToken } from "@/lib/seller-api";

interface Assignment {
  id: string;
  status: string;
  courier: string | null;
  awb: string | null;
  dispatchedAt: string | null;
  acceptedAt: string | null;
  orderItem: {
    qty: number;
    unitPrice: string;
    customizations?: Record<string, unknown> | null;
    product: { title: string; sku?: string; images: { url: string }[] };
    order: {
      orderNumber: string;
      grandTotal: string;
      placedAt: string;
      shippingAddress: {
        name?: string;
        phone?: string;
        addressLine1?: string;
        addressLine2?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
      };
    };
  };
  sellerProduct: { price: string } | null;
}

function inr(v: string | number) {
  return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function PackingSlip({ a, idx, total }: { a: Assignment; idx: number; total: number }) {
  const addr    = a.orderItem.order.shippingAddress;
  const product = a.orderItem.product;
  const order   = a.orderItem.order;
  const price   = Number(a.sellerProduct?.price ?? a.orderItem.unitPrice);
  const img     = product.images?.[0]?.url;

  return (
    <div className={`bg-white p-6 ${idx < total - 1 ? "border-b-4 border-dashed border-gray-300 mb-0 print:break-after-page" : ""}`} style={{ minHeight: "100mm" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Packing Slip</p>
          <p className="text-2xl font-black mt-0.5">{order.orderNumber}</p>
          <p className="text-xs text-gray-500 mt-0.5">Placed: {fmt(order.placedAt)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Slip {idx + 1} of {total}</p>
          <p className="text-xs text-gray-400 mt-0.5">Printed: {new Date().toLocaleDateString("en-IN")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-4">
        {/* Ship to */}
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Ship to</p>
          <p className="font-bold text-sm">{addr.name ?? "—"}</p>
          {addr.phone && <p className="text-xs text-gray-600">{addr.phone}</p>}
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            {[addr.addressLine1, addr.addressLine2].filter(Boolean).join(", ")}
            {addr.city || addr.state ? <><br />{[addr.city, addr.state].filter(Boolean).join(", ")}</> : null}
            {addr.pincode ? <><br />{addr.pincode}</> : null}
            {addr.country && addr.country !== "India" ? <><br />{addr.country}</> : null}
          </p>
        </div>

        {/* Courier details */}
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Dispatch</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="font-semibold capitalize">{a.status}</span>
            </div>
            {a.courier && (
              <div className="flex justify-between">
                <span className="text-gray-500">Courier</span>
                <span className="font-semibold">{a.courier}</span>
              </div>
            )}
            {a.awb && (
              <div className="flex justify-between">
                <span className="text-gray-500">AWB / Tracking</span>
                <span className="font-semibold font-mono text-[10px]">{a.awb}</span>
              </div>
            )}
            {a.dispatchedAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Dispatched</span>
                <span className="font-semibold">{fmt(a.dispatchedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product line */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Product</th>
              <th className="text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Qty</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Unit price</th>
              <th className="text-right px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2.5 flex items-center gap-2.5">
                {img && <img src={img} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 border border-gray-200" />}
                <div>
                  <p className="font-medium text-sm">{product.title}</p>
                  {product.sku && <p className="text-[10px] text-gray-500">SKU: {product.sku}</p>}
                </div>
              </td>
              <td className="px-3 py-2.5 text-center font-bold">{a.orderItem.qty}</td>
              <td className="px-3 py-2.5 text-right">₹{inr(price)}</td>
              <td className="px-3 py-2.5 text-right font-bold">₹{inr(price * a.orderItem.qty)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Customisation details */}
      {a.orderItem.customizations && Object.keys(a.orderItem.customizations).length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-2">Customisation instructions</p>
          <div className="space-y-1">
            {Object.entries(a.orderItem.customizations).map(([k, v]) => (
              <div key={k} className="text-xs flex gap-2">
                <span className="text-amber-600 font-medium min-w-0 shrink-0">{k}:</span>
                <span className="text-gray-700">{typeof v === "string" ? v : JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
        <p className="text-[10px] text-gray-400">This is a packing slip, not a tax invoice.</p>
        <p className="text-xs font-bold">Order total: ₹{inr(order.grandTotal)}</p>
      </div>
    </div>
  );
}

export default function PackingSlipPage() {
  const searchParams = useSearchParams();
  const idsParam     = searchParams.get("ids") ?? "";
  const ids          = idsParam.split(",").filter(Boolean);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  useEffect(() => {
    if (!getSellerToken()) { window.location.href = "/seller/login"; return; }
    if (ids.length === 0) { setError("No order IDs provided"); setLoading(false); return; }
    Promise.all(ids.map(id => sellerApi.get<Assignment>(`/seller/orders/${id}`)))
      .then(results => { setAssignments(results.filter(Boolean) as Assignment[]); })
      .catch(() => setError("Could not load orders"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || assignments.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">{error || "No orders found"}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Print button — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{assignments.length} packing slip{assignments.length > 1 ? "s" : ""}</p>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="max-w-2xl mx-auto py-4 print:max-w-none print:p-0">
        {assignments.map((a, i) => (
          <PackingSlip key={a.id} a={a} idx={i} total={assignments.length} />
        ))}
      </div>

      <style>{`
        @media print {
          body { margin: 0; }
          .print\\:hidden { display: none !important; }
          .print\\:break-after-page { break-after: page; }
          .print\\:max-w-none { max-width: none !important; }
          .print\\:p-0 { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}

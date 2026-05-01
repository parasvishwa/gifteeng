"use client";

import { useState } from "react";
import { RotateCcw, Search, Loader2, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const POLICY_POINTS = [
  "Returns accepted within 30 days of delivery",
  { text: "Product must be in ", bold: "original packaging" },
  { text: "Personalized items can be returned if ", bold: "defective" },
  "Refund processed within 5-7 business days",
  "Free pickup from your address",
];

export default function ReturnsPage() {
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFind = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim() || !phone.trim()) {
      setError("Please enter both Order ID and Phone Number.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch(
        `${API_BASE}/api/orders/track?number=${encodeURIComponent(orderId.trim())}&phone=${encodeURIComponent(phone.trim())}`
      );

      if (!res.ok) {
        setError("Order not found. Please check your Order ID and Phone Number.");
        setLoading(false);
        return;
      }

      const data = await res.json() as { id?: string };
      if (data?.id) {
        router.push(`/orders/${data.id}/return`);
      } else {
        setError("Order not found. Please check your Order ID and Phone Number.");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[90vh] flex items-start justify-center pt-24 pb-32 px-4">
      <div className="w-full max-w-md space-y-8">

        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <RotateCcw className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight text-foreground">
            Return Order
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Easy returns within 30 days of delivery
          </p>
        </div>

        {/* Lookup form */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-7">
          <form onSubmit={handleFind} className="space-y-4">

            <div className="space-y-1.5">
              <label htmlFor="orderId" className="block text-sm font-medium text-foreground">
                Order ID
              </label>
              <input
                id="orderId"
                type="text"
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                placeholder="e.g. GFT12345"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Enter phone number"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium bg-destructive/8 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white bg-[#EF3752] shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Find Order
            </button>
          </form>
        </div>

        {/* Return Policy */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-7">
          <h2 className="font-display font-bold text-base text-foreground mb-6">Return Policy</h2>
          <ul className="space-y-4">
            {POLICY_POINTS.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span className="text-sm text-muted-foreground">
                  {typeof item === "string" ? (
                    item
                  ) : (
                    <>
                      {item.text}
                      <span className="text-primary font-medium">{item.bold}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Help */}
        <p className="text-center text-xs text-muted-foreground">
          Need help?{" "}
          <a href="/contact" className="text-primary font-medium hover:underline">Contact us</a>
          {" "}or WhatsApp{" "}
          <a href="https://wa.me/918070011777" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
            +91 80700 11777
          </a>
        </p>

      </div>
    </div>
  );
}

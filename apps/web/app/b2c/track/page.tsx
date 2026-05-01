"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Package } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function TrackOrderSearchPage() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim() || !phone.trim()) {
      setError("Please enter both Order Number and Phone Number.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // Look up order by number + phone
      const res = await fetch(
        `${API_BASE}/api/orders/track?number=${encodeURIComponent(orderNumber.trim())}&phone=${encodeURIComponent(phone.trim())}`
      );

      if (!res.ok) {
        setError("Order not found. Please check your Order Number and Phone Number.");
        setLoading(false);
        return;
      }

      const data = await res.json() as { id?: string };
      if (data?.id) {
        router.push(`/b2c/track/${data.id}`);
      } else {
        setError("Order not found. Please check your Order Number and Phone Number.");
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-[100px] md:pt-[116px] pb-32 px-4">
      <div className="w-full max-w-md">

        {/* Icon + heading */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight text-foreground">
            Track Your Order
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Enter your order number and phone number to see the latest status.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-7 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Order Number */}
            <div className="space-y-1.5">
              <label htmlFor="orderNumber" className="block text-sm font-medium text-foreground">
                Order Number
              </label>
              <input
                id="orderNumber"
                type="text"
                value={orderNumber}
                onChange={e => setOrderNumber(e.target.value)}
                placeholder="e.g. GFT12345"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-colors"
              />
            </div>

            {/* Phone Number */}
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

            {/* Error */}
            {error && (
              <p className="text-xs text-destructive font-medium bg-destructive/8 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            {/* Submit */}
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
              Track Order
            </button>
          </form>

          {/* Help text */}
          <p className="text-center text-xs text-muted-foreground pt-1">
            Your order number was emailed to you when you placed the order.
          </p>
        </div>

        {/* Contact link */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Need help?{" "}
          <a href="/contact" className="text-primary font-medium hover:underline">
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle } from "lucide-react";

const returnReasons = [
  "Received damaged product",
  "Wrong item received",
  "Quality not as expected",
  "Design/print issue",
  "Size/color mismatch",
  "Changed my mind",
];

export function ReturnOrderForm({ orderId }: { orderId: string }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError("Please select a reason.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
      const res = await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details }),
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Request failed (${res.status})`);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-card rounded-2xl p-8 border border-border shadow-sm text-center">
        <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
        <h2 className="font-display font-bold text-xl mb-2">Return Request Submitted!</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
          We&apos;ll review your request and send pickup details to your registered phone number within 24 hours.
        </p>
        <div className="bg-muted rounded-xl p-4 text-left mb-4 border border-border">
          <p className="text-xs">
            <strong>Order:</strong> #{orderId}
          </p>
          <p className="text-xs mt-1">
            <strong>Reason:</strong> {reason}
          </p>
          <p className="text-xs mt-1">
            <strong>Status:</strong> Under Review
          </p>
        </div>
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground text-left">
            Refund will be processed within 5-7 business days after pickup.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-6 border border-border shadow-sm space-y-5">
      <div>
        <label className="text-sm font-body font-medium block mb-2">Reason for return</label>
        <div className="space-y-2">
          {returnReasons.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                reason === r
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-body font-medium block mb-1.5">Additional details (optional)</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          placeholder="Describe the issue..."
          className="w-full px-4 py-3 rounded-xl border border-border bg-background font-body text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 resize-none"
        />
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 rounded-xl bg-[#EF3752] text-white font-bold text-sm shadow-sm hover:-translate-y-0.5 transition-all disabled:opacity-60"
      >
        {submitting ? "Submitting..." : "Submit Return Request"}
      </button>
    </form>
  );
}

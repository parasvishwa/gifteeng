"use client";

import { useState } from "react";
import { apiB2b } from "@/lib/api";

const STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof STATUSES)[number] | string;

export default function OrderStatusSelect({
  orderId,
  value,
  onChange,
}: {
  orderId: string;
  value: OrderStatus;
  onChange?: (next: OrderStatus) => void;
}) {
  const [current, setCurrent] = useState<OrderStatus>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = current;
    setCurrent(next);
    setSaving(true);
    setError(null);
    try {
      await apiB2b().patch(`/api/orders/${orderId}/status`, { status: next });
      onChange?.(next);
    } catch {
      setCurrent(prev);
      setError("Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="rounded-md border bg-background px-2 py-1 text-sm"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        {!STATUSES.includes(current as (typeof STATUSES)[number]) && (
          <option value={current}>{current}</option>
        )}
      </select>
      {saving && <span className="text-xs text-muted-foreground">Saving...</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

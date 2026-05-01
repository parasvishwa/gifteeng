"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

interface CartItem {
  id: string;
  productId?: string;
  name?: string;
  imageUrl?: string;
  price?: number;
  quantity: number;
}

interface CartResponse {
  items?: CartItem[];
  subtotal?: number;
}

// Shape returned by the new /api/campaigns/my-allocations endpoint
interface CampaignAllocation {
  id: string;
  campaignId: string;
  campaignTitle: string;
  allocatedAmount: number;
  usedAmount: number;
  remainingAmount: number;
}

// Shape returned by /api/wallet/my-balance
interface WalletBalance {
  balance: number;
  lockedBalance: number;
  currency: string;
}

function fmt(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Coloured progress bar for campaign budget usage */
function BudgetBar({
  used,
  allocated,
}: {
  used: number;
  allocated: number;
}) {
  const pct = allocated > 0 ? Math.min(100, (used / allocated) * 100) : 0;
  const remaining = allocated - used;
  const remainingPct = 100 - pct;

  let barColor = "bg-primary";
  let textColor = "text-primary";
  if (remainingPct < 10) {
    barColor = "bg-red-500";
    textColor = "text-red-600";
  } else if (remainingPct < 25) {
    barColor = "bg-amber-500";
    textColor = "text-amber-600";
  }

  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs mb-1">
        <span className={textColor + " font-medium"}>
          {fmt(remaining)} remaining
        </span>
        <span className="text-muted-foreground">of {fmt(allocated)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-muted-foreground">
        {Math.round(pct)}% used
      </div>
    </div>
  );
}

/** Sidebar banner showing the best campaign allocation or wallet fallback */
function AllocationBanner({
  allocation,
  walletBalance,
  loading,
  cartTotal,
}: {
  allocation: CampaignAllocation | null;
  walletBalance: WalletBalance | null;
  loading: boolean;
  cartTotal: number;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground animate-pulse">
        Loading budget...
      </div>
    );
  }

  if (allocation) {
    const { campaignTitle, allocatedAmount, usedAmount, remainingAmount } =
      allocation;
    const overBudget = cartTotal > remainingAmount;

    return (
      <div className="rounded-lg border bg-card p-3 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <span>🎁</span>
          <span>Campaign Budget</span>
        </div>
        <p className="text-sm font-medium truncate">{campaignTitle}</p>
        <BudgetBar used={usedAmount} allocated={allocatedAmount} />
        {overBudget && (
          <p className="mt-2 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            ⚠️ Cart total ({fmt(cartTotal)}) exceeds your budget (
            {fmt(remainingAmount)}). Reduce your order or contact HR.
          </p>
        )}
      </div>
    );
  }

  if (walletBalance) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <span>👛</span>
          <span>My Wallet</span>
        </div>
        <p className="mt-1 text-lg font-bold">
          {fmt(walletBalance.balance)}
        </p>
        <p className="text-xs text-muted-foreground">Available balance</p>
        {cartTotal > walletBalance.balance && (
          <p className="mt-2 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
            ⚠️ Cart total ({fmt(cartTotal)}) exceeds your wallet balance (
            {fmt(walletBalance.balance)}).
          </p>
        )}
      </div>
    );
  }

  return null;
}

export default function EmployeeCartPage() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Allocation / wallet state
  const [allocationLoading, setAllocationLoading] = useState(true);
  const [allocation, setAllocation] = useState<CampaignAllocation | null>(null);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);

  /** Fetch campaign allocations and wallet balance on mount */
  useEffect(() => {
    async function fetchBudget() {
      setAllocationLoading(true);
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("gifteeng.b2b.token")
          : null;
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      try {
        // Correct endpoint: /api/campaigns/me/allocations returns nested shape
        const res = await fetch(`${API_BASE}/api/campaigns/me/allocations`, {
          headers,
        });
        if (res.ok) {
          const raw: Array<{
            id: string;
            campaignId: string;
            amount: string | number;
            redeemedAmount: string | number;
            campaign?: { title?: string };
          }> = await res.json();
          // Normalise to flat CampaignAllocation shape the component expects
          const data: CampaignAllocation[] = (Array.isArray(raw) ? raw : []).map((a) => ({
            id: a.id,
            campaignId: a.campaignId,
            campaignTitle: a.campaign?.title ?? "",
            allocatedAmount: Number(a.amount),
            usedAmount: Number(a.redeemedAmount),
            remainingAmount: Number(a.amount) - Number(a.redeemedAmount),
          }));
          // Pick the allocation with the most remaining budget
          const best = data
            .filter((a) => a.remainingAmount > 0)
            .sort((a, b) => b.remainingAmount - a.remainingAmount)[0] ?? data[0] ?? null;
          setAllocation(best);
          if (best) {
            setAllocationLoading(false);
            return; // wallet fallback not needed
          }
        }
      } catch {
        // silently continue to wallet fallback
      }

      // Wallet fallback when no active allocation
      try {
        // Correct endpoint: /api/wallet/employee returns Prisma Decimal fields
        const res = await fetch(`${API_BASE}/api/wallet/employee`, {
          headers,
        });
        if (res.ok) {
          const raw: { balance?: string | number; lockedBalance?: string | number; currency?: string } =
            await res.json();
          setWalletBalance({
            balance: Number(raw.balance ?? 0),
            lockedBalance: Number(raw.lockedBalance ?? 0),
            currency: raw.currency ?? "INR",
          });
        }
      } catch {
        // silently skip
      }

      setAllocationLoading(false);
    }

    void fetchBudget();
  }, []);

  const loadCart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const cart = await api.get<CartResponse>("/api/cart");
      const list = cart.items ?? [];
      setItems(list);
      const computed =
        cart.subtotal ??
        list.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0);
      setSubtotal(computed);
    } catch {
      setError("Failed to load cart");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCart();
  }, [loadCart]);

  async function updateQty(item: CartItem, nextQty: number) {
    if (nextQty < 1) return;
    setBusy(true);
    try {
      const api = apiB2b();
      await api.post("/api/cart/items", {
        productId: item.productId ?? item.id,
        quantity: nextQty,
        replace: true,
      });
      await loadCart();
    } catch {
      setError("Failed to update cart");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: CartItem) {
    setBusy(true);
    try {
      const api = apiB2b();
      await api.delete(`/api/cart/items/${item.id}`);
      await loadCart();
    } catch {
      setError("Failed to remove item");
    } finally {
      setBusy(false);
    }
  }

  // Derived: how much of the subtotal the allocation covers
  const allocationCovers = allocation
    ? Math.min(allocation.remainingAmount, subtotal)
    : walletBalance
    ? Math.min(walletBalance.balance, subtotal)
    : 0;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 text-sm text-muted-foreground">
        Loading cart...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-center">
        <h1 className="text-xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Browse the employee store to start adding gifts.
        </p>
        <Link
          href="/employee/store"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          Go to store
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Your cart</h1>
      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Cart items */}
        <div className="space-y-3 md:col-span-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              <div className="h-16 w-16 shrink-0 rounded bg-muted">
                {it.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt={it.name ?? ""}
                    className="h-full w-full rounded object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{it.name}</div>
                <div className="text-xs text-muted-foreground">
                  {it.price != null ? fmt(it.price) : ""}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void updateQty(it, it.quantity - 1)}
                    className="rounded border px-2 py-0.5 text-xs"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-xs">{it.quantity}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void updateQty(it, it.quantity + 1)}
                    className="rounded border px-2 py-0.5 text-xs"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeItem(it)}
                    className="ml-auto text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <aside className="space-y-3">
          {/* Allocation / wallet banner — live re-checks cart total on every render */}
          <AllocationBanner
            allocation={allocation}
            walletBalance={walletBalance}
            loading={allocationLoading}
            cartTotal={subtotal}
          />

          {/* Order summary */}
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Summary</h2>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{fmt(subtotal)}</dd>
              </div>
              {allocationCovers > 0 && (
                <div className="flex justify-between text-green-700">
                  <dt>
                    {allocation
                      ? "Campaign covers"
                      : "Wallet covers"}
                  </dt>
                  <dd>− {fmt(allocationCovers)}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                <dt>You pay</dt>
                <dd>{fmt(Math.max(0, subtotal - allocationCovers))}</dd>
              </div>
            </dl>
            <Link
              href="/employee/checkout"
              className="mt-4 block rounded-md bg-primary px-4 py-2 text-center text-sm text-primary-foreground"
            >
              Proceed to checkout
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

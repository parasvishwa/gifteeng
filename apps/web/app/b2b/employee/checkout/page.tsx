"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiB2b } from "@/lib/api";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type PaymentMethod = "wallet" | "allocation" | "invoice";

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

interface PlaceOrderResponse {
  order?: { id: string };
}

function fmt(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Derive the best auto-selected payment method based on available balances */
function bestMethod(
  allocations: CampaignAllocation[],
  wallet: WalletBalance | null,
  cartTotal: number
): PaymentMethod {
  const hasAllocation =
    allocations.length > 0 &&
    allocations.some((a) => a.remainingAmount >= cartTotal);
  if (hasAllocation) return "allocation";
  if (wallet && wallet.balance >= cartTotal) return "wallet";
  // Prefer allocation even if insufficient when wallet also can't cover
  if (allocations.length > 0) return "allocation";
  if (wallet) return "wallet";
  return "invoice";
}

export default function EmployeeCheckoutPage() {
  const router = useRouter();

  // Shipping / notes fields
  const [name, setName] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  // Payment
  const [method, setMethod] = useState<PaymentMethod>("allocation");
  const [allocationId, setAllocationId] = useState<string>("");

  // Budget data
  const [allocations, setAllocations] = useState<CampaignAllocation[]>([]);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(true);

  // Cart total (fetched on mount so we can validate)
  const [cartTotal, setCartTotal] = useState<number>(0);

  // Form state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadData() {
      setAllocationLoading(true);

      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("gifteeng.b2b.token")
          : null;
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};

      // Fetch cart total and budget data in parallel
      // Correct endpoints: /api/campaigns/me/allocations and /api/wallet/employee
      const [cartRes, allocRes, walletRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/cart`, { headers }),
        fetch(`${API_BASE}/api/campaigns/me/allocations`, { headers }),
        fetch(`${API_BASE}/api/wallet/employee`, { headers }),
      ]);

      // Cart
      if (cartRes.status === "fulfilled" && cartRes.value.ok) {
        try {
          const data = await cartRes.value.json();
          const items: { price?: number; quantity: number }[] = data.items ?? [];
          const total =
            data.subtotal ??
            items.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0);
          setCartTotal(total);
        } catch {
          // ignore
        }
      }

      // Allocations — /api/campaigns/me/allocations returns nested shape; normalise to flat
      let fetchedAllocations: CampaignAllocation[] = [];
      if (allocRes.status === "fulfilled" && allocRes.value.ok) {
        try {
          const raw: Array<{
            id: string;
            campaignId: string;
            amount: string | number;
            redeemedAmount: string | number;
            campaign?: { title?: string };
          }> = await allocRes.value.json();
          fetchedAllocations = (Array.isArray(raw) ? raw : []).map((a) => ({
            id: a.id,
            campaignId: a.campaignId,
            campaignTitle: a.campaign?.title ?? "",
            allocatedAmount: Number(a.amount),
            usedAmount: Number(a.redeemedAmount),
            remainingAmount: Number(a.amount) - Number(a.redeemedAmount),
          }));
          setAllocations(fetchedAllocations);
          if (fetchedAllocations[0]) setAllocationId(fetchedAllocations[0].id);
        } catch {
          // ignore
        }
      }

      // Wallet — /api/wallet/employee returns Prisma Decimal fields; normalise to number
      let fetchedWallet: WalletBalance | null = null;
      if (walletRes.status === "fulfilled" && walletRes.value.ok) {
        try {
          const raw: { balance?: string | number; lockedBalance?: string | number; currency?: string } =
            await walletRes.value.json();
          fetchedWallet = {
            balance: Number(raw.balance ?? 0),
            lockedBalance: Number(raw.lockedBalance ?? 0),
            currency: raw.currency ?? "INR",
          };
          setWalletBalance(fetchedWallet);
        } catch {
          // ignore
        }
      }

      // Auto-select the best payment method once we have all data
      // cartTotal may still be 0 at this point so we use local var
      const localCartTotal =
        cartTotal !== 0
          ? cartTotal
          : 0; /* will be overridden by setCartTotal above on next render */
      setMethod(bestMethod(fetchedAllocations, fetchedWallet, localCartTotal));

      setAllocationLoading(false);
    }

    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-evaluate auto-select whenever cartTotal resolves after allocations
  useEffect(() => {
    if (!allocationLoading && cartTotal > 0) {
      setMethod(bestMethod(allocations, walletBalance, cartTotal));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartTotal, allocationLoading]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const selectedAllocation = allocations.find((a) => a.id === allocationId);

  /** Remaining balance for the selected allocation */
  const allocationRemaining = selectedAllocation?.remainingAmount ?? 0;

  /** Whether the selected payment method has sufficient funds */
  function hasSufficientFunds(): boolean {
    if (method === "invoice") return true;
    if (method === "allocation") return allocationRemaining >= cartTotal;
    if (method === "wallet") return (walletBalance?.balance ?? 0) >= cartTotal;
    return false;
  }

  /** What the campaign covers when paying via allocation */
  const campaignCovers =
    method === "allocation" && selectedAllocation
      ? Math.min(selectedAllocation.remainingAmount, cartTotal)
      : 0;

  const grandTotal = Math.max(0, cartTotal - campaignCovers);

  // ── Form submission ────────────────────────────────────────────────────────

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPaymentError(null);

    // Client-side budget guard
    if (!hasSufficientFunds()) {
      if (method === "allocation") {
        setPaymentError(
          `Insufficient campaign budget. Your allocation has ${fmt(
            allocationRemaining
          )} remaining but the order total is ${fmt(cartTotal)}.`
        );
      } else if (method === "wallet") {
        setPaymentError(
          `Insufficient wallet balance. Your wallet has ${fmt(
            walletBalance?.balance ?? 0
          )} but the order total is ${fmt(cartTotal)}.`
        );
      }
      return;
    }

    setSubmitting(true);
    try {
      const api = apiB2b();
      const payload = {
        // AddressSchema expects fullName + pincode (not name/postalCode)
        shippingAddress: { fullName: name, line1, city, state, pincode: postalCode, phone },
        notes,
        // Schema enum: "wallet" | "invoice" (no "allocation" — map it)
        paymentMethod: method === "allocation" ? "wallet" : method,
      };
      const res = await api.post<PlaceOrderResponse>(
        "/api/checkout/b2b/place",
        payload
      );
      if (res.order?.id) {
        router.replace(`/employee/orders/${res.order.id}`);
      } else {
        setError("Order placed but no ID returned");
      }
    } catch {
      setError("Failed to place order");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Checkout</h1>
      <form onSubmit={submit} className="space-y-6">
        {/* Shipping address */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Shipping address</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" value={name} onChange={setName} required />
            <Field label="Phone" value={phone} onChange={setPhone} required />
            <div className="sm:col-span-2">
              <Field
                label="Address line 1"
                value={line1}
                onChange={setLine1}
                required
              />
            </div>
            <Field label="City" value={city} onChange={setCity} required />
            <Field label="State" value={state} onChange={setState} required />
            <Field
              label="Postal code"
              value={postalCode}
              onChange={setPostalCode}
              required
            />
          </div>
        </section>

        {/* Notes */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Any special instructions"
          />
        </section>

        {/* Payment method */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Payment method</h2>
          {allocationLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse">
              Loading payment options...
            </p>
          ) : (
            <div className="space-y-2">
              {/* Allocation option */}
              {allocations.length > 0 ? (
                <div>
                  {allocations.map((alloc) => {
                    const insufficient =
                      cartTotal > 0 && alloc.remainingAmount < cartTotal;
                    return (
                      <div key={alloc.id} className="group relative">
                        <label
                          className={`flex cursor-pointer items-start gap-2 text-sm rounded-md px-2 py-1.5 ${
                            insufficient
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:bg-muted/40"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            checked={
                              method === "allocation" &&
                              allocationId === alloc.id
                            }
                            onChange={() => {
                              if (!insufficient) {
                                setMethod("allocation");
                                setAllocationId(alloc.id);
                                setPaymentError(null);
                              }
                            }}
                            disabled={insufficient}
                            className="mt-0.5 h-4 w-4 shrink-0"
                          />
                          <span className="flex flex-col">
                            <span className="font-medium">
                              Campaign Budget — {alloc.campaignTitle}
                            </span>
                            <span
                              className={`text-xs ${
                                insufficient
                                  ? "text-red-500"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {fmt(alloc.remainingAmount)} remaining
                              {insufficient &&
                                " — Insufficient budget. Please reduce your order."}
                            </span>
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Wallet option */}
              <label
                className={`flex cursor-pointer items-start gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-muted/40 ${
                  !walletBalance ? "opacity-40" : ""
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={method === "wallet"}
                  onChange={() => {
                    setMethod("wallet");
                    setPaymentError(null);
                  }}
                  disabled={!walletBalance}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="flex flex-col">
                  <span className="font-medium">My Wallet</span>
                  <span
                    className={`text-xs ${
                      walletBalance &&
                      cartTotal > 0 &&
                      walletBalance.balance < cartTotal
                        ? "text-red-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {walletBalance
                      ? `${fmt(walletBalance.balance)} available`
                      : "Not available"}
                  </span>
                </span>
              </label>

              {/* Invoice option */}
              <label className="flex cursor-pointer items-start gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-muted/40">
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={method === "invoice"}
                  onChange={() => {
                    setMethod("invoice");
                    setPaymentError(null);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="flex flex-col">
                  <span className="font-medium">Invoice</span>
                  <span className="text-xs text-muted-foreground">
                    Requires HR approval
                  </span>
                </span>
              </label>
            </div>
          )}

          {/* Inline payment error */}
          {paymentError && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {paymentError}
            </p>
          )}
        </section>

        {/* Order total breakdown */}
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Order total</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{cartTotal > 0 ? fmt(cartTotal) : "—"}</dd>
            </div>
            {campaignCovers > 0 && (
              <div className="flex justify-between text-green-700">
                <dt>Campaign covers</dt>
                <dd>− {fmt(campaignCovers)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-2 mt-1">
              <dt>Grand total</dt>
              <dd>{cartTotal > 0 ? fmt(grandTotal) : "—"}</dd>
            </div>
          </dl>
        </section>

        {/* General error */}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || allocationLoading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Placing order..." : "Place order"}
        </button>
      </form>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}

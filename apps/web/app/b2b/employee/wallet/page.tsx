"use client";

import { useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";

interface WalletResponse {
  balance?: number;
  currency?: string;
}

interface Allocation {
  id: string;
  campaignTitle?: string;
  amount?: number;
  redeemedAmount?: number;
  expiresAt?: string;
  status?: string;
}

export default function EmployeeWalletPage() {
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const api = apiB2b();
        const [w, a] = await Promise.all([
          api
            .get<any>("/api/wallet/employee")
            .catch(() => ({ balance: 0 })),
          api
            .get<any>("/api/campaigns/me/allocations")
            .catch(() => []),
        ]);
        // Coerce Prisma Decimal balance to number
        setWallet({ balance: Number(w?.balance ?? 0), currency: w?.currency });
        // Endpoint returns a plain array; each allocation has a nested campaign object
        const rawList: any[] = Array.isArray(a) ? a : (a?.allocations ?? []);
        setAllocations(rawList.map((al: any) => ({
          id: al.id,
          campaignTitle: al.campaign?.title ?? al.campaignTitle,
          amount: Number(al.amount ?? 0),
          redeemedAmount: Number(al.redeemedAmount ?? 0),
          expiresAt: al.expiresAt,
          status: al.status,
        })));
      } catch {
        setError("Failed to load wallet");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-bold">Wallet & allocations</h1>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <>
          <section className="rounded-lg border bg-card p-6">
            <div className="text-xs uppercase text-muted-foreground">
              Wallet balance
            </div>
            <div className="mt-1 text-3xl font-bold">
              ₹{(wallet?.balance ?? 0).toLocaleString("en-IN")}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Active allocations</h2>
            {allocations.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No active allocations.
              </div>
            ) : (
              <ul className="space-y-3">
                {allocations.map((a) => {
                  const amount = a.amount ?? 0;
                  const redeemed = a.redeemedAmount ?? 0;
                  const pct = amount > 0 ? Math.min(100, (redeemed / amount) * 100) : 0;
                  return (
                    <li
                      key={a.id}
                      className="rounded-lg border bg-card p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                          {a.campaignTitle ?? a.id}
                        </div>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize">
                          {a.status ?? "active"}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {a.expiresAt
                          ? `Expires ${new Date(a.expiresAt).toLocaleDateString()}`
                          : ""}
                      </div>
                      <div className="mt-2 flex justify-between text-xs">
                        <span>
                          Redeemed ₹{redeemed.toLocaleString("en-IN")}
                        </span>
                        <span>Total ₹{amount.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

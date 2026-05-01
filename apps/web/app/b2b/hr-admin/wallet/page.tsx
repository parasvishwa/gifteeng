"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@gifteeng/ui";
import { apiB2b } from "@/lib/api";

type Wallet = {
  id: string;
  balance: number;
  locked: number;
  currency: string;
};

type Transaction = {
  id: string;
  type: string;
  amount: number;
  reference?: string | null;
  createdAt: string;
};

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [topupOpen, setTopupOpen] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const raw = await api.get<any>("/api/wallet/company");
      if (raw) {
        // API returns lockedBalance (Prisma field name); normalise to locked
        setWallet({
          id: raw.id,
          balance: Number(raw.balance ?? 0),
          locked: Number(raw.locked ?? raw.lockedBalance ?? 0),
          currency: raw.currency ?? "INR",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallet");
    } finally {
      setLoading(false);
    }

    try {
      // API returns { items, total, page, pageSize }
      const res = await apiB2b().get<{ items?: Transaction[] } | Transaction[]>(
        "/api/wallet/company/transactions",
      );
      const list = Array.isArray(res) ? res : (res?.items ?? []);
      setTransactions(list);
      setTxError(null);
    } catch {
      setTransactions(null);
      setTxError("Transaction history coming soon");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onTopup = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!wallet) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiB2b().post("/api/wallet/topup", {
        walletId: wallet.id,
        amount: Number(amount),
        reference: reference || undefined,
      });
      setTopupOpen(false);
      setAmount("");
      setReference("");
      setSuccessMsg("Top-up successful");
      setTimeout(() => setSuccessMsg(null), 3000);
      void load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setSubmitting(false);
    }
  };

  const available = wallet ? wallet.balance - wallet.locked : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Wallet" description="Manage your company's balance" />

      {successMsg ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {successMsg}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Balance</CardTitle>
          <Button onClick={() => setTopupOpen(true)} disabled={!wallet}>
            Top up
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24" />
          ) : wallet ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Balance
                </div>
                <div className="text-2xl font-bold">
                  {wallet.currency} {wallet.balance}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Locked
                </div>
                <div className="text-2xl font-bold">
                  {wallet.currency} {wallet.locked}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Available
                </div>
                <div className="text-2xl font-bold">
                  {wallet.currency} {available}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No wallet found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {txError ? (
            <p className="text-sm text-muted-foreground">{txError}</p>
          ) : transactions === null ? (
            <Skeleton className="h-24" />
          ) : transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell className="text-right">Amount</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      {new Date(t.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{t.type}</TableCell>
                    <TableCell>{t.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={topupOpen}
        onOpenChange={(next: boolean) => {
          setTopupOpen(next);
          if (!next) {
            setAmount("");
            setReference("");
            setSubmitError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top up wallet</DialogTitle>
          </DialogHeader>
          <form onSubmit={onTopup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tu-amount">Amount</Label>
              <Input
                id="tu-amount"
                type="number"
                required
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tu-ref">Reference (optional)</Label>
              <Input
                id="tu-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="PO-12345"
              />
            </div>
            {submitError ? (
              <p className="text-sm text-red-600">{submitError}</p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTopupOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Topping up..." : "Top up"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

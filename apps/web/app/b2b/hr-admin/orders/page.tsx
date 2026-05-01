"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@gifteeng/ui";
import { apiB2b } from "@/lib/api";

type Order = {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: string;
  grandTotal: number;
  currency?: string;
  paymentMethod?: string;
  employeeName?: string;
};

type OrdersResp = { items: Order[]; total?: number } | Order[];

const STATUS_FILTERS: string[] = [
  "all",
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiB2b().get<OrdersResp>("/api/orders/b2b/company");
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (dateFrom && new Date(o.placedAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(o.placedAt) > new Date(dateTo)) return false;
      return true;
    });
  }, [orders, statusFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="All orders from your company" />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className="focus:outline-none"
                >
                  <Badge variant={statusFilter === s ? "default" : "outline"}>
                    {s}
                  </Badge>
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-40" />
          ) : error ? (
            <EmptyState title="Couldn't load orders" description={error} />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No orders"
              description="No orders match your filters."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Order #</TableCell>
                  <TableCell>Employee</TableCell>
                  <TableCell>Placed</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell className="text-right">Total</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/hr-admin/orders/${o.id}`)}
                  >
                    <TableCell className="font-medium">
                      {o.orderNumber}
                    </TableCell>
                    <TableCell>{o.employeeName ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(o.placedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>{o.paymentMethod ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {(o.currency ?? "INR") + " " + o.grandTotal}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

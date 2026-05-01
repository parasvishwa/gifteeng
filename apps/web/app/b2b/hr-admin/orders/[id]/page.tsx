"use client";

import { use, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@gifteeng/ui";
import { apiB2b, API_BASE_URL } from "@/lib/api";

type OrderItem = {
  id: string;
  productTitle: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Address = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
};

type Shipment = {
  id: string;
  carrier?: string;
  trackingNumber?: string;
  status: string;
  shippedAt?: string | null;
  deliveredAt?: string | null;
};

type TimelineEntry = {
  status: string;
  at: string;
};

type OrderDetail = {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: string;
  grandTotal: number;
  currency?: string;
  paymentMethod?: string;
  items: OrderItem[];
  shippingAddress?: Address;
  timeline?: TimelineEntry[];
  shipments?: Shipment[];
};

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiB2b().get<OrderDetail>(`/api/orders/${id}`);
        setOrder(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  if (loading) return <Skeleton className="h-96" />;
  if (error || !order) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? "Order not found"}
      </div>
    );
  }

  const invoiceUrl = `${API_BASE_URL}/api/orders/${id}/invoice.pdf`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`Placed ${new Date(order.placedAt).toLocaleString()}`}
      />

      <div className="flex items-center justify-between">
        <StatusBadge status={order.status} />
        <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline">Print invoice</Button>
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell className="text-right">Qty</TableCell>
                <TableCell className="text-right">Unit</TableCell>
                <TableCell className="text-right">Total</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>{i.productTitle}</TableCell>
                  <TableCell className="text-right">{i.quantity}</TableCell>
                  <TableCell className="text-right">{i.unitPrice}</TableCell>
                  <TableCell className="text-right">{i.lineTotal}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-semibold">
                  Grand total
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {(order.currency ?? "INR") + " " + order.grandTotal}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shipping address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {order.shippingAddress ? (
              <>
                <div>{order.shippingAddress.name}</div>
                <div>{order.shippingAddress.line1}</div>
                {order.shippingAddress.line2 ? (
                  <div>{order.shippingAddress.line2}</div>
                ) : null}
                <div>
                  {order.shippingAddress.city}
                  {order.shippingAddress.state
                    ? `, ${order.shippingAddress.state}`
                    : ""}{" "}
                  {order.shippingAddress.postalCode}
                </div>
                <div>{order.shippingAddress.country}</div>
                {order.shippingAddress.phone ? (
                  <div>{order.shippingAddress.phone}</div>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">No address</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div>
              <span className="text-muted-foreground">Method: </span>
              {order.paymentMethod ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              {(order.currency ?? "INR") + " " + order.grandTotal}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {!order.timeline || order.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {order.timeline.map((t, i) => (
                <li key={`${t.status}-${i}`} className="flex gap-3">
                  <span className="text-muted-foreground">
                    {new Date(t.at).toLocaleString()}
                  </span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipments</CardTitle>
        </CardHeader>
        <CardContent>
          {!order.shipments || order.shipments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shipments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell>Carrier</TableCell>
                  <TableCell>Tracking</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Shipped</TableCell>
                  <TableCell>Delivered</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.shipments.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.carrier ?? "—"}</TableCell>
                    <TableCell>{s.trackingNumber ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell>
                      {s.shippedAt
                        ? new Date(s.shippedAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {s.deliveredAt
                        ? new Date(s.deliveredAt).toLocaleDateString()
                        : "—"}
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

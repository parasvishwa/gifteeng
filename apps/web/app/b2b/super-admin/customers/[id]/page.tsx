"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiB2b } from "@/lib/api";

type Address = {
  id: string;
  label?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type Review = {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  productTitle?: string;
  createdAt?: string;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal?: number;
  createdAt?: string;
};

type Customer = {
  id: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  createdAt?: string;
  addresses?: Address[];
  orders?: Order[];
  reviews?: Review[];
};

export default function SuperAdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiB2b()
      .get<Customer>(`/api/customers/${id}`)
      .then(setCustomer)
      .catch(() => setError("Failed to load customer"));
  }, [id]);

  if (error) return <div className="text-sm text-destructive">{error}</div>;
  if (!customer) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/super-admin/customers"
          className="text-xs text-muted-foreground hover:underline"
        >
          &larr; Back to customers
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{customer.name ?? customer.email}</h1>
      </div>

      <div className="rounded-md border p-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Email</div>
            <div className="font-medium">{customer.email}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Phone</div>
            <div className="font-medium">{customer.phone ?? "--"}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Joined</div>
            <div className="font-medium">
              {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : "--"}
            </div>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Orders</h2>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Order</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {(customer.orders ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No orders.
                  </td>
                </tr>
              ) : (
                customer.orders!.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link
                        href={`/super-admin/orders/${o.id}`}
                        className="hover:underline"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{o.status}</td>
                    <td className="px-4 py-2 text-right">
                      {(o.grandTotal ?? 0).toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                      })}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {o.createdAt ? new Date(o.createdAt).toLocaleString() : "--"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Addresses</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(customer.addresses ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No addresses.</div>
          ) : (
            customer.addresses!.map((a) => (
              <div key={a.id} className="rounded-md border p-4 text-sm">
                {a.label && <div className="text-xs font-medium uppercase">{a.label}</div>}
                {a.line1 && <div>{a.line1}</div>}
                {a.line2 && <div>{a.line2}</div>}
                <div>
                  {[a.city, a.state, a.postalCode].filter(Boolean).join(", ")}
                </div>
                {a.country && <div>{a.country}</div>}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Reviews</h2>
        <div className="space-y-3">
          {(customer.reviews ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No reviews.</div>
          ) : (
            customer.reviews!.map((r) => (
              <div key={r.id} className="rounded-md border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{r.title ?? r.productTitle ?? "Review"}</div>
                  <div>{"*".repeat(r.rating)}</div>
                </div>
                {r.body && <div className="mt-1 text-muted-foreground">{r.body}</div>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

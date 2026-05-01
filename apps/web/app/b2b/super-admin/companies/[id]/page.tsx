"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiB2b } from "@/lib/api";

type Company = {
  id: string;
  name: string;
  slug: string;
  status?: string;
  billingEmail?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  walletBalance?: number;
};

type CompanyUser = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  createdAt?: string;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal?: number;
  placedAt?: string;
  createdAt?: string;
};

type Campaign = {
  id: string;
  name: string;
  status?: string;
  budget?: number;
  createdAt?: string;
};

const TABS = ["Overview", "Users", "Orders", "Campaigns", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function SuperAdminCompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiB2b()
      .get<Company>(`/api/companies/${id}`)
      .then(setCompany)
      .catch(() => setError("Failed to load company"));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (tab === "Users") {
      apiB2b()
        .get<CompanyUser[]>(`/api/companies/${id}/users`)
        .then(setUsers)
        .catch(() => setError("Failed to load users"));
    }
    if (tab === "Orders") {
      apiB2b()
        .get<{ data?: Order[] } | Order[]>(`/api/orders/admin/all?companyId=${id}`)
        .then((res) => setOrders(Array.isArray(res) ? res : (res.data ?? [])))
        .catch(() => setError("Failed to load orders"));
    }
    if (tab === "Campaigns") {
      apiB2b()
        .get<{ data?: Campaign[] } | Campaign[]>(`/api/campaigns?companyId=${id}`)
        .then((res) => setCampaigns(Array.isArray(res) ? res : (res.data ?? [])))
        .catch(() => setError("Failed to load campaigns"));
    }
  }, [id, tab]);

  if (!company) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/super-admin/companies"
          className="text-xs text-muted-foreground hover:underline"
        >
          &larr; Back to companies
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{company.name}</h1>
        <div className="text-xs text-muted-foreground">/{company.slug}</div>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm transition ${
              tab === t
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {tab === "Overview" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Info label="Status" value={company.status ?? "active"} />
          <Info label="Billing email" value={company.billingEmail ?? "--"} />
          <Info
            label="Wallet balance"
            value={(company.walletBalance ?? 0).toLocaleString("en-IN", {
              style: "currency",
              currency: "INR",
            })}
          />
        </div>
      )}

      {tab === "Users" && <UsersPanel companyId={id} users={users} onRefresh={() => {
        apiB2b().get<CompanyUser[]>(`/api/companies/${id}/users`).then(setUsers).catch(() => {});
      }} />}

      {tab === "Orders" && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Order</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No orders.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
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
                      {o.placedAt
                        ? new Date(o.placedAt).toLocaleString()
                        : o.createdAt
                          ? new Date(o.createdAt).toLocaleString()
                          : "--"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Campaigns" && (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Budget</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    No campaigns.
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2">{c.status ?? "--"}</td>
                    <td className="px-4 py-2 text-right">
                      {(c.budget ?? 0).toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Settings" && <SettingsPanel company={company} onSave={setCompany} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function UsersPanel({
  companyId,
  users,
  onRefresh,
}: {
  companyId: string;
  users: CompanyUser[];
  onRefresh: () => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("hr_admin");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    if (!inviteEmail) return;
    setSaving(true);
    setError(null);
    try {
      await apiB2b().post("/api/auth/b2b/invite", {
        companyId,
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail("");
      onRefresh();
    } catch {
      setError("Invite failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 min-w-[200px] rounded-md border px-3 py-1.5 text-sm"
        />
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="hr_admin">HR Admin</option>
          <option value="employee">Employee</option>
          <option value="approver">Approver</option>
        </select>
        <button
          onClick={invite}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Inviting..." : "Invite"}
        </button>
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No users.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.name ?? "--"}</td>
                  <td className="px-4 py-2">{u.role}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "--"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsPanel({
  company,
  onSave,
}: {
  company: Company;
  onSave: (c: Company) => void;
}) {
  const [brandColor, setBrandColor] = useState(company.brandColor ?? "#000000");
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await apiB2b().patch<Company>(`/api/companies/${company.id}`, {
        brandColor,
        logoUrl,
      });
      onSave({ ...company, ...updated, brandColor, logoUrl });
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
          Brand color
        </span>
        <input
          type="color"
          value={brandColor}
          onChange={(e) => setBrandColor(e.target.value)}
          className="h-10 w-20 rounded-md border"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
          Logo URL
        </span>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          className="w-full rounded-md border px-3 py-1.5"
        />
      </label>
      {error && <div className="text-sm text-destructive">{error}</div>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

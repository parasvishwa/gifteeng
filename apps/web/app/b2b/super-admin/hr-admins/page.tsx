"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders, getApiBase, safeGet, safePost } from "@/lib/admin-api";

type Company = {
  id: string;
  name: string;
  slug?: string;
};

type HrAdmin = {
  id: string;
  email: string;
  fullName?: string | null;
  role: string;
  companyId: string;
  companyName?: string;
  invitedAt?: string | null;
  lastLoginAt?: string | null;
  status?: string;
  avatarUrl?: string | null;
};

type EmployeesResponse = { data?: HrAdmin[] } | HrAdmin[];

function initials(name?: string | null, email?: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function SuperAdminHrAdminsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [admins, setAdmins] = useState<HrAdmin[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [showInvite, setShowInvite] = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await safeGet<{ data?: Company[] } | Company[]>("/companies", []);
      const list: Company[] = Array.isArray(raw) ? raw : (raw.data ?? []);
      setCompanies(list);

      const all: HrAdmin[] = [];
      await Promise.all(
        list.map(async (c) => {
          const res = await safeGet<EmployeesResponse>(
            `/companies/${c.id}/employees?role=hr_admin`,
            [],
          );
          const rows: HrAdmin[] = Array.isArray(res) ? res : (res.data ?? []);
          rows.forEach((r) => {
            all.push({ ...r, companyId: c.id, companyName: c.name });
          });
        }),
      );

      if (all.length === 0) {
        const fallback = await safeGet<EmployeesResponse>(
          "/companies/me/employees?role=hr_admin",
          [],
        );
        const rows: HrAdmin[] = Array.isArray(fallback) ? fallback : (fallback.data ?? []);
        rows.forEach((r) => all.push(r));
      }

      setAdmins(all);
    } catch {
      setError("Failed to load HR admins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(
      (a) =>
        a.email.toLowerCase().includes(q) ||
        (a.fullName ?? "").toLowerCase().includes(q) ||
        (a.companyName ?? "").toLowerCase().includes(q),
    );
  }, [admins, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HR Admins</h1>
          <p className="text-sm text-muted-foreground">
            All HR admin users across every company on the platform.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Invite HR admin
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or company..."
          className="w-72 rounded-md border bg-background px-3 py-1.5 text-sm"
        />
        <div className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "admin" : "admins"}
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Admin</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Company</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Invited</th>
              <th className="px-4 py-2 text-left">Last login</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No HR admins yet. Invite one to get started.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr
                  key={`${a.companyId}:${a.id}`}
                  className="cursor-pointer border-t hover:bg-muted/30"
                  onClick={() => {
                    window.location.href = `/super-admin/companies/${a.companyId}`;
                  }}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      {a.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.avatarUrl}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {initials(a.fullName, a.email)}
                        </div>
                      )}
                      <span className="font-medium">{a.fullName ?? "--"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs">{a.email}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/super-admin/companies/${a.companyId}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {a.companyName ?? "--"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs uppercase">
                      {a.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {a.invitedAt ? new Date(a.invitedAt).toLocaleDateString() : "--"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "--"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        a.status === "active"
                          ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                          : a.status === "suspended"
                            ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                            : ""
                      }`}
                    >
                      {a.status ?? "active"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/super-admin/companies/${a.companyId}`;
                      }}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteHrAdminDialog
          companies={companies}
          onClose={() => setShowInvite(false)}
          onInvited={load}
        />
      )}
    </div>
  );
}

function InviteHrAdminDialog({
  companies,
  onClose,
  onInvited,
}: {
  companies: Company[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // TODO: NestJS /auth/b2b/invite uses caller's companyId — for cross-company
    // invites we may need a platform-staff proxy endpoint. We pass companyId
    // optimistically; backend may ignore it.
    const res = await safePost<{ id?: string; error?: string } | null>(
      "/auth/b2b/invite",
      { email, fullName, role: "hr_admin", companyId },
      null,
    );
    setSaving(false);
    if (!res) {
      setError("Failed to send invite");
      return;
    }
    onInvited();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Invite HR admin</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Full name
            </span>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Company
            </span>
            <select
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            >
              <option value="">Select a company...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !companyId}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Sending..." : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

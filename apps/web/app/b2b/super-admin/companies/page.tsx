"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders, getApiBase, safeGet, safePatch, safePost } from "@/lib/admin-api";

type Company = {
  id: string;
  name: string;
  slug: string;
  status?: string;
  billingEmail?: string | null;
  logoUrl?: string | null;
  createdAt?: string;
};

type Product = {
  id: string;
  title: string;
  category?: string;
  basePrice?: number;
};

type Employee = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
};

type WalletInfo = { balance?: number } | null;

function statusColor(s?: string): string {
  switch (s) {
    case "active":
      return "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400";
    case "suspended":
      return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400";
    case "pending":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    default:
      return "";
  }
}

function inr(n?: number | null): string {
  return (n ?? 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function SuperAdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [wallets, setWallets] = useState<Record<string, number | null>>({});
  const [employeeCounts, setEmployeeCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<boolean>(false);

  // Expanded details panel
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedEmployees, setExpandedEmployees] = useState<Employee[]>([]);
  const [expandedLoading, setExpandedLoading] = useState<boolean>(false);

  // Modals
  const [assignProductsFor, setAssignProductsFor] = useState<Company | null>(null);
  const [createProductFor, setCreateProductFor] = useState<Company | null>(null);
  const [logoUploadFor, setLogoUploadFor] = useState<Company | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await safeGet<{ data?: Company[] } | Company[]>("/companies", []);
      const list: Company[] = Array.isArray(raw) ? raw : (raw.data ?? []);
      setCompanies(list);

      list.forEach(async (c) => {
        const w = await safeGet<WalletInfo>(`/wallet/company?companyId=${c.id}`, null);
        setWallets((prev) => ({ ...prev, [c.id]: w?.balance ?? null }));

        const eRes = await safeGet<{ total?: number; data?: unknown[] } | unknown[]>(
          `/companies/${c.id}/employees?pageSize=1`,
          [],
        );
        let count: number | null = null;
        if (Array.isArray(eRes)) count = eRes.length;
        else if (typeof eRes.total === "number") count = eRes.total;
        else if (Array.isArray(eRes.data)) count = eRes.data.length;
        setEmployeeCounts((prev) => ({ ...prev, [c.id]: count }));
      });
    } catch {
      setError("Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleExpand(c: Company) {
    if (expandedId === c.id) {
      setExpandedId(null);
      setExpandedEmployees([]);
      return;
    }
    setExpandedId(c.id);
    setExpandedLoading(true);
    setExpandedEmployees([]);
    const res = await safeGet<{ data?: Employee[] } | Employee[]>(
      `/companies/${c.id}/employees`,
      [],
    );
    const list: Employee[] = Array.isArray(res) ? res : (res.data ?? []);
    setExpandedEmployees(list);
    setExpandedLoading(false);
  }

  async function toggleStatus(c: Company, e: React.MouseEvent) {
    e.stopPropagation();
    const next = c.status === "suspended" ? "active" : "suspended";
    const updated = await safePatch<Company | null>(`/companies/${c.id}`, { status: next }, null);
    if (updated) {
      setCompanies((prev) =>
        prev.map((co) => (co.id === c.id ? { ...co, status: next } : co)),
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-muted-foreground">
            All B2B corporate accounts on the platform.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          New company
        </button>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left">Logo</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Slug</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Billing email</th>
              <th className="px-4 py-2 text-right">Employees</th>
              <th className="px-4 py-2 text-right">Wallet</th>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : companies.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  No companies yet.
                </td>
              </tr>
            ) : (
              companies.map((c) => (
                <>
                  <tr
                    key={c.id}
                    className="border-t hover:bg-muted/30"
                  >
                    <td className="px-4 py-2">
                      <div className="relative group">
                        {c.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.logoUrl}
                            alt=""
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-xs font-medium">
                            {c.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setLogoUploadFor(c); }}
                          className="absolute inset-0 flex items-center justify-center rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 text-[10px] font-medium transition"
                          title="Upload logo"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2 font-medium">
                      <Link
                        href={`/super-admin/companies/${c.id}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{c.slug}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={(e) => toggleStatus(c, e)}
                        title="Click to toggle status"
                        className={`rounded-full border px-2 py-0.5 text-xs cursor-pointer hover:opacity-80 ${statusColor(c.status)}`}
                      >
                        {c.status ?? "active"}
                      </button>
                    </td>
                    <td className="px-4 py-2">{c.billingEmail ?? "--"}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      {employeeCounts[c.id] == null ? "--" : employeeCounts[c.id]}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {wallets[c.id] == null ? (
                        <span className="text-xs text-muted-foreground">--</span>
                      ) : (
                        inr(wallets[c.id])
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "--"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                          onClick={() => toggleExpand(c)}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted whitespace-nowrap"
                        >
                          {expandedId === c.id ? "Collapse" : "View Details"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setAssignProductsFor(c); }}
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted whitespace-nowrap"
                        >
                          Assign Products
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setCreateProductFor(c); }}
                          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground whitespace-nowrap"
                        >
                          + Product
                        </button>
                      </div>
                    </td>
                  </tr>

                  {expandedId === c.id && (
                    <tr key={`${c.id}-details`} className="border-t bg-muted/20">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <h3 className="text-sm font-semibold">Employees — {c.name}</h3>
                            <span className="text-xs text-muted-foreground">
                              {employeeCounts[c.id] != null
                                ? `${employeeCounts[c.id]} total`
                                : ""}
                            </span>
                          </div>
                          {expandedLoading ? (
                            <p className="text-xs text-muted-foreground">Loading employees...</p>
                          ) : expandedEmployees.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No employees found.</p>
                          ) : (
                            <div className="overflow-hidden rounded-md border max-h-64 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/50 sticky top-0">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left">Name</th>
                                    <th className="px-3 py-1.5 text-left">Email</th>
                                    <th className="px-3 py-1.5 text-left">Role</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedEmployees.map((emp) => (
                                    <tr key={emp.id} className="border-t hover:bg-muted/30">
                                      <td className="px-3 py-1.5">{emp.name ?? "--"}</td>
                                      <td className="px-3 py-1.5 text-muted-foreground">
                                        {emp.email ?? "--"}
                                      </td>
                                      <td className="px-3 py-1.5 text-muted-foreground">
                                        {emp.role ?? "--"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewCompanyDialog
          onClose={() => setShowNew(false)}
          onCreated={load}
        />
      )}

      {assignProductsFor && (
        <AssignProductsDialog
          company={assignProductsFor}
          onClose={() => setAssignProductsFor(null)}
        />
      )}

      {createProductFor && (
        <CreateProductDialog
          company={createProductFor}
          onClose={() => setCreateProductFor(null)}
        />
      )}

      {logoUploadFor && (
        <LogoUploadDialog
          company={logoUploadFor}
          onClose={() => setLogoUploadFor(null)}
          onUploaded={(url) => {
            setCompanies((prev) =>
              prev.map((co) => (co.id === logoUploadFor.id ? { ...co, logoUrl: url } : co)),
            );
            setLogoUploadFor(null);
          }}
        />
      )}
    </div>
  );
}

// ─── New Company Dialog ───────────────────────────────────────────────────────

function NewCompanyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState<string>("");
  const [slug, setSlug] = useState<string>("");
  const [billingEmail, setBillingEmail] = useState<string>("");
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const created = await safePost<{ id?: string } | null>(
      "/companies",
      { name, slug: slug || slugify(name), billingEmail },
      null,
    );
    if (!created || !created.id) {
      setError("Failed to create company");
      setSaving(false);
      return;
    }
    if (adminEmail) {
      await safePost(
        "/auth/b2b/invite",
        { companyId: created.id, email: adminEmail, role: "hr_admin" },
        null,
      );
    }
    setSaving(false);
    onCreated();
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
        <h2 className="mb-4 text-lg font-semibold">New company</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Name
            </span>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Slug
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated"
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Billing email
            </span>
            <input
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
              Initial HR admin email
            </span>
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5"
            />
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
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Assign Products Dialog ───────────────────────────────────────────────────

function AssignProductsDialog({
  company,
  onClose,
}: {
  company: Company;
  onClose: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  useEffect(() => {
    safeGet<Product[] | { data?: Product[] }>("/products", []).then((res) => {
      const list: Product[] = Array.isArray(res) ? res : (res.data ?? []);
      setProducts(list);
      setLoading(false);
    });
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one product");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await safePost<{ success?: boolean } | null>(
      "/company-products/assign",
      { companyId: company.id, productIds: Array.from(selected) },
      null,
    );
    setSaving(false);
    if (!res) {
      setError("Failed to assign products");
      return;
    }
    setSuccess(true);
    setTimeout(onClose, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">Assign Products</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Select products to assign to <strong>{company.name}</strong>
        </p>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading products...</p>
        ) : success ? (
          <p className="py-6 text-center text-sm text-green-600">Products assigned successfully!</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {products.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No products found.
                </p>
              ) : (
                products.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-sm">{p.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.category ?? ""}
                        {p.basePrice != null ? ` — ${inr(p.basePrice)}` : ""}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {selected.size} product{selected.size !== 1 ? "s" : ""} selected
            </div>
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
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving..." : "Assign Products"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Create Product Dialog ────────────────────────────────────────────────────

function CreateProductDialog({
  company,
  onClose,
}: {
  company: Company;
  onClose: () => void;
}) {
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [basePrice, setBasePrice] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const price = Number(basePrice);
    const res = await safePost<{ id?: string } | null>(
      "/products",
      {
        title,
        category,
        basePrice: Number.isFinite(price) ? price : undefined,
        description,
        ownerCompanyId: company.id,
      },
      null,
    );
    setSaving(false);
    if (!res || !res.id) {
      setError("Failed to create product");
      return;
    }
    setSuccess(true);
    setTimeout(onClose, 1200);
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
        <h2 className="mb-1 text-lg font-semibold">Create Product for Company</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          This product will be owned by <strong>{company.name}</strong>
        </p>
        {success ? (
          <p className="py-6 text-center text-sm text-green-600">Product created successfully!</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                Title *
              </span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                Category
              </span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                Base Price (INR)
              </span>
              <input
                type="number"
                min="0"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-1.5"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-1.5 resize-none"
              />
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
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Product"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Logo Upload Dialog ───────────────────────────────────────────────────────

function LogoUploadDialog({
  company,
  onClose,
  onUploaded,
}: {
  company: Company;
  onClose: () => void;
  onUploaded: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("companyId", company.id);
      const r = await fetch(`${getApiBase()}/api/files/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!r.ok) throw new Error("Upload failed");
      const data = await r.json();
      const url: string = data.url ?? data.fileUrl ?? data.path ?? "";
      if (!url) throw new Error("No URL returned");
      // Patch company logo
      await safePatch(`/companies/${company.id}`, { logoUrl: url }, null);
      onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Upload Logo — {company.name}</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-sm text-muted-foreground hover:bg-muted/30"
        >
          {uploading ? (
            <span>Uploading...</span>
          ) : (
            <>
              <span className="text-2xl">↑</span>
              <span>Click to select image</span>
              <span className="text-xs">PNG, JPG, WEBP — max 5 MB</span>
            </>
          )}
        </div>
        {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

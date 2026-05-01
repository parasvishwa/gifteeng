"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Users,
  Package,
  Gift,
  CheckCircle2,
  ChevronRight,
  Search,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function getB2bToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("gifteeng.b2b.token") ??
    sessionStorage.getItem("gifteeng.b2b.token")
  );
}

async function b2bFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getB2bToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  title: string;
  basePrice: number;
  images?: { url: string; alt?: string }[];
  variants?: { id: string; label: string }[];
}

interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
}

interface Campaign {
  id: string;
  name: string;
  allocationPerEmployee?: number;
}

type PaymentMethod = "allocation" | "wallet" | "invoice";

// ── Step progress bar ──────────────────────────────────────────────────────────

const STEPS = [
  { n: 1 as const, label: "Choose Product", icon: Package },
  { n: 2 as const, label: "Choose Recipients", icon: Users },
  { n: 3 as const, label: "Review & Confirm", icon: Gift },
];

function StepBar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-4 mb-8">
      {STEPS.map(({ n, label, icon: Icon }) => (
        <div key={n} className="flex items-center gap-2 flex-1">
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-all shrink-0 ${
              current > n
                ? "bg-green-500 text-white"
                : current === n
                  ? "bg-primary text-white shadow-lg"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {current > n ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
          </div>
          <span
            className={`text-sm font-medium hidden sm:block ${
              current === n ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
          {n < 3 && (
            <div
              className={`flex-1 h-0.5 ${current > n ? "bg-green-500" : "bg-border"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Pure-CSS confetti ──────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "bg-red-400", "bg-yellow-400", "bg-green-400", "bg-blue-400",
  "bg-purple-400", "bg-pink-400", "bg-orange-400", "bg-teal-400",
  "bg-indigo-400", "bg-rose-400",
];

function Confetti() {
  const pieces = Array.from({ length: 20 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((i) => {
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const left = `${(i * 5) % 100}%`;
        const delay = `${(i * 0.15).toFixed(2)}s`;
        const size = i % 3 === 0 ? "h-4 w-4" : i % 3 === 1 ? "h-3 w-3" : "h-2 w-2";
        return (
          <div
            key={i}
            className={`absolute top-0 ${size} ${color} rounded-sm opacity-90`}
            style={{
              left,
              animationName: "confettiFall",
              animationDuration: `${1.2 + (i % 5) * 0.3}s`,
              animationTimingFunction: "linear",
              animationDelay: delay,
              animationFillMode: "forwards",
              transform: `rotate(${i * 17}deg)`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(340px) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BulkGiftsPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  // Step 2
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [giftMessages, setGiftMessages] = useState<Record<string, string>>({});
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("allocation");

  // Step 3
  const [submitting, setSubmitting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Load products
  useEffect(() => {
    b2bFetch<{ items?: Product[] }>("/api/products?b2bEnabled=true&pageSize=50")
      .then((d) => setProducts(d.items ?? []))
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, []);

  // Load employees + campaigns when entering step 2
  useEffect(() => {
    if (step !== 2) return;
    if (employees.length > 0) return;
    setEmployeesLoading(true);

    // Employees — API returns CompanyUser[] with fullName; normalise to name
    b2bFetch<{ id: string; fullName?: string; email: string; phone?: string; address?: Employee["address"] }[]>(
      "/api/companies/me/employees",
    )
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setEmployees(list.map((u) => ({ ...u, name: u.fullName ?? u.email })));
      })
      .catch(() => setEmployees([]))
      .finally(() => setEmployeesLoading(false));

    // Campaigns — API returns { id, title, status, perEmployeeAmount, ... }; normalise to our Campaign type
    b2bFetch<{ id: string; title?: string; name?: string; status?: string; perEmployeeAmount?: number | null; allocationPerEmployee?: number }[]>(
      "/api/campaigns",
    )
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        const normalised: Campaign[] = list
          .filter((c) => c.status === "active")
          .map((c) => ({
            id: c.id,
            name: c.title ?? c.name ?? c.id,
            allocationPerEmployee: c.perEmployeeAmount != null ? Number(c.perEmployeeAmount) : c.allocationPerEmployee,
          }));
        setCampaigns(normalised);
        if (normalised.length > 0) setSelectedCampaignId(normalised[0].id);
      })
      .catch(() => setCampaigns([]));
  }, [step, employees.length]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filteredProducts = products.filter((p) =>
    p.title.toLowerCase().includes(productSearch.toLowerCase()),
  );

  const filteredEmployees = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      e.email.toLowerCase().includes(employeeSearch.toLowerCase()),
  );

  const recipientCount = selectedEmployeeIds.size;
  const pricePerUnit = selectedProduct?.basePrice ?? 0;
  const totalCost = recipientCount * pricePerUnit;

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
  const allocationBudget =
    selectedCampaign?.allocationPerEmployee != null
      ? selectedCampaign.allocationPerEmployee * recipientCount
      : null;
  const overBudget =
    allocationBudget != null && paymentMethod === "allocation" && totalCost > allocationBudget;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function toggleEmployee(id: string) {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedEmployeeIds(new Set(filteredEmployees.map((e) => e.id)));
  }

  function deselectAll() {
    setSelectedEmployeeIds(new Set());
  }

  async function placeBulkOrder() {
    if (!selectedProduct) return;
    setOrderError(null);
    setSubmitting(true);

    const selectedEmployees = employees.filter((e) => selectedEmployeeIds.has(e.id));
    const recipients = selectedEmployees.map((e) => ({
      employeeId: e.id,
      deliveryAddress: e.address ?? {},
      giftMessage: giftMessages[e.id] ?? "",
    }));

    try {
      const body = {
        campaignId: selectedCampaignId || undefined,
        productId: selectedProduct.id,
        variantId: selectedVariantId,
        recipients,
        paymentMethod,
      };
      await b2bFetch<{ count?: number }>("/api/orders/bulk", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSuccessCount(recipientCount);
    } catch {
      setOrderError("Could not place bulk order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          B2B Feature
        </div>
        <h1 className="text-2xl font-bold">Bulk Gifting</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Send one gift to many employees in a single order — each delivered to their address.
        </p>
      </div>

      <StepBar current={step} />

      {/* ── STEP 1: Choose Product ── */}
      {step === 1 && (
        <div className="space-y-5 animate-fade-in">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Grid */}
          {productsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Package className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p>No B2B products found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredProducts.map((p) => {
                const rawImg = p.images?.[0]?.url ?? "";
                const img = rawImg && !rawImg.startsWith("http") ? `${API}${rawImg}` : rawImg;
                const isSelected = selectedProduct?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProduct(p);
                      setSelectedVariantId(null);
                    }}
                    className={`relative rounded-2xl border-2 overflow-hidden text-left transition-all ${
                      isSelected
                        ? "border-primary shadow-md ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="aspect-square bg-muted relative">
                      {img && (
                        <Image src={img} alt={p.title} fill className="object-cover" />
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold line-clamp-2">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">₹{p.basePrice}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Selected product card */}
          {selectedProduct && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-4">
              {selectedProduct.images?.[0]?.url && (
                <div className="h-14 w-14 rounded-lg overflow-hidden relative shrink-0 bg-muted">
                  <Image
                    src={selectedProduct.images[0].url.startsWith("http") ? selectedProduct.images[0].url : `${API}${selectedProduct.images[0].url}`}
                    alt={selectedProduct.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{selectedProduct.title}</p>
                <p className="text-sm text-primary font-medium">₹{selectedProduct.basePrice} / unit</p>
                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                  <div className="mt-2">
                    <label className="text-xs text-muted-foreground">Variant</label>
                    <select
                      className="ml-2 rounded border border-border bg-background text-xs px-2 py-1"
                      value={selectedVariantId ?? ""}
                      onChange={(e) => setSelectedVariantId(e.target.value || null)}
                    >
                      <option value="">— None —</option>
                      {selectedProduct.variants.map((v) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              disabled={!selectedProduct}
              onClick={() => setStep(2)}
              className="flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Choose Recipients ── */}
      {step === 2 && (
        <div className="space-y-5 animate-fade-in">
          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search employees…"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={selectAll}
              className="text-sm text-primary underline whitespace-nowrap"
            >
              Select All
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={deselectAll}
              className="text-sm text-muted-foreground underline whitespace-nowrap"
            >
              Deselect All
            </button>
            <span className="ml-auto text-sm text-muted-foreground whitespace-nowrap">
              <span className="font-semibold text-foreground">{recipientCount}</span> of {employees.length} selected
            </span>
          </div>

          {/* Employee table */}
          {employeesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p>No employees found.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-10 px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={
                          filteredEmployees.length > 0 &&
                          filteredEmployees.every((e) => selectedEmployeeIds.has(e.id))
                        }
                        onChange={(ev) => (ev.target.checked ? selectAll() : deselectAll())}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Address</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground w-24">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEmployees.map((emp) => {
                    const checked = selectedEmployeeIds.has(emp.id);
                    const expanded = expandedEmployee === emp.id;
                    return (
                      <>
                        <tr
                          key={emp.id}
                          className={`transition-colors ${checked ? "bg-primary/5" : "hover:bg-muted/30"}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEmployee(emp.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium">{emp.name}</td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{emp.email}</td>
                          <td className="px-4 py-3 text-muted-foreground hidden md:table-cell text-xs">
                            {emp.address
                              ? `${emp.address.line1}, ${emp.address.city}`
                              : <span className="text-amber-500">No address</span>}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setExpandedEmployee(expanded ? null : emp.id)}
                              className="text-xs text-primary underline"
                            >
                              {expanded ? "Hide" : "Add"}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${emp.id}-msg`} className="bg-muted/20">
                            <td />
                            <td colSpan={4} className="px-4 pb-3 pt-1">
                              <textarea
                                rows={2}
                                placeholder="Personal gift message for this employee…"
                                value={giftMessages[emp.id] ?? ""}
                                onChange={(e) =>
                                  setGiftMessages((prev) => ({ ...prev, [emp.id]: e.target.value }))
                                }
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Campaign + Payment + Budget */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">Campaign</label>
              <select
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">— No campaign —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Payment method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="allocation">Campaign Allocation</option>
                <option value="wallet">Wallet</option>
                <option value="invoice">Invoice</option>
              </select>
            </div>
          </div>

          {/* Budget summary */}
          {selectedProduct && (
            <div
              className={`rounded-xl border p-4 ${
                overBudget
                  ? "border-red-200 bg-red-50"
                  : "border-border bg-muted/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm">
                  <span className="font-semibold">{recipientCount}</span>
                  {" × "}
                  <span className="font-semibold">₹{pricePerUnit}</span>
                  {" = "}
                  <span className="text-base font-bold text-foreground">₹{totalCost.toLocaleString()}</span>
                </span>
                {allocationBudget != null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Budget: ₹{allocationBudget.toLocaleString()}
                  </span>
                )}
              </div>
              {overBudget && (
                <p className="mt-2 text-xs text-red-600 font-medium">
                  Total exceeds campaign allocation budget. Switch to Wallet or Invoice, or reduce recipients.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-3 rounded-full border text-sm font-medium hover:bg-muted transition-colors"
            >
              ← Back
            </button>
            <button
              disabled={recipientCount === 0}
              onClick={() => setStep(3)}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              Review Order <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Review & Confirm ── */}
      {step === 3 && (
        <div className="space-y-6 animate-fade-in">
          {successCount !== null ? (
            /* Success state */
            <div className="relative rounded-2xl border border-green-200 bg-green-50 p-10 text-center overflow-hidden">
              <Confetti />
              <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-green-500" />
              <h2 className="text-2xl font-bold text-green-700">
                {successCount} orders placed!
              </h2>
              <p className="mt-2 text-sm text-green-600">
                Each recipient will receive their gift at their registered address.
              </p>
              <Link
                href="/b2b/hr-admin"
                className="mt-6 inline-block rounded-full bg-green-600 px-7 py-3 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
              >
                Back to dashboard
              </Link>
            </div>
          ) : (
            /* Review summary */
            <>
              <div className="rounded-xl border p-6 space-y-5">
                <h2 className="text-lg font-semibold">Order Summary</h2>

                {/* Product */}
                <div className="flex items-start gap-4">
                  {selectedProduct?.images?.[0]?.url && (
                    <div className="h-16 w-16 rounded-xl overflow-hidden relative shrink-0 bg-muted">
                      <Image
                        src={selectedProduct.images[0].url.startsWith("http") ? selectedProduct.images[0].url : `${API}${selectedProduct.images[0].url}`}
                        alt={selectedProduct?.title ?? ""}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold">{selectedProduct?.title}</p>
                    {selectedVariantId && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Variant: {selectedProduct?.variants?.find((v) => v.id === selectedVariantId)?.label ?? selectedVariantId}
                      </p>
                    )}
                    <p className="text-sm text-primary font-medium mt-1">
                      ₹{pricePerUnit} / unit
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4 grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Recipients</span>
                    <p className="font-semibold mt-0.5">{recipientCount} employees</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total cost</span>
                    <p className="text-xl font-bold text-foreground mt-0.5">
                      ₹{totalCost.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Campaign</span>
                    <p className="font-semibold mt-0.5">
                      {selectedCampaign?.name ?? "None"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payment</span>
                    <p className="font-semibold mt-0.5 capitalize">{paymentMethod}</p>
                  </div>
                </div>

                {/* Recipients preview */}
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Recipients</p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {employees
                      .filter((e) => selectedEmployeeIds.has(e.id))
                      .map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          <span className="font-medium">{e.name}</span>
                          <span className="text-muted-foreground text-xs">{e.email}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>

              {orderError && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {orderError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 rounded-full border text-sm font-medium hover:bg-muted transition-colors"
                >
                  ← Back
                </button>
                <button
                  disabled={submitting}
                  onClick={() => void placeBulkOrder()}
                  className="flex-1 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {submitting ? "Placing orders…" : `Place Bulk Order (${recipientCount} recipients)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

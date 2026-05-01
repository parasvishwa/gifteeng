"use client";

import { use, useEffect, useState } from "react";
import { apiB2c } from "@/lib/api";

type Product = { id: string; title?: string };
type CatalogItem = { id: string; productId: string; product?: Product };
type Catalog = {
  id: string;
  slug: string;
  title: string;
  items: CatalogItem[];
};

type FormState = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  companyName: string;
  message: string;
  selectedProductIds: string[];
};

const initialForm: FormState = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  companyName: "",
  message: "",
  selectedProductIds: [],
};

export default function EnquirePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiB2c()
      .get<Catalog>(`/api/catalogs/${slug}`)
      .then((c) => {
        setCatalog(c);
      })
      .catch(() => setError("Could not load catalog"));
  }, [slug]);

  function toggleProduct(id: string) {
    setForm((f) => ({
      ...f,
      selectedProductIds: f.selectedProductIds.includes(id)
        ? f.selectedProductIds.filter((p) => p !== id)
        : [...f.selectedProductIds, id],
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiB2c().post("/api/catalogs/enquiries", {
        catalogSlug: slug,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone || undefined,
        companyName: form.companyName || undefined,
        message: form.message || undefined,
        requestedItems: form.selectedProductIds.map((productId) => ({ productId })),
      });
      setSubmitted(true);
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold">Thanks, we got your request!</h1>
        <p className="mt-4 text-muted-foreground">
          Our team will reach out at {form.contactEmail} shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">Request a quote</h1>
      {catalog && (
        <p className="mb-6 text-muted-foreground">Catalog: {catalog.title}</p>
      )}
      {error && <div className="mb-4 text-sm text-destructive">{error}</div>}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name" required>
          <input
            className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-foreground"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            required
          />
        </Field>
        <Field label="Email" required>
          <input
            type="email"
            className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-foreground"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            required
          />
        </Field>
        <Field label="Phone">
          <input
            className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-foreground"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
        </Field>
        <Field label="Company name">
          <input
            className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-foreground"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </Field>
        <Field label="Message">
          <textarea
            className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-foreground"
            rows={4}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </Field>

        {catalog && catalog.items.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium">Products of interest</label>
            <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-border bg-muted p-3 sm:grid-cols-2">
              {catalog.items.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.selectedProductIds.includes(item.productId)}
                    onChange={() => toggleProduct(item.productId)}
                  />
                  <span>{item.product?.title ?? item.productId}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[#EF3752] px-6 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit request"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiB2b } from "@/lib/api";

type Product = {
  id: string;
  slug: string;
  title: string;
  image?: string | null;
  images?: string[] | null;
};

type Catalog = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  heroImage?: string | null;
  products?: Product[] | null;
};

export default function SuperAdminCatalogEditorPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    apiB2b()
      .get<Catalog>(`/api/catalogs/${slug}`)
      .then((c) => {
        setCatalog(c);
        setTitle(c.title ?? "");
        setDescription(c.description ?? "");
        setHeroImage(c.heroImage ?? "");
        setProductIds((c.products ?? []).map((p) => p.id));
      })
      .catch(() => setError("Failed to load catalog"));
    apiB2b()
      .get<{ data?: Product[] } | Product[]>("/api/products?pageSize=200")
      .then((res) => setAllProducts(Array.isArray(res) ? res : (res.data ?? [])))
      .catch(() => {});
  }, [slug]);

  async function save() {
    if (!catalog) return;
    setSaving(true);
    setError(null);
    try {
      await apiB2b().patch(`/api/catalogs/${catalog.id}`, {
        title,
        description,
        heroImage,
        productIds,
      });
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function move(i: number, dir: -1 | 1) {
    setProductIds((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function toggle(id: string) {
    setProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const selectedProducts = productIds
    .map((id) => allProducts.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const searchLower = search.toLowerCase();
  const filtered = allProducts.filter(
    (p) => !search || p.title.toLowerCase().includes(searchLower),
  );

  if (!catalog) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/super-admin/catalogs"
          className="text-xs text-muted-foreground hover:underline"
        >
          &larr; Back to catalogs
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{catalog.title}</h1>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}
      {savedAt && <div className="text-xs text-muted-foreground">Saved at {savedAt}</div>}

      <div className="max-w-2xl space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
            Description
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-md border px-3 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">
            Hero image URL
          </span>
          <input
            value={heroImage}
            onChange={(e) => setHeroImage(e.target.value)}
            className="w-full rounded-md border px-3 py-1.5"
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Selected products ({selectedProducts.length})</h2>
          <div className="space-y-2 rounded-md border p-2">
            {selectedProducts.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No products selected.
              </div>
            ) : (
              selectedProducts.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm"
                >
                  <div className="flex-1 truncate">{p.title}</div>
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
                  >
                    Up
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === selectedProducts.length - 1}
                    className="rounded border px-2 py-0.5 text-xs disabled:opacity-30"
                  >
                    Down
                  </button>
                  <button
                    onClick={() => toggle(p.id)}
                    className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">All products</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="mb-2 w-full rounded-md border px-3 py-1.5 text-sm"
          />
          <div className="max-h-[500px] space-y-1 overflow-auto rounded-md border p-2">
            {filtered.map((p) => {
              const checked = productIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="flex-1 truncate">{p.title}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save catalog"}
        </button>
      </div>
    </div>
  );
}

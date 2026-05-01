"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Skeleton,
} from "@gifteeng/ui";
import { apiB2b } from "@/lib/api";
import { useCompany } from "../_components/CompanyContext";

type SettingsForm = {
  name: string;
  logoUrl: string;
  brandColor: string;
  billingEmail: string;
};

export default function SettingsPage() {
  const { company, loading, refresh } = useCompany();
  const [form, setForm] = useState<SettingsForm>({
    name: "",
    logoUrl: "",
    brandColor: "#000000",
    billingEmail: "",
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? "",
        logoUrl: company.logoUrl ?? "",
        brandColor: company.brandColor ?? "#000000",
        billingEmail: company.billingEmail ?? "",
      });
    }
  }, [company]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiB2b().patch("/api/companies/me", {
        name: form.name,
        logoUrl: form.logoUrl || null,
        brandColor: form.brandColor || null,
        billingEmail: form.billingEmail || null,
      });
      setSuccess("Settings saved");
      setTimeout(() => setSuccess(null), 3000);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Company branding and billing information"
      />

      {success ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-name">Company name</Label>
              <Input
                id="s-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-logo">Logo URL</Label>
              <Input
                id="s-logo"
                type="url"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-color">Brand color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="s-color"
                  type="color"
                  value={form.brandColor}
                  onChange={(e) =>
                    setForm({ ...form, brandColor: e.target.value })
                  }
                  className="h-10 w-20"
                />
                <Input
                  value={form.brandColor}
                  onChange={(e) =>
                    setForm({ ...form, brandColor: e.target.value })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-billing">Billing email</Label>
              <Input
                id="s-billing"
                type="email"
                value={form.billingEmail}
                onChange={(e) =>
                  setForm({ ...form, billingEmail: e.target.value })
                }
              />
            </div>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

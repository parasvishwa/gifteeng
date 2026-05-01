"use client";

import { useEffect, useState } from "react";
import { apiB2b } from "@/lib/api";
import { getB2bUser, type B2bUser } from "../../_components/JwtRole";

interface EmployeeProfile {
  id?: string;
  fullName?: string; // API field name (PATCH /api/auth/b2b/me expects fullName)
  email?: string;
  phone?: string;
  notificationPreferences?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
}

export default function EmployeeProfilePage() {
  const [user, setUser] = useState<B2bUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setUser(getB2bUser());
    async function load() {
      setLoading(true);
      try {
        const api = apiB2b();
        const res = await api
          .get<EmployeeProfile>("/api/auth/b2b/me")
          .catch(() => ({}) as EmployeeProfile);
        setProfile(res ?? {});
      } catch {
        setProfile({});
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const api = apiB2b();
      await api.patch("/api/auth/b2b/me", profile);
      setFlash("Profile updated");
    } catch {
      setError("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof EmployeeProfile>(
    key: K,
    value: EmployeeProfile[K]
  ) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function updatePref(key: "email" | "sms" | "push", value: boolean) {
    setProfile((prev) => ({
      ...prev,
      notificationPreferences: {
        ...(prev.notificationPreferences ?? {}),
        [key]: value,
      },
    }));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Profile</h1>
      {user && (
        <div className="mb-4 rounded-lg border bg-card p-4 text-sm">
          <div>
            <span className="text-muted-foreground">Email: </span>
            {user.email ?? profile.email ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Role: </span>
            {user.role}
          </div>
        </div>
      )}
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            type="text"
            value={profile.fullName ?? ""}
            onChange={(e) => updateField("fullName", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Phone</label>
          <input
            type="tel"
            value={profile.phone ?? ""}
            onChange={(e) => updateField("phone", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <fieldset className="rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">
            Notification preferences
          </legend>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!profile.notificationPreferences?.email}
                onChange={(e) => updatePref("email", e.target.checked)}
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!profile.notificationPreferences?.sms}
                onChange={(e) => updatePref("sms", e.target.checked)}
              />
              SMS
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!profile.notificationPreferences?.push}
                onChange={(e) => updatePref("push", e.target.checked)}
              />
              Push
            </label>
          </div>
        </fieldset>

        {flash && (
          <div className="rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
            {flash}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}

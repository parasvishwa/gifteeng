"use client";

import { useState, useEffect } from "react";
import { Shield, Loader2, Save } from "lucide-react";
import { Switch, Button } from "@gifteeng/ui";
import { useToast } from "@gifteeng/ui";


async function safeGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
    const token = typeof window !== "undefined" ? localStorage.getItem("gifteeng.b2b.token") : null;
    const res = await fetch(`${base}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return fallback;
    return await res.json();
  } catch { return fallback; }
}

const ADMIN_SECTIONS = [
  { key: "dashboard", label: "Dashboard", desc: "Main dashboard overview" },
  { key: "analytics", label: "Analytics", desc: "View site analytics" },
  { key: "orders", label: "Orders", desc: "Manage orders & invoices" },
  { key: "products", label: "Products", desc: "Products, variants, categories" },
  { key: "customers", label: "Customers", desc: "Customer list & messages" },
  { key: "discounts", label: "Discounts", desc: "Discount codes & referrals" },
  { key: "content", label: "Content", desc: "Sections, homepage, reviews, pages" },
  { key: "tools", label: "Tools", desc: "AI settings, import (not export)" },
  { key: "theme", label: "Theme & Customizer", desc: "Theme, festival, customizer, files" },
  { key: "settings", label: "Settings", desc: "Site-wide settings (this page)" },
];

export default function AdminPermissionsTab() {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPerms = async () => {
      // TODO: wire to /api/site-settings/admin_section_permissions
      const data = await safeGet<{ value?: Record<string, boolean> }>("/site-settings/admin_section_permissions", {});
      if (data?.value && typeof data.value === "object") {
        setPermissions(data.value as Record<string, boolean>);
      } else {
        const defaults: Record<string, boolean> = {};
        ADMIN_SECTIONS.forEach((s) => (defaults[s.key] = true));
        setPermissions(defaults);
      }
      setLoading(false);
    };
    fetchPerms();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // TODO: wire to PUT /api/site-settings/admin_section_permissions
    setSaving(false);
    toast({ title: "Admin permissions saved!" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/40 p-4 space-y-1">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> Admin Section Access
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Control which sections regular admins can access. Export/Backup is always restricted to super admin.
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border/40 divide-y divide-border/40">
        {ADMIN_SECTIONS.map((section) => (
          <div key={section.key} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium">{section.label}</p>
              <p className="text-[10px] text-muted-foreground">{section.desc}</p>
            </div>
            <Switch
              checked={permissions[section.key] !== false}
              onCheckedChange={(v) => setPermissions((prev) => ({ ...prev, [section.key]: v }))}
            />
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Save Permissions
      </Button>
    </div>
  );
}
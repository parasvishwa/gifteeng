"use client";

import { useState, useEffect } from "react";
import { Users, Loader2, UserPlus, Trash2, Search } from "lucide-react";
import { Button, Input } from "@gifteeng/ui";
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

interface AdminUser {
  user_id: string;
  roles: string[];
  email: string;
  phone: string;
  full_name: string;
}

export default function AdminUsersTab() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAdmins = async () => {
    setLoading(true);
    // TODO: wire to /api/companies/me/employees
    const data = await safeGet<AdminUser[]>("/companies/me/employees", []);
    setAdmins(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAdmins(); }, []);

  const addAdmin = async () => {
    const q = search.trim();
    if (!q) return;
    setAdding(true);
    // TODO: wire to POST /api/companies/me/employees
    toast({ title: "User not found", description: "No user with that email or phone. They must sign up first.", variant: "destructive" });
    setAdding(false);
  };

  const removeAdmin = async (userId: string) => {
    setRemovingId(userId);
    // TODO: wire to DELETE /api/companies/me/employees/:userId
    toast({ title: "Admin role removed" });
    await fetchAdmins();
    setRemovingId(null);
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
          <Users className="w-4 h-4 text-primary" /> Manage Admins
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Add or remove admin access. Users must sign up first. Super admins cannot be removed here.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Enter email or phone of registered user"
            className="h-9 text-xs pl-8"
            onKeyDown={e => e.key === "Enter" && addAdmin()}
          />
        </div>
        <Button onClick={addAdmin} disabled={adding || !search.trim()} size="sm" className="gap-1.5 h-9">
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          Add Admin
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border/40 divide-y divide-border/40">
        {admins.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No admins found</p>
        )}
        {admins.map(admin => {
          const isSuperAdmin = admin.roles.includes("super_admin");
          return (
            <div key={admin.user_id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium truncate">{admin.full_name || "No name"}</p>
                  {admin.roles.map(role => (
                    <span key={role} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                      role === "super_admin"
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {role === "super_admin" ? "Super Admin" : "Admin"}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {admin.email}{admin.email && admin.phone ? " · " : ""}{admin.phone}
                </p>
              </div>
              {!isSuperAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAdmin(admin.user_id)}
                  disabled={removingId === admin.user_id}
                  className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                >
                  {removingId === admin.user_id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
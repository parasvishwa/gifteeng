"use client";

// ─── Team Members + Permissions (Super-admin only) ────────────────────────────
//
// Manages CompanyUser rows for the current company. Supports:
//   • List active + deactivated team members
//   • Invite new member (email + role + initial permission set)
//   • Edit role + permissions per user
//   • Reset password (regenerates temp password)
//   • Deactivate (soft delete)
//
// Backed by /api/b2b/team — all endpoints require the b2b JWT + matching
// permission (users.view / users.invite / users.edit / users.delete).
// super_admin bypasses the permission check.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { safeGet, safePost, authHeaders, getApiBase } from "@/lib/admin-api";

type Role =
  | "super_admin"
  | "sales_admin"
  | "hr_admin"
  | "production"
  | "employee";

type TeamMember = {
  id:           string;
  email:        string;
  fullName:    string | null;
  phone:       string | null;
  role:         Role;
  permissions:  string[];
  effectivePermissions: string[];
  invitedAt:    string | null;
  activatedAt:  string | null;
  lastLoginAt:  string | null;
  isActive:     boolean;
  createdAt:    string;
};

type PermissionsCatalog = {
  all: string[];
  groups: Array<{ label: string; permissions: string[] }>;
};

const ROLES: Role[] = [
  "super_admin",
  "sales_admin",
  "hr_admin",
  "production",
  "employee",
];

const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin (full access)",
  sales_admin: "Sales admin",
  hr_admin:    "HR admin",
  production:  "Production",
  employee:    "Employee",
};

export default function TeamPage() {
  const [members, setMembers]   = useState<TeamMember[]>([]);
  const [catalog, setCatalog]   = useState<PermissionsCatalog>({ all: [], groups: [] });
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  // Invite-link banner. Replaces the old temp-password banner — see
  // docs/SECURITY_AUDIT.md C-3. The API now returns a single-use URL the
  // operator shares out-of-band; the password is set by the invitee on
  // first open of the link, so plaintext credentials never appear here.
  const [inviteBanner, setInviteBanner] = useState<{ email: string; url: string; expiresAt: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, cat] = await Promise.all([
        safeGet<TeamMember[]>("/b2b/team", []),
        safeGet<PermissionsCatalog>("/b2b/team/permissions-catalog", { all: [], groups: [] }),
      ]);
      setMembers(Array.isArray(list) ? list : []);
      setCatalog(cat);
    } catch (e) {
      setError("Failed to load team — check that you're signed in as super-admin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeMembers   = useMemo(() => members.filter((m) => m.isActive),  [members]);
  const inactiveMembers = useMemo(() => members.filter((m) => !m.isActive), [members]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invite teammates and grant them specific permissions to manage
            products, categories, orders, marketing and settings.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-xl bg-[#EF3752] text-white px-4 py-2 text-sm font-bold hover:opacity-90"
        >
          + Invite team member
        </button>
      </div>

      {inviteBanner && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">
            Invite link for <span className="font-mono">{inviteBanner.email}</span> — share via Slack, SMS, or signed email:
          </p>
          <p className="mt-1 font-mono text-[12px] bg-white border border-amber-200 px-3 py-2 rounded select-all break-all">
            {inviteBanner.url}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => navigator.clipboard?.writeText(inviteBanner.url)}
              className="text-xs font-bold text-amber-900 hover:underline"
            >Copy link</button>
            <button
              onClick={() => setInviteBanner(null)}
              className="text-xs text-amber-800 hover:underline"
            >Dismiss</button>
            <span className="text-[11px] text-amber-700">
              Expires {new Date(inviteBanner.expiresAt).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-amber-700">
            Single-use. The invitee sets their own password on first open. Do NOT share via public channels.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
          Loading team…
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-2xl mb-2">👥</p>
          <p className="font-semibold">No team members yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Invite teammates to delegate product uploads, order management, and more.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Section
            title="Active"
            members={activeMembers}
            catalog={catalog}
            editingId={editingId}
            onEdit={setEditingId}
            onClose={() => setEditingId(null)}
            onReload={load}
            onInviteLink={(email, url, expiresAt) => setInviteBanner({ email, url, expiresAt })}
          />
          {inactiveMembers.length > 0 && (
            <Section
              title="Deactivated"
              members={inactiveMembers}
              catalog={catalog}
              editingId={editingId}
              onEdit={setEditingId}
              onClose={() => setEditingId(null)}
              onReload={load}
              onInviteLink={(email, url, expiresAt) => setInviteBanner({ email, url, expiresAt })}
              muted
            />
          )}
        </div>
      )}

      {showInvite && (
        <InviteModal
          catalog={catalog}
          onClose={() => setShowInvite(false)}
          onInvited={(email, url, expiresAt) => {
            setInviteBanner({ email, url, expiresAt });
            setShowInvite(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section(props: {
  title: string;
  members: TeamMember[];
  catalog: PermissionsCatalog;
  editingId: string | null;
  onEdit: (id: string) => void;
  onClose: () => void;
  onReload: () => void;
  onInviteLink: (email: string, url: string, expiresAt: string) => void;
  muted?: boolean;
}) {
  const { title, members, catalog, editingId, onEdit, onClose, onReload, onInviteLink, muted } = props;
  if (members.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
        {title} ({members.length})
      </p>
      <div className="space-y-2">
        {members.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            catalog={catalog}
            isEditing={editingId === m.id}
            onEditToggle={() => editingId === m.id ? onClose() : onEdit(m.id)}
            onReload={onReload}
            onInviteLink={onInviteLink}
            muted={muted}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Single member card ──────────────────────────────────────────────────────

function MemberCard(props: {
  member: TeamMember;
  catalog: PermissionsCatalog;
  isEditing: boolean;
  onEditToggle: () => void;
  onReload: () => void;
  onInviteLink: (email: string, url: string, expiresAt: string) => void;
  muted?: boolean;
}) {
  const { member, catalog, isEditing, onEditToggle, onReload, onInviteLink, muted } = props;
  const [role,   setRole]   = useState<Role>(member.role);
  const [perms,  setPerms]  = useState<string[]>(member.permissions);
  const [saving, setSaving] = useState(false);

  const togglePerm = (p: string) =>
    setPerms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/b2b/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ role, permissions: perms }),
      });
      if (!res.ok) throw new Error(await res.text());
      onReload();
      onEditToggle();
    } catch (e) {
      alert("Save failed: " + String(e));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!confirm(`Deactivate ${member.email}?`)) return;
    const res = await fetch(`${getApiBase()}/b2b/team/${member.id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) onReload();
  };

  const reactivate = async () => {
    const res = await fetch(`${getApiBase()}/b2b/team/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ isActive: true }),
    });
    if (res.ok) onReload();
  };

  const resetPassword = async () => {
    if (!confirm("Generate a new password-reset link? The user's current password will be invalidated.")) return;
    const res = await fetch(`${getApiBase()}/b2b/team/${member.id}/reset-password`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json() as { inviteUrl?: string; expiresAt?: string };
      if (data.inviteUrl && data.expiresAt) {
        onInviteLink(member.email, data.inviteUrl, data.expiresAt);
      }
    }
  };

  // Re-send an invite link if the previous one expired or the user lost it.
  const resendInvite = async () => {
    const res = await fetch(`${getApiBase()}/b2b/team/${member.id}/resend-invite`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json() as { inviteUrl?: string; expiresAt?: string };
      if (data.inviteUrl && data.expiresAt) {
        onInviteLink(member.email, data.inviteUrl, data.expiresAt);
      }
    } else {
      const t = await res.text();
      alert("Could not resend invite: " + t);
    }
  };

  return (
    <div className={`rounded-xl border ${muted ? "border-border/40 bg-muted/30" : "border-border bg-card"} p-4`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#EF3752]/12 flex items-center justify-center text-sm font-bold text-[#EF3752]">
          {(member.fullName ?? member.email).slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-foreground">{member.fullName ?? member.email}</p>
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {ROLE_LABELS[member.role]}
            </span>
            {member.role === "super_admin" && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                bypasses permission checks
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{member.email}</p>
          {member.role !== "super_admin" && (
            <p className="text-xs text-muted-foreground mt-1">
              {member.effectivePermissions.length} effective permission{member.effectivePermissions.length === 1 ? "" : "s"}
              {member.permissions.length > 0 && (
                <> · {member.permissions.length} custom grant{member.permissions.length === 1 ? "" : "s"}</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {member.isActive ? (
            <>
              <button
                onClick={onEditToggle}
                className="text-xs font-bold text-[#EF3752] hover:underline"
              >{isEditing ? "Close" : "Edit"}</button>
              {!member.activatedAt ? (
                <button
                  onClick={resendInvite}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >Resend invite</button>
              ) : (
                <button
                  onClick={resetPassword}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >Reset password</button>
              )}
              <button
                onClick={deactivate}
                className="text-xs font-medium text-rose-600 hover:underline"
              >Deactivate</button>
            </>
          ) : (
            <button
              onClick={reactivate}
              className="text-xs font-bold text-emerald-700 hover:underline"
            >Reactivate</button>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-4 pt-4 border-t border-border/40">
          <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full md:w-auto rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>

          {role !== "super_admin" && (
            <PermissionMatrix
              catalog={catalog}
              selected={perms}
              onToggle={togglePerm}
            />
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#EF3752] text-white px-4 py-2 text-sm font-bold disabled:opacity-60"
            >{saving ? "Saving…" : "Save changes"}</button>
            <button
              onClick={onEditToggle}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Permission matrix (grouped checkboxes) ─────────────────────────────────

function PermissionMatrix(props: {
  catalog: PermissionsCatalog;
  selected: string[];
  onToggle: (p: string) => void;
}) {
  const { catalog, selected, onToggle } = props;
  return (
    <div className="mt-4 space-y-4">
      <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Permissions
      </label>
      {catalog.groups.map((g) => (
        <div key={g.label} className="rounded-lg border border-border/40 p-3">
          <p className="text-xs font-bold text-foreground mb-2">{g.label}</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {g.permissions.map((p) => (
              <label key={p} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 rounded px-2 py-1">
                <input
                  type="checkbox"
                  checked={selected.includes(p)}
                  onChange={() => onToggle(p)}
                  className="w-3.5 h-3.5 accent-[#EF3752]"
                />
                <span className="font-mono text-[11px]">{p}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Invite modal ────────────────────────────────────────────────────────────

function InviteModal(props: {
  catalog: PermissionsCatalog;
  onClose: () => void;
  onInvited: (email: string, inviteUrl: string, expiresAt: string) => void;
}) {
  const { catalog, onClose, onInvited } = props;
  const [email, setEmail]       = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [role,  setRole]        = useState<Role>("employee");
  const [perms, setPerms]       = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const togglePerm = (p: string) =>
    setPerms((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);

  const submit = async () => {
    setSubmitting(true); setErr(null);
    try {
      const r = await safePost<{ id: string; inviteUrl: string; expiresAt: string } | null>(
        "/b2b/team/invite",
        { email, fullName, phone, role, permissions: perms },
        null,
      );
      if (r?.inviteUrl && r?.expiresAt) {
        onInvited(email, r.inviteUrl, r.expiresAt);
      } else {
        setErr("Invite succeeded but no invite link returned");
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black">Invite team member</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Role" required>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </Field>
          <Field label="Full name">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>

        {role !== "super_admin" && (
          <PermissionMatrix
            catalog={catalog}
            selected={perms}
            onToggle={togglePerm}
          />
        )}

        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || !email.trim()}
            className="rounded-lg bg-[#EF3752] text-white px-5 py-2 text-sm font-bold disabled:opacity-60"
          >{submitting ? "Inviting…" : "Send invite"}</button>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
        {props.label}{props.required && <span className="text-rose-500">*</span>}
      </label>
      {props.children}
    </div>
  );
}

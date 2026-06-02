"use client";

import { useEffect, useState } from "react";

export type B2bRole =
  | "super_admin"
  | "sales_admin"
  | "hr_admin"
  | "production"
  | "employee";

export type B2bUser = {
  companyUserId: string;
  companyId: string;
  role: B2bRole;
  email?: string;
  fullName?: string;
  /// Effective permissions for this user — merged from role defaults and
  /// per-user grants on the server. Populated by /auth/b2b/me on first load.
  /// Empty until /me responds; super_admin role bypasses checks entirely.
  permissions?: string[];
};

const TOKEN_KEY = "gifteeng.b2b.token";

function base64UrlDecode(input: string): string | null {
  try {
    const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
    const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    if (typeof window === "undefined") {
      // Node fallback (should not run in client components, but keeps TS safe)
      return Buffer.from(b64, "base64").toString("utf-8");
    }
    return window.atob(b64);
  } catch {
    return null;
  }
}

type JwtPayload = {
  sub?: string;
  companyUserId?: string;
  companyId?: string;
  role?: string;
  email?: string;
  fullName?: string;
  name?: string;
  exp?: number;
};

function decodeToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadSegment = parts[1];
  if (!payloadSegment) return null;
  const json = base64UrlDecode(payloadSegment);
  if (!json) return null;
  try {
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function getB2bToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setB2bToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `b2b_auth=1; Path=/; SameSite=Lax; Max-Age=2592000${secure}`;
  } catch {
    // ignore
  }
}

export function clearB2bToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    document.cookie = "b2b_auth=; Path=/; SameSite=Lax; Max-Age=0";
  } catch {
    // ignore
  }
}

function isValidRole(role: unknown): role is B2bRole {
  return (
    role === "super_admin" ||
    role === "sales_admin" ||
    role === "hr_admin" ||
    role === "production" ||
    role === "employee"
  );
}

export function getB2bUser(): B2bUser | null {
  const token = getB2bToken();
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) {
    clearB2bToken();
    return null;
  }
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    clearB2bToken();
    return null;
  }
  if (!isValidRole(payload.role)) {
    return null;
  }
  const companyUserId = payload.companyUserId ?? payload.sub ?? "";
  const companyId = payload.companyId ?? "";
  return {
    companyUserId,
    companyId,
    role: payload.role,
    email: payload.email,
    fullName: payload.fullName ?? payload.name,
  };
}

export function isB2bAuthenticated(): boolean {
  return getB2bUser() !== null;
}

export function hasRole(role: B2bRole | B2bRole[]): boolean {
  const user = getB2bUser();
  if (!user) return false;
  const roles = Array.isArray(role) ? role : [role];
  return roles.includes(user.role);
}

/// Check if a B2bUser has at least one of the listed permission strings.
/// super_admin always returns true. Empty `required` list always returns true.
export function userHasPermission(
  user: { role: B2bRole; permissions?: string[] | null } | null | undefined,
  required: string | string[],
): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  const req = Array.isArray(required) ? required : [required];
  if (req.length === 0) return true;
  const grants = user.permissions ?? [];
  return req.some((p) => grants.includes(p));
}

export function roleLandingPath(role: B2bRole | null | undefined): string {
  switch (role) {
    case "super_admin":
    case "sales_admin":
      return "/super-admin";
    case "hr_admin":
      return "/hr-admin";
    case "production":
      return "/production/queue";
    case "employee":
      return "/employee/store";
    default:
      return "/";
  }
}

export type UseB2bAuth = {
  user: B2bUser | null;
  isLoading: boolean;
  signOut: () => void;
};

export function useB2bAuth(): UseB2bAuth {
  const [user, setUser] = useState<B2bUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fromToken = getB2bUser();
    if (!fromToken) {
      // Clear presence cookie so middleware redirects to login on next navigation.
      document.cookie = "b2b_auth=; Path=/; SameSite=Lax; Max-Age=0";
    }
    setUser(fromToken);
    setIsLoading(false);

    // Older tokens may not carry email/fullName. Hydrate from /auth/b2b/me
    // so the sidebar never has to fall back to the raw UUID.
    if (fromToken) {
      const token = getB2bToken();
      if (!token) return;
      // Always hydrate from /me to pick up the latest permissions array —
      // tokens don't carry permissions (so revokes apply instantly).
      fetch("/api/auth/b2b/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { email?: string; fullName?: string; permissions?: string[] } | null) => {
          if (!data) return;
          setUser((u) => (u ? {
            ...u,
            email:       data.email       ?? u.email,
            fullName:    data.fullName    ?? u.fullName,
            permissions: data.permissions ?? u.permissions,
          } : u));
        })
        .catch(() => { /* ignore — token-only fields will still render */ });
    }
  }, []);

  const signOut = (): void => {
    clearB2bToken();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return { user, isLoading, signOut };
}

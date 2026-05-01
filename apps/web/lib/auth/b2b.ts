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
  } catch {
    // ignore
  }
}

export function clearB2bToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
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
    setUser(getB2bUser());
    setIsLoading(false);
  }, []);

  const signOut = (): void => {
    clearB2bToken();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return { user, isLoading, signOut };
}

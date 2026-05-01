"use client";

export type B2bRole =
  | "super_admin"
  | "sales_admin"
  | "hr_admin"
  | "production"
  | "employee";

export interface B2bUser {
  companyUserId: string;
  companyId: string;
  role: B2bRole;
  email?: string;
}

const TOKEN_KEY = "gifteeng.b2b.token";

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  if (typeof window === "undefined") return "";
  try {
    return window.atob(b64);
  } catch {
    return "";
  }
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function decode(): Record<string, unknown> | null {
  const token = readToken();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const json = base64UrlDecode(parts[1]!);
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getB2bRole(): B2bRole | null {
  const payload = decode();
  if (!payload) return null;
  const role = payload["role"];
  if (typeof role !== "string") return null;
  return role as B2bRole;
}

export function getB2bUser(): B2bUser | null {
  const payload = decode();
  if (!payload) return null;
  const role = payload["role"];
  const companyUserId =
    (payload["companyUserId"] as string | undefined) ??
    (payload["sub"] as string | undefined) ??
    "";
  const companyId = (payload["companyId"] as string | undefined) ?? "";
  const email = payload["email"] as string | undefined;
  if (typeof role !== "string") return null;
  return {
    companyUserId,
    companyId,
    role: role as B2bRole,
    email,
  };
}

export function clearB2bToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function roleLandingPath(role: B2bRole | null): string {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "sales_admin":
      return "/super-admin";
    case "hr_admin":
      return "/hr-admin";
    case "production":
      return "/production";
    case "employee":
      return "/employee";
    default:
      return "/";
  }
}

/**
 * Shared utilities for all super-admin pages.
 * Import these instead of copy-pasting safeGet/safePost in every file.
 */

export const ADMIN_API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000");

export function adminAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("gifteeng.b2b.token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Centralised 401 handler — redirect to the B2B login page once, with
 * the current location captured as ?redirect= so we can come back here
 * after re-auth. Called by adminGet/adminPost/etc when they see a 401.
 *
 * Idempotent within a single tab — sets a sessionStorage flag so we
 * don't bounce in a redirect loop if multiple in-flight requests
 * happen to all 401 at once.
 */
function redirectToLoginOnce() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem("gifteeng.b2b.redirecting") === "1") return;
  sessionStorage.setItem("gifteeng.b2b.redirecting", "1");
  // Drop stale token so the login page doesn't think we're authed.
  localStorage.removeItem("gifteeng.b2b.token");
  const here = window.location.pathname + window.location.search;
  // Don't loop if we're already on the login page.
  if (here.startsWith("/b2b/login")) {
    sessionStorage.removeItem("gifteeng.b2b.redirecting");
    return;
  }
  window.location.href = `/b2b/login?redirect=${encodeURIComponent(here)}`;
}

export async function adminGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${ADMIN_API_BASE}/api${path}`, { headers: adminAuthHeaders() });
    if (r.status === 401) { redirectToLoginOnce(); return fallback; }
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export async function adminPost<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${ADMIN_API_BASE}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (r.status === 401) { redirectToLoginOnce(); return fallback; }
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export async function adminPatch<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${ADMIN_API_BASE}/api${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (r.status === 401) { redirectToLoginOnce(); return fallback; }
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export async function adminPut<T>(path: string, body: unknown, fallback: T): Promise<T> {
  try {
    const r = await fetch(`${ADMIN_API_BASE}/api${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (r.status === 401) { redirectToLoginOnce(); return fallback; }
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export async function adminDelete<T>(path: string, fallback: T, body?: unknown): Promise<T> {
  try {
    const r = await fetch(`${ADMIN_API_BASE}/api${path}`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (r.status === 401) { redirectToLoginOnce(); return fallback; }
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * Upload a single file to the /files/upload endpoint.
 * Returns the server-resolved URL (signed path), absolute for cross-host use.
 * Throws on failure so callers can surface a toast.
 */
export async function adminUploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${ADMIN_API_BASE}/api/files/upload`, {
    method: "POST",
    headers: adminAuthHeaders(),
    body: fd,
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => r.statusText);
    throw new Error(msg || `Upload failed (${r.status})`);
  }
  const data = await r.json();
  const raw: string =
    data?.url ?? data?.fileUrl ?? data?.path ?? data?.data?.url ?? "";
  if (!raw) throw new Error("Upload response missing URL");
  // Make absolute when API is on a different host.
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${ADMIN_API_BASE}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/** Throws on non-OK, returns parsed JSON. Use when you want real error handling. */
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${ADMIN_API_BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...adminAuthHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => r.statusText);
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

// ── Backwards-compat aliases (drop-in for copy-pasted stubs in pages) ────────
// Pages call getApiBase() as a function, so we export a thin wrapper.
export function getApiBase(): string { return ADMIN_API_BASE; }
export { adminAuthHeaders as authHeaders };
export { adminGet     as safeGet    };
export { adminPost    as safePost   };
export { adminPatch   as safePatch  };
export { adminDelete  as safeDelete };

// ── Lightweight toast (no dep on UI package) ───────────────────────────────

type ToastType = "success" | "error" | "info";

function showToast(message: string, type: ToastType = "info", duration = 3000) {
  if (typeof document === "undefined") return;

  const id = `admin-toast-${Date.now()}`;
  const colors: Record<ToastType, string> = {
    success: "bg-emerald-600",
    error: "bg-red-600",
    info: "bg-primary",
  };

  const el = document.createElement("div");
  el.id = id;
  el.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:99999;
    display:flex;align-items:center;gap:8px;
    padding:10px 16px;border-radius:10px;
    font-size:13px;font-weight:600;color:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,0.15);
    animation:adminToastIn .2s ease;
    pointer-events:none;
  `;
  el.className = colors[type];
  el.textContent = message;

  // inject keyframe once
  if (!document.getElementById("admin-toast-style")) {
    const s = document.createElement("style");
    s.id = "admin-toast-style";
    s.textContent = `
      @keyframes adminToastIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes adminToastOut { from { opacity:1; } to { opacity:0; transform:translateY(-8px); } }
    `;
    document.head.appendChild(s);
  }

  document.body.appendChild(el);
  setTimeout(() => {
    el.style.animation = "adminToastOut .2s ease forwards";
    setTimeout(() => el.remove(), 250);
  }, duration);
}

export const adminToast = {
  success: (msg: string) => showToast(msg, "success"),
  error: (msg: string) => showToast(msg, "error"),
  info: (msg: string) => showToast(msg, "info"),
};

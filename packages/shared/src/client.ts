/**
 * Tiny typed fetch client for the Gifteeng API.
 * Consumed by apps/web (server + client) and — via codegen — apps/mobile.
 */

export type ApiClientOptions = {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  audience?: "b2c" | "b2b";
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `API ${status}`);
  }
}

export function createApiClient(opts: ApiClientOptions) {
  async function request<T>(
    path: string,
    init?: RequestInit & { query?: Record<string, unknown> },
  ): Promise<T> {
    const url = new URL(path, opts.baseUrl);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    }
    const token = (await opts.getToken?.()) ?? null;
    const res = await fetch(url.toString(), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.audience ? { "X-Audience": opts.audience } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new ApiError(res.status, body);
    return body as T;
  }

  return {
    request,
    get: <T>(path: string, query?: Record<string, unknown>) =>
      request<T>(path, { method: "GET", query }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

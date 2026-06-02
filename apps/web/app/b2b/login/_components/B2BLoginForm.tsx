"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { apiB2b } from "@/lib/api";
import { setB2bToken, getB2bUser, roleLandingPath } from "@/lib/auth/b2b";
import { Loader2, Mail, Lock, ChevronRight } from "lucide-react";

interface LoginResponse {
  accessToken?: string;
  token?: string;
}

export function B2BLoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || !password) { setError("Email and password are required"); return; }
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const res = await api.post<LoginResponse>("/api/auth/b2b/login", { email, password });
      const token = res.accessToken ?? res.token;
      if (!token) { setError("Login failed: no token returned"); setLoading(false); return; }
      setB2bToken(token);
      const user = getB2bUser();
      const returnTo = searchParams?.get("returnTo");
      const target = returnTo && returnTo.startsWith("/") ? returnTo : roleLandingPath(user?.role ?? null);
      window.location.href = target;
    } catch {
      setError("Invalid email or password");
      setLoading(false);
    }
  }

  return (
    <div
      className="relative w-full max-w-sm rounded-3xl p-8"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {/* Top gradient line */}
      <div
        className="absolute top-0 left-8 right-8 h-[1px] rounded-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(236,72,153,0.6), rgba(245,158,11,0.4), transparent)" }}
      />

      {/* Logo + badge */}
      <div className="mb-7 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/main-logo.svg" alt="Gifteeng" className="h-10 mb-4" />
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black tracking-widest uppercase mb-4"
          style={{
            background: "linear-gradient(135deg, rgba(20,184,166,0.15) 0%, rgba(20,184,166,0.08) 100%)",
            border: "1px solid rgba(20,184,166,0.3)",
            color: "#2dd4bf",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
          Business Portal
        </span>
        <h1 className="text-xl font-black text-white leading-tight">Sign in to your account</h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Access your Gifteeng corporate dashboard
        </p>
      </div>

      {/* Form */}
      <form className="space-y-4" onSubmit={onSubmit} noValidate>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Work Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "rgba(255,255,255,0.25)" }} />
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/20 outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(236,72,153,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236,72,153,0.1)"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "rgba(255,255,255,0.25)" }} />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/20 outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(236,72,153,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(236,72,153,0.1)"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}
          >
            <span className="text-base">⚠️</span>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 mt-2"
          style={{
            background: loading ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #ec4899 0%, #f59e0b 100%)",
            boxShadow: loading ? "none" : "0 0 24px rgba(236,72,153,0.3)",
          }}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
          ) : (
            <>Sign in <ChevronRight className="h-4 w-4" /></>
          )}
        </button>
      </form>

      {/* Footer */}
      <div className="mt-6 flex items-center justify-between text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
        <a href="mailto:support@gifteeng.com" className="hover:text-white/60 transition-colors">
          Forgot password?
        </a>
        <a href="mailto:sales@gifteeng.com" className="hover:text-white/60 transition-colors">
          Contact sales →
        </a>
      </div>
    </div>
  );
}

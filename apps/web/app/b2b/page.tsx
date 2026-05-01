"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@gifteeng/ui";
import { apiB2b } from "@/lib/api";
import {
  setB2bToken,
  getB2bUser,
  roleLandingPath,
} from "@/lib/auth/b2b";

interface LoginResponse {
  accessToken?: string;
  token?: string;
  audience?: string;
  expiresIn?: number;
}

export default function B2BLoginPage() {
  return (
    <Suspense fallback={null}>
      <B2BLoginForm />
    </Suspense>
  );
}

function B2BLoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const res = await api.post<LoginResponse>("/api/auth/b2b/login", {
        email,
        password,
      });
      const token = res.accessToken ?? res.token;
      if (!token) {
        setError("Login failed: no token returned");
        setLoading(false);
        return;
      }
      setB2bToken(token);
      const user = getB2bUser();
      const returnTo = searchParams?.get("returnTo");
      const target =
        returnTo && returnTo.startsWith("/")
          ? returnTo
          : roleLandingPath(user?.role ?? null);
      // Full page reload so the B2B layout's useB2bAuth remounts and reads the
      // fresh token from localStorage. router.replace would keep the cached
      // `user=null` state in the outer layout and bounce us back to /.
      if (typeof window !== "undefined") {
        window.location.href = target;
      }
    } catch {
      setError("Invalid email or password");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Business portal sign-in</CardTitle>
          <CardDescription>
            Access your Gifteeng corporate account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <a
                href="#"
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Forgot password?
              </a>
              <a
                href="#"
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Don&apos;t have an account? Contact sales.
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

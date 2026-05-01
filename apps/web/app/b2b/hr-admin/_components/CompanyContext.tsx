"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiB2b } from "@/lib/api";
import { useB2bAuth } from "@/lib/auth/b2b";

export type Company = {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  billingEmail?: string | null;
};

type CompanyContextValue = {
  company: Company | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useB2bAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const api = apiB2b();
      const data = await api.get<Company>("/api/companies/me");
      setCompany(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load company";
      setError(msg);
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      setCompany(null);
      setError("Not authenticated");
      return;
    }
    void refresh();
  }, [authLoading, user, refresh]);

  const value = useMemo<CompanyContextValue>(
    () => ({ company, loading, error, refresh }),
    [company, loading, error, refresh],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error("useCompany must be used within CompanyProvider");
  }
  return ctx;
}

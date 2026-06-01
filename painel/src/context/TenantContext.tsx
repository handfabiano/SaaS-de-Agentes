// src/context/TenantContext.tsx
// Carrega os tenants do usuário logado (via tenant_members + join em tenants) e
// mantém o tenant ATIVO. Todo o resto do painel filtra por esse tenant_id.
// O papel (admin | operador) do usuário NO tenant ativo controla permissões.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import type { MembershipWithTenant, Papel, Tenant } from "../lib/database.types";

const STORAGE_KEY = "painel.tenantAtivo";

interface TenantValue {
  loading: boolean;
  error: string | null;
  memberships: MembershipWithTenant[];
  tenants: Tenant[];
  activeTenant: Tenant | null;
  /** Papel do usuário NO tenant ativo. */
  papel: Papel | null;
  isAdmin: boolean;
  setActiveTenant: (id: string) => void;
  reload: () => void;
}

const TenantContext = createContext<TenantValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<MembershipWithTenant[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("tenant_members")
      .select("tenant_id, user_id, papel, tenants(id, nome, slug, plano, ativo)")
      .order("created_at", { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as MembershipWithTenant[];
    setMemberships(rows);

    // Garante um tenant ativo válido.
    setActiveId((current) => {
      const valid = current && rows.some((r) => r.tenant_id === current);
      return valid ? current : rows[0]?.tenant_id ?? null;
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMemberships([]);
      setActiveId(null);
      setLoading(false);
      return;
    }
    void load();
  }, [user, load]);

  const setActiveTenant = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<TenantValue>(() => {
    const active = memberships.find((m) => m.tenant_id === activeId) ?? null;
    const papel = active?.papel ?? null;
    return {
      loading,
      error,
      memberships,
      tenants: memberships.map((m) => m.tenants),
      activeTenant: active?.tenants ?? null,
      papel,
      isAdmin: papel === "admin",
      setActiveTenant,
      reload: () => void load(),
    };
  }, [memberships, activeId, loading, error, setActiveTenant, load]);

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): TenantValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant deve ser usado dentro de <TenantProvider>");
  return ctx;
}

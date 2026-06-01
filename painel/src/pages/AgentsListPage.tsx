// src/pages/AgentsListPage.tsx
// Lista os agentes do tenant ativo. Loading (skeleton) / vazio / erro.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTenant } from "../context/TenantContext";
import type { Agent } from "../lib/database.types";
import { modelLabel, templateLabel } from "../lib/constants";
import { formatDate } from "../lib/format";
import { PageHead } from "../components/layout/PageHead";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState, ErrorState, SkeletonRows } from "../components/ui/States";

export function AgentsListPage() {
  const { activeTenant, isAdmin } = useTenant();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTenant) return;
    setStatus("loading");
    setError(null);
    const { data, error: err } = await supabase
      .from("agents")
      .select(
        "id, tenant_id, nome, template, system_prompt, modelo, temperatura, ferramentas_ativas, ativo, created_at, updated_at"
      )
      .eq("tenant_id", activeTenant.id)
      .order("updated_at", { ascending: false });

    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setAgents((data ?? []) as Agent[]);
    setStatus("ok");
  }, [activeTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const novo = (
    <Button
      onClick={() => navigate("/agentes/novo")}
      disabled={!isAdmin}
      title={isAdmin ? undefined : "Apenas administradores podem criar agentes"}
      icon={<span aria-hidden>＋</span>}
    >
      Novo agente
    </Button>
  );

  return (
    <div className="page">
      <PageHead
        title="Agentes"
        subtitle={
          activeTenant
            ? `Agentes configurados em ${activeTenant.nome}`
            : "Selecione um tenant"
        }
        actions={novo}
      />

      <div className="card">
        {status === "loading" && <SkeletonRows rows={5} />}

        {status === "error" && (
          <ErrorState
            description={error ?? undefined}
            onRetry={() => void load()}
          />
        )}

        {status === "ok" && agents.length === 0 && (
          <EmptyState
            title="Nenhum agente ainda"
            description="Crie o primeiro agente para começar a atender."
            action={isAdmin ? novo : undefined}
          />
        )}

        {status === "ok" && agents.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Template</th>
                <th>Modelo</th>
                <th className="t-center">Ferramentas</th>
                <th>Status</th>
                <th>Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr
                  key={a.id}
                  className="table__row--click"
                  onClick={() => navigate(`/agentes/${a.id}`)}
                >
                  <td className="t-strong">{a.nome}</td>
                  <td>
                    <Badge tone="clay">{templateLabel(a.template)}</Badge>
                  </td>
                  <td className="t-muted">{modelLabel(a.modelo)}</td>
                  <td className="t-center t-muted">
                    {a.ferramentas_ativas?.length ?? 0}
                  </td>
                  <td>
                    {a.ativo ? (
                      <Badge tone="ok">● Ativo</Badge>
                    ) : (
                      <Badge tone="neutral">○ Inativo</Badge>
                    )}
                  </td>
                  <td className="t-muted">{formatDate(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

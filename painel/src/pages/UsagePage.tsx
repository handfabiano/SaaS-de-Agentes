// src/pages/UsagePage.tsx
// Dashboard de uso: leitura agregada de usage_events do tenant ativo.
// Cards de topo, gráfico de custo por dia e tabela de consumo por agente.
//
// Agregação feita no cliente sobre o período selecionado (7/30 dias). Para
// volumes grandes, prefira uma view/RPC de agregação no Supabase (ver README).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTenant } from "../context/TenantContext";
import type { UsageEvent } from "../lib/database.types";
import { formatMoney, formatNumber } from "../lib/format";
import { PageHead } from "../components/layout/PageHead";
import { BarChart, type BarDatum } from "../components/charts/BarChart";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";

type Periodo = 7 | 30;

export function UsagePage() {
  const { activeTenant } = useTenant();
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [agents, setAgents] = useState<Map<string, string>>(new Map());
  const [periodo, setPeriodo] = useState<Periodo>(7);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTenant) return;
    setStatus("loading");
    setError(null);

    const desde = new Date();
    desde.setDate(desde.getDate() - (periodo - 1));
    desde.setHours(0, 0, 0, 0);

    const [usageRes, agentsRes] = await Promise.all([
      supabase
        .from("usage_events")
        .select(
          "id, tenant_id, agent_id, modelo, input_tokens, output_tokens, cache_read_tokens, custo_estimado, created_at"
        )
        .eq("tenant_id", activeTenant.id)
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: true }),
      supabase.from("agents").select("id, nome").eq("tenant_id", activeTenant.id),
    ]);

    if (usageRes.error) {
      setError(usageRes.error.message);
      setStatus("error");
      return;
    }
    setEvents((usageRes.data ?? []) as UsageEvent[]);
    if (!agentsRes.error) {
      const m = new Map<string, string>();
      (agentsRes.data ?? []).forEach((a: { id: string; nome: string }) =>
        m.set(a.id, a.nome)
      );
      setAgents(m);
    }
    setStatus("ok");
  }, [activeTenant, periodo]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- Agregações ----
  const totals = useMemo(() => {
    return events.reduce(
      (acc, e) => {
        acc.input += e.input_tokens;
        acc.output += e.output_tokens;
        acc.cache += e.cache_read_tokens;
        acc.custo += Number(e.custo_estimado);
        return acc;
      },
      { input: 0, output: 0, cache: 0, custo: 0 }
    );
  }, [events]);

  const porDia = useMemo<BarDatum[]>(() => {
    const dias: BarDatum[] = [];
    const byKey = new Map<string, number>();
    for (const e of events) {
      const key = e.created_at.slice(0, 10);
      byKey.set(key, (byKey.get(key) ?? 0) + Number(e.custo_estimado));
    }
    for (let i = periodo - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dias.push({
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }),
        tick: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        value: byKey.get(key) ?? 0,
      });
    }
    return dias;
  }, [events, periodo]);

  const porAgente = useMemo(() => {
    const map = new Map<
      string,
      { custo: number; input: number; output: number }
    >();
    for (const e of events) {
      const key = e.agent_id ?? "—";
      const cur = map.get(key) ?? { custo: 0, input: 0, output: 0 };
      cur.custo += Number(e.custo_estimado);
      cur.input += e.input_tokens;
      cur.output += e.output_tokens;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([agentId, v]) => ({
        agentId,
        nome: agents.get(agentId) ?? "Sem agente",
        ...v,
      }))
      .sort((a, b) => b.custo - a.custo);
  }, [events, agents]);

  const periodoSwitch = (
    <div className="seg seg--inline">
      {([7, 30] as Periodo[]).map((p) => (
        <button
          key={p}
          className={`seg__btn ${periodo === p ? "is-active" : ""}`}
          onClick={() => setPeriodo(p)}
        >
          {p} dias
        </button>
      ))}
    </div>
  );

  const vazio = status === "ok" && events.length === 0;

  return (
    <div className="page">
      <PageHead
        title="Uso"
        subtitle="Consumo de tokens e custo estimado do tenant."
        actions={periodoSwitch}
      />

      {status === "error" ? (
        <div className="card">
          <ErrorState description={error ?? undefined} onRetry={() => void load()} />
        </div>
      ) : (
        <>
          {/* Cards de topo */}
          <div className="stat-grid">
            <StatCard
              label="Custo estimado"
              value={status === "loading" ? null : formatMoney(totals.custo)}
              accent
            />
            <StatCard
              label="Tokens de entrada"
              value={status === "loading" ? null : formatNumber(totals.input)}
            />
            <StatCard
              label="Tokens de saída"
              value={status === "loading" ? null : formatNumber(totals.output)}
            />
            <StatCard
              label="Cache (leitura)"
              value={status === "loading" ? null : formatNumber(totals.cache)}
            />
          </div>

          {vazio ? (
            <div className="card">
              <EmptyState
                icon="📊"
                title="Sem uso registrado ainda"
                description="Quando os agentes processarem mensagens, o consumo aparece aqui."
              />
            </div>
          ) : (
            <>
              {/* Gráfico de custo por dia */}
              <div className="card panel">
                <div className="panel__head">
                  <h3 className="panel__title">Custo por dia</h3>
                  <span className="t-muted">Últimos {periodo} dias (USD)</span>
                </div>
                {status === "loading" ? (
                  <Skeleton height={200} radius={10} />
                ) : (
                  <BarChart data={porDia} format={formatMoney} />
                )}
              </div>

              {/* Tabela por agente */}
              <div className="card panel">
                <div className="panel__head">
                  <h3 className="panel__title">Consumo por agente</h3>
                </div>
                {status === "loading" ? (
                  <Skeleton height={120} radius={10} />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Agente</th>
                        <th className="t-right">Entrada</th>
                        <th className="t-right">Saída</th>
                        <th className="t-right">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porAgente.map((r) => (
                        <tr key={r.agentId}>
                          <td className="t-strong">{r.nome}</td>
                          <td className="t-right t-muted">{formatNumber(r.input)}</td>
                          <td className="t-right t-muted">{formatNumber(r.output)}</td>
                          <td className="t-right t-strong">{formatMoney(r.custo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: boolean;
}) {
  return (
    <div className={`card stat ${accent ? "stat--accent" : ""}`}>
      <span className="stat__label">{label}</span>
      {value === null ? (
        <Skeleton height={28} width="60%" />
      ) : (
        <span className="stat__value">{value}</span>
      )}
    </div>
  );
}

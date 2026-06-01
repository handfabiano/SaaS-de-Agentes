// src/pages/ConversationsPage.tsx
// Lista conversas do tenant (mais recentes primeiro), com filtro por status e por
// agente. Clique abre um drawer com as mensagens em ordem cronológica.
// Conversas "escalada" são destacadas (precisam de atenção humana).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useTenant } from "../context/TenantContext";
import type {
  Agent,
  Conversation,
  ConversaStatus,
  Message,
} from "../lib/database.types";
import { formatDateTime, timeAgo } from "../lib/format";
import { PageHead } from "../components/layout/PageHead";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { EmptyState, ErrorState, SkeletonRows, Spinner } from "../components/ui/States";

const STATUS_FILTERS: { value: "" | ConversaStatus; label: string }[] = [
  { value: "", label: "Todos os status" },
  { value: "aberta", label: "Abertas" },
  { value: "escalada", label: "Escaladas" },
  { value: "encerrada", label: "Encerradas" },
];

export function ConversationsPage() {
  const { activeTenant } = useTenant();
  const [conversas, setConversas] = useState<Conversation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const [fStatus, setFStatus] = useState<"" | ConversaStatus>("");
  const [fAgent, setFAgent] = useState<string>("");
  const [open, setOpen] = useState<Conversation | null>(null);

  const agentNome = useMemo(() => {
    const map = new Map<string, string>();
    agents.forEach((a) => map.set(a.id, a.nome));
    return map;
  }, [agents]);

  const load = useCallback(async () => {
    if (!activeTenant) return;
    setStatus("loading");
    setError(null);

    let query = supabase
      .from("conversations")
      .select("id, tenant_id, agent_id, canal, contato_externo, status, created_at")
      .eq("tenant_id", activeTenant.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (fStatus) query = query.eq("status", fStatus);
    if (fAgent) query = query.eq("agent_id", fAgent);

    const [convRes, agentsRes] = await Promise.all([
      query,
      supabase
        .from("agents")
        .select("id, nome")
        .eq("tenant_id", activeTenant.id),
    ]);

    if (convRes.error) {
      setError(convRes.error.message);
      setStatus("error");
      return;
    }
    setConversas((convRes.data ?? []) as Conversation[]);
    if (!agentsRes.error) setAgents((agentsRes.data ?? []) as Agent[]);
    setStatus("ok");
  }, [activeTenant, fStatus, fAgent]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <PageHead
        title="Conversas"
        subtitle="Atendimentos do tenant — escaladas em destaque."
      />

      <div className="filters">
        <select
          className="input select filter-select"
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value as "" | ConversaStatus)}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="input select filter-select"
          value={fAgent}
          onChange={(e) => setFAgent(e.target.value)}
        >
          <option value="">Todos os agentes</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {status === "loading" && <SkeletonRows rows={6} />}
        {status === "error" && (
          <ErrorState description={error ?? undefined} onRetry={() => void load()} />
        )}
        {status === "ok" && conversas.length === 0 && (
          <EmptyState
            icon="💬"
            title="Nenhuma conversa"
            description="Quando os agentes começarem a atender, as conversas aparecem aqui."
          />
        )}
        {status === "ok" && conversas.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Canal</th>
                <th>Contato</th>
                <th>Agente</th>
                <th>Status</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {conversas.map((c) => (
                <tr
                  key={c.id}
                  className={`table__row--click ${
                    c.status === "escalada" ? "row--escalada" : ""
                  }`}
                  onClick={() => setOpen(c)}
                >
                  <td>
                    <Badge tone="neutral">{c.canal}</Badge>
                  </td>
                  <td className="t-strong">{c.contato_externo ?? "—"}</td>
                  <td className="t-muted">{agentNome.get(c.agent_id) ?? "—"}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="t-muted" title={formatDateTime(c.created_at)}>
                    {timeAgo(c.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <ConversationDrawer
          conversation={open}
          agentNome={agentNome.get(open.agent_id)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ConversaStatus }) {
  if (status === "escalada") return <Badge tone="ember">⚠ Escalada</Badge>;
  if (status === "aberta") return <Badge tone="moss">● Aberta</Badge>;
  return <Badge tone="neutral">Encerrada</Badge>;
}

/* ------------------------------------------------------------------ */

function ConversationDrawer({
  conversation,
  agentNome,
  onClose,
}: {
  conversation: Conversation;
  agentNome?: string;
  onClose: () => void;
}) {
  const { activeTenant } = useTenant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTenant) return;
    setState("loading");
    setError(null);
    const { data, error: err } = await supabase
      .from("messages")
      .select("id, conversation_id, papel, conteudo, created_at")
      .eq("conversation_id", conversation.id)
      .eq("tenant_id", activeTenant.id)
      .order("created_at", { ascending: true });
    if (err) {
      setError(err.message);
      setState("error");
      return;
    }
    setMessages((data ?? []) as Message[]);
    setState("ok");
  }, [conversation.id, activeTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal
      open
      onClose={onClose}
      variant="side"
      title={
        <span className="drawer-title">
          {conversation.contato_externo ?? "Conversa"}
          <span className="drawer-title__sub">
            {agentNome ? `${agentNome} · ` : ""}
            {conversation.canal}
          </span>
        </span>
      }
    >
      <div className="conv-meta">
        <StatusBadge status={conversation.status} />
        <span className="t-muted">{formatDateTime(conversation.created_at)}</span>
      </div>

      {state === "loading" && <Spinner label="Carregando mensagens…" />}
      {state === "error" && (
        <ErrorState description={error ?? undefined} onRetry={() => void load()} />
      )}
      {state === "ok" && messages.length === 0 && (
        <EmptyState icon="💬" title="Sem mensagens" />
      )}
      {state === "ok" && messages.length > 0 && (
        <div className="chat">
          {messages.map((m) => (
            <div key={m.id} className={`bubble bubble--${m.papel}`}>
              <span className="bubble__role">{papelLabel(m.papel)}</span>
              <p className="bubble__text">{m.conteudo}</p>
              <span className="bubble__time">{formatDateTime(m.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function papelLabel(papel: Message["papel"]): string {
  switch (papel) {
    case "user":
      return "Contato";
    case "assistant":
      return "Agente";
    case "tool":
      return "Ferramenta";
    default:
      return papel;
  }
}

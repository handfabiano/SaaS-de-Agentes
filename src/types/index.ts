// src/types/index.ts
// Tipos centrais do motor de agente. Compartilhados entre backend e (se quiser) front.

import type Anthropic from "@anthropic-ai/sdk";

/** Configuração de um agente, vinda da tabela `agents` no Supabase. */
export interface AgentConfig {
  id: string;
  tenantId: string;
  nome: string;
  template: string | null;
  systemPrompt: string;
  modelo: string;
  temperatura: number;
  ferramentasAtivas: string[];
}

/** Contexto de uma execução do agente (uma volta do loop atendendo um contato). */
export interface RunContext {
  tenantId: string;
  agentId: string;
  conversationId: string;
  /** Cliente Supabase com service_role (backend ignora RLS, mas valida tenant à mão). */
  // deixamos como unknown aqui para não acoplar o tipo do supabase-js neste arquivo
  db: SupabaseLike;
  /** Configs de integração por tenant (whatsapp, crm...), já resolvidas. */
  toolConfigs: Record<string, Record<string, unknown>>;
}

/** Subconjunto mínimo do cliente Supabase que usamos — facilita testar com mock. */
export interface SupabaseLike {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (table: string) => {
    insert: (rows: unknown) => Promise<{ error: { message: string } | null }>;
  };
}

/** Resultado da execução de uma ferramenta. */
export interface ToolResult {
  /** Texto que volta pro modelo como tool_result. */
  content: string;
  /** Se true, sinaliza que a conversa deve escalar pra humano. */
  escalar?: boolean;
}

/** Definição de uma ferramenta plugável. O `schema` é o formato que o modelo recebe. */
export interface ToolDefinition {
  schema: Anthropic.Tool;
  /** Implementação. Recebe os args já parseados e o contexto da execução. */
  execute: (
    input: Record<string, unknown>,
    ctx: RunContext
  ) => Promise<ToolResult>;
}

/** Tokens consumidos numa chamada, para gravar em usage_events. */
export interface UsageDelta {
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

// src/lib/usage.ts
// Registra consumo de tokens por tenant. Base da sua margem e do billing.

import type { RunContext, UsageDelta } from "../types/index.ts";

/**
 * Tabela de preços por modelo (USD por 1M tokens). AJUSTE com os valores
 * oficiais atuais antes de cobrar de cliente — estes são placeholders.
 */
const PRECO_POR_MILHAO: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-opus-4-8": { input: 15, output: 75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheRead: 0.08 },
};

export function calcularCusto(u: UsageDelta): number {
  const p = PRECO_POR_MILHAO[u.modelo];
  if (!p) return 0;
  const M = 1_000_000;
  return (
    (u.inputTokens * p.input) / M +
    (u.outputTokens * p.output) / M +
    (u.cacheReadTokens * p.cacheRead) / M
  );
}

/** Grava um evento de uso. Falha aqui não deve derrubar a resposta ao usuário. */
export async function registrarUso(
  ctx: RunContext,
  u: UsageDelta
): Promise<void> {
  const custo = calcularCusto(u);
  const { error } = await ctx.db.from("usage_events").insert({
    tenant_id: ctx.tenantId,
    agent_id: ctx.agentId,
    conversation_id: ctx.conversationId,
    modelo: u.modelo,
    input_tokens: u.inputTokens,
    output_tokens: u.outputTokens,
    cache_read_tokens: u.cacheReadTokens,
    custo_estimado: custo,
  });
  if (error) console.error("[usage] falha ao gravar usage_event:", error.message);
}

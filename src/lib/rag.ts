// src/lib/rag.ts
// Recupera trechos relevantes da base de conhecimento do agente (RAG).
// O embedding aqui é um ponto de integração: troque `embedText` pelo seu provedor
// de embeddings (Voyage, OpenAI, etc.). O importante é a dimensão bater com o schema.

import type { RunContext } from "../types/index.ts";

/**
 * Gera o embedding da consulta. STUB: substitua pela chamada real ao seu
 * provedor de embeddings. A dimensão DEVE bater com vector(N) no schema (1536).
 */
export async function embedText(_texto: string): Promise<number[]> {
  // TODO: integrar provedor de embeddings real.
  // Retornamos um vetor de zeros só para o código ser tipável/testável.
  return new Array(1536).fill(0);
}

export interface Chunk {
  id: string;
  conteudo: string;
  similaridade: number;
}

/**
 * Busca os trechos mais relevantes para a pergunta, isolados por tenant + agente.
 * Usa a função SQL match_chunks (que recebe p_tenant_id explícito).
 */
export async function buscarContexto(
  pergunta: string,
  ctx: RunContext,
  matchCount = 5
): Promise<Chunk[]> {
  const embedding = await embedText(pergunta);
  const { data, error } = await ctx.db.rpc("match_chunks", {
    p_tenant_id: ctx.tenantId,
    p_agent_id: ctx.agentId,
    p_query_embedding: embedding,
    p_match_count: matchCount,
  });
  if (error) {
    // RAG é best-effort: se falhar, o agente segue sem contexto extra.
    console.error("[rag] match_chunks falhou:", error.message);
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data as Chunk[];
}

/** Monta um bloco de contexto para injetar no system prompt. */
export function formatarContexto(chunks: Chunk[]): string {
  if (chunks.length === 0) return "";
  const trechos = chunks
    .map((c, i) => `[Fonte ${i + 1}]\n${c.conteudo}`)
    .join("\n\n");
  return (
    "\n\nBase de conhecimento (use apenas o que for relevante e cite a fonte):\n" +
    trechos
  );
}

// src/lib/rag.ts
// Recupera trechos relevantes da base de conhecimento do agente (RAG).
// O embedding usa o provedor configurado em src/lib/embeddings.ts (OpenAI/Voyage,
// via env). A dimensão DEVE bater com vector(N) no schema.

import type { RunContext } from "../types/index.ts";
import { embedOne, getEmbeddingsConfig } from "./embeddings.ts";

/**
 * Gera o embedding da pergunta para busca. Retorna null se não houver provedor
 * configurado (RAG fica desligado, mas o agente segue respondendo).
 */
export async function embedText(texto: string): Promise<number[] | null> {
  const cfg = getEmbeddingsConfig();
  if (!cfg) return null;
  try {
    return await embedOne(texto, cfg, "query");
  } catch (e) {
    console.error("[rag] embedText falhou:", e instanceof Error ? e.message : e);
    return null;
  }
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
  if (!embedding) return []; // sem provedor de embeddings → sem RAG (best-effort)
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

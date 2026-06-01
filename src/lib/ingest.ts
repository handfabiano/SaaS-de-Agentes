// src/lib/ingest.ts
// Pipeline de ingestão de documentos (FASE 2.3): texto → chunks → embeddings →
// linhas em knowledge_chunks. Agnóstico de runtime: recebe `embed` e
// `inserirChunks` como deps (testável sem rede; usado pela Edge Function).

import { chunkText, type ChunkOptions } from "./chunk.ts";

export interface ChunkRow {
  tenant_id: string;
  agent_id: string;
  source_id: string;
  conteudo: string;
  embedding: number[];
}

export interface IngestInput {
  tenantId: string;
  agentId: string;
  sourceId: string;
  texto: string;
}

export interface IngestDeps {
  /** Gera embeddings para vários textos (mesma ordem da entrada). */
  embed: (texts: string[]) => Promise<number[][]>;
  /** Persiste as linhas de chunk (com embedding). */
  inserirChunks: (rows: ChunkRow[]) => Promise<void>;
}

export interface IngestResult {
  chunks: number;
}

/**
 * Divide o texto, gera embeddings (em lotes) e insere os chunks.
 * Lança se a quantidade de embeddings não casar com a de chunks.
 */
export async function ingerirDocumento(
  input: IngestInput,
  deps: IngestDeps,
  opts: ChunkOptions & { batchSize?: number } = {}
): Promise<IngestResult> {
  const trechos = chunkText(input.texto, opts);
  if (trechos.length === 0) return { chunks: 0 };

  const batchSize = opts.batchSize ?? 64;
  let inseridos = 0;

  for (let i = 0; i < trechos.length; i += batchSize) {
    const lote = trechos.slice(i, i + batchSize);
    const vetores = await deps.embed(lote);
    if (vetores.length !== lote.length) {
      throw new Error(
        `ingest: ${vetores.length} embeddings para ${lote.length} chunks (esperado igual)`
      );
    }
    const rows: ChunkRow[] = lote.map((conteudo, j) => ({
      tenant_id: input.tenantId,
      agent_id: input.agentId,
      source_id: input.sourceId,
      conteudo,
      embedding: vetores[j],
    }));
    await deps.inserirChunks(rows);
    inseridos += rows.length;
  }

  return { chunks: inseridos };
}

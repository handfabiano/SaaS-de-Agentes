// src/lib/embeddings.ts
// Provedor de embeddings plugável (OpenAI ou Voyage). Escolhido por env:
//   EMBEDDINGS_PROVIDER = openai | voyage   (default: openai)
//   EMBEDDINGS_MODEL    = ex. text-embedding-3-small | voyage-3
//   EMBEDDINGS_DIM      = (opcional) dimensão de saída — DEVE bater com vector(N) no schema
//   OPENAI_API_KEY / VOYAGE_API_KEY
//
// IMPORTANTE: a dimensão retornada precisa casar com `vector(N)` em
// knowledge_chunks e em match_chunks. Default = 1536 (text-embedding-3-small).

import { getEnv } from "./env.ts";

export interface EmbeddingsConfig {
  provider: "openai" | "voyage";
  model: string;
  apiKey: string;
  /** Dimensão de saída (OpenAI permite reduzir; Voyage depende do modelo). */
  dimensions?: number;
}

const DEFAULTS = {
  openai: { model: "text-embedding-3-small", dim: 1536 },
  voyage: { model: "voyage-3", dim: 1024 },
};

/** Monta a config a partir do ambiente. Retorna null se não houver API key. */
export function getEmbeddingsConfig(): EmbeddingsConfig | null {
  const provider = (getEnv("EMBEDDINGS_PROVIDER") ?? "openai").toLowerCase() as
    | "openai"
    | "voyage";
  const apiKey =
    provider === "voyage"
      ? getEnv("VOYAGE_API_KEY") ?? ""
      : getEnv("OPENAI_API_KEY") ?? "";
  if (!apiKey) return null;

  const model = getEnv("EMBEDDINGS_MODEL") ?? DEFAULTS[provider].model;
  const dimEnv = getEnv("EMBEDDINGS_DIM");
  const dimensions = dimEnv ? Number(dimEnv) : DEFAULTS[provider].dim;
  return { provider, model, apiKey, dimensions };
}

/** Dimensão esperada pela config (para validar contra o schema). */
export function expectedDimension(cfg: EmbeddingsConfig): number {
  return cfg.dimensions ?? DEFAULTS[cfg.provider].dim;
}

/** Gera embeddings para uma lista de textos. Lança em erro de rede/API. */
export async function embedTexts(
  texts: string[],
  cfg: EmbeddingsConfig,
  inputType: "document" | "query" = "document"
): Promise<number[][]> {
  if (texts.length === 0) return [];
  return cfg.provider === "voyage"
    ? embedVoyage(texts, cfg, inputType)
    : embedOpenAI(texts, cfg);
}

/** Gera o embedding de um único texto. */
export async function embedOne(
  text: string,
  cfg: EmbeddingsConfig,
  inputType: "document" | "query" = "query"
): Promise<number[]> {
  const [v] = await embedTexts([text], cfg, inputType);
  return v;
}

async function embedOpenAI(
  texts: string[],
  cfg: EmbeddingsConfig
): Promise<number[][]> {
  const body: Record<string, unknown> = { model: cfg.model, input: texts };
  if (cfg.dimensions) body.dimensions = cfg.dimensions;

  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`OpenAI embeddings ${resp.status}: ${await safeText(resp)}`);
  }
  const json = (await resp.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

async function embedVoyage(
  texts: string[],
  cfg: EmbeddingsConfig,
  inputType: "document" | "query"
): Promise<number[][]> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    input: texts,
    input_type: inputType,
  };
  if (cfg.dimensions) body.output_dimension = cfg.dimensions;

  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Voyage embeddings ${resp.status}: ${await safeText(resp)}`);
  }
  const json = (await resp.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

async function safeText(resp: Response): Promise<string> {
  try {
    return (await resp.text()).slice(0, 300);
  } catch {
    return "";
  }
}

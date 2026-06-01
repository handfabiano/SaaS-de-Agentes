// supabase/functions/indexar-documento/index.ts
// Edge Function (Deno) — pipeline de ingestão chamado pelo painel ao adicionar um
// documento à base de conhecimento. Faz: texto → chunks → embeddings →
// knowledge_chunks. NADA de embeddings no cliente; tudo acontece aqui.
//
// Payload (do painel):
//   { source_id, agent_id, tenant_id, tipo: "texto"|"arquivo",
//     conteudo?, arquivo_base64?, filename?, mime? }
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          EMBEDDINGS_PROVIDER, EMBEDDINGS_MODEL, OPENAI_API_KEY|VOYAGE_API_KEY
//
// Deploy: supabase functions deploy indexar-documento

import { createClient } from "@supabase/supabase-js";
import { getEmbeddingsConfig, embedTexts } from "../../../src/lib/embeddings.ts";
import { ingerirDocumento, type ChunkRow } from "../../../src/lib/ingest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Extrai texto do payload. Suporta texto colado e arquivos de texto (txt/md). */
function extrairTexto(body: Record<string, unknown>): string {
  const tipo = String(body.tipo ?? "texto");
  if (tipo === "texto") return String(body.conteudo ?? "");

  // arquivo: decodifica base64
  const b64 = String(body.arquivo_base64 ?? "");
  if (!b64) return "";
  const mime = String(body.mime ?? "");
  const nome = String(body.filename ?? "").toLowerCase();
  const ehTexto =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    nome.endsWith(".txt") ||
    nome.endsWith(".md");
  if (!ehTexto) {
    // PDF e outros binários precisam de extração dedicada — sinalizamos.
    throw new Error(
      `tipo de arquivo não suportado para extração no backend (${mime || nome}). ` +
        "Suportados agora: .txt, .md, texto colado."
    );
  }
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ status: "erro", detalhe: "use POST" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ status: "erro", detalhe: "json inválido" }, 400);
  }

  const sourceId = String(body.source_id ?? "");
  const agentId = String(body.agent_id ?? "");
  const tenantId = String(body.tenant_id ?? "");
  if (!sourceId || !agentId || !tenantId) {
    return json({ status: "erro", detalhe: "source_id, agent_id e tenant_id são obrigatórios" }, 400);
  }

  const cfg = getEmbeddingsConfig();
  if (!cfg) {
    return json(
      { status: "erro", detalhe: "embeddings não configurado (defina OPENAI_API_KEY ou VOYAGE_API_KEY)" },
      500
    );
  }

  let texto: string;
  try {
    texto = extrairTexto(body);
  } catch (e) {
    return json({ status: "erro", detalhe: e instanceof Error ? e.message : String(e) }, 422);
  }
  if (!texto.trim()) {
    return json({ status: "erro", detalhe: "documento sem texto" }, 422);
  }

  try {
    const { chunks } = await ingerirDocumento(
      { tenantId, agentId, sourceId, texto },
      {
        embed: (texts) => embedTexts(texts, cfg, "document"),
        inserirChunks: async (rows: ChunkRow[]) => {
          const { error } = await supabase.from("knowledge_chunks").insert(rows);
          if (error) throw new Error(error.message);
        },
      }
    );
    console.log(`[indexar-documento] source=${sourceId} chunks=${chunks}`);
    return json({ status: "ok", chunks }, 200);
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    console.error(`[indexar-documento] erro: ${detalhe}`);
    return json({ status: "erro", detalhe }, 500);
  }
});

// src/lib/ingest.smoke.ts
// Teste de fumaça SEM rede do pipeline de ingestão: usa embed fake e captura os
// chunks inseridos. Valida chunking, batelada e formato das linhas.
// Rodar com: npx tsx src/lib/ingest.smoke.ts

import { chunkText } from "./chunk.ts";
import { ingerirDocumento, type ChunkRow } from "./ingest.ts";

const DIM = 1536;

async function main() {
  let falhou = false;
  const check = (cond: boolean, nome: string) => {
    console.log(`${cond ? "✅" : "❌"} ${nome}`);
    if (!cond) falhou = true;
  };

  // chunking básico
  const texto = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} ` + "lorem ipsus ".repeat(20)).join("\n\n");
  const trechos = chunkText(texto, { maxChars: 800, overlap: 100 });
  check(trechos.length > 1, "texto longo vira múltiplos chunks");
  check(trechos.every((t) => t.length <= 1000), "chunks respeitam ~maxChars (+overlap)");
  check(chunkText("", {}).length === 0, "texto vazio → 0 chunks");

  // pipeline com embed fake (vetor determinístico) + captura de inserts
  const inseridos: ChunkRow[] = [];
  const res = await ingerirDocumento(
    { tenantId: "t1", agentId: "a1", sourceId: "s1", texto },
    {
      embed: async (texts) => texts.map(() => new Array(DIM).fill(0.01)),
      inserirChunks: async (rows) => {
        inseridos.push(...rows);
      },
    },
    { maxChars: 800, overlap: 100, batchSize: 4 }
  );

  check(res.chunks === trechos.length, "ingere todos os chunks");
  check(inseridos.length === res.chunks, "insere uma linha por chunk");
  check(
    inseridos.every(
      (r) =>
        r.tenant_id === "t1" &&
        r.agent_id === "a1" &&
        r.source_id === "s1" &&
        Array.isArray(r.embedding) &&
        r.embedding.length === DIM &&
        typeof r.conteudo === "string"
    ),
    "linhas têm tenant/agent/source + embedding na dimensão certa"
  );

  console.log(falhou ? "\n❌ INGEST SMOKE FALHOU" : "\n✅ INGEST SMOKE PASSOU");
  if (falhou) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

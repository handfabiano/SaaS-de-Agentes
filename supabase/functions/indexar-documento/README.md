# Edge Function: `indexar-documento`

Pipeline de ingestão da base de conhecimento (FASE 2.3). Chamada pelo **painel**
ao adicionar um documento. Faz: **texto → chunks → embeddings → `knowledge_chunks`**.
Nada de embeddings no cliente.

```
Painel (Adicionar documento) → invoke("indexar-documento")
   → extrai texto → chunkText → embedTexts (OpenAI/Voyage) → insert knowledge_chunks
```

## Payload

```json
{
  "source_id": "<uuid de knowledge_sources>",
  "agent_id":  "<uuid do agente>",
  "tenant_id": "<uuid do tenant>",
  "tipo": "texto" | "arquivo",
  "conteudo": "texto colado (quando tipo=texto)",
  "arquivo_base64": "... (quando tipo=arquivo)",
  "filename": "faq.md",
  "mime": "text/markdown"
}
```

Suporte de arquivo agora: **.txt, .md e texto colado**. PDF/binários precisam de
extração dedicada (TODO) — a função retorna `422` com mensagem clara.

## Secrets (Edge Functions → Secrets)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
EMBEDDINGS_PROVIDER        # openai (default) | voyage
EMBEDDINGS_MODEL           # text-embedding-3-small | voyage-3 | ...
OPENAI_API_KEY             # ou VOYAGE_API_KEY
# EMBEDDINGS_DIM           # opcional; DEVE bater com vector(N) no schema
```

> A dimensão dos embeddings **precisa casar** com `vector(N)` em
> `knowledge_chunks` e `match_chunks`. Default 1536 (OpenAI `text-embedding-3-small`).
> Para Voyage (1024), ajuste o schema antes.

## Deploy

```bash
supabase functions deploy indexar-documento
```

## Validar

```bash
curl -i -X POST "https://<PROJECT_REF>.functions.supabase.co/indexar-documento" \
  -H "content-type: application/json" \
  -d '{
    "source_id":"<SOURCE_ID>","agent_id":"<AGENT_ID>","tenant_id":"<TENANT_ID>",
    "tipo":"texto","conteudo":"Prazo de inscrição: até 10/06. Local: ginásio central."
  }'
```

Esperado: `200` `{"status":"ok","chunks":N}`. Confira linhas em `knowledge_chunks`
e teste a recuperação chamando `match_chunks` (ou conversando com o agente).

## Teste offline (sem rede)

```bash
npx tsx src/lib/ingest.smoke.ts   # chunking + pipeline com embed fake
```

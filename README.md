# SaaS de Agentes

Motor de agente de IA **multi-tenant**: a lógica é a mesma, o que muda por cliente
são dados (system prompt, base de conhecimento, ferramentas, integrações). Inclui
painel de administração, motor do agente e webhook de WhatsApp.

## Estrutura do repositório

```
schema_agente_saas_v2.sql        Schema multi-tenant (Postgres/Supabase) + RLS + pgvector
sql/
  seed_primeiro_tenant.sql       Cria 1 tenant e vincula um usuário como admin

src/                             Motor do agente (TypeScript — roda em Node e Deno)
  types/                         Tipos centrais (AgentConfig, RunContext, ToolDefinition)
  agent/loop.ts                  Loop central (RAG → modelo → tool-calling → usage)
  tools/registry.ts              Catálogo de ferramentas plugáveis
  lib/rag.ts                     RAG via match_chunks (embedText é ponto de integração)
  lib/usage.ts                   Cálculo de custo + gravação em usage_events
  webhook/                       Camada de webhook (agnóstica de canal)
    parse.ts                     Normaliza payload do Evolution
    handler.ts                   Fluxo: idempotência → conversa → agente → resposta
    deps.supabase.ts             Funções de dados sobre supabase-js (FASE 3)
    send.ts                      Envio via Evolution (sendText)
    *.smoke.ts                   Testes de fumaça sem rede

supabase/functions/
  whatsapp-webhook/              Edge Function (Deno) que pluga o webhook no motor

painel/                          Painel admin (React + Vite + Supabase) — ver painel/README.md
```

## Rodar / validar (sem rede)

```bash
npm install
npm run typecheck
npx tsx src/agent/loop.smoke.ts        # loop do agente
npx tsx src/webhook/handler.smoke.ts   # fluxo do webhook
```

## Caminho de produção (resumo)

1. Aplicar `schema_agente_saas_v2.sql` no Supabase + `sql/seed_primeiro_tenant.sql`.
2. Implementar `embedText` real em `src/lib/rag.ts` (destrava o RAG).
3. Deploy do `whatsapp-webhook` + apontar a instância Evolution (ver a README da função).
4. Painel admin (`painel/`) — já pronto.

## Pendências de integração (TODO no código)

- `embedText` em `src/lib/rag.ts`: ligar provedor de embeddings real (dim. deve bater com `vector(N)` no schema).
- Preços em `src/lib/usage.ts`: confirmar valores oficiais antes de cobrar.
- Segredos da Evolution: migrar de `tool_configs.config` para o **Supabase Vault**.
- Billing (Stripe) e Instagram: ainda não implementados neste repo.

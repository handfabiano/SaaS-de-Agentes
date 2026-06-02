# Edge Function: `whatsapp-webhook`

Recebe o webhook do **Evolution API** (evento `MESSAGES_UPSERT`), normaliza a
mensagem e delega ao handler agnóstico de canal, que roda o agente e responde
pelo próprio WhatsApp.

```
Evolution → POST /whatsapp-webhook → parseEvolution → processarMensagem(deps)
                                                          ├─ idempotência (external_id)
                                                          ├─ obtém/cria conversa
                                                          ├─ carrega histórico
                                                          ├─ runAgent (RAG → modelo → tools → usage)
                                                          ├─ grava mensagens
                                                          ├─ envia resposta (Evolution sendText)
                                                          └─ marca escalada (se preciso)
```

## 1. Secrets (Edge Functions → Secrets)

```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WHATSAPP_WEBHOOK_SECRET   # (FASE 8) segredo compartilhado p/ proteger o endpoint
```

## 2. Deploy

O Evolution não envia JWT do Supabase, então deploy **sem verificação de JWT** — a
proteção é feita pelo nosso segredo compartilhado:

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

### Proteções embutidas (FASE 8)

- **Segredo compartilhado:** se `WHATSAPP_WEBHOOK_SECRET` estiver definido, a função
  exige `?secret=<valor>` na URL **ou** o header `x-webhook-secret`. Sem ele → `401`.
  (Se não definir o secret, a função fica aberta e loga um aviso.)
- **Rate limit por contato:** no máximo **20 mensagens / 60 s** por conversa; acima
  disso a mensagem é descartada (`status: rate_limited`) **sem chamar o modelo**.

> A função importa o motor de `../../../src` (fora de `supabase/functions/`). O
> bundler do Supabase segue esses imports. Se a sua versão do CLI reclamar, rode
> com o import map explícito: `--import-map supabase/functions/whatsapp-webhook/deno.json`.

## 3. Mapear instância Evolution → agente (`tool_configs`)

O `resolverAgentePorInstancia` procura em `tool_configs` (ferramenta `whatsapp`)
a config cuja `instancia` bate com a do payload:

```sql
insert into public.tool_configs (tenant_id, ferramenta, config)
values (
  '<TENANT_ID>',
  'whatsapp',
  jsonb_build_object(
    'instancia', 'minha-instancia',                 -- nome da instância no Evolution
    'agent_id',  '<AGENT_ID>',                       -- agente que vai responder
    'base_url',  'https://evolution.seuservidor.com',
    'apikey',    '<EVOLUTION_APIKEY>'                -- TEMP: migrar p/ Vault (FASE 4.2)
  )
);
```

> ⚠️ **Segurança (FASE 4.2):** `apikey`/`base_url` no jsonb é só para destravar o
> teste end-to-end. Em produção, guarde o segredo no **Supabase Vault** e deixe no
> `config` apenas a referência.

## 4. Configurar o webhook no Evolution

- Aponte a instância para a URL da função (com o segredo na query):
  `https://<PROJECT_REF>.functions.supabase.co/whatsapp-webhook?secret=<WHATSAPP_WEBHOOK_SECRET>`
- Evento: **MESSAGES_UPSERT**.
- (Opcional) desligar `fromMe`/SEND_MESSAGE — o código já filtra `fromMe`, mas reduz ruído.

## 5. Validar

**Sem WhatsApp ainda** — `curl` com um payload montado à mão:

```bash
curl -i -X POST "https://<PROJECT_REF>.functions.supabase.co/whatsapp-webhook?secret=<WHATSAPP_WEBHOOK_SECRET>" \
  -H "content-type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "minha-instancia",
    "data": {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net", "fromMe": false, "id": "TESTE-1" },
      "message": { "conversation": "Olá, qual o prazo de inscrição?" }
    }
  }'
```

Esperado: `200` com `{"status":"ok"}`. Confira no banco: linha em `conversations`,
duas em `messages` (user + assistant) e uma em `usage_events`.

**Teste real:** mande uma mensagem do seu celular para o número da instância e
veja a resposta do agente.

## Testes offline (sem rede)

```bash
npx tsx src/webhook/handler.smoke.ts   # idempotência, fromMe, escalada, gravação
npx tsx src/agent/loop.smoke.ts        # loop do agente (RAG → tools → usage)
```

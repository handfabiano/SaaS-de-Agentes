# Painel Admin — SaaS de Agentes

Interface de administração do motor de agentes multi-tenant. CRUD de agentes,
base de conhecimento (RAG), conversas e dashboard de uso. **Sem chamadas de IA no
front** — todo contato com a API do modelo e com embeddings é no backend.

- **Stack:** React + TypeScript + Vite.
- **Dados/Auth:** Supabase (Postgres + Auth + RLS). O painel usa só a chave
  **anon**; o isolamento por `tenant_id` é garantido pelas policies de RLS.
- **Design system:** paleta Moss / Ember / Clay / Paper, tipografia Fraunces
  (display) + Cabinet Grotesk (UI), reaproveitando o padrão do ConectaPol.

## Rodar

```bash
cd painel
cp .env.example .env      # preencha URL e ANON KEY do seu projeto Supabase
npm install
npm run dev               # http://localhost:5173
```

Outros scripts: `npm run typecheck`, `npm run build`, `npm run preview`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Chave **pública** (anon). Nunca use a service_role no front. |

## Estrutura

```
src/
  context/        AuthContext, TenantContext, ToastContext
  lib/            supabase (client), database.types, constants, format
  components/
    ui/           Button, Field, Toggle, Badge, Modal, States (loading/vazio/erro)
    layout/       Shell (sidebar+topbar), TenantSelector, PageHead
    knowledge/    KnowledgeBase (lista + upload/colar → indexação no backend)
    charts/       BarChart (SVG, sem dependências)
  pages/          Login, AgentsList, AgentEdit, Conversations, Usage
  styles/         components.css, layout.css, pages.css (tokens em index.css)
```

## Telas

1. **Shell** — sidebar (Agentes / Conversas / Uso), seletor de tenant (quando há
   +1), usuário e sair.
2. **Agentes** (`/agentes`) — lista com estados loading/vazio/erro. `Novo agente`
   só para admin.
3. **Edição** (`/agentes/:id`, `/agentes/novo`) — nome, template, modelo
   (default Haiku), temperatura, system prompt (com contador), ferramentas
   (`encaminhar_humano` marcada e travada), toggle ativo. Validação: nome e
   system prompt obrigatórios.
4. **Base de conhecimento** — dentro da edição. Upload de arquivo ou texto colado;
   o conteúdo é enviado para a Edge Function `indexar-documento` (backend), que
   extrai texto, gera embeddings e popula `knowledge_chunks`. O front só envia e
   mostra o status. Remover apaga a fonte (cascata nos chunks).
5. **Conversas** (`/conversas`) — lista com filtro por status e agente; conversas
   `escalada` destacadas. Clique abre drawer com as mensagens em ordem.
6. **Uso** (`/uso`) — cards (custo estimado + tokens), gráfico de custo por dia e
   tabela por agente. Seletor de período 7/30 dias.

## Papéis

- `admin`: pode tudo.
- `operador`: vê conversas e uso, mas **não edita agentes** (campos desabilitados,
  botões escondidos). O papel vem de `tenant_members.papel` no tenant ativo.

`tool_configs` (segredos de integração) **não** aparecem neste painel — ficam para
uma tela futura com Supabase Vault.

## Backend esperado

- **Edge Function `indexar-documento`**: recebe `{ source_id, agent_id, tenant_id,
  tipo, conteudo | arquivo_base64, filename, mime }`, extrai o texto, gera
  embeddings (dim. 1536, igual ao schema) e insere em `knowledge_chunks`. Enquanto
  ela não existe, o documento é criado em `knowledge_sources` e o painel sinaliza
  que a indexação não pôde ser disparada.
- **Agregação de uso** (opcional, recomendado em volume alto): o dashboard agrega
  `usage_events` no cliente sobre o período. Para muitos eventos, crie uma view/RPC
  de agregação no Supabase (por dia e por agente) e troque a consulta em
  `src/pages/UsagePage.tsx`. Veja `sql/usage_aggregation.sql` para um ponto de
  partida.
```

# Briefing técnico — Painel Admin do SaaS de Agentes

> Cole este documento no Claude Code como contexto. Ele especifica cada tela, os
> campos, as tabelas/colunas do Supabase e os estados de UI, para construir com o
> mínimo de idas e voltas.

## Contexto do produto

Motor de agente de IA multi-tenant. Cada cliente (tenant) configura um ou mais
agentes (system prompt, modelo, ferramentas, base de conhecimento). Este painel é
a interface de administração: onde se cria/edita agentes, sobe documentos e
acompanha o consumo de tokens.

## Stack e padrões

- **Frontend:** React + TypeScript (mesmo padrão dos projetos existentes).
- **Backend de dados:** Supabase (Postgres + Auth + RLS já configurados).
- **Design system:** reaproveitar o do ConectaPol.
  - Paleta: **Moss / Ember / Clay / Paper**.
  - Tipografia: **Fraunces** (títulos/display) + **Cabinet Grotesk** (texto/UI).
  - Reusar os componentes-base existentes (botões, inputs, cards, layout).
- **Auth:** Supabase Auth. Usuário logado → `tenant_members` define o(s) tenant(s).
  Todas as queries respeitam RLS por `tenant_id` (já implementado no schema).
- **Multi-tenant:** se o usuário tem mais de um tenant, exibir seletor de tenant
  no topo. O `tenant_id` ativo filtra tudo.

## Modelo de dados relevante (já existe no Supabase)

| Tabela | Colunas usadas no painel |
|---|---|
| `tenants` | `id`, `nome`, `slug`, `plano`, `ativo` |
| `tenant_members` | `tenant_id`, `user_id`, `papel` (admin \| operador) |
| `agents` | `id`, `tenant_id`, `nome`, `template`, `system_prompt`, `modelo`, `temperatura`, `ferramentas_ativas` (text[]), `ativo`, `updated_at` |
| `knowledge_sources` | `id`, `tenant_id`, `agent_id`, `titulo`, `origem`, `created_at` |
| `knowledge_chunks` | `id`, `source_id`, `agent_id`, `conteudo`, `embedding` (gerado no backend) |
| `conversations` | `id`, `tenant_id`, `agent_id`, `canal`, `contato_externo`, `status`, `created_at` |
| `messages` | `conversation_id`, `papel`, `conteudo`, `created_at` |
| `usage_events` | `tenant_id`, `agent_id`, `modelo`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `custo_estimado`, `created_at` |

> Modelos válidos no campo `modelo`: `claude-opus-4-8`, `claude-sonnet-4-6`,
> `claude-haiku-4-5-20251001`. Default sugerido: Haiku.
>
> Ferramentas possíveis em `ferramentas_ativas` (nomes string, casam com o registry
> do backend): `encaminhar_humano`, `consultar_status_demanda`, `agendar`,
> `consultar_jogo`, `consultar_edital` (e as que forem criadas). `encaminhar_humano`
> deve vir marcada por padrão e ser difícil de desmarcar (válvula de segurança).

---

## Telas

### 1. Layout geral (shell)

- Sidebar esquerda: navegação (Agentes, Conversas, Uso).
- Topo: seletor de tenant (se houver +1), nome do usuário, sair.
- Área de conteúdo à direita.
- Aplicar paleta e tipografia do ConectaPol.

### 2. Lista de Agentes — rota `/agentes`

- Tabela/cards listando `agents` do tenant ativo.
- Colunas: nome, template, modelo, nº de ferramentas ativas, status (ativo/inativo), `updated_at`.
- Botão "Novo agente" → abre tela de edição em modo criação.
- Clique numa linha → tela de edição.
- **Estados:** loading (skeleton), vazio ("Nenhum agente ainda — crie o primeiro"),
  erro (mensagem + retry).

### 3. Edição de Agente — rota `/agentes/:id` (e `/agentes/novo`)

Formulário com os campos de `agents`:

- **Nome** (text, obrigatório).
- **Template** (select: gabinete | evento | orgao | pme | — vazio). Apenas rótulo
  organizacional; não muda lógica no painel.
- **Modelo** (select com os 3 modelos válidos; default Haiku).
- **Temperatura** (slider 0–1, passo 0.1; default 0.3).
- **System prompt** (textarea grande, com contador de caracteres).
- **Ferramentas ativas** (checkboxes a partir da lista de ferramentas; grava em
  `ferramentas_ativas` como array). `encaminhar_humano` marcada e travada.
- **Ativo** (toggle).

Ações: Salvar (insert/update em `agents`), Cancelar.
**Estados:** salvando (botão em loading), sucesso (toast), erro de validação
(campo destacado), erro de rede (toast + permitir retry). Bloquear salvar se nome
ou system prompt vazios.

Abaixo do formulário, seção **Base de conhecimento** (ver tela 4) vinculada a este agente.

### 4. Base de conhecimento (dentro da edição do agente)

- Lista de `knowledge_sources` do agente (`titulo`, `origem`, `created_at`).
- Botão "Adicionar documento":
  - Upload de arquivo (txt/pdf/md) **ou** colar texto manual.
  - **Importante:** o processamento (extrair texto → gerar embeddings → inserir em
    `knowledge_chunks`) acontece no **backend** (Edge Function/serviço), não no
    front. O painel só envia o conteúdo e mostra o status. Não gerar embedding no
    cliente.
- Cada fonte: opção de remover (deleta `knowledge_sources` em cascata nos chunks).
- **Estados:** processando ("Indexando documento…"), pronto, erro.

### 5. Conversas — rota `/conversas`

- Lista de `conversations` do tenant (mais recentes primeiro): canal, contato,
  status (aberta | encerrada | escalada), data.
- Filtro por status e por agente.
- Clique → painel lateral/modal com as `messages` da conversa em ordem cronológica
  (bolhas user/assistant/tool).
- Destacar visualmente conversas com status `escalada` (precisam de atenção humana).
- **Estados:** loading, vazio, erro.

### 6. Uso / Dashboard — rota `/uso`

Leitura agregada de `usage_events` do tenant ativo.

- Cards de topo: total de tokens (input/output) e **custo estimado** no período.
- Gráfico de custo por dia (linha ou barra).
- Tabela: consumo por agente (somar `custo_estimado` agrupado por `agent_id`).
- Seletor de período (7 / 30 dias).
- **Estados:** loading, vazio ("Sem uso registrado ainda"), erro.

> Observação: agregação pode ser feita com query no Supabase agrupando por dia /
> por agente. Não trazer todos os eventos crus pro front se o volume crescer —
> preferir uma view ou RPC de agregação.

---

## Regras transversais

- **RLS faz o isolamento**, mas o front sempre envia/filtra pelo `tenant_id` ativo.
- **Papéis:** `operador` pode ver conversas e uso, mas não editar agentes nem
  `tool_configs`; `admin` pode tudo. Esconder/desabilitar ações conforme o papel.
- **Segredos de integração** (`tool_configs`) NÃO aparecem neste painel agora
  (ficam para uma tela futura, com Vault). Não exibir tokens.
- **Sem chamadas de IA no front.** Todo contato com a API do modelo e com
  embeddings é no backend. O painel é CRUD + visualização.
- Aplicar os estados de loading/vazio/erro em todas as telas (não deixar tela
  branca).

## Ordem de construção sugerida

1. Shell + auth + seletor de tenant.
2. Lista e edição de agentes (núcleo do produto).
3. Base de conhecimento (upload → status).
4. Dashboard de uso.
5. Conversas.

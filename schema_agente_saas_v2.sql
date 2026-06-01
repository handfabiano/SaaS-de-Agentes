-- =====================================================================
-- AGENTE SaaS — Schema multi-tenant v2 (Supabase / Postgres)
-- Correções sobre a v1:
--   - HNSW no lugar de ivfflat (funciona desde o 1º registro)
--   - match_chunks filtra por p_tenant_id (backend/service_role, sem auth.uid)
--   - search_path fixo em funções security definer
--   - policies escritas explicitamente (sem dollar-quoting aninhado)
--   - updated_at automático, idempotência de webhook, registro de escalada
--   - nota de segurança: segredos via Supabase Vault, não em texto claro
-- Cole no SQL Editor do Supabase e rode de uma vez.
-- =====================================================================

-- 1. EXTENSÕES ---------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- Trigger genérico de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 2. TENANTS
-- =====================================================================
create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  slug text unique not null,
  plano text not null default 'free',           -- free | pro | premium
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tenants_updated before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.tenant_members (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'admin',          -- admin | operador
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- Helper: tenants do usuário logado.
-- security definer + search_path fixo (evita recursão de RLS e search_path hijack)
create or replace function public.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.tenant_members where user_id = auth.uid()
$$;

-- =====================================================================
-- 3. AGENTS
-- =====================================================================
create table public.agents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  template text,                                -- gabinete | evento | orgao | pme
  system_prompt text not null default '',
  modelo text not null default 'claude-haiku-4-5-20251001',
  temperatura numeric not null default 0.3,
  ferramentas_ativas text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.agents (tenant_id);
create trigger trg_agents_updated before update on public.agents
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 4. KNOWLEDGE SOURCES + CHUNKS (RAG)
-- =====================================================================
create table public.knowledge_sources (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  titulo text not null,
  origem text,                                  -- upload | url | manual
  created_at timestamptz not null default now()
);
create index on public.knowledge_sources (agent_id);

create table public.knowledge_chunks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  conteudo text not null,
  embedding vector(1536),                       -- ajuste à dimensão do seu modelo
  created_at timestamptz not null default now()
);
create index on public.knowledge_chunks (agent_id);
-- HNSW: não precisa de treino, funciona desde o primeiro registro
create index on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

-- Busca semântica. Recebe p_tenant_id explícito: o backend (service_role)
-- atende contatos sem auth.uid(), então NÃO se pode depender de user_tenant_ids().
create or replace function public.match_chunks(
  p_tenant_id uuid,
  p_agent_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 5
)
returns table (id uuid, conteudo text, similaridade float)
language sql
stable
as $$
  select kc.id,
         kc.conteudo,
         1 - (kc.embedding <=> p_query_embedding) as similaridade
  from public.knowledge_chunks kc
  where kc.agent_id = p_agent_id
    and kc.tenant_id = p_tenant_id
  order by kc.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- =====================================================================
-- 5. CONVERSAS + MENSAGENS
-- =====================================================================
create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  canal text not null default 'web',            -- web | whatsapp
  contato_externo text,                         -- nº WhatsApp ou id do visitante
  status text not null default 'aberta',        -- aberta | encerrada | escalada
  escalada_em timestamptz,                      -- quando escalou p/ humano
  escalada_para text,                           -- assessor/operador responsável
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (agent_id);
create index on public.conversations (tenant_id, status);
create trigger trg_conversations_updated before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  papel text not null,                          -- user | assistant | tool
  conteudo text not null,
  metadata jsonb default '{}',                  -- tool calls, citações, etc.
  external_id text,                             -- id da msg no provedor (idempotência)
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);
-- Evita duplicar mensagem quando a Evolution reentrega o webhook
create unique index on public.messages (tenant_id, external_id)
  where external_id is not null;

-- =====================================================================
-- 6. TOOL CONFIGS
--    SEGURANÇA: não grave tokens em texto claro aqui. Use Supabase Vault
--    e guarde no jsonb apenas a REFERÊNCIA (ex.: {"secret_name":"wpp_tenant_x"}).
--    Leitura apenas pelo backend (service_role ignora RLS).
-- =====================================================================
create table public.tool_configs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ferramenta text not null,                     -- whatsapp | crm | brasilapi ...
  config jsonb not null default '{}',           -- referências a segredos, endpoints
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, ferramenta)
);
create trigger trg_tool_configs_updated before update on public.tool_configs
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 7. USAGE EVENTS (margem / billing)
-- =====================================================================
create table public.usage_events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  modelo text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  custo_estimado numeric not null default 0,
  created_at timestamptz not null default now()
);
create index on public.usage_events (tenant_id, created_at);

-- =====================================================================
-- 8. ROW LEVEL SECURITY
-- =====================================================================
alter table public.tenants            enable row level security;
alter table public.tenant_members     enable row level security;
alter table public.agents             enable row level security;
alter table public.knowledge_sources  enable row level security;
alter table public.knowledge_chunks   enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.tool_configs       enable row level security;
alter table public.usage_events       enable row level security;

-- TENANTS
create policy "tenants_select" on public.tenants
  for select using (id in (select public.user_tenant_ids()));

-- TENANT_MEMBERS — comparação direta com auth.uid() (sem chamar a função: evita recursão)
create policy "members_select" on public.tenant_members
  for select using (user_id = auth.uid());

-- AGENTS
create policy "agents_select" on public.agents
  for select using (tenant_id in (select public.user_tenant_ids()));
create policy "agents_insert" on public.agents
  for insert with check (tenant_id in (select public.user_tenant_ids()));
create policy "agents_update" on public.agents
  for update using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
create policy "agents_delete" on public.agents
  for delete using (tenant_id in (select public.user_tenant_ids()));

-- KNOWLEDGE_SOURCES
create policy "ks_select" on public.knowledge_sources
  for select using (tenant_id in (select public.user_tenant_ids()));
create policy "ks_insert" on public.knowledge_sources
  for insert with check (tenant_id in (select public.user_tenant_ids()));
create policy "ks_update" on public.knowledge_sources
  for update using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
create policy "ks_delete" on public.knowledge_sources
  for delete using (tenant_id in (select public.user_tenant_ids()));

-- KNOWLEDGE_CHUNKS
create policy "kc_select" on public.knowledge_chunks
  for select using (tenant_id in (select public.user_tenant_ids()));
create policy "kc_insert" on public.knowledge_chunks
  for insert with check (tenant_id in (select public.user_tenant_ids()));
create policy "kc_update" on public.knowledge_chunks
  for update using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
create policy "kc_delete" on public.knowledge_chunks
  for delete using (tenant_id in (select public.user_tenant_ids()));

-- CONVERSATIONS
create policy "conv_select" on public.conversations
  for select using (tenant_id in (select public.user_tenant_ids()));
create policy "conv_insert" on public.conversations
  for insert with check (tenant_id in (select public.user_tenant_ids()));
create policy "conv_update" on public.conversations
  for update using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
create policy "conv_delete" on public.conversations
  for delete using (tenant_id in (select public.user_tenant_ids()));

-- MESSAGES
create policy "msg_select" on public.messages
  for select using (tenant_id in (select public.user_tenant_ids()));
create policy "msg_insert" on public.messages
  for insert with check (tenant_id in (select public.user_tenant_ids()));
create policy "msg_update" on public.messages
  for update using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
create policy "msg_delete" on public.messages
  for delete using (tenant_id in (select public.user_tenant_ids()));

-- USAGE_EVENTS (leitura pelo dono do tenant; escrita normalmente via service_role)
create policy "usage_select" on public.usage_events
  for select using (tenant_id in (select public.user_tenant_ids()));
create policy "usage_insert" on public.usage_events
  for insert with check (tenant_id in (select public.user_tenant_ids()));

-- TOOL_CONFIGS — só admin do tenant gerencia; client comum não lê segredos.
-- O backend usa service_role (ignora RLS) para ler em runtime.
create policy "tool_configs_admin" on public.tool_configs
  for all
  using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and papel = 'admin'
    )
  )
  with check (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid() and papel = 'admin'
    )
  );

-- =====================================================================
-- NOTA OPERACIONAL
--   - O agente roda no backend com SERVICE_ROLE (ignora RLS). As policies
--     acima protegem o acesso via client (painel/admin) com chave anon.
--   - Em runtime, valide SEMPRE o tenant_id no backend antes de gravar.
-- FIM
-- =====================================================================

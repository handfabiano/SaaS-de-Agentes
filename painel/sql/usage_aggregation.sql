-- =====================================================================
-- Agregação de uso (opcional) — ponto de partida para o dashboard.
-- O painel agrega usage_events no cliente; em volume alto, prefira estas RPCs.
-- Respeitam RLS porque rodam como o usuário (security invoker, default) e
-- usam o filtro de tenant nas policies de usage_events.
-- =====================================================================

-- Custo + tokens por dia, no período (em dias) para o tenant informado.
create or replace function public.usage_por_dia(
  p_tenant_id uuid,
  p_dias int default 7
)
returns table (
  dia date,
  custo_estimado numeric,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint
)
language sql
stable
as $$
  select date_trunc('day', created_at)::date as dia,
         coalesce(sum(custo_estimado), 0)      as custo_estimado,
         coalesce(sum(input_tokens), 0)        as input_tokens,
         coalesce(sum(output_tokens), 0)       as output_tokens,
         coalesce(sum(cache_read_tokens), 0)   as cache_read_tokens
  from public.usage_events
  where tenant_id = p_tenant_id
    and created_at >= (now() - make_interval(days => p_dias))
  group by 1
  order by 1;
$$;

-- Consumo agrupado por agente, no período.
create or replace function public.usage_por_agente(
  p_tenant_id uuid,
  p_dias int default 7
)
returns table (
  agent_id uuid,
  custo_estimado numeric,
  input_tokens bigint,
  output_tokens bigint
)
language sql
stable
as $$
  select agent_id,
         coalesce(sum(custo_estimado), 0) as custo_estimado,
         coalesce(sum(input_tokens), 0)   as input_tokens,
         coalesce(sum(output_tokens), 0)  as output_tokens
  from public.usage_events
  where tenant_id = p_tenant_id
    and created_at >= (now() - make_interval(days => p_dias))
  group by agent_id
  order by custo_estimado desc;
$$;

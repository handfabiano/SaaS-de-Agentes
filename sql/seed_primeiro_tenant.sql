-- =====================================================================
-- Seed do primeiro tenant + vínculo de admin.
-- Rode DEPOIS de aplicar schema_agente_saas_v2.sql.
-- Ajuste nome/slug do tenant e o e-mail do usuário (criado no Supabase Auth).
-- Idempotente: pode rodar de novo sem duplicar.
-- =====================================================================

-- 1) Cria o tenant
insert into public.tenants (nome, slug)
values ('Meu Tenant', 'meu-tenant')
on conflict (slug) do nothing;

-- 2) Vincula o usuário do Auth como admin do tenant
insert into public.tenant_members (tenant_id, user_id, papel)
select t.id, u.id, 'admin'
from public.tenants t
join auth.users u on u.email = 'handfabiano@gmail.com'   -- <-- troque se necessário
where t.slug = 'meu-tenant'
on conflict (tenant_id, user_id) do update set papel = 'admin';

-- 3) Confirmação: deve retornar 1 linha (seu e-mail + papel = admin)
select t.nome, t.slug, m.papel, u.email
from public.tenant_members m
join public.tenants t on t.id = m.tenant_id
join auth.users u on u.id = m.user_id;

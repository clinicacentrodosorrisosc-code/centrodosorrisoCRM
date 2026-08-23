-- 0161 — LEMBRETE DE AGENDAMENTO POR PIPELINE
--
-- Novo módulo independente do engine de followup-flows.
-- Permite configurar, por pipeline, um template Meta que será enviado
-- automaticamente X horas antes da consulta dos leads (agendamento_data +
-- agendamento_hora nos custom_fields).
--
-- Separado do followup-flows de propósito: esse engine exige agentes publicados
-- e grafo de nós — é complexidade demais para um lembrete simples de consulta.

-- ── Tabela de configuração ──────────────────────────────────────────────────

create table if not exists pipeline_reminder_configs (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references organizations(id) on delete cascade,
  pipeline_id       uuid        not null references crm_pipelines(id) on delete cascade,
  is_active         boolean     not null default true,
  -- Quantas horas ANTES do agendamento o lembrete é enviado
  -- Valores permitidos: 1, 2, 4, 24
  offset_hours      int         not null default 2 check (offset_hours in (1, 2, 4, 24)),
  template_name     text        not null,
  template_language text        not null default 'pt_BR',
  -- Ids das etapas (crm_stages) em que o lembrete está ativo.
  -- Array vazio = todas as etapas do pipeline.
  active_stage_ids  uuid[]      not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Uma configuração por pipeline
  unique (pipeline_id)
);

comment on table pipeline_reminder_configs is
  'Configuração de lembrete automático de consulta por pipeline. '
  'Independente do engine followup-flows — não exige agentes publicados.';

comment on column pipeline_reminder_configs.offset_hours is
  'Horas antes do agendamento em que o lembrete é disparado. Valores: 1, 2, 4, 24.';

comment on column pipeline_reminder_configs.active_stage_ids is
  'Etapas do pipeline onde o lembrete está ativo. '
  'Array vazio = todas as etapas.';

-- ── Índices ─────────────────────────────────────────────────────────────────

create index if not exists pipeline_reminder_configs_org_idx
  on pipeline_reminder_configs (organization_id);

create index if not exists pipeline_reminder_configs_pipeline_idx
  on pipeline_reminder_configs (pipeline_id)
  where is_active = true;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table pipeline_reminder_configs enable row level security;

-- Qualquer membro da org lê a configuração (para exibição na UI)
create policy "members can read pipeline reminder configs"
  on pipeline_reminder_configs for select
  using (organization_id in (select fn_user_org_ids()));

-- Apenas manager+ cria/edita/apaga
create policy "managers can manage pipeline reminder configs"
  on pipeline_reminder_configs for insert
  with check (
    organization_id in (select fn_user_org_ids())
    and fn_role_at_least(organization_id, 'manager')
  );

create policy "managers can update pipeline reminder configs"
  on pipeline_reminder_configs for update
  using (
    organization_id in (select fn_user_org_ids())
    and fn_role_at_least(organization_id, 'manager')
  )
  with check (
    organization_id in (select fn_user_org_ids())
    and fn_role_at_least(organization_id, 'manager')
  );

create policy "managers can delete pipeline reminder configs"
  on pipeline_reminder_configs for delete
  using (
    organization_id in (select fn_user_org_ids())
    and fn_role_at_least(organization_id, 'manager')
  );

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Rota usa service role (admin client); authed só lê via RLS.
grant select on pipeline_reminder_configs to authenticated;
revoke insert, update, delete on pipeline_reminder_configs from authenticated, anon;
revoke execute on all functions in schema public from public, anon;

notify pgrst, 'reload schema';

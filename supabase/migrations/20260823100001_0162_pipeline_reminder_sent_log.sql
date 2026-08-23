-- 0162 — LOG DE ENVIOS DE LEMBRETE DE AGENDAMENTO
--
-- Controla deduplicação: cada par (lead_id, config_id, agendamento_data)
-- só recebe UM envio. Se o agendamento mudar de data, o lembrete volta a
-- ser elegível para a nova data.

create table if not exists pipeline_reminder_sent_log (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null,
  lead_id          uuid        not null,
  config_id        uuid        not null references pipeline_reminder_configs(id) on delete cascade,
  -- Data do agendamento no momento do envio (YYYY-MM-DD).
  -- Chave de deduplicação: se o agendamento mudar, nova data = novo envio elegível.
  agendamento_data text        not null,
  sent_at          timestamptz not null default now(),
  -- Garante idempotência: um lead só recebe UM lembrete por config+data
  unique (lead_id, config_id, agendamento_data)
);

comment on table pipeline_reminder_sent_log is
  'Registro de lembretes já enviados. Evita duplicidade quando o cron '
  'roda mais de uma vez na mesma janela de tempo.';

-- ── Índices ─────────────────────────────────────────────────────────────────

create index if not exists reminder_sent_log_lead_idx
  on pipeline_reminder_sent_log (lead_id, config_id);

create index if not exists reminder_sent_log_sent_at_idx
  on pipeline_reminder_sent_log (sent_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table pipeline_reminder_sent_log enable row level security;

-- Apenas service role (admin client) escreve; a RLS protege leitura por org
create policy "members can read their reminder log"
  on pipeline_reminder_sent_log for select
  using (organization_id in (select fn_user_org_ids()));

-- Escrita via service role (admin client) — sem policy de insert para anon/authed
revoke insert, update, delete on pipeline_reminder_sent_log from authenticated, anon;
grant select on pipeline_reminder_sent_log to authenticated;

notify pgrst, 'reload schema';

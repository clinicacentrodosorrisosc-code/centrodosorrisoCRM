-- 0163 — LEMBRETE DE AGENDAMENTO MULTI-HORÁRIO & DEDUPLICAÇÃO POR OFFSET
--
-- Permite configurar múltiplos horários de lembrete por funil (ex: 24h E 2h antes),
-- cada um com seu próprio template e status ativo/inativo.
-- O log de envios passa a registrar `offset_hours` para que os lembretes de 24h e 2h
-- sejam disparados no momento certo sem colidirem entre si.

-- 1. Campo `schedules` na tabela de configurações
alter table if exists pipeline_reminder_configs
  add column if not exists schedules jsonb not null default '[]'::jsonb;

comment on column pipeline_reminder_configs.schedules is
  'Lista de horários de lembrete configurados para o funil. '
  'Cada item contém: { id, offset_hours, template_name, template_language, is_active }.';

-- 2. Coluna `offset_hours` na tabela de log de envios
alter table if exists pipeline_reminder_sent_log
  add column if not exists offset_hours int not null default 2;

comment on column pipeline_reminder_sent_log.offset_hours is
  'Horas de antecedência do disparo deste envio (1, 2, 4, 24, etc.).';

-- 3. Atualização do índice único para permitir múltiplos envios em datas/horários diferentes
alter table if exists pipeline_reminder_sent_log
  drop constraint if exists pipeline_reminder_sent_log_lead_id_config_id_agendamento_data_key;

drop index if exists reminder_sent_log_unique_idx;

create unique index if not exists reminder_sent_log_unique_idx
  on pipeline_reminder_sent_log (lead_id, config_id, agendamento_data, offset_hours);

notify pgrst, 'reload schema';

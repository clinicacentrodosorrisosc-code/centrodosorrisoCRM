/**
 * Processador de lembretes de agendamento por pipeline.
 *
 * Módulo independente do engine followup-flows. Não exige agentes publicados
 * nem grafo de nós — apenas configuração salva em `pipeline_reminder_configs`.
 *
 * Algoritmo:
 * 1. Busca todas as configs ativas.
 * 2. Para cada config, busca leads elegíveis:
 *    - stage_id IN active_stage_ids (ou qualquer etapa se o array for vazio)
 *    - custom_fields.agendamento_data preenchido e no futuro
 *    - Janela: agendamento - offset_hours <= agora (com tolerância de +5 min
 *      para cobrir o intervalo entre execuções do cron)
 *    - Ainda não enviado (não existe linha em pipeline_reminder_sent_log)
 * 3. Envia o template Meta via sendTemplateForSession.
 * 4. Grava linha em pipeline_reminder_sent_log (idempotência).
 *
 * Timezone: os agendamentos vivem como datas locais (YYYY-MM-DD + HH:mm) sem
 * fuso explícito. O sistema assume Brasília (-03:00), igual ao node-handlers.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplateForSession } from "@/lib/channels/meta/send-template-for-session";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";

/** Janela de antecipação do cron: 5 min extra para cobrir variação de execução. */
const CRON_WINDOW_MS = 5 * 60 * 1000;

/** Timezone assumido para os agendamentos que não trazem fuso explícito. */
const BRASILIA_OFFSET = "-03:00";

export interface ReminderProcessorSummary {
  configs_processed: number;
  leads_evaluated: number;
  sent: number;
  skipped_already_sent: number;
  skipped_no_phone: number;
  errors: number;
}

/**
 * Converte data (YYYY-MM-DD) + hora (HH:mm) para Date em Brasília.
 * Retorna null se os valores são inválidos.
 */
function parseAgendamento(dataStr: string, horaStr: string): Date | null {
  if (!dataStr || !/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) return null;
  const hora = horaStr && /^\d{2}:\d{2}$/.test(horaStr) ? horaStr : "09:00";
  const iso = `${dataStr}T${hora}:00${BRASILIA_OFFSET}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formata data/hora para texto pt-BR: "22/08/2026 às 14:30"
 */
function formatAgendamento(dataStr: string, horaStr: string): string {
  if (!dataStr) return "";
  const parts = dataStr.split("-");
  if (parts.length !== 3) return dataStr;
  const [ano, mes, dia] = parts;
  const formatted = `${dia}/${mes}/${ano}`;
  return horaStr ? `${formatted} às ${horaStr}` : formatted;
}

/**
 * Processa todos os lembretes de agendamento pendentes.
 * Deve ser chamado pelo cron `followup-flow-worker`.
 *
 * @param admin - Supabase admin client (bypassa RLS)
 * @param clock - Injetável para testes
 */
export async function processAppointmentReminders(
  admin: SupabaseClient,
  clock: () => Date = () => new Date(),
): Promise<ReminderProcessorSummary> {
  const summary: ReminderProcessorSummary = {
    configs_processed: 0,
    leads_evaluated: 0,
    sent: 0,
    skipped_already_sent: 0,
    skipped_no_phone: 0,
    errors: 0,
  };

  // 1. Busca configs ativas
  const { data: configs, error: configsErr } = await admin
    .from("pipeline_reminder_configs")
    .select("id, organization_id, pipeline_id, offset_hours, template_name, template_language, active_stage_ids")
    .eq("is_active", true);

  if (configsErr) {
    logger.error("[appointment-reminders] Erro ao buscar configs", { error: configsErr.message });
    return summary;
  }

  if (!configs || configs.length === 0) return summary;

  const now = clock();

  for (const config of configs) {
    summary.configs_processed++;

    try {
      // 2. Busca leads elegíveis do pipeline
      const stageFilter = (config.active_stage_ids as string[]) ?? [];

      // Busca leads com agendamento_data nos custom_fields
      let leadsQuery = admin
        .from("crm_leads")
        .select("id, title, stage_id, custom_fields")
        .eq("organization_id", config.organization_id)
        .not("custom_fields->agendamento_data", "is", null)
        .not("custom_fields->agendamento_data", "eq", "\"\"")
        .is("won_at", null)
        .is("lost_at", null);

      // Se há etapas específicas configuradas, filtra por elas
      if (stageFilter.length > 0) {
        leadsQuery = leadsQuery.in("stage_id", stageFilter);
      } else {
        // Filtra pelo pipeline via crm_stages
        const { data: stages } = await admin
          .from("crm_stages")
          .select("id")
          .eq("pipeline_id", config.pipeline_id);
        const stageIds = (stages ?? []).map((s: { id: string }) => s.id);
        if (stageIds.length === 0) continue;
        leadsQuery = leadsQuery.in("stage_id", stageIds);
      }

      const { data: leads, error: leadsErr } = await leadsQuery;

      if (leadsErr) {
        logger.error("[appointment-reminders] Erro ao buscar leads", {
          config_id: config.id,
          error: leadsErr.message,
        });
        summary.errors++;
        continue;
      }

      for (const lead of leads ?? []) {
        summary.leads_evaluated++;
        const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
        const dataStr = String(customFields.agendamento_data ?? "").trim();
        const horaStr = String(customFields.agendamento_hora ?? "").trim() || "09:00";

        const agendamento = parseAgendamento(dataStr, horaStr);
        if (!agendamento) continue; // data inválida

        // Janela: enviar se agendamento - offset_hours <= agora + CRON_WINDOW_MS
        const offsetMs = config.offset_hours * 60 * 60 * 1000;
        const sendAt = new Date(agendamento.getTime() - offsetMs);

        // Não envia se ainda não chegou o momento (com janela extra)
        if (sendAt.getTime() > now.getTime() + CRON_WINDOW_MS) continue;
        // Não envia se o agendamento já passou (mais de 1h depois do horário)
        if (agendamento.getTime() < now.getTime() - 60 * 60 * 1000) continue;

        // Verifica se já enviou para esta combinação lead+config+data
        const { data: existing } = await admin
          .from("pipeline_reminder_sent_log")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("config_id", config.id)
          .eq("agendamento_data", dataStr)
          .maybeSingle();

        if (existing) {
          summary.skipped_already_sent++;
          continue;
        }

        // Busca telefone do contato vinculado ao lead
        const { data: leadWithContact } = await admin
          .from("crm_leads")
          .select("contacts(phone, display_name, name)")
          .eq("id", lead.id)
          .maybeSingle();

        const contact = (leadWithContact as unknown as { contacts?: { phone?: string | null; display_name?: string | null; name?: string | null } | null })?.contacts;
        const phone = contact?.phone?.trim();
        if (!phone) {
          summary.skipped_no_phone++;
          continue;
        }

        // Prepara variáveis do template
        const leadName = (lead.title || contact?.name || contact?.display_name || "Paciente").trim();
        const agendamentoFormatted = formatAgendamento(dataStr, horaStr);

        const values: Record<string, string> = {
          "1": leadName,
          "2": agendamentoFormatted,
          "body_1": leadName,
          "body_2": agendamentoFormatted,
        };

        // Envia o template
        try {
          await sendTemplateForSession(admin, {
            organizationId: config.organization_id,
            to: phone,
            name: config.template_name,
            language: config.template_language,
            values,
          });

          // Registra envio para evitar duplicidade
          await admin.from("pipeline_reminder_sent_log").insert({
            organization_id: config.organization_id,
            lead_id: lead.id,
            config_id: config.id,
            agendamento_data: dataStr,
          });

          summary.sent++;

          void audit({
            action: "pipeline_reminder.sent",
            organizationId: config.organization_id,
            bypassedRls: true,
            metadata: {
              lead_id: lead.id,
              config_id: config.id,
              template: config.template_name,
              agendamento_data: dataStr,
              agendamento_hora: horaStr,
              offset_hours: config.offset_hours,
            },
          });

          logger.info("[appointment-reminders] Lembrete enviado", {
            lead_id: lead.id,
            config_id: config.id,
            template: config.template_name,
            agendamento: `${dataStr} ${horaStr}`,
          });
        } catch (sendErr) {
          summary.errors++;
          logger.error("[appointment-reminders] Erro ao enviar template", {
            lead_id: lead.id,
            config_id: config.id,
            error: String(sendErr),
          });
        }
      }
    } catch (configErr) {
      summary.errors++;
      logger.error("[appointment-reminders] Erro ao processar config", {
        config_id: config.id,
        error: String(configErr),
      });
    }
  }

  return summary;
}

/**
 * Processador de lembretes de agendamento por pipeline.
 *
 * Suporta múltiplos horários de lembrete por funil (ex: 24h E 2h antes), cada um com
 * seu próprio template Meta / mensagem personalizada.
 *
 * Multi-transporte:
 * 1. Tenta envio pelo canal oficial Meta (Cloud API) via `sendTemplateForSession`.
 * 2. Se a Meta não estiver configurada ou falhar, faz fallback automático para WAHA
 *    enviando o texto do template com as variáveis preenchidas.
 * 3. Registra a mensagem na tabela `messages` e vincula à conversa do lead no CRM.
 * 4. Registra no log de envios com `(lead_id, config_id, agendamento_data, offset_hours)`
 *    para que os múltiplos horários funcionem sem colisão de deduplicação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTemplateForSession } from "@/lib/channels/meta/send-template-for-session";
import { sendWAHA } from "@/lib/waha/send";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";

/** Janela de antecipação do cron: 5 min extra para cobrir variação de execução. */
const CRON_WINDOW_MS = 5 * 60 * 1000;

/** Timezone assumido para os agendamentos que não trazem fuso explícito. */
const BRASILIA_OFFSET = "-03:00";

export interface ReminderProcessorSummary {
  configs_processed: number;
  schedules_processed: number;
  leads_evaluated: number;
  sent: number;
  skipped_already_sent: number;
  skipped_no_phone: number;
  errors: number;
}

interface ScheduleItem {
  id: string;
  offset_hours: number;
  template_name: string;
  template_language: string;
  is_active: boolean;
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
 * Monta o texto legível do template substituindo as variáveis {{1}}, {{2}}, etc.
 */
function buildInterpolatedText(
  components: unknown,
  values: Record<string, string>,
  fallbackTemplateName: string,
): string {
  if (Array.isArray(components)) {
    const bodyComp = components.find((c: Record<string, unknown>) => (c.type ?? "").toString().toUpperCase() === "BODY");
    if (bodyComp && typeof bodyComp.text === "string") {
      let txt = bodyComp.text;
      for (const [k, v] of Object.entries(values)) {
        txt = txt.replaceAll(`{{${k}}}`, v);
      }
      return txt;
    }
  }
  const nome = values["1"] || values["body_1"] || "Paciente";
  const dataHora = values["2"] || values["body_2"] || "em breve";
  return `Olá ${nome}! Lembramos do seu agendamento para ${dataHora}. ${fallbackTemplateName}`;
}

/**
 * Processa todos os lembretes de agendamento pendentes.
 * Chamado a cada minuto pelo cron `followup-flow-worker`.
 */
export async function processAppointmentReminders(
  admin: SupabaseClient,
  clock: () => Date = () => new Date(),
): Promise<ReminderProcessorSummary> {
  const summary: ReminderProcessorSummary = {
    configs_processed: 0,
    schedules_processed: 0,
    leads_evaluated: 0,
    sent: 0,
    skipped_already_sent: 0,
    skipped_no_phone: 0,
    errors: 0,
  };

  // 1. Busca configs ativas
  const { data: configs, error: configsErr } = await admin
    .from("pipeline_reminder_configs")
    .select("id, organization_id, pipeline_id, offset_hours, template_name, template_language, schedules, active_stage_ids")
    .eq("is_active", true);

  if (configsErr) {
    logger.error("[appointment-reminders] Erro ao buscar configs", { error: configsErr.message });
    return summary;
  }

  if (!configs || configs.length === 0) return summary;

  const now = clock();

  for (const config of configs) {
    summary.configs_processed++;

    // Normaliza schedules (suporta múltiplos horários e legado)
    let schedules: ScheduleItem[] = [];
    if (Array.isArray(config.schedules) && config.schedules.length > 0) {
      schedules = (config.schedules as ScheduleItem[]).filter((s) => s.is_active !== false && !!s.template_name);
    } else if (config.template_name) {
      schedules = [
        {
          id: "default",
          offset_hours: config.offset_hours ?? 2,
          template_name: config.template_name,
          template_language: config.template_language ?? "pt_BR",
          is_active: true,
        },
      ];
    }

    if (schedules.length === 0) continue;

    try {
      // 2. Busca leads elegíveis do pipeline
      const stageFilter = (config.active_stage_ids as string[]) ?? [];

      let leadsQuery = admin
        .from("crm_leads")
        .select("id, title, stage_id, custom_fields, contact_id")
        .eq("organization_id", config.organization_id)
        .not("custom_fields->agendamento_data", "is", null)
        .not("custom_fields->agendamento_data", "eq", "\"\"")
        .is("won_at", null)
        .is("lost_at", null);

      if (stageFilter.length > 0) {
        leadsQuery = leadsQuery.in("stage_id", stageFilter);
      } else {
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

        // Se o agendamento já passou há mais de 1 hora, não envia nada
        if (agendamento.getTime() < now.getTime() - 60 * 60 * 1000) continue;

        // Itera sobre cada horário configurado (ex: 24h, 2h, etc.)
        for (const schedule of schedules) {
          summary.schedules_processed++;

          const offsetMs = schedule.offset_hours * 60 * 60 * 1000;
          const sendAt = new Date(agendamento.getTime() - offsetMs);

          // Não envia se ainda não chegou o momento (com tolerância de 5 min)
          if (sendAt.getTime() > now.getTime() + CRON_WINDOW_MS) continue;
          // Não envia se já passou da hora do próprio agendamento
          if (now.getTime() > agendamento.getTime()) continue;

          // Verifica se já enviou para esta combinação lead+config+data+offset_hours
          const { data: existing } = await admin
            .from("pipeline_reminder_sent_log")
            .select("id")
            .eq("lead_id", lead.id)
            .eq("config_id", config.id)
            .eq("agendamento_data", dataStr)
            .eq("offset_hours", schedule.offset_hours)
            .maybeSingle();

          if (existing) {
            summary.skipped_already_sent++;
            continue;
          }

          // Busca dados do contato (telefone, nome, sessão)
          let contactPhone: string | null = null;
          let contactName: string = lead.title || "Paciente";
          let contactId = lead.contact_id;

          if (contactId) {
            const { data: contactRow } = await admin
              .from("contacts")
              .select("id, phone_number, name, display_name")
              .eq("id", contactId)
              .maybeSingle();
            if (contactRow) {
              contactPhone = contactRow.phone_number;
              contactName = (contactRow.name || contactRow.display_name || lead.title || "Paciente").trim();
            }
          }

          if (!contactPhone) {
            const { data: leadWithContact } = await admin
              .from("crm_leads")
              .select("contact_id, contacts(id, phone, display_name, name)")
              .eq("id", lead.id)
              .maybeSingle();

            const c = (leadWithContact as unknown as { contact_id?: string; contacts?: { id?: string; phone?: string | null; display_name?: string | null; name?: string | null } | null })?.contacts;
            contactPhone = c?.phone?.trim() ?? null;
            if (c) {
              contactName = (c.name || c.display_name || lead.title || "Paciente").trim();
              if (c.id) contactId = c.id;
            }
          }

          const rawPhone = contactPhone ? contactPhone.replace(/\D/g, "") : "";
          if (!rawPhone) {
            summary.skipped_no_phone++;
            continue;
          }

          const agendamentoFormatted = formatAgendamento(dataStr, horaStr);

          // Busca definição do template Meta para preencher slots corretos
          const { data: metaTemplate } = await admin
            .from("meta_templates")
            .select("name, language, components, status")
            .eq("organization_id", config.organization_id)
            .eq("name", schedule.template_name)
            .maybeSingle();

          const values: Record<string, string> = {
            "1": contactName,
            "2": agendamentoFormatted,
            "body_1": contactName,
            "body_2": agendamentoFormatted,
            "header:1": contactName,
          };

          // Preenche todos os slots declarados no template
          if (metaTemplate && Array.isArray(metaTemplate.components)) {
            for (const comp of metaTemplate.components as Array<Record<string, unknown>>) {
              const text = typeof comp.text === "string" ? comp.text : "";
              const matches = text.match(/\{\{(\w+)\}\}/g) ?? [];
              for (const m of matches) {
                const key = m.replace(/[\{\}]/g, "");
                if (key === "1") values[key] = contactName;
                else if (key === "2") values[key] = agendamentoFormatted;
                else if (!values[key]) {
                  values[key] = String(customFields[key] ?? customFields.procedimento ?? customFields.clinica ?? "Centro do Sorriso");
                }
              }
            }
          }

          let sentSuccessfully = false;
          let externalId: string | null = null;
          const messageBody = buildInterpolatedText(metaTemplate?.components, values, schedule.template_name);

          // 1. Tenta envio oficial pela Meta Cloud API
          try {
            externalId = await sendTemplateForSession(admin, {
              organizationId: config.organization_id,
              to: rawPhone,
              name: schedule.template_name,
              language: schedule.template_language || "pt_BR",
              values,
            });
            sentSuccessfully = true;
          } catch (metaErr) {
            logger.warn("[appointment-reminders] Envio Meta Cloud API falhou, tentando fallback WAHA", {
              lead_id: lead.id,
              template: schedule.template_name,
              error: String(metaErr),
            });

            // 2. Fallback WAHA
            try {
              const wahaRes = await sendWAHA({
                sessionName: "default",
                chatId: `${rawPhone}@c.us`,
                text: messageBody,
              });
              if (wahaRes) {
                sentSuccessfully = true;
                externalId = typeof wahaRes === "object" && wahaRes !== null && "id" in wahaRes
                  ? String((wahaRes as { id: string }).id)
                  : null;
              }
            } catch (wahaErr) {
              logger.error("[appointment-reminders] Fallback WAHA também falhou", {
                lead_id: lead.id,
                error: String(wahaErr),
              });
            }
          }

          if (sentSuccessfully) {
            // Registra log de envio com offset_hours para evitar duplicatas do mesmo horário
            await admin.from("pipeline_reminder_sent_log").insert({
              organization_id: config.organization_id,
              lead_id: lead.id,
              config_id: config.id,
              agendamento_data: dataStr,
              offset_hours: schedule.offset_hours,
            });

            // Registra mensagem na tabela messages se houver contato associado
            if (contactId) {
              try {
                // Busca ou cria conversa
                let conversationId: string | null = null;
                const { data: conv } = await admin
                  .from("conversations")
                  .select("id")
                  .eq("organization_id", config.organization_id)
                  .eq("contact_id", contactId)
                  .order("updated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                conversationId = conv?.id ?? null;

                if (conversationId) {
                  await admin.from("messages").insert({
                    organization_id: config.organization_id,
                    conversation_id: conversationId,
                    contact_id: contactId,
                    type: "template",
                    direction: "outbound",
                    status: "sent",
                    body: messageBody,
                    template_name: schedule.template_name,
                    template_language: schedule.template_language || "pt_BR",
                    external_id: externalId,
                    sent_via: "ai",
                    sent_at: clock().toISOString(),
                  });
                }
              } catch (msgErr) {
                logger.warn("[appointment-reminders] Falha ao registrar linha em messages", { error: String(msgErr) });
              }
            }

            summary.sent++;

            void audit({
              action: "pipeline_reminder.sent",
              organizationId: config.organization_id,
              bypassedRls: true,
              metadata: {
                lead_id: lead.id,
                config_id: config.id,
                offset_hours: schedule.offset_hours,
                template: schedule.template_name,
                agendamento_data: dataStr,
                agendamento_hora: horaStr,
              },
            });

            logger.info("[appointment-reminders] Lembrete disparado com sucesso", {
              lead_id: lead.id,
              offset_hours: schedule.offset_hours,
              template: schedule.template_name,
              agendamento: `${dataStr} ${horaStr}`,
            });
          } else {
            summary.errors++;
          }
        }
      }
    } catch (configErr) {
      summary.errors++;
      logger.error("[appointment-reminders] Erro ao processar pipeline", {
        config_id: config.id,
        error: String(configErr),
      });
    }
  }

  return summary;
}

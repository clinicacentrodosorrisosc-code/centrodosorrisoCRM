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
import { getAdapter, resolveSessionRef, type ChannelSessionRef, type ChannelProvider } from "@/lib/channels";
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

/** Normaliza data para YYYY-MM-DD */
function normalizeDate(raw: string): string {
  if (!raw) return "";
  const clean = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split("/");
    return `${y}-${m}-${d}`;
  }
  return clean;
}

/** Normaliza hora para HH:mm */
function normalizeTime(raw: string): string {
  if (!raw) return "09:00";
  const clean = raw.trim().replace("h", ":");
  const match = clean.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1]!.padStart(2, "0");
    const m = match[2]!;
    return `${h}:${m}`;
  }
  return "09:00";
}

/**
 * Converte data + hora para Date em Brasília.
 * Retorna null se os valores são inválidos.
 */
function parseAgendamento(dataStr: string, horaStr: string): Date | null {
  const normDate = normalizeDate(dataStr);
  const normTime = normalizeTime(horaStr);
  if (!normDate || !/^\d{4}-\d{2}-\d{2}$/.test(normDate)) return null;
  const iso = `${normDate}T${normTime}:00${BRASILIA_OFFSET}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formata data/hora para texto pt-BR: "22/08/2026 às 14:30"
 */
function formatAgendamento(dataStr: string, horaStr: string): string {
  const normDate = normalizeDate(dataStr);
  const normTime = normalizeTime(horaStr);
  if (!normDate) return "";
  const parts = normDate.split("-");
  if (parts.length !== 3) return dataStr;
  const [ano, mes, dia] = parts;
  const formatted = `${dia}/${mes}/${ano}`;
  return normTime ? `${formatted} às ${normTime}` : formatted;
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
  return `Olá ${nome}! Lembramos do seu agendamento para ${dataHora}. (${fallbackTemplateName})`;
}

/**
 * Extrai data e hora do agendamento aceitando múltiplos nomes de propriedades em custom_fields
 */
function extractAgendamentoFields(custom: Record<string, unknown>): { dataStr: string; horaStr: string } {
  const dataStr = String(
    custom.agendamento_data ??
    custom.data_agendamento ??
    custom.appointment_date ??
    custom.data ??
    (typeof custom.agendamento === "object" && custom.agendamento !== null ? (custom.agendamento as Record<string, unknown>).data : "") ??
    "",
  ).trim();

  const horaStr = String(
    custom.agendamento_hora ??
    custom.hora_agendamento ??
    custom.appointment_time ??
    custom.hora ??
    (typeof custom.agendamento === "object" && custom.agendamento !== null ? (custom.agendamento as Record<string, unknown>).hora : "") ??
    "09:00",
  ).trim();

  return { dataStr, horaStr };
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
      // 2. Busca todas as etapas pertencentes ao pipeline
      const { data: stages } = await admin
        .from("crm_stages")
        .select("id")
        .eq("pipeline_id", config.pipeline_id);

      const allStageIds = (stages ?? []).map((s: { id: string }) => s.id);
      const stageFilter = (config.active_stage_ids as string[]) ?? [];
      const targetStageIds = stageFilter.length > 0 ? stageFilter : allStageIds;

      // 3. Busca leads do pipeline (abrangente: por pipeline_id OU por stage_id)
      let leadsQuery = admin
        .from("crm_leads")
        .select("id, title, pipeline_id, stage_id, custom_fields, contact_id, status")
        .eq("organization_id", config.organization_id);

      if (targetStageIds.length > 0) {
        leadsQuery = leadsQuery.or(`pipeline_id.eq.${config.pipeline_id},stage_id.in.(${targetStageIds.join(",")})`);
      } else {
        leadsQuery = leadsQuery.eq("pipeline_id", config.pipeline_id);
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
        // Ignora leads já finalizados como perdidos
        if (lead.status === "lost") continue;

        const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
        const { dataStr, horaStr } = extractAgendamentoFields(customFields);

        // Se o lead não tem data de agendamento preenchida, pula
        if (!dataStr) continue;

        const status = String(customFields.agendamento_status ?? "agendado").toLowerCase().trim();
        // Ignora se foi cancelado
        if (status === "cancelado") continue;

        summary.leads_evaluated++;

        const agendamento = parseAgendamento(dataStr, horaStr);
        if (!agendamento) continue; // data inválida

        // Se o agendamento já passou há mais de 1 hora, não envia
        if (agendamento.getTime() < now.getTime() - 60 * 60 * 1000) continue;

        // Itera sobre cada horário configurado (ex: 24h, 2h, etc.)
        for (const schedule of schedules) {
          summary.schedules_processed++;

          const offsetMs = schedule.offset_hours * 60 * 60 * 1000;
          const sendAt = new Date(agendamento.getTime() - offsetMs);

          // Janela máxima de disparo: de 5 minutos antes até 60 minutos após o horário ideal
          const MAX_LATE_WINDOW_MS = 60 * 60 * 1000; // 1 hora

          // Não envia se ainda não chegou o momento (com tolerância de 5 min)
          if (sendAt.getTime() > now.getTime() + CRON_WINDOW_MS) continue;

          // Não envia se a janela de disparo já passou há mais de 1 hora (evita disparar lembrete de 24h em agendamentos criados de última hora)
          if (now.getTime() > sendAt.getTime() + MAX_LATE_WINDOW_MS) continue;

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

          // Busca dados do contato (telefone correto: `phone_number`)
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
              .select("contact_id, contacts(id, phone_number, display_name, name)")
              .eq("id", lead.id)
              .maybeSingle();

            const c = (leadWithContact as unknown as { contact_id?: string; contacts?: { id?: string; phone_number?: string | null; display_name?: string | null; name?: string | null } | null })?.contacts;
            contactPhone = c?.phone_number?.trim() ?? null;
            if (c) {
              contactName = (c.name || c.display_name || lead.title || "Paciente").trim();
              if (c.id) contactId = c.id;
            }
          }

          let rawPhone = contactPhone ? contactPhone.replace(/\D/g, "") : "";
          if (!rawPhone) {
            summary.skipped_no_phone++;
            continue;
          }

          // Se o telefone tem 10 ou 11 dígitos (DDD + número no Brasil), prefixa com 55
          if ((rawPhone.length === 10 || rawPhone.length === 11) && !rawPhone.startsWith("55")) {
            rawPhone = `55${rawPhone}`;
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

          // Busca a sessão de canal ativa da organização
          const { data: channelSession } = await admin
            .from("channel_sessions")
            .select(`id, status, provider, waha_session_name, meta_phone_number_id, zernio_account_id`)
            .eq("organization_id", config.organization_id)
            .is("archived_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let sentSuccessfully = false;
          let externalId: string | null = null;
          const messageBody = buildInterpolatedText(metaTemplate?.components, values, schedule.template_name);

          if (channelSession) {
            try {
              const sessionRef = resolveSessionRef(channelSession as ChannelSessionRef);
              const adapter = getAdapter(channelSession.provider as ChannelProvider);

              if (schedule.template_name && adapter.sendTemplate) {
                const res = await adapter.sendTemplate({
                  sessionRef,
                  to: rawPhone,
                  name: schedule.template_name,
                  language: schedule.template_language || "pt_BR",
                  values,
                });
                externalId = res.externalId;
                sentSuccessfully = true;
              } else if (schedule.template_name && channelSession.provider === "meta_cloud") {
                externalId = await sendTemplateForSession(admin, {
                  organizationId: config.organization_id,
                  to: rawPhone,
                  name: schedule.template_name,
                  language: schedule.template_language || "pt_BR",
                  values,
                });
                sentSuccessfully = true;
              } else {
                // Envia como mensagem de texto formatada pelo canal ativo
                const res = await adapter.send({
                  sessionRef,
                  to: `${rawPhone}@c.us`,
                  kind: "text",
                  body: messageBody,
                });
                externalId = res.externalId;
                sentSuccessfully = true;
              }
            } catch (chanErr) {
              logger.warn("[appointment-reminders] Envio via adapter do canal falhou, tentando fallback direto", {
                lead_id: lead.id,
                error: String(chanErr),
              });
            }
          }

          // Fallback final direto se o adapter não foi executado ou falhou
          if (!sentSuccessfully) {
            try {
              externalId = await sendTemplateForSession(admin, {
                organizationId: config.organization_id,
                to: rawPhone,
                name: schedule.template_name,
                language: schedule.template_language || "pt_BR",
                values,
              });
              sentSuccessfully = true;
            } catch {
              try {
                const sessionName = channelSession?.waha_session_name || "default";
                const wahaRes = await sendWAHA({
                  sessionName,
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
                logger.error("[appointment-reminders] Todos os transportes falharam", {
                  lead_id: lead.id,
                  error: String(wahaErr),
                });
              }
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

            // Registra mensagem na tabela messages e vincula à conversa do chat
            try {
              if (!contactId && rawPhone) {
                const formattedPhone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
                const { data: existingContact } = await admin
                  .from("contacts")
                  .select("id")
                  .eq("organization_id", config.organization_id)
                  .or(`phone_number.eq.${formattedPhone},phone_number.eq.${rawPhone}`)
                  .maybeSingle();

                if (existingContact) {
                  contactId = existingContact.id;
                } else {
                  const { data: newContact } = await admin
                    .from("contacts")
                    .insert({
                      organization_id: config.organization_id,
                      name: contactName || "Paciente",
                      phone_number: formattedPhone,
                      source: "WhatsApp",
                    })
                    .select("id")
                    .maybeSingle();
                  if (newContact) {
                    contactId = newContact.id;
                  }
                }

                if (contactId) {
                  await admin
                    .from("crm_leads")
                    .update({ contact_id: contactId })
                    .eq("id", lead.id);
                }
              }

              if (contactId && channelSession?.id) {
                const { ensureConversation } = await import("@/lib/automation/start-conversation");
                const conversationId = await ensureConversation(
                  admin,
                  config.organization_id,
                  contactId,
                  channelSession.id,
                );

                if (conversationId) {
                  await admin.from("messages").insert({
                    organization_id: config.organization_id,
                    conversation_id: conversationId,
                    channel_session_id: channelSession.id,
                    contact_id: contactId,
                    type: "text",
                    direction: "outbound",
                    status: "delivered",
                    body: messageBody,
                    template_name: schedule.template_name,
                    template_language: schedule.template_language || "pt_BR",
                    external_id: externalId,
                    sent_via: "ai",
                    sent_at: clock().toISOString(),
                  });

                  await admin.from("conversations").update({
                    last_message_preview: messageBody.slice(0, 150),
                    last_message_at: clock().toISOString(),
                    last_message_direction: "outbound",
                    updated_at: clock().toISOString(),
                  }).eq("id", conversationId);
                }
              }
            } catch (msgErr) {
              logger.warn("[appointment-reminders] Falha ao registrar linha em messages", { error: String(msgErr) });
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

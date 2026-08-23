/**
 * POST /api/v1/pipelines/[id]/reminder/test
 *
 * Executa o teste de disparo de lembretes para um funil específico,
 * avaliando os leads cadastrados no funil e retornando diagnósticos detalhados.
 */
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateForSession } from "@/lib/channels/meta/send-template-for-session";
import { sendWAHA } from "@/lib/waha/send";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const BRASILIA_OFFSET = "-03:00";
const CRON_WINDOW_MS = 5 * 60 * 1000;

interface ScheduleItem {
  id: string;
  offset_hours: number;
  template_name: string;
  template_language: string;
  is_active: boolean;
}

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

function parseAgendamento(dataStr: string, horaStr: string): Date | null {
  const normDate = normalizeDate(dataStr);
  const normTime = normalizeTime(horaStr);
  if (!normDate || !/^\d{4}-\d{2}-\d{2}$/.test(normDate)) return null;
  const iso = `${normDate}T${normTime}:00${BRASILIA_OFFSET}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: pipelineId } = await params;

  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;
  const { org } = auth;

  const admin = createAdminClient();

  // Lê body se enviado do diálogo
  let bodyPayload: { schedules?: ScheduleItem[]; active_stage_ids?: string[]; is_active?: boolean } = {};
  try {
    bodyPayload = await req.json();
  } catch {
    bodyPayload = {};
  }

  // 1. Busca config salva no banco
  const { data: savedConfig } = await admin
    .from("pipeline_reminder_configs")
    .select("id, organization_id, pipeline_id, offset_hours, template_name, template_language, schedules, active_stage_ids, is_active")
    .eq("pipeline_id", pipelineId)
    .maybeSingle();

  // Resolve os schedules a testar (do payload enviado ou do banco)
  let schedules: ScheduleItem[] = [];
  if (Array.isArray(bodyPayload.schedules) && bodyPayload.schedules.length > 0) {
    schedules = bodyPayload.schedules.filter((s) => s.is_active !== false && !!s.template_name);
  } else if (savedConfig && Array.isArray(savedConfig.schedules) && savedConfig.schedules.length > 0) {
    schedules = (savedConfig.schedules as ScheduleItem[]).filter((s) => s.is_active !== false && !!s.template_name);
  } else if (savedConfig?.template_name) {
    schedules = [
      {
        id: "default",
        offset_hours: savedConfig.offset_hours ?? 2,
        template_name: savedConfig.template_name,
        template_language: savedConfig.template_language ?? "pt_BR",
        is_active: true,
      },
    ];
  }

  const activeStageIds = bodyPayload.active_stage_ids ?? savedConfig?.active_stage_ids ?? [];

  // 2. Busca TODOS os leads do pipeline
  const { data: leads, error: leadsErr } = await admin
    .from("crm_leads")
    .select("id, title, stage_id, custom_fields, contact_id, status")
    .eq("organization_id", org.orgId)
    .eq("pipeline_id", pipelineId)
    .neq("status", "archived");

  if (leadsErr) {
    return fail("internal_error", leadsErr.message, 500);
  }

  const now = new Date();
  const summary = {
    total_leads_in_pipeline: (leads ?? []).length,
    leads_evaluated: 0,
    leads_with_dates: [] as Array<{
      id: string;
      title: string;
      agendamento: string;
      phone: string | null;
      status: string;
      diagnostico: string;
    }>,
    sent: 0,
    skipped_already_sent: 0,
    skipped_no_phone: 0,
    skipped_not_in_window: 0,
    errors: 0,
  };

  if (!leads || leads.length === 0) {
    return ok({
      pipeline_id: pipelineId,
      summary,
      message: "Nenhum lead encontrado neste funil.",
    });
  }

  for (const lead of leads) {
    if (lead.status === "lost") continue;

    // Filtro de etapas se configurado
    if (activeStageIds.length > 0 && !activeStageIds.includes(lead.stage_id)) {
      continue;
    }

    const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const { dataStr, horaStr } = extractAgendamentoFields(customFields);

    if (!dataStr) continue;

    summary.leads_evaluated++;

    const agendamento = parseAgendamento(dataStr, horaStr);
    if (!agendamento) {
      summary.leads_with_dates.push({
        id: lead.id,
        title: lead.title,
        agendamento: `${dataStr} ${horaStr}`,
        phone: null,
        status: "invalid_date",
        diagnostico: "Data ou hora com formato inválido.",
      });
      continue;
    }

    // Busca dados do contato
    let contactPhone: string | null = null;
    let contactName: string = lead.title || "Paciente";
    const contactId = lead.contact_id;

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

    let rawPhone = contactPhone ? contactPhone.replace(/\D/g, "") : "";
    if ((rawPhone.length === 10 || rawPhone.length === 11) && !rawPhone.startsWith("55")) {
      rawPhone = `55${rawPhone}`;
    }

    if (schedules.length === 0) {
      summary.leads_with_dates.push({
        id: lead.id,
        title: lead.title,
        agendamento: formatAgendamento(dataStr, horaStr),
        phone: rawPhone || null,
        status: "no_schedules",
        diagnostico: "Nenhum horário/template ativo configurado no lembrete.",
      });
      continue;
    }

    for (const schedule of schedules) {
      const offsetMs = schedule.offset_hours * 60 * 60 * 1000;
      const sendAt = new Date(agendamento.getTime() - offsetMs);

      const agendamentoFormatted = formatAgendamento(dataStr, horaStr);

      if (!rawPhone) {
        summary.skipped_no_phone++;
        summary.leads_with_dates.push({
          id: lead.id,
          title: lead.title,
          agendamento: agendamentoFormatted,
          phone: null,
          status: "skipped_no_phone",
          diagnostico: "Contato sem telefone cadastrado.",
        });
        continue;
      }

      // Verifica se já enviou
      const configId = savedConfig?.id ?? "test_config";
      const { data: existing } = await admin
        .from("pipeline_reminder_sent_log")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("config_id", configId)
        .eq("agendamento_data", dataStr)
        .eq("offset_hours", schedule.offset_hours)
        .maybeSingle();

      if (existing) {
        summary.skipped_already_sent++;
        summary.leads_with_dates.push({
          id: lead.id,
          title: lead.title,
          agendamento: agendamentoFormatted,
          phone: rawPhone,
          status: "already_sent",
          diagnostico: `Lembrete de ${schedule.offset_hours}h antes já havia sido enviado para este agendamento.`,
        });
        continue;
      }

      // Verifica janela de envio
      const isDue = sendAt.getTime() <= now.getTime() + CRON_WINDOW_MS && now.getTime() <= agendamento.getTime();

      if (!isDue) {
        summary.skipped_not_in_window++;
        const minutosRestantes = Math.round((sendAt.getTime() - now.getTime()) / (60 * 1000));
        summary.leads_with_dates.push({
          id: lead.id,
          title: lead.title,
          agendamento: agendamentoFormatted,
          phone: rawPhone,
          status: "scheduled_future",
          diagnostico: minutosRestantes > 0
            ? `Disparo programado para ${schedule.offset_hours}h antes (em aprox. ${minutosRestantes} min).`
            : "Agendamento já ocorreu ou passou do prazo.",
        });
        continue;
      }

      // DISPARO REAL
      const { data: metaTemplate } = await admin
        .from("meta_templates")
        .select("name, language, components, status")
        .eq("organization_id", org.orgId)
        .eq("name", schedule.template_name)
        .maybeSingle();

      const values: Record<string, string> = {
        "1": contactName,
        "2": agendamentoFormatted,
        "body_1": contactName,
        "body_2": agendamentoFormatted,
      };

      const messageBody = buildInterpolatedText(metaTemplate?.components, values, schedule.template_name);

      const { data: channelSession } = await admin
        .from("channel_sessions")
        .select("id, waha_session_name, provider, status, phone_number")
        .eq("organization_id", org.orgId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const sessionName = channelSession?.waha_session_name || "default";

      let sentSuccessfully = false;
      try {
        await sendTemplateForSession(admin, {
          organizationId: org.orgId,
          to: rawPhone,
          name: schedule.template_name,
          language: schedule.template_language || "pt_BR",
          values,
        });
        sentSuccessfully = true;
      } catch (metaErr) {
        logger.warn("[test-reminders] Meta API falhou, tentando WAHA", { error: String(metaErr) });
        try {
          const wahaRes = await sendWAHA({
            sessionName,
            chatId: `${rawPhone}@c.us`,
            text: messageBody,
          });
          if (wahaRes) sentSuccessfully = true;
        } catch (wahaErr) {
          logger.error("[test-reminders] WAHA falhou", { error: String(wahaErr) });
        }
      }

      if (sentSuccessfully) {
        summary.sent++;
        if (savedConfig?.id) {
          await admin.from("pipeline_reminder_sent_log").insert({
            organization_id: org.orgId,
            lead_id: lead.id,
            config_id: savedConfig.id,
            agendamento_data: dataStr,
            offset_hours: schedule.offset_hours,
          });
        }
        summary.leads_with_dates.push({
          id: lead.id,
          title: lead.title,
          agendamento: agendamentoFormatted,
          phone: rawPhone,
          status: "sent_now",
          diagnostico: `Disparado com sucesso agora (${schedule.template_name})!`,
        });
      } else {
        summary.errors++;
        summary.leads_with_dates.push({
          id: lead.id,
          title: lead.title,
          agendamento: agendamentoFormatted,
          phone: rawPhone,
          status: "send_failed",
          diagnostico: "Falha ao enviar mensagem pelo canal WhatsApp.",
        });
      }
    }
  }

  return ok({
    pipeline_id: pipelineId,
    summary,
  });
}

/**
 * GET /api/v1/leads/pending-attendance
 *
 * Retorna leads que possuem agendamento cuja data e hora já chegaram (ou estão a 15 min),
 * mas cujo status de presença ainda não foi definido (status = "agendado" ou pendente).
 *
 * Também engatilha em background a verificação de lembretes via WhatsApp
 * para garantir que os disparos aconteçam continuamente mesmo sem cron externo.
 */
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const BRASILIA_OFFSET = "-03:00";

export interface PendingAttendanceLead {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  agendamento_data: string;
  agendamento_hora: string;
  procedimento: string;
  contact_id: string | null;
  phone_number: string | null;
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

export async function GET(_req: NextRequest): Promise<Response> {
  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;
  const { org } = auth;

  const admin = createAdminClient();

  // Executa o processador de lembretes WhatsApp de forma assíncrona garantida
  try {
    const { processAppointmentReminders } = await import("@/lib/appointment-reminders/processor");
    await processAppointmentReminders(admin);
  } catch (procErr) {
    logger.warn("[pending-attendance] processAppointmentReminders falhou", { error: String(procErr) });
  }

  const { data: leads, error } = await admin
    .from("crm_leads")
    .select(`
      id,
      title,
      pipeline_id,
      stage_id,
      custom_fields,
      contact_id,
      contacts:contact_id(phone_number, name, display_name)
    `)
    .eq("organization_id", org.orgId)
    .neq("status", "lost");

  if (error) {
    return fail("internal_error", error.message, 500);
  }

  const now = new Date();
  const pending: PendingAttendanceLead[] = [];

  for (const lead of leads ?? []) {
    const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const { dataStr: rawData, horaStr: rawHora } = extractAgendamentoFields(custom);
    const status = String(custom.agendamento_status ?? "agendado").toLowerCase().trim();

    if (!rawData) continue;
    // Só avalia se ainda não foi marcado como compareceu, faltou ou cancelado
    if (status !== "agendado" && status !== "" && status !== "remarcado") continue;

    const dataStr = normalizeDate(rawData);
    const horaStr = normalizeTime(rawHora);

    const iso = `${dataStr}T${horaStr}:00${BRASILIA_OFFSET}`;
    const agendamentoDate = new Date(iso);
    if (isNaN(agendamentoDate.getTime())) continue;

    const diffMs = now.getTime() - agendamentoDate.getTime();
    const diffMinutes = diffMs / (60 * 1000);

    // Considera pendente se o horário está a 15 min de acontecer ou se já passou (até 48h atrás)
    if (diffMinutes >= -15 && diffMinutes <= 48 * 60) {
      const contactObj = lead.contacts as { phone_number?: string | null; name?: string | null; display_name?: string | null } | null;
      pending.push({
        id: lead.id,
        title: lead.title,
        pipeline_id: lead.pipeline_id,
        stage_id: lead.stage_id,
        agendamento_data: dataStr,
        agendamento_hora: horaStr,
        procedimento: String(custom.procedimento ?? custom.procedure ?? ""),
        contact_id: lead.contact_id,
        phone_number: contactObj?.phone_number ?? null,
      });
    }
  }

  // Ordena pelos mais próximos/recentes
  pending.sort((a, b) => `${b.agendamento_data} ${b.agendamento_hora}`.localeCompare(`${a.agendamento_data} ${a.agendamento_hora}`));

  return ok({ pending });
}

/**
 * GET /api/v1/leads/pending-attendance
 *
 * Retorna leads que possuem agendamento cuja data e hora já chegaram (hoje),
 * mas cujo status de presença ainda não foi definido (status = "agendado").
 */
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function GET(_req: NextRequest): Promise<Response> {
  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;
  const { org } = auth;

  const admin = createAdminClient();

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
    .is("won_at", null)
    .is("lost_at", null);

  if (error) {
    return fail("internal_error", error.message, 500);
  }

  const now = new Date();
  const pending: PendingAttendanceLead[] = [];

  for (const lead of leads ?? []) {
    const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const dataStr = String(custom.agendamento_data ?? "").trim();
    const horaStr = String(custom.agendamento_hora ?? "").trim() || "09:00";
    const status = String(custom.agendamento_status ?? "agendado").toLowerCase();

    // Só avalia se tem data e se o status ainda é 'agendado'
    if (!dataStr || (status !== "agendado" && status !== "")) continue;

    const iso = `${dataStr}T${horaStr}:00${BRASILIA_OFFSET}`;
    const agendamentoDate = new Date(iso);
    if (isNaN(agendamentoDate.getTime())) continue;

    // Alerta se o horário já chegou (ou faltam até 5 min) e se a consulta foi nas últimas 8 horas
    const diffMs = now.getTime() - agendamentoDate.getTime();
    const diffMinutes = diffMs / (60 * 1000);

    // Janela: de 5 minutos antes do horário até 8 horas depois
    if (diffMinutes >= -5 && diffMinutes <= 8 * 60) {
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

  // Ordena pelo horário do agendamento (mais recentes primeiro)
  pending.sort((a, b) => `${b.agendamento_data} ${b.agendamento_hora}`.localeCompare(`${a.agendamento_data} ${a.agendamento_hora}`));

  return ok({ pending });
}

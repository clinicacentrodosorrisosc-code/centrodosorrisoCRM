/**
 * POST /api/v1/leads/[id]/attendance
 *
 * Registra a presença ou falta de um lead na consulta/avaliação e move o card
 * automaticamente para a etapa de funil correspondente:
 *   - "compareceu" → Etapa "Orçamento"
 *   - "faltou"      → Etapa "Não compareceu"
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["compareceu", "faltou", "remarcado"]),
  nova_data: z.string().optional(),
  nova_hora: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: leadId } = await params;

  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;
  const { org, user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON inválido.", 400);
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", parsed.error.issues[0]?.message ?? "Payload inválido.", 400);
  }

  const { status, nova_data, nova_hora } = parsed.data;
  const admin = createAdminClient();

  // 1. Busca o lead
  const { data: lead, error: leadErr } = await admin
    .from("crm_leads")
    .select("id, title, pipeline_id, stage_id, custom_fields, contact_id")
    .eq("id", leadId)
    .eq("organization_id", org.orgId)
    .maybeSingle();

  if (leadErr) return fail("internal_error", leadErr.message, 500);
  if (!lead) return fail("not_found", "Lead não encontrado.", 404);

  const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;

  // 2. Busca etapas do pipeline
  const { data: stages, error: stagesErr } = await admin
    .from("crm_stages")
    .select("id, name, is_won, is_lost")
    .eq("pipeline_id", lead.pipeline_id);

  if (stagesErr) {
    logger.error("[lead-attendance] Erro ao buscar etapas", { error: stagesErr.message });
  }

  let targetStage: { id: string; name: string } | null = null;

  if (stages && stages.length > 0) {
    if (status === "compareceu") {
      // Procura etapa de Orçamento
      const orcStage = stages.find(
        (s: { id: string; name: string; is_won: boolean; is_lost: boolean }) =>
          /or[çc]amento|em\s*negocia[cç][aã]o|proposta/i.test(s.name) && !s.is_won && !s.is_lost,
      );
      if (orcStage) targetStage = orcStage;
    } else if (status === "faltou") {
      // Procura etapa de Não Compareceu / Faltou
      const noShowStage = stages.find(
        (s: { id: string; name: string; is_won: boolean; is_lost: boolean }) =>
          /n[aã]o\s*compareceu|faltou|falta|ausente|no[-\s]?show/i.test(s.name),
      );
      if (noShowStage) targetStage = noShowStage;
    } else if (status === "remarcado" && nova_data) {
      // Procura etapa de Agendado (excluindo explicitamente "Aguardando agendamento")
      const agendadoStage =
        stages.find(
          (s: { id: string; name: string; is_won: boolean; is_lost: boolean }) =>
            /^agendad[oa]s?$/i.test(s.name.trim()) && !s.is_won && !s.is_lost,
        ) ??
        stages.find(
          (s: { id: string; name: string; is_won: boolean; is_lost: boolean }) =>
            /^(agendad[oa]s?|consulta\s*agendada|avalia[cç][aã]o\s*agendada)/i.test(s.name.trim()) &&
            !/aguardando|espera/i.test(s.name) &&
            !s.is_won &&
            !s.is_lost,
        );
      if (agendadoStage) targetStage = agendadoStage;
    }
  }

  // 3. Atualiza o lead
  let nextCustomFields: Record<string, unknown> = {
    ...customFields,
    agendamento_status: status,
  };

  if (status === "remarcado") {
    const remarcacoesCount = (Number(customFields.remarcacoes_count) || 0) + 1;
    nextCustomFields = {
      ...customFields,
      agendamento_data: nova_data || customFields.agendamento_data,
      agendamento_hora: nova_hora || customFields.agendamento_hora || "09:00",
      agendamento_status: "agendado",
      remarcacoes_count: remarcacoesCount,
      ultima_remarcacao_at: new Date().toISOString(),
    };
  }

  const updatePayload: Record<string, unknown> = {
    custom_fields: nextCustomFields,
    updated_at: new Date().toISOString(),
  };

  if (targetStage && targetStage.id !== lead.stage_id) {
    updatePayload.stage_id = targetStage.id;
    updatePayload.position_in_stage = 1000;
  }

  const { data: updatedLead, error: updateErr } = await admin
    .from("crm_leads")
    .update(updatePayload)
    .eq("id", lead.id)
    .select("id, title, stage_id, custom_fields")
    .single();

  if (updateErr) {
    logger.error("[lead-attendance] Erro ao atualizar lead", { error: updateErr.message });
    return fail("internal_error", updateErr.message, 500);
  }

  // 4. Registra atividade na linha do tempo
  let activityType = "attendance_confirmed";
  let activityReason = "Paciente compareceu à consulta";
  if (status === "faltou") {
    activityType = "attendance_no_show";
    activityReason = "Paciente não compareceu (Falta registrada)";
  } else if (status === "remarcado") {
    activityType = "appointment_rescheduled";
    activityReason = `Consulta remarcada para ${nova_data ?? ""} às ${nova_hora ?? ""}`;
  }

  void admin.from("crm_lead_activities").insert({
    organization_id: org.orgId,
    lead_id: lead.id,
    contact_id: lead.contact_id,
    source_module: "crm",
    type: activityType,
    payload: {
      status,
      nova_data: nova_data ?? null,
      nova_hora: nova_hora ?? null,
      moved_to_stage: targetStage ? { id: targetStage.id, name: targetStage.name } : null,
      previous_stage_id: lead.stage_id,
    },
    metadata: {},
    performed_at: new Date().toISOString(),
    performed_by_user_id: user.id,
    actor_kind: "user",
    reason: activityReason,
  });

  void audit({
    action: "lead.attendance_updated",
    organizationId: org.orgId,
    actorUserId: user.id,
    metadata: {
      lead_id: lead.id,
      status,
      nova_data: nova_data ?? null,
      nova_hora: nova_hora ?? null,
      target_stage: targetStage?.name ?? null,
    },
  });

  return ok({
    lead: updatedLead,
    status,
    moved_to_stage: targetStage ? { id: targetStage.id, name: targetStage.name } : null,
  });
}

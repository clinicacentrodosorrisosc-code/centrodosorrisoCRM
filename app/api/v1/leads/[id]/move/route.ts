/**
 * POST /api/v1/leads/[id]/move
 *
 * Moves a lead within its pipeline (P-01: cross-pipeline moves require clone).
 * Uses Pattern B optimistic concurrency (P-08): client sends `expected_updated_at`,
 * UPDATE filters by it, zero rows affected ⇒ 409 lead_stage_changed_concurrent.
 *
 * Status transitions are driven by trigger `fn_crm_lead_close_on_stage` (P-02);
 * this endpoint NEVER sets `status` directly.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { moveLeadSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { emitLeadActivity, stageChangeReason } from "@/lib/leads/activity-emitter";
import { registraFalhaDeAtividade } from "@/lib/leads/activity-write-failure";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: leadId } = await ctx.params;

  const supabase = await createClient();
  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const user = authz.user;

  let input;
  try {
    input = await validateRequest(moveLeadSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // Fetch current lead (RLS scoped).
  const { data: lead, error: selErr } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (selErr) {
    return fail("internal_error", selErr.message, 500, { requestId });
  }
  if (!lead) {
    return fail("not_found", "Lead não encontrado.", 404, { requestId });
  }

  // Fetch target stage to validate same pipeline (P-01).
  const { data: stage, error: stageErr } = await supabase
    .from("crm_stages")
    .select("id, pipeline_id, name")
    .eq("id", input.stage_id)
    .maybeSingle();

  if (stageErr) {
    return fail("internal_error", stageErr.message, 500, { requestId });
  }
  if (!stage) {
    return fail("not_found", "Stage não encontrado.", 404, { requestId });
  }
  if (stage.pipeline_id !== lead.pipeline_id) {
    return fail(
      "pipeline_immutable_use_clone",
      "Move cross-pipeline não é permitido. Clone o lead para o pipeline alvo.",
      422,
      { requestId },
    );
  }

  // Sincronização automática do agendamento quando o lead é movido de etapa
  const targetName = stage?.name ?? "";
  const isNoShowStage = /n[aã]o\s*compareceu|faltou|no[-\s]?show/i.test(targetName);
  const isAttendedStage = /compareceu|atendido|avaliado|avalia[cç][aã]o\s*realizada|or[çc]amento|proposta|em\s*negocia[cç][aã]o/i.test(targetName);

  const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
  let nextCustomFields = customFields;
  if (isNoShowStage && customFields.agendamento_status !== "faltou") {
    nextCustomFields = { ...customFields, agendamento_status: "faltou" };
  } else if (isAttendedStage && customFields.agendamento_status !== "compareceu") {
    nextCustomFields = { ...customFields, agendamento_status: "compareceu" };
  }

  // OCC update com resiliência para evitar falsos positivos de concorrência
  let { data: updated, error: updErr } = await supabase
    .from("crm_leads")
    .update({
      stage_id: input.stage_id,
      position_in_stage: input.position_in_stage,
      custom_fields: nextCustomFields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("updated_at", input.expected_updated_at)
    .select("id")
    .maybeSingle();

  if (!updated && !updErr) {
    // Fallback: se o lead ainda pertence a este pipeline e organização, atualiza com sucesso
    const { data: retryUpdated, error: retryErr } = await supabase
      .from("crm_leads")
      .update({
        stage_id: input.stage_id,
        position_in_stage: input.position_in_stage,
        custom_fields: nextCustomFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("pipeline_id", lead.pipeline_id)
      .select("id")
      .maybeSingle();

    if (!retryErr && retryUpdated) {
      updated = retryUpdated;
    }
  }

  if (updErr) {
    return fail("internal_error", updErr.message, 500, { requestId });
  }

  if (!updated) {
    // Concurrent edit. Re-fetch current to surface the latest updated_at.
    const { data: current } = await supabase
      .from("crm_leads")
      .select("updated_at")
      .eq("id", leadId)
      .maybeSingle();
    return fail(
      "lead_stage_changed_concurrent",
      "Lead foi modificado por outro usuário. Recarregue e tente novamente.",
      409,
      {
        details: { current_updated_at: current?.updated_at ?? null },
        requestId,
      },
    );
  }

  // Re-SELECT so trigger-driven status/closed_at changes are reflected.
  const { data: fresh } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  const finalLead = fresh ?? lead;

  // Wave 3 (CORE 2): esta é a rota que o BOARD usa — arrastar o card passa por
  // aqui, não pelo moveLeadHandler. O emissor é o mesmo dos outros escritores
  // (lib/leads/activity-emitter), para os quatro caminhos escreverem a mesma
  // linha na timeline.
  const { data: fromStage } = await supabase
    .from("crm_stages")
    .select("name")
    .eq("id", lead.stage_id)
    .maybeSingle();

  const atividade = await emitLeadActivity(supabase, {
    organizationId: lead.organization_id,
    leadId,
    contactId: (lead as { contact_id?: string | null }).contact_id ?? null,
    type: "stage_changed",
    sourceModule: "crm",
    sourceId: leadId,
    actor: { type: "user", id: user.id },
    reason: stageChangeReason(fromStage?.name ?? null, stage.name),
    payload: {
      from_stage_id: lead.stage_id,
      to_stage_id: input.stage_id,
      pipeline_id: lead.pipeline_id,
    },
  });
  if (!atividade.ok) {
    // Mesma política do handler: mutação já ocorrida não bloqueia, mas o rastro
    // perdido é contado em vez de sumir num log de processo.
    await registraFalhaDeAtividade(supabase, {
      organizationId: lead.organization_id,
      leadId,
      tipo: "stage_changed",
      origem: "leads/[id]/move",
      erro: atividade.error,
      requestId,
    });
  }

  // Emit domain event (fire-and-forget; trigger NEVER does HTTP — workers do).
  await supabase
    .rpc("emit_event", {
      p_event_type: "lead.stage_changed",
      p_entity_kind: "crm_lead",
      p_entity_id: leadId,
      p_payload: {
        from_stage_id: lead.stage_id,
        to_stage_id: input.stage_id,
        position_in_stage: input.position_in_stage,
        status: finalLead.status,
      },
      p_metadata: { request_id: requestId, actor_user_id: user.id },
      p_organization_id: lead.organization_id,
    })
    .then(({ error }) => {
      if (error) console.error("[lead.move] emit_event failed", error.message);
    });

  await audit({
    action: "lead.moved",
    actorUserId: user.id,
    organizationId: lead.organization_id,
    resourceType: "crm_lead",
    resourceId: leadId,
    requestId,
    metadata: {
      from_stage_id: lead.stage_id,
      to_stage_id: input.stage_id,
      position_in_stage: input.position_in_stage,
    },
  });

  // Dispara o processamento imediato de follow-up sem esperar por crons
  const { triggerImmediateFollowupProcessing } = await import("@/lib/followup/instant-trigger");
  void triggerImmediateFollowupProcessing(lead.organization_id);

  return ok(finalLead, { requestId });
}

/**
 * GET/PUT/DELETE /api/v1/pipelines/[id]/reminder
 *
 * Gerencia a configuração de lembrete de agendamento de um pipeline.
 *
 * GET  — Devolve a config atual (ou 404 se não existe).
 * PUT  — Cria ou atualiza (upsert) a config.
 * DELETE — Remove a config.
 *
 * Auth: requireRole("manager") para escrita; "member" para leitura.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  is_active: z.boolean().default(true),
  offset_hours: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(24)]).default(2),
  template_name: z.string().min(1, "template_name é obrigatório"),
  template_language: z.string().default("pt_BR"),
  /** UUIDs das etapas. Array vazio = todas as etapas do pipeline. */
  active_stage_ids: z.array(z.string().uuid()).default([]),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: pipelineId } = await params;

  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;
  const { org } = auth;

  const admin = createAdminClient();

  // Valida que o pipeline pertence à org
  const { data: pipeline, error: pipelineErr } = await admin
    .from("crm_pipelines")
    .select("id, organization_id")
    .eq("id", pipelineId)
    .eq("organization_id", org.orgId)
    .maybeSingle();

  if (pipelineErr) return fail("internal_error", pipelineErr.message, 500);
  if (!pipeline) return fail("not_found", "Pipeline não encontrado.", 404);

  const { data: config, error } = await admin
    .from("pipeline_reminder_configs")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .eq("organization_id", org.orgId)
    .maybeSingle();

  if (error) return fail("internal_error", error.message, 500);
  if (!config) return fail("not_found", "Nenhum lembrete configurado para este pipeline.", 404);

  return ok({ config });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: pipelineId } = await params;

  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;
  const { org, user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON inválido.", 400);
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", parsed.error.issues[0]?.message ?? "Payload inválido.", 400);
  }

  const admin = createAdminClient();

  // Valida que o pipeline pertence à org
  const { data: pipeline, error: pipelineErr } = await admin
    .from("crm_pipelines")
    .select("id, organization_id")
    .eq("id", pipelineId)
    .eq("organization_id", org.orgId)
    .maybeSingle();

  if (pipelineErr) return fail("internal_error", pipelineErr.message, 500);
  if (!pipeline) return fail("not_found", "Pipeline não encontrado.", 404);

  // Valida que as etapas pertencem ao pipeline, se informadas
  if (parsed.data.active_stage_ids.length > 0) {
    const { data: stages } = await admin
      .from("crm_stages")
      .select("id")
      .eq("pipeline_id", pipelineId)
      .in("id", parsed.data.active_stage_ids);

    const validIds = new Set((stages ?? []).map((s: { id: string }) => s.id));
    const invalid = parsed.data.active_stage_ids.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return fail("validation_error", `Etapas não pertencem a este pipeline: ${invalid.join(", ")}`, 400);
    }
  }

  const payload = {
    organization_id: org.orgId,
    pipeline_id: pipelineId,
    is_active: parsed.data.is_active,
    offset_hours: parsed.data.offset_hours,
    template_name: parsed.data.template_name,
    template_language: parsed.data.template_language,
    active_stage_ids: parsed.data.active_stage_ids,
    updated_at: new Date().toISOString(),
  };

  const { data: config, error } = await admin
    .from("pipeline_reminder_configs")
    .upsert(payload, { onConflict: "pipeline_id" })
    .select()
    .single();

  if (error) {
    logger.error("[pipeline-reminder] Erro ao salvar config", { error: error.message });
    return fail("internal_error", error.message, 500);
  }

  void audit({
    action: "pipeline_reminder.config_saved",
    organizationId: org.orgId,
    actorUserId: user.id,
    metadata: {
      pipeline_id: pipelineId,
      offset_hours: parsed.data.offset_hours,
      template_name: parsed.data.template_name,
      active_stage_ids: parsed.data.active_stage_ids,
    },
  });

  return ok({ config }, { status: 200 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: pipelineId } = await params;

  const auth = await requireRole("manager");
  if (!auth.ok) return auth.response;
  const { org, user } = auth;

  const admin = createAdminClient();

  // Valida que o pipeline pertence à org
  const { data: pipeline, error: pipelineErr } = await admin
    .from("crm_pipelines")
    .select("id, organization_id")
    .eq("id", pipelineId)
    .eq("organization_id", org.orgId)
    .maybeSingle();

  if (pipelineErr) return fail("internal_error", pipelineErr.message, 500);
  if (!pipeline) return fail("not_found", "Pipeline não encontrado.", 404);

  const { error } = await admin
    .from("pipeline_reminder_configs")
    .delete()
    .eq("pipeline_id", pipelineId)
    .eq("organization_id", org.orgId);

  if (error) return fail("internal_error", error.message, 500);

  void audit({
    action: "pipeline_reminder.config_deleted",
    organizationId: org.orgId,
    actorUserId: user.id,
    metadata: { pipeline_id: pipelineId },
  });

  return ok({ deleted: true });
}

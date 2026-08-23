/**
 * GET/PUT/DELETE /api/v1/pipelines/[id]/reminder
 *
 * Gerencia a configuração de lembrete de agendamento de um pipeline.
 * Suporta múltiplos horários configuráveis (ex: 24h E 2h antes) com
 * templates de mensagem independentes.
 *
 * GET  — Devolve a config atual (ou 404 se não existe).
 * PUT  — Cria ou atualiza (upsert) a config com schedules.
 * DELETE — Remove a config.
 *
 * Auth: requireRole("manager") para escrita; "viewer" para leitura.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const scheduleItemSchema = z.object({
  id: z.string(),
  offset_hours: z.number().int().min(1),
  template_name: z.string().min(1, "template_name é obrigatório"),
  template_language: z.string().default("pt_BR"),
  is_active: z.boolean().default(true),
});

const putSchema = z.object({
  is_active: z.boolean().default(true),
  offset_hours: z.number().int().optional(),
  template_name: z.string().optional(),
  template_language: z.string().optional(),
  schedules: z.array(scheduleItemSchema).default([]),
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

  // Normaliza schedules caso a linha venha de base antiga
  const normalizedSchedules = Array.isArray(config.schedules) && config.schedules.length > 0
    ? config.schedules
    : config.template_name
      ? [
          {
            id: "legacy",
            offset_hours: config.offset_hours ?? 2,
            template_name: config.template_name,
            template_language: config.template_language ?? "pt_BR",
            is_active: config.is_active ?? true,
          },
        ]
      : [];

  return ok({ config: { ...config, schedules: normalizedSchedules } });
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

  const primarySchedule = parsed.data.schedules[0];

  const payload = {
    organization_id: org.orgId,
    pipeline_id: pipelineId,
    is_active: parsed.data.is_active,
    offset_hours: primarySchedule?.offset_hours ?? parsed.data.offset_hours ?? 2,
    template_name: primarySchedule?.template_name ?? parsed.data.template_name ?? "",
    template_language: primarySchedule?.template_language ?? parsed.data.template_language ?? "pt_BR",
    schedules: parsed.data.schedules,
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
      schedules: parsed.data.schedules,
      active_stage_ids: parsed.data.active_stage_ids,
    },
  });

  // Dispara o processador em background imediatamente para cobrir leads já na janela
  if (parsed.data.is_active) {
    import("@/lib/appointment-reminders/processor")
      .then(({ processAppointmentReminders }) => processAppointmentReminders(admin))
      .catch((err) => logger.warn("[pipeline-reminder] Disparo imediato falhou", { error: String(err) }));
  }

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

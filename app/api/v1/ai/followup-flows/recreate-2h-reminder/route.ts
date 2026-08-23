import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // 1. Resolver Organização
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";
  const querySecret = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
  const provided = bearer || headerSecret || querySecret;

  const accepted = [
    env.INTERNAL_CRON_SECRET,
    env.INTERNAL_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean) as string[];

  let orgId: string | null = null;
  const admin = createAdminClient();

  if (provided && accepted.includes(provided)) {
    // Modo secreto: pega a primeira organização ativa
    const { data: org } = await admin.from("organizations").select("id").limit(1).maybeSingle();
    orgId = org?.id ?? null;
  } else {
    // Modo usuário logado
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      orgId = membership?.organization_id ?? null;
    }
  }

  if (!orgId) {
    return fail("unauthorized", "Organização não identificada.", 401, { requestId });
  }

  // 2. Localizar etapa de Agendamento no CRM
  const { data: stages } = await admin
    .from("crm_stages")
    .select("id, pipeline_id, name")
    .eq("organization_id", orgId)
    .order("position", { ascending: true });

  const agendamentoStage =
    (stages ?? []).find((s) => /agend|avalia[cç][aã]o\s*agendada|visita/i.test(s.name)) ??
    (stages ?? [])[0];

  if (!agendamentoStage) {
    return fail("not_found", "Nenhuma etapa de funil encontrada para vincular o agendamento.", 404, { requestId });
  }

  // 3. Localizar template de mensagem
  const { data: metaTemplates } = await admin
    .from("meta_templates")
    .select("name, status")
    .eq("organization_id", orgId)
    .eq("status", "APPROVED")
    .limit(1);

  const { data: msgTemplates } = await admin
    .from("message_templates")
    .select("id, name")
    .eq("organization_id", orgId)
    .limit(1);

  const templateName =
    metaTemplates?.[0]?.name ??
    msgTemplates?.[0]?.name ??
    "lembrete_consulta";

  // 4. Limpar/arquivar fluxos antigos de lembrete
  const { data: oldPointers } = await admin
    .from("followup_flow_pointers")
    .select("id, name")
    .eq("organization_id", orgId);

  const pointersToDelete = (oldPointers ?? []).filter((p) =>
    /lembrete|agend/i.test(p.name),
  );

  for (const p of pointersToDelete) {
    await admin.from("followup_enrollments").delete().eq("pointer_id", p.id);
    await admin.from("followup_flow_pointers").delete().eq("id", p.id);
  }

  // 5. Construir Grafo Limpo e 100% aderente ao flowGraphSchema
  const graph = {
    nodes: [
      {
        id: "node_trigger",
        type: "trigger" as const,
        label: "Início: Mudança de Etapa",
        position: { x: 250, y: 50 },
        config: {},
      },
      {
        id: "node_wait_2h",
        type: "wait" as const,
        label: "Aguardar 2h antes da Consulta",
        position: { x: 250, y: 160 },
        config: {
          mode: "before_appointment" as const,
          offset_hours: 2,
        },
      },
      {
        id: "node_action_msg",
        type: "action" as const,
        label: "Enviar Lembrete WhatsApp",
        position: { x: 250, y: 280 },
        config: {
          mode: "template" as const,
          template_id: templateName,
        },
      },
      {
        id: "node_end",
        type: "end" as const,
        label: "Fim do Fluxo",
        position: { x: 250, y: 400 },
        config: {
          outcome: "converted" as const,
        },
      },
    ],
    edges: [
      {
        id: "edge_1",
        source: "node_trigger",
        target: "node_wait_2h",
        priority: 0,
        condition: { type: "always" as const },
      },
      {
        id: "edge_2",
        source: "node_wait_2h",
        target: "node_action_msg",
        priority: 0,
        condition: { type: "always" as const },
      },
      {
        id: "edge_3",
        source: "node_action_msg",
        target: "node_end",
        priority: 0,
        condition: { type: "always" as const },
      },
    ],
  };

  // 6. Criar novo Pointer Ativo
  const flowName = "Lembrete de Consulta (2h antes)";
  const { data: newPointer, error: ptrErr } = await admin
    .from("followup_flow_pointers")
    .insert({
      organization_id: orgId,
      name: flowName,
      status: "active",
      draft_graph: graph,
      handoff_policy: "pause",
      trigger_config: {
        kind: "stage_change",
        params: {
          stage_id: agendamentoStage.id,
          pipeline_id: agendamentoStage.pipeline_id,
        },
      },
    })
    .select("*")
    .single();

  if (ptrErr || !newPointer) {
    return fail("internal_error", ptrErr?.message ?? "Falha ao criar ponteiro do fluxo.", 500, { requestId });
  }

  // 7. Criar nova versão vinculada ao pointer
  const { data: newVersion, error: verErr } = await admin
    .from("followup_flow_versions")
    .insert({
      organization_id: orgId,
      pointer_id: newPointer.id,
      graph,
    })
    .select("id")
    .single();

  if (verErr || !newVersion) {
    return fail("internal_error", verErr?.message ?? "Falha ao criar versão do fluxo.", 500, { requestId });
  }

  await admin
    .from("followup_flow_pointers")
    .update({ active_version_id: newVersion.id })
    .eq("id", newPointer.id);


  // 8. Vincular aos agentes ativos da organização
  const { data: agents } = await admin
    .from("ai_agent_versions")
    .select("id, agent_id, followup")
    .eq("organization_id", orgId)
    .eq("status", "published");

  for (const a of agents ?? []) {
    const existingFollowup = (a.followup ?? {}) as { enabled?: boolean; flow_pointer_ids?: string[] };
    const currentIds = Array.isArray(existingFollowup.flow_pointer_ids) ? existingFollowup.flow_pointer_ids : [];
    const updatedIds = Array.from(new Set([...currentIds, newPointer.id]));

    await admin
      .from("ai_agent_versions")
      .update({
        followup: {
          ...existingFollowup,
          enabled: true,
          flow_pointer_ids: updatedIds,
        },
      })
      .eq("id", a.id);
  }

  return ok({
    success: true,
    message: "Fluxo de lembrete de 2 horas antes recriado e publicado com sucesso!",
    flow: {
      id: newPointer.id,
      name: newPointer.name,
      stage_name: agendamentoStage.name,
      stage_id: agendamentoStage.id,
      template: templateName,
      offset_hours: 2,
      status: newPointer.status,
    },
  }, { requestId });
}

import "dotenv/config";
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const admin = createAdminClient();

  console.log("==> Buscando organizações no banco de dados...");
  const { data: orgs, error: orgErr } = await admin.from("organizations").select("id");
  if (orgErr || !orgs || orgs.length === 0) {
    console.error("Erro ao buscar organizações:", orgErr?.message || "Nenhuma org encontrada");
    process.exit(1);
  }

  for (const org of orgs) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processando Organização: ${org.id}`);


    // 1. Limpar fluxos antigos de lembrete
    const { data: oldPointers } = await admin
      .from("followup_flow_pointers")
      .select("id, name")
      .eq("organization_id", org.id);

    const pointersToDelete = (oldPointers ?? []).filter((p) =>
      /lembrete|agend/i.test(p.name),
    );

    for (const p of pointersToDelete) {
      console.log(`  -> Excluindo fluxo antigo: ${p.name} (${p.id})`);
      await admin.from("followup_enrollments").delete().eq("pointer_id", p.id);
      await admin.from("followup_flow_pointers").delete().eq("id", p.id);
    }

    // 2. Localizar etapa de agendamento no funil
    const { data: stages } = await admin
      .from("crm_stages")
      .select("id, pipeline_id, name")
      .eq("organization_id", org.id)
      .order("position", { ascending: true });

    console.log("  -> Todas as etapas encontradas:", stages?.map(s => s.name));

    const agendamentoStage =
      (stages ?? []).find((s) => /avalia[cç][aã]o\s*agendada|agendado|agendamento/i.test(s.name) && !/aguardando/i.test(s.name)) ??
      (stages ?? []).find((s) => /agend/i.test(s.name)) ??
      (stages ?? [])[0];

    if (!agendamentoStage) {
      console.log("  [!] Nenhuma etapa de funil encontrada para esta organização.");
      continue;
    }
    console.log(`  -> Etapa vinculada: "${agendamentoStage.name}" (${agendamentoStage.id})`);


    // 3. Localizar template de mensagem
    const { data: metaTemplates } = await admin
      .from("meta_templates")
      .select("name, status")
      .eq("organization_id", org.id)
      .eq("status", "APPROVED")
      .limit(1);

    const { data: msgTemplates } = await admin
      .from("message_templates")
      .select("id, name")
      .eq("organization_id", org.id)
      .limit(1);

    const templateName =
      metaTemplates?.[0]?.name ??
      msgTemplates?.[0]?.name ??
      "lembrete_consulta";

    console.log(`  -> Template selecionado: "${templateName}"`);

    // 4. Construir Grafo Limpo e 100% aderente ao flowGraphSchema
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

    // 5. Criar novo Pointer Ativo
    const flowName = "Lembrete de Consulta (2h antes)";
    const { data: newPointer, error: ptrErr } = await admin
      .from("followup_flow_pointers")
      .insert({
        organization_id: org.id,
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
      console.error("  [X] Falha ao criar pointer do fluxo:", ptrErr?.message);
      continue;
    }

    // 6. Criar nova versão vinculada ao pointer
    const { data: newVersion, error: verErr } = await admin
      .from("followup_flow_versions")
      .insert({
        organization_id: org.id,
        pointer_id: newPointer.id,
        graph,
      })
      .select("id")
      .single();

    if (verErr || !newVersion) {
      console.error("  [X] Falha ao criar versão do fluxo:", verErr?.message);
      continue;
    }

    // 7. Atualizar pointer com active_version_id
    await admin
      .from("followup_flow_pointers")
      .update({ active_version_id: newVersion.id })
      .eq("id", newPointer.id);

    console.log(`  -> Fluxo criado, versionado e ativado: "${newPointer.name}" (${newPointer.id})`);


    // 7. Vincular aos agentes da org
    const { data: agents } = await admin
      .from("ai_agent_versions")
      .select("id, agent_id, followup")
      .eq("organization_id", org.id)
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

      console.log(`  -> Vinculado ao agente versão ${a.id}`);
    }

    console.log(`  [OK] Fluxo de 2h antes 100% configurado e ativo!`);
  }

  console.log("\n==> Concluído com sucesso!");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});

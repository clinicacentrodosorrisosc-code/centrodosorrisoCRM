/**
 * GET /api/v1/reports/activities
 *
 * Relatório e auditoria de atividades realizadas:
 * - Tarefas concluídas
 * - Consultas / Agendamentos realizados
 * - Movimentações de funil (mudanças de etapa)
 * - Propostas / Orçamentos aprovados e baixas de pagamentos
 * - Interações, notas e atividades operacionais de equipe e IA
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/audit";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { OrcamentoLead } from "@/lib/types/orcamento";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  type: z.enum(["all", "tasks", "agendamentos", "stages", "proposals", "notes", "messages"]).default("all"),
  actor_kind: z.enum(["all", "user", "ai", "system"]).default("all"),
  user_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

export interface ActivityReportItem {
  id: string;
  type:
    | "task_completed"
    | "agendamento_completed"
    | "stage_change"
    | "proposal_approved"
    | "payment_received"
    | "note_created"
    | "message_sent"
    | "other";
  category: "tarefa" | "agendamento" | "funil" | "financeiro" | "atendimento" | "geral";
  title: string;
  description: string | null;
  performed_at: string;
  actor_kind: "user" | "ai" | "system";
  actor_name: string;
  actor_user_id: string | null;
  lead_id: string | null;
  lead_title: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  metadata?: Record<string, unknown>;
}

export interface ActivitiesReportData {
  period_days: number;
  from_date: string;
  to_date: string;
  kpis: {
    total_activities: number;
    completed_tasks: number;
    completed_agendamentos: number;
    stage_moves: number;
    proposals_approved: number;
    payments_received_cents: number;
    top_collaborator: { name: string; count: number } | null;
  };
  by_user: Array<{ name: string; user_id: string | null; actor_kind: string; count: number }>;
  by_category: Record<string, number>;
  daily_series: Array<{ date: string; label: string; count: number }>;
  activities: ActivityReportItem[];
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "reports" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return fail("validation_failed", "Parâmetros de busca inválidos.", 422, { requestId });
  }

  const { days, type, actor_kind, user_id, search } = parsed.data;

  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const fromIso = fromDate.toISOString();

  const supabase = createAdminClient();

  // 1. Mapeamento de Usuários/Membros da Organização
  const userNamesMap = new Map<string, string>();
  if (isServiceRoleConfigured()) {
    const { data: members } = await supabase
      .from("user_organizations")
      .select("user_id, role")
      .eq("organization_id", activeOrg.orgId)
      .is("revoked_at", null);

    if (members && members.length > 0) {
      await Promise.all(
        members.map(async (m) => {
          const { data: uRes } = await supabase.auth.admin.getUserById(m.user_id);
          const name =
            (uRes?.user?.user_metadata?.full_name as string | undefined) ||
            uRes?.user?.email?.split("@")[0] ||
            "Colaborador";
          userNamesMap.set(m.user_id, name);
        }),
      );
    }
  }

  // 2. Mapeamento de Estágios do CRM
  const stageNamesMap = new Map<string, string>();
  const { data: stages } = await supabase
    .from("crm_stages")
    .select("id, name")
    .eq("organization_id", activeOrg.orgId);
  (stages ?? []).forEach((s) => stageNamesMap.set(s.id, s.name));

  // 3. Mapeamento de Contatos
  const contactMap = new Map<string, { name: string; phone: string | null }>();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, display_name, phone_number")
    .eq("organization_id", activeOrg.orgId);
  (contacts ?? []).forEach((c) => {
    contactMap.set(c.id, {
      name: rotuloDoContato(c),
      phone: c.phone_number ?? null,
    });
  });

  // 4. Mapeamento de Leads
  const leadMap = new Map<string, { title: string; contact_id: string | null; custom_fields: Record<string, unknown> }>();
  const { data: leads } = await supabase
    .from("crm_leads")
    .select("id, title, contact_id, custom_fields, stage_id, status, created_at, closed_at")
    .eq("organization_id", activeOrg.orgId);
  (leads ?? []).forEach((l) => {
    leadMap.set(l.id, {
      title: l.title,
      contact_id: l.contact_id ?? null,
      custom_fields: (l.custom_fields ?? {}) as Record<string, unknown>,
    });
  });

  const allActivities: ActivityReportItem[] = [];

  // =========================================================================
  // FONTE A: Tarefas Realizadas / Concluídas (crm_tasks)
  // =========================================================================
  const { data: tasks } = await supabase
    .from("crm_tasks")
    .select("*")
    .eq("organization_id", activeOrg.orgId)
    .eq("status", "done")
    .gte("updated_at", fromIso);

  (tasks ?? []).forEach((t) => {
    const actorId = t.assigned_to ?? null;
    const actorName = actorId ? userNamesMap.get(actorId) ?? "Equipe" : "Equipe";
    const lead = t.lead_id ? leadMap.get(t.lead_id) : null;
    const contactId = t.contact_id || lead?.contact_id || null;
    const contact = contactId ? contactMap.get(contactId) : null;

    allActivities.push({
      id: `task-${t.id}`,
      type: "task_completed",
      category: "tarefa",
      title: `Tarefa Concluída: ${t.title}`,
      description: t.description ?? null,
      performed_at: t.updated_at || t.created_at,
      actor_kind: "user",
      actor_name: actorName,
      actor_user_id: actorId,
      lead_id: t.lead_id ?? null,
      lead_title: lead?.title ?? null,
      contact_id: contactId,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone ?? null,
      metadata: { priority: t.priority },
    });
  });

  // =========================================================================
  // FONTE B: Linha do Tempo Operacional (crm_lead_activities)
  // =========================================================================
  const { data: leadActs } = await supabase
    .from("crm_lead_activities")
    .select("*")
    .eq("organization_id", activeOrg.orgId)
    .gte("performed_at", fromIso)
    .order("performed_at", { ascending: false });

  (leadActs ?? []).forEach((act) => {
    const kind = (act.actor_kind as "user" | "ai" | "system") || "system";
    let actorName = "Sistema";
    if (kind === "user" && act.performed_by_user_id) {
      actorName = userNamesMap.get(act.performed_by_user_id) ?? "Colaborador";
    } else if (kind === "ai") {
      actorName = "Agente de IA";
    }

    const lead = act.lead_id ? leadMap.get(act.lead_id) : null;
    const contactId = act.contact_id || lead?.contact_id || null;
    const contact = contactId ? contactMap.get(contactId) : null;

    const payload = (act.payload ?? {}) as Record<string, unknown>;
    let itemType: ActivityReportItem["type"] = "other";
    let category: ActivityReportItem["category"] = "geral";
    let title = "Atividade registrada";
    let desc = act.reason ?? null;

    const actType = String(act.type || "").toLowerCase();

    if (actType.includes("stage") || actType.includes("etapa") || payload.to_stage_id) {
      itemType = "stage_change";
      category = "funil";
      const toName = payload.to_stage_id ? stageNamesMap.get(String(payload.to_stage_id)) ?? "Nova Etapa" : "Nova Etapa";
      const fromName = payload.from_stage_id ? stageNamesMap.get(String(payload.from_stage_id)) : null;
      title = fromName ? `Avanço de Funil: ${fromName} → ${toName}` : `Movido para: ${toName}`;
    } else if (actType.includes("orcamento") || actType.includes("proposal") || actType.includes("aprov")) {
      itemType = "proposal_approved";
      category = "financeiro";
      title = "Proposta / Orçamento Aprovado";
    } else if (actType.includes("pagamento") || actType.includes("payment")) {
      itemType = "payment_received";
      category = "financeiro";
      title = "Baixa de Pagamento Registrada";
    } else if (actType.includes("note") || actType.includes("anotacao") || actType.includes("nota")) {
      itemType = "note_created";
      category = "atendimento";
      title = "Anotação Operacional Registrada";
    } else if (actType.includes("message") || actType.includes("whatsapp") || actType.includes("handoff")) {
      itemType = "message_sent";
      category = "atendimento";
      title = actType.includes("handoff") ? "Transferência de Atendimento" : "Mensagem / Atendimento Realizado";
    }

    allActivities.push({
      id: `act-${act.id}`,
      type: itemType,
      category,
      title,
      description: desc,
      performed_at: act.performed_at,
      actor_kind: kind,
      actor_name: actorName,
      actor_user_id: act.performed_by_user_id ?? null,
      lead_id: act.lead_id ?? null,
      lead_title: lead?.title ?? null,
      contact_id: contactId,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone ?? null,
      metadata: payload,
    });
  });

  // =========================================================================
  // FONTE C: Consultas e Agendamentos Realizados (crm_leads com compareceu / orçamentos)
  // =========================================================================
  (leads ?? []).forEach((lead) => {
    const custom = lead.custom_fields || {};
    const orcamento = custom.orcamento as OrcamentoLead | undefined;

    // 1. Agendamento comparecido/realizado
    if (
      custom.agendamento_status === "compareceu" &&
      custom.agendamento_data &&
      typeof custom.agendamento_data === "string"
    ) {
      const dataStr = String(custom.agendamento_data);
      const horaStr = custom.agendamento_hora ? String(custom.agendamento_hora) : "00:00";
      const agendDate = new Date(`${dataStr}T${horaStr}:00`);

      if (agendDate >= fromDate) {
        const contact = lead.contact_id ? contactMap.get(lead.contact_id) : null;
        const proc = custom.procedimento || custom.agendamento_procedimento || "Consulta Geral";

        allActivities.push({
          id: `agendamento-done-${lead.id}`,
          type: "agendamento_completed",
          category: "agendamento",
          title: `Consulta Realizada: ${proc}`,
          description: `Paciente compareceu à consulta agendada para ${dataStr} às ${horaStr}.`,
          performed_at: agendDate.toISOString(),
          actor_kind: "user",
          actor_name: "Recepção / Atendimento",
          actor_user_id: null,
          lead_id: lead.id,
          lead_title: lead.title,
          contact_id: lead.contact_id ?? null,
          contact_name: contact?.name ?? null,
          contact_phone: contact?.phone ?? null,
        });
      }
    }

    // 2. Baixas de pagamentos detalhadas em orçamentos
    if (orcamento?.pagamentos && Array.isArray(orcamento.pagamentos)) {
      orcamento.pagamentos.forEach((baixa) => {
        const dt = baixa.criado_em ? new Date(baixa.criado_em) : baixa.data ? new Date(baixa.data) : new Date(fromIso);
        if (dt >= fromDate) {
          const contact = lead.contact_id ? contactMap.get(lead.contact_id) : null;
          const valBrl = (baixa.valor_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

          allActivities.push({
            id: `baixa-${baixa.id}`,
            type: "payment_received",
            category: "financeiro",
            title: `Pagamento Recebido: ${valBrl} (${baixa.metodo?.toUpperCase() || "PIX"})`,
            description: baixa.observacao ?? `Baixa registrada no orçamento de ${lead.title}.`,
            performed_at: dt.toISOString(),
            actor_kind: "user",
            actor_name: "Financeiro",
            actor_user_id: null,
            lead_id: lead.id,
            lead_title: lead.title,
            contact_id: lead.contact_id ?? null,
            contact_name: contact?.name ?? null,
            contact_phone: contact?.phone ?? null,
            metadata: { valor_cents: baixa.valor_cents, forma: baixa.metodo },
          });
        }
      });
    }
  });

  // =========================================================================
  // APLICAÇÃO DE FILTROS DO USUÁRIO
  // =========================================================================
  let filtered = allActivities.filter((item) => new Date(item.performed_at) >= fromDate);

  if (type !== "all") {
    if (type === "tasks") filtered = filtered.filter((i) => i.category === "tarefa");
    else if (type === "agendamentos") filtered = filtered.filter((i) => i.category === "agendamento");
    else if (type === "stages") filtered = filtered.filter((i) => i.category === "funil");
    else if (type === "proposals") filtered = filtered.filter((i) => i.category === "financeiro");
    else if (type === "notes" || type === "messages") filtered = filtered.filter((i) => i.category === "atendimento");
  }

  if (actor_kind !== "all") {
    filtered = filtered.filter((i) => i.actor_kind === actor_kind);
  }

  if (user_id) {
    filtered = filtered.filter((i) => i.actor_user_id === user_id);
  }

  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      (i.description && i.description.toLowerCase().includes(q)) ||
      (i.actor_name && i.actor_name.toLowerCase().includes(q)) ||
      (i.lead_title && i.lead_title.toLowerCase().includes(q)) ||
      (i.contact_name && i.contact_name.toLowerCase().includes(q)) ||
      (i.contact_phone && i.contact_phone.includes(q))
    );
  }

  // Ordenação cronológica decrescente
  filtered.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());

  // =========================================================================
  // CÁLCULO DE KPIS E MÉTRICAS
  // =========================================================================
  const completedTasksCount = filtered.filter((i) => i.type === "task_completed").length;
  const completedAgendamentosCount = filtered.filter((i) => i.type === "agendamento_completed").length;
  const stageMovesCount = filtered.filter((i) => i.type === "stage_change").length;
  const proposalsApprovedCount = filtered.filter((i) => i.type === "proposal_approved").length;

  let totalPaymentsReceivedCents = 0;
  filtered
    .filter((i) => i.type === "payment_received")
    .forEach((i) => {
      const val = Number(i.metadata?.valor_cents) || 0;
      totalPaymentsReceivedCents += val;
    });

  // Ranking por Usuário / Ator
  const userCountsMap = new Map<string, { name: string; user_id: string | null; actor_kind: string; count: number }>();
  filtered.forEach((i) => {
    const key = i.actor_name;
    const cur = userCountsMap.get(key) ?? {
      name: i.actor_name,
      user_id: i.actor_user_id,
      actor_kind: i.actor_kind,
      count: 0,
    };
    cur.count += 1;
    userCountsMap.set(key, cur);
  });

  const byUser = Array.from(userCountsMap.values()).sort((a, b) => b.count - a.count);
  const topCollaborator = byUser.find((u) => u.actor_kind === "user") ?? byUser[0] ?? null;

  // Distribuição por Categoria
  const byCategory: Record<string, number> = {
    tarefa: 0,
    agendamento: 0,
    funil: 0,
    financeiro: 0,
    atendimento: 0,
    geral: 0,
  };
  filtered.forEach((i) => {
    byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
  });

  // Série temporal diária
  const dailyMap = new Map<string, number>();
  for (let d = 0; d < days; d++) {
    const dt = new Date(fromDate.getTime() + d * 24 * 60 * 60 * 1000);
    const key = dt.toISOString().slice(0, 10);
    dailyMap.set(key, 0);
  }

  filtered.forEach((i) => {
    const key = i.performed_at.slice(0, 10);
    if (dailyMap.has(key)) {
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    }
  });

  const dailySeries = Array.from(dailyMap.entries()).map(([date, count]) => {
    const [year, month, day] = date.split("-");
    return {
      date,
      label: `${day}/${month}`,
      count,
    };
  });

  const reportPayload: ActivitiesReportData = {
    period_days: days,
    from_date: fromIso,
    to_date: now.toISOString(),
    kpis: {
      total_activities: filtered.length,
      completed_tasks: completedTasksCount,
      completed_agendamentos: completedAgendamentosCount,
      stage_moves: stageMovesCount,
      proposals_approved: proposalsApprovedCount,
      payments_received_cents: totalPaymentsReceivedCents,
      top_collaborator: topCollaborator ? { name: topCollaborator.name, count: topCollaborator.count } : null,
    },
    by_user: byUser,
    by_category: byCategory,
    daily_series: dailySeries,
    activities: filtered,
  };

  return ok(reportPayload, { requestId });
}

/**
 * GET /api/v1/dashboard/overview — KPIs operacionais, comerciais e de agendamento do CRM.
 *
 * Agrega:
 * - Conversas ativas
 * - Novos contatos no período
 * - Valores em aberto (Soma dos orçamentos/valores de cada lead no funil)
 * - Orçamentos aprovados (Quantidade e valor total)
 * - Valores recebidos (Total de baixas parciais pagas)
 * - Saldo a receber de orçamentos aprovados
 * - Métricas de Agendamentos (Total, Compareceu / Show Rate, Faltou / No-Show, Remarcados)
 * - Mensagens enviadas hoje
 * - Série temporal diária (conversas e mensagens para o gráfico)
 * - Tempo médio de resposta (TMR)
 * - Resumo recente de negócios com badges de orçamento
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrcamentoLead } from "@/lib/types/orcamento";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";
import { dentroDoPeriodo, leadsAbertosDoFunilPadrao, pagamentosRecebidosNoPeriodo, valorRecebidoNoPeriodo } from "@/lib/dashboard/period-metrics";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  label: string; // DD/MM
  conversations: number;
  messages_sent: number;
  messages_received: number;
}

export interface OrcamentoReportItem {
  lead_id: string;
  lead_title: string;
  contact_name: string | null;
  stage_name: string;
  total_cents: number;
  total_pago_cents: number;
  saldo_restante_cents: number;
  status: string;
  aprovado_em: string | null;
  procedimentos: string[];
  pagamentos: {
    id: string;
    data: string;
    metodo: string;
    valor_cents: number;
    observacao?: string;
  }[];
}

export interface AgendamentoReportItem {
  id: string;
  lead_id: string | null;
  lead_title: string;
  contact_name: string | null;
  stage_name: string;
  procedimento: string | null;
  agendamento_data: string;
  agendamento_hora: string | null;
  agendamento_status: "agendado" | "confirmado" | "compareceu" | "faltou" | "remarcado" | "cancelado";
  valor_cents: number | null;
  created_at: string;
}

export interface FonteBreakdownItem {
  fonte: string;
  count: number;
  total_value_cents: number;
  won_count: number;
  conversion_rate: number;
}

export interface ProcedimentoProcuradoItem {
  procedimento: string;
  count: number;
  total_value_cents: number;
  percent_of_total: number;
}

export interface ProcedimentoFechadoItem {
  procedimento: string;
  count: number;
  total_value_cents: number;
  total_received_cents: number;
}

export interface DashboardOverviewData {
  period_days: number;
  kpis: {
    active_conversations: number;
    new_contacts: number;
    open_deals_value_cents: number;
    open_deals_count: number;
    approved_budgets_count: number;
    approved_budgets_value_cents: number;
    total_received_value_cents: number;
    pending_received_value_cents: number;
    // Métricas de Agendamentos & Presença (No-Show)
    agendamentos_total_count: number;
    agendamentos_compareceu_count: number;
    agendamentos_compareceu_taxa: number; // % (Show Rate)
    agendamentos_faltou_count: number;
    agendamentos_faltou_taxa: number; // % (No-Show Rate)
    agendamentos_remarcado_count: number;
    agendamentos_pendente_count: number;
    messages_sent_today: number;
    avg_response_time_seconds: number | null;
  };
  daily_series: DailyPoint[];
  pipeline_stages: {
    id: string;
    name: string;
    color: string | null;
    count: number;
    value_cents: number;
  }[];
  recent_leads: {
    id: string;
    title: string;
    value_cents: number;
    stage_name: string;
    contact_name: string | null;
    budget_status?: string | null;
    created_at: string;
  }[];
  // Inteligência de Fontes e Procedimentos
  fontes_breakdown: FonteBreakdownItem[];
  procedimentos_procurados: ProcedimentoProcuradoItem[];
  procedimentos_fechados: ProcedimentoFechadoItem[];
  // Listas detalhadas para os drawers de relatório dos KPIs
  approved_budgets_list: OrcamentoReportItem[];
  received_payments_list: OrcamentoReportItem[];
  pending_balance_list: OrcamentoReportItem[];
  // Listas detalhadas de agendamento
  agendamentos_list: AgendamentoReportItem[];
  faltas_list: AgendamentoReportItem[];
  compareceram_list: AgendamentoReportItem[];
  remarcados_list: AgendamentoReportItem[];
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("agent", { requestId, resource: "dashboard" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    days: url.searchParams.get("days") ?? 30,
  });

  if (!parsed.success) {
    return fail("validation_failed", "Parâmetros inválidos.", 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  const days = parsed.data.days;
  const now = new Date();
  const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const supabase = createAdminClient();

  // Conversas com janela de 24h aberta e atendimento nao encerrado.
  const conversationWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const { count: activeConversationsCount } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", activeOrg.orgId)
    .not("status", "in", "(closed,archived)")
    .gte("last_inbound_at", conversationWindowStart.toISOString());

  // 2. Novos contatos criados no período
  const { count: newContactsCount } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", activeOrg.orgId)
    .gte("created_at", fromDate.toISOString());

  // 3. Etapas do funil (busca antecipada para identificar estágios de ganho)
  const { data: defaultPipeline } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", activeOrg.orgId)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true })
    .eq("is_archived", false)
    .limit(1)
    .maybeSingle();

  const { data: stages } = await supabase
    .from("crm_stages")
    .select("id, name, color, is_won, is_lost")
    .eq("organization_id", activeOrg.orgId)
    .eq("pipeline_id", defaultPipeline?.id ?? "00000000-0000-0000-0000-000000000000")
    .eq("is_archived", false)
    .order("position", { ascending: true });

  const stageMap = new Map<string, { name: string; color: string | null; count: number; value_cents: number }>();
  const wonStageIds = new Set<string>();

  (stages ?? []).forEach((st) => {
    stageMap.set(st.id, {
      name: st.name,
      color: (st as { color?: string | null }).color ?? null,
      count: 0,
      value_cents: 0,
    });
    const sNameLower = (st.name || "").toLowerCase();
    if ((st as { is_won?: boolean }).is_won || sNameLower.includes("ganho") || sNameLower.includes("fechado") || sNameLower.includes("aprovado") || sNameLower.includes("contratado")) {
      wonStageIds.add(st.id);
    }
  });

  // 4. Negócios e Orçamentos (crm_leads)
  const { data: allLeads, error: leadsError } = await supabase
    .from("crm_leads")
    .select("id, title, value_cents, pipeline_id, stage_id, created_at, contact_id, status, closed_at, custom_fields, source, source_metadata, tags")
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  if (leadsError) {
    logger.error("[dashboard/overview] Falha ao consultar leads", { error: leadsError.message });
  }

  const openLeads = leadsAbertosDoFunilPadrao(allLeads ?? [], defaultPipeline?.id ?? null);

  let totalOpenValueCents = 0;
  let approvedBudgetsCount = 0;
  let approvedBudgetsValueCents = 0;
  let totalReceivedValueCents = 0;
  let pendingReceivedValueCents = 0;

  // Contadores de Agendamentos
  let agendamentosTotalCount = 0;
  let agendamentosCompareceuCount = 0;
  let agendamentosFaltouCount = 0;
  let agendamentosRemarcadoCount = 0;
  let agendamentosPendenteCount = 0;

  // Mapas para agregação de Inteligência de Procedimentos e Fontes
  const procProcuradosMap = new Map<string, { count: number; total_value_cents: number }>();
  const procFechadosMap = new Map<string, { count: number; total_value_cents: number; total_received_cents: number }>();
  const fontesMap = new Map<string, { count: number; total_value_cents: number; won_count: number }>();

  // Calcula métricas financeiras, procedimentos e fontes sobre todos os leads
  (allLeads ?? []).forEach((lead) => {
    const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const orcamento = custom.orcamento as OrcamentoLead | undefined;

    // Valor do lead: usa o total_cents do orçamento se houver, ou value_cents
    const leadValue =
      orcamento?.total_cents !== undefined && orcamento.total_cents > 0
        ? orcamento.total_cents
        : typeof lead.value_cents === "number"
          ? lead.value_cents
          : 0;

    const isWonByStage = lead.stage_id ? wonStageIds.has(lead.stage_id) : false;
    const isApprovedOrWon =
      orcamento?.status === "aprovado" ||
      orcamento?.status === "quitado" ||
      lead.status === "won" ||
      isWonByStage;

    if (isApprovedOrWon) {
      // 1. Orçamentos Aprovados: soma o valor total contratado
      approvedBudgetsCount += 1;
      approvedBudgetsValueCents += leadValue;

      const pago = orcamento?.total_pago_cents ?? 0;

      // 3. Saldo a Receber: o que resta a pagar dos aprovados
      const saldoPendente = Math.max(0, leadValue - pago);
      pendingReceivedValueCents += saldoPendente;

      // Procedimentos Fechados
      const closedProcs: Array<{ name: string; val: number; paid: number }> = [];
      if (orcamento?.itens && Array.isArray(orcamento.itens) && orcamento.itens.length > 0) {
        for (const item of orcamento.itens) {
          const pName = (item.descricao || "Tratamento Odontológico").trim();
          const itemVal = item.valor_total_cents > 0 ? item.valor_total_cents : Math.round(leadValue / orcamento.itens.length);
          const itemPaid = Math.round(pago / orcamento.itens.length);
          closedProcs.push({ name: pName, val: itemVal, paid: itemPaid });
        }
      } else if (typeof custom.procedimento === "string" && custom.procedimento.trim()) {
        closedProcs.push({ name: custom.procedimento.trim(), val: leadValue, paid: pago });
      } else if (typeof custom.procedure === "string" && custom.procedure.trim()) {
        closedProcs.push({ name: custom.procedure.trim(), val: leadValue, paid: pago });
      } else {
        closedProcs.push({ name: "Procedimento Aprovado", val: leadValue, paid: pago });
      }

      for (const cp of closedProcs) {
        const cur = procFechadosMap.get(cp.name) ?? { count: 0, total_value_cents: 0, total_received_cents: 0 };
        cur.count += 1;
        cur.total_value_cents += cp.val;
        cur.total_received_cents += cp.paid;
        procFechadosMap.set(cp.name, cur);
      }
    }

    totalReceivedValueCents += valorRecebidoNoPeriodo(orcamento, fromDate, now);

    // Procedimentos Procurados (Demanda Geral de Leads)
    const procsInLead: string[] = [];
    if (typeof custom.procedimento === "string" && custom.procedimento.trim()) {
      procsInLead.push(custom.procedimento.trim());
    } else if (typeof custom.procedure === "string" && custom.procedure.trim()) {
      procsInLead.push(custom.procedure.trim());
    }

    if (Array.isArray(custom.procedimentos)) {
      for (const p of custom.procedimentos) {
        if (typeof p === "string" && p.trim()) procsInLead.push(p.trim());
      }
    }

    if (orcamento?.itens && Array.isArray(orcamento.itens)) {
      for (const item of orcamento.itens) {
        if (item.descricao && item.descricao.trim()) {
          procsInLead.push(item.descricao.trim());
        }
      }
    }

    if (typeof custom.agendamento_procedimento === "string" && custom.agendamento_procedimento.trim()) {
      procsInLead.push(custom.agendamento_procedimento.trim());
    }

    // Varredura de tags de procedimento no lead
    const leadTags = Array.isArray((lead as { tags?: unknown }).tags) ? (lead as { tags: string[] }).tags : [];
    for (const t of leadTags) {
      const tagStr = String(t).trim();
      const tagLower = tagStr.toLowerCase();
      if (
        tagLower.includes("implante") ||
        tagLower.includes("clareamento") ||
        tagLower.includes("botox") ||
        tagLower.includes("harmoniz") ||
        tagLower.includes("faceta") ||
        tagLower.includes("lente") ||
        tagLower.includes("orto") ||
        tagLower.includes("alinhador") ||
        tagLower.includes("limpeza") ||
        tagLower.includes("profilaxia") ||
        tagLower.includes("siso") ||
        tagLower.includes("canal") ||
        tagLower.includes("prótese") ||
        tagLower.includes("protese")
      ) {
        procsInLead.push(tagStr);
      }
    }

    // Varredura no título do lead se não houver procedimento explícito
    if (procsInLead.length === 0 && typeof lead.title === "string") {
      const tLower = lead.title.toLowerCase();
      if (tLower.includes("implante")) procsInLead.push("Implantes Dentários");
      else if (tLower.includes("clareamento")) procsInLead.push("Clareamento Dental");
      else if (tLower.includes("botox") || tLower.includes("harmoniz")) procsInLead.push("Harmonização Facial / Botox");
      else if (tLower.includes("faceta") || tLower.includes("lente")) procsInLead.push("Facetas / Lentes de Contato");
      else if (tLower.includes("alinhador") || tLower.includes("orto") || tLower.includes("aparelho")) procsInLead.push("Ortodontia / Alinhadores");
      else if (tLower.includes("limpeza") || tLower.includes("profilaxia")) procsInLead.push("Limpeza / Avaliação");
      else if (tLower.includes("siso") || tLower.includes("extraç") || tLower.includes("extrac")) procsInLead.push("Cirurgia / Siso");
      else if (tLower.includes("canal") || tLower.includes("endo")) procsInLead.push("Tratamento de Canal");
      else if (tLower.includes("prótese") || tLower.includes("protese")) procsInLead.push("Prótese Dentária");
    }

    const uniqueProcs = [...new Set(procsInLead)];
    if (uniqueProcs.length === 0) {
      const fallback = "Avaliação / Geral";
      const cur = procProcuradosMap.get(fallback) ?? { count: 0, total_value_cents: 0 };
      cur.count += 1;
      cur.total_value_cents += leadValue;
      procProcuradosMap.set(fallback, cur);
    } else {
      const valPerProc = Math.round(leadValue / uniqueProcs.length);
      for (const pName of uniqueProcs) {
        const cur = procProcuradosMap.get(pName) ?? { count: 0, total_value_cents: 0 };
        cur.count += 1;
        cur.total_value_cents += valPerProc;
        procProcuradosMap.set(pName, cur);
      }
    }

    // Fontes de Captação
    const meta = ((lead as { source_metadata?: Record<string, unknown> | null }).source_metadata ?? {}) as Record<string, unknown>;
    const rawSource = String(
      (lead as { source?: string | null }).source ||
      meta.utm_source ||
      meta.source ||
      meta.channel ||
      custom.fonte ||
      custom.source ||
      custom.origem ||
      ""
    ).trim();

    let normalizedFonte = rawSource;
    if (!normalizedFonte || normalizedFonte.toLowerCase() === "manual") {
      for (const t of leadTags) {
        const tagLower = String(t).toLowerCase();
        if (tagLower.includes("insta") || tagLower.includes("ig")) { normalizedFonte = "Instagram"; break; }
        if (tagLower.includes("face") || tagLower.includes("fb")) { normalizedFonte = "Facebook Ads"; break; }
        if (tagLower.includes("google") || tagLower.includes("gads")) { normalizedFonte = "Google Ads"; break; }
        if (tagLower.includes("whats") || tagLower.includes("waha")) { normalizedFonte = "WhatsApp"; break; }
        if (tagLower.includes("indica")) { normalizedFonte = "Indicação"; break; }
        if (tagLower.includes("site") || tagLower.includes("landing")) { normalizedFonte = "Site / Landing Page"; break; }
      }
    }

    if (!normalizedFonte) normalizedFonte = "WhatsApp";

    const srcLower = normalizedFonte.toLowerCase();
    if (srcLower.includes("insta") || srcLower === "ig") {
      normalizedFonte = "Instagram";
    } else if (srcLower.includes("face") || srcLower === "fb") {
      normalizedFonte = "Facebook Ads";
    } else if (srcLower.includes("google") || srcLower.includes("gads")) {
      normalizedFonte = "Google Ads";
    } else if (srcLower.includes("whats") || srcLower === "waha" || srcLower === "manual") {
      normalizedFonte = "WhatsApp";
    } else if (srcLower.includes("indica")) {
      normalizedFonte = "Indicação";
    } else if (srcLower.includes("site") || srcLower.includes("landing")) {
      normalizedFonte = "Site / Landing Page";
    } else if (srcLower.includes("passante") || srcLower.includes("balcao") || srcLower.includes("balcão")) {
      normalizedFonte = "Passante / Balcão";
    } else if (srcLower.includes("trafego") || srcLower.includes("tráfego") || srcLower.includes("ads")) {
      normalizedFonte = "Tráfego Pago";
    }

    const curFonte = fontesMap.get(normalizedFonte) ?? { count: 0, total_value_cents: 0, won_count: 0 };
    curFonte.count += 1;
    curFonte.total_value_cents += leadValue;
    if (isApprovedOrWon) {
      curFonte.won_count += 1;
    }
    fontesMap.set(normalizedFonte, curFonte);
  });

  const totalDemandCount = Array.from(procProcuradosMap.values()).reduce((acc, c) => acc + c.count, 0);

  const procedimentosProcurados: ProcedimentoProcuradoItem[] = Array.from(procProcuradosMap.entries())
    .map(([procedimento, data]) => ({
      procedimento,
      count: data.count,
      total_value_cents: data.total_value_cents,
      percent_of_total: totalDemandCount > 0 ? Math.round((data.count / totalDemandCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.total_value_cents - a.total_value_cents);

  const procedimentosFechados: ProcedimentoFechadoItem[] = Array.from(procFechadosMap.entries())
    .map(([procedimento, data]) => ({
      procedimento,
      count: data.count,
      total_value_cents: data.total_value_cents,
      total_received_cents: data.total_received_cents,
    }))
    .sort((a, b) => b.total_value_cents - a.total_value_cents || b.count - a.count);

  const fontesBreakdown: FonteBreakdownItem[] = Array.from(fontesMap.entries())
    .map(([fonte, data]) => ({
      fonte,
      count: data.count,
      total_value_cents: data.total_value_cents,
      won_count: data.won_count,
      conversion_rate: data.count > 0 ? Math.round((data.won_count / data.count) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.total_value_cents - a.total_value_cents);

  const openDealsCount = openLeads.length;
  totalOpenValueCents = openLeads.reduce((total, lead) => {
    const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const orcamento = custom.orcamento as OrcamentoLead | undefined;
    const valor = orcamento?.total_cents ?? lead.value_cents ?? 0;
    return total + (typeof valor === "number" ? valor : 0);
  }, 0);

  const { data: calendarEvents } = await supabase
    .from("calendar_events")
    .select("id, title, starts_at, status, lead_id, created_at")
    .eq("organization_id", activeOrg.orgId)
    .gte("created_at", fromDate.toISOString())
    .lte("created_at", now.toISOString())
    .order("created_at", { ascending: false });

  // 4. Mensagens enviadas hoje
  const { count: messagesSentTodayCount } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", activeOrg.orgId)
    .eq("direction", "outbound")
    .gte("created_at", startOfToday);

  // 5. Etapas do funil
  openLeads.forEach((lead) => {
    if (lead.stage_id) {
      if (!stageMap.has(lead.stage_id)) {
        stageMap.set(lead.stage_id, { name: "Etapa", color: null, count: 0, value_cents: 0 });
      }
      const entry = stageMap.get(lead.stage_id)!;
      entry.count += 1;
      const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
      const orcamento = custom.orcamento as OrcamentoLead | undefined;
      const val = orcamento?.total_cents ?? lead.value_cents ?? 0;
      entry.value_cents += typeof val === "number" ? val : 0;
    }
  });

  const pipelineStages = Array.from(stageMap.entries()).map(([id, data]) => ({
    id,
    name: data.name,
    color: data.color,
    count: data.count,
    value_cents: data.value_cents,
  }));

  // 6. Série temporal diária para o gráfico
  const { data: recentConversations } = await supabase
    .from("conversations")
    .select("id, created_at")
    .eq("organization_id", activeOrg.orgId)
    .gte("created_at", fromDate.toISOString());

  const { data: recentMessages } = await supabase
    .from("messages")
    .select("id, direction, created_at")
    .eq("organization_id", activeOrg.orgId)
    .gte("created_at", fromDate.toISOString());

  const dailyMap = new Map<string, { conversations: number; sent: number; received: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { conversations: 0, sent: 0, received: 0 });
  }

  (recentConversations ?? []).forEach((c) => {
    const key = c.created_at.slice(0, 10);
    if (dailyMap.has(key)) {
      dailyMap.get(key)!.conversations += 1;
    }
  });

  (recentMessages ?? []).forEach((m) => {
    const key = m.created_at.slice(0, 10);
    if (dailyMap.has(key)) {
      if (m.direction === "outbound") {
        dailyMap.get(key)!.sent += 1;
      } else {
        dailyMap.get(key)!.received += 1;
      }
    }
  });

  const dailySeries: DailyPoint[] = Array.from(dailyMap.entries()).map(([dateStr, metrics]) => {
    const [, month, day] = dateStr.split("-");
    return {
      date: dateStr,
      label: `${day}/${month}`,
      conversations: metrics.conversations,
      messages_sent: metrics.sent,
      messages_received: metrics.received,
    };
  });

  // 7. Tempo Médio de Resposta (TMR)
  let avgResponseTimeSeconds: number | null = null;
  try {
    const { data: attendantStats } = await supabase.rpc("fn_attendant_metrics", {
      p_org: activeOrg.orgId,
      p_from: fromDate.toISOString(),
      p_to: now.toISOString(),
    } as never);

    const attendantsList = (
      Array.isArray(attendantStats)
        ? attendantStats
        : (attendantStats as { attendants?: Array<{ avg_first_response_seconds?: number }> } | null)?.attendants
    ) ?? [];

    if (Array.isArray(attendantsList) && attendantsList.length > 0) {
      const validTimes = attendantsList
        .map((s: { avg_first_response_seconds?: number }) => s.avg_first_response_seconds)
        .filter((t): t is number => typeof t === "number" && t > 0);

      if (validTimes.length > 0) {
        avgResponseTimeSeconds = Math.round(
          validTimes.reduce((acc, cur) => acc + cur, 0) / validTimes.length,
        );
      }
    }

    // Fallback: cálculo direto caso não haja métrica por atendente atribuído
    if (avgResponseTimeSeconds === null) {
      const { data: convMessages } = await supabase
        .from("messages")
        .select("conversation_id, direction, sent_at, created_at")
        .eq("organization_id", activeOrg.orgId)
        .gte("created_at", fromDate.toISOString())
        .order("created_at", { ascending: true })
        .limit(300);

      if (convMessages && convMessages.length > 0) {
        const byConv = new Map<string, { in?: Date; out?: Date }>();
        for (const msg of convMessages) {
          const entry = byConv.get(msg.conversation_id) ?? {};
          const msgDate = new Date(msg.sent_at || msg.created_at);
          if (msg.direction === "inbound" && !entry.in) {
            entry.in = msgDate;
          } else if (msg.direction === "outbound" && entry.in && !entry.out) {
            if (msgDate > entry.in) {
              entry.out = msgDate;
            }
          }
          byConv.set(msg.conversation_id, entry);
        }

        const deltas: number[] = [];
        for (const { in: firstIn, out: firstOut } of byConv.values()) {
          if (firstIn && firstOut) {
            const diffSeconds = (firstOut.getTime() - firstIn.getTime()) / 1000;
            if (diffSeconds > 0 && diffSeconds < 86400 * 7) {
              deltas.push(diffSeconds);
            }
          }
        }
        if (deltas.length > 0) {
          avgResponseTimeSeconds = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
        }
      }
    }
  } catch {
    // Silently fallback if RPC or calculation fails
  }

  // 8. Busca contatos para enriquecer os relatórios
  const contactIds = [...new Set((allLeads ?? []).map((l) => l.contact_id).filter(Boolean))] as string[];
  const allContactNames = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, display_name, phone_number")
      .in("id", contactIds);
    (contacts ?? []).forEach((c) => {
      allContactNames.set(c.id, rotuloDoContato(c));
    });
  }

  // Montagem dos relatórios de Orçamento
  const toReportItem = (
    lead: { id: string; title: string; stage_id: string | null; contact_id: string | null },
    orc: OrcamentoLead,
  ): OrcamentoReportItem => ({
    lead_id: lead.id,
    lead_title: lead.title,
    contact_name: lead.contact_id ? allContactNames.get(lead.contact_id) ?? null : null,
    stage_name: lead.stage_id && stageMap.has(lead.stage_id) ? stageMap.get(lead.stage_id)!.name : "Etapa inicial",
    total_cents: orc.total_cents,
    total_pago_cents: orc.total_pago_cents ?? 0,
    saldo_restante_cents: orc.saldo_restante_cents ?? 0,
    status: orc.status,
    aprovado_em: orc.aprovado_em ?? null,
    procedimentos: (orc.itens ?? []).map((i) => i.descricao),
    pagamentos: (orc.pagamentos ?? []).map((p) => ({
      id: p.id,
      data: p.data,
      metodo: p.metodo,
      valor_cents: p.valor_cents,
      observacao: p.observacao,
    })),
  });

  // Listas para os drawers de relatório financeiro
  const approvedBudgetsList: OrcamentoReportItem[] = [];
  const receivedPaymentsList: OrcamentoReportItem[] = [];
  const pendingBalanceList: OrcamentoReportItem[] = [];

  // Listas para os drawers de Agendamentos & Presença
  const agendamentosList: AgendamentoReportItem[] = [];
  const faltasList: AgendamentoReportItem[] = [];
  const compareceramList: AgendamentoReportItem[] = [];
  const remarcadosList: AgendamentoReportItem[] = [];

  (allLeads ?? []).forEach((lead) => {
    const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const orcamento = custom.orcamento as OrcamentoLead | undefined;

    // Relatórios de Orçamento & Vendas
    const leadVal =
      orcamento?.total_cents !== undefined && orcamento.total_cents > 0
        ? orcamento.total_cents
        : typeof lead.value_cents === "number"
          ? lead.value_cents
          : 0;

    const isApprovedOrWon =
      orcamento?.status === "aprovado" ||
      orcamento?.status === "quitado" ||
      lead.status === "won";

    if (isApprovedOrWon) {
      const item: OrcamentoReportItem = orcamento
        ? toReportItem(lead, orcamento)
        : {
            lead_id: lead.id,
            lead_title: lead.title,
            contact_name: lead.contact_id ? allContactNames.get(lead.contact_id) ?? null : null,
            stage_name: lead.stage_id && stageMap.has(lead.stage_id) ? stageMap.get(lead.stage_id)!.name : "Etapa inicial",
            total_cents: leadVal,
            total_pago_cents: 0,
            saldo_restante_cents: leadVal,
            status: "aprovado",
            aprovado_em: lead.closed_at || lead.created_at,
            procedimentos: [],
            pagamentos: [],
          };

      approvedBudgetsList.push(item);
      if (item.saldo_restante_cents > 0) {
        pendingBalanceList.push(item);
      }
    }

    const pagamentosDoPeriodo = pagamentosRecebidosNoPeriodo(orcamento, fromDate, now);
    if (orcamento && pagamentosDoPeriodo.length > 0) {
      const item = toReportItem(lead, orcamento);
      item.pagamentos = pagamentosDoPeriodo.map((p) => ({ id: p.id, data: p.data, metodo: p.metodo, valor_cents: p.valor_cents, observacao: p.observacao }));
      item.total_pago_cents = pagamentosDoPeriodo.reduce((total, p) => total + p.valor_cents, 0);
      receivedPaymentsList.push(item);
    }

    // Processamento de Agendamentos & Presença
    const agendData = String(custom.agendamento_data ?? "").trim();
    const agendHora = String(custom.agendamento_hora ?? "").trim() || null;
    const proc = String(custom.procedimento ?? custom.procedure ?? "").trim() || null;
    const agendStatus = (custom.agendamento_status as AgendamentoReportItem["agendamento_status"]) ?? "agendado";
    const contactName = lead.contact_id ? allContactNames.get(lead.contact_id) ?? null : null;
    const stageName = lead.stage_id && stageMap.has(lead.stage_id) ? stageMap.get(lead.stage_id)!.name : "Etapa inicial";

    if (agendData && dentroDoPeriodo(lead.created_at, fromDate, now)) {
      agendamentosTotalCount += 1;
      const agendItem: AgendamentoReportItem = {
        id: lead.id,
        lead_id: lead.id,
        lead_title: lead.title,
        contact_name: contactName,
        stage_name: stageName,
        procedimento: proc,
        agendamento_data: agendData,
        agendamento_hora: agendHora,
        agendamento_status: agendStatus,
        valor_cents: lead.value_cents ?? null,
        created_at: lead.created_at,
      };

      agendamentosList.push(agendItem);

      if (agendStatus === "faltou") {
        agendamentosFaltouCount += 1;
        faltasList.push(agendItem);
      } else if (agendStatus === "compareceu") {
        agendamentosCompareceuCount += 1;
        compareceramList.push(agendItem);
      } else if (agendStatus === "remarcado") {
        agendamentosRemarcadoCount += 1;
        remarcadosList.push(agendItem);
      } else {
        agendamentosPendenteCount += 1;
      }
    }
  });

  const agendamentosCriados: AgendamentoReportItem[] = (calendarEvents ?? []).map((event) => {
    const startsAt = new Date(event.starts_at);
    const status: AgendamentoReportItem["agendamento_status"] = event.status === "completed" ? "compareceu" : event.status === "no_show" ? "faltou" : event.status === "cancelled" ? "cancelado" : "agendado";
    return { id: event.id, lead_id: event.lead_id, lead_title: event.title, contact_name: null, stage_name: "Agenda", procedimento: event.title, agendamento_data: startsAt.toISOString().slice(0, 10), agendamento_hora: startsAt.toISOString().slice(11, 16), agendamento_status: status, valor_cents: null, created_at: event.created_at };
  });
  agendamentosTotalCount = agendamentosCriados.length;

  const agendamentosCompareceuTaxa =
    agendamentosTotalCount > 0
      ? Math.round((agendamentosCompareceuCount / agendamentosTotalCount) * 100)
      : 0;

  const agendamentosFaltouTaxa =
    agendamentosTotalCount > 0
      ? Math.round((agendamentosFaltouCount / agendamentosTotalCount) * 100)
      : 0;

  // 9. Leads recentes (top 5 abertos)
  const recentLeadsSubset = openLeads.slice(0, 5);
  const recentLeads = recentLeadsSubset.map((lead) => {
    const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const orcamento = custom.orcamento as OrcamentoLead | undefined;
    const val = orcamento?.total_cents ?? lead.value_cents ?? 0;

    return {
      id: lead.id,
      title: lead.title,
      value_cents: typeof val === "number" ? val : 0,
      stage_name: lead.stage_id && stageMap.has(lead.stage_id) ? stageMap.get(lead.stage_id)!.name : "Etapa inicial",
      contact_name: lead.contact_id ? allContactNames.get(lead.contact_id) ?? null : null,
      budget_status: orcamento?.status ?? null,
      created_at: lead.created_at,
    };
  });

  const payload: DashboardOverviewData = {
    period_days: days,
    kpis: {
      active_conversations: activeConversationsCount ?? 0,
      new_contacts: newContactsCount ?? 0,
      open_deals_value_cents: totalOpenValueCents,
      open_deals_count: openDealsCount,
      approved_budgets_count: approvedBudgetsCount,
      approved_budgets_value_cents: approvedBudgetsValueCents,
      total_received_value_cents: totalReceivedValueCents,
      pending_received_value_cents: pendingReceivedValueCents,
      // Agendamentos
      agendamentos_total_count: agendamentosTotalCount,
      agendamentos_compareceu_count: agendamentosCompareceuCount,
      agendamentos_compareceu_taxa: agendamentosCompareceuTaxa,
      agendamentos_faltou_count: agendamentosFaltouCount,
      agendamentos_faltou_taxa: agendamentosFaltouTaxa,
      agendamentos_remarcado_count: agendamentosRemarcadoCount,
      agendamentos_pendente_count: agendamentosPendenteCount,
      messages_sent_today: messagesSentTodayCount ?? 0,
      avg_response_time_seconds: avgResponseTimeSeconds,
    },
    daily_series: dailySeries,
    pipeline_stages: pipelineStages,
    recent_leads: recentLeads,
    fontes_breakdown: fontesBreakdown,
    procedimentos_procurados: procedimentosProcurados,
    procedimentos_fechados: procedimentosFechados,
    approved_budgets_list: approvedBudgetsList,
    received_payments_list: receivedPaymentsList,
    pending_balance_list: pendingBalanceList,
    agendamentos_list: agendamentosCriados,
    faltas_list: faltasList,
    compareceram_list: compareceramList,
    remarcados_list: remarcadosList,
  };

  return ok(payload, { requestId });
}

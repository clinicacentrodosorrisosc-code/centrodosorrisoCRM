import { randomUUID } from "node:crypto";

import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  isNegotiationLead,
  isOpenBudgetLead,
  leadValueCents,
  receivedPaymentsInPeriod,
  type DashboardLead,
  type DashboardStage,
} from "@/lib/dashboard/metrics";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });

type LeadRow = DashboardLead & {
  created_at: string;
  closed_at: string | null;
  owner_user_id: string | null;
  stage_changed_at: string | null;
  title: string;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const labelDate = (date: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
type MetricKey = "criados" | "ganhos" | "perdidos" | "em_aberto" | "negocios";
type DailyMetric = { count: number; value_cents: number };


const serviceName = (lead: LeadRow) => {
  const fields = lead.custom_fields ?? {};
  const value = fields.procedimento ?? fields.procedure ?? fields.servico ?? fields.service;
  return typeof value === "string" && value.trim() ? value.trim() : "Sem servico informado";
};

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "dashboard" });
  if (!authz.ok) return authz.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fail("validation_failed", "Periodo invalido.", 422, { requestId });

  const now = new Date();
  const from = startOfDay(new Date(now.getTime() - (parsed.data.days - 1) * 86_400_000));
  const supabase = await createClient();
  const { data: pipelines, error: pipelinesError } = await supabase
    .from("crm_pipelines")
    .select("id, name, is_default, position")
    .eq("organization_id", authz.org.orgId)
    .eq("is_archived", false)
    .order("position");
  if (pipelinesError) return fail("internal_error", pipelinesError.message, 500, { requestId });

  const pipeline = (pipelines ?? []).find((item) => /comercial/i.test(item.name)) ??
    (pipelines ?? []).find((item) => item.is_default) ?? null;
  if (!pipeline) {
    return ok({ period_days: parsed.data.days, from_date: from.toISOString(), to_date: now.toISOString(), pipeline_name: "Funil Comercial", has_pipeline: false, negocios: emptyBusinessData(parsed.data.days, from), multiatendimento: emptyConversationData() }, { requestId });
  }

  const [stagesResult, leadsResult, conversationsResult] = await Promise.all([
    supabase.from("crm_stages").select("id, name, position, is_won, is_lost").eq("organization_id", authz.org.orgId).eq("pipeline_id", pipeline.id).eq("is_archived", false).order("position"),
    supabase.from("crm_leads").select("id, status, stage_id, value_cents, custom_fields, created_at, closed_at, owner_user_id, title").eq("organization_id", authz.org.orgId).eq("pipeline_id", pipeline.id),
    supabase.from("conversations").select("id, created_at, status, last_inbound_at, last_outbound_at").eq("organization_id", authz.org.orgId).eq("channel", "whatsapp"),
  ]);
  const queryError = stagesResult.error ?? leadsResult.error ?? conversationsResult.error;
  if (queryError) return fail("internal_error", queryError.message, 500, { requestId });

  const stages = (stagesResult.data ?? []) as DashboardStage[];
  const leads = (leadsResult.data ?? []) as LeadRow[];
  const negotiation = leads.filter((lead) => isNegotiationLead(lead, stages));
  const lost = leads.filter((lead) => lead.status === "lost" && lead.closed_at && new Date(lead.closed_at) >= from);
  const created = leads.filter((lead) => new Date(lead.created_at) >= from);
  const openBudget = leads.filter(isOpenBudgetLead);
  const received = leads.flatMap((lead) => receivedPaymentsInPeriod(lead, from, now));
  const totalNegotiationValue = negotiation.reduce((sum, lead) => sum + leadValueCents(lead), 0);
  const receivedRows = leads.flatMap((lead) => receivedPaymentsInPeriod(lead, from, now).map((payment) => ({ lead, payment })));

  const byOwner = new Map<string, { name: string; count: number; value_cents: number }>();
  negotiation.forEach((lead) => {
    const key = lead.owner_user_id ?? "unassigned";
    const current = byOwner.get(key) ?? { name: key === "unassigned" ? "Sem responsavel" : "Responsavel", count: 0, value_cents: 0 };
    current.count += 1;
    current.value_cents += leadValueCents(lead);
    byOwner.set(key, current);
  });
  const ownerRows = Array.from(byOwner.values()).sort((a, b) => b.value_cents - a.value_cents || b.count - a.count).map((row) => ({ ...row, percentage: totalNegotiationValue ? Math.round((row.value_cents / totalNegotiationValue) * 100) : 0 }));

  const rankOwners = (items: Array<{ lead: LeadRow; value_cents: number }>) => {
    const rows = new Map<string, { name: string; count: number; value_cents: number }>();
    items.forEach(({ lead, value_cents }) => {
      const key = lead.owner_user_id ?? "unassigned";
      const current = rows.get(key) ?? {
        name: key === "unassigned" ? "Sem responsavel" : "Responsavel",
        count: 0,
        value_cents: 0,
      };
      current.count += 1;
      current.value_cents += value_cents;
      rows.set(key, current);
    });
    const total = Array.from(rows.values()).reduce((sum, item) => sum + item.value_cents, 0);
    return Array.from(rows.values())
      .sort((a, b) => b.value_cents - a.value_cents || b.count - a.count)
      .map((item) => ({ ...item, percentage: total ? Math.round((item.value_cents / total) * 100) : 0 }));
  };
  const ownerRowsByMetric: Record<MetricKey, Array<{ name: string; count: number; value_cents: number; percentage: number }>> = {
    criados: rankOwners(created.map((lead) => ({ lead, value_cents: leadValueCents(lead) }))),
    ganhos: rankOwners(receivedRows.map(({ lead, payment }) => ({ lead, value_cents: payment.valor_cents }))),
    perdidos: rankOwners(lost.map((lead) => ({ lead, value_cents: leadValueCents(lead) }))),
    em_aberto: rankOwners(openBudget.map((lead) => ({ lead, value_cents: leadValueCents(lead) }))),
    negocios: ownerRows,
  };

  const services = new Map<string, { name: string; count: number; value_cents: number }>();
  negotiation.forEach((lead) => {
    const name = serviceName(lead);
    const item = services.get(name) ?? { name, count: 0, value_cents: 0 };
    item.count += 1;
    item.value_cents += leadValueCents(lead);
    services.set(name, item);
  });
  const daily = Array.from({ length: parsed.data.days }, (_, index) => {
    const date = new Date(from.getTime() + index * 86_400_000);
    const rows = negotiation.filter((lead) => lead.created_at.slice(0, 10) === dayKey(date));
    return { date: dayKey(date), label: labelDate(date), count: rows.length, value_cents: rows.reduce((sum, lead) => sum + leadValueCents(lead), 0) };
  });

  const terminalStatuses = new Set(["closed", "archived", "resolved"]);
  const dailyByMetric = Array.from({ length: parsed.data.days }, (_, index) => {
    const date = new Date(from.getTime() + index * 86_400_000);
    const dateKey = dayKey(date);
    const aggregateLeads = (items: LeadRow[], timestamp: (lead: LeadRow) => string | null): DailyMetric => {
      const rows = items.filter((lead) => timestamp(lead)?.slice(0, 10) === dateKey);
      return { count: rows.length, value_cents: rows.reduce((sum, lead) => sum + leadValueCents(lead), 0) };
    };
    const ganhos = receivedRows.filter(({ payment }) => (payment.criado_em ?? payment.data)?.slice(0, 10) === dateKey);
    return {
      date: dateKey,
      label: labelDate(date),
      criados: aggregateLeads(created, (lead) => lead.created_at),
      ganhos: { count: ganhos.length, value_cents: ganhos.reduce((sum, item) => sum + item.payment.valor_cents, 0) },
      perdidos: aggregateLeads(lost, (lead) => lead.closed_at),
      em_aberto: aggregateLeads(openBudget, (lead) => lead.created_at),
      negocios: aggregateLeads(negotiation, (lead) => lead.created_at),
    } as { date: string; label: string } & Record<MetricKey, DailyMetric>;
  });

  const conversations = conversationsResult.data ?? [];
  const started = conversations.filter((conversation) => new Date(conversation.created_at) >= from);
  const windowFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const active = conversations.filter((conversation) => !terminalStatuses.has(conversation.status) && conversation.last_inbound_at && new Date(conversation.last_inbound_at) >= windowFrom);
  const inConversationWindow = active;
  const awaiting = conversations.filter((conversation) => {
    if (terminalStatuses.has(conversation.status)) return false;
    if (!conversation.last_inbound_at) return false;
    if (!conversation.last_outbound_at) return true;
    return new Date(conversation.last_inbound_at) > new Date(conversation.last_outbound_at);
  });
  const hourly = Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: Array.from({ length: 24 }, (_, hour) => started.filter((conversation) => { const date = new Date(conversation.created_at); return date.getDay() === weekday && date.getHours() === hour; }).length) }));
  const dailyStarted = Array.from({ length: parsed.data.days }, (_, index) => {
    const date = new Date(from.getTime() + index * 86_400_000);
    const dateKey = dayKey(date);
    return { date: dateKey, label: labelDate(date), count: started.filter((conversation) => conversation.created_at.slice(0, 10) === dateKey).length };
  });

  return ok({
    period_days: parsed.data.days, from_date: from.toISOString(), to_date: now.toISOString(), pipeline_name: pipeline.name, has_pipeline: true,
    negocios: {
      total: { count: negotiation.length, value_cents: totalNegotiationValue },
      criados: { count: created.length, value_cents: created.reduce((sum, lead) => sum + leadValueCents(lead), 0) },
      ganhos: { count: received.length, value_cents: received.reduce((sum, payment) => sum + payment.valor_cents, 0) },
      perdidos: { count: lost.length, value_cents: lost.reduce((sum, lead) => sum + leadValueCents(lead), 0) },
      em_aberto: { count: openBudget.length, value_cents: openBudget.reduce((sum, lead) => sum + leadValueCents(lead), 0) },
      daily, por_responsavel: ownerRows, servicos: Array.from(services.values()).sort((a, b) => b.count - a.count || b.value_cents - a.value_cents).slice(0, 6), responsaveis: ownerRows.slice(0, 6),
      daily_by_metric: dailyByMetric,
      por_responsavel_por_metrica: ownerRowsByMetric,
    },
    multiatendimento: { total_iniciados: started.length, em_aberto: inConversationWindow.length, aguardando: awaiting.length, por_hora: hourly, daily_iniciados: dailyStarted },
  }, { requestId });
}

function emptyBusinessData(days: number, from: Date) {
  return {
    total: { count: 0, value_cents: 0 }, ganhos: { count: 0, value_cents: 0 }, perdidos: { count: 0, value_cents: 0 }, em_aberto: { count: 0, value_cents: 0 },
    daily: Array.from({ length: days }, (_, index) => { const date = new Date(from.getTime() + index * 86_400_000); return { date: dayKey(date), label: labelDate(date), count: 0, value_cents: 0 }; }),
    por_responsavel: [], servicos: [], responsaveis: [],
  };
}

function emptyConversationData() {
  return { total_iniciados: 0, em_aberto: 0, aguardando: 0, por_hora: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: Array.from({ length: 24 }, () => 0) })), daily_iniciados: [] };
}

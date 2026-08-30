import type { OrcamentoLead, PagamentoBaixa } from "@/lib/types/orcamento";

export interface DashboardLeadMetricRow {
  pipeline_id: string | null;
  status: string;
  closed_at: string | null;
}

export function dentroDoPeriodo(iso: string | null | undefined, inicio: Date, fim: Date): boolean {
  if (!iso) return false;
  const instante = new Date(iso).getTime();
  return Number.isFinite(instante) && instante >= inicio.getTime() && instante <= fim.getTime();
}

export function pagamentosRecebidosNoPeriodo(orcamento: OrcamentoLead | undefined, inicio: Date, fim: Date): PagamentoBaixa[] {
  return (orcamento?.pagamentos ?? []).filter((pagamento) =>
    dentroDoPeriodo(pagamento.criado_em || pagamento.data, inicio, fim),
  );
}

export function valorRecebidoNoPeriodo(orcamento: OrcamentoLead | undefined, inicio: Date, fim: Date): number {
  return pagamentosRecebidosNoPeriodo(orcamento, inicio, fim).reduce(
    (total, pagamento) => total + Math.max(0, pagamento.valor_cents || 0),
    0,
  );
}

export function leadsAbertosDoFunilPadrao<T extends DashboardLeadMetricRow>(
  leads: T[], pipelineId: string | null,
): T[] {
  return leads.filter((lead) =>
    pipelineId !== null && lead.pipeline_id === pipelineId && lead.status === "open",
  );
}

export function valorDoCardKanban(valueCents: number | null, orcamento: OrcamentoLead | undefined): number {
  return valueCents ?? orcamento?.total_cents ?? 0;
}

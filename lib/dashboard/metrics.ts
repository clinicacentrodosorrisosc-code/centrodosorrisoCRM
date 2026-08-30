export type DashboardStage = {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
};

export type DashboardLead = {
  id: string;
  status: string;
  stage_id: string;
  value_cents: number | null;
  custom_fields: Record<string, unknown> | null;
};

export type DashboardPayment = {
  valor_cents: number;
  criado_em?: string;
  data?: string;
};

export function numberFrom(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function leadValueCents(lead: DashboardLead): number {
  const budget = lead.custom_fields?.orcamento;
  const budgetRecord = budget && typeof budget === "object" ? (budget as Record<string, unknown>) : null;
  return numberFrom(lead.value_cents) || numberFrom(budgetRecord?.total_cents);
}

export function budgetForLead(lead: DashboardLead): Record<string, unknown> | null {
  const budget = lead.custom_fields?.orcamento;
  return budget && typeof budget === "object" && !Array.isArray(budget) ? (budget as Record<string, unknown>) : null;
}

export function isNegotiationLead(lead: DashboardLead, stages: DashboardStage[]): boolean {
  if (lead.status !== "open") return false;
  const stage = stages.find((item) => item.id === lead.stage_id);
  if (!stage || stage.is_won || stage.is_lost) return false;

  const budgetStage = stages.find((item) => /or[cç]amento/i.test(item.name));
  return !budgetStage || stage.position <= budgetStage.position;
}

export function isOpenBudgetLead(lead: DashboardLead): boolean {
  if (lead.status !== "open") return false;
  const status = String(budgetForLead(lead)?.status ?? "").toLowerCase();
  return status === "enviado" || status === "aprovado";
}

export function receivedPaymentsInPeriod(lead: DashboardLead, from: Date, to: Date): DashboardPayment[] {
  const payments = budgetForLead(lead)?.pagamentos;
  if (!Array.isArray(payments)) return [];

  return payments.filter((payment): payment is DashboardPayment => {
    if (!payment || typeof payment !== "object") return false;
    const item = payment as Record<string, unknown>;
    const value = numberFrom(item.valor_cents);
    const timestamp = typeof item.criado_em === "string" ? item.criado_em : typeof item.data === "string" ? item.data : null;
    if (!timestamp || value <= 0) return false;
    const date = new Date(timestamp);
    return !Number.isNaN(date.getTime()) && date >= from && date <= to;
  });
}

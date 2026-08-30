import { describe, expect, it } from "vitest";

import {
  isNegotiationLead,
  isOpenBudgetLead,
  leadValueCents,
  receivedPaymentsInPeriod,
  type DashboardLead,
  type DashboardStage,
} from "@/lib/dashboard/metrics";

const stages: DashboardStage[] = [
  { id: "new", name: "Novo", position: 1, is_won: false, is_lost: false },
  { id: "budget", name: "Orcamento", position: 2, is_won: false, is_lost: false },
  { id: "won", name: "Ganho", position: 3, is_won: true, is_lost: false },
];

const lead = (overrides: Partial<DashboardLead> = {}): DashboardLead => ({
  id: "lead-1",
  status: "open",
  stage_id: "budget",
  value_cents: null,
  custom_fields: { orcamento: { total_cents: 125000, status: "aprovado", pagamentos: [] } },
  ...overrides,
});

describe("dashboard metrics", () => {
  it("conta negociações abertas apenas até a etapa de orçamento", () => {
    expect(isNegotiationLead(lead(), stages)).toBe(true);
    expect(isNegotiationLead(lead({ status: "won", stage_id: "won" }), stages)).toBe(false);
  });

  it("usa o valor do cartão e cai no orçamento quando necessário", () => {
    expect(leadValueCents(lead({ value_cents: 250000 }))).toBe(250000);
    expect(leadValueCents(lead())).toBe(125000);
  });

  it("considera em aberto somente orçamentos enviados ou aprovados", () => {
    expect(isOpenBudgetLead(lead())).toBe(true);
    expect(isOpenBudgetLead(lead({ custom_fields: { orcamento: { status: "quitado" } } }))).toBe(false);
  });

  it("soma apenas baixas de pagamento dentro do período", () => {
    const payments = receivedPaymentsInPeriod(
      lead({
        custom_fields: {
          orcamento: {
            pagamentos: [
              { valor_cents: 50000, criado_em: "2026-08-10T12:00:00.000Z" },
              { valor_cents: 10000, criado_em: "2026-07-10T12:00:00.000Z" },
            ],
          },
        },
      }),
      new Date("2026-08-01T00:00:00.000Z"),
      new Date("2026-08-31T23:59:59.999Z"),
    );

    expect(payments).toHaveLength(1);
    expect(payments[0]?.valor_cents).toBe(50000);
  });
});

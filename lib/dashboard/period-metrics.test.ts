import { describe, expect, it } from "vitest";
import type { OrcamentoLead } from "@/lib/types/orcamento";
import { leadsAbertosDosFunisComerciais, pagamentosRecebidosNoPeriodo, valorDoCardKanban, valorRecebidoNoPeriodo } from "./period-metrics";

const inicio = new Date("2026-08-01T00:00:00.000Z");
const fim = new Date("2026-08-31T23:59:59.999Z");

describe("métricas do dashboard por período", () => {
  it("soma somente pagamentos efetivamente recebidos dentro do período", () => {
    const orcamento = { pagamentos: [
      { id: "p1", data: "2026-07-31", criado_em: "2026-07-31T23:59:59.999Z", valor_cents: 1000, metodo: "pix" },
      { id: "p2", data: "2026-08-10", criado_em: "2026-08-10T12:00:00.000Z", valor_cents: 2500, metodo: "dinheiro" },
      { id: "p3", data: "2026-09-01", criado_em: "2026-09-01T00:00:00.000Z", valor_cents: 5000, metodo: "pix" },
    ] } as OrcamentoLead;
    expect(valorRecebidoNoPeriodo(orcamento, inicio, fim)).toBe(2500);
    expect(pagamentosRecebidosNoPeriodo(orcamento, inicio, fim).map((p) => p.id)).toEqual(["p2"]);
  });

  it("mantém somente cards abertos, do funil informado e criados no período", () => {
    const base = { status: "open", closed_at: null };
    const leads = [
      { ...base, pipeline_id: "padrao" },
      { ...base, pipeline_id: "outro" },
      { ...base, pipeline_id: "padrao", status: "won" },
      { ...base, pipeline_id: "outro-comercial" },
    ];
    expect(leadsAbertosDosFunisComerciais(leads, new Set(["padrao", "outro-comercial"]))).toEqual([leads[0], leads[3]]);
  });

  it("usa o valor do card no Kanban mesmo se o or?amento interno estiver zerado", () => {
    const orcamento = { total_cents: 0 } as OrcamentoLead;
    expect(valorDoCardKanban(1_800_000, orcamento)).toBe(1_800_000);
    expect(valorDoCardKanban(null, { total_cents: 25_000 } as OrcamentoLead)).toBe(25_000);
  });
});

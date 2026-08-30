import { describe, expect, it } from "vitest";

import { encontrarGruposDuplicados } from "@/lib/leads/duplicates";
import type { Lead } from "@/lib/types/leads";

function lead(id: string, title: string, contactId: string | null = null): Lead {
  return { id, title, contact_id: contactId } as Lead;
}

describe("duplicatas do funil", () => {
  it("agrupa primeiro pelo mesmo contato", () => {
    const grupos = encontrarGruposDuplicados([
      lead("a", "Orçamento", "contato-1"),
      lead("b", "Outro título", "contato-1"),
      lead("c", "Sem repetição", "contato-2"),
    ]);

    expect(grupos.map((grupo) => grupo.map((item) => item.id))).toEqual([["a", "b"]]);
  });

  it("sem contato, ignora caixa, espaços e acentos do título", () => {
    const grupos = encontrarGruposDuplicados([
      lead("a", "  João da Silva "),
      lead("b", "joao da silva"),
      lead("c", "Maria"),
    ]);

    expect(grupos.map((grupo) => grupo.map((item) => item.id))).toEqual([["a", "b"]]);
  });

  it("não mistura contatos diferentes só porque o título coincide", () => {
    expect(encontrarGruposDuplicados([
      lead("a", "Mesmo nome", "contato-1"),
      lead("b", "Mesmo nome", "contato-2"),
    ])).toEqual([]);
  });
});

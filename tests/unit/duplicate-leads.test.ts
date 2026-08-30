import { describe, expect, it } from "vitest";

import { encontrarGruposDuplicados } from "@/lib/leads/duplicates";
import type { Lead } from "@/lib/types/leads";

function lead(id: string, title: string, phone: string | null = null, contactId = id): Lead {
  return { id, title, contact_id: contactId, contact_phone_number: phone } as Lead;
}

describe("duplicatas do funil", () => {
  it("agrupa pelo mesmo telefone, mesmo com contatos diferentes", () => {
    const grupos = encontrarGruposDuplicados([
      lead("a", "Orçamento", "+55 (48) 3431-1390", "contato-1"),
      lead("b", "Outro título", "554834311390", "contato-2"),
      lead("c", "Sem repetição", "5548999999999", "contato-3"),
    ]);

    expect(grupos.map((grupo) => grupo.map((item) => item.id))).toEqual([["a", "b"]]);
  });

  it("ignora máscara, espaços e sinal de mais no telefone", () => {
    const grupos = encontrarGruposDuplicados([
      lead("a", "João da Silva", "+55 48 99999-1111"),
      lead("b", "Maria", "5548999991111"),
      lead("c", "Outro", "5548999992222"),
    ]);

    expect(grupos.map((grupo) => grupo.map((item) => item.id))).toEqual([["a", "b"]]);
  });

  it("não mistura cards pelo título e ignora cards sem telefone", () => {
    expect(encontrarGruposDuplicados([
      lead("a", "Mesmo nome", null, "contato-1"),
      lead("b", "Mesmo nome", null, "contato-2"),
      lead("c", "Mesmo nome", "5548999993333", "contato-3"),
      lead("d", "Mesmo nome", "5548999994444", "contato-4"),
    ])).toEqual([]);
  });
});

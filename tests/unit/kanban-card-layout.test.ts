import { describe, expect, it } from "vitest";

import { DEFAULT_CARD_LAYOUT, cardLayoutOptions, readCardLayout } from "@/lib/kanban/card-layout";

describe("layout configurável do card", () => {
  it("usa um layout limpo quando o funil ainda não foi configurado", () => {
    expect(readCardLayout({})).toEqual(DEFAULT_CARD_LAYOUT);
  });

  it("aceita campos nativos e personalizados, removendo duplicados", () => {
    expect(
      readCardLayout({ card_layout: { slots: ["value", "custom:convenio", "value"] } }),
    ).toEqual({ slots: ["value", "custom:convenio"] });
  });

  it("ignora configuração inválida sem quebrar o quadro", () => {
    expect(readCardLayout({ card_layout: { slots: ["segredo_inventado"] } })).toEqual(
      DEFAULT_CARD_LAYOUT,
    );
  });

  it("oferece no editor os campos personalizados reais do funil", () => {
    expect(cardLayoutOptions([{ key: "convenio", label: "Convênio" }])).toContainEqual({
      value: "custom:convenio",
      label: "Convênio",
    });
  });
});

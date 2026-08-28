import { z } from "zod";

export const CARD_LAYOUT_BUILTINS = [
  "procedure",
  "value",
  "owner",
  "appointment",
  "source",
  "tag",
  "conversation",
  "stage_age",
  "status",
] as const;

export const cardLayoutFieldSchema = z.union([
  z.enum(CARD_LAYOUT_BUILTINS),
  z.string().regex(/^custom:[a-z][a-z0-9_]{0,39}$/i),
]);

export const cardLayoutSchema = z.object({
  slots: z
    .array(cardLayoutFieldSchema)
    .max(6)
    .transform((slots) => Array.from(new Set(slots))),
});

export type CardLayoutField = z.infer<typeof cardLayoutFieldSchema>;
export type CardLayout = z.infer<typeof cardLayoutSchema>;

export const DEFAULT_CARD_LAYOUT: CardLayout = {
  slots: ["procedure", "value", "owner", "appointment", "source", "tag"],
};

export interface CardLayoutOption {
  value: CardLayoutField;
  label: string;
}

const BUILTIN_LABELS: Record<(typeof CARD_LAYOUT_BUILTINS)[number], string> = {
  procedure: "Procedimento / produto",
  value: "Valor",
  owner: "Responsável",
  appointment: "Agendamento",
  source: "Origem",
  tag: "Primeira tag",
  conversation: "Última conversa",
  stage_age: "Tempo na etapa",
  status: "Status / próxima ação",
};

export function readCardLayout(settings: Record<string, unknown> | null | undefined): CardLayout {
  const parsed = cardLayoutSchema.safeParse(settings?.card_layout);
  return parsed.success ? parsed.data : DEFAULT_CARD_LAYOUT;
}

export function cardLayoutOptions(
  fields: Array<{ key: string; label: string }> = [],
): CardLayoutOption[] {
  return [
    ...CARD_LAYOUT_BUILTINS.map((value) => ({ value, label: BUILTIN_LABELS[value] })),
    ...fields.map((field) => ({
      value: `custom:${field.key}` as CardLayoutField,
      label: field.label,
    })),
  ];
}

export function cardLayoutLabel(field: CardLayoutField, options: CardLayoutOption[]): string {
  return options.find((option) => option.value === field)?.label ?? field.replace(/^custom:/, "");
}

import type { Lead } from "@/lib/types/leads";

function normalizarTitulo(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Detecta cards repetidos dentro do conjunto já filtrado pelo funil.
 * Um contato compartilhado é o sinal mais forte; sem contato, usa o título
 * normalizado para não perder diferenças apenas de caixa, espaço ou acento.
 */
export function encontrarGruposDuplicados(leads: Lead[]): Lead[][] {
  const grupos = new Map<string, Lead[]>();

  for (const lead of leads) {
    const chave = lead.contact_id
      ? `contato:${lead.contact_id}`
      : `titulo:${normalizarTitulo(lead.title)}`;

    if (chave.endsWith(":")) continue;
    grupos.set(chave, [...(grupos.get(chave) ?? []), lead]);
  }

  return [...grupos.values()].filter((grupo) => grupo.length > 1);
}

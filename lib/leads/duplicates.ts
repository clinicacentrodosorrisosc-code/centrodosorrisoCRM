import type { Lead } from "@/lib/types/leads";

/** Mantém apenas os dígitos para tolerar máscara, espaços e o sinal de +. */
export function normalizarTelefone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Detecta cards repetidos dentro do conjunto já filtrado pelo funil.
 * O telefone é o critério de duplicidade: o mesmo número pode estar associado
 * a registros de contato diferentes e ainda assim representar a mesma pessoa.
 * Cards sem telefone ficam fora da detecção para evitar falsos positivos por
 * título ou por contato incompleto.
 */
export function encontrarGruposDuplicados(leads: Lead[]): Lead[][] {
  const grupos = new Map<string, Lead[]>();

  for (const lead of leads) {
    const telefone = normalizarTelefone(lead.contact_phone_number);
    if (!telefone) continue;

    const chave = `telefone:${telefone}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), lead]);
  }

  return [...grupos.values()].filter((grupo) => grupo.length > 1);
}

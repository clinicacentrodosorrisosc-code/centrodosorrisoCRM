import type { Lead } from "@/lib/types/leads";

/** Mantém apenas os dígitos para tolerar máscara, espaços e o sinal de +. */
export function normalizarTelefone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Resolve o telefone que identifica o card.
 *
 * O telefone normalmente vem do contato relacionado. Leads antigos/importados
 * também podem carregar o valor original em custom_fields.phone; esse fallback
 * permite encontrar duplicatas já existentes sem exigir uma migração de dados.
 */
export function telefoneDoLead(lead: Lead): string {
  const telefoneDoContato = normalizarTelefone(lead.contact_phone_number);
  if (telefoneDoContato) return telefoneDoContato;

  const campos = lead.custom_fields ?? {};
  for (const chave of ["phone", "telefone", "celular", "whatsapp"]) {
    const valor = campos[chave];
    if (typeof valor === "string") {
      const telefone = normalizarTelefone(valor);
      if (telefone) return telefone;
    }
  }

  return "";
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
    const telefone = telefoneDoLead(lead);
    if (!telefone) continue;

    const chave = `telefone:${telefone}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), lead]);
  }

  return [...grupos.values()].filter((grupo) => grupo.length > 1);
}

"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

export const DEFAULT_PROCEDIMENTOS = [
  "Clareamento Dental (Laser / Caseiro)",
  "Alinhadores Invisíveis / Ortodontia",
  "Implantes Dentários & Prótese",
  "Facetas / Lentes de Contato Dental",
  "Limpeza / Profilaxia & Avaliação",
  "Tratamento de Canal (Endodontia)",
  "Restauração Estética",
  "Harmonização Facial / Botox",
  "Cirurgia / Extração de Siso",
  "Odontopediatria",
  "Prótese Fixa / Removível",
  "Periodontia / Gengiva",
  "Outro Procedimento",
];

export const DEFAULT_FONTES = [
  "WhatsApp",
  "Instagram",
  "Facebook Ads",
  "Google Ads",
  "Indicação de Paciente",
  "Tráfego Pago",
  "Site / Landing Page",
  "Passante / Balcão",
  "Parcerias / Convênios",
  "Outro",
];

export const DEFAULT_TAGS = [
  "Avaliação Agendada",
  "Primeira Consulta",
  "Paciente VIP",
  "Urgência",
  "Retorno",
  "Orçamento Pendente",
  "Fechado / Aprovado",
  "Em Negociação",
  "Pós-Atendimento",
];

export interface CadastrosData {
  procedimentos: string[];
  fontes: string[];
  tags: string[];
}

export function useCadastros() {
  const qc = useQueryClient();

  const query = useQuery<CadastrosData>({
    queryKey: ["settings", "cadastros"],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: CadastrosData }>("/api/v1/settings/cadastros");
        return {
          procedimentos:
            res?.data?.procedimentos && res.data.procedimentos.length > 0
              ? res.data.procedimentos
              : DEFAULT_PROCEDIMENTOS,
          fontes:
            res?.data?.fontes && res.data.fontes.length > 0
              ? res.data.fontes
              : DEFAULT_FONTES,
          tags:
            res?.data?.tags && res.data.tags.length > 0
              ? res.data.tags
              : DEFAULT_TAGS,
        };
      } catch {
        return {
          procedimentos: DEFAULT_PROCEDIMENTOS,
          fontes: DEFAULT_FONTES,
          tags: DEFAULT_TAGS,
        };
      }
    },
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (data: CadastrosData) => {
      return apiClient.patch("/api/v1/settings/cadastros", data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "cadastros"] });
      toast.success("Cadastros atualizados com sucesso!");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar cadastros.");
    },
  });

  return {
    ...query,
    procedimentos: query.data?.procedimentos ?? DEFAULT_PROCEDIMENTOS,
    fontes: query.data?.fontes ?? DEFAULT_FONTES,
    tags: query.data?.tags ?? DEFAULT_TAGS,
    saveCadastros: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

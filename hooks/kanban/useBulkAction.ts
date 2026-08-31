"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { splitLeadIdsIntoBatches } from "@/lib/kanban/bulk-action";
import type { BulkLeadActionInput } from "@/lib/schemas/leads";
import { liberarEcoLocal, marcarEcoLocal } from "@/lib/kanban/local-echo";

export function useBulkAction(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BulkLeadActionInput) => {
      // O terceiro caminho de mutação — e o que eu tinha esquecido: sem marcar
      // aqui, a aba de quem executou a ação em massa pulsava junto com as
      // outras, como se a própria ação fosse novidade vinda de fora.
      for (const leadId of input.lead_ids) marcarEcoLocal(leadId);
      let updatedCount = 0;

      // A API limita cada escrita a 50 cards. A interface, por sua vez, pode
      // selecionar todos os cards visíveis; divide o envio para manter o
      // limite e preservar as mesmas validações/autorizações no servidor.
      for (const leadIds of splitLeadIdsIntoBatches(input.lead_ids)) {
        const response = await apiClient.post<{ data: { updated_count: number } }>(
          "/api/v1/leads/bulk",
          { ...input, lead_ids: leadIds } as BulkLeadActionInput,
        );
        updatedCount += response.data.updated_count;
      }

      return { data: { updated_count: updatedCount } };
    },
    onError: showApiError,
    onSettled: (_data, _err, input) => {
      for (const leadId of input.lead_ids) liberarEcoLocal(leadId);
      qc.invalidateQueries({ queryKey: ["board", pipelineId] });
    },
  });
}

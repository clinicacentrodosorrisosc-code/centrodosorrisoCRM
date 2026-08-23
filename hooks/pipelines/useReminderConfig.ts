"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export interface ReminderConfig {
  id: string;
  organization_id: string;
  pipeline_id: string;
  is_active: boolean;
  /** Horas antes do agendamento (1 | 2 | 4 | 24) */
  offset_hours: 1 | 2 | 4 | 24;
  template_name: string;
  template_language: string;
  /** UUIDs das etapas. Vazio = todas. */
  active_stage_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface SaveReminderConfigInput {
  is_active?: boolean;
  offset_hours: 1 | 2 | 4 | 24;
  template_name: string;
  template_language: string;
  active_stage_ids: string[];
}

function reminderKey(pipelineId: string) {
  return ["pipeline-reminder-config", pipelineId];
}

/** Busca a configuração de lembrete do pipeline. Devolve null se não existe. */
export function useReminderConfig(pipelineId: string | null) {
  return useQuery({
    queryKey: reminderKey(pipelineId ?? ""),
    enabled: !!pipelineId,
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: { config: ReminderConfig } }>(
          `/api/v1/pipelines/${pipelineId}/reminder`,
        );
        return res.data.config;
      } catch (err: unknown) {
        // 404 = sem config, não é erro
        const status = (err as { status?: number })?.status;
        if (status === 404) return null;
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

/** Cria ou atualiza a configuração de lembrete. */
export function useSaveReminderConfig(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveReminderConfigInput) =>
      apiClient.put<{ data: { config: ReminderConfig } }>(
        `/api/v1/pipelines/${pipelineId}/reminder`,
        input,
      ),
    onError: showApiError,
    onSuccess: (res) => {
      qc.setQueryData(reminderKey(pipelineId), res.data.config);
    },
  });
}

/** Remove a configuração de lembrete do pipeline. */
export function useDeleteReminderConfig(pipelineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiClient.delete<{ data: { deleted: boolean } }>(
        `/api/v1/pipelines/${pipelineId}/reminder`,
      ),
    onError: showApiError,
    onSuccess: () => {
      qc.setQueryData(reminderKey(pipelineId), null);
    },
  });
}

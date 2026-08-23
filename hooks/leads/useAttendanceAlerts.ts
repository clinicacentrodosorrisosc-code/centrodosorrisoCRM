"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import type { PendingAttendanceLead } from "@/app/api/v1/leads/pending-attendance/route";

export function useAttendanceAlerts() {
  const qc = useQueryClient();
  const [snoozedMap, setSnoozedMap] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["pending-attendance-alerts"],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: { pending: PendingAttendanceLead[] } }>(
          "/api/v1/leads/pending-attendance",
        );
        return res.data.pending;
      } catch {
        return [];
      }
    },
    refetchInterval: 30_000, // a cada 30 segundos
    staleTime: 15_000,
  });

  // Filtra os que foram silenciados temporariamente
  const pendingLeads = (data ?? []).filter((lead) => {
    const snoozedUntil = snoozedMap[lead.id];
    if (snoozedUntil && snoozedUntil > 0) return false;
    return true;
  });

  const recordAttendance = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: "compareceu" | "faltou" }) => {
      return apiClient.post<{
        data: {
          status: string;
          moved_to_stage: { id: string; name: string } | null;
        };
      }>(`/api/v1/leads/${leadId}/attendance`, { status });
    },
    onSuccess: (res, vars) => {
      const moved = res.data.moved_to_stage;
      if (vars.status === "compareceu") {
        toast.success(
          moved
            ? `Presença confirmada! Lead movido para "${moved.name}".`
            : "Presença confirmada! Paciente compareceu à consulta.",
        );
      } else {
        toast.error(
          moved
            ? `Falta registrada. Lead movido para "${moved.name}".`
            : "Não comparecimento registrado.",
        );
      }

      // Atualiza caches do React Query
      qc.invalidateQueries({ queryKey: ["pending-attendance-alerts"] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar presença");
    },
  });

  function snoozeLead(leadId: string, minutes: number = 15) {
    const until = Date.now() + minutes * 60 * 1000;
    setSnoozedMap((prev) => ({ ...prev, [leadId]: until }));
    toast.info(`Lembrete adiado por ${minutes} minutos.`);

    // Agenda limpeza do snooze
    setTimeout(() => {
      setSnoozedMap((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
    }, minutes * 60 * 1000);
  }

  return {
    pendingLeads,
    isLoading,
    recordAttendance,
    snoozeLead,
  };
}

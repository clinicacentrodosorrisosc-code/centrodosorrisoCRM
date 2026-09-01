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
    refetchInterval: 10_000, // a cada 10 segundos
    staleTime: 5_000,
  });

  // Filtra os que foram silenciados temporariamente
  const pendingLeads = (data ?? []).filter((lead) => {
    const snoozedUntil = snoozedMap[lead.id];
    if (snoozedUntil && snoozedUntil > 0) return false;
    return true;
  });

  const recordAttendance = useMutation({
    mutationFn: async ({
      leadId,
      status,
      nova_data,
      nova_hora,
    }: {
      leadId: string;
      status: "compareceu" | "faltou" | "remarcado";
      nova_data?: string;
      nova_hora?: string;
    }) => {
      return apiClient.post<{
        data: {
          status: string;
          moved_to_stage: { id: string; name: string } | null;
        };
      }>(`/api/v1/leads/${leadId}/attendance`, { status, nova_data, nova_hora });
    },
    onSuccess: (res, vars) => {
      const moved = res.data.moved_to_stage;
      if (vars.status === "compareceu") {
        toast.success(
          moved
            ? `Presença confirmada! Lead movido para "${moved.name}".`
            : "Presença confirmada! Paciente compareceu à consulta.",
        );
      } else if (vars.status === "faltou") {
        toast.error(
          moved
            ? `Falta registrada. Lead movido para "${moved.name}".`
            : "Não comparecimento registrado.",
        );
      } else if (vars.status === "remarcado") {
        toast.success(
          vars.nova_data
            ? `Consulta remarcada com sucesso para ${vars.nova_data.split("-").reverse().join("/")} às ${vars.nova_hora || "09:00"}!`
            : "Agendamento remarcado com sucesso!",
        );
      }

      // Atualiza caches do React Query
      qc.invalidateQueries({ queryKey: ["pending-attendance-alerts"] });
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar status da consulta");
    },
  });

  function snoozeLead(leadId: string, minutes: number = 5) {
    const validMinutes = Math.max(1, minutes);
    const until = Date.now() + validMinutes * 60 * 1000;
    setSnoozedMap((prev) => ({ ...prev, [leadId]: until }));
    toast.info(`Lembrete pausado por ${validMinutes} minuto(s).`);

    // Agenda limpeza do snooze
    setTimeout(() => {
      setSnoozedMap((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
    }, validMinutes * 60 * 1000);
  }

  return {
    pendingLeads,
    isLoading,
    recordAttendance,
    snoozeLead,
  };
}

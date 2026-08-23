"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { ActivitiesReportData } from "@/app/api/v1/reports/activities/route";

export interface ActivitiesReportFilters {
  days?: number;
  type?: "all" | "tasks" | "agendamentos" | "stages" | "proposals" | "notes" | "messages";
  actor_kind?: "all" | "user" | "ai" | "system";
  user_id?: string;
  search?: string;
}

export function useActivitiesReport(filters: ActivitiesReportFilters = {}) {
  const { days = 30, type = "all", actor_kind = "all", user_id, search } = filters;

  const searchParams = new URLSearchParams();
  searchParams.set("days", String(days));
  if (type && type !== "all") searchParams.set("type", type);
  if (actor_kind && actor_kind !== "all") searchParams.set("actor_kind", actor_kind);
  if (user_id) searchParams.set("user_id", user_id);
  if (search && search.trim()) searchParams.set("search", search.trim());

  const queryString = searchParams.toString();

  return useQuery({
    queryKey: ["reports", "activities", queryString],
    queryFn: async () => {
      return apiClient.get<{ data: ActivitiesReportData }>(
        `/api/v1/reports/activities?${queryString}`,
      );
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

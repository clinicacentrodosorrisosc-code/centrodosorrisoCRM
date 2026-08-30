"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { DashboardOverviewData } from "@/app/api/v1/dashboard/overview/route";

export function useDashboardOverview(days: number = 30, pipelineId: string | null = null) {
  const params = new URLSearchParams({ days: String(days) });
  if (pipelineId) params.set("pipeline_id", pipelineId);

  return useQuery({
    queryKey: ["dashboard", "overview", days, pipelineId],
    queryFn: async () => {
      return apiClient.get<{ data: DashboardOverviewData }>(`/api/v1/dashboard/overview?${params.toString()}`);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

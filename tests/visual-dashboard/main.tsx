import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "../../app/globals.css";
import { DashboardClient } from "../../app/app/dashboard/_components/DashboardClient";
import type { DashboardOverviewData } from "../../app/api/v1/dashboard/overview/route";

function payload(days: number): DashboardOverviewData {
  const factor = days === 7 ? 1 : 3;
  return {
    period_days: days,
    kpis: {
      active_conversations: 4,
      new_contacts: 6 * factor,
      open_deals_value_cents: 1250000 * factor,
      open_deals_count: 5 * factor,
      approved_budgets_count: 2,
      approved_budgets_value_cents: 890000,
      total_received_value_cents: 375000 * factor,
      pending_received_value_cents: 515000,
      agendamentos_total_count: 8 * factor,
      agendamentos_compareceu_count: 6,
      agendamentos_compareceu_taxa: 75,
      agendamentos_faltou_count: 1,
      agendamentos_faltou_taxa: 13,
      agendamentos_remarcado_count: 1,
      agendamentos_pendente_count: 0,
      messages_sent_today: 42,
      avg_response_time_seconds: 95,
    },
    daily_series: Array.from({ length: days }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      label: `${String(index + 1).padStart(2, "0")}/08`,
      conversations: index % 5,
      messages_sent: 8 + index,
      messages_received: 6 + index,
    })),
    pipeline_stages: [
      { id: "s1", name: "Novo", color: "#64748B", count: 2 * factor, value_cents: 400000 * factor },
      { id: "s2", name: "Negociação", color: "#0F766E", count: 3 * factor, value_cents: 850000 * factor },
    ],
    recent_leads: [],
    fontes_breakdown: [],
    procedimentos_procurados: [],
    procedimentos_fechados: [],
    approved_budgets_list: [],
    received_payments_list: [],
    pending_balance_list: [],
    agendamentos_list: [],
    faltas_list: [],
    compareceram_list: [],
    remarcados_list: [],
  };
}

window.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const days = Number(new URL(url, window.location.origin).searchParams.get("days") ?? "30");
  return new Response(JSON.stringify({ data: payload(days) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DashboardClient orgName="Clínica de Demonstração" />
    </QueryClientProvider>
  </React.StrictMode>,
);

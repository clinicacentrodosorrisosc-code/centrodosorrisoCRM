"use client";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useBoard } from "@/hooks/kanban/useBoard";

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const obj = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    if (typeof obj.message === "string") {
      const code = typeof obj.code === "string" ? ` [${obj.code}]` : "";
      return `${obj.message}${code}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return "Erro desconhecido";
    }
  }
  return String(err);
}
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { HorizontalFunnelView } from "@/components/kanban/HorizontalFunnelView";
import { FilterBar } from "@/components/kanban/FilterBar";
import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import { NewLeadDialog } from "@/components/kanban/NewLeadDialog";
import { Button } from "@/components/ui/button";
import { Bell, Plus, Kanban, Funnel } from "@/lib/ui/icons";
import { ReminderConfigDialog } from "@/components/kanban/ReminderConfigDialog";
import type { LeadFilters } from "@/lib/kanban/filters";
import { applyFilters, filtersFromParams, filtersToParams } from "@/lib/kanban/filters";

export function PipelinePageClient({
  pipelineId,
  initialName,
}: {
  pipelineId: string;
  initialName: string;
}) {
  const { data, isLoading, error, pulses, realtimeStatus, seguranca } = useBoard(pipelineId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const setFilters = useCallback(
    (next: LeadFilters) => {
      const qs = filtersToParams(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "funnel">("kanban");

  const filteredLeads = data ? applyFilters(data.leads, filters) : [];

  return (
    <div
      className="flex h-full flex-col gap-4"
      data-realtime-status={realtimeStatus.toLowerCase()}
      data-refetch-divergencias={seguranca.divergencias}
      data-refetch-em={seguranca.ultimaVerificacao ?? ""}
    >
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {data?.pipeline.name ?? initialName}
          </h1>

          {/* Alternador de Visualização: Kanban vs Funil Horizontal */}
          <div className="flex items-center rounded-lg border border-border/80 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Kanban size={14} /> Quadro Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode("funnel")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                viewMode === "funnel"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Funnel size={14} /> Funil Horizontal
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setReminderOpen(true)}
            disabled={!data}
            aria-label="Configurar lembrete de agendamento"
          >
            <Bell size={16} className="mr-2" /> Lembrete de Consulta
          </Button>
          <Button onClick={() => setNewOpen(true)} disabled={!data}>
            <Plus size={16} className="mr-2" /> Novo Lead
          </Button>
        </div>
      </header>

      {data && (
        <NewLeadDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          pipelineId={pipelineId}
          stages={data.stages}
        />
      )}

      <FilterBar filters={filters} onChange={setFilters} leads={data?.leads ?? []} />

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Não consegui carregar este funil:{" "}
          {formatError(error)}
        </div>
      ) : isLoading || !data ? (
        <div className="flex flex-1 animate-pulse items-center justify-center text-muted-foreground">
          Carregando…
        </div>
      ) : viewMode === "kanban" ? (
        <KanbanBoard
          pipelineId={pipelineId}
          stages={data.stages}
          leads={filteredLeads}
          pulses={pulses}
          pipeline={data.pipeline}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : (
        <HorizontalFunnelView
          pipeline={data.pipeline}
          stages={data.stages}
          leads={filteredLeads}
          pipelineId={pipelineId}
        />
      )}

      {viewMode === "kanban" && (
        <BulkActionBar
          selectedIds={selectedIds}
          stages={data?.stages ?? []}
          pipelineId={pipelineId}
          onClear={() => setSelectedIds([])}
        />
      )}

      {/* Dialog de configuração de lembrete — partilhado com o 3-dots do card */}
      <ReminderConfigDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        pipelineId={pipelineId}
        stages={data?.stages ?? []}
      />
    </div>
  );
}

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
import { Bell, Plus, Kanban, Funnel, Gear, DotsThree, Copy } from "@/lib/ui/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReminderConfigDialog } from "@/components/kanban/ReminderConfigDialog";
import { CardLayoutDialog } from "@/components/kanban/CardLayoutDialog";
import type { LeadFilters } from "@/lib/kanban/filters";
import { applyFilters, filtersFromParams, filtersToParams } from "@/lib/kanban/filters";

export function PipelinePageClient({
  pipelineId,
  initialName,
  podeConfigurarCard,
}: {
  pipelineId: string;
  initialName: string;
  podeConfigurarCard: boolean;
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
  const [cardLayoutOpen, setCardLayoutOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "funnel">("kanban");
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  const filteredLeads = data ? applyFilters(data.leads, filters) : [];

  return (
    <div
      className="flex h-full flex-col gap-4"
      data-realtime-status={realtimeStatus.toLowerCase()}
      data-refetch-divergencias={seguranca.divergencias}
      data-refetch-em={seguranca.ultimaVerificacao ?? ""}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {data?.pipeline.name ?? initialName}
          </h1>

          {/* Alternador de Visualização: Kanban vs Funil Horizontal */}
          <div className="border-border/80 bg-muted/40 flex items-center rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
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
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Mais opções do funil" disabled={!data}>
                <DotsThree size={18} weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeConfigurarCard && <DropdownMenuItem onSelect={() => setCardLayoutOpen(true)}><Gear size={16} /> Layout do card</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setReminderOpen(true)}><Bell size={16} /> Lembrete de Consulta</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDuplicatesOpen(true)}><Copy size={16} /> Encontrar duplicatas</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>          <Button onClick={() => setNewOpen(true)} disabled={!data}>
            <Plus size={16} className="mr-2" /> Novo Lead
          </Button>
        </div>
      </header>

      <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}><DialogContent><DialogHeader><DialogTitle>Duplicatas neste funil</DialogTitle><DialogDescription>Leads com o mesmo telefone ou título.</DialogDescription></DialogHeader><div className="space-y-2">{(() => { const groups = new Map<string, Array<{ id: string; title: string }>>(); for (const lead of data?.leads ?? []) { const key = lead.title.trim().toLowerCase(); groups.set(key, [...(groups.get(key) ?? []), lead]); } const duplicates = [...groups.values()].filter((g) => g.length > 1); return duplicates.length ? duplicates.map((g) => <div key={g[0]!.id} className="rounded border p-2 text-sm">{g.map((lead) => lead.title).join(" · ")}</div>) : <p className="text-sm text-muted-foreground">Nenhuma duplicata encontrada.</p>; })()}</div></DialogContent></Dialog>
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
        <div className="border-destructive/30 bg-destructive/10 rounded-md border p-4 text-sm">
          Não consegui carregar este funil: {formatError(error)}
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

      {data && (
        <CardLayoutDialog
          open={cardLayoutOpen}
          onOpenChange={setCardLayoutOpen}
          pipelineId={pipelineId}
          pipelineName={data.pipeline.name}
          settings={data.pipeline.settings}
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

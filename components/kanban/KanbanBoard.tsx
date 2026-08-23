"use client";
import { useCallback, useMemo, useState } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoard } from "@/hooks/kanban/useBoard";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useAtRiskLeads } from "@/hooks/leads/useAtRiskLeads";
import { useReactivations } from "@/hooks/leads/useReactivations";
import { midpoint } from "@/lib/kanban/fractional-indexing";
import { parseReaisToCents } from "@/lib/money";
import type { Lead } from "@/lib/types/leads";
import type { UpdateLeadInput } from "@/lib/schemas/leads";
import type { Pipeline, Stage } from "@/lib/kanban/types";
import { CalendarBlank, Clock, CheckCircle, CurrencyDollar } from "@/lib/ui/icons";
import { StageColumn } from "./StageColumn";
import { LeadDossier } from "./LeadDossier";

interface KanbanBoardProps {
  pipelineId: string;
  stages?: Stage[];
  leads?: Lead[];
  pipeline?: Pipeline;
  selectedIds?: string[];
  pulses?: Map<string, number>;
  onSelectionChange?: (ids: string[]) => void;
}

function groupLeadsByStage(stages: Stage[], leads: Lead[]): Map<string, Lead[]> {
  const map = new Map<string, Lead[]>();
  for (const stage of stages) map.set(stage.id, []);
  for (const lead of leads) {
    const bucket = map.get(lead.stage_id);
    if (bucket) bucket.push(lead);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.position_in_stage - b.position_in_stage);
  }
  return map;
}

function BoardSkeleton() {
  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex h-full w-80 shrink-0 flex-col rounded-lg bg-surface-muted/50 p-2"
        >
          <div className="mb-3 flex items-center justify-between px-2 py-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-6 rounded-full" />
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-28 w-full rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KanbanBoard({
  pipelineId,
  stages: stagesProp,
  leads: leadsProp,
  pipeline: pipelineProp,
  selectedIds,
  pulses: pulsesProp,
  onSelectionChange,
}: KanbanBoardProps) {
  const useExternal = Boolean(stagesProp && leadsProp);
  const queryResult = useBoard(useExternal ? null : pipelineId);
  const moveCard = useMoveCard(pipelineId);
  const editLead = useEditLead(pipelineId);
  const { data: members } = useAssignableMembers(true);
  const ownerNames = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m.full_name])),
    [members],
  );
  const { data: atRisk } = useAtRiskLeads();
  const { data: propostasVivas } = useReactivations();
  const reactivations = useMemo(() => {
    const m = new Map<string, { proposalId: string; expiresAt: string }>();
    for (const p of propostasVivas ?? []) {
      m.set(p.lead_id, { proposalId: p.proposal_id, expiresAt: p.expires_at });
    }
    return m;
  }, [propostasVivas]);
  const coolingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of atRisk?.items ?? []) {
      if (item.pipeline_id !== pipelineId) continue;
      if (item.risk === "em_risco" || item.risk === "critico") ids.add(item.id);
    }
    return ids;
  }, [atRisk, pipelineId]);
  const canonicalTags = useMemo(() => {
    const raw = (pipelineProp ?? queryResult.data?.pipeline)?.settings?.canonical_tags;
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
  }, [pipelineProp, queryResult.data?.pipeline]);

  const [dossieId, setDossieId] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selectedLeadIds = useMemo(
    () => (selectedIds ? new Set(selectedIds) : internalSelected),
    [selectedIds, internalSelected],
  );

  const [pendingScheduleMove, setPendingScheduleMove] = useState<{
    lead: Lead;
    destStageId: string;
    destStageName: string;
    newPosition: number;
  } | null>(null);

  const [scheduleData, setScheduleData] = useState("");
  const [scheduleHora, setScheduleHora] = useState("09:00");
  const [scheduleProcedimento, setScheduleProcedimento] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const [pendingBudgetMove, setPendingBudgetMove] = useState<{
    lead: Lead;
    destStageId: string;
    destStageName: string;
    newPosition: number;
  } | null>(null);

  const [budgetValue, setBudgetValue] = useState("");
  const [budgetProcedimento, setBudgetProcedimento] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  const data = useExternal
    ? {
        pipeline: pipelineProp ?? ({} as Pipeline),
        stages: stagesProp ?? [],
        leads: leadsProp ?? [],
      }
    : queryResult.data;
  const isLoading = useExternal ? false : queryResult.isLoading;
  const isError = useExternal ? false : queryResult.isError;
  const error = useExternal ? null : queryResult.error;

  const leadDoDossie = dossieId
    ? (data?.leads.find((l) => l.id === dossieId) ?? null)
    : null;

  const grouped = useMemo(() => {
    if (!data) return null;
    return groupLeadsByStage(data.stages, data.leads);
  }, [data]);

  const handleSelect = useCallback(
    (leadId: string, additive: boolean) => {
      const apply = (prev: Set<string>): Set<string> => {
        const next = new Set(additive ? prev : []);
        if (additive && prev.has(leadId)) {
          next.delete(leadId);
        } else {
          next.add(leadId);
        }
        return next;
      };
      if (onSelectionChange) {
        const nextSet = apply(selectedLeadIds);
        onSelectionChange(Array.from(nextSet));
      } else {
        setInternalSelected((prev) => apply(prev));
      }
    },
    [onSelectionChange, selectedLeadIds],
  );

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!data || !grouped) return;
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      ) {
        return;
      }

      const lead = data.leads.find((l) => l.id === draggableId);
      if (!lead) return;

      const destStageId = destination.droppableId;
      const destStage = data.stages.find((s) => s.id === destStageId);
      const destStageName = destStage?.name ?? "";

      if (/n[aã]o\s*compareceu|faltou|no[-\s]?show/i.test(destStageName)) {
        toast.error("Para registrar falta, use o botão 'Faltou' no card ou no lead para contabilizar o histórico.");
        return;
      }

      const destList = (grouped.get(destStageId) ?? []).filter(
        (l) => l.id !== draggableId,
      );

      const before = destination.index > 0 ? destList[destination.index - 1] : null;
      const after =
        destination.index < destList.length ? destList[destination.index] : null;

      const newPosition = midpoint(
        before?.position_in_stage ?? null,
        after?.position_in_stage ?? null,
      );

      if (Number.isNaN(newPosition)) return;

      if (/agendad[oa]|agendamento|consulta\s*marcada/i.test(destStageName)) {
        const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
        setScheduleData(String(custom.agendamento_data ?? ""));
        setScheduleHora(String(custom.agendamento_hora ?? "09:00"));
        setScheduleProcedimento(String(custom.procedimento ?? ""));
        setPendingScheduleMove({
          lead,
          destStageId,
          destStageName,
          newPosition,
        });
        return;
      }

      if (/or[çc]amento|proposta|em\s*negocia[cç][aã]o/i.test(destStageName)) {
        const hasValue = Boolean(lead.value_cents && lead.value_cents > 0);
        if (!hasValue) {
          const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
          setBudgetValue("");
          setBudgetProcedimento(String(custom.procedimento ?? ""));
          setPendingBudgetMove({
            lead,
            destStageId,
            destStageName,
            newPosition,
          });
          return;
        }
      }

      moveCard.mutate({
        leadId: lead.id,
        stageId: destStageId,
        positionInStage: newPosition,
        expectedUpdatedAt: lead.updated_at,
      });
    },
    [data, grouped, moveCard],
  );

  async function handleConfirmScheduleMove() {
    if (!pendingScheduleMove) return;
    if (!scheduleData.trim() || !scheduleHora.trim()) {
      toast.error("É obrigatório informar a data e o horário da consulta.");
      return;
    }

    setIsSavingSchedule(true);
    try {
      const { lead, destStageId, destStageName, newPosition } = pendingScheduleMove;
      const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;

      await editLead.mutateAsync({
        leadId: lead.id,
        patch: {
          custom_fields: {
            ...custom,
            agendamento_data: scheduleData.trim(),
            agendamento_hora: scheduleHora.trim(),
            agendamento_status: "agendado",
            procedimento: scheduleProcedimento.trim() || custom.procedimento || null,
          },
        } as UpdateLeadInput,
      });

      await moveCard.mutateAsync({
        leadId: lead.id,
        stageId: destStageId,
        positionInStage: newPosition,
        expectedUpdatedAt: lead.updated_at,
      });

      toast.success(`Consulta agendada para ${scheduleData.split("-").reverse().join("/")} às ${scheduleHora} e lead movido para "${destStageName}"!`);
      setPendingScheduleMove(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao agendar consulta");
    } finally {
      setIsSavingSchedule(false);
    }
  }

  function handleCancelScheduleMove() {
    setPendingScheduleMove(null);
    toast.info("Movimentação cancelada. O lead permaneceu na etapa anterior.");
  }

  async function handleConfirmBudgetMove() {
    if (!pendingBudgetMove) return;
    const cents = parseReaisToCents(budgetValue);
    if (cents === null || cents <= 0) {
      toast.error("É obrigatório informar o valor do orçamento (maior que R$ 0,00).");
      return;
    }

    setIsSavingBudget(true);
    try {
      const { lead, destStageId, destStageName, newPosition } = pendingBudgetMove;
      const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;

      await editLead.mutateAsync({
        leadId: lead.id,
        patch: {
          value_cents: cents,
          custom_fields: {
            ...custom,
            procedimento: budgetProcedimento.trim() || custom.procedimento || null,
            agendamento_status: "compareceu",
          },
        } as UpdateLeadInput,
      });

      await moveCard.mutateAsync({
        leadId: lead.id,
        stageId: destStageId,
        positionInStage: newPosition,
        expectedUpdatedAt: lead.updated_at,
      });

      toast.success(`Orçamento registrado! Lead movido para "${destStageName}" e presença confirmada.`);
      setPendingBudgetMove(null);
    } catch {
      toast.error("Erro ao salvar orçamento do lead");
    } finally {
      setIsSavingBudget(false);
    }
  }

  function handleCancelBudgetMove() {
    setPendingBudgetMove(null);
    setBudgetValue("");
    setBudgetProcedimento("");
    toast.info("Movimentação cancelada. O lead permaneceu na etapa anterior.");
  }

  if (isLoading) return <BoardSkeleton />;

  if (isError) {
    return (
      <Card className="m-4 p-6 text-sm text-text-muted">
        Falha ao carregar o board.
        {error instanceof Error ? ` ${error.message}` : null}
      </Card>
    );
  }

  if (!data || !grouped) return null;

  if (data.stages.length === 0) {
    return (
      <Card className="m-4 p-6 text-sm text-text-muted">
        Nenhum lead nesta pipeline ainda.
      </Card>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {data.stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            leads={grouped.get(stage.id) ?? []}
            pipelineId={pipelineId}
            ownerNames={ownerNames}
            coolingIds={coolingIds}
            reactivations={reactivations}
            pulses={pulsesProp ?? queryResult.pulses}
            canonicalTags={canonicalTags}
            selectedLeadIds={selectedLeadIds}
            onSelect={handleSelect}
            onOpen={setDossieId}
          />
        ))}
      </div>

      {leadDoDossie && (
        <LeadDossier
          open
          onOpenChange={(v) => !v && setDossieId(null)}
          lead={leadDoDossie}
          pipelineId={pipelineId}
          stageName={
            data.stages.find((s) => s.id === leadDoDossie.stage_id)?.name ?? "—"
          }
          ownerNames={ownerNames}
        />
      )}

      {/* Modal de Agendamento Obrigatório ao Mover para Agendado */}
      <Dialog
        open={Boolean(pendingScheduleMove)}
        onOpenChange={(open) => {
          if (!open) handleCancelScheduleMove();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <CalendarBlank size={18} className="text-primary" /> Agendamento de Consulta
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Para mover <strong>{pendingScheduleMove?.lead.title}</strong> para a etapa <strong>{pendingScheduleMove?.destStageName}</strong>, informe a data e horário da avaliação. Se cancelar, o lead voltará para a etapa anterior.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sched-data" className="text-xs font-semibold flex items-center gap-1">
                  <CalendarBlank size={13} className="text-primary" /> Data da Consulta *
                </Label>
                <Input
                  id="sched-data"
                  type="date"
                  value={scheduleData}
                  onChange={(e) => setScheduleData(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sched-hora" className="text-xs font-semibold flex items-center gap-1">
                  <Clock size={13} className="text-primary" /> Horário *
                </Label>
                <Input
                  id="sched-hora"
                  type="time"
                  value={scheduleHora}
                  onChange={(e) => setScheduleHora(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-proc" className="text-xs font-medium">
                Procedimento (Opcional)
              </Label>
              <Input
                id="sched-proc"
                placeholder="Ex: Avaliação Geral, Implante, Limpeza..."
                value={scheduleProcedimento}
                onChange={(e) => setScheduleProcedimento(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelScheduleMove}
              disabled={isSavingSchedule}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmScheduleMove}
              disabled={!scheduleData.trim() || !scheduleHora.trim() || isSavingSchedule}
              className="h-8 text-xs font-bold gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <CheckCircle size={14} weight="bold" />
              {isSavingSchedule ? "Agendando..." : "Confirmar Agendamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Orçamento Obrigatório ao Mover para Orçamento */}
      <Dialog
        open={Boolean(pendingBudgetMove)}
        onOpenChange={(open) => {
          if (!open) handleCancelBudgetMove();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <CurrencyDollar size={18} className="text-emerald-500" /> Registro Obrigatório de Orçamento
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Para mover <strong>{pendingBudgetMove?.lead.title}</strong> para a etapa <strong>{pendingBudgetMove?.destStageName}</strong>, é obrigatório preencher o valor do orçamento. O status do paciente será automaticamente marcado como <strong>Compareceu</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="budget-val" className="text-xs font-semibold flex items-center gap-1">
                <CurrencyDollar size={13} className="text-emerald-500" /> Valor Total do Orçamento (R$) *
              </Label>
              <Input
                id="budget-val"
                placeholder="Ex: 1.500,00"
                value={budgetValue}
                onChange={(e) => setBudgetValue(e.target.value)}
                className="h-8 text-xs bg-background font-bold text-foreground"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="budget-proc" className="text-xs font-medium">
                Procedimento / Detalhes (Opcional)
              </Label>
              <Input
                id="budget-proc"
                placeholder="Ex: 2 Implantes + Clareamento"
                value={budgetProcedimento}
                onChange={(e) => setBudgetProcedimento(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelBudgetMove}
              disabled={isSavingBudget}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmBudgetMove}
              disabled={!budgetValue.trim() || isSavingBudget}
              className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle size={14} weight="bold" />
              {isSavingBudget ? "Salvando..." : "Confirmar Orçamento & Presença"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DragDropContext>
  );
}

"use client";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { readCardLayout } from "@/lib/kanban/card-layout";
import { parseReaisToCents } from "@/lib/money";
import type { Lead } from "@/lib/types/leads";
import type { UpdateLeadInput } from "@/lib/schemas/leads";
import type { Pipeline, Stage } from "@/lib/kanban/types";
import type { OrcamentoItem, OrcamentoLead } from "@/lib/types/orcamento";
import { useCadastros } from "@/hooks/settings/useCadastros";
import { PROCEDIMENTOS_SUGERIDOS } from "./LeadFieldsForm";
import {
  CalendarBlank,
  Clock,
  CheckCircle,
  CurrencyDollar,
  Plus,
  Trash,
  Receipt,
  Sparkle,
} from "@/lib/ui/icons";
import { StageColumn } from "./StageColumn";
import { LeadDossier } from "./LeadDossier";
import { LoseLeadDialog } from "./LoseLeadDialog";

interface KanbanBoardProps {
  pipelineId: string;
  stages?: Stage[];
  leads?: Lead[];
  pipeline?: Pipeline;
  selectedIds?: string[];
  pulses?: Map<string, number>;
  onSelectionChange?: (ids: string[]) => void;
  selectionMode?: boolean;
}

interface PendingBudgetItem {
  id: string;
  descricao: string;
  quantidade: number;
  valorUnitarioReais: string;
}

function formatBRL(cents: number | null): string {
  if (cents === null || cents === 0) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
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
          className="bg-surface-muted/50 flex h-full w-80 shrink-0 flex-col rounded-lg p-2"
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
  selectionMode = false,
}: KanbanBoardProps) {
  const useExternal = Boolean(stagesProp && leadsProp);
  const queryResult = useBoard(useExternal ? null : pipelineId);
  const moveCard = useMoveCard(pipelineId);
  const editLead = useEditLead(pipelineId);
  const { procedimentos: listaProcedimentos } = useCadastros();
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

  const cardLayout = useMemo(
    () => readCardLayout((pipelineProp ?? queryResult.data?.pipeline)?.settings),
    [pipelineProp, queryResult.data?.pipeline],
  );

  const [dossieId, setDossieId] = useState<string | null>(null);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selectedLeadIds = useMemo(
    () => (selectedIds ? new Set(selectedIds) : internalSelected),
    [selectedIds, internalSelected],
  );

  // Estado para Agendamento
  const [pendingScheduleMove, setPendingScheduleMove] = useState<{
    lead: Lead;
    destStageId: string;
    destStageName: string;
    newPosition: number;
  } | null>(null);

  const [pendingLostLead, setPendingLostLead] = useState<Lead | null>(null);
  const suppressDossierUntil = useRef(0);

  const [scheduleData, setScheduleData] = useState("");
  const [scheduleHora, setScheduleHora] = useState("09:00");
  const [scheduleProcedimento, setScheduleProcedimento] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Estado para Orçamento com múltiplos procedimentos
  const [pendingBudgetMove, setPendingBudgetMove] = useState<{
    lead: Lead;
    destStageId: string;
    destStageName: string;
    newPosition: number;
  } | null>(null);

  const [budgetItens, setBudgetItens] = useState<PendingBudgetItem[]>([
    {
      id: "item_1",
      descricao: "",
      quantidade: 1,
      valorUnitarioReais: "",
    },
  ]);
  const [budgetDescontoReais, setBudgetDescontoReais] = useState("");
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

  const leadDoDossie = dossieId ? (data?.leads.find((l) => l.id === dossieId) ?? null) : null;

  const grouped = useMemo(() => {
    if (!data) return null;
    return groupLeadsByStage(data.stages, data.leads);
  }, [data]);

  // Cálculos do Orçamento Dinâmico
  const { subtotalCents, descontoCents, totalOrcamentoCents } = useMemo(() => {
    let sub = 0;
    for (const it of budgetItens) {
      const unitCents = parseReaisToCents(it.valorUnitarioReais) || 0;
      const qtd = Math.max(1, it.quantidade || 1);
      sub += unitCents * qtd;
    }
    const desc = parseReaisToCents(budgetDescontoReais) || 0;
    const tot = Math.max(0, sub - desc);
    return {
      subtotalCents: sub,
      descontoCents: desc,
      totalOrcamentoCents: tot,
    };
  }, [budgetItens, budgetDescontoReais]);

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

  const handleAddBudgetItem = () => {
    setBudgetItens((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        descricao: "",
        quantidade: 1,
        valorUnitarioReais: "",
      },
    ]);
  };

  const handleRemoveBudgetItem = (id: string) => {
    if (budgetItens.length <= 1) {
      toast.error("O orçamento deve conter ao menos 1 procedimento.");
      return;
    }
    setBudgetItens((prev) => prev.filter((it) => it.id !== id));
  };

  const handleUpdateBudgetItem = (
    id: string,
    field: "descricao" | "quantidade" | "valorUnitarioReais",
    value: string | number,
  ) => {
    setBudgetItens((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "descricao") {
          return { ...item, descricao: String(value) };
        }
        if (field === "quantidade") {
          return { ...item, quantidade: Math.max(1, Number(value) || 1) };
        }
        if (field === "valorUnitarioReais") {
          return { ...item, valorUnitarioReais: String(value) };
        }
        return item;
      }),
    );
  };

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!data || !grouped) return;
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId && source.index === destination.index) {
        return;
      }

      const lead = data.leads.find((l) => l.id === draggableId);
      if (!lead) return;

      const destStageId = destination.droppableId;
      const destStage = data.stages.find((s) => s.id === destStageId);
      const destStageName = destStage?.name ?? "";

      if (destStage?.is_lost || /perdid[oa]|cancelad[oa]/i.test(destStageName)) {
        suppressDossierUntil.current = Date.now() + 800;
        setPendingLostLead(lead);
        return;
      }

      if (/n[aã]o\s*compareceu|faltou|no[-\s]?show/i.test(destStageName)) {
        toast.error(
          "Para registrar falta, use o botão 'Faltou' no card ou no lead para contabilizar o histórico.",
        );
        return;
      }

      const destList = (grouped.get(destStageId) ?? []).filter((l) => l.id !== draggableId);

      const before = destination.index > 0 ? destList[destination.index - 1] : null;
      const after = destination.index < destList.length ? destList[destination.index] : null;

      const newPosition = midpoint(
        before?.position_in_stage ?? null,
        after?.position_in_stage ?? null,
      );

      if (Number.isNaN(newPosition)) return;

      // 1. Mover para Agendado
      if (/^agendado$/i.test(destStageName.trim())) {
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

      // 2. Mover para Orçamento (Abre construtor de procedimentos e soma automática)
      if (/or[çc]amento|proposta|em\s*negocia[cç][aã]o/i.test(destStageName)) {
        const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
        const existingOrcamento = custom.orcamento as OrcamentoLead | undefined;

        const totalExistente = existingOrcamento?.total_cents ?? lead.value_cents ?? 0;
        setBudgetItens([{ id: "orcamento_total", descricao: "Orçamento", quantidade: 1, valorUnitarioReais: totalExistente > 0 ? (totalExistente / 100).toFixed(2).replace(".", ",") : "" }]);
        setBudgetDescontoReais("");

        setPendingBudgetMove({
          lead,
          destStageId,
          destStageName,
          newPosition,
        });
        return;
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

      toast.success(
        `Consulta agendada para ${scheduleData.split("-").reverse().join("/")} às ${scheduleHora} e lead movido para "${destStageName}"!`,
      );
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

    // Validação dos itens
    const itensValidos = budgetItens.filter((it) => it.descricao.trim().length > 0);
    if (itensValidos.length === 0) {
      toast.error("Adicione ao menos um procedimento odontológico com descrição e valor.");
      return;
    }

    if (totalOrcamentoCents <= 0) {
      toast.error("O valor total do orçamento deve ser maior que R$ 0,00.");
      return;
    }

    setIsSavingBudget(true);
    try {
      const { lead, destStageId, destStageName, newPosition } = pendingBudgetMove;
      const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;

      const finalItens: OrcamentoItem[] = itensValidos.map((it, idx) => {
        const unitCents = parseReaisToCents(it.valorUnitarioReais) || 0;
        const qtd = Math.max(1, it.quantidade || 1);
        return {
          id: it.id || `item_${idx + 1}`,
          descricao: it.descricao.trim(),
          quantidade: qtd,
          valor_unitario_cents: unitCents,
          valor_total_cents: qtd * unitCents,
        };
      });

      const summaryProcedimentos = finalItens
        .map((i) => (i.quantidade > 1 ? `${i.quantidade}x ${i.descricao}` : i.descricao))
        .join(" + ");

      const orcamentoObj: OrcamentoLead = {
        status: "rascunho",
        itens: finalItens,
        desconto_cents: descontoCents > 0 ? descontoCents : undefined,
        total_cents: totalOrcamentoCents,
        total_pago_cents: 0,
        saldo_restante_cents: totalOrcamentoCents,
        pagamentos: [],
      };

      await editLead.mutateAsync({
        leadId: lead.id,
        patch: {
          value_cents: totalOrcamentoCents,
          custom_fields: {
            ...custom,
            procedimento: summaryProcedimentos || custom.procedimento || null,
            agendamento_status: "compareceu",
            orcamento: orcamentoObj,
          },
        } as UpdateLeadInput,
      });

      await moveCard.mutateAsync({
        leadId: lead.id,
        stageId: destStageId,
        positionInStage: newPosition,
        expectedUpdatedAt: lead.updated_at,
      });

      toast.success(
        `Orçamento de ${formatBRL(totalOrcamentoCents)} registrado! Presença confirmada.`,
      );
      setPendingBudgetMove(null);
    } catch {
      toast.error("Erro ao salvar orçamento do lead");
    } finally {
      setIsSavingBudget(false);
    }
  }

  function handleCancelBudgetMove() {
    setPendingBudgetMove(null);
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
      <Card className="m-4 p-6 text-sm text-text-muted">Nenhum lead nesta pipeline ainda.</Card>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {data.stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            stages={data.stages}
            leads={grouped.get(stage.id) ?? []}
            pipelineId={pipelineId}
            ownerNames={ownerNames}
            coolingIds={coolingIds}
            reactivations={reactivations}
            pulses={pulsesProp ?? queryResult.pulses}
            canonicalTags={canonicalTags}
            cardLayout={cardLayout}
            selectedLeadIds={selectedLeadIds}
            onSelect={handleSelect}
            selectionMode={selectionMode}
            onOpen={(leadId) => {
              if (Date.now() < suppressDossierUntil.current) return;
              setDossieId(leadId);
            }}
          />
        ))}
      </div>

      {leadDoDossie && (
        <LeadDossier
          open
          onOpenChange={(v) => !v && setDossieId(null)}
          lead={leadDoDossie}
          pipelineId={pipelineId}
          stageName={data.stages.find((s) => s.id === leadDoDossie.stage_id)?.name ?? "—"}
          ownerNames={ownerNames}
        />
      )}

      <LoseLeadDialog
        open={Boolean(pendingLostLead)}
        onOpenChange={(open) => { if (!open) setPendingLostLead(null); }}
        leadId={pendingLostLead?.id ?? ""}
        pipelineId={pipelineId}
      />

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
              Para mover <strong>{pendingScheduleMove?.lead.title}</strong> para a etapa{" "}
              <strong>{pendingScheduleMove?.destStageName}</strong>, informe a data e horário da
              avaliação. Se cancelar, o lead voltará para a etapa anterior.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="sched-data"
                  className="flex items-center gap-1 text-xs font-semibold"
                >
                  <CalendarBlank size={13} className="text-primary" /> Data da Consulta *
                </Label>
                <Input
                  id="sched-data"
                  type="date"
                  value={scheduleData}
                  onChange={(e) => setScheduleData(e.target.value)}
                  className="h-8 bg-background text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="sched-hora"
                  className="flex items-center gap-1 text-xs font-semibold"
                >
                  <Clock size={13} className="text-primary" /> Horário *
                </Label>
                <Input
                  id="sched-hora"
                  type="time"
                  value={scheduleHora}
                  onChange={(e) => setScheduleHora(e.target.value)}
                  className="h-8 bg-background text-xs"
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
                className="h-8 bg-background text-xs"
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
              className="hover:bg-primary/90 h-8 gap-1 bg-primary text-xs font-bold text-primary-foreground"
            >
              <CheckCircle size={14} weight="bold" />
              {isSavingSchedule ? "Agendando..." : "Confirmar Agendamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Orçamento com Múltiplos Procedimentos e Soma Automática */}
      <Dialog
        open={Boolean(pendingBudgetMove)}
        onOpenChange={(open) => {
          if (!open) handleCancelBudgetMove();
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col p-6 sm:max-w-2xl">
          <DialogHeader className="border-border/60 border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Receipt size={20} className="text-emerald-500" /> Registro de Procedimentos &
              Orçamento
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Adicione os procedimentos avaliados para{" "}
              <strong>{pendingBudgetMove?.lead.title}</strong>. O sistema calcula a soma automática
              do orçamento e confirma a presença do paciente.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-2 py-4">
            <Label htmlFor="budget-total">Valor total do orçamento (R$)</Label>
            <Input id="budget-total" inputMode="decimal" value={budgetItens[0]?.valorUnitarioReais ?? ""} onChange={(event) => handleUpdateBudgetItem("orcamento_total", "valorUnitarioReais", event.target.value)} placeholder="0,00" className="max-w-xs" />
            <p className="text-xs text-muted-foreground">Informe somente o valor total do orçamento.</p>
          </div>

          {/* Rodapé com Soma Total e Ações */}
          <DialogFooter className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-t pt-3 sm:justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Valor Total do Orçamento ({budgetItens.length}{" "}
                {budgetItens.length === 1 ? "item" : "itens"}):
              </span>
              <span className="text-xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatBRL(totalOrcamentoCents)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelBudgetMove}
                disabled={isSavingBudget}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmBudgetMove}
                disabled={totalOrcamentoCents <= 0 || isSavingBudget}
                className="h-9 gap-1.5 bg-emerald-600 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
              >
                <CheckCircle size={16} weight="bold" />
                {isSavingBudget ? "Salvando..." : "Confirmar Orçamento & Presença"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DragDropContext>
  );
}

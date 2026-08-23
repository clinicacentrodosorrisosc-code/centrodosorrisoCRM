"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useBoard } from "@/hooks/kanban/useBoard";
import type { Lead } from "@/lib/types/leads";
import type { OrcamentoLead } from "@/lib/types/orcamento";
import { updateLeadSchema, type UpdateLeadInput } from "@/lib/schemas/leads";
import { parseReaisToCents } from "@/lib/money";
import { OrcamentoCard } from "./OrcamentoCard";
import { OrcamentoDialog } from "./OrcamentoDialog";
import { LeadTasksSection } from "./LeadTasksSection";
import { DeleteLeadDialog } from "./DeleteLeadDialog";
import {
  CalendarBlank,
  Clock,
  CheckCircle,
  XCircle,
  Lock,
  ArrowsClockwise,
  Trash,
  CaretDown,
  CaretRight,
  Receipt,
  CheckSquare,
} from "@/lib/ui/icons";

export const FONTES_SUGERIDAS = [
  "WhatsApp",
  "Instagram",
  "Facebook Ads",
  "Google Ads",
  "Indicação de Paciente",
  "Tráfego Pago",
  "Site / Landing Page",
  "Passante / Balcão",
  "Outro",
];

export const PROCEDIMENTOS_SUGERIDOS = [
  "Clareamento Dental (Laser / Caseiro)",
  "Alinhadores Invisíveis / Ortodontia",
  "Implantes Dentários & Prótese",
  "Facetas / Lentes de Contato Dental",
  "Limpeza / Profilaxia & Avaliação",
  "Tratamento de Canal (Endodontia)",
  "Restauração Estética",
  "Harmonização Facial / Botox",
  "Cirurgia / Extração de Siso",
  "Odontopediatria",
  "Outro Procedimento",
];

interface FormShape {
  title: string;
  description: string;
  source: string;
  procedimento: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
  agendamento_data: string;
  agendamento_hora: string;
  agendamento_status: "agendado" | "confirmado" | "compareceu" | "faltou" | "remarcado" | "cancelado";
}

interface Props {
  lead: Lead;
  pipelineId: string;
  /** Quando o salvamento dá certo. O dossiê NÃO fecha aqui — ver abaixo. */
  onSaved?: () => void;
  /** O dossiê não tem "cancelar"; o diálogo tem. */
  onCancel?: () => void;
}

function centsToReais(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDataBr(ymd: string): string {
  if (!ymd) return "";
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

export function LeadFieldsForm({ lead, pipelineId, onSaved, onCancel }: Props) {
  const edit = useEditLead(pipelineId);
  const move = useMoveCard(pipelineId);
  const { data: boardData } = useBoard(pipelineId);

  const [orcamentoOpen, setOrcamentoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Estados dos módulos desplegáveis (acordeões)
  const [orcamentoCollapsed, setOrcamentoCollapsed] = useState(true);
  const [agendamentoCollapsed, setAgendamentoCollapsed] = useState(false);
  const [tarefasCollapsed, setTarefasCollapsed] = useState(true);

  const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const orcamento = customFields.orcamento as OrcamentoLead | undefined;
  const hasDetailedOrcamento = Boolean(
    orcamento && (orcamento.itens?.length ?? 0) > 0 && (orcamento.total_cents ?? 0) > 0,
  );
  const orcamentoTotalReais = hasDetailedOrcamento ? centsToReais(orcamento!.total_cents) : "";

  const initialProcedimento = String(customFields.procedimento ?? customFields.procedure ?? "");
  const initialAgendamentoData = String(customFields.agendamento_data ?? "");
  const initialAgendamentoHora = String(customFields.agendamento_hora ?? "");
  const initialAgendamentoStatus = (customFields.agendamento_status as FormShape["agendamento_status"]) ?? "agendado";

  const qc = useQueryClient();

  const form = useForm<FormShape>({
    defaultValues: {
      title: lead.title,
      description: lead.description ?? "",
      source: lead.source ?? "WhatsApp",
      procedimento: initialProcedimento,
      valueReais: hasDetailedOrcamento ? orcamentoTotalReais : centsToReais(lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
      agendamento_data: initialAgendamentoData,
      agendamento_hora: initialAgendamentoHora,
      agendamento_status: initialAgendamentoStatus,
    },
  });

  useEffect(() => {
    const curCustom = (lead.custom_fields ?? {}) as Record<string, unknown>;
    const curOrcamento = curCustom.orcamento as OrcamentoLead | undefined;
    const isDetailed = Boolean(
      curOrcamento && (curOrcamento.itens?.length ?? 0) > 0 && (curOrcamento.total_cents ?? 0) > 0,
    );

    form.reset({
      title: lead.title,
      description: lead.description ?? "",
      source: lead.source ?? "WhatsApp",
      procedimento: String(curCustom.procedimento ?? curCustom.procedure ?? ""),
      valueReais: isDetailed ? centsToReais(curOrcamento!.total_cents) : centsToReais(lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
      agendamento_data: String(curCustom.agendamento_data ?? ""),
      agendamento_hora: String(curCustom.agendamento_hora ?? ""),
      agendamento_status: (curCustom.agendamento_status as FormShape["agendamento_status"]) ?? "agendado",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.value_cents, lead.custom_fields]);

  const [isRescheduling, setIsRescheduling] = useState(false);

  const watchedData = form.watch("agendamento_data");
  const watchedHora = form.watch("agendamento_hora");
  const watchedStatus = form.watch("agendamento_status");

  async function handleMarcarPresenca(status: FormShape["agendamento_status"]) {
    form.setValue("agendamento_status", status);

    if (status === "remarcado") {
      setIsRescheduling(true);
      form.setValue("agendamento_status", "agendado");
      toast.info("Remarcação ativada! Selecione a nova data e horário abaixo.");
      return;
    }

    try {
      // Chama o endpoint atômico de presença que atualiza o lead, move a etapa e grava timeline sem conflito de OCC
      const res = await apiClient.post<{
        data: {
          lead: Lead;
          status: string;
          moved_to_stage: { id: string; name: string } | null;
        };
      }>(`/api/v1/leads/${lead.id}/attendance`, { status });

      const moved = res.data.moved_to_stage;
      if (status === "compareceu") {
        toast.success(
          moved
            ? `Presença confirmada! Lead movido automaticamente para "${moved.name}".`
            : "Presença confirmada! Paciente compareceu à avaliação.",
        );
      } else if (status === "faltou") {
        toast.error(
          moved
            ? `Falta registrada! Lead movido automaticamente para "${moved.name}".`
            : "Lead marcado como Não Compareceu (Falta registrada).",
        );
      }

      qc.invalidateQueries({ queryKey: ["kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["pending-attendance-alerts"] });

      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status da consulta");
    }
  }

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let valueCents: number | null = null;
    if (hasDetailedOrcamento) {
      valueCents = orcamento!.total_cents;
    } else {
      const reais = values.valueReais.trim();
      if (reais.length > 0) {
        valueCents = parseReaisToCents(reais);
        if (valueCents === null) {
          form.setError("valueReais", { message: "Valor inválido" });
          return;
        }
      }
    }

    const isDateChanged =
      values.agendamento_data !== initialAgendamentoData ||
      values.agendamento_hora !== initialAgendamentoHora;

    // Se o usuário alterou a data/hora para um novo reagendamento, reseta o status de "faltou" para "agendado"
    let nextAgendamentoStatus = values.agendamento_status;
    if (isDateChanged && values.agendamento_data) {
      if (values.agendamento_status === "faltou" || values.agendamento_status === "remarcado" || values.agendamento_status === "compareceu") {
        nextAgendamentoStatus = "agendado";
        form.setValue("agendamento_status", "agendado");
      }
    }

    const patch: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      source: values.source.trim() || "WhatsApp",
      custom_fields: {
        ...(lead.custom_fields ?? {}),
        procedimento: values.procedimento.trim() || null,
        agendamento_data: values.agendamento_data || null,
        agendamento_hora: values.agendamento_hora || null,
        agendamento_status: nextAgendamentoStatus,
      },
      value_cents: valueCents,
      tags,
      expected_close_date: values.expected_close_date || null,
    };

    const parsed = updateLeadSchema.safeParse(patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Dados inválidos");
      return;
    }

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: parsed.data as UpdateLeadInput,
      });

      // Se o lead estava na etapa Não Compareceu e foi reagendado com nova data, move ele de volta para a etapa de Agendamento
      if (isDateChanged && values.agendamento_data && boardData?.stages) {
        const currentStage = boardData.stages.find((s) => s.id === lead.stage_id);
        const isCurrentlyNoShowStage =
          currentStage && /n[aã]o\s*compareceu|faltou|no[-\s]?show/i.test(currentStage.name);

        if (isCurrentlyNoShowStage) {
          const agendamentoStage =
            boardData.stages.find(
              (s) =>
                /agend|avalia[cç][aã]o\s*agendada|visita/i.test(s.name) &&
                !s.is_won &&
                !s.is_lost,
            ) ??
            boardData.stages.find(
              (s) => !s.is_won && !s.is_lost && !/n[aã]o\s*compareceu|faltou/i.test(s.name),
            );

          if (agendamentoStage && agendamentoStage.id !== lead.stage_id) {
            await move.mutateAsync({
              leadId: lead.id,
              stageId: agendamentoStage.id,
              positionInStage: 1000,
              expectedUpdatedAt: lead.updated_at,
            });
            toast.success(
              `Novo agendamento salvo! Lead movido de volta para "${agendamentoStage.name}".`,
            );
            onSaved?.();
            return;
          }
        }
      }

      toast.success("Dados do lead atualizados com sucesso");
      onSaved?.();
    } catch {
      // toast already shown
    }
  }

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 text-xs">
        {/* ========================================================= */}
        {/* SEÇÃO 1: ORÇAMENTOS (DESPLEGÁVEL)                         */}
        {/* ========================================================= */}
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden transition-all shadow-xs">
          <button
            type="button"
            onClick={() => setOrcamentoCollapsed(!orcamentoCollapsed)}
            className="w-full flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
            aria-expanded={!orcamentoCollapsed}
          >
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-primary" />
              <span className="font-semibold text-xs text-foreground">Orçamentos & Pagamentos</span>
              {hasDetailedOrcamento ? (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  R$ {orcamentoTotalReais}
                </span>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
                  {lead.value_cents ? `R$ ${(lead.value_cents / 100).toFixed(0)}` : "Sem itens"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-[10px]">{orcamentoCollapsed ? "Expandir" : "Recolher"}</span>
              {orcamentoCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
            </div>
          </button>

          {!orcamentoCollapsed && (
            <div className="p-3 border-t border-border/60">
              <OrcamentoCard lead={lead} onOpenOrcamento={() => setOrcamentoOpen(true)} />
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* SEÇÃO 2: AGENDAMENTO (DESPLEGÁVEL)                        */}
        {/* ========================================================= */}
        <div className={`rounded-xl border overflow-hidden transition-all shadow-xs ${
          watchedStatus === "faltou"
            ? "border-red-500/40 bg-red-500/5 dark:bg-red-950/20"
            : watchedStatus === "compareceu"
              ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20"
              : "border-sky-500/30 bg-sky-500/5"
        }`}>
          <button
            type="button"
            onClick={() => setAgendamentoCollapsed(!agendamentoCollapsed)}
            className="w-full flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
            aria-expanded={!agendamentoCollapsed}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarBlank size={16} className={
                watchedStatus === "faltou"
                  ? "text-red-600"
                  : watchedStatus === "compareceu"
                    ? "text-emerald-600"
                    : "text-sky-600"
              } weight="bold" />
              <span className="font-semibold text-xs text-foreground">
                Agendamento da Consulta / Avaliação
              </span>
              {watchedData ? (
                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  watchedStatus === "faltou"
                    ? "bg-red-500/20 text-red-700 dark:text-red-300"
                    : watchedStatus === "compareceu"
                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                      : "bg-sky-500/20 text-sky-700 dark:text-sky-300"
                }`}>
                  {watchedStatus === "faltou" ? <XCircle size={11} weight="fill" /> : <CheckCircle size={11} weight="fill" />}
                  {watchedStatus === "faltou" ? "FALTOU" : watchedStatus === "compareceu" ? "COMPARECEU" : "AGENDADO"}: {formatDataBr(watchedData)}
                  {watchedHora ? ` às ${watchedHora}` : ""}
                </span>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
                  Não definido
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-[10px]">{agendamentoCollapsed ? "Expandir" : "Recolher"}</span>
              {agendamentoCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
            </div>
          </button>

          {!agendamentoCollapsed && (
            <div className="p-3.5 space-y-3 border-t border-border/60">
              {/* Aviso quando o agendamento está travado */}
              {Boolean(lead.custom_fields && (lead.custom_fields as Record<string, unknown>).agendamento_data) && !isRescheduling ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-xs">
                  <div className="flex items-center gap-1.5 text-sky-900 dark:text-sky-200">
                    <CalendarBlank size={14} className="text-sky-500 shrink-0" />
                    <span>
                      Consulta marcada para <strong>{formatDataBr(watchedData)}</strong> {watchedHora ? `às ${watchedHora}` : ""}.
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleMarcarPresenca("remarcado")}
                    className="h-7 px-2.5 text-xs font-bold gap-1 bg-background border-sky-500/40 text-sky-700 dark:text-sky-300 hover:bg-sky-500/15"
                  >
                    <ArrowsClockwise size={13} /> Remarcar
                  </Button>
                </div>
              ) : isRescheduling ? (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1">
                    <ArrowsClockwise size={13} className="text-amber-600" /> Modo Remarcação: Escolha a nova data e horário abaixo.
                  </span>
                  <span className="text-[10px] text-muted-foreground">(A remarcação será contabilizada)</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="agendamento_data" className="text-xs font-medium text-foreground flex items-center gap-1">
                    <CalendarBlank size={12} /> Data do Agendamento
                  </Label>
                  <Input
                    id="agendamento_data"
                    type="date"
                    disabled={Boolean(lead.custom_fields && (lead.custom_fields as Record<string, unknown>).agendamento_data) && !isRescheduling}
                    className="h-8 text-xs bg-background disabled:opacity-75 disabled:cursor-not-allowed"
                    {...form.register("agendamento_data")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="agendamento_hora" className="text-xs font-medium text-foreground flex items-center gap-1">
                    <Clock size={12} /> Horário do Agendamento
                  </Label>
                  <Input
                    id="agendamento_hora"
                    type="time"
                    disabled={Boolean(lead.custom_fields && (lead.custom_fields as Record<string, unknown>).agendamento_data) && !isRescheduling}
                    className="h-8 text-xs bg-background disabled:opacity-75 disabled:cursor-not-allowed"
                    {...form.register("agendamento_hora")}
                  />
                </div>
              </div>

              {/* Botões Rápidos de Presença */}
              <div className="pt-2 border-t border-border/60 flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                  Registro Rápido de Presença da Consulta:
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant={watchedStatus === "compareceu" ? "default" : "outline"}
                    onClick={() => handleMarcarPresenca("compareceu")}
                    className={`h-8 px-3 text-xs font-bold gap-1.5 shadow-xs transition-all ${
                      watchedStatus === "compareceu"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/50"
                        : "border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                    }`}
                  >
                    <CheckCircle size={14} weight="bold" /> Compareceu
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant={watchedStatus === "faltou" ? "destructive" : "outline"}
                    onClick={() => handleMarcarPresenca("faltou")}
                    className={`h-8 px-3 text-xs font-bold gap-1.5 shadow-xs transition-all ${
                      watchedStatus === "faltou"
                        ? "bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-500/50"
                        : "border-red-500/50 text-red-700 dark:text-red-300 hover:bg-red-500/10"
                    }`}
                  >
                    <XCircle size={14} weight="bold" /> Faltou (Não Compareceu)
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleMarcarPresenca("remarcado")}
                    className="h-8 px-2.5 text-xs font-medium gap-1 text-sky-700 dark:text-sky-300 border-sky-500/40 hover:bg-sky-500/10"
                  >
                    <ArrowsClockwise size={13} /> Remarcar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* SEÇÃO 3: TAREFAS DO LEAD (DESPLEGÁVEL)                    */}
        {/* ========================================================= */}
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden transition-all shadow-xs">
          <button
            type="button"
            onClick={() => setTarefasCollapsed(!tarefasCollapsed)}
            className="w-full flex items-center justify-between p-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
            aria-expanded={!tarefasCollapsed}
          >
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-primary" />
              <span className="font-semibold text-xs text-foreground">Tarefas & Lembretes do Lead</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-[10px]">{tarefasCollapsed ? "Expandir" : "Recolher"}</span>
              {tarefasCollapsed ? <CaretRight size={14} /> : <CaretDown size={14} />}
            </div>
          </button>

          {!tarefasCollapsed && (
            <div className="p-3 border-t border-border/60">
              <LeadTasksSection leadId={lead.id} contactId={lead.contact_id} />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-xs font-medium">Título do Lead</Label>
          <Input
            id="title"
            className="h-8 text-xs"
            {...form.register("title", { required: true, minLength: 2 })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Campo Fonte */}
          <div className="space-y-1.5">
            <Label htmlFor="source" className="text-xs font-medium">
              Fonte (Origem)
            </Label>
            <Input
              id="source"
              list="fontes-list"
              className="h-8 text-xs"
              placeholder="Ex: WhatsApp, Instagram..."
              {...form.register("source")}
            />
            <datalist id="fontes-list">
              {FONTES_SUGERIDAS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>

          {/* Campo Procedimento */}
          <div className="space-y-1.5">
            <Label htmlFor="procedimento" className="text-xs font-medium">
              Procedimento
            </Label>
            <Input
              id="procedimento"
              list="procedimentos-list"
              className="h-8 text-xs"
              placeholder="Ex: Clareamento, Alinhador..."
              {...form.register("procedimento")}
            />
            <datalist id="procedimentos-list">
              {PROCEDIMENTOS_SUGERIDOS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Campo Valor Total / Estimado */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="valueReais" className="text-xs font-medium flex items-center gap-1">
                Valor Total / Estimado (R$)
                {hasDetailedOrcamento && <Lock size={11} className="text-amber-600 dark:text-amber-400" />}
              </Label>
              <button
                type="button"
                onClick={() => setOrcamentoOpen(true)}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                {hasDetailedOrcamento ? "Editar itens do orçamento" : "Detalhar orçamento"}
              </button>
            </div>
            <Input
              id="valueReais"
              inputMode="decimal"
              placeholder="0,00"
              disabled={hasDetailedOrcamento}
              className={`h-8 text-xs font-semibold tabular-nums ${
                hasDetailedOrcamento ? "bg-muted/60 text-muted-foreground cursor-not-allowed border-dashed" : ""
              }`}
              value={hasDetailedOrcamento ? orcamentoTotalReais : undefined}
              {...(!hasDetailedOrcamento ? form.register("valueReais") : {})}
            />
            {hasDetailedOrcamento ? (
              <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                🔒 Calculado automaticamente a partir do orçamento detalhado.
              </p>
            ) : form.formState.errors.valueReais ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.valueReais.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expected_close_date" className="text-xs font-medium">Fechamento previsto</Label>
            <Input
              id="expected_close_date"
              type="date"
              className="h-8 text-xs"
              {...form.register("expected_close_date")}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tagsRaw" className="text-xs font-medium">Tags (separadas por vírgula)</Label>
          <Input id="tagsRaw" className="h-8 text-xs" placeholder="clareamento, vip, urgente" {...form.register("tagsRaw")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs font-medium">Descrição / Observações</Label>
          <Textarea id="description" rows={2} className="text-xs" {...form.register("description")} />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDeleteOpen(true)}
            className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
          >
            <Trash size={14} /> Excluir lead
          </Button>

          <div className="flex items-center gap-2">
            {onCancel && (
              <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={edit.isPending} className="h-8 text-xs">
                Cancelar
              </Button>
            )}
            <Button type="submit" size="sm" disabled={edit.isPending} className="h-8 text-xs">
              {edit.isPending ? "Salvando…" : "Salvar Alterações"}
            </Button>
          </div>
        </div>
      </form>

      {/* Pop-up Dialog do Orçamento */}
      <OrcamentoDialog
        open={orcamentoOpen}
        onOpenChange={setOrcamentoOpen}
        lead={lead}
        pipelineId={pipelineId}
      />

      <DeleteLeadDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        leadId={lead.id}
        leadTitle={lead.title}
        pipelineId={pipelineId}
        onSuccess={onCancel}
      />
    </>
  );
}


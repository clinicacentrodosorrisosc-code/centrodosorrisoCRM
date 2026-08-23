"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/client";
import { useLeadTimeline } from "@/hooks/leads/useLeadTimeline";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useBoard } from "@/hooks/kanban/useBoard";
import type { Lead } from "@/lib/types/leads";
import type { UpdateLeadInput } from "@/lib/schemas/leads";
import { LeadFieldsForm } from "./LeadFieldsForm";
import { ScoreSlot } from "./ScoreSlot";
import { LeadTimeline } from "./LeadTimeline";
import { OwnerBadge } from "./OwnerBadge";
import { DeleteLeadDialog } from "./DeleteLeadDialog";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import { ChatThread } from "@/components/inbox/ChatThread";
import { Composer } from "@/components/inbox/Composer";
import {
  ChatCircle,
  ArrowSquareOut,
  ClockCounterClockwise,
  IdentificationCard,
  WhatsappLogo,
  CheckCircle,
  XCircle,
  CalendarBlank,
  Trash,
} from "@/lib/ui/icons";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
  stageName: string;
  ownerNames?: Map<string, string | null>;
}

function formatBRL(cents: number | null, currency: string | null): string {
  if (cents === null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency ?? "BRL",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `R$ ${(cents / 100).toFixed(0)}`;
  }
}

export function LeadDossier({
  open,
  onOpenChange,
  lead,
  pipelineId,
  stageName,
  ownerNames,
}: Props) {
  const campos = useRef<HTMLDivElement | null>(null);
  const timeline = useLeadTimeline(open ? lead.id : null, lead.contact_id);
  const owner = resolveLeadOwner(lead, ownerNames);
  const score = lead.score ?? null;
  const [activeTab, setActiveTab] = useState<"chat" | "dados" | "timeline">("chat");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const qc = useQueryClient();
  const edit = useEditLead(pipelineId);
  const move = useMoveCard(pipelineId);
  const { data: boardData } = useBoard(pipelineId);

  const conversationId = lead.conversa?.id ?? null;

  const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const agendamentoData = String(customFields.agendamento_data ?? "").trim();
  const agendamentoHora = String(customFields.agendamento_hora ?? "").trim();
  const agendamentoStatus = String(customFields.agendamento_status ?? "agendado");

  async function handleHeaderMarcarPresenca(status: "compareceu" | "faltou") {
    try {
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

      // Atualiza board e lead
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["board", pipelineId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["pending-attendance-alerts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status da consulta");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl md:max-w-4xl lg:max-w-5xl h-full max-h-screen overflow-hidden bg-background"
        data-realtime-status={timeline.realtimeStatus.toLowerCase()}
        data-refetch-divergencias={timeline.seguranca.divergencias}
      >
        {/* Header do Dossiê */}
        <SheetHeader className="shrink-0 border-b border-border bg-card px-4 py-3.5 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold leading-tight text-text">
                {lead.title}
              </SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span className="font-semibold text-primary tabular-nums">
                  {formatBRL(lead.value_cents, lead.currency)}
                </span>
                <span>•</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-text">
                  {stageName}
                </span>
                <span>•</span>
                <OwnerBadge
                  ownerKind={owner.kind}
                  ownerName={owner.name}
                  agentVersion={owner.agentVersion}
                />
                {lead.source && (
                  <>
                    <span>•</span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {lead.source}
                    </span>
                  </>
                )}
                {agendamentoData && (
                  <>
                    <span>•</span>
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      agendamentoStatus === "faltou"
                        ? "bg-red-500/20 text-red-700 dark:text-red-300"
                        : agendamentoStatus === "compareceu"
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                    }`}>
                      {agendamentoStatus === "faltou" ? "🔴 FALTOU" : agendamentoStatus === "compareceu" ? "🟢 COMPARECEU" : "📅 AGENDADO"}: {agendamentoData.split("-").reverse().join("/")}
                      {agendamentoHora ? ` às ${agendamentoHora}` : ""}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Ações no Topo */}
            <div className="flex items-center gap-2 flex-wrap">
              {score && (
                <ScoreSlot
                  probability={score.probability}
                  band={score.band}
                  reason={score.reason}
                  factors={score.factors.slice(0, 3)}
                />
              )}
              {conversationId && (
                <Link
                  href={`/app/inbox?id=${conversationId}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-muted hover:text-primary"
                  title="Abrir conversa completa no Inbox"
                >
                  <WhatsappLogo size={14} className="text-emerald-500" weight="fill" />
                  <span className="hidden sm:inline">Abrir no Inbox</span>
                  <ArrowSquareOut size={13} className="text-text-muted" />
                </Link>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="h-7 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive gap-1"
                title="Excluir este lead"
              >
                <Trash size={14} />
                <span className="hidden sm:inline">Excluir</span>
              </Button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BARRA DE AÇÃO RÁPIDA DE PRESENÇA (SEMPRE VISÍVEL NO TOPO)  */}
          {/* ========================================================= */}
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-2 text-xs border border-border/40 flex-wrap">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <CalendarBlank size={14} className="text-primary" />
              <span>Avaliação:</span>
              {agendamentoData ? (
                <span className="font-medium text-muted-foreground">
                  {agendamentoData.split("-").reverse().join("/")} {agendamentoHora ? `às ${agendamentoHora}` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground text-[11px]">(Data não definida)</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant={agendamentoStatus === "compareceu" ? "default" : "outline"}
                onClick={() => handleHeaderMarcarPresenca("compareceu")}
                className={`h-7 px-2.5 text-[11px] font-bold gap-1 shadow-xs ${
                  agendamentoStatus === "compareceu"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "border-emerald-500/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                }`}
              >
                <CheckCircle size={13} weight="bold" /> Compareceu
              </Button>

              <Button
                type="button"
                size="sm"
                variant={agendamentoStatus === "faltou" ? "destructive" : "outline"}
                onClick={() => handleHeaderMarcarPresenca("faltou")}
                className={`h-7 px-2.5 text-[11px] font-bold gap-1 shadow-xs ${
                  agendamentoStatus === "faltou"
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "border-red-500/50 text-red-700 dark:text-red-300 hover:bg-red-500/10"
                }`}
              >
                <XCircle size={13} weight="bold" /> Faltou (Não Compareceu)
              </Button>
            </div>
          </div>

          {/* Abas no mobile/telas compactas */}
          <div className="mt-2 flex md:hidden items-center gap-1 border-t border-border/50 pt-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                activeTab === "chat"
                  ? "bg-primary text-primary-foreground"
                  : "text-text-muted hover:bg-muted"
              }`}
            >
              <ChatCircle size={14} /> Conversa
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("dados")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                activeTab === "dados"
                  ? "bg-primary text-primary-foreground"
                  : "text-text-muted hover:bg-muted"
              }`}
            >
              <IdentificationCard size={14} /> Dados do Lead
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`flex items-center gap-1 rounded px-2.5 py-1 font-medium transition-colors ${
                activeTab === "timeline"
                  ? "bg-primary text-primary-foreground"
                  : "text-text-muted hover:bg-muted"
              }`}
            >
              <ClockCounterClockwise size={14} /> Linha do tempo
            </button>
          </div>
        </SheetHeader>

        {/* Corpo: Grade 2 Colunas no Desktop com scroll independente */}
        <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Coluna 1 (Conversa / Chat do WhatsApp) */}
          <div
            className={`flex flex-col border-r border-border md:col-span-6 lg:col-span-7 min-h-0 h-full overflow-hidden ${
              activeTab === "chat" ? "flex" : "hidden md:flex"
            }`}
          >
            {conversationId ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                  <ChatThread conversationId={conversationId} />
                </div>
                <div className="shrink-0 border-t border-border bg-card/60">
                  <Composer conversationId={conversationId} />
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-text-muted">
                <ChatCircle size={40} className="mb-2 opacity-40" />
                <p className="text-sm font-medium">Nenhuma conversa vinculada</p>
                <p className="text-xs">
                  Quando o contato responder no WhatsApp, as mensagens aparecerão aqui em tempo real.
                </p>
              </div>
            )}
          </div>

          {/* Coluna 2 (Dados do Lead e Linha do Tempo) */}
          <div
            ref={campos}
            className={`flex flex-col overflow-y-auto p-4 md:col-span-6 lg:col-span-5 min-h-0 h-full bg-card/30 ${
              activeTab === "dados" || activeTab === "timeline"
                ? "flex"
                : "hidden md:flex"
            }`}
          >
            {activeTab === "timeline" ? (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-text">Linha do Tempo</h3>
                <LeadTimeline
                  itens={timeline.itens}
                  chegouAoVivo={timeline.chegouAoVivo}
                  isLoading={timeline.isLoading}
                  isError={timeline.isError}
                />
              </div>
            ) : (
              <LeadFieldsForm
                lead={lead}
                pipelineId={pipelineId}
              />
            )}
          </div>
        </div>
      </SheetContent>

      <DeleteLeadDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        leadId={lead.id}
        leadTitle={lead.title}
        pipelineId={pipelineId}
        onSuccess={() => onOpenChange(false)}
      />
    </Sheet>
  );
}


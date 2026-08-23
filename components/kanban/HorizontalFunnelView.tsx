"use client";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Stage, Pipeline } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";
import { LeadDossier } from "./LeadDossier";
import {
  Users,
  Funnel,
  ArrowRight,
  CheckCircle,
  XCircle,
  CalendarBlank,
  Clock,
  CurrencyDollar,
  MagnifyingGlass,
  ArrowSquareOut,
  Sparkle,
  ChartLineUp,
} from "@/lib/ui/icons";

interface HorizontalFunnelViewProps {
  pipeline: Pipeline;
  stages: Stage[];
  leads: Lead[];
  pipelineId: string;
}

function formatBRL(cents: number | null): string {
  if (cents === null || cents === 0) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function HorizontalFunnelView({
  pipeline,
  stages,
  leads,
  pipelineId,
}: HorizontalFunnelViewProps) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    stages[0]?.id ?? null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [dossieId, setDossieId] = useState<string | null>(null);

  // Ordena etapas por posição
  const sortedStages = useMemo(() => {
    return [...stages].sort((a, b) => a.position - b.position);
  }, [stages]);

  // Agrupa leads por etapa
  const stageStats = useMemo(() => {
    const totalLeads = leads.length;
    const totalCents = leads.reduce((sum, l) => sum + (l.value_cents ?? 0), 0);

    const stats = sortedStages.map((stage, idx) => {
      const stageLeads = leads.filter((l) => l.stage_id === stage.id);
      const count = stageLeads.length;
      const stageCents = stageLeads.reduce((sum, l) => sum + (l.value_cents ?? 0), 0);
      const percentOfTotal = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;

      // Cálculo de conversão para a próxima etapa
      const nextStage = sortedStages[idx + 1];
      let conversionToNext: number | null = null;
      if (nextStage) {
        const nextCount = leads.filter((l) => l.stage_id === nextStage.id).length;
        // Taxa aproximada de avanço acumulado
        conversionToNext = count > 0 ? Math.min(100, Math.round((nextCount / count) * 100)) : 0;
      }

      return {
        stage,
        leads: stageLeads,
        count,
        stageCents,
        percentOfTotal,
        conversionToNext,
      };
    });

    const wonStageIds = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
    const lostStageIds = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));
    const wonCount = leads.filter((l) => wonStageIds.has(l.stage_id) || l.status === "won").length;
    const lostCount = leads.filter((l) => lostStageIds.has(l.stage_id) || l.status === "lost").length;
    const activeCount = totalLeads - wonCount - lostCount;
    const overallConversion = totalLeads > 0 ? Math.round((wonCount / totalLeads) * 100) : 0;

    return {
      totalLeads,
      totalCents,
      wonCount,
      lostCount,
      activeCount,
      overallConversion,
      stages: stats,
    };
  }, [sortedStages, leads, stages]);

  const activeStageData = stageStats.stages.find((s) => s.stage.id === selectedStageId) ?? stageStats.stages[0];

  const filteredStageLeads = useMemo(() => {
    if (!activeStageData) return [];
    if (!searchTerm.trim()) return activeStageData.leads;
    const term = searchTerm.toLowerCase().trim();
    return activeStageData.leads.filter((l) => {
      const custom = (l.custom_fields ?? {}) as Record<string, unknown>;
      return (
        l.title.toLowerCase().includes(term) ||
        String(custom.procedimento ?? "").toLowerCase().includes(term) ||
        String(l.source ?? "").toLowerCase().includes(term)
      );
    });
  }, [activeStageData, searchTerm]);

  const leadDoDossie = dossieId ? leads.find((l) => l.id === dossieId) ?? null : null;

  return (
    <div className="flex flex-col gap-5 w-full pb-10">
      {/* 1. CARDS DE KPI TOPO DO FUNIL */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 flex flex-col gap-1 border border-border/70 bg-card/60 backdrop-blur-xs shadow-xs rounded-xl">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Users size={14} className="text-primary" /> Total de Leads
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-foreground tracking-tight">
              {stageStats.totalLeads}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {formatBRL(stageStats.totalCents)}
            </span>
          </div>
        </Card>

        <Card className="p-3.5 flex flex-col gap-1 border border-border/70 bg-card/60 backdrop-blur-xs shadow-xs rounded-xl">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <ChartLineUp size={14} className="text-emerald-500" /> Taxa de Conversão Geral
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {stageStats.overallConversion}%
            </span>
            <span className="text-[11px] text-muted-foreground">
              {stageStats.wonCount} ganhos
            </span>
          </div>
        </Card>

        <Card className="p-3.5 flex flex-col gap-1 border border-border/70 bg-card/60 backdrop-blur-xs shadow-xs rounded-xl">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Sparkle size={14} className="text-sky-500" /> Leads em Negociação
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-sky-600 dark:text-sky-400 tracking-tight">
              {stageStats.activeCount}
            </span>
            <span className="text-[11px] text-muted-foreground">ativos nas etapas</span>
          </div>
        </Card>

        <Card className="p-3.5 flex flex-col gap-1 border border-border/70 bg-card/60 backdrop-blur-xs shadow-xs rounded-xl">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <XCircle size={14} className="text-red-500" /> Perdas / Não Compareceram
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-red-600 dark:text-red-400 tracking-tight">
              {stageStats.lostCount}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {stageStats.totalLeads > 0
                ? `${Math.round((stageStats.lostCount / stageStats.totalLeads) * 100)}% do total`
                : "0%"}
            </span>
          </div>
        </Card>
      </div>

      {/* 2. FUNIL HORIZONTAL DEITADO (HORIZONTAL PIPELINE FLOW) */}
      <Card className="p-4 border border-border/80 bg-card shadow-sm rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Funnel size={18} weight="fill" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Funil Horizontal de Vendas & Movimentação
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Acompanhe o volume e a progressão dos leads da esquerda para a direita
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
            Clique em qualquer etapa para filtrar os pacientes
          </span>
        </div>

        {/* Trilho do Funil Deitado */}
        <div className="flex items-stretch gap-2 overflow-x-auto pb-3 pt-1 scrollbar-thin">
          {stageStats.stages.map((st, idx) => {
            const isSelected = st.stage.id === selectedStageId;
            const isFirst = idx === 0;
            const isLast = idx === stageStats.stages.length - 1;
            const isWon = st.stage.is_won;
            const isLost = st.stage.is_lost;

            // Largura proporcional ou mínima
            const fillHeightPct = stageStats.totalLeads > 0
              ? Math.max(15, Math.round((st.count / Math.max(1, stageStats.totalLeads)) * 100))
              : 20;

            return (
              <div key={st.stage.id} className="flex items-center gap-1.5 shrink-0">
                {/* Bloco da Etapa no Funil */}
                <button
                  type="button"
                  onClick={() => setSelectedStageId(st.stage.id)}
                  className={`relative flex flex-col justify-between w-48 sm:w-52 p-3 rounded-xl border text-left transition-all group cursor-pointer ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-md scale-[1.02]"
                      : "border-border/80 hover:border-border hover:bg-muted/40 bg-card/90"
                  }`}
                >
                  {/* Topo do Bloco */}
                  <div className="flex items-start justify-between gap-1 mb-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Etapa {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-foreground truncate max-w-[130px]" title={st.stage.name}>
                        {st.stage.name}
                      </span>
                    </div>
                    <Badge
                      variant={isWon ? "default" : isLost ? "destructive" : "secondary"}
                      className={`text-[10px] px-1.5 py-0 font-bold ${
                        isWon ? "bg-emerald-600 text-white" : ""
                      }`}
                    >
                      {st.count}
                    </Badge>
                  </div>

                  {/* Barra Visual Cônica Horizontal */}
                  <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden my-2 border border-border/30">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isWon
                          ? "bg-emerald-500"
                          : isLost
                            ? "bg-red-500"
                            : isSelected
                              ? "bg-primary"
                              : "bg-sky-500"
                      }`}
                      style={{ width: `${Math.max(8, st.percentOfTotal)}%` }}
                    />
                  </div>

                  {/* Rodapé do Bloco: Valor & % */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                    <span className="font-semibold text-foreground">
                      {formatBRL(st.stageCents)}
                    </span>
                    <span className="font-mono">
                      {st.percentOfTotal}% do total
                    </span>
                  </div>
                </button>

                {/* Seta de Transição para a próxima etapa */}
                {!isLast && (
                  <div className="flex flex-col items-center justify-center px-1 text-muted-foreground/70">
                    <ArrowRight size={16} weight="bold" className="text-primary/70" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* 3. LISTAGEM DE LEADS DA ETAPA SELECIONADA */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Leads na etapa: <Badge variant="outline" className="text-xs font-bold text-primary">{activeStageData?.stage.name}</Badge>
            </h3>
            <span className="text-xs text-muted-foreground">
              ({filteredStageLeads.length} de {activeStageData?.count ?? 0})
            </span>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative max-w-xs w-full">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por paciente, procedimento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>
        </div>

        {filteredStageLeads.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground border-dashed">
            Nenhum lead encontrado nesta etapa com o filtro aplicado.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredStageLeads.map((lead) => {
              const custom = (lead.custom_fields ?? {}) as Record<string, unknown>;
              const agData = String(custom.agendamento_data ?? "").trim();
              const agHora = String(custom.agendamento_hora ?? "").trim();
              const agStatus = String(custom.agendamento_status ?? "agendado");
              const proc = String(custom.procedimento ?? custom.procedure ?? "").trim();

              return (
                <Card
                  key={lead.id}
                  onClick={() => setDossieId(lead.id)}
                  className="p-3 border border-border/80 bg-card hover:border-primary/60 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-2.5 rounded-xl group"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {lead.title}
                      </span>
                      <ArrowSquareOut size={13} className="text-muted-foreground group-hover:text-primary shrink-0 opacity-70 group-hover:opacity-100" />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="font-bold text-primary tabular-nums">
                        {formatBRL(lead.value_cents)}
                      </span>
                      {lead.source && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded font-medium">
                          {lead.source}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Agendamento ou Procedimento */}
                  {(agData || proc) && (
                    <div className="pt-2 border-t border-border/40 flex flex-col gap-1 text-[10px] text-muted-foreground">
                      {proc && (
                        <span className="truncate font-medium text-foreground">
                          • {proc}
                        </span>
                      )}
                      {agData && (
                        <span className={`inline-flex items-center gap-1 font-semibold rounded px-1.5 py-0.5 w-fit ${
                          agStatus === "faltou"
                            ? "bg-red-500/15 text-red-700 dark:text-red-300"
                            : agStatus === "compareceu"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                        }`}>
                          <CalendarBlank size={11} />
                          {agData.split("-").reverse().join("/")} {agHora ? `às ${agHora}` : ""}
                        </span>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dossiê do Lead ao Clicar */}
      {leadDoDossie && (
        <LeadDossier
          open
          onOpenChange={(v) => !v && setDossieId(null)}
          lead={leadDoDossie}
          pipelineId={pipelineId}
          stageName={
            stages.find((s) => s.id === leadDoDossie.stage_id)?.name ?? "—"
          }
        />
      )}
    </div>
  );
}

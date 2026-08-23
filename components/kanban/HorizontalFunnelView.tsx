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

// Paleta de gradientes modernos para cada estágio do funil
const STAGE_GRADIENTS = [
  { from: "#3b82f6", to: "#2563eb", bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa" }, // Azul
  { from: "#6366f1", to: "#4f46e5", bg: "rgba(99, 102, 241, 0.15)", text: "#818cf8" }, // Índigo
  { from: "#8b5cf6", to: "#7c3aed", bg: "rgba(139, 92, 246, 0.15)", text: "#a78bfa" }, // Roxo
  { from: "#ec4899", to: "#db2777", bg: "rgba(236, 72, 153, 0.15)", text: "#f472b6" }, // Rosa
  { from: "#f59e0b", to: "#d97706", bg: "rgba(245, 158, 11, 0.15)", text: "#fbbf24" }, // Âmbar
  { from: "#10b981", to: "#059669", bg: "rgba(16, 185, 129, 0.15)", text: "#34d399" }, // Verde
];

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

  const activeStageData =
    stageStats.stages.find((s) => s.stage.id === selectedStageId) ?? stageStats.stages[0];

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

  // Dimensões dinâmicas do funil cônico horizontal
  const numStages = stageStats.stages.length;
  const svgWidth = Math.max(900, numStages * 170);
  const svgHeight = 220;
  const segmentWidth = (svgWidth - (numStages - 1) * 10) / Math.max(1, numStages);
  const chevronOffset = 18;

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

      {/* 2. FUNIL HORIZONTAL CÔNICO DEITADO (REAL HORIZONTAL FUNNEL) */}
      <Card className="p-5 border border-border/80 bg-card shadow-sm rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Funnel size={20} weight="fill" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Funil de Vendas Cônico (Horizontal)
              </h2>
              <p className="text-xs text-muted-foreground">
                Estrutura cônica de conversão da esquerda para a direita. Clique em uma etapa para inspecionar os leads.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-muted/70 px-3 py-1.5 rounded-lg border border-border/50">
            💡 Filtro Interativo: Selecione qualquer etapa no funil
          </span>
        </div>

        {/* Visualizador de Funil Cônico em SVG Interativo */}
        <div className="w-full overflow-x-auto pb-2 scrollbar-thin">
          <div className="min-w-[900px] py-2">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-auto drop-shadow-md select-none"
              style={{ minHeight: "210px" }}
            >
              <defs>
                {stageStats.stages.map((st, i) => {
                  const color = STAGE_GRADIENTS[i % STAGE_GRADIENTS.length]!;
                  const isWon = st.stage.is_won;
                  const isLost = st.stage.is_lost;
                  const startColor = isWon ? "#10b981" : isLost ? "#ef4444" : color.from;
                  const endColor = isWon ? "#059669" : isLost ? "#dc2626" : color.to;

                  return (
                    <linearGradient
                      key={`grad-${st.stage.id}`}
                      id={`grad-${st.stage.id}`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor={startColor} stopOpacity="0.9" />
                      <stop offset="100%" stopColor={endColor} stopOpacity="0.75" />
                    </linearGradient>
                  );
                })}
              </defs>

              {/* Desenho de Cada Segmento Cônico do Funil */}
              {stageStats.stages.map((st, i) => {
                const isSelected = st.stage.id === selectedStageId;
                const isFirst = i === 0;
                const isLast = i === numStages - 1;

                // Geometria Cônica: altura inicial (190px) afinando progressivamente até (70px)
                const startHeight = 190 - (i / Math.max(1, numStages)) * 120;
                const endHeight = 190 - ((i + 1) / Math.max(1, numStages)) * 120;

                const centerY = svgHeight / 2;
                const yTopLeft = centerY - startHeight / 2;
                const yBottomLeft = centerY + startHeight / 2;
                const yTopRight = centerY - endHeight / 2;
                const yBottomRight = centerY + endHeight / 2;

                const xLeft = i * (segmentWidth + 10);
                const xRight = xLeft + segmentWidth;

                // Caminho com formato cônico e encaixe chevron
                let pathD = "";
                if (isFirst) {
                  // Primeiro segmento: lado esquerdo reto, lado direito com ponta chevron
                  pathD = `
                    M ${xLeft} ${yTopLeft}
                    L ${xRight - chevronOffset} ${yTopRight}
                    L ${xRight} ${centerY}
                    L ${xRight - chevronOffset} ${yBottomRight}
                    L ${xLeft} ${yBottomLeft}
                    Z
                  `;
                } else if (isLast) {
                  // Último segmento: lado esquerdo com reentrância chevron, lado direito arredondado/reto
                  pathD = `
                    M ${xLeft} ${yTopLeft}
                    L ${xRight} ${yTopRight}
                    L ${xRight} ${yBottomRight}
                    L ${xLeft} ${yBottomLeft}
                    L ${xLeft + chevronOffset} ${centerY}
                    Z
                  `;
                } else {
                  // Segmentos intermediários: encaixes em chevron em ambos os lados
                  pathD = `
                    M ${xLeft} ${yTopLeft}
                    L ${xRight - chevronOffset} ${yTopRight}
                    L ${xRight} ${centerY}
                    L ${xRight - chevronOffset} ${yBottomRight}
                    L ${xLeft} ${yBottomLeft}
                    L ${xLeft + chevronOffset} ${centerY}
                    Z
                  `;
                }

                const centerTextX = xLeft + segmentWidth / 2 + (isFirst ? -4 : isLast ? 4 : 0);

                return (
                  <g
                    key={st.stage.id}
                    onClick={() => setSelectedStageId(st.stage.id)}
                    className="cursor-pointer transition-all duration-300 group"
                    style={{ outline: "none" }}
                  >
                    {/* Polígono Cônico da Etapa */}
                    <path
                      d={pathD}
                      fill={`url(#grad-${st.stage.id})`}
                      stroke={isSelected ? "#ffffff" : "rgba(255,255,255,0.25)"}
                      strokeWidth={isSelected ? 3.5 : 1.5}
                      className="transition-all duration-300 group-hover:brightness-110"
                      filter={isSelected ? "drop-shadow(0 4px 12px rgba(0,0,0,0.3))" : undefined}
                    />

                    {/* Destaque Visual ao Estar Selecionado */}
                    {isSelected && (
                      <circle
                        cx={centerTextX}
                        cy={yTopLeft - 6}
                        r={4}
                        fill="#38bdf8"
                        className="animate-pulse"
                      />
                    )}

                    {/* Informações Centrais dentro do Funil */}
                    <text
                      x={centerTextX}
                      y={centerY - 22}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="bold"
                      className="pointer-events-none tracking-wide"
                    >
                      {st.stage.name.length > 18 ? `${st.stage.name.slice(0, 16)}...` : st.stage.name}
                    </text>

                    {/* Número de Leads */}
                    <text
                      x={centerTextX}
                      y={centerY + 5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="20"
                      fontWeight="900"
                      className="pointer-events-none drop-shadow-sm font-sans"
                    >
                      {st.count} <tspan fontSize="11" fontWeight="normal" opacity="0.9">leads</tspan>
                    </text>

                    {/* Percentual e Valor */}
                    <text
                      x={centerTextX}
                      y={centerY + 24}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.95)"
                      fontSize="10"
                      fontWeight="600"
                      className="pointer-events-none"
                    >
                      {st.percentOfTotal}% do total
                    </text>

                    <text
                      x={centerTextX}
                      y={centerY + 38}
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.85)"
                      fontSize="9.5"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {formatBRL(st.stageCents)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Fita de Taxas de Conversão e Indicadores Entre Etapas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2.5 pt-1">
          {stageStats.stages.map((st, idx) => {
            const isSelected = st.stage.id === selectedStageId;
            const isWon = st.stage.is_won;
            const isLost = st.stage.is_lost;

            return (
              <button
                key={`btn-${st.stage.id}`}
                type="button"
                onClick={() => setSelectedStageId(st.stage.id)}
                className={`flex flex-col justify-between p-2.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30"
                    : "border-border/70 hover:border-border hover:bg-muted/40 bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                    Etapa {idx + 1}
                  </span>
                  <Badge
                    variant={isWon ? "default" : isLost ? "destructive" : "secondary"}
                    className={`text-[9px] px-1 py-0 h-4 font-bold ${
                      isWon ? "bg-emerald-600 text-white" : ""
                    }`}
                  >
                    {st.count}
                  </Badge>
                </div>

                <span className="text-xs font-bold text-foreground truncate" title={st.stage.name}>
                  {st.stage.name}
                </span>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1 pt-1 border-t border-border/40">
                  <span className="font-semibold text-primary">
                    {formatBRL(st.stageCents)}
                  </span>
                  {st.conversionToNext !== null ? (
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold" title="Conversão para a próxima etapa">
                      ➔ {st.conversionToNext}%
                    </span>
                  ) : (
                    <span className="text-[9px] font-medium text-muted-foreground">Final</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 3. LISTAGEM DE LEADS DA ETAPA SELECIONADA */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Pacientes na etapa: <Badge variant="outline" className="text-xs font-bold text-primary">{activeStageData?.stage.name}</Badge>
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

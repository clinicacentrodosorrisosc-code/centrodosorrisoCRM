"use client";
import { useState } from "react";
import { useDashboardOverview } from "@/hooks/dashboard/useDashboardOverview";
import { KpiCard } from "./KpiCard";
import { ConversationsChart } from "./ConversationsChart";
import { PipelineSummaryCard } from "./PipelineSummaryCard";
import { RecentLeadsCard } from "./RecentLeadsCard";
import { ProcedimentosProcuradosCard } from "./ProcedimentosProcuradosCard";
import { ProcedimentosFechadosCard } from "./ProcedimentosFechadosCard";
import { FontesBreakdownCard } from "./FontesBreakdownCard";
import { KpiReportDrawer, type ReportType } from "./KpiReportDrawer";
import type { DashboardOverviewData } from "@/app/api/v1/dashboard/overview/route";
import { formatCentsBRL } from "@/lib/money";
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
  Timer,
  RefreshCw,
  CheckCircle2,
  Wallet,
  Clock,
  Calendar,
  XCircle,
  RotateCw,
  Search,
  Sparkles,
  Compass,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  orgName: string;
}

function formatResponseTime(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) {
    return s > 0 ? `${m}m ${s}s` : `${m}min`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

export function DashboardClient({ orgName }: Props) {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, isError, refetch, isRefetching } = useDashboardOverview(days);

  // Controle do drawer de relatório dos KPIs
  const [reportType, setReportType] = useState<ReportType | null>(null);

  const payload: DashboardOverviewData | undefined = data?.data;

  function openReport(type: ReportType) {
    setReportType(type);
  }

  const topDemanda = payload?.procedimentos_procurados?.[0];
  const topFechado = payload?.procedimentos_fechados?.[0];
  const topFonte = payload?.fontes_breakdown?.[0];
  const bestConvertingFonte = payload?.fontes_breakdown
    ? [...payload.fontes_breakdown].filter((f) => f.count >= 1 && f.won_count > 0).sort((a, b) => b.conversion_rate - a.conversion_rate)[0]
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Drawer de relatório de KPI */}
      {payload && (
        <KpiReportDrawer
          open={reportType !== null}
          onOpenChange={(open) => { if (!open) setReportType(null); }}
          type={reportType ?? "approved"}
          orcamentoItems={
            reportType === "approved"
              ? payload.approved_budgets_list
              : reportType === "received"
                ? payload.received_payments_list
                : payload.pending_balance_list
          }
          agendamentoItems={
            reportType === "agendamentos"
              ? payload.agendamentos_list
              : reportType === "faltas"
                ? payload.faltas_list
                : reportType === "compareceram"
                  ? payload.compareceram_list
                  : payload.remarcados_list
          }
        />
      )}

      {/* Header com Boas-vindas e Filtro de Período */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Painel Geral
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe em tempo real a operação de atendimento, agendamentos e vendas do{" "}
            <span className="font-medium text-foreground">{orgName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Select
            value={String(days)}
            onValueChange={(val) => setDays(Number(val))}
          >
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="h-9 px-3 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl border bg-card/60 animate-pulse p-4" />
          ))}
        </div>
      ) : isError || !payload ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            Erro ao carregar dados do Dashboard.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-3 text-xs"
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {/* ========================================================= */}
          {/* SEÇÃO 1: MÉTRICAS DE AGENDAMENTOS & COMPARECIMENTO        */}
          {/* ========================================================= */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-sky-500" />
                Agendamentos &amp; Taxa de Presença (No-Show)
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1. Total Agendados */}
              <KpiCard
                title="Total Agendados"
                value={`${payload.kpis.agendamentos_total_count} ${payload.kpis.agendamentos_total_count === 1 ? "consulta" : "consultas"}`}
                subtitle={`Criados nos últimos ${days} dias · Clique para detalhes`}
                icon={<Calendar className="h-5 w-5 text-sky-500" />}
                clickable
                onClick={() => openReport("agendamentos")}
              />

              {/* 2. Compareceu (Show Rate) */}
              <KpiCard
                title="Compareceram (Presença)"
                value={`${payload.kpis.agendamentos_compareceu_count} (${payload.kpis.agendamentos_compareceu_taxa}% taxa)`}
                subtitle="Pacientes atendidos · Clique para detalhes"
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                clickable
                onClick={() => openReport("compareceram")}
              />

              {/* 3. Não Compareceu (No-Show) */}
              <KpiCard
                title="Não Compareceu (Faltas)"
                value={`${payload.kpis.agendamentos_faltou_count} (${payload.kpis.agendamentos_faltou_taxa}% faltas)`}
                subtitle="Pacientes para recuperar · Clique para detalhes"
                icon={<XCircle className="h-5 w-5 text-red-500" />}
                clickable
                onClick={() => openReport("faltas")}
              />

              {/* 4. Remarcados */}
              <KpiCard
                title="Remarcados"
                value={`${payload.kpis.agendamentos_remarcado_count} ${payload.kpis.agendamentos_remarcado_count === 1 ? "paciente" : "pacientes"}`}
                subtitle="Reagendamentos solicitados · Clique para detalhes"
                icon={<RotateCw className="h-5 w-5 text-amber-500" />}
                clickable
                onClick={() => openReport("remarcados")}
              />
            </div>
          </div>

          {/* ========================================================= */}
          {/* SEÇÃO 2: KPIs FINANCEIROS & ORÇAMENTOS                    */}
          {/* ========================================================= */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Desempenho Comercial &amp; Financeiro
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1. Pipeline em Negociação (Oportunidades em Aberto no Funil) */}
              <KpiCard
                title="Pipeline em Negociação"
                value={formatCentsBRL(payload.kpis.open_deals_value_cents)}
                subtitle={`Funil Comercial · ${payload.kpis.open_deals_count} ${payload.kpis.open_deals_count === 1 ? "card" : "cards"} abertos`}
                icon={<DollarSign className="h-5 w-5 text-primary" />}
                highlight={true}
              />

              {/* 2. Orçamentos Aprovados (Total Fechado) */}
              <KpiCard
                title="Orçamentos Aprovados"
                value={formatCentsBRL(payload.kpis.approved_budgets_value_cents)}
                subtitle={`${payload.kpis.approved_budgets_count} ${payload.kpis.approved_budgets_count === 1 ? "fechamento" : "fechamentos"} · Clique para detalhes`}
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                clickable
                onClick={() => openReport("approved")}
              />

              {/* 3. Valores Recebidos (Baixas Pagas) */}
              <KpiCard
                title="Valores Recebidos"
                value={formatCentsBRL(payload.kpis.total_received_value_cents)}
                subtitle={`Recebido nos últimos ${days} dias · Clique para detalhes`}
                icon={<Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
                clickable
                onClick={() => openReport("received")}
              />

              {/* 4. Saldo a Receber (Pendente dos Aprovados) */}
              <KpiCard
                title="Saldo a Receber"
                value={formatCentsBRL(payload.kpis.pending_received_value_cents)}
                subtitle="Pendente dos aprovados · Clique para detalhes"
                icon={<Clock className="h-5 w-5 text-amber-500" />}
                clickable
                onClick={() => openReport("pending")}
              />
            </div>
          </div>

          {/* ========================================================= */}
          {/* SEÇÃO 3: INTELIGÊNCIA DE PROCEDIMENTOS & FONTES          */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Inteligência de Procedimentos &amp; Fontes de Captação
            </h2>

            {/* KPIs Rápidos de Destaque */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Top Procedimento Procurado */}
              <KpiCard
                title="Procedimento Mais Procurado"
                value={topDemanda ? topDemanda.procedimento : "—"}
                subtitle={topDemanda ? `${topDemanda.count} ${topDemanda.count === 1 ? "lead" : "leads"} (${topDemanda.percent_of_total}% da demanda)` : "Nenhum registrado"}
                icon={<Search className="h-5 w-5 text-sky-500" />}
              />

              {/* Procedimento Mais Vendido / Faturado */}
              <KpiCard
                title="Líder em Faturamento"
                value={topFechado ? formatCentsBRL(topFechado.total_value_cents) : "R$ 0,00"}
                subtitle={topFechado ? `${topFechado.procedimento} (${topFechado.count} ${topFechado.count === 1 ? "fechado" : "fechados"})` : "Nenhum fechamento"}
                icon={<Sparkles className="h-5 w-5 text-emerald-500" />}
              />

              {/* Principal Canal por Volume */}
              <KpiCard
                title="Principal Canal (Volume)"
                value={topFonte ? topFonte.fonte : "—"}
                subtitle={topFonte ? `${topFonte.count} leads (${topFonte.won_count} convertidos)` : "Sem dados"}
                icon={<Compass className="h-5 w-5 text-purple-500" />}
              />

              {/* Melhor Canal de Conversão */}
              <KpiCard
                title="Melhor Conversão"
                value={bestConvertingFonte ? `${bestConvertingFonte.conversion_rate}%` : "—"}
                subtitle={bestConvertingFonte ? `${bestConvertingFonte.fonte} (${bestConvertingFonte.won_count} ganhos)` : "Aguardando conversões"}
                icon={<TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
              />
            </div>

            {/* Cards Detalhados de Procedimentos Procurados, Fechados e Fontes */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 pt-1">
              <ProcedimentosProcuradosCard procedimentos={payload.procedimentos_procurados || []} />
              <ProcedimentosFechadosCard procedimentos={payload.procedimentos_fechados || []} />
              <FontesBreakdownCard fontes={payload.fontes_breakdown || []} />
            </div>
          </div>

          {/* ========================================================= */}
          {/* SEÇÃO 4: KPIs OPERACIONAIS & ATENDIMENTO                  */}
          {/* ========================================================= */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-sky-500" />
              Operação de Atendimento &amp; WhatsApp
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Conversas Ativas */}
              <KpiCard
                title="Conversas Ativas"
                value={payload.kpis.active_conversations}
                subtitle="Na janela de 24h e ainda não encerradas"
                icon={<MessageSquare className="h-5 w-5 text-sky-500" />}
              />

              {/* Novos Contatos */}
              <KpiCard
                title="Novos Contatos"
                value={payload.kpis.new_contacts}
                subtitle={`Captados nos últimos ${days} dias`}
                icon={<UserPlus className="h-5 w-5 text-purple-500" />}
              />

              {/* Envios Hoje */}
              <KpiCard
                title="Envios Hoje"
                value={payload.kpis.messages_sent_today}
                subtitle="Mensagens disparadas hoje"
                icon={<Send className="h-5 w-5 text-blue-500" />}
              />

              {/* Tempo Médio de Resposta */}
              <KpiCard
                title="Tempo de Resposta"
                value={formatResponseTime(payload.kpis.avg_response_time_seconds)}
                subtitle="Primeiro retorno ao lead"
                icon={<Timer className="h-5 w-5 text-amber-500" />}
              />
            </div>
          </div>

          {/* Gráfico Temporal de Conversas & Resumo do Funil */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <ConversationsChart
              data={payload.daily_series}
              days={days}
            />

            <PipelineSummaryCard
              stages={payload.pipeline_stages}
              totalOpenValueCents={payload.kpis.open_deals_value_cents}
              totalLeadsCount={payload.kpis.open_deals_count}
            />
          </div>

          {/* Tabela de Leads Recentes */}
          <RecentLeadsCard leads={payload.recent_leads} />
        </>
      )}
    </div>
  );
}


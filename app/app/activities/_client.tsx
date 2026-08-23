"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  useActivitiesReport,
  type ActivitiesReportFilters,
} from "@/hooks/reports/useActivitiesReport";
import type { ActivityReportItem } from "@/app/api/v1/reports/activities/route";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Calendar,
  Clock,
  Search,
  Filter,
  Download,
  RotateCw,
  TrendingUp,
  User,
  Bot,
  Layers,
  ArrowRight,
  Receipt,
  MessageSquare,
  Sparkles,
  FileCheck,
  CheckSquare,
} from "lucide-react";
import { formatCentsBRL } from "@/lib/money";

function formatDateTimeBr(isoStr: string): string {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

function getActivityBadge(type: ActivityReportItem["type"], category: ActivityReportItem["category"]) {
  switch (category) {
    case "tarefa":
      return {
        label: "Tarefa",
        bg: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
        icon: <CheckSquare className="h-3.5 w-3.5 text-blue-600" />,
      };
    case "agendamento":
      return {
        label: "Consulta",
        bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
        icon: <Calendar className="h-3.5 w-3.5 text-emerald-600" />,
      };
    case "funil":
      return {
        label: "Funil",
        bg: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
        icon: <Layers className="h-3.5 w-3.5 text-purple-600" />,
      };
    case "financeiro":
      return {
        label: "Financeiro",
        bg: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
        icon: <Receipt className="h-3.5 w-3.5 text-amber-600" />,
      };
    case "atendimento":
      return {
        label: "Atendimento",
        bg: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800",
        icon: <MessageSquare className="h-3.5 w-3.5 text-sky-600" />,
      };
    default:
      return {
        label: "Geral",
        bg: "bg-muted text-muted-foreground border-border",
        icon: <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />,
      };
  }
}

function getActorBadge(actorKind: "user" | "ai" | "system", actorName: string) {
  if (actorKind === "ai") {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800">
        <Bot className="h-3 w-3" />
        {actorName}
      </Badge>
    );
  }
  if (actorKind === "user") {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800">
        <User className="h-3 w-3" />
        {actorName}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[11px] text-muted-foreground">
      {actorName}
    </Badge>
  );
}

export function ActivitiesClient() {
  const [days, setDays] = useState<number>(30);
  const [typeFilter, setTypeFilter] = useState<ActivitiesReportFilters["type"]>("all");
  const [actorFilter, setActorFilter] = useState<ActivitiesReportFilters["actor_kind"]>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const { data, isLoading, isError, refetch, isRefetching } = useActivitiesReport({
    days,
    type: typeFilter,
    actor_kind: actorFilter,
    search: searchTerm,
  });

  const raw = data as any;
  const payload = raw?.data?.kpis ? raw.data : raw?.kpis ? raw : raw?.data;

  const activities: ActivityReportItem[] = useMemo(() => {
    return payload?.activities ?? [];
  }, [payload]);

  const kpis = payload?.kpis;
  const byUser = payload?.by_user ?? [];
  const dailySeries = payload?.daily_series ?? [];

  // Exportar CSV
  function exportCSV() {
    if (!activities.length) return;
    const headers = ["Data/Hora", "Categoria", "Título", "Responsável", "Tipo Ator", "Lead / Negócio", "Contato", "Telefone", "Descrição"];
    const rows = activities.map((a) => [
      formatDateTimeBr(a.performed_at),
      a.category,
      `"${(a.title || "").replace(/"/g, '""')}"`,
      `"${(a.actor_name || "").replace(/"/g, '""')}"`,
      a.actor_kind,
      `"${(a.lead_title || "").replace(/"/g, '""')}"`,
      `"${(a.contact_name || "").replace(/"/g, '""')}"`,
      `"${(a.contact_phone || "").replace(/"/g, '""')}"`,
      `"${(a.description || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio-atividades-${days}d.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Encontra valor máximo para normalização do gráfico de barras
  const maxDailyCount = useMemo(() => {
    if (!dailySeries.length) return 1;
    return Math.max(...dailySeries.map((d: any) => d.count), 1);
  }, [dailySeries]);

  return (
    <div className="flex flex-col gap-6">
      {/* Controles do Topo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Período */}
          <Select value={String(days)} onValueChange={(val) => setDays(Number(val))}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <Calendar className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Ator */}
          <Select value={actorFilter} onValueChange={(val: any) => setActorFilter(val)}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Autores</SelectItem>
              <SelectItem value="user">Apenas Equipe</SelectItem>
              <SelectItem value="ai">Apenas Agente IA</SelectItem>
              <SelectItem value="system">Apenas Sistema</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-9 gap-1.5 text-xs"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={!activities.length}
            className="h-9 gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Grid de KPIs Principais */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* Total de Atividades */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Realizadas</span>
              <FileCheck className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{kpis?.total_activities ?? 0}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">no período de {days} dias</p>
            </div>
          </CardContent>
        </Card>

        {/* Tarefas Concluídas */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Tarefas Concluídas</span>
              <CheckSquare className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{kpis?.completed_tasks ?? 0}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">ações finalizadas</p>
            </div>
          </CardContent>
        </Card>

        {/* Consultas / Agendamentos Realizados */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Consultas Atendidas</span>
              <Calendar className="h-4 w-4 text-sky-500" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{kpis?.completed_agendamentos ?? 0}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">pacientes compareceram</p>
            </div>
          </CardContent>
        </Card>

        {/* Movimentações de Funil */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Avanços no Funil</span>
              <Layers className="h-4 w-4 text-purple-500" />
            </div>
            <div className="mt-2">
              <div className="text-2xl font-bold">{kpis?.stage_moves ?? 0}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">mudanças de etapa</p>
            </div>
          </CardContent>
        </Card>

        {/* Orçamentos & Pagamentos */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Pagamentos em Caixa</span>
              <Receipt className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold truncate">
                {formatCentsBRL(kpis?.payments_received_cents ?? 0)}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {kpis?.proposals_approved ?? 0} orçamentos aprovados
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Colaborador Destaque */}
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Colaborador Líder</span>
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2">
              <div className="text-base font-bold truncate" title={kpis?.top_collaborator?.name}>
                {kpis?.top_collaborator?.name ?? "—"}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {kpis?.top_collaborator ? `${kpis.top_collaborator.count} ações` : "Sem registros"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Gráfico de Tendência Diária + Ranking de Produtividade */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Gráfico de Evolução Diária */}
        <Card className="lg:col-span-2 border border-border/80 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Evolução Diária de Atividades Realizadas
            </CardTitle>
            <CardDescription className="text-xs">
              Volume de tarefas, atendimentos e movimentações dia a dia
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dailySeries.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                Nenhum dado registrado para o período.
              </div>
            ) : (
              <div className="h-48 flex items-end gap-1 sm:gap-1.5 pt-4 pb-2 border-b">
                {dailySeries.map((d: any, index: number) => {
                  const pct = Math.max(4, Math.round((d.count / maxDailyCount) * 100));
                  return (
                    <div
                      key={d.date}
                      className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end"
                    >
                      {/* Tooltip simples no hover */}
                      <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded shadow border border-border pointer-events-none whitespace-nowrap z-10">
                        {d.label}: {d.count} {d.count === 1 ? "ação" : "ações"}
                      </div>
                      <div
                        className="w-full bg-blue-500/80 hover:bg-blue-600 rounded-t transition-all duration-200"
                        style={{ height: `${pct}%` }}
                      />
                      {index % Math.ceil(dailySeries.length / 8) === 0 && (
                        <span className="text-[9px] text-muted-foreground mt-1 select-none">
                          {d.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Produtividade por Membro da Equipe */}
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-purple-500" />
              Produtividade por Atendente
            </CardTitle>
            <CardDescription className="text-xs">
              Ranking de volume de ações realizadas pela equipe e IA
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {byUser.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum membro com ações no período.
              </div>
            ) : (
              byUser.slice(0, 6).map((u: any, idx: number) => {
                const total = kpis?.total_activities ?? 1;
                const pct = Math.round((u.count / total) * 100);
                return (
                  <div key={u.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-medium truncate max-w-[170px]">
                        <span className="text-[11px] font-bold text-muted-foreground/80 w-4">
                          #{idx + 1}
                        </span>
                        <span className="truncate">{u.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">
                          {u.count} {u.count === 1 ? "ação" : "ações"}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {pct}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/80">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Seção da Tabela e Linha do Tempo de Atividades */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Histórico Detalhado de Atividades Realizadas
              </CardTitle>
              <CardDescription className="text-xs">
                Linha do tempo consolidada de tarefas concluídas, atendimentos e eventos operacionais
              </CardDescription>
            </div>

            {/* Campo de Busca */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por lead, contato ou ação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>

          {/* Abas Rápidas de Categorias */}
          <div className="flex flex-wrap items-center gap-1.5 pt-3">
            {[
              { id: "all", label: "Todas" },
              { id: "tasks", label: "Tarefas Concluídas" },
              { id: "agendamentos", label: "Consultas / Agendamentos" },
              { id: "stages", label: "Avanços no Funil" },
              { id: "proposals", label: "Orçamentos & Pagamentos" },
              { id: "notes", label: "Atendimentos & Notas" },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={typeFilter === tab.id ? "default" : "secondary"}
                size="sm"
                onClick={() => setTypeFilter(tab.id as any)}
                className="h-7 text-xs px-2.5"
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <RotateCw className="h-6 w-6 animate-spin text-muted-foreground/60" />
              <span>Carregando relatório de atividades...</span>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Sparkles className="h-8 w-8 text-muted-foreground/40" />
              <span className="font-medium text-foreground">Nenhuma atividade encontrada</span>
              <span className="text-muted-foreground/80">
                Tente ajustar o período ou os filtros de tipo e busca selecionados.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {activities.map((act) => {
                const badge = getActivityBadge(act.type, act.category);
                return (
                  <div
                    key={act.id}
                    className="p-4 hover:bg-muted/20 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-0.5 p-2 rounded-lg bg-muted/60 shrink-0">
                        {badge.icon}
                      </div>

                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground text-sm">
                            {act.title}
                          </span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border ${badge.bg}`}>
                            {badge.label}
                          </Badge>
                          {getActorBadge(act.actor_kind, act.actor_name)}
                        </div>

                        {act.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {act.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-0.5">
                          {act.lead_title && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium text-foreground/90">Lead:</span>
                              <Link
                                href={`/app/kanban`}
                                className="text-primary hover:underline truncate max-w-[180px]"
                              >
                                {act.lead_title}
                              </Link>
                            </span>
                          )}

                          {act.contact_name && (
                            <span className="flex items-center gap-1">
                              <span className="font-medium text-foreground/90">Paciente:</span>
                              <Link
                                href={`/app/contacts`}
                                className="text-primary hover:underline truncate max-w-[180px]"
                              >
                                {act.contact_name}
                              </Link>
                            </span>
                          )}

                          {act.contact_phone && (
                            <span className="text-muted-foreground">
                              {act.contact_phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 text-right gap-1 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <span className="text-xs font-medium text-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {formatDateTimeBr(act.performed_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

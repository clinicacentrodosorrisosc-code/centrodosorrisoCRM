"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, BarChart3, Clock3, MessageCircleMore, RefreshCw, TrendingDown, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { BusinessDashboardPanel } from "./BusinessDashboardPanel";
type Metric = { count: number; value_cents: number };
type Ranking = { name: string; count: number; value_cents: number; percentage?: number };
type DashboardData = {
  pipeline_name: string; has_pipeline: boolean;
  negocios: { total: Metric; ganhos: Metric; perdidos: Metric; em_aberto: Metric; daily: Array<{ date: string; label: string; count: number }>; por_responsavel: Ranking[]; servicos: Ranking[]; responsaveis: Ranking[] };
  multiatendimento: { total_iniciados: number; em_aberto: number; aguardando: number; por_hora: Array<{ weekday: number; hours: number[] }>; daily_iniciados?: Array<{ date: string; label: string; count: number }> };
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
const dayOptions = [7, 30, 90, 365];

export function DashboardClient({ orgName }: { orgName: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    fetch(`/api/v1/dashboard/overview?days=${days}`, { signal: controller.signal })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "Nao foi possivel carregar o dashboard."); setData(payload.data as DashboardData); })
      .catch((reason: unknown) => { if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Erro ao carregar o dashboard."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [days]);

  return <main className="space-y-6 p-4 md:p-6">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm font-medium text-primary">Visao geral</p><h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe os resultados de {orgName} no periodo selecionado.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex rounded-lg border border-border bg-surface p-1">{dayOptions.map((option) => <button key={option} type="button" onClick={() => setDays(option)} className={`rounded-md px-3 py-1.5 text-sm transition-colors ${days === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{option === 365 ? "12 meses" : `${option} dias`}</button>)}</div><Button variant="outline" size="icon" aria-label="Atualizar dashboard" onClick={() => setDays((current) => current)}><RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /></Button></div></header>
    {error ? <Card className="border-destructive/40 p-5 text-sm text-destructive">{error}</Card> : null}
    <Tabs defaultValue="negocios" className="space-y-5"><TabsList className="h-auto w-full justify-start gap-1 rounded-xl border border-border bg-surface p-1.5 sm:w-auto"><TabsTrigger value="negocios" className="px-4 py-2">Negocios</TabsTrigger><TabsTrigger value="multiatendimento" className="px-4 py-2">Multiatendimento</TabsTrigger><TabsTrigger value="atividades" className="px-4 py-2">Atividades</TabsTrigger></TabsList>
      <TabsContent value="negocios" className="mt-0"><BusinessDashboardPanel data={data} loading={loading} /></TabsContent>
      <TabsContent value="multiatendimento" className="mt-0"><MultiAttendancePanel data={data} loading={loading} /></TabsContent>
      <TabsContent value="atividades" className="mt-0"><ActivitiesPanel /></TabsContent>
    </Tabs>
  </main>;
}

function BusinessesPanel({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const business = data?.negocios;
  return <div className="space-y-4">{!data?.has_pipeline && !loading ? <Card className="p-4 text-sm text-muted-foreground">Nenhum funil comercial ativo foi encontrado nesta organizacao.</Card> : null}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><KpiCard title="Total de negocios" value={number(business?.total.count ?? 0)} description={`${money(business?.total.value_cents ?? 0)} em cards ativos ate Orcamento`} icon={<BarChart3 className="size-5" />} tone="sky" loading={loading} /><KpiCard title="Total ganhos" value={money(business?.ganhos.value_cents ?? 0)} description={`${number(business?.ganhos.count ?? 0)} recebimentos de pacientes`} icon={<TrendingDown className="size-5 rotate-180" />} tone="emerald" loading={loading} /><KpiCard title="Total perdidos" value={money(business?.perdidos.value_cents ?? 0)} description={`${number(business?.perdidos.count ?? 0)} negocios fechados como perdidos`} icon={<TrendingDown className="size-5" />} tone="rose" loading={loading} /><KpiCard title="Total em aberto" value={money(business?.em_aberto.value_cents ?? 0)} description={`${number(business?.em_aberto.count ?? 0)} orcamentos enviados ou aprovados`} icon={<WalletCards className="size-5" />} tone="violet" loading={loading} /></div>
    <p className="text-xs text-muted-foreground">Base: {data?.pipeline_name ?? "Funil Comercial"}. Negocios ativos sao considerados somente ate a etapa Orcamento.</p>
    <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]"><Card className="p-5"><SectionTitle title="Dados diarios" description="Negocios criados no periodo, ate a etapa Orcamento." /><BarChart data={business?.daily ?? []} /></Card><Card className="p-5"><SectionTitle title="Percentual por responsavel" description="Participacao por valor dos negocios ativos." /><OwnerBreakdown data={business?.por_responsavel ?? []} /></Card></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card className="p-5"><SectionTitle title="Servicos com mais negocios" description="Agrupado pelo servico informado no card." /><RankList data={business?.servicos ?? []} empty="Ainda nao ha servicos informados nos negocios." /></Card><Card className="p-5"><SectionTitle title="Responsaveis com mais negocios" description="Ranking pelo valor dos negocios ativos." /><RankList data={business?.responsaveis ?? []} empty="Ainda nao ha responsaveis vinculados aos negocios." /></Card></div>
  </div>;
}

function MultiAttendancePanel({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  const service = data?.multiatendimento;
  return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><KpiCard title="Total de atendimentos" value={number(service?.total_iniciados ?? 0)} description="Conversas de WhatsApp iniciadas no periodo" icon={<MessageCircleMore className="size-5" />} tone="sky" loading={loading} /><KpiCard title="Atendimentos em aberto" value={number(service?.em_aberto ?? 0)} description="Conversas dentro da janela de 24 horas da Meta" icon={<MessageCircleMore className="size-5" />} tone="violet" loading={loading} /><KpiCard title="Aguardando atendimento" value={number(service?.aguardando ?? 0)} description="Contato enviou mensagem sem resposta de responsavel" icon={<Clock3 className="size-5" />} tone="amber" loading={loading} /></div><div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]"><Card className="p-5"><SectionTitle title="Atendimentos" description="Atendimentos iniciados no periodo selecionado." /><ConversationSummary data={service} /></Card><Card className="p-5"><SectionTitle title="Atendimentos iniciados por hora" description="Horario da primeira mensagem que abriu o atendimento." /><Heatmap data={service?.por_hora ?? []} /></Card></div></div>;
}

function ActivitiesPanel() { return <Card className="flex min-h-64 flex-col items-start justify-center gap-3 p-6"><div className="rounded-lg bg-primary/10 p-3 text-primary"><Activity className="size-6" /></div><div><h2 className="font-semibold text-foreground">Atividades da equipe</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">Este ambiente sera a proxima etapa do dashboard. Enquanto fechamos os detalhes do layout, o relatorio completo continua disponivel.</p></div><Button asChild variant="outline"><Link href="/app/activities">Abrir relatorio de atividades</Link></Button></Card>; }

function KpiCard({ title, value, description, icon, tone, loading }: { title: string; value: string; description: string; icon: React.ReactNode; tone: "sky" | "emerald" | "rose" | "violet" | "amber"; loading: boolean }) { const tones = { sky: "bg-sky-500/10 text-sky-600", emerald: "bg-emerald-500/10 text-emerald-600", rose: "bg-rose-500/10 text-rose-600", violet: "bg-violet-500/10 text-violet-600", amber: "bg-amber-500/10 text-amber-600" }; return <Card className="min-h-36 p-5"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{title}</p><span className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</span></div><p className={`mt-4 text-2xl font-semibold tracking-tight ${loading ? "animate-pulse text-muted" : "text-foreground"}`}>{loading ? "..." : value}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></Card>; }
function SectionTitle({ title, description }: { title: string; description: string }) { return <div className="mb-5"><h2 className="font-semibold text-foreground">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>; }
function BarChart({ data }: { data: DashboardData["negocios"]["daily"] }) { const max = Math.max(1, ...data.map((item) => item.count)); const visible = data.length > 45 ? data.filter((_, index) => index % Math.ceil(data.length / 30) === 0) : data; return <div className="flex h-56 items-end gap-1.5 border-b border-border pt-4">{visible.map((item) => <div key={item.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end"><div title={`${item.label}: ${item.count} negocios`} className="min-h-1 rounded-t bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${Math.max(item.count ? 8 : 0, (item.count / max) * 100)}%` }} /><span className="mt-2 truncate text-center text-[10px] text-muted-foreground">{item.label}</span></div>)}</div>; }
function OwnerBreakdown({ data }: { data: Ranking[] }) { if (!data.length) return <Empty text="Nenhum negocio ativo possui responsavel no periodo." />; return <div className="space-y-4">{data.map((item) => <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{item.name}</span><span className="text-muted-foreground">{item.percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${item.percentage}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{number(item.count)} negocios · {money(item.value_cents)}</p></div>)}</div>; }
function RankList({ data, empty }: { data: Ranking[]; empty: string }) { if (!data.length) return <Empty text={empty} />; return <div className="divide-y divide-border">{data.map((item, index) => <div key={`${item.name}-${index}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{number(item.count)} negocios · Ticket medio {money(item.count ? Math.round(item.value_cents / item.count) : 0)}</p></div><p className="text-sm font-semibold text-foreground">{money(item.value_cents)}</p></div>)}</div>; }
function ConversationSummary({ data }: { data: DashboardData["multiatendimento"] | undefined }) {
  const points = data?.daily_iniciados ?? [];
  const max = Math.max(1, ...points.map((point) => point.count));
  const visible = points.length > 45 ? points.filter((_, index) => index % Math.ceil(points.length / 30) === 0) : points;
  if (!visible.length) return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Nao ha atendimentos iniciados no periodo.</div>;
  return <div className="flex h-56 items-end gap-1 border-b border-border pt-4">{visible.map((point) => <div key={point.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${point.label}: ${number(point.count)} atendimentos`}><div className="min-h-1 rounded-t bg-blue-500/85 transition-colors group-hover:bg-blue-600" style={{ height: `${Math.max(point.count ? 7 : 0, (point.count / max) * 100)}%` }} /><span className="mt-2 truncate text-center text-[10px] text-muted-foreground">{point.label}</span></div>)}</div>;
}
function Heatmap({ data }: { data: Array<{ weekday: number; hours: number[] }> }) { const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]; const max = Math.max(1, ...data.flatMap((row) => row.hours)); return <div className="overflow-x-auto"><div className="min-w-[600px] space-y-1">{data.map((row) => <div key={row.weekday} className="grid grid-cols-[28px_repeat(24,minmax(16px,1fr))] gap-1"><span className="text-xs text-muted-foreground">{days[row.weekday]}</span>{row.hours.map((value, hour) => <div key={hour} title={`${days[row.weekday]} ${String(hour).padStart(2, "0")}:00 · ${value}`} className="aspect-square min-h-4 rounded-sm bg-primary" style={{ opacity: value ? 0.2 + (value / max) * 0.8 : 0.08 }} />)}</div>)}</div><div className="mt-2 grid min-w-[600px] grid-cols-[28px_repeat(24,minmax(16px,1fr))] gap-1"><span />{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="text-center text-[9px] text-muted-foreground">{hour}</span>)}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{text}</div>; }

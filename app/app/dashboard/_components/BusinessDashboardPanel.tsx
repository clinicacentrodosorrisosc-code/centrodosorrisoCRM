"use client";

import { useMemo, useState } from "react";
import { BarChart3, CirclePlus, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

import { Card } from "@/components/ui/card";

type Metric = { count: number; value_cents: number };
type MetricKey = "criados" | "ganhos" | "perdidos" | "em_aberto" | "negocios";
type DailyPoint = {
  date: string;
  label: string;
  criados: Metric;
  ganhos: Metric;
  perdidos: Metric;
  em_aberto: Metric;
  negocios: Metric;
};
type Ranking = { name: string; count: number; value_cents: number; percentage?: number };

type BusinessData = {
  pipeline_name: string;
  has_pipeline: boolean;
  negocios: {
    criados?: Metric;
    total: Metric;
    ganhos: Metric;
    perdidos: Metric;
    em_aberto: Metric;
    daily_by_metric?: DailyPoint[];
    por_responsavel: Ranking[];
    por_responsavel_por_metrica?: Partial<Record<MetricKey, Ranking[]>>;
  };
    por_responsavel_por_metrica?: Partial<Record<MetricKey, Ranking[]>>;
};

const labels: Record<MetricKey, { title: string; detail: string; color: string }> = {
  criados: { title: "Total criados", detail: "Cards criados no periodo selecionado", color: "text-blue-600" },
  ganhos: { title: "Total ganhos", detail: "Valores efetivamente recebidos de pacientes", color: "text-emerald-600" },
  perdidos: { title: "Total perdidos", detail: "Negocios fechados como perdidos no periodo", color: "text-rose-600" },
  em_aberto: { title: "Total em aberto", detail: "Orcamentos enviados ou aprovados", color: "text-violet-600" },
  negocios: { title: "Total negocios", detail: "Cards ativos ate a etapa Orcamento", color: "text-sky-600" },
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const amount = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

export function BusinessDashboardPanel({ data, loading }: { data: BusinessData | null; loading: boolean }) {
  const [active, setActive] = useState<MetricKey>("criados");
  const business = data?.negocios;
  const metrics: Record<MetricKey, Metric> = {
    criados: business?.criados ?? { count: 0, value_cents: 0 },
    ganhos: business?.ganhos ?? { count: 0, value_cents: 0 },
    perdidos: business?.perdidos ?? { count: 0, value_cents: 0 },
    em_aberto: business?.em_aberto ?? { count: 0, value_cents: 0 },
    negocios: business?.total ?? { count: 0, value_cents: 0 },
  };

  return <div className="space-y-4">
    {!data?.has_pipeline && !loading ? <Card className="p-4 text-sm text-muted-foreground">Nenhum funil comercial ativo foi encontrado nesta organizacao.</Card> : null}
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard metric="criados" active={active} value={metrics.criados} loading={loading} onSelect={setActive} icon={<CirclePlus className="size-5" />} />
      <MetricCard metric="ganhos" active={active} value={metrics.ganhos} loading={loading} onSelect={setActive} icon={<TrendingUp className="size-5" />} />
      <MetricCard metric="perdidos" active={active} value={metrics.perdidos} loading={loading} onSelect={setActive} icon={<TrendingDown className="size-5" />} />
      <MetricCard metric="em_aberto" active={active} value={metrics.em_aberto} loading={loading} onSelect={setActive} icon={<WalletCards className="size-5" />} />
      <MetricCard metric="negocios" active={active} value={metrics.negocios} loading={loading} onSelect={setActive} icon={<BarChart3 className="size-5" />} />
    </div>
    <div className="grid gap-3 xl:grid-cols-[1.75fr_0.75fr]">
      <Card className="p-4 md:p-5">
        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="font-semibold text-foreground">Dados diarios</h2><p className="mt-0.5 text-xs text-muted-foreground">{labels[active].detail}</p></div><span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">Valor</span></div>
        <MetricChart active={active} data={business?.daily_by_metric ?? []} />
      </Card>
      <Card className="p-4 md:p-5"><div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="font-semibold text-foreground">Percentual por atendente</h2><p className="mt-0.5 text-xs text-muted-foreground">{labels[active].detail}</p></div><span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">Valor</span></div><AttendantBreakdown data={business?.por_responsavel_por_metrica?.[active] ?? business?.por_responsavel ?? []} /></Card>
    </div>
  </div>;
}

function MetricCard({ metric, active, value, loading, onSelect, icon }: { metric: MetricKey; active: MetricKey; value: Metric; loading: boolean; onSelect: (metric: MetricKey) => void; icon: React.ReactNode }) {
  const selected = metric === active;
  return <button type="button" onClick={() => onSelect(metric)} aria-pressed={selected} className={`min-h-24 rounded-lg border bg-surface p-4 text-left shadow-xs transition-all hover:-translate-y-px hover:shadow-sm ${selected ? "border-blue-500 ring-1 ring-blue-500" : "border-border"}`}><p className="text-sm font-medium text-foreground">{labels[metric].title}</p><div className="mt-3 flex items-end justify-between gap-2"><div><p className={`text-xl font-semibold ${loading ? "animate-pulse text-muted-foreground" : "text-foreground"}`}>{loading ? "..." : money(value.value_cents)}</p><p className="mt-0.5 text-xs text-muted-foreground">{amount(value.count)} negocios</p></div><span className={labels[metric].color}>{icon}</span></div></button>;
}

function MetricChart({ active, data }: { active: MetricKey; data: DailyPoint[] }) {
  const [hovered, setHovered] = useState<DailyPoint | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((point) => point[active].value_cents)), [active, data]);
  const visible = data.length > 45 ? data.filter((_, index) => index % Math.ceil(data.length / 30) === 0) : data;
  if (!data.length) return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Nao ha dados no periodo.</div>;

  return <div className="relative"><div className="flex h-58 items-end gap-1 border-b border-border pt-4">{visible.map((point) => { const value = point[active].value_cents; return <div key={point.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end" onMouseEnter={() => setHovered(point)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(point)} onBlur={() => setHovered(null)} tabIndex={0}><div className="min-h-1 rounded-t bg-blue-500/85 transition-colors group-hover:bg-blue-600 group-focus:bg-blue-600" style={{ height: `${Math.max(value ? 7 : 0, (value / max) * 100)}%` }} /><span className="mt-2 truncate text-center text-[10px] text-muted-foreground">{point.label}</span></div>; })}</div>{hovered ? <DailyTooltip point={hovered} /> : null}</div>;
}

function DailyTooltip({ point }: { point: DailyPoint }) { const rows: Array<[MetricKey, Metric]> = [["criados", point.criados], ["ganhos", point.ganhos], ["perdidos", point.perdidos], ["em_aberto", point.em_aberto], ["negocios", point.negocios]]; return <div className="pointer-events-none absolute left-1/2 top-8 z-10 w-52 -translate-x-1/2 rounded-lg border border-border bg-surface p-3 shadow-lg"><p className="mb-2 text-xs font-semibold text-foreground">{point.label}</p><div className="space-y-1.5">{rows.map(([key, value]) => <div key={key} className="flex items-center justify-between gap-2 text-[11px]"><span className="text-muted-foreground">{labels[key].title.replace("Total ", "")}</span><span className="font-medium text-foreground">{money(value.value_cents)} · {amount(value.count)}</span></div>)}</div></div>; }

function AttendantBreakdown({ data }: { data: Ranking[] }) { if (!data.length) return <div className="flex h-58 items-center justify-center text-sm text-muted-foreground">Nao ha dados</div>; return <div className="space-y-4">{data.map((item, index) => <div key={`${item.name}-${index}`}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium text-foreground">{item.name}</span><span className="text-muted-foreground">{item.percentage ?? 0}%</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-blue-500" style={{ width: `${item.percentage ?? 0}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{amount(item.count)} negocios · {money(item.value_cents)}</p></div>)}</div>; }

"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";


import { Button } from "@/components/ui/button";
import { formatCentsBRL } from "@/lib/money";
import {
  CheckCircle2,
  Wallet,
  Clock,
  User,

  Calendar,
  XCircle,
  RotateCw,
  ExternalLink,
} from "lucide-react";
import type {
  OrcamentoReportItem,
  AgendamentoReportItem,
} from "@/app/api/v1/dashboard/overview/route";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  enviado: { label: "Enviado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  aprovado: { label: "Aprovado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  quitado: { label: "100% Quitado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  recusado: { label: "Recusado", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

function formatYMD(ymd: string): string {
  if (!ymd) return "—";
  const [year, month, day] = ymd.split("-");
  return `${day}/${month}/${year}`;
}

export type ReportType =
  | "approved"
  | "received"
  | "pending"
  | "agendamentos"
  | "faltas"
  | "compareceram"
  | "remarcados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ReportType;
  orcamentoItems?: OrcamentoReportItem[];
  agendamentoItems?: AgendamentoReportItem[];
}

const CONFIG: Record<
  ReportType,
  { title: string; description: string; icon: React.ReactNode; emptyText: string }
> = {
  approved: {
    title: "Orçamentos Aprovados",
    description: "Lista completa de todas as propostas aprovadas ou quitadas.",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    emptyText: "Nenhum orçamento aprovado ainda.",
  },
  received: {
    title: "Valores Recebidos",
    description: "Detalhamento de todos os pagamentos registrados.",
    icon: <Wallet className="h-5 w-5 text-emerald-600" />,
    emptyText: "Nenhum pagamento registrado ainda.",
  },
  pending: {
    title: "Saldo a Receber",
    description: "Orçamentos aprovados com saldo pendente de pagamento.",
    icon: <Clock className="h-5 w-5 text-amber-500" />,
    emptyText: "Nenhum saldo pendente.",
  },
  agendamentos: {
    title: "Todas as Avaliações Agendadas",
    description: "Consultas e avaliações agendadas no funil de vendas.",
    icon: <Calendar className="h-5 w-5 text-sky-500" />,
    emptyText: "Nenhuma avaliação agendada no período.",
  },
  faltas: {
    title: "Pacientes que Faltaram (No-Show)",
    description: "Pacientes que não compareceram e necessitam de remarcação.",
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    emptyText: "Nenhuma falta registrada. Excelente taxa de comparecimento!",
  },
  compareceram: {
    title: "Pacientes que Compareceram",
    description: "Avaliações realizadas com presença confirmada.",
    icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    emptyText: "Nenhum comparecimento registrado ainda.",
  },
  remarcados: {
    title: "Agendamentos Remarcados",
    description: "Pacientes que solicitaram reagendamento de consulta.",
    icon: <RotateCw className="h-5 w-5 text-amber-500" />,
    emptyText: "Nenhum reagendamento registrado no momento.",
  },
};

function ProgressBar({ pago, total }: { pago: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((pago / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

function ApprovedCard({ item }: { item: OrcamentoReportItem }) {
  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE["rascunho"]!;
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{item.lead_title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {item.contact_name ?? "Sem contato"} · {item.stage_name}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Procedimentos */}
      {item.procedimentos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.procedimentos.map((proc, i) => (
            <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {proc}
            </span>
          ))}
        </div>
      )}

      {/* Financeiro */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total orçado</span>
          <span className="font-bold text-foreground">{formatCentsBRL(item.total_cents)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Total pago</span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCentsBRL(item.total_pago_cents)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Saldo</span>
          <span className={`font-medium ${item.saldo_restante_cents > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {formatCentsBRL(item.saldo_restante_cents)}
          </span>
        </div>
        <ProgressBar pago={item.total_pago_cents} total={item.total_cents} />
      </div>
    </div>
  );
}

function AgendamentoCard({ item }: { item: AgendamentoReportItem }) {
  const isFaltou = item.agendamento_status === "faltou";
  const isCompareceu = item.agendamento_status === "compareceu";
  const isRemarcado = item.agendamento_status === "remarcado";

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
      isFaltou
        ? "border-red-500/30 bg-red-500/5 dark:bg-red-950/20"
        : isCompareceu
          ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
          : "border-border bg-card"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isFaltou
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
              : isCompareceu
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
          }`}>
            {isFaltou ? <XCircle size={18} /> : isCompareceu ? <CheckCircle2 size={18} /> : <Calendar size={18} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{item.lead_title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {item.contact_name ? `Paciente: ${item.contact_name}` : "Contato vinculado"} · Etapa: {item.stage_name}
            </p>
          </div>
        </div>

        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
          isFaltou
            ? "bg-red-500/20 text-red-700 dark:text-red-300"
            : isCompareceu
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : isRemarcado
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                : "bg-sky-500/20 text-sky-700 dark:text-sky-300"
        }`}>
          {isFaltou ? "FALTOU (NO-SHOW)" : isCompareceu ? "COMPARECEU" : isRemarcado ? "REMARCADO" : "AGENDADO"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-border/50 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground flex items-center gap-1">
            <Calendar size={13} className="text-primary" />
            {formatYMD(item.agendamento_data)} {item.agendamento_hora ? `às ${item.agendamento_hora}` : ""}
          </span>
          {item.procedimento && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {item.procedimento}
            </span>
          )}
        </div>

        {item.lead_id && <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs gap-1"
          onClick={() => window.open(`/app/kanban?leadId=${item.lead_id}`, "_blank")}
        >
          <ExternalLink size={12} /> Abrir Lead
        </Button>}
      </div>
    </div>
  );
}

export function KpiReportDrawer({
  open,
  onOpenChange,
  type,
  orcamentoItems = [],
  agendamentoItems = [],
}: Props) {
  const cfg = CONFIG[type] ?? CONFIG["approved"];
  const isAgendamentoType =
    type === "agendamentos" ||
    type === "faltas" ||
    type === "compareceram" ||
    type === "remarcados";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              {cfg.icon}
            </div>
            <div>
              <SheetTitle className="text-base font-bold text-foreground">
                {cfg.title}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {cfg.description}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 p-6 space-y-4">
          {isAgendamentoType ? (
            agendamentoItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
                <div className="text-4xl">🗓️</div>
                <p className="text-sm font-medium">{cfg.emptyText}</p>
              </div>
            ) : (
              agendamentoItems.map((item) => (
                <AgendamentoCard key={item.id} item={item} />
              ))
            )
          ) : (
            orcamentoItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
                <div className="text-4xl">📄</div>
                <p className="text-sm font-medium">{cfg.emptyText}</p>
              </div>
            ) : (
              orcamentoItems.map((item) => (
                <ApprovedCard key={item.lead_id} item={item} />
              ))
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

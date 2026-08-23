"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useAttendanceAlerts,
} from "@/hooks/leads/useAttendanceAlerts";
import {
  Clock,
  CheckCircle,
  XCircle,
  Bell,
  ArrowSquareOut,
  Timer,
} from "@/lib/ui/icons";

export function AttendanceAlertNotifier() {
  const { pendingLeads, recordAttendance, snoozeLead } = useAttendanceAlerts();
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!pendingLeads || pendingLeads.length === 0) return null;

  // Garante índice seguro caso a lista diminua
  const safeIndex = Math.min(currentIndex, pendingLeads.length - 1);
  const currentLead = pendingLeads[safeIndex];
  if (!currentLead) return null;

  const isBusy = recordAttendance.isPending;

  function handleAction(status: "compareceu" | "faltou") {
    if (!currentLead) return;
    recordAttendance.mutate({
      leadId: currentLead.id,
      status,
    });
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-md w-full animate-in fade-in slide-in-from-bottom-5 duration-300">
      <Card className="border-2 border-primary/40 bg-card/95 backdrop-blur-md shadow-2xl p-4 flex flex-col gap-3 rounded-xl ring-1 ring-primary/20">
        {/* Cabeçalho do Alerta */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 rounded-full bg-primary/10 text-primary animate-pulse">
              <Bell size={16} weight="duotone" />
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">
                Consulta no Horário!
              </p>
              <p className="text-[10px] text-muted-foreground">
                Atualize a presença da avaliação
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {pendingLeads.length > 1 && (
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {safeIndex + 1} de {pendingLeads.length}
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => snoozeLead(currentLead.id, 15)}
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              title="Lembrar daqui a 15 minutos"
              disabled={isBusy}
            >
              <Timer size={12} />
              <span className="hidden sm:inline">15m</span>
            </Button>
          </div>
        </div>

        {/* Informações do Paciente */}
        <div className="flex flex-col gap-1.5 bg-muted/40 p-2.5 rounded-lg border border-border/50 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-sm text-foreground truncate">
              {currentLead.title}
            </span>
            <Link
              href={`/app/pipelines/${currentLead.pipeline_id}?lead=${currentLead.id}`}
              className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 shrink-0"
              title="Abrir lead no funil"
            >
              Ver lead <ArrowSquareOut size={11} />
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-foreground">
              <Clock size={13} className="text-primary" />
              Hoje às {currentLead.agendamento_hora}
            </span>
            {currentLead.procedimento && (
              <span className="flex items-center gap-1">
                • {currentLead.procedimento}
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-center font-medium text-muted-foreground">
          O paciente compareceu à clínica para a avaliação?
        </p>

        {/* Botões de Ação Imediata */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleAction("faltou")}
            disabled={isBusy}
            className="h-9 text-xs font-bold gap-1.5 border-red-500/50 text-red-700 dark:text-red-300 hover:bg-red-500/10 shadow-xs"
          >
            <XCircle size={14} weight="bold" />
            Não compareceu
          </Button>

          <Button
            type="button"
            onClick={() => handleAction("compareceu")}
            disabled={isBusy}
            className="h-9 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
          >
            <CheckCircle size={14} weight="bold" />
            Compareceu
          </Button>
        </div>

        {/* Navegação entre múltiplos leads pendentes */}
        {pendingLeads.length > 1 && (
          <div className="flex items-center justify-between border-t border-border/40 pt-1 text-[10px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : pendingLeads.length - 1))}
              className="hover:text-foreground font-medium underline-offset-2 hover:underline"
            >
              ← Anterior
            </button>
            <span>Outras consultas pendentes</span>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev < pendingLeads.length - 1 ? prev + 1 : 0))}
              className="hover:text-foreground font-medium underline-offset-2 hover:underline"
            >
              Próximo →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

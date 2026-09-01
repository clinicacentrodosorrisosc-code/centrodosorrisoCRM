"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  ArrowsClockwise,
  CalendarBlank,
  Pause,
} from "@/lib/ui/icons";

export function AttendanceAlertNotifier() {
  const { pendingLeads, recordAttendance, snoozeLead } = useAttendanceAlerts();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Estados para remarcação inline
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("09:00");

  // Estados para pausa/snooze personalizado
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [customSnoozeMinutes, setCustomSnoozeMinutes] = useState(5);

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
    setIsRescheduling(false);
    setShowSnoozeMenu(false);
  }

  function handleConfirmarRemarcacao() {
    if (!currentLead || !novaData) return;
    recordAttendance.mutate({
      leadId: currentLead.id,
      status: "remarcado",
      nova_data: novaData,
      nova_hora: novaHora || "09:00",
    });
    setIsRescheduling(false);
    setShowSnoozeMenu(false);
  }

  function handleSnooze(minutes: number) {
    if (!currentLead) return;
    snoozeLead(currentLead.id, minutes);
    setShowSnoozeMenu(false);
    setIsRescheduling(false);
  }

  return (
    <div className="fixed bottom-5 right-5 z-[9999] max-w-md w-full animate-in fade-in slide-in-from-bottom-5 duration-300">
      <Card className="border-2 border-primary/50 bg-card/95 backdrop-blur-md shadow-2xl p-4 flex flex-col gap-3 rounded-2xl ring-2 ring-primary/20">
        {/* Cabeçalho do Alerta */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center p-1.5 rounded-full bg-primary/15 text-primary animate-bounce">
              <Bell size={16} weight="fill" />
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">
                Consulta no Horário!
              </p>
              <p className="text-[10px] text-muted-foreground">
                Atualize o comparecimento do paciente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {pendingLeads.length > 1 && (
              <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                {safeIndex + 1} de {pendingLeads.length}
              </Badge>
            )}

            {/* Botão de Pausa / Lembrar mais tarde */}
            <Button
              type="button"
              variant={showSnoozeMenu ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowSnoozeMenu(!showSnoozeMenu);
                setIsRescheduling(false);
              }}
              className="h-7 px-2 text-[11px] font-medium gap-1 text-muted-foreground hover:text-foreground border-border/80"
              title="Pausar / Lembrar mais tarde"
              disabled={isBusy}
            >
              <Timer size={13} className="text-amber-500" />
              <span>Pausar</span>
            </Button>
          </div>
        </div>

        {/* Menu de Pausa / Snooze personalizado */}
        {showSnoozeMenu && (
          <div className="flex flex-col gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-semibold text-amber-900 dark:text-amber-200 text-[11px]">
              <span className="flex items-center gap-1">
                <Pause size={12} weight="bold" /> Pausar notificação por:
              </span>
            </div>

            {/* Opções rápidas */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[5, 10, 15, 30, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleSnooze(mins)}
                  className="px-2 py-1 rounded-md bg-card border border-border hover:bg-amber-500/20 hover:border-amber-500/40 text-[11px] font-semibold transition-colors"
                >
                  {mins === 60 ? "1 hora" : `${mins} min`}
                </button>
              ))}
            </div>

            {/* Opção de tempo customizado */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-amber-500/20">
              <span className="text-[10px] text-muted-foreground">Outro tempo:</span>
              <Input
                type="number"
                min={1}
                max={1440}
                value={customSnoozeMinutes}
                onChange={(e) => setCustomSnoozeMinutes(Number(e.target.value) || 5)}
                className="h-6 w-16 text-[11px] px-1.5 py-0 text-center"
              />
              <span className="text-[10px] text-muted-foreground">min</span>
              <Button
                type="button"
                size="sm"
                onClick={() => handleSnooze(customSnoozeMinutes)}
                className="h-6 px-2 text-[10px] font-bold bg-amber-600 hover:bg-amber-700 text-white ml-auto"
              >
                Pausar
              </Button>
            </div>
          </div>
        )}

        {/* Informações do Paciente */}
        <div className="flex flex-col gap-1.5 bg-muted/40 p-2.5 rounded-xl border border-border/50 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-sm text-foreground truncate">
              {currentLead.title}
            </span>
            <Link
              href={`/app/pipelines/${currentLead.pipeline_id}?lead=${currentLead.id}`}
              className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 shrink-0 font-medium"
              title="Abrir lead no funil"
            >
              Ver lead <ArrowSquareOut size={11} />
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-muted-foreground text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-foreground bg-primary/10 px-2 py-0.5 rounded-md text-primary">
              <Clock size={13} />
              Hoje às {currentLead.agendamento_hora}
            </span>
            {currentLead.procedimento && (
              <span className="flex items-center gap-1 font-medium bg-muted px-1.5 py-0.5 rounded text-[10px]">
                {currentLead.procedimento}
              </span>
            )}
          </div>
        </div>

        {/* MODO REMARCAÇÃO INLINE */}
        {isRescheduling ? (
          <div className="flex flex-col gap-2 p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-xs animate-in fade-in duration-200">
            <p className="font-semibold text-sky-900 dark:text-sky-200 text-[11px] flex items-center gap-1">
              <CalendarBlank size={13} className="text-sky-500" /> Selecione a nova data e horário:
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Nova Data:</span>
                <Input
                  type="date"
                  value={novaData}
                  onChange={(e) => setNovaData(e.target.value)}
                  className="h-7 text-xs px-2"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Novo Horário:</span>
                <Input
                  type="time"
                  value={novaHora}
                  onChange={(e) => setNovaHora(e.target.value)}
                  className="h-7 text-xs px-2"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsRescheduling(false)}
                className="h-7 px-2 text-[11px]"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmarRemarcacao}
                disabled={!novaData || isBusy}
                className="h-7 px-3 text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white"
              >
                Salvar Nova Data
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-center font-medium text-muted-foreground">
              O paciente compareceu à clínica para a avaliação?
            </p>

            {/* Botões de Ação Imediata */}
            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleAction("faltou")}
                disabled={isBusy}
                className="h-9 text-xs font-bold gap-1 border-red-500/50 text-red-700 dark:text-red-300 hover:bg-red-500/10 shadow-xs px-2"
              >
                <XCircle size={14} weight="bold" />
                Faltou
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsRescheduling(true);
                  setShowSnoozeMenu(false);
                }}
                disabled={isBusy}
                className="h-9 text-xs font-bold gap-1 border-sky-500/50 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 shadow-xs px-2"
              >
                <ArrowsClockwise size={14} weight="bold" />
                Remarcar
              </Button>

              <Button
                type="button"
                onClick={() => handleAction("compareceu")}
                disabled={isBusy}
                className="h-9 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs px-2"
              >
                <CheckCircle size={14} weight="bold" />
                Compareceu
              </Button>
            </div>
          </>
        )}

        {/* Navegação entre múltiplos leads pendentes */}
        {pendingLeads.length > 1 && (
          <div className="flex items-center justify-between border-t border-border/40 pt-1 text-[10px] text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setCurrentIndex((prev) => (prev > 0 ? prev - 1 : pendingLeads.length - 1));
                setIsRescheduling(false);
                setShowSnoozeMenu(false);
              }}
              className="hover:text-foreground font-medium underline-offset-2 hover:underline"
            >
              ← Anterior
            </button>
            <span>Outras consultas pendentes</span>
            <button
              type="button"
              onClick={() => {
                setCurrentIndex((prev) => (prev < pendingLeads.length - 1 ? prev + 1 : 0));
                setIsRescheduling(false);
                setShowSnoozeMenu(false);
              }}
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

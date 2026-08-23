"use client";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Bell, Trash, Clock, WhatsappLogo, Warning, Plus } from "@/lib/ui/icons";
import {
  useReminderConfig,
  useSaveReminderConfig,
  useDeleteReminderConfig,
  type ReminderConfig,
  type ReminderScheduleItem,
  type SaveReminderConfigInput,
} from "@/hooks/pipelines/useReminderConfig";
import { useTemplates, type TemplateView } from "@/hooks/channels/useTemplates";
import { useBoard } from "@/hooks/kanban/useBoard";
import type { Stage } from "@/lib/kanban/types";

interface ReminderConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  /** Etapas do pipeline. Se não fornecidas, serão buscadas automaticamente. */
  stages?: Stage[];
}

const OFFSET_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "1 hora antes" },
  { value: 2, label: "2 horas antes" },
  { value: 4, label: "4 horas antes" },
  { value: 24, label: "24 horas antes (1 dia)" },
  { value: 48, label: "48 horas antes (2 dias)" },
];

/** Renderiza o texto do template com variáveis destacadas */
function TemplatePreview({ text }: { text: string }) {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      {parts.map((part, i) =>
        /^{{[^}]+}}$/.test(part) ? (
          <span
            key={i}
            className="inline-flex items-center rounded px-1 py-0.5 text-[11px] font-mono bg-primary/10 text-primary font-medium"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

interface FormProps {
  pipelineId: string;
  existingConfig: ReminderConfig | null;
  stages: Stage[];
  templates: TemplateView[];
  hasChannel: boolean;
  loadingTemplates: boolean;
  onClose: () => void;
}

function ReminderConfigForm({
  pipelineId,
  existingConfig,
  stages,
  templates,
  hasChannel,
  loadingTemplates,
  onClose,
}: FormProps) {
  const saveConfig = useSaveReminderConfig(pipelineId);
  const deleteConfig = useDeleteReminderConfig(pipelineId);

  const [isActive, setIsActive] = useState(existingConfig ? existingConfig.is_active : true);

  // Inicializa lista de horários
  const initialSchedules: ReminderScheduleItem[] =
    existingConfig?.schedules && existingConfig.schedules.length > 0
      ? existingConfig.schedules
      : existingConfig?.template_name
        ? [
            {
              id: "legacy",
              offset_hours: existingConfig.offset_hours ?? 2,
              template_name: existingConfig.template_name,
              template_language: existingConfig.template_language ?? "pt_BR",
              is_active: true,
            },
          ]
        : [
            {
              id: "sched_24h",
              offset_hours: 24,
              template_name: "",
              template_language: "pt_BR",
              is_active: true,
            },
            {
              id: "sched_2h",
              offset_hours: 2,
              template_name: "",
              template_language: "pt_BR",
              is_active: true,
            },
          ];

  const [schedules, setSchedules] = useState<ReminderScheduleItem[]>(initialSchedules);
  const [activeStageIds, setActiveStageIds] = useState<string[]>(existingConfig ? existingConfig.active_stage_ids : []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function addSchedule() {
    const newId = `sched_${Date.now()}`;
    const defaultOffset = schedules.some((s) => s.offset_hours === 2) ? 1 : 2;
    setSchedules((prev) => [
      ...prev,
      {
        id: newId,
        offset_hours: defaultOffset,
        template_name: "",
        template_language: "pt_BR",
        is_active: true,
      },
    ]);
  }

  function removeSchedule(id: string) {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSchedule(id: string, patch: Partial<ReminderScheduleItem>) {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  function toggleStage(stageId: string) {
    setActiveStageIds((prev) =>
      prev.includes(stageId)
        ? prev.filter((id) => id !== stageId)
        : [...prev, stageId],
    );
  }

  async function handleSave() {
    const activeSchedules = schedules.filter((s) => s.is_active);
    if (activeSchedules.length === 0) {
      toast.error("Adicione pelo menos um horário de lembrete ativo.");
      return;
    }

    for (const s of activeSchedules) {
      if (!s.template_name) {
        toast.error(`Selecione um template para o lembrete de ${s.offset_hours}h.`);
        return;
      }
    }

    const input: SaveReminderConfigInput = {
      is_active: isActive,
      schedules,
      active_stage_ids: activeStageIds,
    };

    saveConfig.mutate(input, {
      onSuccess: () => {
        toast.success("Configuração de lembretes salva com sucesso!");
        onClose();
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : "Erro ao salvar lembretes.",
        );
      },
    });
  }

  async function handleDelete() {
    deleteConfig.mutate(undefined, {
      onSuccess: () => {
        toast.success("Lembretes removidos do funil.");
        onClose();
        setConfirmDelete(false);
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : "Erro ao remover lembretes.",
        );
      },
    });
  }

  const isBusy = saveConfig.isPending || deleteConfig.isPending;
  const hasConfig = !!existingConfig;

  return (
    <>
      <div className="flex flex-col gap-5 py-2">
        {/* Status geral ativo */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Lembretes do funil ativados</p>
            <p className="text-xs text-muted-foreground">
              Quando desativado, nenhum disparo será executado.
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={isBusy}
            aria-label="Ativar lembretes do funil"
          />
        </div>

        {/* Lista de horários configurados */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock size={15} className="text-primary" />
              Horários de Disparo & Mensagens
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSchedule}
              disabled={isBusy}
              className="h-8 gap-1.5 text-xs"
            >
              <Plus size={13} /> Adicionar Horário
            </Button>
          </div>

          {!hasChannel && !loadingTemplates && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <Warning size={14} />
              Canal WhatsApp não conectado. Conecte no menu Canais para sincronizar seus templates.
            </div>
          )}

          {schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded-lg text-center text-muted-foreground gap-2">
              <p className="text-xs">Nenhum horário de lembrete cadastrado.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addSchedule}
                className="gap-1 text-xs"
              >
                <Plus size={13} /> Adicionar primeiro horário
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {schedules.map((schedule, idx) => {
                const selectedTemplate = templates.find((t) => t.name === schedule.template_name);
                const previews = selectedTemplate?.previews ?? [];

                return (
                  <Card key={schedule.id} className="p-3.5 flex flex-col gap-3 border-border bg-card/60">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-medium">
                          Lembrete {schedule.offset_hours}h antes
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <span>{schedule.is_active ? "Ativo" : "Inativo"}</span>
                          <Switch
                            checked={schedule.is_active}
                            onCheckedChange={(checked) => updateSchedule(schedule.id, { is_active: checked })}
                            disabled={isBusy}
                          />
                        </label>
                        {schedules.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => removeSchedule(schedule.id)}
                            disabled={isBusy}
                            aria-label="Remover horário"
                          >
                            <Trash size={13} />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Antecedência */}
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                          Antecedência
                        </Label>
                        <Select
                          value={String(schedule.offset_hours)}
                          onValueChange={(val) => updateSchedule(schedule.id, { offset_hours: Number(val) })}
                          disabled={isBusy}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {OFFSET_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Template */}
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                          Template WhatsApp (Meta)
                        </Label>
                        <Select
                          value={schedule.template_name}
                          onValueChange={(val) => {
                            const found = templates.find((t) => t.name === val);
                            updateSchedule(schedule.id, {
                              template_name: val,
                              template_language: found?.language ?? "pt_BR",
                            });
                          }}
                          disabled={isBusy || loadingTemplates || !hasChannel}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue
                              placeholder={
                                loadingTemplates
                                  ? "Carregando…"
                                  : templates.length === 0
                                    ? "Sem templates"
                                    : "Escolher template"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {templates
                              .filter((t) => t.status === "APPROVED")
                              .map((t) => (
                                <SelectItem key={t.name} value={t.name} className="text-xs">
                                  <span className="flex items-center gap-1.5">
                                    {t.name}
                                    <Badge variant="secondary" className="text-[9px] py-0 px-1">
                                      {t.language}
                                    </Badge>
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Preview do template */}
                    {selectedTemplate && previews.length > 0 && (
                      <div className="rounded border border-border/70 bg-muted/40 p-2.5 flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          <span>Prévia da mensagem</span>
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <WhatsappLogo size={12} /> Aprovado
                          </span>
                        </div>
                        {previews.map((prev, i) => (
                          <TemplatePreview key={i} text={prev.text} />
                        ))}
                        <p className="text-[10px] text-muted-foreground border-t border-border/50 pt-1 mt-0.5">
                          <strong>{"{{1}}"}</strong> = Nome do paciente • <strong>{"{{2}}"}</strong> = Data e horário
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Etapas ativas */}
        {stages.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              Etapas onde os lembretes estão ativos
            </Label>
            <p className="text-xs text-muted-foreground">
              Deixe desmarcado para disparar em todas as etapas do funil.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-md border border-border p-3 max-h-36 overflow-y-auto">
              {stages.map((stage) => (
                <label
                  key={stage.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    id={`stage-${stage.id}`}
                    checked={activeStageIds.includes(stage.id)}
                    onChange={() => toggleStage(stage.id)}
                    disabled={isBusy}
                    className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                  />
                  <span>{stage.name}</span>
                </label>
              ))}
            </div>
            {activeStageIds.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Lembretes ativos em todas as etapas do funil.
              </p>
            )}
          </div>
        )}

        {/* Confirmação de exclusão */}
        {confirmDelete && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
            <p className="text-sm font-medium text-destructive">
              Tem certeza que deseja remover todos os lembretes deste funil?
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isBusy}
              >
                <Trash size={13} className="mr-1.5" />
                Confirmar remoção
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                disabled={isBusy}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-2">
        <div>
          {hasConfig && !confirmDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
              onClick={() => setConfirmDelete(true)}
              disabled={isBusy}
            >
              <Trash size={13} />
              Remover lembretes
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isBusy || confirmDelete}
          >
            {saveConfig.isPending ? "Salvando…" : hasConfig ? "Salvar alterações" : "Salvar lembretes"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

export function ReminderConfigDialog({
  open,
  onOpenChange,
  pipelineId,
  stages: stagesProp,
}: ReminderConfigDialogProps) {
  const { data: existingConfig, isLoading } = useReminderConfig(
    open ? pipelineId : null,
  );
  const { data: templatesPayload, isLoading: loadingTemplates } = useTemplates();
  const { data: boardData } = useBoard(stagesProp === undefined && open ? pipelineId : null);
  const stages: Stage[] = stagesProp ?? boardData?.stages ?? [];

  const templates = templatesPayload?.data?.templates ?? [];
  const hasChannel = templatesPayload?.data?.waba !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell size={18} weight="duotone" className="text-primary" />
            Lembretes de Consulta Automáticos
          </DialogTitle>
          <DialogDescription>
            Configure múltiplos horários de lembrete (ex: 24h e 2h antes) com mensagens personalizadas. O sistema dispara automaticamente via WhatsApp para todos os leads com consulta agendada.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            Carregando configuração…
          </div>
        ) : (
          <ReminderConfigForm
            key={open ? (existingConfig?.id ?? "new") : "closed"}
            pipelineId={pipelineId}
            existingConfig={existingConfig ?? null}
            stages={stages}
            templates={templates}
            hasChannel={hasChannel}
            loadingTemplates={loadingTemplates}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

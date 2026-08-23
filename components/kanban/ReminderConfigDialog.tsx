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
import { Bell, Trash, Clock, WhatsappLogo, Warning } from "@/lib/ui/icons";
import {
  useReminderConfig,
  useSaveReminderConfig,
  useDeleteReminderConfig,
  type ReminderConfig,
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

const OFFSET_OPTIONS: { value: 1 | 2 | 4 | 24; label: string }[] = [
  { value: 1, label: "1 hora antes" },
  { value: 2, label: "2 horas antes" },
  { value: 4, label: "4 horas antes" },
  { value: 24, label: "24 horas antes (1 dia)" },
];

/** Renderiza o texto do template com variáveis destacadas */
function TemplatePreview({ text }: { text: string }) {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <p className="text-sm text-muted-foreground leading-relaxed">
      {parts.map((part, i) =>
        /^{{[^}]+}}$/.test(part) ? (
          <span
            key={i}
            className="inline-flex items-center rounded px-1 py-0.5 text-xs font-mono bg-primary/10 text-primary font-medium"
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
  const [offsetHours, setOffsetHours] = useState<1 | 2 | 4 | 24>(existingConfig ? existingConfig.offset_hours : 2);
  const [templateName, setTemplateName] = useState(existingConfig ? existingConfig.template_name : "");
  const [templateLanguage, setTemplateLanguage] = useState(existingConfig ? existingConfig.template_language : "pt_BR");
  const [activeStageIds, setActiveStageIds] = useState<string[]>(existingConfig ? existingConfig.active_stage_ids : []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedTemplate = templates.find((t) => t.name === templateName);
  const templatePreviews = selectedTemplate?.previews ?? [];

  function toggleStage(stageId: string) {
    setActiveStageIds((prev) =>
      prev.includes(stageId)
        ? prev.filter((id) => id !== stageId)
        : [...prev, stageId],
    );
  }

  async function handleSave() {
    if (!templateName) {
      toast.error("Selecione um template de mensagem.");
      return;
    }
    const input: SaveReminderConfigInput = {
      is_active: isActive,
      offset_hours: offsetHours,
      template_name: templateName,
      template_language: templateLanguage,
      active_stage_ids: activeStageIds,
    };
    saveConfig.mutate(input, {
      onSuccess: () => {
        toast.success("Lembrete de agendamento salvo com sucesso!");
        onClose();
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : "Erro ao salvar lembrete.",
        );
      },
    });
  }

  async function handleDelete() {
    deleteConfig.mutate(undefined, {
      onSuccess: () => {
        toast.success("Lembrete removido.");
        onClose();
        setConfirmDelete(false);
      },
      onError: (err) => {
        toast.error(
          err instanceof Error ? err.message : "Erro ao remover lembrete.",
        );
      },
    });
  }

  const isBusy = saveConfig.isPending || deleteConfig.isPending;
  const hasConfig = !!existingConfig;

  return (
    <>
      <div className="flex flex-col gap-5 py-2">
        {/* Status ativo */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Lembrete ativo</p>
            <p className="text-xs text-muted-foreground">
              Quando desativado, nenhum lembrete é enviado.
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={isBusy}
            aria-label="Ativar lembrete"
          />
        </div>

        {/* Antecedência */}
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Clock size={14} className="text-muted-foreground" />
            Antecedência do lembrete
          </Label>
          <Select
            value={String(offsetHours)}
            onValueChange={(v) => setOffsetHours(Number(v) as 1 | 2 | 4 | 24)}
            disabled={isBusy}
          >
            <SelectTrigger id="offset-hours">
              <SelectValue placeholder="Selecione a antecedência" />
            </SelectTrigger>
            <SelectContent>
              {OFFSET_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Template */}
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <WhatsappLogo size={14} className="text-muted-foreground" />
            Mensagem (template Meta)
          </Label>

          {!hasChannel && !loadingTemplates && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <Warning size={14} />
              Canal WhatsApp Business não conectado. Conecte para usar
              templates.
            </div>
          )}

          <Select
            value={templateName}
            onValueChange={(val) => {
              setTemplateName(val);
              const found = templates.find((t) => t.name === val);
              if (found) setTemplateLanguage(found.language);
            }}
            disabled={isBusy || loadingTemplates || !hasChannel}
          >
            <SelectTrigger id="template-name">
              <SelectValue
                placeholder={
                  loadingTemplates
                    ? "Carregando templates…"
                    : templates.length === 0
                      ? "Nenhum template disponível"
                      : "Selecione um template"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {templates
                .filter((t) => t.status === "APPROVED")
                .map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    <span className="flex items-center gap-2">
                      {t.name}
                      <Badge variant="secondary" className="text-[10px]">
                        {t.language}
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Preview do template selecionado */}
          {selectedTemplate && templatePreviews.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Pré-visualização
              </p>
              {templatePreviews.map((preview, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {preview.onde}
                  </span>
                  <TemplatePreview text={preview.text} />
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground border-t border-border pt-2 mt-1">
                <strong>{"{{1}}"}</strong> = Nome do paciente •{" "}
                <strong>{"{{2}}"}</strong> = Data/hora do agendamento
              </p>
            </div>
          )}
        </div>

        {/* Etapas ativas */}
        {stages.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">
              Etapas onde o lembrete está ativo
            </Label>
            <p className="text-xs text-muted-foreground">
              Sem seleção = todas as etapas do funil.
            </p>
            <div className="grid grid-cols-1 gap-1.5 rounded-md border border-border p-3 max-h-44 overflow-y-auto">
              {stages.map((stage) => (
                <label
                  key={stage.id}
                  className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/50 rounded px-1 py-1"
                >
                  <input
                    type="checkbox"
                    id={`stage-${stage.id}`}
                    checked={activeStageIds.includes(stage.id)}
                    onChange={() => toggleStage(stage.id)}
                    disabled={isBusy}
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                  />
                  <span className="text-sm">{stage.name}</span>
                </label>
              ))}
            </div>
            {activeStageIds.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Nenhuma selecionada — lembrete ativo em todas as etapas.
              </p>
            )}
          </div>
        )}

        {/* Painel de confirmação de exclusão */}
        {confirmDelete && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
            <p className="text-sm font-medium text-destructive">
              Tem certeza que deseja remover o lembrete?
            </p>
            <p className="text-xs text-muted-foreground">
              A configuração será excluída e nenhum lembrete será mais
              enviado para este funil.
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
              Remover lembrete
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
            disabled={isBusy || !templateName || confirmDelete}
          >
            {saveConfig.isPending ? "Salvando…" : hasConfig ? "Salvar alterações" : "Ativar lembrete"}
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell size={18} weight="duotone" className="text-primary" />
            Lembrete de Agendamento
          </DialogTitle>
          <DialogDescription>
            Envia automaticamente uma mensagem WhatsApp para leads com consulta
            agendada. O lembrete é enviado com antecedência configurável, usando
            os campos <strong>Data</strong> e <strong>Hora</strong> do
            agendamento do lead.
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

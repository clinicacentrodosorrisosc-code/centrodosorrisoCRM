"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_CARD_LAYOUT,
  cardLayoutLabel,
  cardLayoutOptions,
  readCardLayout,
  type CardLayout,
  type CardLayoutField,
} from "@/lib/kanban/card-layout";
import type { BoardData } from "@/lib/kanban/types";

interface CustomFieldDef {
  key: string;
  label: string;
}

function readCustomFields(settings: Record<string, unknown>): CustomFieldDef[] {
  const raw = settings.fields;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (field): field is CustomFieldDef =>
      !!field &&
      typeof field === "object" &&
      typeof (field as CustomFieldDef).key === "string" &&
      typeof (field as CustomFieldDef).label === "string",
  );
}

export function CardLayoutDialog({
  open,
  onOpenChange,
  pipelineId,
  pipelineName,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  pipelineName: string;
  settings: Record<string, unknown>;
}) {
  const qc = useQueryClient();
  const initial = useMemo(() => readCardLayout(settings), [settings]);
  const options = useMemo(() => cardLayoutOptions(readCustomFields(settings)), [settings]);
  const [slots, setSlots] = useState<Array<CardLayoutField | null>>([
    ...initial.slots,
    ...Array(Math.max(0, 6 - initial.slots.length)).fill(null),
  ]);
  const [applyAll, setApplyAll] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = new Set(slots.filter((slot): slot is CardLayoutField => slot !== null));

  function close() {
    setSlots([...initial.slots, ...Array(Math.max(0, 6 - initial.slots.length)).fill(null)]);
    setApplyAll(false);
    onOpenChange(false);
  }
  function changeSlot(index: number, value: string) {
    setSlots((current) => {
      const next = [...current];
      next[index] = value === "empty" ? null : (value as CardLayoutField);
      return next;
    });
  }

  function save() {
    const layout: CardLayout = {
      slots: slots.filter((slot): slot is CardLayoutField => slot !== null),
    };
    startTransition(async () => {
      const result = await updatePipelineConfig(
        pipelineId,
        { card_layout: layout },
        { applyCardLayoutToAll: applyAll },
      );
      if (!result.ok) {
        toast.error(`Não foi possível salvar: ${result.error}`);
        return;
      }
      qc.setQueryData<BoardData>(["board", pipelineId], (current) =>
        current
          ? {
              ...current,
              pipeline: {
                ...current.pipeline,
                settings: { ...current.pipeline.settings, card_layout: layout },
              },
            }
          : current,
      );
      toast.success(applyAll ? "Layout aplicado a todos os funis." : "Layout do card atualizado.");
      setApplyAll(false);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Layout do card</DialogTitle>
          <DialogDescription>
            Escolha o conteúdo de cada espaço em «{pipelineName}». Campos sem valor não ocupam
            espaço no card.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(event) => setApplyAll(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Aplicar este layout a todos os funis
        </label>

        <div className="grid gap-4 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-2">
            {slots.map((slot, index) => (
              <div key={index} className="grid grid-cols-[5rem_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">Espaço {index + 1}</span>
                <Select value={slot ?? "empty"} onValueChange={(value) => changeSlot(index, value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empty">Não exibir</SelectItem>
                    {options.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={selected.has(option.value) && option.value !== slot}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="bg-muted/30 rounded-lg border p-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Prévia do card</p>
            <div className="rounded-md border bg-background p-2 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Nome do lead</span>
                <span className="text-[10px] text-muted-foreground">•••</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {slots
                  .filter((slot): slot is CardLayoutField => slot !== null)
                  .map((slot) => (
                    <span
                      key={slot}
                      className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                    >
                      {cardLayoutLabel(slot, options)}
                    </span>
                  ))}
                {slots.every((slot) => slot === null) && (
                  <span className="text-[9px] text-muted-foreground">
                    Somente o nome será exibido.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          O nome e o menu de ações são fixos. Até seis espaços opcionais podem ser configurados.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => setSlots([...DEFAULT_CARD_LAYOUT.slots])}
            disabled={pending}
          >
            Restaurar padrão
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

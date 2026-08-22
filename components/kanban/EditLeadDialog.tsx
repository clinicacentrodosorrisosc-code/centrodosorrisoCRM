"use client";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import type { Lead } from "@/lib/types/leads";
import { updateLeadSchema, type UpdateLeadInput } from "@/lib/schemas/leads";
import { parseReaisToCents } from "@/lib/money";
import { EcoDoValor } from "./EcoDoValor";
import { FONTES_SUGERIDAS, PROCEDIMENTOS_SUGERIDOS } from "./LeadFieldsForm";
import { DeleteLeadDialog } from "./DeleteLeadDialog";
import { Trash } from "@/lib/ui/icons";

interface FormShape {
  title: string;
  description: string;
  source: string;
  procedimento: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
}

function centsToReais(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function EditLeadDialog({ open, onOpenChange, lead, pipelineId }: Props) {
  const edit = useEditLead(pipelineId);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const customFields = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const initialProcedimento = String(customFields.procedimento ?? customFields.procedure ?? "");

  const form = useForm<FormShape>({
    defaultValues: {
      title: lead.title,
      description: lead.description ?? "",
      source: lead.source ?? "WhatsApp",
      procedimento: initialProcedimento,
      valueReais: centsToReais(lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      const curCustom = (lead.custom_fields ?? {}) as Record<string, unknown>;
      form.reset({
        title: lead.title,
        description: lead.description ?? "",
        source: lead.source ?? "WhatsApp",
        procedimento: String(curCustom.procedimento ?? curCustom.procedure ?? ""),
        valueReais: centsToReais(lead.value_cents),
        tagsRaw: (lead.tags ?? []).join(", "),
        expected_close_date: lead.expected_close_date ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id]);

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const reais = values.valueReais.trim();
    let valueCents: number | null = null;
    if (reais.length > 0) {
      valueCents = parseReaisToCents(reais);
      if (valueCents === null) {
        form.setError("valueReais", { message: "Valor inválido" });
        return;
      }
    }

    const patch: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      source: values.source.trim() || "WhatsApp",
      custom_fields: {
        ...(lead.custom_fields ?? {}),
        procedimento: values.procedimento.trim() || null,
      },
      value_cents: valueCents,
      tags,
      expected_close_date: values.expected_close_date || null,
    };

    const parsed = updateLeadSchema.safeParse(patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Dados inválidos");
      return;
    }

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: parsed.data as UpdateLeadInput,
      });
      toast.success("Lead atualizado com sucesso");
      onOpenChange(false);
    } catch {
      // toast already shown
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar lead</DialogTitle>
          <DialogDescription>
            Atualize os campos do lead.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-xs font-medium">Título</Label>
            <Input
              id="title"
              className="h-8 text-xs"
              {...form.register("title", { required: true, minLength: 2 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-source" className="text-xs font-medium">Fonte (Origem)</Label>
              <Input
                id="edit-source"
                list="edit-fontes-list"
                className="h-8 text-xs"
                placeholder="Ex: WhatsApp, Instagram..."
                {...form.register("source")}
              />
              <datalist id="edit-fontes-list">
                {FONTES_SUGERIDAS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-procedimento" className="text-xs font-medium">Procedimento</Label>
              <Input
                id="edit-procedimento"
                list="edit-procedimentos-list"
                className="h-8 text-xs"
                placeholder="Ex: Clareamento, Alinhador..."
                {...form.register("procedimento")}
              />
              <datalist id="edit-procedimentos-list">
                {PROCEDIMENTOS_SUGERIDOS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valueReais" className="text-xs font-medium">Valor (R$)</Label>
              <Input
                id="valueReais"
                inputMode="decimal"
                placeholder="0,00"
                className="h-8 text-xs"
                {...form.register("valueReais")}
              />
              <EcoDoValor control={form.control} />
              {form.formState.errors.valueReais && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.valueReais.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expected_close_date" className="text-xs font-medium">Fechamento previsto</Label>
              <Input
                id="expected_close_date"
                type="date"
                className="h-8 text-xs"
                {...form.register("expected_close_date")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tagsRaw" className="text-xs font-medium">Tags (separadas por vírgula)</Label>
            <Input id="tagsRaw" className="h-8 text-xs" placeholder="vip, recompra" {...form.register("tagsRaw")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs font-medium">Descrição</Label>
            <Textarea id="description" rows={2} className="text-xs" {...form.register("description")} />
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
            >
              <Trash size={14} /> Excluir lead
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={edit.isPending}
                className="h-8 text-xs"
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={edit.isPending} className="h-8 text-xs">
                {edit.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>

      <DeleteLeadDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        leadId={lead.id}
        leadTitle={lead.title}
        pipelineId={pipelineId}
        onSuccess={() => onOpenChange(false)}
      />
    </Dialog>
  );
}


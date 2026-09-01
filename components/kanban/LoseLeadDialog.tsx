"use client";
import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLoseLead } from "@/hooks/kanban/useUpdateLead";
import { CANONICAL_LOST_REASONS } from "@/lib/schemas/leads";
import { useBoard } from "@/hooks/kanban/useBoard";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";

const REASON_LABELS: Record<(typeof CANONICAL_LOST_REASONS)[number], string> = {
  requested_by_customer: "Cliente solicitou cancelamento",
  price: "Preço",
  no_response: "Sem resposta do cliente",
  product_unavailable: "Produto indisponível",
  cancelled_by_store: "Cancelado pela loja",
  cancelled_by_customer: "Cancelado pelo cliente",
  payment_failed: "Falha no pagamento",
  other: "Outro motivo",
};

interface LoseLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  pipelineId: string;
}

const MAX_LEN = 500;

export function LoseLeadDialog({
  open,
  onOpenChange,
  leadId,
  pipelineId,
}: LoseLeadDialogProps) {
  const [reasonCode, setReasonCode] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const [newReason, setNewReason] = useState("");
  const [savingReason, setSavingReason] = useState(false);
  const mutation = useLoseLead(pipelineId);
  const board = useBoard(pipelineId);
  const customReasons = useMemo(() => {
    const raw = board.data?.pipeline.settings?.lost_reasons;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  }, [board.data?.pipeline.settings]);

  const finalReason = reasonCode === "other" ? otherText.trim() || "other" : reasonCode;
  const disabled = !reasonCode || finalReason.length === 0 || finalReason.length > MAX_LEN || mutation.isPending;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      await mutation.mutateAsync({ leadId, lostReason: finalReason });
      setReasonCode("");
      setOtherText("");
      onOpenChange(false);
    } catch {
      // error already toasted
    }
  };

  const handleAddReason = async () => {
    const reason = newReason.trim();
    if (!reason || customReasons.some((item) => item.toLowerCase() === reason.toLowerCase())) return;
    setSavingReason(true);
    try {
      const result = await updatePipelineConfig(pipelineId, { lost_reasons: [...customReasons, reason] });
      if (!result.ok) throw new Error(result.error);
      await board.refetch();
      setReasonCode(reason);
      setNewReason("");
      toast.success("Motivo de perda salvo.");
    } catch {
      toast.error("Não foi possível salvar o novo motivo.");
    } finally {
      setSavingReason(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <DialogHeader className="shrink-0">
          <DialogTitle>Marcar como perdido</DialogTitle>
          <DialogDescription>
            Informe o motivo. Essa informação ajuda a melhorar o funil.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto pr-1">
          <Label>Motivo</Label>
          <div className="grid grid-cols-1 gap-1.5">
            {CANONICAL_LOST_REASONS.map((code) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <input
                  type="radio"
                  name="lost-reason"
                  value={code}
                  checked={reasonCode === code}
                  onChange={(e) => setReasonCode(e.target.value)}
                />
                <span>{REASON_LABELS[code]}</span>
              </label>
            ))}
            {customReasons.map((reason) => (
              <label key={reason} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                <input type="radio" name="lost-reason" value={reason} checked={reasonCode === reason} onChange={(event) => setReasonCode(event.target.value)} />
                <span>{reason}</span>
              </label>
            ))}
          </div>
          {reasonCode === "other" && (
            <div className="grid gap-1.5">
              <Label htmlFor="lost-reason-other">Detalhe (opcional)</Label>
              <Textarea
                id="lost-reason-other"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="Ex: Cliente desistiu por X motivo"
                maxLength={MAX_LEN}
                rows={3}
              />
              <div className="text-right text-[11px] text-muted-foreground tabular-nums">
                {otherText.length}/{MAX_LEN}
              </div>
            </div>
          )}
          <div className="grid gap-1.5 rounded-md border border-dashed p-3">
            <Label htmlFor="new-lost-reason">Adicionar novo motivo</Label>
            <div className="flex gap-2">
              <Input id="new-lost-reason" value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder="Ex: Escolheu outra clínica" maxLength={80} />
              <Button type="button" variant="outline" onClick={handleAddReason} disabled={!newReason.trim() || savingReason}>{savingReason ? "Salvando..." : "Adicionar"}</Button>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t pt-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={disabled}>
            {mutation.isPending ? "Salvando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

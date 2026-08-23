"use client";
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FlowArrow, Plus, Clock, ArrowsClockwise } from "@/lib/ui/icons";
import { useFollowupFlows, type FollowupFlowPointerRow } from "@/hooks/followup/useFollowupFlows";
import { apiClient } from "@/lib/api/client";
import { FlowStatusBadge } from "./FlowStatusBadge";
import { NewFlowDialog } from "./NewFlowDialog";

interface Props {
  initialData: FollowupFlowPointerRow[];
  canWrite: boolean;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function FlowsList({ initialData, canWrite }: Props) {
  const qc = useQueryClient();
  const { data } = useFollowupFlows({ initialData });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isRecreating, setIsRecreating] = useState(false);

  const flows = data ?? [];

  const handleRecreate2hReminder = async () => {
    setIsRecreating(true);
    try {
      const res = await apiClient.post<{ success: boolean; message: string }>("/api/v1/ai/followup-flows/recreate-2h-reminder", {});
      toast.success(res.message || "Fluxo de lembrete de 2h antes recriado e publicado com sucesso!");
      qc.invalidateQueries({ queryKey: ["followup_flows"] });
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao recriar fluxo.");
    } finally {
      setIsRecreating(false);
    }
  };

  const actionButtons = (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        onClick={handleRecreate2hReminder}
        disabled={isRecreating}
        className="gap-1.5"
      >
        <ArrowsClockwise size={14} className={isRecreating ? "animate-spin" : ""} />
        {isRecreating ? "Criando fluxo..." : "Criar Lembrete (2h antes)"}
      </Button>
      <Button onClick={() => setDialogOpen(true)}>
        <Plus size={14} aria-hidden className="mr-2" /> Novo fluxo
      </Button>
    </div>
  );

  if (flows.length === 0) {
    return (
      <>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FlowArrow size={36} aria-hidden className="text-text-muted" />
          <h2 className="font-medium">Nenhum fluxo de follow-up ainda</h2>
          <p className="max-w-sm text-sm text-text-muted">
            Follow-ups reengajam contatos automaticamente após silêncio, mudança de
            etapa ou fim de conversa — sem depender de alguém lembrar de mandar mensagem.
          </p>
          {canWrite && <div className="mt-1">{actionButtons}</div>}
        </Card>
        {canWrite && <NewFlowDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex justify-end">{actionButtons}</div>
      )}


      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {flows.map((flow) => (
          <li key={flow.id}>
            <Link href={`/app/ai/followups/${flow.id}`} className="block h-full">
              <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-accent-400">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-medium" title={flow.name}>
                    {flow.name}
                  </h3>
                  <FlowStatusBadge status={flow.status} />
                </div>
                <dl className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <dt className="text-text-muted">Versão</dt>
                    <dd className="font-mono">{flow.active_version_id ? "publicada" : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Handoff</dt>
                    <dd className="font-mono">{flow.handoff_policy}</dd>
                  </div>
                </dl>
                <p className="mt-auto pt-2 text-xs text-text-muted">
                  Atualizado em {formatUpdatedAt(flow.updated_at)}
                </p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {canWrite && <NewFlowDialog open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  );
}

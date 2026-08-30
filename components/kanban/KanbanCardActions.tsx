"use client";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Bell, DotsThree, PencilSimple, Trash, Users, FlowArrow } from "@/lib/ui/icons";
import { useWinLead, useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useAssignableAgents } from "@/hooks/kanban/useAssignableAgents";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { LoseLeadDialog } from "./LoseLeadDialog";
import { EditLeadDialog } from "./EditLeadDialog";
import { DeleteLeadDialog } from "./DeleteLeadDialog";
import { ReminderConfigDialog } from "./ReminderConfigDialog";
import type { Lead } from "@/lib/types/leads";

interface KanbanCardActionsProps {
  lead: Lead;
  pipelineId: string;
  stages?: Array<{ id: string; name: string }>;
}

export function KanbanCardActions({ lead, pipelineId, stages = [] }: KanbanCardActionsProps) {
  const [loseOpen, setLoseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string }>>([]);
  const [targetStages, setTargetStages] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const winMutation = useWinLead(pipelineId);
  const editMutation = useEditLead(pipelineId);
  const moveMutation = useMoveCard(pipelineId);
  useEffect(() => { fetch("/api/v1/pipelines").then((r) => r.json()).then((r) => setPipelines(r.data?.pipelines ?? r.data ?? [])).catch(() => setPipelines([])); }, []);
  const loadStages = (id: string) => { if (targetStages[id]) return; fetch(`/api/v1/pipelines/${id}/board`).then((r) => r.json()).then((r) => setTargetStages((v) => ({ ...v, [id]: r.data?.stages ?? [] }))).catch(() => undefined); };
  // spec 13 §4: escrita no funil é agent+ — viewer não reatribui (a rota
  // PATCH também recusa; aqui é só não oferecer o que seria negado).
  const canAssign = usePermission("pipeline.move_card");
  const { data: members } = useAssignableMembers(canAssign);
  // A rota já devolve só agente ativo e não arquivado — é o picker.
  const { data: agents } = useAssignableAgents(canAssign);

  const reassignToUser = (ownerUserId: string | null) => {
    if (ownerUserId === lead.owner_user_id) return;
    editMutation.mutate({ leadId: lead.id, patch: { owner_user_id: ownerUserId } });
  };

  /** Transferir para um agente: o handler zera o dono humano e deriva owner_kind. */
  const reassignToAgent = (agentId: string) => {
    if (agentId === lead.owner_agent_id) return;
    editMutation.mutate({ leadId: lead.id, patch: { owner_agent_id: agentId } });
  };

  const clearOwner = () => {
    if (lead.owner_user_id === null && lead.owner_agent_id === null) return;
    editMutation.mutate({
      leadId: lead.id,
      patch: lead.owner_agent_id ? { owner_agent_id: null } : { owner_user_id: null },
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
            aria-label="Ações do lead"
          >
            <DotsThree size={16} weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={() => {
              setEditOpen(true);
            }}
          >
            <PencilSimple size={14} className="mr-2" /> Editar
          </DropdownMenuItem>
          {canAssign && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Users size={14} className="mr-2" /> Responsável
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  disabled={
                    editMutation.isPending ||
                    (lead.owner_user_id === null && lead.owner_agent_id === null)
                  }
                  onSelect={clearOwner}
                >
                  Sem responsável
                </DropdownMenuItem>
                {(members ?? []).length > 0 && <DropdownMenuSeparator />}
                {(members ?? []).map((m) => (
                  <DropdownMenuItem
                    key={m.user_id}
                    disabled={editMutation.isPending || m.user_id === lead.owner_user_id}
                    onSelect={() => reassignToUser(m.user_id)}
                  >
                    {m.full_name ?? "Sem nome"}
                  </DropdownMenuItem>
                ))}
                {(agents ?? []).length > 0 && <DropdownMenuSeparator />}
                {(agents ?? []).map((a) => (
                  <DropdownMenuItem
                    key={a.agent_id}
                    disabled={editMutation.isPending || a.agent_id === lead.owner_agent_id}
                    onSelect={() => reassignToAgent(a.agent_id)}
                  >
                    {a.name}
                    {a.version_number != null && (
                      <span className="ml-1.5 font-mono text-[10px] text-text-muted">
                        v{a.version_number}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><FlowArrow size={14} className="mr-2" /> Mover para funil</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>{pipelines.map((pipeline) => <DropdownMenuSub key={pipeline.id}><DropdownMenuSubTrigger onPointerMove={() => loadStages(pipeline.id)}>{pipeline.name}</DropdownMenuSubTrigger><DropdownMenuSubContent>{(targetStages[pipeline.id] ?? []).map((stage) => <DropdownMenuItem key={stage.id} disabled={pipeline.id === pipelineId && stage.id === lead.stage_id || moveMutation.isPending} onSelect={() => moveMutation.mutate({ leadId: lead.id, pipelineId: pipeline.id, stageId: stage.id, positionInStage: 1000000, expectedUpdatedAt: lead.updated_at })}>{stage.name}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>)}</DropdownMenuSubContent>
          </DropdownMenuSub>
<DropdownMenuItem
            disabled={winMutation.isPending}
            onSelect={() => {
              winMutation.mutate({ leadId: lead.id });
            }}
          >
            Marcar como ganho
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setLoseOpen(true);
            }}
          >
            Marcar como perdido
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setReminderOpen(true);
            }}
          >
            <Bell size={14} className="mr-2" /> Lembrete de Consulta
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => {
              setDeleteOpen(true);
            }}
          >
            <Trash size={14} className="mr-2" /> Excluir lead
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LoseLeadDialog
        open={loseOpen}
        onOpenChange={setLoseOpen}
        leadId={lead.id}
        pipelineId={pipelineId}
      />
      <EditLeadDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        lead={lead}
        pipelineId={pipelineId}
      />
      <DeleteLeadDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        leadId={lead.id}
        leadTitle={lead.title}
        pipelineId={pipelineId}
      />
      <ReminderConfigDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        pipelineId={pipelineId}
        stages={[]} // As etapas são carregadas dentro do dialog
      />
    </>
  );
}


"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteLead } from "@/hooks/kanban/useUpdateLead";
import { toast } from "sonner";

interface DeleteLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadTitle: string;
  pipelineId: string;
  onSuccess?: () => void;
}

export function DeleteLeadDialog({
  open,
  onOpenChange,
  leadId,
  leadTitle,
  pipelineId,
  onSuccess,
}: DeleteLeadDialogProps) {
  const mutation = useDeleteLead(pipelineId);

  const handleDelete = async () => {
    try {
      await mutation.mutateAsync(leadId);
      toast.success(`Lead "${leadTitle}" excluído com sucesso.`);
      onOpenChange(false);
      onSuccess?.();
    } catch {
      // erro já exibido pelo hook
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o lead{" "}
            <strong className="text-foreground">"{leadTitle}"</strong> do funil?
            Esta ação removerá o negócio e suas configurações associadas permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? "Excluindo..." : "Sim, excluir lead"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

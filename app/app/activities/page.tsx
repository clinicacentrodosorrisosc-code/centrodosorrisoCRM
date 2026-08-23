import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ActivitiesClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  // Acessível para todos os membros ativos (viewer, agent, manager, admin)
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.viewer) {
    redirect("/403");
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Relatório de Atividades</h1>
        <p className="text-sm text-muted-foreground">
          Linha do tempo e métricas de tarefas concluídas, consultas atendidas, movimentações e ações realizadas.
        </p>
      </header>
      <ActivitiesClient />
    </div>
  );
}

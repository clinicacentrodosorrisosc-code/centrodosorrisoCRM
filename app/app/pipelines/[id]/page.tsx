import { notFound } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { PipelinePageClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) notFound();

  const podeConfigurarCard = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;
  const supabase = await createClient();
  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, name, vocabulary")
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (!pipeline) notFound();

  return (
    <PipelinePageClient
      pipelineId={id}
      initialName={pipeline.name}
      podeConfigurarCard={podeConfigurarCard}
    />
  );
}

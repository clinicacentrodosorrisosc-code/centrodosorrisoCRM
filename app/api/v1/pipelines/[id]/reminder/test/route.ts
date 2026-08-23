/**
 * POST /api/v1/pipelines/[id]/reminder/test
 *
 * Executa o processador de lembretes de agendamento imediatamente
 * e devolve o resumo detalhado do processamento para teste em tempo real.
 */
import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { processAppointmentReminders } from "@/lib/appointment-reminders/processor";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: pipelineId } = await params;

  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const summary = await processAppointmentReminders(admin);

    return ok({
      pipeline_id: pipelineId,
      summary,
    });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "Erro ao processar lembretes", 500);
  }
}

import { randomUUID } from "node:crypto";
import { after, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateCalendarEventSchema } from "@/lib/calendar/schemas";
import { syncGoogleConnection } from "@/lib/calendar/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { CalendarDomainError, updateCalendarEvent } from "@/lib/calendar/service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function mutate(req: NextRequest, id: string, cancel: boolean): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "calendar_event" });
  if (!authz.ok) return authz.response;
  const body = cancel ? { status: "cancelled" as const, reason: "Cancelado pelo Calendar" } : await req.json().catch(() => null);
  const parsed = updateCalendarEventSchema.safeParse(body);
  if (!parsed.success) return fail("validation_failed", "Alterações inválidas.", 422, { requestId });
  try {
    const event = await updateCalendarEvent(
      {
        db: await createClient(),
        organizationId: authz.org.orgId,
        actor: { type: "user", id: authz.user.id, userId: authz.user.id },
      },
      id,
      parsed.data,
    );
    if (event.connection_id) {
      after(() => syncGoogleConnection(createAdminClient(), authz.org.orgId, event.connection_id!).catch(() => undefined));
    }
    void audit({
      action: cancel || event.status === "cancelled" ? "calendar.event_cancelled" : "calendar.event_updated",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "calendar_event",
      resourceId: id,
      requestId,
    });
    return ok({ event }, { requestId });
  } catch (error) {
    if (error instanceof CalendarDomainError) {
      const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "invalid_reference" ? 422 : 500;
      return fail(error.code === "db_error" ? "db_error" : "validation_failed", error.message, status, { requestId });
    }
    return fail("internal_error", "Não foi possível alterar o agendamento.", 500, { requestId });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return mutate(req, (await context.params).id, false);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return mutate(req, (await context.params).id, true);
}

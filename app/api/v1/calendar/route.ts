import { randomUUID } from "node:crypto";
import { after, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { CalendarDomainError, createCalendarEvent, listCalendarEvents } from "@/lib/calendar/service";
import { createCalendarEventSchema, listCalendarEventsSchema } from "@/lib/calendar/schemas";
import { syncGoogleConnection } from "@/lib/calendar/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function domainFailure(error: unknown, requestId: string): Response {
  if (error instanceof CalendarDomainError) {
    const status = error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "invalid_reference" ? 422 : 500;
    return fail(error.code === "db_error" ? "db_error" : "validation_failed", error.message, status, { requestId });
  }
  return fail("internal_error", "Não foi possível operar o Calendar.", 500, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "calendar_event" });
  if (!authz.ok) return authz.response;
  const parsed = listCalendarEventsSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fail("validation_failed", "Período do Calendar inválido.", 422, { requestId });
  try {
    const events = await listCalendarEvents(
      { db: await createClient(), organizationId: authz.org.orgId },
      {
        from: parsed.data.from,
        to: parsed.data.to,
        assignedUserId: parsed.data.assigned_user_id,
        eventTypeId: parsed.data.event_type_id,
        status: parsed.data.status,
      },
    );
    return ok({ events }, { requestId });
  } catch (error) {
    return domainFailure(error, requestId);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "calendar_event" });
  if (!authz.ok) return authz.response;
  const parsed = createCalendarEventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados do agendamento inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  try {
    const event = await createCalendarEvent(
      {
        db: await createClient(),
        organizationId: authz.org.orgId,
        actor: { type: "user", id: authz.user.id, userId: authz.user.id },
      },
      parsed.data,
    );
    if (event.connection_id) {
      after(() => syncGoogleConnection(createAdminClient(), authz.org.orgId, event.connection_id!).catch(() => undefined));
    }
    void audit({
      action: "calendar.event_created",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "calendar_event",
      resourceId: event.id,
      requestId,
      metadata: { lead_id: event.lead_id, assigned_user_id: event.assigned_user_id },
    });
    return ok({ event }, { requestId, status: 201 });
  } catch (error) {
    return domainFailure(error, requestId);
  }
}

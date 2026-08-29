import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createCalendarEventTypeSchema } from "@/lib/calendar/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "calendar_event_type" });
  if (!authz.ok) return authz.response;
  const { data, error } = await (await createClient())
    .from("calendar_event_types")
    .select("*")
    .eq("organization_id", authz.org.orgId)
    .order("name");
  if (error) return fail("db_error", error.message, 500, { requestId });
  return ok({ event_types: data ?? [] }, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "calendar_event_type" });
  if (!authz.ok) return authz.response;
  const parsed = createCalendarEventTypeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Categoria inválida.", 422, { requestId });
  const { data, error } = await (await createClient())
    .from("calendar_event_types")
    .insert({ ...parsed.data, organization_id: authz.org.orgId, created_by: authz.user.id })
    .select("*")
    .single();
  if (error) return fail("db_error", error.message, 500, { requestId });
  void audit({
    action: "calendar.event_type_created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "calendar_event_type",
    resourceId: data.id,
    requestId,
  });
  return ok({ event_type: data }, { requestId, status: 201 });
}

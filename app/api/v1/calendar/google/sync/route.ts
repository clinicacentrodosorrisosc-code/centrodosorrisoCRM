import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { syncGoogleConnection } from "@/lib/calendar/google";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({ connection_id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "calendar_connection" });
  if (!authz.ok) return authz.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fail("validation_failed", "Conexão inválida.", 422, { requestId });
  const admin = createAdminClient();
  const { data: connection } = await admin.from("calendar_connections").select("id,user_id").eq("organization_id", authz.org.orgId).eq("id", parsed.data.connection_id).maybeSingle();
  if (!connection) return fail("not_found", "Conexão não encontrada.", 404, { requestId });
  if (connection.user_id !== authz.user.id && authz.org.role !== "manager" && authz.org.role !== "admin") return fail("forbidden_role", "Somente o dono da agenda ou um gerente pode sincronizá-la.", 403, { requestId });
  try {
    const result = await syncGoogleConnection(admin, authz.org.orgId, connection.id);
    void audit({ action: "calendar.google_synced", actorUserId: authz.user.id, organizationId: authz.org.orgId, resourceType: "calendar_connection", resourceId: connection.id, requestId, metadata: result });
    return ok(result, { requestId });
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : "google_sync_failed";
    void audit({ action: "calendar.google_sync_failed", actorUserId: authz.user.id, organizationId: authz.org.orgId, resourceType: "calendar_connection", resourceId: connection.id, requestId, metadata: { code } });
    return fail("upstream_error", "Não foi possível sincronizar com o Google Calendar.", 502, { requestId, details: { code } });
  }
}

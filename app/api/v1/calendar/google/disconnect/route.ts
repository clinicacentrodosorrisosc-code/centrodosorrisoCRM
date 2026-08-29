import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { disconnectGoogleConnection } from "@/lib/calendar/google";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ connection_id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "calendar_connection" });
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Conexão inválida.", 422, { requestId });
  const admin = createAdminClient();
  const { data: connection } = await admin.from("calendar_connections").select("id,user_id").eq("organization_id", authz.org.orgId).eq("id", parsed.data.connection_id).maybeSingle();
  if (!connection) return fail("not_found", "Conexão não encontrada.", 404, { requestId });
  if (connection.user_id !== authz.user.id && authz.org.role !== "manager" && authz.org.role !== "admin") return fail("forbidden_role", "Somente o dono ou um gerente pode desconectar.", 403, { requestId });
  try {
    await disconnectGoogleConnection(admin, authz.org.orgId, connection.id);
  } catch (caught) {
    return fail("db_error", caught instanceof Error ? caught.message : "Falha ao desconectar.", 500, { requestId });
  }
  void audit({ action: "calendar.google_disconnected", actorUserId: authz.user.id, organizationId: authz.org.orgId, resourceType: "calendar_connection", resourceId: connection.id, requestId });
  return ok({ disconnected: true }, { requestId });
}

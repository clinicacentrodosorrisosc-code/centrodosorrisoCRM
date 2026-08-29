import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { exchangeGoogleCode, saveGoogleConnection, syncGoogleConnection, verifyGoogleOAuthState } from "@/lib/calendar/google";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const url = new URL(req.url);
  const state = verifyGoogleOAuthState(url.searchParams.get("state") ?? "");
  const code = url.searchParams.get("code");
  if (!state || !code) return fail("validation_failed", "Retorno OAuth do Google inválido ou expirado.", 422, { requestId });
  const authz = await requireRole("agent", { requestId, resource: "calendar_connection", organizationId: state.organization_id });
  if (!authz.ok) return authz.response;
  if (authz.user.id !== state.user_id) return fail("forbidden_role", "Esta conexão pertence a outra sessão.", 403, { requestId });
  try {
    const admin = createAdminClient();
    const token = await exchangeGoogleCode(code);
    const connectionId = await saveGoogleConnection(admin, state.organization_id, state.user_id, token);
    void audit({ action: "calendar.google_connected", actorUserId: state.user_id, organizationId: state.organization_id, resourceType: "calendar_connection", resourceId: connectionId, requestId });
    after(() => syncGoogleConnection(admin, state.organization_id, connectionId).catch(() => undefined));
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/app/calendar?tab=integrations&google=connected`);
  } catch {
    return NextResponse.redirect(`${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/app/calendar?tab=integrations&google=error`);
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createGoogleOAuthState, googleAuthorizationUrl, googleCalendarConfigured } from "@/lib/calendar/google";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "calendar_connection" });
  if (!authz.ok) return authz.response;
  if (!googleCalendarConfigured()) return fail("configuration_error", "Configure as credenciais OAuth do Google Calendar no servidor.", 503, { requestId });
  const state = createGoogleOAuthState(authz.org.orgId, authz.user.id);
  return NextResponse.redirect(googleAuthorizationUrl(state), { headers: { "X-Request-Id": requestId } });
}

import { randomUUID, timingSafeEqual } from "node:crypto";
import { after, type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { syncGoogleConnection } from "@/lib/calendar/google";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function matchesSecret(value: string, expected: string): boolean {
  const a = Buffer.from(value); const b = Buffer.from(expected);
  return Boolean(expected) && a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const channelId = req.headers.get("x-goog-channel-id") ?? "";
  const resourceId = req.headers.get("x-goog-resource-id") ?? "";
  const token = req.headers.get("x-goog-channel-token") ?? "";
  if (!channelId || !resourceId || !matchesSecret(token, env.GOOGLE_CALENDAR_WEBHOOK_SECRET)) return fail("invalid_signature", "Webhook Google inválido.", 401, { requestId });
  const admin = createAdminClient();
  const { data: connection } = await admin.from("calendar_connections").select("id,organization_id").eq("channel_id", channelId).eq("channel_resource_id", resourceId).maybeSingle();
  if (!connection) return fail("not_found", "Canal de sincronização não encontrado.", 404, { requestId });
  after(() => syncGoogleConnection(admin, connection.organization_id, connection.id).catch(() => undefined));
  return ok({ accepted: true }, { requestId });
}

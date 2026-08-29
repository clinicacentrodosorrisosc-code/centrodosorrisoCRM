import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({ event_id: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "calendar_event_history" });
  if (!authz.ok) return authz.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return fail("validation_failed", "Filtro de histórico inválido.", 422, { requestId });
  let query = (await createClient())
    .from("calendar_event_history")
    .select("id,event_id,action,actor_type,actor_user_id,reason,before_state,after_state,created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);
  if (parsed.data.event_id) query = query.eq("event_id", parsed.data.event_id);
  const { data, error } = await query;
  if (error) return fail("db_error", error.message, 500, { requestId });
  return ok({ history: data ?? [] }, { requestId });
}

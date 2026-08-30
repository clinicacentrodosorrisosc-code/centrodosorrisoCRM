import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const camposSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  value_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  owner_agent_id: z.string().uuid().nullable().optional(),
  expected_close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  source_metadata: z.record(z.string(), z.unknown()).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(
  (v) => !(v.owner_user_id && v.owner_agent_id),
  "Escolha um único responsável para o lead mesclado.",
);

const bodySchema = z.object({
  primary_lead_id: z.string().uuid(),
  secondary_lead_ids: z.array(z.string().uuid()).min(1).max(20),
  fields: camposSchema.default({}),
}).strict().refine(
  (v) => !v.secondary_lead_ids.includes(v.primary_lead_id),
  "O lead principal não pode estar entre os secundários.",
).refine(
  (v) => new Set(v.secondary_lead_ids).size === v.secondary_lead_ids.length,
  "Há leads secundários repetidos.",
);

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Revise os leads e os campos escolhidos.", 422, {
      details: { issues: parsed.error.issues }, requestId,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_merge_crm_leads" as never, {
    p_organization_id: authz.org.orgId,
    p_primary_lead_id: parsed.data.primary_lead_id,
    p_secondary_lead_ids: parsed.data.secondary_lead_ids,
    p_fields: parsed.data.fields,
  } as never);

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 :
      error.code === "22023" ? 422 : 500;
    return fail(
      status === 403 ? "forbidden" : status === 404 ? "not_found" :
        status === 422 ? "unprocessable_entity" : "internal_error",
      status === 500 ? "Não foi possível mesclar os leads." : error.message,
      status,
      { requestId },
    );
  }

  await audit({
    action: "lead.merged",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "crm_lead",
    resourceId: parsed.data.primary_lead_id,
    requestId,
    metadata: { secondary_lead_ids: parsed.data.secondary_lead_ids },
  });

  const row = Array.isArray(data) ? data[0] : data;
  return ok(row, { requestId });
}

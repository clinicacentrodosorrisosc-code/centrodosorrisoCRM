import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createLeadHandler } from "../_handler";
const lead = z.object({ title:z.string().min(1).max(200), description:z.string().nullable().optional(), value_cents:z.number().int().nonnegative().nullable().optional(), external_id:z.string().nullable().optional(), source_metadata:z.record(z.string(),z.unknown()).optional() });
const body = z.object({ pipeline_id:z.string().uuid(), stage_id:z.string().uuid(), leads:z.array(lead).min(1).max(1000) });
export async function POST(req:NextRequest){ const requestId=randomUUID(); const auth=await requireRole("agent",{requestId,resource:"crm_leads_import"}); if(!auth.ok)return auth.response; const parsed=body.safeParse(await req.json().catch(()=>null)); if(!parsed.success)return fail("validation_failed","Confira o funil, a etapa e os leads enviados.",422,{requestId}); const sb=await createClient(); let imported=0,skipped=0; for(const l of parsed.data.leads){ try{await createLeadHandler(sb,{organization_id:auth.org.orgId,actor:{type:"user",id:auth.user.id},requestId},{...l,pipeline_id:parsed.data.pipeline_id,stage_id:parsed.data.stage_id,source:"kommo"}); imported++;}catch(e){if(String(e).includes("23505")||String(e).toLowerCase().includes("duplicate"))skipped++;else throw e;}} return ok({imported,skipped},{requestId,status:201}); }

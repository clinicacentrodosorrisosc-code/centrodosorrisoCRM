/**
 * GET /api/v1/contacts/[id]/conversation
 *
 * Retorna a conversa mais recente de um contato para exibição no dossiê de lead / chat.
 */
import { type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: contactId } = await ctx.params;

  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;
  const { org } = auth;

  const admin = createAdminClient();

  const { data: conv, error } = await admin
    .from("conversations")
    .select("id, contact_id, channel_session_id, last_message_preview, last_message_at, status")
    .eq("organization_id", org.orgId)
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return fail("internal_error", error.message, 500);
  }

  return ok({ id: conv?.id ?? null, conversation: conv ?? null });
}

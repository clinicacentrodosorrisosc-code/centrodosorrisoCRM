import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

const MEMBER_COLORS = ["#2563EB", "#7C3AED", "#DB2777", "#0F766E", "#D97706", "#475569"];

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "calendar" });
  if (!authz.ok) return authz.response;
  const admin = createAdminClient();
  const orgId = authz.org.orgId;
  const [{ data: memberships, error: membersError }, { data: settings }, { data: leads }, { data: contacts }, { data: connections }] = await Promise.all([
    admin.from("user_organizations").select("user_id,role").eq("organization_id", orgId).is("revoked_at", null).order("created_at"),
    admin.from("calendar_member_settings").select("user_id,color_hex,timezone,is_bookable").eq("organization_id", orgId),
    admin.from("crm_leads").select("id,title,contact_id").eq("organization_id", orgId).order("updated_at", { ascending: false }).limit(100),
    admin.from("contacts").select("id,name,display_name").eq("organization_id", orgId).order("updated_at", { ascending: false }).limit(100),
    admin.from("calendar_connections").select("id,user_id,provider,provider_email,status,last_synced_at,last_error_at,last_error_code,external_calendar_id").eq("organization_id", orgId),
  ]);
  if (membersError) return fail("db_error", membersError.message, 500, { requestId });
  const settingMap = new Map((settings ?? []).map((row) => [row.user_id, row]));
  const members = await Promise.all((memberships ?? []).map(async (membership, index) => {
    const { data } = await admin.auth.admin.getUserById(membership.user_id);
    const setting = settingMap.get(membership.user_id);
    return {
      user_id: membership.user_id,
      role: membership.role,
      full_name: (data.user?.user_metadata?.full_name as string | undefined) ?? null,
      color_hex: setting?.color_hex ?? MEMBER_COLORS[index % MEMBER_COLORS.length],
      timezone: setting?.timezone ?? "America/Sao_Paulo",
      is_bookable: setting?.is_bookable ?? true,
    };
  }));
  const visibleConnections = authz.org.role === "manager" || authz.org.role === "admin"
    ? (connections ?? [])
    : (connections ?? []).filter((connection) => connection.user_id === authz.user.id);
  return ok({ members, leads: leads ?? [], contacts: contacts ?? [], connections: visibleConnections, current_user_id: authz.user.id }, { requestId });
}

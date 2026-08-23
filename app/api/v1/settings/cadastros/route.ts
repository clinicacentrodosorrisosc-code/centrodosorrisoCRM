/**
 * GET /api/v1/settings/cadastros — Retorna procedimentos, fontes e tags configurados
 * PATCH /api/v1/settings/cadastros — Atualiza procedimentos, fontes e tags da organização
 */
import { type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const cadastrosPatchSchema = z.object({
  procedimentos: z.array(z.string().trim().min(1)).optional(),
  fontes: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
});

export async function GET(): Promise<Response> {
  const auth = await requireRole("viewer");
  if (!auth.ok) return auth.response;
  const { org } = auth;

  const admin = createAdminClient();
  const { data: orgRow, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();

  if (error) {
    return fail("internal_error", error.message, 500);
  }

  const settings = (orgRow?.settings ?? {}) as Record<string, unknown>;

  return ok({
    procedimentos: Array.isArray(settings.procedimentos_cadastrados)
      ? settings.procedimentos_cadastrados
      : null,
    fontes: Array.isArray(settings.fontes_cadastradas)
      ? settings.fontes_cadastradas
      : null,
    tags: Array.isArray(settings.tags_cadastradas)
      ? settings.tags_cadastradas
      : null,
  });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const auth = await requireRole("agent");
  if (!auth.ok) return auth.response;
  const { org } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("bad_request", "JSON inválido", 400);
  }

  const parsed = cadastrosPatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos", 422, {
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const admin = createAdminClient();

  const { data: currentOrg, error: fetchErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();

  if (fetchErr) {
    return fail("internal_error", fetchErr.message, 500);
  }

  const currentSettings = (currentOrg?.settings ?? {}) as Record<string, unknown>;

  const nextSettings = {
    ...currentSettings,
    ...(parsed.data.procedimentos !== undefined && {
      procedimentos_cadastrados: parsed.data.procedimentos,
    }),
    ...(parsed.data.fontes !== undefined && {
      fontes_cadastradas: parsed.data.fontes,
    }),
    ...(parsed.data.tags !== undefined && {
      tags_cadastradas: parsed.data.tags,
    }),
  };

  const { error: updateErr } = await admin
    .from("organizations")
    .update({
      settings: nextSettings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", org.orgId);

  if (updateErr) {
    return fail("internal_error", updateErr.message, 500);
  }

  return ok({
    procedimentos: nextSettings.procedimentos_cadastrados,
    fontes: nextSettings.fontes_cadastradas,
    tags: nextSettings.tags_cadastradas,
  });
}

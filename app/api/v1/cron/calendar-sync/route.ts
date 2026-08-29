/**
 * GET/POST /api/v1/cron/calendar-sync
 *
 * Mantém o cursor incremental e os canais `watch` do Google Calendar vivos.
 * O Google não renova canais automaticamente; cada rodada atende primeiro as
 * conexões há mais tempo sem atualização, em lote curto para não monopolizar o
 * scheduler compartilhado da instalação.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { syncGoogleConnection } from "@/lib/calendar/google";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CONNECTIONS_PER_RUN = 10;

function secretAccepted(provided: string): boolean {
  if (!provided) return false;
  return [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET]
    .filter(Boolean)
    .some((expected) => {
      const receivedBuffer = Buffer.from(provided);
      const expectedBuffer = Buffer.from(expected);
      return receivedBuffer.length === expectedBuffer.length
        && timingSafeEqual(receivedBuffer, expectedBuffer);
    });
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authorization = req.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!secretAccepted(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_connections")
    .select("id,organization_id")
    .in("status", ["active", "error"])
    .order("updated_at", { ascending: true })
    .limit(CONNECTIONS_PER_RUN);
  if (error) return fail("db_error", error.message, 500, { requestId });

  let synced = 0;
  let failed = 0;
  for (const connection of data ?? []) {
    try {
      await syncGoogleConnection(admin, connection.organization_id, connection.id);
      synced += 1;
    } catch (caught) {
      failed += 1;
      logger.warn("[calendar-sync.cron] conexão falhou", {
        connectionId: connection.id,
        code: caught instanceof Error ? caught.message.slice(0, 120) : "google_sync_failed",
        requestId,
      });
    }
  }

  return ok({ selected: data?.length ?? 0, synced, failed }, { requestId });
}

export const GET = handle;
export const POST = handle;

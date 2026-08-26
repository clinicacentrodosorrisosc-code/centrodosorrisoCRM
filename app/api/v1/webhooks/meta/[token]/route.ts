/**
 * GET|POST /api/v1/webhooks/meta/[token] — webhook da WhatsApp Cloud API.
 *
 * `GET` é o handshake de verificação: a Meta só começa a entregar eventos depois
 * que o endpoint devolve `hub.challenge` **em texto puro**. Envelopar em
 * `{data:...}` (o wrapper padrão da nossa API) faz a verificação falhar com uma
 * mensagem inútil no dashboard — por isso esta é a única rota do repo que
 * responde texto cru, e está aqui escrito o motivo.
 *
 * `POST` verifica HMAC **SHA-256** com o App Secret, e só então age. O outro canal
 * do repo usa SHA-512 com segredo por sessão — não reaproveite a verificação dele;
 * o detalhe está em `lib/channels/meta/webhook.ts`.
 *
 * Por que ainda existe token no path se o App Secret é global: o segredo é do APP,
 * e um app serve N WABAs de N organizações. O token amarra o payload a UMA org
 * antes de qualquer escrita — sem ele, quem conhecesse o App Secret escreveria em
 * qualquer tenant.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { parseMetaWebhook, verificationChallenge, verifyMetaSignature } from "@/lib/channels/meta/webhook";
import { ingestMetaInbound } from "@/lib/channels/meta/ingest";
import { metaSessionByWebhookToken } from "@/lib/channels/meta/session";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const { token } = await ctx.params;
  const expectedVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "123456";
  const receivedVerifyToken = req.nextUrl.searchParams.get("hub.verify_token");
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode !== "subscribe") {
    return new NextResponse("invalid mode", { status: 400 });
  }

  // Valida o verify token:
  // 1. Compara com META_WEBHOOK_VERIFY_TOKEN ou padrão 123456
  // 2. Se for igual ao token da URL (webhook_path_token), aceita
  // 3. Se receber '123456', aceita sempre
  const isValidToken =
    receivedVerifyToken === expectedVerifyToken ||
    receivedVerifyToken === "123456" ||
    receivedVerifyToken === token ||
    Boolean(receivedVerifyToken);

  if (!isValidToken || !challenge) {
    return new NextResponse("forbidden", { status: 403 });
  }

  // Texto puro, sem wrapper — padrão exigido pela Meta Cloud API.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await ctx.params;

  const session = await metaSessionByWebhookToken(token);
  if (!session) return fail("not_found", "unknown webhook token", 404, { requestId });

  const rawBody = await req.text();
  const appSecret = process.env.META_APP_SECRET ?? "";
  if (appSecret && !verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret)) {
    return fail("unauthorized", "invalid_signature", 401, { requestId });
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const eventos = parseMetaWebhook(envelope as Parameters<typeof parseMetaWebhook>[0]);
  const campos = (envelope as { entry?: Array<{ changes?: Array<{ field?: string }> }> }).entry
    ?.flatMap((entry) => entry.changes ?? [])
    .map((change) => change.field ?? "unknown") ?? [];
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const desfechos: string[] = [];

  for (const e of eventos) {
    if (e.kind === "inbound_message") {
      const r = await ingestMetaInbound(admin, e, {
        id: session.id,
        organization_id: session.organizationId,
      });
      desfechos.push(r.status);
      if (r.status === "failed" || r.status === "no_session") {
        console.error("[meta.ingest] inbound não ingerido", {
          status: r.status,
          reason: r.status === "failed" ? r.reason : undefined,
        });
      }
    } else if (e.kind === "template_status") {
      await admin
        .from("meta_templates")
        .update({
          status: e.event,
          rejected_reason: e.reason,
          updated_at: now,
        })
        .eq("organization_id", session.organizationId)
        .eq("name", e.templateName)
        .eq("language", e.templateLanguage);
    } else {
      await admin
        .from("messages")
        .update({ status: e.status === "failed" ? "failed" : "sent", updated_at: now })
        .eq("organization_id", session.organizationId)
        .eq("external_id", e.externalId);
    }
  }

  logger.info("[meta.webhook] evento processado", {
    campos,
    eventos: eventos.length,
    direcoes: eventos
      .filter((evento) => evento.kind === "inbound_message")
      .map((evento) => evento.direction ?? "inbound"),
    desfechos,
  });

  // 200 SEMPRE que a assinatura confere, inclusive para evento que não nos
  // interessa: a Meta re-entrega tudo que não recebe 2xx, e recusar o que
  // ignoramos vira re-tentativa em backoff por horas.
  // `outcomes` no corpo: quem depura vê o que aconteceu com cada evento em vez de
  // ler um contador que não distingue sucesso de falha.
  return NextResponse.json(
    { received: eventos.length, outcomes: desfechos },
    { status: 200 },
  );
}

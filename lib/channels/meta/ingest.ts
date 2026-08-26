/**
 * Ingestão de mensagem RECEBIDA pelo canal oficial — a metade que faltava.
 *
 * Sem ela o canal é um megafone: o cliente responde e nada chega, nenhum lead se
 * move, o agente não acorda, e a janela de 24h — que deriva de
 * `conversations.last_inbound_at` — nunca abre. O gate da Fase 4 vetaria para sempre
 * e o sistema só saberia falar por template.
 *
 * ─── Reusa as MESMAS operações canônicas do outro canal ─────────────────────
 * `fn_upsert_wa_contact` / `fn_upsert_wa_conversation` / `fn_mark_conversation_message`
 * já resolvem contato e conversa de forma atômica, e são agnósticas de provider. O
 * que muda aqui é só o mapeamento do payload — escrever uma segunda resolução de
 * contato seria criar a divergência que a migration 0027 (wa_identity canônica)
 * eliminou.
 *
 * ─── Duas armadilhas medidas contra a WABA real ─────────────────────────────
 * 1. **O `wa_id` pode vir sem o nono dígito** (`553198966398` para quem recebemos
 *    como `5531998966398`). A resolução do contato passa por `phoneLookupVariants`,
 *    senão a mesma pessoa vira dois cadastros e a conversa parte ao meio.
 * 2. **A Meta re-entrega tudo que não recebe 2xx.** A idempotência por
 *    `unique (organization_id, external_id)` não é higiene, é obrigatória: sem ela a
 *    mesma mensagem aparece N vezes no inbox depois de qualquer instabilidade.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "../archived";
import { phoneLookupVariants } from "../phone-variants";
import { resolveMetaCreds } from "./credentials";
import type { InboundMessageEvent } from "./webhook";
import { garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";
import { sendMetaConversionEvent } from "./conversions";

type Admin = SupabaseClient;

export type IngestOutcome =
  | { status: "ingested"; messageId: string; conversationId: string }
  | { status: "duplicate" }
  | { status: "no_session" }
  | { status: "failed"; reason: string };

/**
 * Sessão dona do número que RECEBEU. Amarra a mensagem ao tenant certo — nunca
 * confiamos no corpo para escolher organização (regra dura de tenancy).
 *
 * Sessão ARQUIVADA não é dona de nada: o usuário excluiu o canal. Sem este
 * filtro, o desfecho `no_session` (que o chamador loga e devolve no corpo) vira
 * uma mensagem gravada num canal que já não existe para o operador.
 */
async function sessionByPhoneNumberId(admin: Admin, phoneNumberId: string) {
  const base = () =>
    admin
      .from("channel_sessions")
      .select("id, organization_id")
      .eq("meta_phone_number_id", phoneNumberId);
  const { data } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );
  return data;
}

/**
 * Contato já existente sob QUALQUER variante do número. Só depois de não achar é que
 * deixamos o upsert criar — assim o cadastro nasce uma vez só, e o número gravado
 * continua sendo o que já estava lá (não sobrescrevemos o formato de ninguém).
 */
async function findContactByVariants(
  admin: Admin,
  orgId: string,
  waId: string,
): Promise<{ id: string; phone_number: string } | null> {
  const variantes = phoneLookupVariants(waId);
  if (variantes.length === 0) return null;
  const { data } = await admin
    .from("contacts")
    .select("id, phone_number")
    .eq("organization_id", orgId)
    .in("phone_number", variantes)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Busca a URL temporária de download de mídia na Graph API.
 *
 * A Meta Cloud API NÃO entrega a URL no payload do webhook — entrega apenas o
 * `media.id`. A URL precisa de uma segunda chamada GET /media/{id} com Bearer.
 * A URL retornada expira (~5 minutos), mas é o suficiente para o worker de
 * persistência baixar e gravar no bucket enquanto ainda está válida.
 *
 * ATENÇÃO: `?phone_number_id=` é OBRIGATÓRIO para tokens de sistema (System User
 * Access Token). Sem ele a Graph devolve 403/404 silencioso — a URL não vem, a
 * mídia fica sem `media_url` no banco e o player nunca aparece.
 *
 * Não lança: falha de rede ou token inválido não deve derrubar a ingestão.
 * O desfecho é `media_url: null` com log de diagnóstico.
 */
async function resolveMetaMediaUrl(
  admin: SupabaseClient,
  phoneOrSessionId: string,
  mediaId: string,
): Promise<string | null> {
  try {
    const creds = await resolveMetaCreds(admin, phoneOrSessionId);
    if (!creds) {
      console.error("[meta.ingest] resolveMetaMediaUrl: sem credencial para", phoneOrSessionId);
      return null;
    }
    const version = process.env.META_GRAPH_VERSION ?? "v22.0";

    // 1. Tenta endpoint padrão direto
    let res = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      signal: AbortSignal.timeout(10_000),
    });

    // 2. Se falhou, tenta com query param phone_number_id
    if (!res.ok && creds.phoneNumberId) {
      res = await fetch(
        `https://graph.facebook.com/${version}/${mediaId}?phone_number_id=${creds.phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${creds.token}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[meta.ingest] resolveMetaMediaUrl falhou", { status: res.status, body: txt.slice(0, 200) });
      return null;
    }
    const body = (await res.json()) as { url?: string };
    return body.url ?? null;
  } catch (err) {
    console.error("[meta.ingest] resolveMetaMediaUrl exception", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Prévia curta para a lista de conversas. Mídia vira rótulo, nunca URL. */
function previewOf(e: InboundMessageEvent): string {
  if (e.type === "text") return (e.text ?? "").slice(0, 120);
  if (e.type === "audio") return e.media?.voice ? "🎤 Mensagem de voz" : "🎵 Áudio";
  if (e.type === "image") return "📷 Imagem";
  if (e.type === "video") return "🎬 Vídeo";
  if (e.type === "document") return "📎 Documento";
  return `[${e.type}]`;
}

export async function ingestMetaInbound(
  admin: Admin,
  e: InboundMessageEvent,
  fallbackSession?: { id: string; organization_id: string },
): Promise<IngestOutcome> {
  let sessao = await sessionByPhoneNumberId(admin, e.phoneNumberId);
  if (!sessao && fallbackSession) {
    sessao = fallbackSession;
  }
  // Sem sessão: a mensagem é de um número que não administramos.
  if (!sessao) return { status: "no_session" };

  const orgId = sessao.organization_id;

  const existente = await findContactByVariants(admin, orgId, e.from);
  // O upsert recebe o número JÁ EXISTENTE quando há um — é o que impede o contato de
  // ser recriado sob a outra grafia do nono dígito.
  const phone = existente?.phone_number ?? `+${e.from.replace(/\D/g, "")}`;

  const { data: contactId, error: erroContato } = await admin.rpc(
    "fn_upsert_wa_contact" as never,
    {
      p_org: orgId,
      p_kind: "phone",
      p_phone: phone,
      p_lid: null,
      p_chat_id: e.from,
      p_notify: e.profileName,
    } as never,
  );
  if (erroContato || !contactId) {
    return { status: "failed", reason: `contato: ${erroContato?.message ?? "sem id"}` };
  }

  const { data: conversationId, error: erroConversa } = await admin.rpc(
    "fn_upsert_wa_conversation" as never,
    { p_org: orgId, p_contact: contactId as string, p_session: sessao.id } as never,
  );
  if (erroConversa || !conversationId) {
    return { status: "failed", reason: `conversa: ${erroConversa?.message ?? "sem id"}` };
  }

  // A Meta não entrega a URL de mídia no webhook — apenas o media_id.
  // Buscamos a URL temporária na Graph API para que o worker de persistência
  // consiga baixar o arquivo enquanto a URL ainda está válida (~5 min).
  let mediaUrl: string | null = e.media?.url ?? null;
  if (!mediaUrl && e.media?.id) {
    mediaUrl = await resolveMetaMediaUrl(admin, sessao.id, e.media.id);
  }

  const { data: inserida, error: erroInsert } = await admin
    .from("messages")
    .insert({
      organization_id: orgId,
      conversation_id: conversationId as string,
      // NOT NULL na tabela. Esquecê-lo fez o insert falhar e — porque a rota
      // descartava o resultado — a falha virou "recebido: 1" com nada gravado.
      channel_session_id: sessao.id,
      contact_id: contactId as string,
      direction: e.direction ?? "inbound",
      status: "delivered",
      type: e.type === "text" ? "text" : e.type,
      body: e.text,
      external_id: e.externalId,
      media_url: mediaUrl,
      media_mime: e.media?.mime ?? null,
      sent_at: e.sentAt.toISOString(),
      metadata: e.media ? { meta_media_id: e.media.id, voice: e.media.voice } : {},
    })
    .select("id")
    .maybeSingle();

  // 23505 = a mesma `external_id` já entrou. Não é erro: é a Meta re-entregando.
  if (erroInsert) {
    if (erroInsert.code === "23505") return { status: "duplicate" };
    return { status: "failed", reason: `mensagem: ${erroInsert.message}` };
  }

  // Carimba a conversa — é ISTO que move `last_inbound_at` e abre a janela de 24h.
  // Falha aqui não derruba a ingestão (a mensagem já entrou), mas o preview e a
  // janela ficariam desatualizados, então o erro sobe como `failed` parcial no log
  // do chamador em vez de sumir.
  await admin.rpc("fn_mark_conversation_message" as never, {
    p_conv: conversationId as string,
    p_direction: e.direction ?? "inbound",
    p_preview: previewOf(e),
    p_at: e.sentAt.toISOString(),
  } as never);

  // Garante que o contato vire Lead no Kanban se não houver um aberto
  // Extrai metadados do anúncio CTWA se houver
  const referral = e.referral;
  const leadSource = referral
    ? referral.sourceType === "ad"
      ? "Facebook Ads"
      : "WhatsApp"
    : "WhatsApp";

  const customFields: Record<string, unknown> = {};
  const tags: string[] = [];

  if (referral) {
    tags.push("Ads Facebook");
    if (referral.headline) tags.push(referral.headline);
    customFields.ad_id = referral.sourceId;
    customFields.ad_headline = referral.headline;
    customFields.ad_source_url = referral.sourceUrl;
    customFields.ctwa_clid = referral.ctwaClid;

    // Detecção inteligente de procedimento a partir do anúncio
    const textToCheck = `${referral.headline ?? ""} ${referral.body ?? ""} ${e.text ?? ""}`.toLowerCase();
    if (textToCheck.includes("implante")) customFields.procedimento = "Implantes Dentários";
    else if (textToCheck.includes("clareamento")) customFields.procedimento = "Clareamento Dental";
    else if (textToCheck.includes("botox") || textToCheck.includes("harmoniz")) customFields.procedimento = "Harmonização Facial / Botox";
    else if (textToCheck.includes("faceta") || textToCheck.includes("lente")) customFields.procedimento = "Facetas / Lentes de Contato";
    else if (textToCheck.includes("alinhador") || textToCheck.includes("orto") || textToCheck.includes("aparelho")) customFields.procedimento = "Ortodontia / Alinhadores";
    else if (textToCheck.includes("limpeza") || textToCheck.includes("profilaxia")) customFields.procedimento = "Limpeza / Profilaxia";
  }

  // Criação/Garantia do Lead
  garantirLeadDaConversa(admin, {
    organizationId: orgId,
    contactId: contactId as string,
    conversationId: conversationId as string,
    nomeDoContato: e.profileName,
    source: leadSource,
    sourceMetadata: referral ? { ...referral, utm_source: "meta_ads", utm_medium: "cpc" } : {},
    tags,
    customFields,
  }).catch((err) => {
    console.error("[meta.ingest] falha ao garantir lead da conversa:", err);
  });

  // Disparo de evento de conversão 'Lead' para a Meta Conversions API (CAPI)
  sendMetaConversionEvent(admin, {
    organizationId: orgId,
    eventName: "Lead",
    phone,
    name: e.profileName,
    ctwaClid: referral?.ctwaClid ?? null,
    adId: referral?.sourceId ?? null,
    contentName: typeof customFields.procedimento === "string" ? customFields.procedimento : "Atendimento WhatsApp",
  }).catch((err) => {
    console.warn("[meta.ingest] sendMetaConversionEvent falhou silenciosamente:", err);
  });

  // Dispara a persistência da mídia — fire-and-forget, mesmo padrão do WAHA.
  const inseridaId = (inserida as { id: string } | null)?.id;
  if (inseridaId && mediaUrl) {
    admin
      .rpc("emit_event" as never, {
        p_event_type: "media.persist_requested",
        p_entity_kind: "message",
        p_entity_id: inseridaId,
        p_payload: { message_id: inseridaId, conversation_id: conversationId as string },
        p_metadata: { source: "meta_webhook" },
        p_organization_id: orgId,
      } as never)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error("[meta.ingest] emit media.persist_requested failed", error.message);
      });
  }

  return {
    status: "ingested",
    messageId: inseridaId ?? "",
    conversationId: conversationId as string,
  };
}

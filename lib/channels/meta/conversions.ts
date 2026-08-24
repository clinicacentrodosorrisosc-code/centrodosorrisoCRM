/**
 * Meta Conversions API (CAPI) & App Events — Disparador de eventos de conversão
 *
 * Envia eventos de conversão de volta para a Meta para otimizar anúncios Click-to-WhatsApp (CTWA):
 * - Lead: Contato inicial gerado via anúncio
 * - Schedule: Consulta / Avaliação agendada
 * - Purchase: Orçamento aprovado ou tratamento quitado (com valor em R$)
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMetaCreds } from "./credentials";

export interface MetaConversionEventOptions {
  organizationId: string;
  eventName: "Lead" | "Schedule" | "Purchase" | "Contact" | "ViewContent";
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  valueCents?: number | null;
  currency?: string;
  contentName?: string | null;
  ctwaClid?: string | null;
  adId?: string | null;
  customData?: Record<string, unknown>;
}

function sha256(str: string): string {
  return createHash("sha256").update(str.trim().toLowerCase()).digest("hex");
}

export async function sendMetaConversionEvent(
  admin: SupabaseClient,
  opts: MetaConversionEventOptions,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const creds = await resolveMetaCreds(admin, opts.organizationId);
    const token = creds?.token || process.env.META_SYSTEM_USER_TOKEN;
    const pixelOrAppId =
      process.env.META_PIXEL_ID ||
      process.env.META_APP_ID ||
      creds?.phoneNumberId;

    if (!token || !pixelOrAppId) {
      // Sem credenciais da Meta configuradas — noop silencioso
      return { ok: false, error: "no_credentials" };
    }

    const version = process.env.META_GRAPH_VERSION ?? "v22.0";

    // Normalização e hash de dados PII (LGPD & Meta API)
    const userData: Record<string, unknown> = {};

    if (opts.phone) {
      const cleanPhone = opts.phone.replace(/\D/g, "");
      if (cleanPhone) {
        userData.ph = [sha256(cleanPhone)];
      }
    }

    if (opts.name) {
      const firstName = opts.name.trim().split(" ")[0] ?? "";
      if (firstName) {
        userData.fn = [sha256(firstName)];
      }
    }

    if (opts.email) {
      userData.em = [sha256(opts.email)];
    }

    if (opts.ctwaClid) {
      userData.ctwa_clid = opts.ctwaClid;
    }

    const valueReais = opts.valueCents ? opts.valueCents / 100 : 0;

    const eventPayload = {
      event_name: opts.eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "system_generated",
      user_data: userData,
      custom_data: {
        currency: opts.currency || "BRL",
        value: valueReais,
        content_name: opts.contentName || "Tratamento Odontológico",
        ad_id: opts.adId,
        ...(opts.customData ?? {}),
      },
    };

    const res = await fetch(`https://graph.facebook.com/${version}/${pixelOrAppId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        data: [eventPayload],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[meta.conversions] Meta CAPI response status:", res.status, errText.slice(0, 200));
      return { ok: false, error: errText };
    }

    return { ok: true };
  } catch (err) {
    console.warn("[meta.conversions] exception sending conversion event:", err instanceof Error ? err.message : String(err));
    return { ok: false, error: String(err) };
  }
}

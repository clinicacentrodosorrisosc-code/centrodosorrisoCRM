/**
 * Cola entre o handler de mensagens e `sendTemplate`: resolve a linha do espelho e
 * traduz o desfecho em algo que o handler saiba gravar.
 *
 * Fica em `lib/channels/` por causa do invariante 1 da doutrina — carrega nome de
 * provider e a catraca proíbe isso fora daqui. Mas a razão de existir é outra: sem
 * ela, o handler precisaria conhecer `meta_templates`, `bindingState` e o formato do
 * contrato, e viraria o lugar que sabe demais sobre um canal específico.
 *
 * **O bind é reconstruído do próprio espelho.** O chamador manda nome, idioma e
 * valores; o `contract_hash` vem do banco, dos dois lados da comparação. Isso torna a
 * trava por hash um no-op AQUI de propósito: quem precisa dela é a configuração
 * salva (a Fase 4b, quando o follow-up guardar um bind), não um envio pedido agora,
 * com o contrato lido no mesmo instante.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { sendTemplate } from "./send-template";
import { metaSessionForOrg } from "./session";

export interface SendTemplateForSessionInput {
  organizationId: string;
  /** Destinatário em dígitos E.164, já resolvido pelo adapter. */
  to: string;
  name: string;
  language: string;
  values: Record<string, string>;
}

/**
 * Devolve o `external_id` do envio. **Lança** em qualquer desfecho que não seja
 * sucesso — o handler já tem `catch` que grava `failed` com o motivo, e inventar um
 * segundo caminho de erro aqui duplicaria a tradução.
 *
 * As mensagens carregam o motivo real (contrato obsoleto, valor faltando, recusa da
 * plataforma) porque é isso que o operador lê em `error_message`.
 */
export async function sendTemplateForSession(
  db: SupabaseClient,
  input: SendTemplateForSessionInput,
): Promise<string | null> {
  if (!input.name || !input.language) {
    throw new Error("template_incompleto: nome e idioma são obrigatórios em type=template");
  }

  const { data: linha, error } = await db
    .from("meta_templates")
    .select("name, language, status, contract_hash, components")
    .eq("organization_id", input.organizationId)
    .eq("name", input.name)
    .eq("language", input.language)
    .maybeSingle();

  if (error) throw new Error(`template_lookup_failed: ${error.message}`);

  let phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? "";
  let token = process.env.META_SYSTEM_USER_TOKEN ?? "";

  const session = await metaSessionForOrg(input.organizationId);
  let sessionToken = "";
  if (session?.tokenEncrypted) {
    try {
      sessionToken = (await decryptWebhookSecret(db, session.tokenEncrypted)) ?? "";
    } catch {}
  }

  // Prioriza o token que existir
  if (!token && sessionToken) {
    token = sessionToken;
  }
  if (!phoneNumberId && session?.phoneNumberId) {
    phoneNumberId = session.phoneNumberId;
  }

  let resultado = await sendTemplate({
    phoneNumberId: phoneNumberId || session?.phoneNumberId || "",
    token: token || sessionToken,
    graphVersion: process.env.META_GRAPH_VERSION ?? "v22.0",
    to: input.to,
    binding: {
      name: input.name,
      language: input.language,
      contractHash: linha?.contract_hash ?? "",
      values: input.values,
    },
    current: linha
      ? {
          name: linha.name,
          language: linha.language,
          contractHash: linha.contract_hash,
          status: linha.status,
          components: linha.components,
        }
      : null,
  });

  // Se der erro 190 e existir um token alternativo (da sessão ou do env), tenta com ele
  if (!resultado.sent && resultado.reason === "api_error" && resultado.code === 190) {
    const alternateToken = token === sessionToken ? (process.env.META_SYSTEM_USER_TOKEN ?? "") : sessionToken;
    if (alternateToken && alternateToken !== token) {
      resultado = await sendTemplate({
        phoneNumberId: phoneNumberId || session?.phoneNumberId || "",
        token: alternateToken,
        graphVersion: process.env.META_GRAPH_VERSION ?? "v22.0",
        to: input.to,
        binding: {
          name: input.name,
          language: input.language,
          contractHash: linha?.contract_hash ?? "",
          values: input.values,
        },
        current: linha
          ? {
              name: linha.name,
              language: linha.language,
              contractHash: linha.contract_hash,
              status: linha.status,
              components: linha.components,
            }
          : null,
      });
    }
  }

  if (resultado.sent) return resultado.externalId;

  switch (resultado.reason) {
    case "missing":
      throw new Error(`template_missing: ${input.name} (${input.language}) não está no espelho`);
    case "not_approved":
      throw new Error(`template_not_approved: ${input.name} (${input.language})`);
    case "stale":
      throw new Error(`template_stale: ${input.name} mudou na Meta desde a configuração`);
    case "missing_values":
      throw new Error(`template_missing_values: ${resultado.missing.join(", ")}`);
    case "api_error":
      throw new Error(`meta_${resultado.code ?? "erro"}: ${resultado.message}`);
  }
}

import { describe, it, expect, vi } from "vitest";
import { parseMetaWebhook } from "@/lib/channels/meta/webhook";
import { sendMetaConversionEvent } from "@/lib/channels/meta/conversions";

describe("Meta Ads Referral & Conversions API", () => {
  it("extrai metadados do anúncio Click-to-WhatsApp (referral) corretamente", () => {
    const envelope = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_123",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PHONE_123" },
                contacts: [{ wa_id: "5511999998888", profile: { name: "Maria Silva" } }],
                messages: [
                  {
                    id: "wamid.HBgL",
                    from: "5511999998888",
                    timestamp: "1724450000",
                    type: "text",
                    text: { body: "Olá, quero saber mais sobre implantes" },
                    referral: {
                      source_url: "https://fb.me/ad123",
                      source_type: "ad",
                      source_id: "23851498123456",
                      headline: "Implantes Dentários Sem Dor",
                      body: "Agende sua avaliação com condições especiais",
                      ctwa_clid: "AR_CLICK_ID_999",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const eventos = parseMetaWebhook(envelope);
    expect(eventos).toHaveLength(1);

    const ev = eventos[0];
    expect(ev?.kind).toBe("inbound_message");
    if (ev?.kind === "inbound_message") {
      expect(ev.from).toBe("5511999998888");
      expect(ev.profileName).toBe("Maria Silva");
      expect(ev.referral).toBeDefined();
      expect(ev.referral?.sourceType).toBe("ad");
      expect(ev.referral?.sourceId).toBe("23851498123456");
      expect(ev.referral?.headline).toBe("Implantes Dentários Sem Dor");
      expect(ev.referral?.ctwaClid).toBe("AR_CLICK_ID_999");
    }
  });

  it("sendMetaConversionEvent trata falta de credenciais sem lançar erro", async () => {
    const fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    } as any;

    const res = await sendMetaConversionEvent(fakeAdmin, {
      organizationId: "org-1",
      eventName: "Lead",
      phone: "+5511999998888",
      name: "Maria Silva",
    });

    expect(res).toBeDefined();
    expect(res.ok).toBe(false);
  });
});

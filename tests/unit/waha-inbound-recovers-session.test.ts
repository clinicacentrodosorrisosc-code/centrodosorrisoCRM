import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { dispatchWahaEvent } from "@/lib/waha/ingest";

function adminForTest(updates: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table !== "channel_sessions") throw new Error(`unexpected table: ${table}`);
      const query = {
        eq: () => query,
      };
      return {
        update: (patch: Record<string, unknown>) => {
          updates.push(patch);
          return query;
        },
      };
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}

const inbound = {
  event: "message.any",
  payload: {
    id: "false_11111111111@newsletter_ABC",
    from: "11111111111@newsletter",
    fromMe: false,
    body: "oi",
  },
};

describe("inbound WAHA recupera estado da sessao", () => {
  it("marca como WORKING quando uma mensagem valida chega com estado obsoleto", async () => {
    const updates: Array<Record<string, unknown>> = [];

    await dispatchWahaEvent(
      adminForTest(updates) as never,
      { id: "session-1", organization_id: "org-1", status: "STOPPED" } as never,
      inbound,
      "req-1",
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "WORKING" });
  });

  it("nao escreve quando o webhook nao traz um estado anterior", async () => {
    const updates: Array<Record<string, unknown>> = [];

    await dispatchWahaEvent(
      adminForTest(updates) as never,
      { id: "session-1", organization_id: "org-1" } as never,
      inbound,
      "req-1",
    );

    expect(updates).toHaveLength(0);
  });
});

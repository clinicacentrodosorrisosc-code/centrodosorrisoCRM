import { describe, expect, it } from "vitest";

import { claimReminderDispatch } from "./dispatch-claim";

const key = {
  organizationId: "org-1",
  leadId: "lead-1",
  configId: "config-1",
  appointmentDate: "2026-08-31",
  offsetHours: 2,
};

describe("claimReminderDispatch", () => {
  it("deixa apenas uma execu??o reservar o mesmo lembrete de 2h", async () => {
    const claimed = new Set<string>();
    const admin = {
      from: () => ({
        insert: async (row: {
          lead_id: string;
          config_id: string;
          agendamento_data: string;
          offset_hours: number;
        }) => {
          const id = `${row.lead_id}:${row.config_id}:${row.agendamento_data}:${row.offset_hours}`;
          if (claimed.has(id)) return { error: { code: "23505" } };
          claimed.add(id);
          return { error: null };
        },
      }),
    };

    const [first, second] = await Promise.all([
      claimReminderDispatch(admin as never, key),
      claimReminderDispatch(admin as never, key),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(claimed.size).toBe(1);
  });

  it("propaga falha de reserva que n?o seja duplicidade", async () => {
    const admin = {
      from: () => ({ insert: async () => ({ error: { code: "42P01" } }) }),
    };

    await expect(claimReminderDispatch(admin as never, key)).rejects.toThrow(
      "reminder_dispatch_claim_failed:42P01",
    );
  });
});

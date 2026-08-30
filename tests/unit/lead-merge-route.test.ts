import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const PRIMARY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECONDARY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/leads/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER },
    org: { orgId: ORG, name: "Org", role: "manager" },
  } as never);
});

describe("POST /api/v1/leads/merge", () => {
  it("valida, chama a transação no tenant ativo e audita", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: PRIMARY, title: "Lead final" }],
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    const { POST } = await import("@/app/api/v1/leads/merge/route");

    const response = await POST(request({
      primary_lead_id: PRIMARY,
      secondary_lead_ids: [SECONDARY],
      fields: { title: "Lead final", owner_user_id: USER, owner_agent_id: null },
    }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fn_merge_crm_leads", expect.objectContaining({
      p_organization_id: ORG,
      p_primary_lead_id: PRIMARY,
      p_secondary_lead_ids: [SECONDARY],
    }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "lead.merged",
      organizationId: ORG,
      resourceId: PRIMARY,
    }));
  });

  it("recusa principal repetido entre os secundários antes do banco", async () => {
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    const { POST } = await import("@/app/api/v1/leads/merge/route");

    const response = await POST(request({
      primary_lead_id: PRIMARY,
      secondary_lead_ids: [PRIMARY],
      fields: {},
    }));

    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("contrato da mesclagem de leads", () => {
  const migration = readFileSync(
    "supabase/migrations/20260829120000_0165_merge_leads.sql",
    "utf8",
  );
  const baseline = readFileSync("supabase/baseline.sql", "utf8");
  const manifest = readFileSync("supabase/migrations/MANIFEST.md", "utf8");

  it("mantém migration, baseline e manifesto sincronizados", () => {
    for (const sql of [migration, baseline]) {
      expect(sql).toContain("fn_merge_crm_leads");
      expect(sql).toContain("update public.crm_lead_activities set lead_id");
      expect(sql).toContain("update public.crm_lead_reactivations set lead_id");
      expect(sql).toContain("delete from public.crm_leads");
    }
    expect(manifest).toContain("0165_merge_leads");
  });

  it("restringe a função ao tenant e remove execução anônima", () => {
    expect(migration).toContain("fn_role_at_least(p_organization_id, 'agent')");
    expect(migration).toContain("fn_can_view_lead(organization_id, owner_user_id)");
    expect(migration).toMatch(/revoke execute on function public\.fn_merge_crm_leads[\s\S]*from public, anon;/);
  });
});

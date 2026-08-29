import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createCalendarEventSchema, updateCalendarEventSchema } from "@/lib/calendar/schemas";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";

describe("Calendar vivo", () => {
  it("recusa intervalo invertido e aceita alteração parcial", () => {
    const invalid = createCalendarEventSchema.safeParse({
      title: "Consulta",
      starts_at: "2026-08-29T15:00:00-03:00",
      ends_at: "2026-08-29T14:30:00-03:00",
    });
    expect(invalid.success).toBe(false);
    expect(updateCalendarEventSchema.safeParse({ status: "cancelled", reason: "Cliente pediu" }).success).toBe(true);
  });

  it("publica as seis capacidades MCP do Calendar", () => {
    const names = TOOL_CATALOG.map((tool) => tool.name).filter((name) => name.startsWith("crm_calendar_"));
    expect(names).toEqual([
      "crm_calendar_list_events",
      "crm_calendar_check_availability",
      "crm_calendar_list_categories",
      "crm_calendar_create_event",
      "crm_calendar_update_event",
      "crm_calendar_cancel_event",
    ]);
  });

  it("mantém migration, baseline e manifesto em sincronia", () => {
    const migration = readFileSync("supabase/migrations/20260829110000_0164_calendar_vivo.sql", "utf8");
    const baseline = readFileSync("supabase/baseline.sql", "utf8");
    const manifest = readFileSync("supabase/migrations/MANIFEST.md", "utf8");
    for (const table of ["calendar_event_types", "calendar_member_settings", "calendar_connections", "calendar_events", "calendar_event_history"]) {
      expect(migration).toContain(`public.${table}`);
      expect(baseline).toContain(`public.${table}`);
    }
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.calendar_event_types");
    expect(manifest).toContain("0164");
  });
});

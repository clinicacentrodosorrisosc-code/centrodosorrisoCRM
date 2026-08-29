import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

describe("0164 · Calendar vivo chega isolado ao clone", () => {
  const tables = [
    "calendar_event_types",
    "calendar_member_settings",
    "calendar_connections",
    "calendar_events",
    "calendar_event_history",
  ];

  it("cria as cinco tabelas e liga RLS em todas", () => {
    const rows = sql(`select relname from pg_class where relname = any(array[${tables.map((name) => `'${name}'`).join(",")}]) and relrowsecurity order by relname`).split("\n").filter(Boolean);
    expect(rows).toEqual([...tables].sort());
  });

  it("não concede os tokens Google à role autenticada", () => {
    const granted = sql(`select count(*) from information_schema.column_privileges where table_schema='public' and table_name='calendar_connections' and grantee='authenticated' and column_name in ('access_token_encrypted','refresh_token_encrypted','sync_token')`);
    expect(granted).toBe("0");
  });

  it("histórico é append-only para usuário autenticado", () => {
    const grants = sql(`select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='calendar_event_history' and grantee='authenticated' order by privilege_type`).split("\n").filter(Boolean);
    expect(grants).toContain("INSERT");
    expect(grants).toContain("SELECT");
    expect(grants).not.toContain("DELETE");
    expect(grants).not.toContain("UPDATE");
  });

  it("responsável precisa pertencer à mesma organização por FK composta", () => {
    const definition = sql(`select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.calendar_events'::regclass and contype='f' and pg_get_constraintdef(oid) like '%assigned_user_id%organization_id%'`);
    expect(definition).toContain("user_organizations");
  });
});

import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_CONTACT_1,
  GOV_CONTACT_2,
  GOV_MANAGER,
  GOV_ORG,
  GOV_PIPELINE,
  GOV_STAGE,
  seedGov,
  sql,
} from "./gov-helpers";

const PRIMARY = "eeeeeeee-1000-4000-8000-000000000001";
const SECONDARY = "eeeeeeee-1000-4000-8000-000000000002";
const HIDDEN_PRIMARY = "eeeeeeee-1000-4000-8000-000000000003";
const HIDDEN_SECONDARY = "eeeeeeee-1000-4000-8000-000000000004";
const LINK = "eeeeeeee-2000-4000-8000-000000000001";
const ACTIVITY = "eeeeeeee-3000-4000-8000-000000000001";
const REACTIVATION = "eeeeeeee-4000-4000-8000-000000000001";
const DEMANDA = "eeeeeeee-5000-4000-8000-000000000001";
const EVENT = "eeeeeeee-6000-4000-8000-000000000001";

function callAs(userId: string, statement: string): { ok: boolean; output: string } {
  try {
    return {
      ok: true,
      output: sql(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
        ${statement}
      `),
    };
  } catch (error) {
    return {
      ok: false,
      output: (error as { stderr?: string }).stderr ?? String(error),
    };
  }
}

beforeAll(() => {
  seedGov();
  sql(`
    delete from public.crm_leads
     where id in ('${PRIMARY}', '${SECONDARY}', '${HIDDEN_PRIMARY}', '${HIDDEN_SECONDARY}');

    insert into public.crm_leads
      (id, organization_id, pipeline_id, stage_id, contact_id, title, description,
       value_cents, owner_user_id, owner_kind, tags, custom_fields)
    values
      ('${PRIMARY}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${GOV_CONTACT_1}',
       'Card principal', 'Descrição principal', 1000, '${GOV_MANAGER}', 'user',
       array['principal'], '{"preferencia":"principal"}'::jsonb),
      ('${SECONDARY}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${GOV_CONTACT_2}',
       'Card secundário', 'Descrição secundária', 2500, '${GOV_AGENT_A}', 'user',
       array['secundario'], '{"preferencia":"secundario"}'::jsonb),
      ('${HIDDEN_PRIMARY}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', null,
       'Lead do agente A', null, null, '${GOV_AGENT_A}', 'user', '{}', '{}'::jsonb),
      ('${HIDDEN_SECONDARY}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', null,
       'Lead do agente B', null, null, '${GOV_AGENT_B}', 'user', '{}', '{}'::jsonb);

    insert into public.crm_lead_activities
      (id, organization_id, lead_id, contact_id, source_module, type)
    values ('${ACTIVITY}', '${GOV_ORG}', '${SECONDARY}', '${GOV_CONTACT_2}', 'crm', 'note');

    insert into public.crm_lead_links
      (id, organization_id, lead_id, target_kind, target_id, link_kind)
    values ('${LINK}', '${GOV_ORG}', '${SECONDARY}', 'contact', '${GOV_CONTACT_2}', 'related');

    insert into public.crm_lead_scores
      (lead_id, organization_id, ai_probability, ai_probability_band)
    values ('${SECONDARY}', '${GOV_ORG}', 73, 'quente');

    insert into public.crm_lead_reactivations
      (id, lead_id, organization_id, expires_at)
    values ('${REACTIVATION}', '${SECONDARY}', '${GOV_ORG}', now() + interval '2 days');

    insert into public.demandas (id, organization_id, contact_id, lead_id, assunto)
    values ('${DEMANDA}', '${GOV_ORG}', '${GOV_CONTACT_2}', '${SECONDARY}', 'Retorno');

    insert into public.calendar_events
      (id, organization_id, title, starts_at, ends_at, lead_id, contact_id)
    values ('${EVENT}', '${GOV_ORG}', 'Consulta', now() + interval '1 day',
            now() + interval '1 day 1 hour', '${SECONDARY}', '${GOV_CONTACT_2}');
  `);
});

describe("0165 · mesclagem transacional de leads", () => {
  it("impede o atendente de mesclar um card que não pode visualizar", () => {
    const result = callAs(
      GOV_AGENT_A,
      `select (public.fn_merge_crm_leads(
        '${GOV_ORG}', '${HIDDEN_PRIMARY}', array['${HIDDEN_SECONDARY}']::uuid[], '{}'::jsonb
      )).id;`,
    );

    expect(result.ok).toBe(false);
    expect(result.output).toContain("secondary_lead_not_found");
    expect(sql(`select count(*) from public.crm_leads where id = '${HIDDEN_SECONDARY}'`)).toBe("1");
  });

  it("mantém os dados escolhidos, transfere dependências e apaga o secundário", () => {
    const result = callAs(
      GOV_MANAGER,
      `select (public.fn_merge_crm_leads(
        '${GOV_ORG}',
        '${PRIMARY}',
        array['${SECONDARY}']::uuid[],
        jsonb_build_object(
          'title', 'Card final',
          'description', 'Descrição secundária',
          'contact_id', '${GOV_CONTACT_2}',
          'value_cents', 2500,
          'currency', 'BRL',
          'owner_user_id', '${GOV_AGENT_A}',
          'owner_agent_id', null,
          'tags', '["secundario"]'::jsonb,
          'custom_fields', '{"preferencia":"secundario"}'::jsonb
        )
      )).id;`,
    );

    expect(result.ok).toBe(true);
    expect(result.output).toContain(PRIMARY);
    expect(sql(`select count(*) from public.crm_leads where id = '${SECONDARY}'`)).toBe("0");
    expect(sql(`select concat_ws('|', title, contact_id, value_cents, owner_kind, owner_user_id) from public.crm_leads where id = '${PRIMARY}'`))
      .toBe(`Card final|${GOV_CONTACT_2}|2500|user|${GOV_AGENT_A}`);

    for (const [table, id] of [
      ["crm_lead_activities", ACTIVITY],
      ["crm_lead_links", LINK],
      ["crm_lead_reactivations", REACTIVATION],
      ["demandas", DEMANDA],
      ["calendar_events", EVENT],
    ]) {
      expect(sql(`select lead_id from public.${table} where id = '${id}'`)).toBe(PRIMARY);
    }

    expect(sql(`select lead_id from public.crm_lead_scores where lead_id = '${PRIMARY}'`)).toBe(PRIMARY);
    expect(sql(`select count(*) from public.crm_lead_activities where lead_id = '${PRIMARY}' and type = 'lead_merged'`)).toBe("1");
  });
});

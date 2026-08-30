-- 0165 — mesclagem destrutiva de cards duplicados sem perder o histórico.
create or replace function public.fn_merge_crm_leads(
  p_organization_id uuid,
  p_primary_lead_id uuid,
  p_secondary_lead_ids uuid[],
  p_fields jsonb default '{}'::jsonb
)
returns public.crm_leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary public.crm_leads%rowtype;
  v_result public.crm_leads%rowtype;
  v_expected integer;
  v_found integer;
  v_unknown text;
begin
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception using errcode = '42501', message = 'insufficient_role';
  end if;
  if p_primary_lead_id is null or p_secondary_lead_ids is null
     or cardinality(p_secondary_lead_ids) = 0
     or p_primary_lead_id = any(p_secondary_lead_ids) then
    raise exception using errcode = '22023', message = 'invalid_merge_selection';
  end if;

  select count(distinct id)::integer into v_expected
    from unnest(p_secondary_lead_ids) as ids(id);
  if v_expected <> cardinality(p_secondary_lead_ids) then
    raise exception using errcode = '22023', message = 'duplicate_secondary_id';
  end if;

  select k into v_unknown
    from jsonb_object_keys(coalesce(p_fields, '{}'::jsonb)) as keys(k)
   where k not in ('title','description','contact_id','value_cents','currency',
     'owner_user_id','owner_agent_id','expected_close_date','tags','source',
     'source_metadata','custom_fields')
   limit 1;
  if v_unknown is not null then
    raise exception using errcode = '22023', message = 'unsupported_merge_field:' || v_unknown;
  end if;

  select * into v_primary from public.crm_leads
   where id = p_primary_lead_id
     and organization_id = p_organization_id
     and (auth.uid() is null or public.fn_can_view_lead(organization_id, owner_user_id))
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'primary_lead_not_found';
  end if;

  perform 1 from public.crm_leads
   where id = any(p_secondary_lead_ids)
     and organization_id = p_organization_id
     and pipeline_id = v_primary.pipeline_id
     and (auth.uid() is null or public.fn_can_view_lead(organization_id, owner_user_id))
   for update;
  get diagnostics v_found = row_count;
  if v_found <> v_expected then
    raise exception using errcode = 'P0002', message = 'secondary_lead_not_found';
  end if;

  if p_fields->>'contact_id' is not null and not exists (
    select 1 from public.contacts
     where id = (p_fields->>'contact_id')::uuid and organization_id = p_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'contact_not_found';
  end if;
  if p_fields->>'owner_user_id' is not null and not exists (
    select 1 from public.user_organizations
     where user_id = (p_fields->>'owner_user_id')::uuid
       and organization_id = p_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'owner_user_not_found';
  end if;
  if p_fields->>'owner_agent_id' is not null and not exists (
    select 1 from public.ai_agents
     where id = (p_fields->>'owner_agent_id')::uuid
       and organization_id = p_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'owner_agent_not_found';
  end if;

  update public.crm_leads set
    title = case when p_fields ? 'title' then coalesce(nullif(btrim(p_fields->>'title'), ''), title) else title end,
    description = case when p_fields ? 'description' then p_fields->>'description' else description end,
    contact_id = case when p_fields ? 'contact_id' then (p_fields->>'contact_id')::uuid else contact_id end,
    value_cents = case when p_fields ? 'value_cents' then (p_fields->>'value_cents')::bigint else value_cents end,
    currency = case when p_fields ? 'currency' then p_fields->>'currency' else currency end,
    owner_user_id = case
      when p_fields ? 'owner_user_id' or p_fields ? 'owner_agent_id'
        then (p_fields->>'owner_user_id')::uuid
      else owner_user_id
    end,
    owner_agent_id = case
      when p_fields ? 'owner_user_id' or p_fields ? 'owner_agent_id'
        then (p_fields->>'owner_agent_id')::uuid
      else owner_agent_id
    end,
    owner_kind = case
      when p_fields ? 'owner_user_id' or p_fields ? 'owner_agent_id' then
        case
          when p_fields->>'owner_agent_id' is not null then 'ai'
          when p_fields->>'owner_user_id' is not null then 'user'
          else null
        end
      else owner_kind
    end,
    expected_close_date = case when p_fields ? 'expected_close_date' then (p_fields->>'expected_close_date')::date else expected_close_date end,
    tags = case when p_fields ? 'tags' then coalesce(array(select jsonb_array_elements_text(p_fields->'tags')), '{}'::text[]) else tags end,
    source = case when p_fields ? 'source' then p_fields->>'source' else source end,
    source_metadata = case when p_fields ? 'source_metadata' then coalesce(p_fields->'source_metadata', '{}'::jsonb) else source_metadata end,
    custom_fields = case when p_fields ? 'custom_fields' then coalesce(p_fields->'custom_fields', '{}'::jsonb) else custom_fields end,
    updated_at = now()
   where id = p_primary_lead_id and organization_id = p_organization_id;

  update public.crm_lead_activities set lead_id = p_primary_lead_id
   where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids);

  insert into public.crm_lead_links
    (organization_id, lead_id, target_kind, target_id, link_kind, metadata, created_at, created_by_user_id)
  select organization_id, p_primary_lead_id, target_kind, target_id, link_kind,
         metadata, created_at, created_by_user_id
    from public.crm_lead_links
   where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids)
  on conflict (lead_id, target_kind, target_id, link_kind) do nothing;
  delete from public.crm_lead_links
   where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids);

  update public.agent_cases set lead_id = p_primary_lead_id
   where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids);
  update public.demandas set lead_id = p_primary_lead_id
   where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids);
  update public.calendar_events set lead_id = p_primary_lead_id
   where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids);

  -- Só pode existir uma proposta pendente por lead. Mantém a do principal; se
  -- ele não tiver uma, mantém a pendente secundária mais recente. As demais
  -- viram histórico encerrado antes de todos os registros serem transferidos.
  with pending_secondary as (
    select id,
           row_number() over (order by proposed_at desc, id) as position,
           exists (
             select 1 from public.crm_lead_reactivations
              where lead_id = p_primary_lead_id and status = 'pending'
           ) as primary_has_pending
      from public.crm_lead_reactivations
     where organization_id = p_organization_id
       and lead_id = any(p_secondary_lead_ids)
       and status = 'pending'
  )
  update public.crm_lead_reactivations as reaction
     set status = 'dismissed', decided_at = now(), updated_at = now()
    from pending_secondary
   where reaction.id = pending_secondary.id
     and (pending_secondary.primary_has_pending or pending_secondary.position > 1);

  update public.crm_lead_reactivations set lead_id = p_primary_lead_id
   where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids);

  if not exists (select 1 from public.crm_lead_scores where lead_id = p_primary_lead_id) then
    update public.crm_lead_scores set lead_id = p_primary_lead_id
     where lead_id = (
       select lead_id from public.crm_lead_scores
        where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids)
        order by updated_at desc nulls last limit 1
     );
  end if;
  if not exists (select 1 from public.crm_lead_risk_states where lead_id = p_primary_lead_id) then
    update public.crm_lead_risk_states set lead_id = p_primary_lead_id
     where lead_id = (
       select lead_id from public.crm_lead_risk_states
        where organization_id = p_organization_id and lead_id = any(p_secondary_lead_ids)
        order by updated_at desc nulls last limit 1
     );
  end if;

  delete from public.crm_leads
   where organization_id = p_organization_id and id = any(p_secondary_lead_ids);

  insert into public.crm_lead_activities
    (organization_id, lead_id, contact_id, source_module, source_id, type,
     payload, metadata, performed_at, performed_by_user_id)
  values (p_organization_id, p_primary_lead_id,
    case when p_fields ? 'contact_id' then (p_fields->>'contact_id')::uuid else v_primary.contact_id end,
    'crm', p_primary_lead_id, 'lead_merged',
    jsonb_build_object('secondary_lead_ids', to_jsonb(p_secondary_lead_ids)),
    '{}'::jsonb, now(), auth.uid());

  select * into v_result from public.crm_leads where id = p_primary_lead_id;
  return v_result;
end;
$$;

revoke execute on function public.fn_merge_crm_leads(uuid, uuid, uuid[], jsonb)
  from public, anon;
grant execute on function public.fn_merge_crm_leads(uuid, uuid, uuid[], jsonb)
  to authenticated, service_role;
notify pgrst, 'reload schema';

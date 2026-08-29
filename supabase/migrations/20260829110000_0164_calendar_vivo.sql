-- 0164 — Calendar vivo: agendas, categorias, eventos, histórico e Google BYO.

create table if not exists public.calendar_event_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 1440),
  color_hex text not null default '#2563EB' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  location_type text not null default 'in_person' check (location_type in ('in_person', 'phone', 'video', 'other')),
  location_value text,
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 720),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 720),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (organization_id, id)
);

create table if not exists public.calendar_member_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  color_hex text not null default '#2563EB' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  timezone text not null default 'America/Sao_Paulo',
  is_bookable boolean not null default true,
  working_hours jsonb not null default '{}'::jsonb,
  default_external_calendar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  provider_account_id text,
  provider_email text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
  external_calendar_id text not null default 'primary',
  sync_token text,
  channel_id text,
  channel_resource_id text,
  channel_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, provider),
  unique (organization_id, id)
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 255),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'completed', 'no_show', 'cancelled')),
  lead_id uuid references public.crm_leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  location_type text not null default 'in_person' check (location_type in ('in_person', 'phone', 'video', 'other')),
  location_value text,
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  source text not null default 'internal' check (source in ('internal', 'google')),
  connection_id uuid,
  external_provider text check (external_provider is null or external_provider in ('google')),
  external_calendar_id text,
  external_event_id text,
  external_etag text,
  external_ical_uid text,
  external_updated_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'error', 'external_only', 'not_connected')),
  sync_error_code text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (organization_id, event_type_id) references public.calendar_event_types(organization_id, id) on delete set null,
  foreign key (organization_id, connection_id) references public.calendar_connections(organization_id, id) on delete set null,
  foreign key (assigned_user_id, organization_id) references public.user_organizations(user_id, organization_id),
  unique (connection_id, external_event_id),
  unique (organization_id, id)
);

create table if not exists public.calendar_event_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  action text not null check (action in ('created', 'updated', 'cancelled', 'completed', 'synced', 'sync_failed', 'imported')),
  actor_type text not null default 'user' check (actor_type in ('user', 'agent', 'system', 'google')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_id text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id, event_id) references public.calendar_events(organization_id, id) on delete cascade
);

create index if not exists calendar_events_org_period_idx on public.calendar_events (organization_id, starts_at, ends_at);
create index if not exists calendar_events_org_assignee_idx on public.calendar_events (organization_id, assigned_user_id, starts_at);
create index if not exists calendar_events_org_lead_idx on public.calendar_events (organization_id, lead_id) where lead_id is not null;
create index if not exists calendar_history_org_created_idx on public.calendar_event_history (organization_id, created_at desc);
create index if not exists calendar_connections_sync_idx on public.calendar_connections (organization_id, status, last_synced_at);

alter table public.calendar_event_types enable row level security;
alter table public.calendar_member_settings enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_event_history enable row level security;

drop policy if exists "calendar event types read" on public.calendar_event_types;
create policy "calendar event types read" on public.calendar_event_types for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "calendar event types manage" on public.calendar_event_types;
create policy "calendar event types manage" on public.calendar_event_types for all using (public.fn_role_at_least(organization_id, 'manager')) with check (public.fn_role_at_least(organization_id, 'manager'));
drop policy if exists "calendar member settings read" on public.calendar_member_settings;
create policy "calendar member settings read" on public.calendar_member_settings for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "calendar member settings manage" on public.calendar_member_settings;
create policy "calendar member settings manage" on public.calendar_member_settings for all using (user_id = auth.uid() or public.fn_role_at_least(organization_id, 'manager')) with check (user_id = auth.uid() or public.fn_role_at_least(organization_id, 'manager'));
drop policy if exists "calendar connections tenant read" on public.calendar_connections;
create policy "calendar connections tenant read" on public.calendar_connections for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "calendar events read" on public.calendar_events;
create policy "calendar events read" on public.calendar_events for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "calendar events create" on public.calendar_events;
create policy "calendar events create" on public.calendar_events for insert with check (
  public.fn_role_at_least(organization_id, 'agent')
  and (lead_id is null or exists (select 1 from public.crm_leads l where l.id = calendar_events.lead_id and l.organization_id = calendar_events.organization_id))
  and (contact_id is null or exists (select 1 from public.contacts c where c.id = calendar_events.contact_id and c.organization_id = calendar_events.organization_id))
);
drop policy if exists "calendar events update" on public.calendar_events;
create policy "calendar events update" on public.calendar_events for update using (public.fn_role_at_least(organization_id, 'agent')) with check (
  public.fn_role_at_least(organization_id, 'agent')
  and (lead_id is null or exists (select 1 from public.crm_leads l where l.id = calendar_events.lead_id and l.organization_id = calendar_events.organization_id))
  and (contact_id is null or exists (select 1 from public.contacts c where c.id = calendar_events.contact_id and c.organization_id = calendar_events.organization_id))
);
drop policy if exists "calendar events delete" on public.calendar_events;
create policy "calendar events delete" on public.calendar_events for delete using (public.fn_role_at_least(organization_id, 'manager'));
drop policy if exists "calendar history read" on public.calendar_event_history;
create policy "calendar history read" on public.calendar_event_history for select using (organization_id in (select public.fn_user_org_ids()));
drop policy if exists "calendar history append" on public.calendar_event_history;
create policy "calendar history append" on public.calendar_event_history for insert with check (public.fn_role_at_least(organization_id, 'agent'));

grant select, insert, update, delete on public.calendar_event_types to authenticated;
grant select, insert, update, delete on public.calendar_member_settings to authenticated;
grant select (id, organization_id, user_id, provider, provider_account_id, token_expires_at, scopes, status, external_calendar_id, last_synced_at, last_error_at, last_error_code, created_at, updated_at) on public.calendar_connections to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert on public.calendar_event_history to authenticated;
grant all on public.calendar_event_types, public.calendar_member_settings, public.calendar_connections, public.calendar_events, public.calendar_event_history to service_role;
revoke update, delete on public.calendar_event_history from authenticated, anon;
revoke all on public.calendar_event_types, public.calendar_member_settings, public.calendar_connections, public.calendar_events, public.calendar_event_history from anon;

notify pgrst, 'reload schema';

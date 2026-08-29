import type { SupabaseClient } from "@supabase/supabase-js";

import type { CalendarActor, CalendarEvent } from "./types";
import type { CreateCalendarEventInput, UpdateCalendarEventInput } from "./schemas";

export class CalendarDomainError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid_reference" | "conflict" | "db_error",
    message: string,
  ) {
    super(message);
  }
}

interface CalendarContext {
  db: SupabaseClient;
  organizationId: string;
  actor: CalendarActor;
}

async function assertReference(
  ctx: CalendarContext,
  table: "crm_leads" | "contacts" | "calendar_event_types",
  id: string | null | undefined,
): Promise<void> {
  if (!id) return;
  const { data, error } = await ctx.db
    .from(table)
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new CalendarDomainError("db_error", error.message);
  if (!data) throw new CalendarDomainError("invalid_reference", `Referência inválida em ${table}.`);
}

async function assertMember(ctx: CalendarContext, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const { data, error } = await ctx.db
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", ctx.organizationId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new CalendarDomainError("db_error", error.message);
  if (!data) throw new CalendarDomainError("invalid_reference", "O responsável não pertence a esta organização.");
}

async function appendHistory(
  ctx: CalendarContext,
  eventId: string,
  action: "created" | "updated" | "cancelled" | "completed" | "synced" | "sync_failed" | "imported",
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null,
  reason?: string | null,
): Promise<void> {
  const { error } = await ctx.db.from("calendar_event_history").insert({
    organization_id: ctx.organizationId,
    event_id: eventId,
    action,
    actor_type: ctx.actor.type,
    actor_user_id: ctx.actor.userId,
    actor_id: ctx.actor.type === "user" ? null : ctx.actor.id,
    reason: reason ?? null,
    before_state: beforeState,
    after_state: afterState,
  });
  if (error) throw new CalendarDomainError("db_error", error.message);
}

async function linkedConnectionId(ctx: CalendarContext, assignedUserId?: string | null): Promise<string | null> {
  if (!assignedUserId) return null;
  const { data } = await ctx.db
    .from("calendar_connections")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("user_id", assignedUserId)
    .eq("provider", "google")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function createCalendarEvent(
  ctx: CalendarContext,
  input: CreateCalendarEventInput,
): Promise<CalendarEvent> {
  await Promise.all([
    assertReference(ctx, "crm_leads", input.lead_id),
    assertReference(ctx, "contacts", input.contact_id),
    assertReference(ctx, "calendar_event_types", input.event_type_id),
    assertMember(ctx, input.assigned_user_id),
  ]);

  const connectionId = await linkedConnectionId(ctx, input.assigned_user_id);
  const { data, error } = await ctx.db
    .from("calendar_events")
    .insert({
      ...input,
      organization_id: ctx.organizationId,
      description: input.description ?? null,
      event_type_id: input.event_type_id ?? null,
      lead_id: input.lead_id ?? null,
      contact_id: input.contact_id ?? null,
      assigned_user_id: input.assigned_user_id ?? null,
      location_value: input.location_value ?? null,
      color_hex: input.color_hex ?? null,
      source: "internal",
      connection_id: connectionId,
      sync_status: connectionId ? "pending" : "not_connected",
      created_by: ctx.actor.userId,
      updated_by: ctx.actor.userId,
    })
    .select("*")
    .single();
  if (error || !data) throw new CalendarDomainError("db_error", error?.message ?? "Falha ao criar agendamento.");
  const event = data as CalendarEvent;
  await appendHistory(ctx, event.id, "created", null, event as unknown as Record<string, unknown>);
  return event;
}

export async function updateCalendarEvent(
  ctx: CalendarContext,
  eventId: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent> {
  const { reason, ...patch } = input;
  const { data: current, error: currentError } = await ctx.db
    .from("calendar_events")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("id", eventId)
    .maybeSingle();
  if (currentError) throw new CalendarDomainError("db_error", currentError.message);
  if (!current) throw new CalendarDomainError("not_found", "Agendamento não encontrado.");

  await Promise.all([
    assertReference(ctx, "crm_leads", patch.lead_id),
    assertReference(ctx, "contacts", patch.contact_id),
    assertReference(ctx, "calendar_event_types", patch.event_type_id),
    assertMember(ctx, patch.assigned_user_id),
  ]);
  const startsAt = patch.starts_at ?? current.starts_at;
  const endsAt = patch.ends_at ?? current.ends_at;
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new CalendarDomainError("conflict", "O término precisa ser posterior ao início.");
  }

  const assigned = patch.assigned_user_id === undefined ? current.assigned_user_id : patch.assigned_user_id;
  const connectionId = await linkedConnectionId(ctx, assigned);
  const nextStatus = patch.status ?? current.status;
  const { data, error } = await ctx.db
    .from("calendar_events")
    .update({
      ...patch,
      connection_id: connectionId,
      sync_status: connectionId ? "pending" : "not_connected",
      sync_error_code: null,
      cancelled_at: nextStatus === "cancelled" ? new Date().toISOString() : null,
      updated_by: ctx.actor.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", ctx.organizationId)
    .eq("id", eventId)
    .select("*")
    .single();
  if (error || !data) throw new CalendarDomainError("db_error", error?.message ?? "Falha ao alterar agendamento.");
  const event = data as CalendarEvent;
  const action = nextStatus === "cancelled" ? "cancelled" : nextStatus === "completed" ? "completed" : "updated";
  await appendHistory(
    ctx,
    event.id,
    action,
    current as Record<string, unknown>,
    event as unknown as Record<string, unknown>,
    reason,
  );
  return event;
}

export async function listCalendarEvents(
  ctx: Pick<CalendarContext, "db" | "organizationId">,
  input: { from: string; to: string; assignedUserId?: string; eventTypeId?: string; status?: string },
): Promise<CalendarEvent[]> {
  let query = ctx.db
    .from("calendar_events")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .lt("starts_at", input.to)
    .gt("ends_at", input.from)
    .order("starts_at", { ascending: true });
  if (input.assignedUserId) query = query.eq("assigned_user_id", input.assignedUserId);
  if (input.eventTypeId) query = query.eq("event_type_id", input.eventTypeId);
  if (input.status) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) throw new CalendarDomainError("db_error", error.message);
  return (data ?? []) as CalendarEvent[];
}

export async function findBusyIntervals(
  ctx: Pick<CalendarContext, "db" | "organizationId">,
  input: { from: string; to: string; assignedUserId: string },
): Promise<Array<{ starts_at: string; ends_at: string }>> {
  const events = await listCalendarEvents(ctx, {
    from: input.from,
    to: input.to,
    assignedUserId: input.assignedUserId,
  });
  return events
    .filter((event) => event.status !== "cancelled")
    .map((event) => ({ starts_at: event.starts_at, ends_at: event.ends_at }));
}

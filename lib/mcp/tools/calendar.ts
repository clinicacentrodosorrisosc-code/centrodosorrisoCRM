import { z } from "zod";

import { audit } from "@/lib/audit";
import { calendarEventFieldsShape, createCalendarEventSchema, updateCalendarEventSchema } from "@/lib/calendar/schemas";
import { createCalendarEvent, findBusyIntervals, listCalendarEvents, updateCalendarEvent } from "@/lib/calendar/service";
import type { McpContext, McpToolDefinition } from "../types";

function actor(ctx: McpContext) {
  return ctx.actor.type === "user"
    ? { type: "user" as const, id: ctx.actor.id, userId: ctx.actor.id }
    : { type: "agent" as const, id: ctx.actor.id, userId: null };
}

const listShape = {
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  assigned_user_id: z.string().uuid().optional(),
  event_type_id: z.string().uuid().optional(),
};
export const crmCalendarListEvents: McpToolDefinition<typeof listShape> = {
  name: "crm_calendar_list_events",
  description: "Lista agendamentos do Calendar em um período ISO 8601. Pode filtrar por responsável ou categoria. A resposta inclui o instante atual do servidor para o agente se orientar.",
  inputSchema: listShape, category: "read", requiresRole: "agent", requiresScope: "mcp:read",
  handler: async (input, ctx) => ({
    server_now: new Date().toISOString(),
    events: await listCalendarEvents({ db: ctx.supabase, organizationId: ctx.organizationId }, { from: input.from, to: input.to, assignedUserId: input.assigned_user_id, eventTypeId: input.event_type_id }),
  }),
};

const availabilityShape = {
  assigned_user_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
};
export const crmCalendarCheckAvailability: McpToolDefinition<typeof availabilityShape> = {
  name: "crm_calendar_check_availability",
  description: "Confere se uma agenda está livre entre dois instantes ISO 8601. Retorna os compromissos que colidem; não presume horário comercial.",
  inputSchema: availabilityShape, category: "read", requiresRole: "agent", requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const conflicts = await findBusyIntervals({ db: ctx.supabase, organizationId: ctx.organizationId }, { from: input.starts_at, to: input.ends_at, assignedUserId: input.assigned_user_id });
    return { available: conflicts.length === 0, conflicts, server_now: new Date().toISOString() };
  },
};

const categoriesShape = { active_only: z.boolean().default(true) };
export const crmCalendarListCategories: McpToolDefinition<typeof categoriesShape> = {
  name: "crm_calendar_list_categories",
  description: "Lista as categorias configuradas pela organização, com duração, formato, cor e intervalos. Use antes de criar um agendamento quando o tipo ainda não for conhecido.",
  inputSchema: categoriesShape, category: "read", requiresRole: "agent", requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    let query = ctx.supabase.from("calendar_event_types").select("id,name,description,duration_minutes,location_type,location_value,buffer_before_minutes,buffer_after_minutes,color_hex,is_active").eq("organization_id", ctx.organizationId).order("name");
    if (input.active_only) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { categories: data ?? [] };
  },
};

const createShape = calendarEventFieldsShape;
export const crmCalendarCreateEvent: McpToolDefinition<typeof createShape> = {
  name: "crm_calendar_create_event",
  description: "Cria um agendamento real no Calendar e registra a ação no histórico. Use IDs obtidos nas ferramentas de leads, equipe e categorias. O término deve ser posterior ao início.",
  inputSchema: createShape, category: "write", requiresRole: "ai_operator", requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const parsed = createCalendarEventSchema.parse(input);
    const event = await createCalendarEvent({ db: ctx.supabase, organizationId: ctx.organizationId, actor: actor(ctx) }, parsed);
    await audit({ action: "calendar.event_created", actorApiTokenId: ctx.apiTokenId, organizationId: ctx.organizationId, resourceType: "calendar_event", resourceId: event.id, requestId: ctx.requestId, metadata: { via: "mcp", actor_id: ctx.actor.id } });
    return { created: true, event };
  },
};

const updateShape = {
  event_id: z.string().uuid(),
  title: calendarEventFieldsShape.title.optional(),
  description: calendarEventFieldsShape.description,
  starts_at: calendarEventFieldsShape.starts_at.optional(),
  ends_at: calendarEventFieldsShape.ends_at.optional(),
  timezone: calendarEventFieldsShape.timezone.optional(),
  status: calendarEventFieldsShape.status.optional(),
  event_type_id: calendarEventFieldsShape.event_type_id,
  lead_id: calendarEventFieldsShape.lead_id,
  contact_id: calendarEventFieldsShape.contact_id,
  assigned_user_id: calendarEventFieldsShape.assigned_user_id,
  location_type: calendarEventFieldsShape.location_type.optional(),
  location_value: calendarEventFieldsShape.location_value,
  color_hex: calendarEventFieldsShape.color_hex,
  reason: z.string().max(500).optional(),
};
export const crmCalendarUpdateEvent: McpToolDefinition<typeof updateShape> = {
  name: "crm_calendar_update_event",
  description: "Altera um agendamento existente e registra antes/depois no histórico. Envie event_id e somente os campos que precisam mudar.",
  inputSchema: updateShape, category: "write", requiresRole: "ai_operator", requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const { event_id, ...changes } = input;
    const parsed = updateCalendarEventSchema.parse(changes);
    const event = await updateCalendarEvent({ db: ctx.supabase, organizationId: ctx.organizationId, actor: actor(ctx) }, event_id, parsed);
    await audit({ action: "calendar.event_updated", actorApiTokenId: ctx.apiTokenId, organizationId: ctx.organizationId, resourceType: "calendar_event", resourceId: event.id, requestId: ctx.requestId, metadata: { via: "mcp", actor_id: ctx.actor.id } });
    return { updated: true, event };
  },
};

const cancelShape = { event_id: z.string().uuid(), reason: z.string().min(1).max(500) };
export const crmCalendarCancelEvent: McpToolDefinition<typeof cancelShape> = {
  name: "crm_calendar_cancel_event",
  description: "Cancela um agendamento, preserva o registro e grava o motivo no histórico. A sincronização também cancela o evento no Google quando conectado.",
  inputSchema: cancelShape, category: "write", requiresRole: "ai_operator", requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const event = await updateCalendarEvent({ db: ctx.supabase, organizationId: ctx.organizationId, actor: actor(ctx) }, input.event_id, { status: "cancelled", reason: input.reason });
    await audit({ action: "calendar.event_cancelled", actorApiTokenId: ctx.apiTokenId, organizationId: ctx.organizationId, resourceType: "calendar_event", resourceId: event.id, requestId: ctx.requestId, metadata: { via: "mcp", actor_id: ctx.actor.id } });
    return { cancelled: true, event };
  },
};

export const CALENDAR_MCP_TOOLS = [crmCalendarListEvents, crmCalendarCheckAvailability, crmCalendarListCategories, crmCalendarCreateEvent, crmCalendarUpdateEvent, crmCalendarCancelEvent] as const;

import { z } from "zod";

export const calendarLocationSchema = z.enum(["in_person", "phone", "video", "other"]);
export const calendarStatusSchema = z.enum([
  "confirmed",
  "tentative",
  "completed",
  "no_show",
  "cancelled",
]);

export const calendarEventFieldsShape = {
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4_000).nullable().optional(),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(100).default("America/Sao_Paulo"),
    status: calendarStatusSchema.default("confirmed"),
    event_type_id: z.string().uuid().nullable().optional(),
    lead_id: z.string().uuid().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    assigned_user_id: z.string().uuid().nullable().optional(),
    location_type: calendarLocationSchema.default("in_person"),
    location_value: z.string().trim().max(500).nullable().optional(),
    color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  };

const calendarEventFieldsSchema = z.object(calendarEventFieldsShape);

export const createCalendarEventSchema = calendarEventFieldsSchema
  .superRefine((value, ctx) => {
    if (new Date(value.ends_at).getTime() <= new Date(value.starts_at).getTime()) {
      ctx.addIssue({ code: "custom", path: ["ends_at"], message: "O término precisa ser posterior ao início." });
    }
  });

export const updateCalendarEventSchema = calendarEventFieldsSchema
  .partial()
  .extend({ reason: z.string().trim().max(500).optional() });

export const listCalendarEventsSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  assigned_user_id: z.string().uuid().optional(),
  event_type_id: z.string().uuid().optional(),
  status: calendarStatusSchema.optional(),
});

export const createCalendarEventTypeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(1_000).nullable().optional(),
  duration_minutes: z.number().int().min(5).max(1_440).default(30),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#2563EB"),
  location_type: calendarLocationSchema.default("in_person"),
  location_value: z.string().trim().max(500).nullable().optional(),
  buffer_before_minutes: z.number().int().min(0).max(720).default(0),
  buffer_after_minutes: z.number().int().min(0).max(720).default(0),
});

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

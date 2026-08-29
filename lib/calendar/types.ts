export type CalendarEventStatus =
  | "confirmed"
  | "tentative"
  | "completed"
  | "no_show"
  | "cancelled";

export type CalendarLocationType = "in_person" | "phone" | "video" | "other";
export type CalendarSyncStatus = "pending" | "synced" | "error" | "external_only" | "not_connected";

export interface CalendarEvent {
  id: string;
  organization_id: string;
  event_type_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: CalendarEventStatus;
  lead_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
  location_type: CalendarLocationType;
  location_value: string | null;
  color_hex: string | null;
  source: "internal" | "google";
  connection_id: string | null;
  external_event_id: string | null;
  sync_status: CalendarSyncStatus;
  sync_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventType {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  color_hex: string;
  location_type: CalendarLocationType;
  location_value: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  is_active: boolean;
}

export interface CalendarMember {
  user_id: string;
  role: string;
  full_name: string | null;
  color_hex: string;
  timezone: string;
  is_bookable: boolean;
}

export interface CalendarActor {
  type: "user" | "agent" | "system" | "google";
  id: string | null;
  userId: string | null;
}

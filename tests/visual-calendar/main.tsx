import React from "react";
import { createRoot } from "react-dom/client";

import "../../app/globals.css";
import { CalendarClient } from "../../app/app/calendar/_components/CalendarClient";

const memberId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const now = new Date();
now.setHours(10, 0, 0, 0);

let events = [{ id: eventId, organization_id: "org", event_type_id: categoryId, title: "Consulta de avaliação", description: "Primeira consulta", starts_at: now.toISOString(), ends_at: new Date(now.getTime() + 45 * 60_000).toISOString(), timezone: "America/Sao_Paulo", status: "confirmed", lead_id: null, contact_id: null, assigned_user_id: memberId, location_type: "in_person", location_value: "Sala 2", color_hex: null, source: "internal", connection_id: null, external_event_id: null, sync_status: "not_connected", sync_error_code: null, created_at: now.toISOString(), updated_at: now.toISOString() }];
let eventTypes = [{ id: categoryId, organization_id: "org", name: "Consulta", slug: "consulta", description: null, duration_minutes: 45, color_hex: "#2563EB", location_type: "in_person", location_value: null, buffer_before_minutes: 0, buffer_after_minutes: 0, is_active: true }];
let history = [{ id: "44444444-4444-4444-8444-444444444444", event_id: eventId, action: "created", actor_type: "user", reason: null, after_state: events[0], created_at: now.toISOString() }];

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { "Content-Type": "application/json" } });
  if (url.includes("/api/v1/calendar/context")) return reply({ members: [{ user_id: memberId, role: "admin", full_name: "Ana Atendimento", color_hex: "#7C3AED", timezone: "America/Sao_Paulo", is_bookable: true }], leads: [{ id: "55555555-5555-4555-8555-555555555555", title: "Lead demonstração", contact_id: null }], contacts: [], connections: [], current_user_id: memberId });
  if (url.includes("/api/v1/calendar/event-types") && init?.method === "POST") { const created = { id: crypto.randomUUID(), organization_id: "org", description: null, location_value: null, buffer_before_minutes: 0, buffer_after_minutes: 0, is_active: true, ...body }; eventTypes = [...eventTypes, created]; return reply({ event_type: created }, 201); }
  if (url.includes("/api/v1/calendar/event-types")) return reply({ event_types: eventTypes });
  if (url.includes("/api/v1/calendar/history")) return reply({ history });
  if (url.match(/\/api\/v1\/calendar(\?|$)/) && init?.method === "POST") { const created = { id: crypto.randomUUID(), organization_id: "org", source: "internal", connection_id: null, external_event_id: null, sync_status: "not_connected", sync_error_code: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body }; events = [...events, created]; history = [{ id: crypto.randomUUID(), event_id: created.id, action: "created", actor_type: "user", reason: null, after_state: created, created_at: new Date().toISOString() }, ...history]; return reply({ event: created }, 201); }
  if (url.match(/\/api\/v1\/calendar\?/)) return reply({ events });
  return originalFetch(input, init);
};

createRoot(document.getElementById("root")!).render(<React.StrictMode><CalendarClient /></React.StrictMode>);

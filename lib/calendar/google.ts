import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v3/userinfo";
export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

interface OAuthState { organization_id: string; user_id: string; expires_at: number; nonce: string }
interface TokenResponse { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type: string }
interface ConnectionRow {
  id: string; organization_id: string; user_id: string; access_token_encrypted: string;
  refresh_token_encrypted: string | null; token_expires_at: string | null; external_calendar_id: string;
  sync_token: string | null; channel_id: string | null; channel_resource_id: string | null; channel_expires_at: string | null;
}
interface GoogleEvent {
  id: string; etag?: string; iCalUID?: string; status?: string; summary?: string; description?: string;
  location?: string; updated?: string; start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
}

function oauthSecret(): string {
  return env.GOOGLE_CALENDAR_WEBHOOK_SECRET || env.INTERNAL_SECRET;
}

export function googleCalendarConfigured(): boolean {
  return Boolean(env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET && env.GOOGLE_CALENDAR_WEBHOOK_SECRET);
}

function callbackUrl(): string {
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/v1/calendar/google/callback`;
}

export function createGoogleOAuthState(organizationId: string, userId: string): string {
  const payload: OAuthState = { organization_id: organizationId, user_id: userId, expires_at: Date.now() + 10 * 60_000, nonce: randomUUID() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", oauthSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGoogleOAuthState(state: string): OAuthState | null {
  const [encoded, supplied] = state.split(".");
  if (!encoded || !supplied || !oauthSecret()) return null;
  const expected = createHmac("sha256", oauthSecret()).update(encoded).digest("base64url");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthState;
    return payload.expires_at > Date.now() ? payload : null;
  } catch { return null; }
}

export function googleAuthorizationUrl(state: string): string {
  const query = new URLSearchParams({
    client_id: env.GOOGLE_CALENDAR_CLIENT_ID,
    redirect_uri: callbackUrl(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${query}`;
}

async function googleRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body?.error === "string" ? body.error : body?.error?.status ?? `google_http_${response.status}`;
    throw new Error(String(code));
  }
  return body as T;
}

async function stopGoogleChannel(accessToken: string, channelId: string, resourceId: string): Promise<void> {
  await googleRequest(`${GOOGLE_API}/channels/stop`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}
export async function exchangeGoogleCode(code: string): Promise<TokenResponse> {
  return googleRequest<TokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET, redirect_uri: callbackUrl(), grant_type: "authorization_code" }),
  });
}

export async function saveGoogleConnection(admin: SupabaseClient, organizationId: string, userId: string, token: TokenResponse): Promise<string> {
  const profile = await googleRequest<{ sub: string; email?: string }>(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const accessEncrypted = await encryptWebhookSecret(admin, token.access_token);
  const refreshEncrypted = token.refresh_token ? await encryptWebhookSecret(admin, token.refresh_token) : null;
  if (!accessEncrypted) throw new Error("token_encryption_failed");
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const { data: existing } = await admin.from("calendar_connections").select("id,refresh_token_encrypted").eq("organization_id", organizationId).eq("user_id", userId).eq("provider", "google").maybeSingle();
  const payload = {
    organization_id: organizationId, user_id: userId, provider: "google", provider_account_id: profile.sub,
    provider_email: profile.email ?? null, access_token_encrypted: accessEncrypted,
    refresh_token_encrypted: refreshEncrypted ?? existing?.refresh_token_encrypted ?? null,
    token_expires_at: expiresAt, scopes: token.scope?.split(" ") ?? [...GOOGLE_CALENDAR_SCOPES], status: "active",
    last_error_at: null, last_error_code: null, updated_at: new Date().toISOString(),
  };
  const query = existing ? admin.from("calendar_connections").update(payload).eq("organization_id", organizationId).eq("id", existing.id) : admin.from("calendar_connections").insert(payload);
  const { data, error } = await query.select("id").single();
  if (error || !data) throw new Error(error?.message ?? "connection_save_failed");
  return data.id as string;
}

async function validAccessToken(admin: SupabaseClient, connection: ConnectionRow): Promise<string> {
  const current = await decryptWebhookSecret(admin, connection.access_token_encrypted);
  if (current && (!connection.token_expires_at || new Date(connection.token_expires_at).getTime() > Date.now() + 60_000)) return current;
  if (!connection.refresh_token_encrypted) throw new Error("refresh_token_missing");
  const refresh = await decryptWebhookSecret(admin, connection.refresh_token_encrypted);
  if (!refresh) throw new Error("refresh_token_decryption_failed");
  const token = await googleRequest<TokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: env.GOOGLE_CALENDAR_CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const encrypted = await encryptWebhookSecret(admin, token.access_token);
  if (!encrypted) throw new Error("token_encryption_failed");
  await admin.from("calendar_connections").update({ access_token_encrypted: encrypted, token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, status: "active", updated_at: new Date().toISOString() }).eq("organization_id", connection.organization_id).eq("id", connection.id);
  return token.access_token;
}

function googleEventBody(event: Record<string, unknown>, organizationId: string): Record<string, unknown> {
  return {
    summary: event.title,
    description: event.description,
    location: event.location_value,
    start: { dateTime: event.starts_at, timeZone: event.timezone },
    end: { dateTime: event.ends_at, timeZone: event.timezone },
    extendedProperties: { private: { crm_event_id: event.id, crm_organization_id: organizationId, crm_lead_id: event.lead_id ?? "", crm_assigned_user_id: event.assigned_user_id ?? "" } },
  };
}

async function pushPending(admin: SupabaseClient, connection: ConnectionRow, accessToken: string): Promise<number> {
  const { data: pending, error } = await admin.from("calendar_events").select("*").eq("organization_id", connection.organization_id).eq("connection_id", connection.id).eq("sync_status", "pending").order("updated_at").limit(200);
  if (error) throw new Error(error.message);
  let pushed = 0;
  for (const event of pending ?? []) {
    try {
      let externalId = event.external_event_id as string | null;
      if (event.status === "cancelled" && externalId) {
        await googleRequest(`${GOOGLE_API}/calendars/${encodeURIComponent(connection.external_calendar_id)}/events/${encodeURIComponent(externalId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      } else if (event.status !== "cancelled") {
        const url = externalId ? `${GOOGLE_API}/calendars/${encodeURIComponent(connection.external_calendar_id)}/events/${encodeURIComponent(externalId)}` : `${GOOGLE_API}/calendars/${encodeURIComponent(connection.external_calendar_id)}/events`;
        const synced = await googleRequest<GoogleEvent>(url, { method: externalId ? "PATCH" : "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(event.external_etag ? { "If-Match": event.external_etag } : {}) }, body: JSON.stringify(googleEventBody(event, connection.organization_id)) });
        externalId = synced.id;
        await admin.from("calendar_events").update({ external_provider: "google", external_calendar_id: connection.external_calendar_id, external_event_id: synced.id, external_etag: synced.etag ?? null, external_ical_uid: synced.iCalUID ?? null, external_updated_at: synced.updated ?? null, sync_status: "synced", sync_error_code: null, updated_at: new Date().toISOString() }).eq("organization_id", connection.organization_id).eq("id", event.id);
      }
      if (event.status === "cancelled") await admin.from("calendar_events").update({ sync_status: "synced", sync_error_code: null }).eq("organization_id", connection.organization_id).eq("id", event.id);
      await admin.from("calendar_event_history").insert({ organization_id: connection.organization_id, event_id: event.id, action: "synced", actor_type: "system", actor_id: "google_sync", after_state: { external_event_id: externalId } });
      pushed += 1;
    } catch (caught) {
      const code = caught instanceof Error ? caught.message.slice(0, 120) : "google_push_failed";
      await admin.from("calendar_events").update({ sync_status: "error", sync_error_code: code }).eq("organization_id", connection.organization_id).eq("id", event.id);
      await admin.from("calendar_event_history").insert({ organization_id: connection.organization_id, event_id: event.id, action: "sync_failed", actor_type: "system", actor_id: "google_sync", reason: code });
    }
  }
  return pushed;
}

function googleTimes(event: GoogleEvent): { start: string; end: string; timezone: string } | null {
  const start = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00Z` : null);
  const end = event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T00:00:00Z` : null);
  if (!start || !end) return null;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), timezone: event.start?.timeZone ?? "UTC" };
}

async function pullExternal(admin: SupabaseClient, connection: ConnectionRow, accessToken: string): Promise<{ pulled: number; nextSyncToken: string | null }> {
  let pageToken: string | null = null;
  let nextSyncToken: string | null = connection.sync_token;
  let pulled = 0;
  do {
    const query = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "2500" });
    if (connection.sync_token) query.set("syncToken", connection.sync_token);
    else query.set("timeMin", new Date(Date.now() - 365 * 86_400_000).toISOString());
    if (pageToken) query.set("pageToken", pageToken);
    const body = await googleRequest<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(`${GOOGLE_API}/calendars/${encodeURIComponent(connection.external_calendar_id)}/events?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    for (const external of body.items ?? []) {
      const internalId = external.extendedProperties?.private?.crm_event_id;
      if (internalId) {
        const { data: current } = await admin.from("calendar_events").select("id,title,description,starts_at,ends_at,timezone,location_value,status,external_updated_at").eq("organization_id", connection.organization_id).eq("id", internalId).maybeSingle();
        if (!current) continue;
        const times = googleTimes(external);
        const changedOnGoogle = Boolean(external.updated && external.updated !== current.external_updated_at);
        const cancelledChanged = external.status === "cancelled" && current.status !== "cancelled";
        const googlePatch = {
          external_event_id: external.id, external_etag: external.etag ?? null, external_ical_uid: external.iCalUID ?? null,
          external_updated_at: external.updated ?? null, sync_status: "synced", sync_error_code: null,
          ...(changedOnGoogle && times ? { title: external.summary?.trim() || current.title, description: external.description ?? null, starts_at: times.start, ends_at: times.end, timezone: times.timezone, location_value: external.location ?? null, updated_at: new Date().toISOString() } : {}),
          ...(external.status === "cancelled" ? { status: "cancelled", cancelled_at: new Date().toISOString() } : {}),
        };
        await admin.from("calendar_events").update(googlePatch).eq("organization_id", connection.organization_id).eq("id", internalId);
        if (changedOnGoogle || cancelledChanged) await admin.from("calendar_event_history").insert({ organization_id: connection.organization_id, event_id: internalId, action: external.status === "cancelled" ? "cancelled" : "updated", actor_type: "google", actor_id: external.id, reason: external.status === "cancelled" ? "Cancelado no Google Calendar" : "Alterado no Google Calendar", before_state: current, after_state: googlePatch });
        pulled += 1;
        continue;
      }
      const { data: existing } = await admin.from("calendar_events").select("id").eq("connection_id", connection.id).eq("external_event_id", external.id).maybeSingle();
      if (external.status === "cancelled" && existing) {
        await admin.from("calendar_events").update({ status: "cancelled", cancelled_at: new Date().toISOString(), external_etag: external.etag ?? null, external_updated_at: external.updated ?? null, sync_status: "external_only", updated_at: new Date().toISOString() }).eq("organization_id", connection.organization_id).eq("id", existing.id);
        await admin.from("calendar_event_history").insert({ organization_id: connection.organization_id, event_id: existing.id, action: "cancelled", actor_type: "google", actor_id: external.id, reason: "Cancelado no Google Calendar" });
        pulled += 1;
        continue;
      }
      const times = googleTimes(external);
      if (!times) continue;
      const payload = { organization_id: connection.organization_id, title: external.summary?.trim() || "Evento sem título", description: external.description ?? null, starts_at: times.start, ends_at: times.end, timezone: times.timezone, status: external.status === "cancelled" ? "cancelled" : "confirmed", assigned_user_id: connection.user_id, location_type: external.location ? "other" : "in_person", location_value: external.location ?? null, source: "google", connection_id: connection.id, external_provider: "google", external_calendar_id: connection.external_calendar_id, external_event_id: external.id, external_etag: external.etag ?? null, external_ical_uid: external.iCalUID ?? null, external_updated_at: external.updated ?? null, sync_status: "external_only", updated_at: new Date().toISOString() };
     const result = existing ? await admin.from("calendar_events").update(payload).eq("organization_id", connection.organization_id).eq("id", existing.id).select("id").single() : await admin.from("calendar_events").insert(payload).select("id").single();
      if (!existing && result.data?.id) await admin.from("calendar_event_history").insert({ organization_id: connection.organization_id, event_id: result.data.id, action: "imported", actor_type: "google", actor_id: external.id, after_state: payload });
      pulled += 1;
    }
    pageToken = body.nextPageToken ?? null;
    if (body.nextSyncToken) nextSyncToken = body.nextSyncToken;
  } while (pageToken);
  return { pulled, nextSyncToken };
}

async function ensureWatch(admin: SupabaseClient, connection: ConnectionRow, accessToken: string): Promise<void> {
  if (!env.NEXT_PUBLIC_APP_URL.startsWith("https://") || !env.GOOGLE_CALENDAR_WEBHOOK_SECRET) return;
  const previousChannelId = connection.channel_id;
  const previousResourceId = connection.channel_resource_id;
  const channelId = randomUUID();
  const watch = await googleRequest<{ id: string; resourceId: string; expiration?: string }>(`${GOOGLE_API}/calendars/${encodeURIComponent(connection.external_calendar_id)}/events/watch`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: channelId, type: "web_hook", address: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/v1/webhooks/google-calendar`, token: env.GOOGLE_CALENDAR_WEBHOOK_SECRET }) });
  const { error } = await admin.from("calendar_connections").update({ channel_id: watch.id, channel_resource_id: watch.resourceId, channel_expires_at: watch.expiration ? new Date(Number(watch.expiration)).toISOString() : null }).eq("organization_id", connection.organization_id).eq("id", connection.id);
  if (error) throw new Error(error.message);
  if (previousChannelId && previousResourceId && previousChannelId !== watch.id) {
    await stopGoogleChannel(accessToken, previousChannelId, previousResourceId).catch(() => undefined);
  }
}

export async function disconnectGoogleConnection(admin: SupabaseClient, organizationId: string, connectionId: string): Promise<void> {
  const { data, error } = await admin.from("calendar_connections").select("*").eq("organization_id", organizationId).eq("id", connectionId).eq("provider", "google").single();
  if (error || !data) throw new Error(error?.message ?? "connection_not_found");
  const connection = data as ConnectionRow;
  try {
    const accessToken = await validAccessToken(admin, connection);
    if (connection.channel_id && connection.channel_resource_id) {
      await stopGoogleChannel(accessToken, connection.channel_id, connection.channel_resource_id);
    }
  } catch {
    // Desconectar localmente não pode depender de uma credencial externa ainda válida.
  }
  const { error: deleteError } = await admin.from("calendar_connections").delete().eq("organization_id", organizationId).eq("id", connectionId);
  if (deleteError) throw new Error(deleteError.message);
}
export async function syncGoogleConnection(admin: SupabaseClient, organizationId: string, connectionId: string): Promise<{ pushed: number; pulled: number }> {
  const { data, error } = await admin.from("calendar_connections").select("*").eq("organization_id", organizationId).eq("id", connectionId).eq("provider", "google").single();
  if (error || !data) throw new Error(error?.message ?? "connection_not_found");
  const connection = data as ConnectionRow;
  try {
    const accessToken = await validAccessToken(admin, connection);
    const pushed = await pushPending(admin, connection, accessToken);
    let pull;
    try { pull = await pullExternal(admin, connection, accessToken); }
    catch (caught) {
      if (caught instanceof Error && caught.message.includes("GONE")) { connection.sync_token = null; pull = await pullExternal(admin, connection, accessToken); }
      else throw caught;
    }
    await admin.from("calendar_connections").update({ sync_token: pull.nextSyncToken, status: "active", last_synced_at: new Date().toISOString(), last_error_at: null, last_error_code: null, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", connectionId);
    if (!connection.channel_id || !connection.channel_expires_at || new Date(connection.channel_expires_at).getTime() < Date.now() + 86_400_000) await ensureWatch(admin, connection, accessToken);
    return { pushed, pulled: pull.pulled };
  } catch (caught) {
    const code = caught instanceof Error ? caught.message.slice(0, 120) : "google_sync_failed";
    await admin.from("calendar_connections").update({ status: "error", last_error_at: new Date().toISOString(), last_error_code: code, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", connectionId);
    throw caught;
  }
}

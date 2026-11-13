import "server-only";

import type { Database, Json } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

import {
  CALENDAR_SCOPES,
  calendarLabels,
  PRODUCT_CALENDAR_DESCRIPTION,
  PRODUCT_CALENDAR_NAME,
  PRODUCT_CALENDAR_TIME_ZONE,
  type CalendarCategory
} from "./constants";
import {
  CalendarProviderError,
  GoogleCalendarClient,
  type CalendarRequestCapability,
  type GoogleCalendarListEntry
} from "./google-calendar";
import {
  buildGoogleEvent,
  deriveSchedule,
  getProductActionMarkerId,
  hasProviderScheduleChanged,
  isCalendarCategory,
  isProductOwnedEvent,
  providerEventSchedule,
  resolveLocalProductActionId,
  type CalendarAction,
  type CalendarLinkProjection,
  type GoogleEventResource
} from "./model";
import {
  refreshGoogleAccessToken,
  revokeGoogleToken,
  type CalendarCredentials,
  type GoogleOAuthConfig
} from "./oauth";
import { calendarFailureCode } from "./errors";

type Tables = Database["public"]["Tables"];
type CalendarSource = Tables["calendar_sources"]["Row"];
type CalendarLink = Tables["calendar_event_links"]["Row"];
type CalendarEvent = Tables["calendar_events"]["Row"];
type CalendarOperation = Tables["calendar_sync_operations"]["Row"];
type Action = Tables["actions"]["Row"];

const EVENT_QUERY_FINGERPRINT = "events:v1:showDeleted=true:singleEvents=false";

export type CalendarSyncResult = {
  calendars: number;
  events: number;
  operations: number;
  pendingOperations: number;
  conflicts: number;
  fullResyncs: number;
};

function serviceError(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

async function readCredentials(userId: string): Promise<CalendarCredentials> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("read_calendar_oauth_credentials", { target_user_id: userId });
  if (error || !data) serviceError(error, "calendar_credentials_unavailable");
  const value = JSON.parse(data) as CalendarCredentials;
  if (!value.accessToken || !value.refreshToken || !value.expiresAt) throw new Error("calendar_credentials_invalid");
  return value;
}

async function storeCredentials(userId: string, credentials: CalendarCredentials) {
  const service = createServiceClient();
  const { data, error } = await service.rpc("store_calendar_oauth_credentials", {
    target_user_id: userId,
    target_secret_payload: JSON.stringify(credentials),
    target_scopes: credentials.scope,
    target_expires_at: credentials.expiresAt
  });
  if (error || !data) serviceError(error, "calendar_credentials_store_failed");
  return data;
}

async function getFreshCredentials(userId: string, oauth: GoogleOAuthConfig) {
  let credentials = await readCredentials(userId);
  if (new Date(credentials.expiresAt).getTime() <= Date.now() + 60_000) {
    credentials = await refreshGoogleAccessToken(oauth, credentials);
    await storeCredentials(userId, credentials);
  }
  return credentials;
}

async function assertCalendarMayAccessExternal(userId: string) {
  const service = createServiceClient();
  const [lockResult, connectionResult] = await Promise.all([
    service.from("privacy_locks").select("is_locked").eq("user_id", userId).maybeSingle(),
    service.from("external_connections").select("id,status").eq("user_id", userId).eq("provider", "calendar").maybeSingle()
  ]);
  if (lockResult.error) throw lockResult.error;
  if (connectionResult.error) throw connectionResult.error;
  if (lockResult.data?.is_locked) throw new Error("calendar_privacy_locked");
  if (!connectionResult.data || connectionResult.data.status !== "connected") {
    throw new Error(connectionResult.data?.status === "paused" ? "calendar_connection_paused" : "calendar_connection_unavailable");
  }
  return connectionResult.data.id;
}

async function permissionDecision(userId: string, capabilityKey: string) {
  const service = createServiceClient();
  const [capability, grant, dependencyRows, allGrants, connection, lock] = await Promise.all([
    service.from("capability_definitions").select("requires_ai,connection_provider").eq("capability_key", capabilityKey).maybeSingle(),
    service.from("permission_grants").select("mode,active,starts_at,expires_at").eq("user_id", userId).eq("capability_key", capabilityKey).maybeSingle(),
    service.from("capability_dependencies").select("required_capability_key").eq("capability_key", capabilityKey),
    service.from("permission_grants").select("capability_key,mode,active,starts_at,expires_at").eq("user_id", userId),
    service.from("external_connections").select("provider,status").eq("user_id", userId),
    service.from("privacy_locks").select("is_locked").eq("user_id", userId).maybeSingle()
  ]);
  const error = [capability, grant, dependencyRows, allGrants, connection, lock].map((result) => result.error).find(Boolean);
  if (error) throw error;
  if (lock.data?.is_locked) return { allowed: false, reason: "privacy_locked" };
  if (!capability.data) return { allowed: false, reason: "unknown_capability" };
  const now = Date.now();
  const isActive = (value: { mode: string; active: boolean; starts_at: string; expires_at: string | null } | null) => Boolean(
    value?.active && value.mode !== "off" && new Date(value.starts_at).getTime() <= now &&
    (!value.expires_at || new Date(value.expires_at).getTime() > now)
  );
  if (!isActive(grant.data)) return { allowed: false, reason: "grant_inactive" };
  if (capability.data.connection_provider) {
    const provider = connection.data?.find((item) => item.provider === capability.data!.connection_provider);
    if (provider?.status !== "connected") return { allowed: false, reason: "connection_unavailable" };
  }
  const grantByKey = new Map((allGrants.data ?? []).map((item) => [item.capability_key, item]));
  for (const dependency of dependencyRows.data ?? []) {
    if (!isActive(grantByKey.get(dependency.required_capability_key) ?? null)) {
      return { allowed: false, reason: `dependency_denied:${dependency.required_capability_key}` };
    }
  }
  return { allowed: true, reason: "allowed" };
}

async function assertCalendarCapability(userId: string, capability: CalendarRequestCapability) {
  await assertCalendarMayAccessExternal(userId);
  const decision = await permissionDecision(userId, capability);
  if (!decision.allowed) throw new Error(`calendar_permission_${decision.reason}`);
}

function calendarClient(userId: string, accessToken: string) {
  return new GoogleCalendarClient(
    accessToken,
    fetch,
    (capability) => assertCalendarCapability(userId, capability)
  );
}

async function listAllCalendars(client: GoogleCalendarClient) {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const page = await client.listCalendars(pageToken);
    calendars.push(...(page.items ?? []).filter((item) => !item.deleted));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return calendars;
}

async function ensureProductCalendar(
  userId: string,
  connectionId: string,
  client: GoogleCalendarClient,
  calendars: GoogleCalendarListEntry[]
) {
  const service = createServiceClient();
  const { data: existing, error } = await service
    .from("calendar_sources")
    .select("*")
    .eq("user_id", userId)
    .eq("is_product_calendar", true)
    .maybeSingle();
  if (error) throw error;

  let providerId = existing?.provider_calendar_id;
  if (!providerId || !calendars.some((item) => item.id === providerId)) {
    const created = await client.createCalendar({
      summary: PRODUCT_CALENDAR_NAME,
      description: PRODUCT_CALENDAR_DESCRIPTION,
      timeZone: PRODUCT_CALENDAR_TIME_ZONE,
      labelProperties: { eventLabels: Object.values(calendarLabels) }
    });
    if (!created.id) throw new Error("calendar_product_calendar_id_missing");
    providerId = created.id;
    calendars.push({
      id: providerId,
      summary: PRODUCT_CALENDAR_NAME,
      timeZone: PRODUCT_CALENDAR_TIME_ZONE,
      accessRole: "owner"
    });
  } else {
    await client.updateCalendar(providerId, {
      summary: PRODUCT_CALENDAR_NAME,
      description: PRODUCT_CALENDAR_DESCRIPTION,
      timeZone: PRODUCT_CALENDAR_TIME_ZONE,
      labelProperties: { eventLabels: Object.values(calendarLabels) }
    });
  }

  const { data, error: upsertError } = await service.from("calendar_sources").upsert({
    user_id: userId,
    connection_id: connectionId,
    provider_calendar_id: providerId,
    summary: PRODUCT_CALENDAR_NAME,
    time_zone: PRODUCT_CALENDAR_TIME_ZONE,
    access_role: "owner",
    is_primary: false,
    is_product_calendar: true,
    selected_for_conflicts: true,
    sync_state: "stale",
    last_error_code: null
  }, { onConflict: "user_id,provider_calendar_id" }).select("*").single();
  if (upsertError) throw upsertError;
  return data;
}

async function upsertCalendarSources(
  userId: string,
  connectionId: string,
  calendars: GoogleCalendarListEntry[],
  productProviderId: string
) {
  const service = createServiceClient();
  const rows = calendars
    .filter((item) => item.accessRole !== "freeBusyReader")
    .map((item) => ({
      user_id: userId,
      connection_id: connectionId,
      provider_calendar_id: item.id,
      summary: item.id === productProviderId ? PRODUCT_CALENDAR_NAME : item.summary,
      time_zone: item.id === productProviderId ? PRODUCT_CALENDAR_TIME_ZONE : item.timeZone ?? PRODUCT_CALENDAR_TIME_ZONE,
      access_role: item.accessRole,
      is_primary: Boolean(item.primary),
      is_product_calendar: item.id === productProviderId,
      selected_for_conflicts: true,
      sync_state: "stale" as const,
      last_error_code: null
    }));
  if (rows.length === 0) return [];
  const { data, error } = await service.from("calendar_sources").upsert(rows, {
    onConflict: "user_id,provider_calendar_id"
  }).select("*");
  if (error) throw error;
  return data;
}

function eventRow(
  userId: string,
  sourceId: string,
  event: GoogleEventResource,
  productActionId: string | null,
  existing?: CalendarEvent | null
): Tables["calendar_events"]["Insert"] {
  if (!event.id) throw new Error("calendar_provider_event_id_missing");
  const schedule = providerEventSchedule(event);
  const deleted = event.status === "cancelled";
  if (!schedule && !deleted) throw new Error("calendar_provider_event_schedule_missing");
  return {
    user_id: userId,
    calendar_source_id: sourceId,
    provider_event_id: event.id,
    product_owned: productActionId !== null,
    product_action_id: productActionId,
    etag: event.etag ?? existing?.etag ?? null,
    status: event.status ?? "confirmed",
    event_type: event.eventType ?? "default",
    summary: event.summary?.slice(0, 1000) ?? existing?.summary ?? null,
    description: event.description?.slice(0, 8192) ?? existing?.description ?? null,
    location: event.location?.slice(0, 1000) ?? existing?.location ?? null,
    html_link: event.htmlLink ?? existing?.html_link ?? null,
    event_label_id: event.eventLabelId ?? existing?.event_label_id ?? null,
    all_day: schedule?.allDay ?? existing?.all_day ?? false,
    starts_at: schedule?.startsAt ?? existing?.starts_at ?? null,
    ends_at: schedule?.endsAt ?? existing?.ends_at ?? null,
    starts_on: schedule?.startsOn ?? existing?.starts_on ?? null,
    ends_on: schedule?.endsOn ?? existing?.ends_on ?? null,
    recurring_event_id: event.recurringEventId ?? existing?.recurring_event_id ?? null,
    transparency: event.transparency ?? existing?.transparency ?? null,
    visibility: event.visibility ?? existing?.visibility ?? null,
    creator_self: Boolean(event.creator?.self ?? existing?.creator_self),
    organizer_self: Boolean(event.organizer?.self ?? existing?.organizer_self),
    provider_created_at: event.created ?? existing?.provider_created_at ?? null,
    provider_updated_at: event.updated ?? existing?.provider_updated_at ?? null,
    deleted,
    last_seen_at: new Date().toISOString()
  };
}

async function findLocalProductActionId(userId: string, event: GoogleEventResource) {
  const markerActionId = getProductActionMarkerId(event);
  if (!markerActionId) return null;
  const service = createServiceClient();
  const { data, error } = await service.from("actions").select("id")
    .eq("user_id", userId).eq("id", markerActionId).maybeSingle();
  if (error) throw error;
  return resolveLocalProductActionId(event, data?.id ?? null);
}

async function createCalendarConflict(
  userId: string,
  link: CalendarLink,
  type: "remote_deleted" | "concurrent_change" | "write_protected",
  action: Action,
  event: GoogleEventResource
) {
  const service = createServiceClient();
  const { data: existing } = await service.from("calendar_sync_conflicts")
    .select("id").eq("event_link_id", link.id).eq("status", "pending").maybeSingle();
  if (existing) {
    await service.from("calendar_event_links").update({
      sync_status: "conflict",
      last_error_code: type
    }).eq("id", link.id);
    return false;
  }
  const productSnapshot: Json = {
    actionVersion: action.version,
    status: action.status,
    title: action.title,
    start: link.scheduled_start_at ?? link.scheduled_start_date,
    end: link.scheduled_end_at ?? link.scheduled_end_date
  };
  const providerSnapshot: Json = {
    eventId: event.id ?? null,
    etag: event.etag ?? null,
    status: event.status ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null
  };
  const { error } = await service.from("calendar_sync_conflicts").insert({
    user_id: userId,
    event_link_id: link.id,
    conflict_type: type,
    product_snapshot: productSnapshot,
    provider_snapshot: providerSnapshot
  });
  if (error) throw error;
  await service.from("calendar_event_links").update({ sync_status: "conflict", last_error_code: type }).eq("id", link.id);
  return true;
}

async function reconcileProductEvent(
  userId: string,
  source: CalendarSource,
  mirror: CalendarEvent,
  providerEvent: GoogleEventResource
) {
  const service = createServiceClient();
  const { data: link, error } = await service.from("calendar_event_links").select("*")
    .eq("calendar_source_id", source.id).eq("provider_event_id", mirror.provider_event_id).maybeSingle();
  if (error || !link) return 0;
  const { data: action, error: actionError } = await service.from("actions").select("*").eq("id", link.action_id).single();
  if (actionError) throw actionError;

  if (mirror.deleted || providerEvent.status === "cancelled") {
    return await createCalendarConflict(userId, link, "remote_deleted", action, providerEvent) ? 1 : 0;
  }
  if (!isProductOwnedEvent(providerEvent, action.id)) {
    return await createCalendarConflict(userId, link, "write_protected", action, providerEvent) ? 1 : 0;
  }

  const remoteChanged = link.provider_etag !== null && providerEvent.etag !== link.provider_etag;
  const localChanged = link.last_synced_action_version !== null && action.version > link.last_synced_action_version;
  const scheduleChanged = hasProviderScheduleChanged(providerEvent, link as CalendarLinkProjection);
  if (remoteChanged && localChanged) {
    return await createCalendarConflict(userId, link, "concurrent_change", action, providerEvent) ? 1 : 0;
  }
  if (remoteChanged && scheduleChanged) {
    const schedule = providerEventSchedule(providerEvent);
    if (!schedule) return 0;
    const nextVersion = action.version + 1;
    const { error: updateError } = await service.from("actions").update({
      suggested_start_at: schedule.allDay ? null : schedule.startsAt,
      due_at: schedule.allDay ? `${schedule.startsOn}T00:00:00+08:00` : action.due_at,
      status: ["unscheduled", "waiting"].includes(action.status) ? "scheduled" : action.status,
      version: nextVersion
    }).eq("id", action.id);
    if (updateError) throw updateError;
    await service.from("timeline_entries").insert({
      user_id: userId,
      entity_type: "action",
      entity_id: action.id,
      event_type: "calendar_time_updated",
      actor_type: "sync",
      summary: "Calendar 中的排期变更已同步回产品",
      changes: { start: schedule.startsAt ?? schedule.startsOn, end: schedule.endsAt ?? schedule.endsOn }
    });
    await service.from("calendar_event_links").update({
      calendar_event_id: mirror.id,
      provider_etag: mirror.etag,
      last_synced_provider_updated_at: mirror.provider_updated_at,
      last_synced_action_version: nextVersion,
      all_day: schedule.allDay,
      scheduled_start_at: schedule.startsAt,
      scheduled_end_at: schedule.endsAt,
      scheduled_start_date: schedule.startsOn,
      scheduled_end_date: schedule.endsOn,
      sync_status: "synced",
      last_error_code: null
    }).eq("id", link.id);
  } else {
    await service.from("calendar_event_links").update({
      calendar_event_id: mirror.id,
      provider_etag: mirror.etag,
      last_synced_provider_updated_at: mirror.provider_updated_at
    }).eq("id", link.id);
  }
  return 0;
}

async function syncOneSource(
  userId: string,
  source: CalendarSource,
  client: GoogleCalendarClient
) {
  const service = createServiceClient();
  const { data: cursorRows, error: cursorError } = await service.rpc("get_calendar_sync_cursor", {
    target_source_id: source.id
  });
  if (cursorError) throw cursorError;
  let syncToken = cursorRows?.[0]?.query_fingerprint === EVENT_QUERY_FINGERPRINT
    ? cursorRows[0].sync_token
    : undefined;
  let fullResync = false;
  let events = 0;
  let conflicts = 0;

  const execute = async () => {
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const page = await client.listEvents(source.provider_calendar_id, pageToken, syncToken);
      for (const providerEvent of page.items ?? []) {
        if (!providerEvent.id) continue;
        const [{ data: existing, error: existingError }, productActionId] = await Promise.all([
          service.from("calendar_events").select("*")
            .eq("calendar_source_id", source.id).eq("provider_event_id", providerEvent.id).maybeSingle(),
          findLocalProductActionId(userId, providerEvent)
        ]);
        if (existingError) throw existingError;
        const { data: mirror, error } = await service.from("calendar_events").upsert(
          eventRow(userId, source.id, providerEvent, productActionId, existing),
          { onConflict: "calendar_source_id,provider_event_id" }
        ).select("*").single();
        if (error) throw error;
        events += 1;
        if (source.is_product_calendar) {
          conflicts += await reconcileProductEvent(userId, source, mirror, providerEvent);
        }
      }
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    if (!nextSyncToken) throw new Error("calendar_sync_token_missing");
    const { error } = await service.rpc("set_calendar_sync_cursor", {
      target_user_id: userId,
      target_source_id: source.id,
      target_sync_token: nextSyncToken,
      target_query_fingerprint: EVENT_QUERY_FINGERPRINT
    });
    if (error) throw error;
  };

  try {
    await execute();
  } catch (error) {
    if (!(error instanceof CalendarProviderError) || error.status !== 410 || !syncToken) throw error;
    fullResync = true;
    syncToken = undefined;
    const { error: deleteError } = await service.from("calendar_events").delete().eq("calendar_source_id", source.id);
    if (deleteError) throw deleteError;
    const { error: clearError } = await service.rpc("clear_calendar_sync_cursor", { target_source_id: source.id });
    if (clearError) throw clearError;
    await execute();
  }

  await service.from("calendar_sources").update({
    sync_state: "ready",
    last_error_code: null,
    ...(syncToken ? { last_incremental_sync_at: new Date().toISOString() } : { last_full_sync_at: new Date().toISOString() })
  }).eq("id", source.id);
  return { events, conflicts, fullResync: fullResync ? 1 : 0 };
}

async function enqueueChangedLinks(userId: string) {
  const service = createServiceClient();
  const { data: links, error } = await service.from("calendar_event_links").select("*")
    .eq("user_id", userId).in("sync_status", ["synced", "pending", "failed"]);
  if (error) throw error;
  for (const link of links ?? []) {
    const { data: action } = await service.from("actions").select("version").eq("id", link.action_id).maybeSingle();
    if (!action || (link.last_synced_action_version ?? 0) >= action.version) continue;
    const { data: active } = await service.from("calendar_sync_operations").select("id")
      .eq("event_link_id", link.id).in("status", ["pending", "processing"]).maybeSingle();
    if (active) continue;
    const type = link.provider_event_id ? "update" : "create";
    const capability = type === "update" ? "calendar.update_product_event" : "calendar.write_confirmed_plan";
    const decision = await permissionDecision(userId, capability);
    await service.from("calendar_sync_operations").insert({
      user_id: userId,
      event_link_id: link.id,
      idempotency_key: `${link.action_id}:${action.version}:${type}`,
      operation_type: type,
      capability_key: capability,
      target_action_version: action.version,
      blocked_reason: decision.allowed ? null : decision.reason
    });
  }
}

async function mirrorWrittenEvent(
  userId: string,
  source: CalendarSource,
  event: GoogleEventResource,
  actionId: string
) {
  const service = createServiceClient();
  const { data, error } = await service.from("calendar_events").upsert(
    eventRow(userId, source.id, event, resolveLocalProductActionId(event, actionId)),
    { onConflict: "calendar_source_id,provider_event_id" }
  ).select("*").single();
  if (error) throw error;
  return data;
}

async function processOperation(
  userId: string,
  operation: CalendarOperation,
  client: GoogleCalendarClient,
  appOrigin: string
) {
  const service = createServiceClient();
  const decision = await permissionDecision(userId, operation.capability_key);
  if (!decision.allowed) {
    await service.from("calendar_sync_operations").update({ blocked_reason: decision.reason }).eq("id", operation.id);
    return { processed: 0, conflicts: 0 };
  }

  const [{ data: link, error: linkError }, { data: productSource, error: sourceError }] = await Promise.all([
    service.from("calendar_event_links").select("*").eq("id", operation.event_link_id).single(),
    service.from("calendar_sources").select("*").eq("user_id", userId).eq("is_product_calendar", true).single()
  ]);
  if (linkError || !link) throw linkError ?? new Error("calendar_link_missing");
  if (sourceError || !productSource) throw sourceError ?? new Error("calendar_product_source_missing");
  const { data: action, error: actionError } = await service.from("actions").select("*").eq("id", link.action_id).single();
  if (actionError) throw actionError;
  if (!isCalendarCategory(action.track)) throw new Error("calendar_action_category_invalid");

  const schedule = deriveSchedule(action as CalendarAction, link.all_day);
  const projection: CalendarLinkProjection = {
    id: link.id,
    category: action.track as CalendarCategory,
    all_day: link.all_day,
    ...schedule
  };
  const desired = buildGoogleEvent(action as CalendarAction, projection, appOrigin);
  await service.from("calendar_sync_operations").update({
    status: "processing",
    blocked_reason: null,
    started_at: new Date().toISOString(),
    attempt_count: operation.attempt_count + 1
  }).eq("id", operation.id);
  await service.from("calendar_event_links").update({ sync_status: "syncing" }).eq("id", link.id);

  try {
    let providerEvent: GoogleEventResource;
    if (operation.operation_type === "update" && link.provider_event_id && link.provider_etag) {
      const { data: mirror } = await service.from("calendar_events").select("*")
        .eq("calendar_source_id", productSource.id).eq("provider_event_id", link.provider_event_id).maybeSingle();
      const markerEvent: GoogleEventResource = mirror ? { id: mirror.provider_event_id } : {};
      if (!mirror || !mirror.product_owned || mirror.product_action_id !== action.id) {
        await createCalendarConflict(userId, link, "write_protected", action, markerEvent);
        await service.from("calendar_sync_operations").update({
          status: "conflict", finished_at: new Date().toISOString(), last_error_code: "write_protected"
        }).eq("id", operation.id);
        return { processed: 0, conflicts: 1 };
      }
      providerEvent = await client.updateEvent(
        productSource.provider_calendar_id,
        link.provider_event_id,
        desired,
        link.provider_etag
      );
    } else {
      providerEvent = await client.createEvent(productSource.provider_calendar_id, {
        ...desired,
        // UUID hex is within Google's base32hex event-ID alphabet. Reuse on retry;
        // a user-confirmed resync operation gets a new ID after remote deletion.
        id: operation.id.replace(/-/g, "")
      });
    }
    const mirror = await mirrorWrittenEvent(userId, productSource, {
      ...providerEvent,
      extendedProperties: providerEvent.extendedProperties ?? desired.extendedProperties
    }, action.id);
    await service.from("calendar_event_links").update({
      calendar_source_id: productSource.id,
      calendar_event_id: mirror.id,
      provider_event_id: mirror.provider_event_id,
      provider_etag: mirror.etag,
      category: action.track,
      ...schedule,
      last_synced_action_version: action.version,
      last_synced_provider_updated_at: mirror.provider_updated_at,
      sync_status: "synced",
      last_error_code: null
    }).eq("id", link.id);
    await service.from("calendar_sync_operations").update({
      status: "succeeded", finished_at: new Date().toISOString(), last_error_code: null
    }).eq("id", operation.id);
    await service.from("timeline_entries").insert({
      user_id: userId,
      entity_type: "action",
      entity_id: action.id,
      event_type: "calendar_synced",
      actor_type: "sync",
      summary: "行动已同步到 Google Calendar",
      changes: { operation: operation.operation_type, eventId: mirror.provider_event_id, actionVersion: action.version }
    });
    await service.from("audit_events").insert({
      user_id: userId,
      actor_type: "sync",
      action: `calendar.event_${operation.operation_type}d`,
      object_type: "action",
      object_id: action.id,
      after_state: { eventLinkId: link.id, syncStatus: "synced" },
      permission_decision: decision,
      outcome: "succeeded"
    });
    return { processed: 1, conflicts: 0 };
  } catch (error) {
    if (error instanceof CalendarProviderError && error.status === 412) {
      const conflictCreated = await createCalendarConflict(userId, link, "concurrent_change", action, {});
      await service.from("calendar_sync_operations").update({
        status: "conflict", finished_at: new Date().toISOString(), last_error_code: "etag_precondition_failed"
      }).eq("id", operation.id);
      return { processed: 0, conflicts: conflictCreated ? 1 : 0 };
    }
    const attempts = operation.attempt_count + 1;
    const terminal = attempts >= operation.max_attempts;
    await service.from("calendar_sync_operations").update({
      status: terminal ? "failed" : "pending",
      last_error_code: error instanceof CalendarProviderError ? error.providerCode : "calendar_sync_failed",
      next_attempt_at: terminal ? null : new Date(Date.now() + Math.min(60_000 * 2 ** attempts, 15 * 60_000)).toISOString(),
      finished_at: terminal ? new Date().toISOString() : null
    }).eq("id", operation.id);
    await service.from("calendar_event_links").update({
      sync_status: terminal ? "failed" : "pending",
      last_error_code: error instanceof CalendarProviderError ? error.providerCode : "calendar_sync_failed"
    }).eq("id", link.id);
    return { processed: 0, conflicts: 0 };
  }
}

async function processPendingOperations(
  userId: string,
  client: GoogleCalendarClient,
  appOrigin: string
) {
  await enqueueChangedLinks(userId);
  const service = createServiceClient();
  const { data, error } = await service.from("calendar_sync_operations").select("*")
    .eq("user_id", userId).eq("status", "pending")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order("created_at");
  if (error) throw error;
  let processed = 0;
  let conflicts = 0;
  for (const operation of data ?? []) {
    const result = await processOperation(userId, operation, client, appOrigin);
    processed += result.processed;
    conflicts += result.conflicts;
  }
  return { processed, conflicts };
}

async function syncWithClient(
  userId: string,
  connectionId: string,
  client: GoogleCalendarClient,
  appOrigin: string
): Promise<CalendarSyncResult> {
  const calendars = await listAllCalendars(client);
  const product = await ensureProductCalendar(userId, connectionId, client, calendars);
  const sources = await upsertCalendarSources(userId, connectionId, calendars, product.provider_calendar_id);
  const result: CalendarSyncResult = {
    calendars: sources.length,
    events: 0,
    operations: 0,
    pendingOperations: 0,
    conflicts: 0,
    fullResyncs: 0
  };
  for (const source of sources) {
    if (!source.selected_for_conflicts) continue;
    const synced = await syncOneSource(userId, source, client);
    result.events += synced.events;
    result.conflicts += synced.conflicts;
    result.fullResyncs += synced.fullResync;
  }
  const operations = await processPendingOperations(userId, client, appOrigin);
  result.operations += operations.processed;
  result.conflicts += operations.conflicts;
  const service = createServiceClient();
  const { count: pendingOperations, error: pendingError } = await service
    .from("calendar_sync_operations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["pending", "processing"]);
  if (pendingError) throw pendingError;
  result.pendingOperations = pendingOperations ?? 0;
  const { error: completionError } = await service.from("external_connections").update({
    last_success_at: new Date().toISOString(), last_error_code: null, last_error_at: null
  }).eq("id", connectionId).select("id").single();
  if (completionError) throw completionError;
  return result;
}

export async function initializeCalendarConnection(
  userId: string,
  credentials: CalendarCredentials,
  appOrigin: string
) {
  const connectionId = await storeCredentials(userId, credentials);
  try {
    return await syncWithClient(userId, connectionId, calendarClient(userId, credentials.accessToken), appOrigin);
  } catch (error) {
    await recordCalendarFailure(userId, error, true);
    throw error;
  }
}

async function recordCalendarFailure(userId: string, failure: unknown, initialization = false) {
  const service = createServiceClient();
  const { error } = await service.from("external_connections").update({
    last_error_code: calendarFailureCode(failure),
    last_error_at: new Date().toISOString(),
    ...(initialization ? { last_success_at: null } : {})
  }).eq("user_id", userId).eq("provider", "calendar");
  if (error) console.error("[calendar-sync]", "calendar_failure_record_failed");
}

export async function runCalendarSync(
  userId: string,
  oauth: GoogleOAuthConfig,
  appOrigin: string
) {
  try {
    const connectionId = await assertCalendarMayAccessExternal(userId);
    await assertCalendarCapability(userId, "calendar.read");
    const credentials = await getFreshCredentials(userId, oauth);
    return await syncWithClient(userId, connectionId, calendarClient(userId, credentials.accessToken), appOrigin);
  } catch (error) {
    await recordCalendarFailure(userId, error);
    throw error;
  }
}

export async function disconnectCalendar(userId: string) {
  const credentials = await readCredentials(userId);
  let remoteRevoked = true;
  try {
    await revokeGoogleToken(credentials.refreshToken);
  } catch {
    remoteRevoked = false;
  }
  const service = createServiceClient();
  const { error } = await service.rpc("delete_calendar_oauth_credentials", { target_user_id: userId });
  if (error) throw error;
  return { remoteRevoked };
}

export { CALENDAR_SCOPES };

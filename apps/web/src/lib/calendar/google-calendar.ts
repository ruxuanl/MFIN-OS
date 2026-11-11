import "server-only";

import { CALENDAR_EVENT_LABEL_VERSION } from "./constants";
import type { GoogleEventResource } from "./model";

export type GoogleCalendarResource = {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
  labelProperties?: {
    eventLabels?: Array<{ id?: string; name?: string; backgroundColor: string }>;
  };
};

export type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  timeZone?: string;
  accessRole: "freeBusyReader" | "reader" | "writer" | "writerWithoutPrivateAccess" | "owner";
  primary?: boolean;
  deleted?: boolean;
};

type Page<T> = { items?: T[]; nextPageToken?: string; nextSyncToken?: string };

export type CalendarRequestCapability =
  | "calendar.connection"
  | "calendar.read"
  | "calendar.write_confirmed_plan"
  | "calendar.update_product_event";

export class CalendarProviderError extends Error {
  constructor(public readonly status: number, public readonly providerCode: string) {
    super(`calendar_provider_${providerCode}`);
  }
}

export class GoogleCalendarClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly beforeRequest: (capability: CalendarRequestCapability) => Promise<void> = async () => undefined
  ) {}

  private async request<T>(path: string, capability: CalendarRequestCapability, init: RequestInit = {}) {
    await this.beforeRequest(capability);
    const url = new URL(path, "https://www.googleapis.com/calendar/v3/");
    url.searchParams.set("eventLabelVersion", CALENDAR_EVENT_LABEL_VERSION);
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      let code = String(response.status);
      try {
        const body = await response.json() as { error?: { status?: string; errors?: Array<{ reason?: string }> } };
        code = body.error?.errors?.[0]?.reason ?? body.error?.status ?? code;
      } catch {
        // Provider error bodies are optional and must never block safe failure handling.
      }
      throw new CalendarProviderError(response.status, code);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  listCalendars(pageToken?: string) {
    const params = new URLSearchParams({ maxResults: "250", showDeleted: "false", showHidden: "false" });
    if (pageToken) params.set("pageToken", pageToken);
    return this.request<Page<GoogleCalendarListEntry>>(`users/me/calendarList?${params}`, "calendar.read");
  }

  createCalendar(calendar: GoogleCalendarResource) {
    return this.request<GoogleCalendarResource>("calendars", "calendar.connection", {
      method: "POST",
      body: JSON.stringify(calendar)
    });
  }

  updateCalendar(calendarId: string, calendar: GoogleCalendarResource) {
    return this.request<GoogleCalendarResource>(`calendars/${encodeURIComponent(calendarId)}`, "calendar.connection", {
      method: "PUT",
      body: JSON.stringify(calendar)
    });
  }

  listEvents(calendarId: string, pageToken?: string, syncToken?: string) {
    const params = new URLSearchParams({ maxResults: "2500", showDeleted: "true", singleEvents: "false" });
    if (pageToken) params.set("pageToken", pageToken);
    if (syncToken) params.set("syncToken", syncToken);
    return this.request<Page<GoogleEventResource>>(
      `calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      "calendar.read"
    );
  }

  createEvent(calendarId: string, event: GoogleEventResource) {
    return this.request<GoogleEventResource>(`calendars/${encodeURIComponent(calendarId)}/events`, "calendar.write_confirmed_plan", {
      method: "POST",
      body: JSON.stringify(event)
    });
  }

  updateEvent(calendarId: string, eventId: string, event: GoogleEventResource, etag: string) {
    return this.request<GoogleEventResource>(
      `calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      "calendar.update_product_event",
      { method: "PUT", headers: { "if-match": etag }, body: JSON.stringify(event) }
    );
  }
}

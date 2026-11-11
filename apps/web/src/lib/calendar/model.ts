import { calendarLabels, PRODUCT_CALENDAR_TIME_ZONE, type CalendarCategory } from "./constants";

export type CalendarAction = {
  id: string;
  context_type: string;
  context_id: string | null;
  track: string | null;
  title: string;
  due_at: string | null;
  suggested_start_at: string | null;
  estimated_minutes: number | null;
  status: string;
  version: number;
};

export type CalendarLinkProjection = {
  id: string;
  category: CalendarCategory;
  all_day: boolean;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
};

export type GoogleEventDateTime = { date?: string; dateTime?: string; timeZone?: string };
export type GoogleEventResource = {
  id?: string;
  etag?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  eventType?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  eventLabelId?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  recurringEventId?: string;
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  created?: string;
  updated?: string;
  creator?: { self?: boolean };
  organizer?: { self?: boolean };
  extendedProperties?: { private?: Record<string, string> };
  reminders?: { useDefault: boolean };
};

export type CalendarSyncNotice = "synced" | "sync_pending" | "sync_conflicts";

const HONG_KONG_OFFSET = "+08:00";
const DATE_TIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function formatCalendarDateTimeLocal(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRODUCT_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function parseCalendarDateTimeLocal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!DATE_TIME_LOCAL_PATTERN.test(trimmed)) throw new Error("invalid_calendar_local_datetime");
  const parsed = new Date(`${trimmed}:00${HONG_KONG_OFFSET}`);
  if (Number.isNaN(parsed.getTime()) || formatCalendarDateTimeLocal(parsed.toISOString()) !== trimmed) {
    throw new Error("invalid_calendar_local_datetime");
  }
  return parsed.toISOString();
}

export function getCalendarSyncNotice(pendingOperations: number, conflicts: number): CalendarSyncNotice {
  if (conflicts > 0) return "sync_conflicts";
  if (pendingOperations > 0) return "sync_pending";
  return "synced";
}

const PRODUCT_EVENT_MARKER = "hku-mfin-personal-system";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const categoryNames: Record<CalendarCategory, string> = {
  academic: "学业",
  internship: "实习",
  graduate: "秋招",
  personal: "个人"
};

export function isCalendarCategory(value: string | null): value is CalendarCategory {
  return value !== null && value in calendarLabels;
}

export function formatProductEventTitle(category: CalendarCategory, title: string, status: string) {
  const core = `${categoryNames[category]}｜${title}`;
  if (status === "completed") return `✓ ${core}`;
  if (status === "cancelled") return `已取消｜${core}`;
  return core;
}

export function getActionProductPath(action: CalendarAction) {
  if (action.context_type === "course" && action.context_id) return `/academics/${action.context_id}`;
  if (action.context_type === "opportunity" && action.context_id) {
    return action.track === "internship"
      ? `/internships/${action.context_id}`
      : `/graduate/${action.context_id}`;
  }
  return "/";
}

export function buildGoogleEvent(
  action: CalendarAction,
  link: CalendarLinkProjection,
  appOrigin: string
): GoogleEventResource {
  const productUrl = new URL(getActionProductPath(action), appOrigin).toString();
  const start = link.all_day
    ? { date: link.scheduled_start_date ?? undefined }
    : { dateTime: link.scheduled_start_at ?? undefined, timeZone: PRODUCT_CALENDAR_TIME_ZONE };
  const end = link.all_day
    ? { date: link.scheduled_end_date ?? undefined }
    : { dateTime: link.scheduled_end_at ?? undefined, timeZone: PRODUCT_CALENDAR_TIME_ZONE };

  if ((!start.date && !start.dateTime) || (!end.date && !end.dateTime)) {
    throw new Error("calendar_link_has_no_schedule");
  }

  return {
    summary: formatProductEventTitle(link.category, action.title, action.status),
    description: `返回产品：${productUrl}`,
    eventLabelId: calendarLabels[link.category].id,
    start,
    end,
    extendedProperties: {
      private: {
        product: PRODUCT_EVENT_MARKER,
        origin: new URL(appOrigin).origin,
        actionId: action.id,
        eventLinkId: link.id
      }
    },
    reminders: { useDefault: true }
  };
}

export function deriveSchedule(action: CalendarAction, allDay: boolean) {
  if (allDay) {
    if (!action.due_at) throw new Error("all_day_requires_due_date");
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: PRODUCT_CALENDAR_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(action.due_at));
    // Calendar all-day dates are date-only values. Do the exclusive-end
    // arithmetic in UTC so converting the Hong Kong date to an instant cannot
    // shift the resulting YYYY-MM-DD back by one day.
    const end = new Date(`${date}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      scheduled_start_at: null,
      scheduled_end_at: null,
      scheduled_start_date: date,
      scheduled_end_date: end.toISOString().slice(0, 10)
    };
  }

  const startText = action.suggested_start_at ?? action.due_at;
  if (!startText) throw new Error("timed_event_requires_start");
  const start = new Date(startText);
  const end = new Date(start.getTime() + (action.estimated_minutes ?? 30) * 60_000);
  return {
    scheduled_start_at: start.toISOString(),
    scheduled_end_at: end.toISOString(),
    scheduled_start_date: null,
    scheduled_end_date: null
  };
}

export function isProductOwnedEvent(event: GoogleEventResource, actionId?: string) {
  const marker = event.extendedProperties?.private;
  return marker?.product === PRODUCT_EVENT_MARKER && (!actionId || marker.actionId === actionId);
}

export function getProductActionMarkerId(event: GoogleEventResource) {
  const actionId = event.extendedProperties?.private?.actionId;
  return isProductOwnedEvent(event) && actionId && UUID_PATTERN.test(actionId) ? actionId : null;
}

export function resolveLocalProductActionId(event: GoogleEventResource, localActionId: string | null) {
  const markerActionId = getProductActionMarkerId(event);
  return markerActionId !== null && markerActionId === localActionId ? markerActionId : null;
}

export function providerEventSchedule(event: GoogleEventResource) {
  if (event.start?.date && event.end?.date) {
    return {
      allDay: true,
      startsAt: null,
      endsAt: null,
      startsOn: event.start.date,
      endsOn: event.end.date
    };
  }
  if (event.start?.dateTime && event.end?.dateTime) {
    return {
      allDay: false,
      startsAt: new Date(event.start.dateTime).toISOString(),
      endsAt: new Date(event.end.dateTime).toISOString(),
      startsOn: null,
      endsOn: null
    };
  }
  return null;
}

export function hasProviderScheduleChanged(event: GoogleEventResource, link: CalendarLinkProjection) {
  const schedule = providerEventSchedule(event);
  if (!schedule) return false;
  return schedule.allDay !== link.all_day ||
    schedule.startsAt !== link.scheduled_start_at ||
    schedule.endsAt !== link.scheduled_end_at ||
    schedule.startsOn !== link.scheduled_start_date ||
    schedule.endsOn !== link.scheduled_end_date;
}

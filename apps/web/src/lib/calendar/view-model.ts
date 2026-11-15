import { PRODUCT_CALENDAR_TIME_ZONE } from "./constants";

export type CalendarDisplayEvent = {
  id: string;
  title: string;
  source: string;
  productOwned: boolean;
  allDay: boolean;
  start: string;
  end: string | null;
  url: string | null;
  location: string | null;
  actionId?: string | null;
  priority?: string | null;
};

export function calendarPriority(priority: string | null | undefined) {
  return priority === "critical" || priority === "high" || priority === "normal" || priority === "low" ? priority : "unmarked";
}

export const calendarPriorityLabels = { low: "低", normal: "普通", high: "高", critical: "关键", unmarked: "未标记" };

export function calendarDay(value: string | Date) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRODUCT_CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date(value));
}

export function calendarMonth(value: string | undefined, today: string) {
  return value && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7);
}

export function shiftMonth(month: string, offset: number) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function monthDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(1 - offset + index);
    return day.toISOString().slice(0, 10);
  });
}

export function eventsOnDay(events: CalendarDisplayEvent[], day: string) {
  const start = new Date(`${day}T00:00:00+08:00`).getTime();
  const end = start + 86_400_000;
  return events.filter((event) => {
    if (event.allDay) return event.start <= day && day < (event.end ?? `${event.start}~`);
    const eventStart = new Date(event.start).getTime();
    const eventEnd = event.end ? new Date(event.end).getTime() : eventStart;
    return eventStart < end && (eventEnd > start || eventStart >= start);
  }).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
}

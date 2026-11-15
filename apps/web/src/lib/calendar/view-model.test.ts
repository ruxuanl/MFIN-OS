import { describe, expect, it } from "vitest";
import { calendarDay, calendarMonth, calendarPriority, eventsOnDay, monthDays, shiftMonth, type CalendarDisplayEvent } from "./view-model";

const event = (patch: Partial<CalendarDisplayEvent>): CalendarDisplayEvent => ({
  id: "test", title: "Synthetic event", source: "Test", productOwned: false,
  allDay: false, start: "2026-11-15T23:30:00+08:00", end: "2026-11-16T00:30:00+08:00", url: null, location: null, ...patch
});

describe("Calendar view dates", () => {
  it("preserves explicit priorities and leaves missing or unknown priorities unmarked", () => {
    for (const priority of ["low", "normal", "high", "critical"]) expect(calendarPriority(priority)).toBe(priority);
    expect(calendarPriority(null)).toBe("unmarked");
    expect(calendarPriority("important")).toBe("unmarked");
  });
  it("uses Hong Kong dates irrespective of device time zone", () => {
    expect(calendarDay("2026-11-14T20:00:00Z")).toBe("2026-11-15");
    expect(calendarMonth("2026-13", "2026-11-15")).toBe("2026-11");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("includes the month in a Monday-first grid", () => {
    expect(monthDays("2026-11")).toHaveLength(42);
    expect(monthDays("2026-11")[0]).toBe("2026-10-26");
    expect(monthDays("2026-11")[41]).toBe("2026-12-06");
    expect(monthDays("2027-02")).toContain("2027-02-28");
  });
  it("shows overnight events on both days but excludes exclusive midnight endings", () => {
    expect(eventsOnDay([event({})], "2026-11-15")).toHaveLength(1);
    expect(eventsOnDay([event({})], "2026-11-16")).toHaveLength(1);
    expect(eventsOnDay([event({ end: "2026-11-16T00:00:00+08:00" })], "2026-11-16")).toHaveLength(0);
  });
  it("honors exclusive all-day endings and sorts all-day events first", () => {
    const allDay = event({ id: "all", allDay: true, start: "2026-11-15", end: "2026-11-17" });
    expect(eventsOnDay([allDay], "2026-11-16")).toHaveLength(1);
    expect(eventsOnDay([allDay], "2026-11-17")).toHaveLength(0);
    expect(eventsOnDay([event({}), allDay], "2026-11-15")[0].id).toBe("all");
  });
});

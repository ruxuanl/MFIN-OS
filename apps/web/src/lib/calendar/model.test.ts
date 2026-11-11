import { describe, expect, it } from "vitest";

import { calendarLabels, PRODUCT_CALENDAR_TIME_ZONE } from "./constants";
import {
  buildGoogleEvent,
  deriveSchedule,
  formatCalendarDateTimeLocal,
  formatProductEventTitle,
  getCalendarSyncNotice,
  getProductActionMarkerId,
  hasProviderScheduleChanged,
  isProductOwnedEvent,
  parseCalendarDateTimeLocal,
  resolveLocalProductActionId,
  type CalendarAction,
  type CalendarLinkProjection
} from "./model";

describe("Calendar form date-times", () => {
  it("round-trips Hong Kong local values without shifting the visible time", () => {
    const instant = parseCalendarDateTimeLocal("2026-08-22T20:30");
    expect(instant).toBe("2026-08-22T12:30:00.000Z");
    expect(formatCalendarDateTimeLocal(instant)).toBe("2026-08-22T20:30");
  });

  it("keeps blank values nullable and rejects normalized invalid dates", () => {
    expect(parseCalendarDateTimeLocal("  ")).toBeNull();
    expect(() => parseCalendarDateTimeLocal("2026-02-30T10:00")).toThrow("invalid_calendar_local_datetime");
  });
});

describe("Calendar sync completion notice", () => {
  it("does not report full completion while writes remain queued", () => {
    expect(getCalendarSyncNotice(1, 0)).toBe("sync_pending");
  });

  it("prioritizes visible conflicts and reports completion only when settled", () => {
    expect(getCalendarSyncNotice(1, 1)).toBe("sync_conflicts");
    expect(getCalendarSyncNotice(0, 0)).toBe("synced");
  });
});

const action: CalendarAction = {
  id: "action-1",
  context_type: "opportunity",
  context_id: "opportunity-1",
  track: "internship",
  title: "提交网申",
  due_at: "2026-08-12T10:00:00.000Z",
  suggested_start_at: "2026-08-12T09:00:00.000Z",
  estimated_minutes: 45,
  status: "scheduled",
  version: 3
};

const timedLink: CalendarLinkProjection = {
  id: "link-1",
  category: "internship",
  all_day: false,
  scheduled_start_at: "2026-08-12T09:00:00.000Z",
  scheduled_end_at: "2026-08-12T09:45:00.000Z",
  scheduled_start_date: null,
  scheduled_end_date: null
};

describe("Calendar event projection", () => {
  it("uses a category prefix while retaining completed and cancelled events", () => {
    expect(formatProductEventTitle("academic", "完成作业", "scheduled")).toBe("学业｜完成作业");
    expect(formatProductEventTitle("graduate", "投递岗位", "completed")).toBe("✓ 秋招｜投递岗位");
    expect(formatProductEventTitle("personal", "复盘", "cancelled")).toBe("已取消｜个人｜复盘");
  });

  it("builds a labelled product-owned timed event with a return link", () => {
    const event = buildGoogleEvent(action, timedLink, "https://product.example");
    expect(event.summary).toBe("实习｜提交网申");
    expect(event.eventLabelId).toBe(calendarLabels.internship.id);
    expect(event.start).toEqual({ dateTime: timedLink.scheduled_start_at, timeZone: PRODUCT_CALENDAR_TIME_ZONE });
    expect(event.description).toContain("https://product.example/internships/opportunity-1");
    expect(event.extendedProperties?.private?.origin).toBe("https://product.example");
    expect(isProductOwnedEvent(event, action.id)).toBe(true);
    expect(isProductOwnedEvent(event, "another-action")).toBe(false);
  });

  it("does not treat a marker from another database as locally product-owned", () => {
    const foreignActionId = "62a7f44e-ae9c-4cd6-987c-51aab7ac676f";
    const localActionId = "6e6c3f3a-733a-4abf-92df-b137d844c877";
    const event = {
      extendedProperties: {
        private: {
          product: "hku-mfin-personal-system",
          actionId: foreignActionId
        }
      }
    };

    expect(getProductActionMarkerId(event)).toBe(foreignActionId);
    expect(resolveLocalProductActionId(event, null)).toBeNull();
    expect(resolveLocalProductActionId(event, localActionId)).toBeNull();
    expect(resolveLocalProductActionId(event, foreignActionId)).toBe(foreignActionId);
  });

  it("uses an exclusive end date for all-day events in Hong Kong time", () => {
    const schedule = deriveSchedule({ ...action, due_at: "2026-08-12T18:30:00.000Z" }, true);
    expect(schedule).toEqual({
      scheduled_start_at: null,
      scheduled_end_at: null,
      scheduled_start_date: "2026-08-13",
      scheduled_end_date: "2026-08-14"
    });
  });

  it("derives timed duration and detects Calendar-only schedule changes", () => {
    expect(deriveSchedule(action, false)).toEqual({
      scheduled_start_at: "2026-08-12T09:00:00.000Z",
      scheduled_end_at: "2026-08-12T09:45:00.000Z",
      scheduled_start_date: null,
      scheduled_end_date: null
    });
    expect(hasProviderScheduleChanged({
      start: { dateTime: "2026-08-12T09:30:00.000Z" },
      end: { dateTime: "2026-08-12T10:15:00.000Z" }
    }, timedLink)).toBe(true);
  });

  it("rejects event projection without a complete schedule", () => {
    expect(() => buildGoogleEvent(action, {
      ...timedLink,
      scheduled_end_at: null
    }, "https://product.example")).toThrow("calendar_link_has_no_schedule");
  });
});

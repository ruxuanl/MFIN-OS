export const PRODUCT_CALENDAR_NAME = "港大 MFin｜个人系统";
export const PRODUCT_CALENDAR_TIME_ZONE = "Asia/Hong_Kong";
export const PRODUCT_CALENDAR_DESCRIPTION = "港大 MFin 个人系统创建的测试日历；仅承载已确认的每日事项与提醒。";
export const CALENDAR_EVENT_LABEL_VERSION = "1";

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.app.created"
] as const;

export const calendarLabels = {
  academic: { id: "32f3181c-52d4-4bb4-938b-2d4c77388df1", name: "学业", backgroundColor: "#4f6b62" },
  internship: { id: "43dd3a4f-e0d1-4df0-b482-a1fd2765aa78", name: "实习", backgroundColor: "#617286" },
  graduate: { id: "9a703ce8-9eed-454c-bf93-035f0961104c", name: "秋招", backgroundColor: "#7a6853" },
  personal: { id: "6e5b246d-e66f-4522-93da-8721e2cf5ac3", name: "个人", backgroundColor: "#77736b" }
} as const;

export type CalendarCategory = keyof typeof calendarLabels;

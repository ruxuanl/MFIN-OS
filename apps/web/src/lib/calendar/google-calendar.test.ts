import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CalendarProviderError, GoogleCalendarClient } from "./google-calendar";

describe("Google Calendar adapter", () => {
  it("sends eventLabelVersion=1 on every request and preserves incremental sync parameters", async () => {
    const urls: URL[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      urls.push(new URL(String(input)));
      return new Response(JSON.stringify({ items: [], nextSyncToken: "next-token" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    const client = new GoogleCalendarClient("test-access-token", fetcher);

    await client.listCalendars("page-2");
    await client.listEvents("calendar/id", "page-3", "sync-token");

    expect(urls).toHaveLength(2);
    expect(urls.every((url) => url.searchParams.get("eventLabelVersion") === "1")).toBe(true);
    expect(urls[1].searchParams.get("syncToken")).toBe("sync-token");
    expect(urls[1].searchParams.get("showDeleted")).toBe("true");
  });

  it("uses ETag preconditions for product-event updates", async () => {
    let captured: RequestInit | undefined;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ id: "event-1", etag: "new-etag" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }) as typeof fetch;
    const client = new GoogleCalendarClient("test-access-token", fetcher);

    await client.updateEvent("product-calendar", "event-1", {
      summary: "学业｜复习",
      start: { date: "2026-08-11" },
      end: { date: "2026-08-12" }
    }, "old-etag");

    expect(captured?.method).toBe("PUT");
    expect(new Headers(captured?.headers).get("if-match")).toBe("old-etag");
    expect(new Headers(captured?.headers).get("authorization")).toBe("Bearer test-access-token");
  });

  it("rechecks the matching capability immediately before every provider request", async () => {
    const capabilities: string[] = [];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;
    const client = new GoogleCalendarClient("test-access-token", fetcher, async (capability) => {
      capabilities.push(capability);
    });

    await client.listCalendars();
    await client.listEvents("product-calendar");
    await client.createCalendar({ summary: "Product" });
    await client.createEvent("product-calendar", {});
    await client.updateEvent("product-calendar", "event-1", {}, "etag-1");

    expect(capabilities).toEqual([
      "calendar.read",
      "calendar.read",
      "calendar.connection",
      "calendar.write_confirmed_plan",
      "calendar.update_product_event"
    ]);
  });

  it.each([
    [410, "fullSyncRequired"],
    [412, "conditionNotMet"]
  ])("surfaces provider status %s for explicit recovery", async (status, reason) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      error: { errors: [{ reason }] }
    }), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
    const client = new GoogleCalendarClient("test-access-token", fetcher);

    await expect(client.listEvents("product-calendar", undefined, "stale-token"))
      .rejects.toEqual(expect.objectContaining<Partial<CalendarProviderError>>({ status, providerCode: reason }));
  });
});

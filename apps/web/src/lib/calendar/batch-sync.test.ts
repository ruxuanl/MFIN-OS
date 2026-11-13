import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../supabase/database.types";

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => db }));

import { GoogleCalendarClient } from "./google-calendar";
import { syncCalendarSource } from "./service";

afterEach(() => vi.clearAllMocks());

describe("Calendar page batching", () => {
  it("mirrors 121 events with three bounded reads/writes and preserves cancellation metadata and local ownership", async () => {
    const localId = "6e6c3f3a-733a-4abf-92df-b137d844c877";
    const foreignId = "62a7f44e-ae9c-4cd6-987c-51aab7ac676f";
    const writes: Array<Array<Record<string, unknown>>> = [];
    const reads: string[][] = [];
    db.rpc.mockResolvedValue({ data: [], error: null });
    db.from.mockImplementation((table: string) => {
      let ids: string[] = [];
      let rows: Array<Record<string, unknown>> | undefined;
      const result = () => ({ data: rows ?? (table === "actions" ? [{ id: localId }] : [{
        provider_event_id: "event-0", summary: "Retained title", all_day: true,
        starts_on: "2026-11-14", ends_on: "2026-11-15"
      }]), error: null });
      const query = {
        select: () => query, eq: () => query,
        in: (_key: string, values: string[]) => { ids = values; if (table === "calendar_events") reads.push(ids); return query; },
        upsert: (values: Array<Record<string, unknown>>) => { rows = values; writes.push(values); return query; },
        update: () => query,
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
      };
      return query;
    });
    const items = Array.from({ length: 121 }, (_, index) => ({
      id: `event-${index}`, status: index === 0 ? "cancelled" : "confirmed",
      ...(index === 0 ? {} : { summary: "Example", start: { date: "2026-11-14" }, end: { date: "2026-11-15" } }),
      ...(index === 1 || index === 2 ? { extendedProperties: { private: {
        product: "hku-mfin-personal-system", actionId: index === 1 ? localId : foreignId
      } } } : {})
    }));
    const fetcher = vi.fn(async () => Response.json({ items, nextSyncToken: "next" })) as typeof fetch;
    const source = { id: "source-1", provider_calendar_id: "calendar-1", is_product_calendar: false } as Database["public"]["Tables"]["calendar_sources"]["Row"];
    const result = await syncCalendarSource("user-1", source, new GoogleCalendarClient("synthetic", fetcher));
    expect(result.events).toBe(121);
    expect(reads.map((batch) => batch.length)).toEqual([50, 50, 21]);
    expect(writes.map((batch) => batch.length)).toEqual([50, 50, 21]);
    expect(writes[0][0]).toMatchObject({ deleted: true, summary: "Retained title", starts_on: "2026-11-14" });
    expect(writes[0][1]).toMatchObject({ product_owned: true, product_action_id: localId });
    expect(writes[0][2]).toMatchObject({ product_owned: false, product_action_id: null });
    expect(db.rpc).toHaveBeenLastCalledWith("set_calendar_sync_cursor", expect.objectContaining({ target_sync_token: "next" }));
  });
});

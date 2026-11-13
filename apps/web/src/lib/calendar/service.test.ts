import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  locked: false,
  paused: false,
  readAllowed: true,
  writes: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  rpc: vi.fn(),
  fetcher: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: state.rpc,
    from: (table: string) => {
      let updating = false;
      let capability = "";
      const grant = { mode: "persistent", active: true, starts_at: "2020-01-01T00:00:00Z", expires_at: null };
      const result = () => {
        if (updating) return { data: null, error: null };
        if (table === "privacy_locks") return { data: { is_locked: state.locked }, error: null };
        if (table === "external_connections") return { data: { id: "connection-1", status: state.paused ? "paused" : "connected" }, error: null };
        if (table === "capability_definitions") return { data: { requires_ai: false, connection_provider: null }, error: null };
        if (table === "capability_dependencies") return { data: [], error: null };
        if (table === "permission_grants") return { data: capability ? {
          ...grant, active: capability !== "calendar.read" || state.readAllowed
        } : [], error: null };
        return { data: [], error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { if (key === "capability_key") capability = value; return query; },
        maybeSingle: async () => result(),
        update: (patch: Record<string, unknown>) => { updating = true; state.writes.push({ table, patch }); return query; },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
      };
      return query;
    }
  })
}));

import { initializeCalendarConnection, runCalendarSync } from "./service";
import { CALENDAR_SCOPES } from "./constants";

const oauth = { clientId: "test-client", clientSecret: "test-secret", redirectUri: "https://product.example/api/calendar/oauth/callback" };
const credentials = {
  accessToken: "test-access", refreshToken: "test-refresh", expiresAt: "2099-01-01T00:00:00Z",
  scope: [...CALENDAR_SCOPES], tokenType: "Bearer"
};

beforeEach(() => {
  state.locked = false;
  state.paused = false;
  state.readAllowed = true;
  state.writes = [];
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: "connection-1", error: null });
  state.fetcher.mockReset();
  vi.stubGlobal("fetch", state.fetcher);
});

afterEach(() => vi.unstubAllGlobals());

describe("Calendar connection and sync failures", () => {
  it("clears the premature success timestamp and records an actionable failure when initialization fails", async () => {
    state.fetcher.mockResolvedValue(Response.json({ error: { errors: [{ reason: "accessNotConfigured" }] } }, { status: 403 }));
    await expect(initializeCalendarConnection("user-1", credentials, "https://product.example"))
      .rejects.toThrow("calendar_provider_accessNotConfigured");
    expect(state.writes).toContainEqual({ table: "external_connections", patch: {
      last_error_code: "calendar_calendar_api_disabled", last_error_at: expect.any(String), last_success_at: null
    } });
  });

  it.each(["privacy", "pause", "read permission"])("does not contact Google with %s blocking access", async (block) => {
    state.locked = block === "privacy";
    state.paused = block === "pause";
    state.readAllowed = block !== "read permission";
    await expect(runCalendarSync("user-1", oauth, "https://product.example")).rejects.toThrow();
    expect(state.fetcher).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("exposes revoked refresh credentials as a reauthorization error without overwriting the last successful sync", async () => {
    state.rpc.mockResolvedValue({ data: JSON.stringify({ ...credentials, expiresAt: "2020-01-01T00:00:00Z" }), error: null });
    state.fetcher.mockResolvedValue(Response.json({ error: "invalid_grant", error_description: "private detail" }, { status: 400 }));
    await expect(runCalendarSync("user-1", oauth, "https://product.example")).rejects.toThrow("calendar_oauth_invalid_grant");
    expect(state.writes).toContainEqual({ table: "external_connections", patch: {
      last_error_code: "calendar_reauthorization_required", last_error_at: expect.any(String)
    } });
    expect(JSON.stringify(state.writes)).not.toContain("private detail");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  set: vi.fn(),
  exchange: vi.fn(),
  initialize: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => mocks.values.has(name) ? { value: mocks.values.get(name) } : undefined,
  set: mocks.set
}) }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "user-1", isMock: false }) }));
vi.mock("@/lib/calendar/oauth", () => ({ exchangeGoogleAuthorizationCode: mocks.exchange }));
vi.mock("@/lib/calendar/service", () => ({ initializeCalendarConnection: mocks.initialize }));
vi.mock("@/lib/config", () => ({
  isCalendarServerConfigured: () => true, getCalendarOAuthConfig: () => ({}),
  isGmailServerConfigured: () => true, getGmailOAuthConfig: () => ({})
}));
vi.mock("@/lib/gmail/oauth", () => ({ exchangeGmailAuthorizationCode: vi.fn() }));
vi.mock("@/lib/gmail/service", () => ({ initializeGmailConnection: vi.fn() }));

import { GET } from "./route";

beforeEach(() => {
  mocks.values = new Map([
    ["calendar_oauth_state", "expected-state"], ["calendar_oauth_verifier", "verifier"], ["calendar_oauth_user", "user-1"]
  ]);
  mocks.set.mockReset();
  mocks.exchange.mockReset().mockResolvedValue({});
  mocks.initialize.mockReset().mockResolvedValue({ pendingOperations: 0, conflicts: 0 });
});

describe("Calendar OAuth callback", () => {
  it("finishes successful initialization and expires cookies at their original path", async () => {
    const response = await GET(new Request("https://product.example/api/calendar/oauth/callback?code=code&state=expected-state"));
    expect(response.headers.get("location")).toBe("https://product.example/calendar?notice=connected");
    for (const cookie of ["calendar_oauth_state", "calendar_oauth_verifier", "calendar_oauth_user"]) {
      expect(mocks.set).toHaveBeenCalledWith(cookie, "", { path: "/api/calendar/oauth", maxAge: 0 });
    }
  });

  it.each(["wrong-state", "different-user", "missing-user"])("rejects %s before exchanging or storing credentials", async (scenario) => {
    if (scenario === "different-user") mocks.values.set("calendar_oauth_user", "user-2");
    if (scenario === "missing-user") mocks.values.delete("calendar_oauth_user");
    const state = scenario === "wrong-state" ? "wrong" : "expected-state";
    const response = await GET(new Request(`https://product.example/api/calendar/oauth/callback?code=code&state=${state}`));
    expect(response.headers.get("location")).toContain("notice=oauth_state_invalid");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it("does not report initialization complete while writes remain pending", async () => {
    mocks.initialize.mockResolvedValue({ pendingOperations: 1, conflicts: 0 });
    const response = await GET(new Request("https://product.example/api/calendar/oauth/callback?code=code&state=expected-state"));
    expect(response.headers.get("location")).toContain("notice=sync_pending");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ values: new Map<string, string>(), set: vi.fn(), exchange: vi.fn(), initialize: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => mocks.values.has(name) ? { value: mocks.values.get(name) } : undefined,
  set: mocks.set
}) }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "user-1", isMock: false }) }));
vi.mock("@/lib/config", () => ({ isGmailServerConfigured: () => true, getGmailOAuthConfig: () => ({}) }));
vi.mock("@/lib/gmail/oauth", () => ({ exchangeGmailAuthorizationCode: mocks.exchange }));
vi.mock("@/lib/gmail/service", () => ({ initializeGmailConnection: mocks.initialize }));

import { GET } from "./route";

beforeEach(() => {
  mocks.values = new Map([["gmail_oauth_state", "state"], ["gmail_oauth_verifier", "verifier"]]);
  mocks.set.mockReset();
  mocks.exchange.mockReset().mockResolvedValue({ scope: ["readonly"] });
  mocks.initialize.mockReset().mockResolvedValue(undefined);
});

describe("Gmail OAuth callback", () => {
  it("stores the grant and removes the state cookies at the same path used by the start route", async () => {
    const response = await GET(new Request("http://localhost:3000/api/gmail/oauth/callback?code=code&state=state"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/inbox?notice=connected");
    for (const cookie of ["gmail_oauth_state", "gmail_oauth_verifier"]) {
      expect(mocks.set).toHaveBeenCalledWith(cookie, "", { path: "/api", maxAge: 0 });
    }
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched state before exchanging credentials", async () => {
    const response = await GET(new Request("http://localhost:3000/api/gmail/oauth/callback?code=code&state=wrong"));
    expect(response.headers.get("location")).toContain("notice=oauth_state_invalid");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it("distinguishes expanded scope from a generic connection failure", async () => {
    mocks.exchange.mockRejectedValue(new Error("gmail_oauth_scope_expanded"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await GET(new Request("http://localhost:3000/api/gmail/oauth/callback?code=code&state=state"));
      expect(response.headers.get("location")).toContain("notice=oauth_scope_invalid");
      expect(mocks.initialize).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("[gmail-oauth-callback]", "gmail_oauth_scope_expanded");
    } finally { log.mockRestore(); }
  });
});

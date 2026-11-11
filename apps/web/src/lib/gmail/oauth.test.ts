import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GMAIL_READONLY_SCOPE } from "./constants";
import { buildGmailAuthorizationUrl, exchangeGmailAuthorizationCode } from "./oauth";

const config = { clientId: "client", clientSecret: "secret", redirectUri: "https://example.test/api/gmail/oauth/callback" };

describe("Gmail OAuth", () => {
  it("requests exactly gmail.readonly with PKCE and isolated consent", () => {
    const url = new URL(buildGmailAuthorizationUrl(config, "state", "challenge"));
    expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("rejects a token response that silently expands scope", async () => {
    const fetcher = async () => new Response(JSON.stringify({
      access_token: "access", refresh_token: "refresh", expires_in: 3600,
      scope: `${GMAIL_READONLY_SCOPE} https://www.googleapis.com/auth/gmail.send`
    }), { status: 200 });
    await expect(exchangeGmailAuthorizationCode(config, "code", "verifier", fetcher as typeof fetch))
      .rejects.toThrow("gmail_oauth_scope_expanded");
  });
});

import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CALENDAR_SCOPES } from "./constants";
import {
  buildGoogleAuthorizationUrl,
  createOAuthState,
  createPkcePair,
  exchangeGoogleAuthorizationCode
} from "./oauth";

const config = {
  clientId: "calendar-test-client",
  clientSecret: "calendar-test-secret",
  redirectUri: "https://product.example/api/calendar/oauth/callback"
};

describe("Google Calendar OAuth", () => {
  it("uses only the approved minimal scopes with state and S256 PKCE", () => {
    const state = createOAuthState();
    const { verifier, challenge } = createPkcePair();
    const expectedChallenge = createHash("sha256").update(verifier).digest("base64url");
    const url = new URL(buildGoogleAuthorizationUrl(config, state, challenge));

    expect(state.length).toBeGreaterThanOrEqual(40);
    expect(challenge).toBe(expectedChallenge);
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...CALENDAR_SCOPES]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("exchanges the code without returning or logging the client secret", async () => {
    let body = "";
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({
        access_token: "short-lived-access",
        refresh_token: "long-lived-refresh",
        expires_in: 3600,
        scope: CALENDAR_SCOPES.join(" "),
        token_type: "Bearer"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const credentials = await exchangeGoogleAuthorizationCode(config, "one-time-code", "pkce-verifier", fetcher);

    expect(new URLSearchParams(body).get("client_secret")).toBe(config.clientSecret);
    expect(credentials.refreshToken).toBe("long-lived-refresh");
    expect(credentials.scope).toEqual([...CALENDAR_SCOPES]);
  });
});

import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { CALENDAR_SCOPES } from "./constants";

export type GoogleOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

export type CalendarCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string[];
  tokenType: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
};

function base64Url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createOAuthState() {
  return base64Url(randomBytes(32));
}

export function createPkcePair() {
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildGoogleAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
  codeChallenge: string
) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false"
  }).toString();
  return url.toString();
}

async function tokenRequest(body: URLSearchParams, fetcher: typeof fetch): Promise<TokenResponse> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store"
  });
  const result = await response.json() as TokenResponse;
  if (!response.ok || result.error) throw new Error(`calendar_oauth_${result.error ?? response.status}`);
  return result;
}

export async function exchangeGoogleAuthorizationCode(
  config: GoogleOAuthConfig,
  code: string,
  verifier: string,
  fetcher: typeof fetch = fetch
): Promise<CalendarCredentials> {
  const result = await tokenRequest(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code,
    code_verifier: verifier
  }), fetcher);
  if (!result.access_token || !result.refresh_token || !result.expires_in) {
    throw new Error("calendar_oauth_incomplete_credentials");
  }
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    scope: result.scope?.split(" ").filter(Boolean) ?? [...CALENDAR_SCOPES],
    tokenType: result.token_type ?? "Bearer"
  };
}

export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  credentials: CalendarCredentials,
  fetcher: typeof fetch = fetch
): Promise<CalendarCredentials> {
  const result = await tokenRequest(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken
  }), fetcher);
  if (!result.access_token || !result.expires_in) throw new Error("calendar_oauth_refresh_incomplete");
  return {
    ...credentials,
    accessToken: result.access_token,
    expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    scope: result.scope?.split(" ").filter(Boolean) ?? credentials.scope,
    tokenType: result.token_type ?? credentials.tokenType
  };
}

export async function revokeGoogleToken(token: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store"
  });
  if (!response.ok && response.status !== 400) throw new Error(`calendar_oauth_revoke_${response.status}`);
}

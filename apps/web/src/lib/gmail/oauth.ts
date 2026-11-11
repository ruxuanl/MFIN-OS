import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { GMAIL_SCOPES } from "./constants";

export type GmailOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };
export type GmailCredentials = {
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
export function createGmailOAuthState() {
  return base64Url(randomBytes(32));
}

export function createGmailPkcePair() {
  const verifier = base64Url(randomBytes(48));
  return { verifier, challenge: base64Url(createHash("sha256").update(verifier).digest()) };
}

export function buildGmailAuthorizationUrl(
  config: GmailOAuthConfig,
  state: string,
  codeChallenge: string
) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
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
  if (!response.ok || result.error) throw new Error(`gmail_oauth_${result.error ?? response.status}`);
  return result;
}

export async function exchangeGmailAuthorizationCode(
  config: GmailOAuthConfig,
  code: string,
  verifier: string,
  fetcher: typeof fetch = fetch
): Promise<GmailCredentials> {
  const result = await tokenRequest(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code,
    code_verifier: verifier
  }), fetcher);
  if (!result.access_token || !result.refresh_token || !result.expires_in) {
    throw new Error("gmail_oauth_incomplete_credentials");
  }
  const scopes = result.scope?.split(" ").filter(Boolean) ?? [...GMAIL_SCOPES];
  if (scopes.length !== 1 || scopes[0] !== GMAIL_SCOPES[0]) throw new Error("gmail_oauth_scope_expanded");
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    scope: scopes,
    tokenType: result.token_type ?? "Bearer"
  };
}

export async function refreshGmailAccessToken(
  config: GmailOAuthConfig,
  credentials: GmailCredentials,
  fetcher: typeof fetch = fetch
): Promise<GmailCredentials> {
  const result = await tokenRequest(new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken
  }), fetcher);
  if (!result.access_token || !result.expires_in) throw new Error("gmail_oauth_refresh_incomplete");
  const scopes = result.scope?.split(" ").filter(Boolean) ?? credentials.scope;
  if (scopes.length !== 1 || scopes[0] !== GMAIL_SCOPES[0]) throw new Error("gmail_oauth_scope_expanded");
  return {
    ...credentials,
    accessToken: result.access_token,
    expiresAt: new Date(Date.now() + result.expires_in * 1000).toISOString(),
    scope: scopes,
    tokenType: result.token_type ?? credentials.tokenType
  };
}

export async function revokeGmailToken(token: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store"
  });
  if (!response.ok && response.status !== 400) throw new Error(`gmail_oauth_revoke_${response.status}`);
}

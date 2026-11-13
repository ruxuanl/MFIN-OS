import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { getGmailOAuthConfig, isGmailServerConfigured } from "@/lib/config";
import { initializeGmailConnection } from "@/lib/gmail/service";
import { exchangeGmailAuthorizationCode } from "@/lib/gmail/oauth";
import { gmailOAuthFailureNotice, safeGmailErrorCode } from "@/lib/gmail/errors";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const store = await cookies();
  const expectedState = store.get("gmail_oauth_state")?.value;
  const verifier = store.get("gmail_oauth_verifier")?.value;
  store.set("gmail_oauth_state", "", { path: "/api", maxAge: 0 });
  store.set("gmail_oauth_verifier", "", { path: "/api", maxAge: 0 });
  if (user.isMock || !isGmailServerConfigured()) return NextResponse.redirect(`${url.origin}/inbox?notice=not_configured`);
  if (url.searchParams.has("error")) return NextResponse.redirect(`${url.origin}/inbox?notice=oauth_cancelled`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== expectedState || !verifier) return NextResponse.redirect(`${url.origin}/inbox?notice=oauth_state_invalid`);
  try {
    const credentials = await exchangeGmailAuthorizationCode(getGmailOAuthConfig(), code, verifier);
    await initializeGmailConnection(user.id, credentials);
    return NextResponse.redirect(`${url.origin}/inbox?notice=connected`);
  } catch (error) {
    console.error("[gmail-oauth-callback]", safeGmailErrorCode(error));
    return NextResponse.redirect(`${url.origin}/inbox?notice=${gmailOAuthFailureNotice(error)}`);
  }
}

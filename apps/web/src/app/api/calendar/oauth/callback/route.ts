import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/session";
import { exchangeGoogleAuthorizationCode } from "@/lib/calendar/oauth";
import { initializeCalendarConnection } from "@/lib/calendar/service";
import {
  getCalendarOAuthConfig,
  getGmailOAuthConfig,
  isCalendarServerConfigured,
  isGmailServerConfigured
} from "@/lib/config";
import { exchangeGmailAuthorizationCode } from "@/lib/gmail/oauth";
import { initializeGmailConnection } from "@/lib/gmail/service";

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const store = await cookies();
  const expectedState = store.get("calendar_oauth_state")?.value;
  const verifier = store.get("calendar_oauth_verifier")?.value;
  const gmailExpectedState = store.get("gmail_oauth_state")?.value;
  const gmailVerifier = store.get("gmail_oauth_verifier")?.value;
  const state = url.searchParams.get("state");

  // The existing test Web Client has this redirect URI registered. State
  // selects the independent Gmail flow; no Calendar grant or token is reused.
  if (state && gmailExpectedState && state === gmailExpectedState) {
    store.delete("gmail_oauth_state");
    store.delete("gmail_oauth_verifier");
    if (user.isMock || !isGmailServerConfigured()) {
      return NextResponse.redirect(`${url.origin}/inbox?notice=not_configured`);
    }
    if (url.searchParams.has("error")) {
      return NextResponse.redirect(`${url.origin}/inbox?notice=oauth_cancelled`);
    }
    const code = url.searchParams.get("code");
    if (!code || !gmailVerifier) {
      return NextResponse.redirect(`${url.origin}/inbox?notice=oauth_state_invalid`);
    }
    try {
      const credentials = await exchangeGmailAuthorizationCode(getGmailOAuthConfig(), code, gmailVerifier);
      await initializeGmailConnection(user.id, credentials);
      return NextResponse.redirect(`${url.origin}/inbox?notice=connected`);
    } catch (error) {
      console.error("[gmail-oauth-callback]", error instanceof Error ? error.message : "gmail_oauth_unknown");
      return NextResponse.redirect(`${url.origin}/inbox?notice=connection_failed`);
    }
  }

  store.delete("calendar_oauth_state");
  store.delete("calendar_oauth_verifier");

  if (user.isMock || !isCalendarServerConfigured()) {
    return NextResponse.redirect(`${url.origin}/calendar?notice=not_configured`);
  }
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error")) {
    return NextResponse.redirect(`${url.origin}/calendar?notice=oauth_cancelled`);
  }
  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return NextResponse.redirect(`${url.origin}/calendar?notice=oauth_state_invalid`);
  }

  try {
    const credentials = await exchangeGoogleAuthorizationCode(getCalendarOAuthConfig(), code, verifier);
    await initializeCalendarConnection(user.id, credentials, url.origin);
    return NextResponse.redirect(`${url.origin}/calendar?notice=connected`);
  } catch (error) {
    console.error("[calendar-oauth-callback]", error instanceof Error ? error.message : "calendar_oauth_unknown");
    return NextResponse.redirect(`${url.origin}/calendar?notice=connection_failed`);
  }
}

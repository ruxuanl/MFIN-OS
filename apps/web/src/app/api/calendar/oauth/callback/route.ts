import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/session";
import { exchangeGoogleAuthorizationCode } from "@/lib/calendar/oauth";
import { initializeCalendarConnection } from "@/lib/calendar/service";
import { calendarFailureNotice } from "@/lib/calendar/errors";
import { getCalendarSyncNotice } from "@/lib/calendar/model";
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
  const expectedUser = store.get("calendar_oauth_user")?.value;
  const gmailExpectedState = store.get("gmail_oauth_state")?.value;
  const gmailVerifier = store.get("gmail_oauth_verifier")?.value;
  const state = url.searchParams.get("state");

  // The existing test Web Client has this redirect URI registered. State
  // selects the independent Gmail flow; no Calendar grant or token is reused.
  if (state && gmailExpectedState && state === gmailExpectedState) {
    store.set("gmail_oauth_state", "", { path: "/api", maxAge: 0 });
    store.set("gmail_oauth_verifier", "", { path: "/api", maxAge: 0 });
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
    } catch {
      return NextResponse.redirect(`${url.origin}/inbox?notice=connection_failed`);
    }
  }

  for (const name of ["calendar_oauth_state", "calendar_oauth_verifier", "calendar_oauth_user"]) {
    store.set(name, "", { path: "/api/calendar/oauth", maxAge: 0 });
  }

  if (user.isMock || !isCalendarServerConfigured()) {
    return NextResponse.redirect(`${url.origin}/calendar?notice=not_configured`);
  }
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error")) {
    return NextResponse.redirect(`${url.origin}/calendar?notice=oauth_cancelled`);
  }
  if (!code || !state || !expectedState || state !== expectedState || !verifier || expectedUser !== user.id) {
    return NextResponse.redirect(`${url.origin}/calendar?notice=oauth_state_invalid`);
  }

  try {
    const credentials = await exchangeGoogleAuthorizationCode(getCalendarOAuthConfig(), code, verifier);
    const result = await initializeCalendarConnection(user.id, credentials, url.origin);
    const notice = getCalendarSyncNotice(result.pendingOperations, result.conflicts);
    return NextResponse.redirect(`${url.origin}/calendar?notice=${notice === "synced" ? "connected" : notice}`);
  } catch (error) {
    const notice = calendarFailureNotice(error);
    console.error("[calendar-oauth-callback]", notice);
    return NextResponse.redirect(`${url.origin}/calendar?notice=${notice === "sync_failed" ? "connection_failed" : notice}`);
  }
}

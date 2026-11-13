import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireUser, hasFreshReauthentication } from "@/lib/auth/session";
import { buildGoogleAuthorizationUrl, createOAuthState, createPkcePair } from "@/lib/calendar/oauth";
import { getCalendarOAuthConfig, isCalendarServerConfigured } from "@/lib/config";
import { isActiveReusableGrant, type GrantMode } from "@/lib/permissions/model";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await requireUser();
  const origin = new URL(request.url).origin;
  if (user.isMock || !isCalendarServerConfigured()) {
    return NextResponse.redirect(`${origin}/calendar?notice=not_configured`);
  }
  const supabase = await createClient();
  const [connectionPermission, readGrant] = await Promise.all([
    supabase.rpc("get_my_permission_decision", { capability_key: "calendar.connection" }),
    supabase
      .from("permission_grants")
      .select("mode,active,starts_at,expires_at")
      .eq("user_id", user.id)
      .eq("capability_key", "calendar.read")
      .maybeSingle()
  ]);
  const readPermissionAllowed = readGrant.data
    ? isActiveReusableGrant({
        mode: readGrant.data.mode as GrantMode,
        active: readGrant.data.active,
        startsAt: readGrant.data.starts_at,
        expiresAt: readGrant.data.expires_at
      })
    : false;
  if (
    connectionPermission.error || readGrant.error ||
    !connectionPermission.data?.[0]?.allowed || !readPermissionAllowed
  ) {
    return NextResponse.redirect(`${origin}/calendar?notice=connection_permission_required`);
  }
  if (!(await hasFreshReauthentication())) {
    return NextResponse.redirect(`${origin}/calendar?notice=reauth_required`);
  }

  const state = createOAuthState();
  const { verifier, challenge } = createPkcePair();
  const store = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 10 * 60,
    path: "/api/calendar/oauth"
  };
  store.set("calendar_oauth_state", state, cookieOptions);
  store.set("calendar_oauth_verifier", verifier, cookieOptions);
  store.set("calendar_oauth_user", user.id, cookieOptions);
  return NextResponse.redirect(buildGoogleAuthorizationUrl(getCalendarOAuthConfig(), state, challenge));
}

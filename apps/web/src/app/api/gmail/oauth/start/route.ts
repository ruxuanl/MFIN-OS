import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { hasFreshReauthentication, requireUser } from "@/lib/auth/session";
import { getGmailOAuthConfig, isGmailServerConfigured } from "@/lib/config";
import { buildGmailAuthorizationUrl, createGmailOAuthState, createGmailPkcePair } from "@/lib/gmail/oauth";
import { isActiveReusableGrant, type GrantMode } from "@/lib/permissions/model";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await requireUser();
  const origin = new URL(request.url).origin;
  if (user.isMock || !isGmailServerConfigured()) return NextResponse.redirect(`${origin}/inbox?notice=not_configured`);
  const supabase = await createClient();
  const [connectionPermission, syncGrant] = await Promise.all([
    supabase.rpc("get_my_permission_decision", { capability_key: "gmail.connection" }),
    supabase.from("permission_grants").select("mode,active,starts_at,expires_at")
      .eq("user_id", user.id).eq("capability_key", "gmail.sync").maybeSingle()
  ]);
  const syncAllowed = syncGrant.data ? isActiveReusableGrant({
    mode: syncGrant.data.mode as GrantMode,
    active: syncGrant.data.active,
    startsAt: syncGrant.data.starts_at,
    expiresAt: syncGrant.data.expires_at
  }) : false;
  if (connectionPermission.error || syncGrant.error || !connectionPermission.data?.[0]?.allowed || !syncAllowed) {
    return NextResponse.redirect(`${origin}/inbox?notice=connection_permission_required`);
  }
  if (!(await hasFreshReauthentication())) return NextResponse.redirect(`${origin}/inbox?notice=reauth_required`);
  const state = createGmailOAuthState();
  const { verifier, challenge } = createGmailPkcePair();
  const store = await cookies();
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, maxAge: 600, path: "/api" };
  store.set("gmail_oauth_state", state, options);
  store.set("gmail_oauth_verifier", verifier, options);
  return NextResponse.redirect(buildGmailAuthorizationUrl(getGmailOAuthConfig(), state, challenge));
}

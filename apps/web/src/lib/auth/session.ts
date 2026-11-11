import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuthMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

import type { AppUser } from "./types";

const mockUser: AppUser = {
  id: "m1-synthetic-user",
  email: "test.user@example.invalid",
  displayName: "MFin Workspace",
  isMock: true
};

// cache(): the layout and the page both ask for the user; resolve claims once per request.
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const mode = getAuthMode();
  if (mode === "mock") return mockUser;
  if (mode === "unconfigured") return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const claims = data.claims as Record<string, unknown>;
  const email = typeof claims.email === "string" ? claims.email : "";
  const metadata =
    claims.user_metadata && typeof claims.user_metadata === "object"
      ? (claims.user_metadata as Record<string, unknown>)
      : {};

  return {
    id: typeof claims.sub === "string" ? claims.sub : "unknown",
    email,
    displayName:
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : email.split("@")[0] || "Personal Workspace",
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined,
    isMock: false
  };
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function hasFreshReauthentication(maxAgeSeconds = 10 * 60) {
  if (getAuthMode() !== "supabase") return false;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return false;
  const claims = data.claims as Record<string, unknown>;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const times: number[] = [];
  if (typeof claims.auth_time === "number") times.push(claims.auth_time);
  if (Array.isArray(claims.amr)) {
    for (const entry of claims.amr) {
      if (!entry || typeof entry !== "object") continue;
      const value = entry as Record<string, unknown>;
      if (value.method !== "token_refresh" && typeof value.timestamp === "number") times.push(value.timestamp);
    }
  }
  // Supabase OAuth sessions do not consistently expose an AMR timestamp in
  // every JWT shape. `last_sign_in_at` is updated by a real sign-in (including
  // Passkey/OAuth) but not by routine access-token refresh, so it is a safe
  // fallback for the same fresh-auth window.
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (!userError && userResult.user?.last_sign_in_at) {
    const lastSignInSeconds = Math.floor(new Date(userResult.user.last_sign_in_at).getTime() / 1000);
    if (Number.isFinite(lastSignInSeconds)) times.push(lastSignInSeconds);
  }
  const latest = Math.max(...times, 0);
  return latest > 0 && nowSeconds - latest <= maxAgeSeconds;
}

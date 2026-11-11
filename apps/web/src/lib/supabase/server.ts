import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "@/lib/config";
import type { Database } from "@/lib/supabase/database.types";
import { timedFetch } from "@/lib/supabase/timed-fetch";

function debugTimingEnabled() {
  return process.env.MFIN_DEBUG_TIMING === "1" && process.env.NODE_ENV !== "production";
}

export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfig();

  return createServerClient<Database>(url, publishableKey, {
    ...(debugTimingEnabled() ? { global: { fetch: timedFetch() } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // A Server Component cannot always write cookies. proxy.ts refreshes them.
        }
      }
    }
  });
}

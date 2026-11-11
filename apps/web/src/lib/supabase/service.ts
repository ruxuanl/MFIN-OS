import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseServiceConfig } from "@/lib/config";
import type { Database } from "@/lib/supabase/database.types";

export function createServiceClient() {
  const { url, serverKey } = getSupabaseServiceConfig();
  return createClient<Database>(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init, signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000)
      })
    }
  });
}

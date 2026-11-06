import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/lib/config";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();

  return createBrowserClient<Database>(url, publishableKey, {
    auth: {
      experimental: { passkey: true }
    }
  });
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
export async function requireRadarSourceAccess(ownerId:string) {
  const client=await createClient();
  const [permission,privacy]=await Promise.all([
    client.rpc("get_my_permission_decision",{capability_key:"job_radar.discovery"}),
    client.from("privacy_locks").select("is_locked").eq("user_id",ownerId).maybeSingle()
  ]);
  if(privacy.error||privacy.data?.is_locked)throw new Error("privacy_locked");
  if(permission.error||!permission.data?.[0]?.allowed)throw new Error("radar_permission_denied");
  return client;
}

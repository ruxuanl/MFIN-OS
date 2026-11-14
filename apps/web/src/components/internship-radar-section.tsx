import { InternshipRadar } from "@/components/internship-radar";
import { requireUser } from "@/lib/auth/session";
import type { RadarSnapshot } from "@/lib/jobs/radar-model";
import { createClient } from "@/lib/supabase/server";

export async function InternshipRadarSection() {
  const user = await requireUser();
  const result = user.isMock ? null : await (await createClient()).rpc("manual_radar", { target_action: "read" });
  return <section className="workspace-section">
    <div className="workspace-section-heading"><div><h2>实习岗位发现雷达</h2><p>跨网站检索，查看证据，再确认加入候选。</p></div></div>
    {result?.error ? <p role="alert">发现记录读取失败，请稍后刷新。</p> : null}
    <InternshipRadar snapshot={(result?.data as unknown as RadarSnapshot) ?? { items: [], runs: [] }} />
  </section>;
}

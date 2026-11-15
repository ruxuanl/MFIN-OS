import { InternshipRadar } from "@/components/internship-radar";
import { requireUser } from "@/lib/auth/session";
import type { RadarSnapshot } from "@/lib/jobs/radar-model";
import { createClient } from "@/lib/supabase/server";
import { requireRadarSourceAccess } from "@/lib/jobs/radar-access";
import { searchLeadershipLocal } from "@/lib/jobs/leadership-local";
import { radarDefaults } from "@/lib/jobs/radar-model";
import { radarHeadline } from "@/lib/jobs/radar-results";
import { visibleRadarItems } from "@/lib/jobs/radar-model";
import { enrichRadarPageTimes } from "@/lib/jobs/radar-page-time";

export async function InternshipRadarSection() {
  const user = await requireUser();
  const result = user.isMock ? null : await (await createClient()).rpc("manual_radar", { target_action: "read" });
  const snapshot=(result?.data as unknown as RadarSnapshot)??{items:[],runs:[]};
  if(!user.isMock){
    try{
      await requireRadarSourceAccess(user.id);
      const preferences=snapshot.preferences??radarDefaults;
      const [local,web]=await Promise.all([searchLeadershipLocal(user.id,preferences),enrichRadarPageTimes(visibleRadarItems(snapshot.items).filter(item=>radarHeadline(item)))]);
      const times=new Map(web.map(item=>[item.url,item]));
      snapshot.items=snapshot.items.map(item=>times.get(item.url)??item);snapshot.localItems=local.items;snapshot.localStats={files:local.files,records:local.records,available:local.available,message:local.message};
    }catch{/* Existing records remain readable; locked sources are never newly opened. */}
  }
  return <section className="workspace-section">
    <div className="workspace-section-heading"><div><h2>实习岗位发现雷达</h2><p>跨网站检索，查看证据，再确认加入候选。</p></div></div>
    {result?.error ? <p role="alert">发现记录读取失败，请稍后刷新。</p> : null}
    <InternshipRadar snapshot={snapshot} />
  </section>;
}

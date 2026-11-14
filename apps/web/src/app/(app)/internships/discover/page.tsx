import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { InternshipRadar } from "@/components/internship-radar";
import { requireUser } from "@/lib/auth/session";
import type { RadarSnapshot } from "@/lib/jobs/radar-model";
import { createClient } from "@/lib/supabase/server";

export default async function DiscoveryPage() {
  const user = await requireUser();
  const result = user.isMock ? null : await (await createClient()).rpc("manual_radar", { target_action: "read" });
  return <div className="page-shell workspace-page">
    <PageHeader eyebrow="Internship radar" title="实习岗位发现雷达" description="跨网站检索，保留证据，由你确认加入候选。" action={<Link className="secondary-button" href="/internships?tab=candidates">查看候选池</Link>} />
    {result?.error ? <p role="alert">发现记录读取失败，请检查数据库迁移和连接后刷新。</p> : null}
    <InternshipRadar snapshot={(result?.data as unknown as RadarSnapshot) ?? { items: [], runs: [] }} />
  </div>;
}

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
export const metadata={ title: "历史导入记录" };
export default async function InboxHistoryPage() {
  const user=await requireUser();
  const client=await createClient();
  const { data,error }=user.isMock ? {data: [],error: null} : await client.from("inbox_items").select("id,title,summary,created_at").eq("user_id",user.id).not("wechat_projection_id","is",null).order("created_at",{ascending:false});
  if(error) throw error;
  return <div className="page-shell mail-page"><PageHeader title="历史导入记录" eyebrow="ARCHIVE" action={<Link href="/inbox" className="quiet-link">返回收件箱</Link>}/><section className="mail-list-section">{data?.length ? data.map(item=><article className="mail-detail-section" key={item.id}><h2>{item.title}</h2><p>{item.summary}</p><small>{new Date(item.created_at).toLocaleDateString("zh-CN",{timeZone:"Asia/Hong_Kong"})}</small></article>) : <p className="mail-empty">暂无历史导入记录</p>}</section></div>;
}

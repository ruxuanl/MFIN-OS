"use client";
import { useActionState } from "react";
import { discoverInternships, decideDiscovery } from "@/app/(app)/internships/discover/actions";
import { SubmitButton } from "@/components/operation-feedback";
import { radarDefaults, type RadarSnapshot, type RadarItem } from "@/lib/jobs/radar-model";

const initial = { ok: false, message: "" };
function DiscoveryCard({ item }: { item: RadarItem & { id: string; discoveredAt: string } }) {
  const [state, action, pending] = useActionState(decideDiscovery, initial);
  const inactive = item.status === "added" || item.status === "ignored";
  return <article className="panel">
    <p>{item.company} · {item.location}</p><h2>{item.title}</h2>
    <p className="phase-badge">{item.status === "added" ? "已加入候选" : item.status === "ignored" ? "已忽略" : item.kind === "closed" ? "已关闭／过期" : "待核实"}</p>
    <p>{item.kind === "job" ? "疑似具体岗位页" : item.kind === "closed" ? "证据提示岗位关闭" : "页面类型待确认，可能是列表或文章"} · {item.evidenceKind === "page_text" ? "已取得页面文本，开放状态待核实" : "仅搜索摘要，证据不足"}</p>
    <p>截止日期：{item.deadline ?? "未知"} · 开放状态：{item.kind === "closed" ? "关闭证据，需核对原文" : "未知／待核实"}</p>
    <p>发现于 {new Date(item.discoveredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
    <a href={item.url} target="_blank" rel="noopener noreferrer">打开来源页面 ↗</a>
    <p>{item.reason}</p><p>资格提醒：{item.warning}</p>
    <details><summary>查看检索证据</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.evidence || "未取得正文或摘要。"}</p></details>
    {!inactive ? <form action={action} className="workspace-form">
      <input name="id" type="hidden" value={item.id} />
      <div className="field-grid">
        <label>确认公司（未知可保留）<input name="company" defaultValue={item.company} maxLength={240} /></label>
        <label>确认岗位名称<input name="title" defaultValue={item.title} maxLength={240} /></label>
      </div>
      <div className="button-row">
        <SubmitButton name="decision" value="add" className="primary-button" disabled={pending || item.kind === "closed"} pendingLabel="正在保存…">加入候选</SubmitButton>
        <SubmitButton name="decision" value="ignore" className="secondary-button" disabled={pending} pendingLabel="正在忽略…">忽略</SubmitButton>
      </div>
    </form> : null}
    {state.message ? <p role="status">{state.message}</p> : null}
  </article>;
}
export function InternshipRadar({ snapshot }: { snapshot: RadarSnapshot }) {
  const [state, action] = useActionState(discoverInternships, initial);
  const p = snapshot.preferences ?? radarDefaults;
  return <>
    <section className="panel">
      <form action={action} className="workspace-form">
        <div className="field-grid">
          <label>目标方向<input name="direction" defaultValue={p.direction} maxLength={120} required /></label>
          <label>地区<input name="region" defaultValue={p.region} maxLength={120} required /></label>
          <label>关键词<input name="keywords" defaultValue={p.keywords} maxLength={120} /></label>
          <label>实习类型<input name="internshipType" defaultValue={p.internshipType} maxLength={120} required /></label>
        </div>
        <label>简短确认画像（只用于 AI，不发送给搜索服务）<textarea name="profile" defaultValue={p.profile} maxLength={600} rows={3} required /></label>
        <label><input type="checkbox" name="confirmed" required /> 我确认上述条件与画像；不包含整份简历、证件或联系方式。</label>
        <p>默认条件来自已确认的 D14 和项目背景，可直接修改。每轮最多 8 条，1 次 Tavily Basic 搜索；60 秒冷却，24 小时最多 20 轮。AI 另计入现有 HK$100 月预算。</p>
        <SubmitButton className="primary-button" pendingLabel="正在联网搜索并整理证据…">发现实习</SubmitButton>
      </form>
      <p>请在设置中开启求职雷达与岗位发现；AI 理由还需雷达评分、AI 总开关与 JD 分析权限。隐私锁会阻止搜索和写入。</p>
      {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </section>
    <section className="workspace-section"><h2>待确认发现结果</h2>
      <p>搜索索引可能滞后，不能证明仍在招聘。添加前请打开来源核对；加入候选后仍需本人选择追踪。</p>
      {!snapshot.items.length ? <p>暂无发现结果。可发起一轮真实搜索；无结果时不会填充演示岗位。</p> : null}
      {snapshot.items.map(item => <DiscoveryCard key={(item as RadarItem & { id: string }).id} item={item as RadarItem & { id: string; discoveredAt: string }} />)}
    </section>
    <details><summary>最近搜索记录</summary>{snapshot.runs.map(run => <p key={run.id}>{new Date(run.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · {run.status} {run.error ? `· ${run.error}` : ""}</p>)}</details>
  </>;
}

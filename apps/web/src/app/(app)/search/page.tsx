import Link from "next/link";

import { rebuildSearchIndex } from "@/app/(app)/search/actions";
import { SubmitButton } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { searchWorkspace } from "@/lib/search/data";
import { hasCriteria, parseSearchParams, resultHref } from "@/lib/search/params";
import { skillLabelByKey } from "@/lib/skills/dictionary";
import { queryOpportunities } from "@/lib/skills/data";
import { describeFilters, hasFilters, parseQuestion, presetQuestions } from "@/lib/skills/question";

export const metadata = { title: "搜索" };

const typeLabels: Record<string, string> = { opportunity: "岗位", candidate: "候选", gmail_message: "邮件摘要" };
const sourceLabels: Record<string, string> = { user: "手动录入", jd_paste: "粘贴 JD", public_source: "公开来源", gmail: "Gmail" };
const notices: Record<string, string> = {
  rebuilt: "搜索索引已从业务数据重建。",
  rebuild_failed: "重建失败；隐私锁开启时不能重建。",
  preview: "隔离预览模式没有可搜索的数据。"
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Hong_Kong", dateStyle: "medium" }).format(new Date(value)) : "—";
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const params = parseSearchParams(raw);
  const ask = typeof raw.ask === "string" ? raw.ask.trim().slice(0, 200) : "";
  const askFilters = ask ? parseQuestion(ask) : null;
  const [outcome, answer] = await Promise.all([
    hasCriteria(params) ? searchWorkspace(user, params) : Promise.resolve(null),
    askFilters && hasFilters(askFilters) ? queryOpportunities(user, askFilters) : Promise.resolve(null)
  ]);
  const skillName = (key: string) => skillLabelByKey.get(key) ?? key;
  const notice = typeof raw.notice === "string" ? notices[raw.notice] : undefined;

  return (
    <div className="page-shell">
      <PageHeader eyebrow="Universal search" title="搜索" description="检索岗位、候选和邮件摘要。关键词逐个必须命中；结果遵守你的权限与隐私锁，并标注来源与时间。" />
      {notice ? <p className="workspace-notice">{notice}</p> : null}
      <section className="workspace-section">
        <form className="search-form" method="get">
          <input name="q" defaultValue={params.query} placeholder="关键词，例如：投行 Python 上海" maxLength={200} autoFocus />
          <fieldset className="search-types">
            {Object.entries(typeLabels).map(([value, label]) => (
              <label key={value}><input type="checkbox" name="type" value={value} defaultChecked={params.types.includes(value as never)} />{label}</label>
            ))}
          </fieldset>
          <div className="field-grid">
            <label><span>求职线</span><select name="track" defaultValue={params.track ?? ""}><option value="">全部</option><option value="internship">实习</option><option value="graduate">秋招</option></select></label>
            <label><span>阶段 / 状态</span><input name="stage" defaultValue={params.stage ?? ""} placeholder="如 submitted、candidate、job" /></label>
            <label><span>公司</span><input name="company" defaultValue={params.company ?? ""} maxLength={120} /></label>
            <label><span>地点</span><input name="location" defaultValue={params.location ?? ""} maxLength={120} /></label>
            <label><span>截止不早于</span><input name="from" type="date" defaultValue={params.deadlineFrom ?? ""} /></label>
            <label><span>截止不晚于</span><input name="to" type="date" defaultValue={params.deadlineTo ?? ""} /></label>
          </div>
          <SubmitButton className="primary-button" pendingLabel="正在搜索…">搜索</SubmitButton>
        </form>
      </section>

      <section className="workspace-section">
        {!outcome ? <p className="workspace-empty">输入关键词或选择筛选条件后开始搜索。</p>
          : outcome.status === "mock" ? <p className="workspace-empty">隔离预览模式没有可搜索的数据。</p>
            : outcome.status === "privacy_locked" ? <p className="workspace-empty">隐私锁已开启，搜索已被服务器拒绝。</p>
              : outcome.status === "error" ? <p className="workspace-empty">搜索失败，请稍后重试。</p>
                : outcome.results.length === 0 ? <p className="workspace-empty">没有找到匹配的记录。</p>
                  : (
                    <ol className="search-results">
                      {outcome.results.map((item) => (
                        <li key={`${item.object_type}:${item.object_id}`}>
                          <div className="search-result-meta">
                            <span className="phase-badge">{typeLabels[item.object_type] ?? item.object_type}</span>
                            {item.track ? <span>{item.track === "graduate" ? "秋招" : "实习"}</span> : null}
                            {item.stage ? <span>{item.stage}</span> : null}
                            {item.deadline ? <span>截止 {item.deadline}</span> : null}
                          </div>
                          <Link href={resultHref(item)}><strong>{item.title}</strong></Link>
                          {item.snippet ? <p>{item.snippet}</p> : null}
                          <small>
                            来源：{sourceLabels[item.source_kind] ?? item.source_kind} · {formatDate(item.source_at)} · 索引于 {formatDate(item.indexed_at)}
                            {item.source_url ? <> · <a className="quiet-link" href={item.source_url} target="_blank" rel="noreferrer noopener">原始来源 ↗</a></> : null}
                          </small>
                        </li>
                      ))}
                    </ol>
                  )}
      </section>


      <section className="workspace-section">
        <div className="workspace-section-heading"><div><p>Multi-hop questions</p><h2>按条件提问</h2></div></div>
        <p className="section-note">把“阶段 + 技能 + 回复 + 简历差距 + 截止 + 地点”组合成一句话；规则解析（非 AI），并显示系统如何理解。</p>
        <form className="search-form" method="get">
          <input name="ask" defaultValue={ask} placeholder="例如：投过、要求 Python、还没回复" maxLength={200} />
          <SubmitButton className="primary-button" pendingLabel="正在查询…">提问</SubmitButton>
        </form>
        <div className="question-presets">
          {presetQuestions.map((preset) => <Link key={preset} className="quiet-link" href={`/search?ask=${encodeURIComponent(preset)}`}>{preset}</Link>)}
        </div>
        {askFilters ? (
          <div className="question-chips">
            <span>理解为：</span>
            {hasFilters(askFilters) ? describeFilters(askFilters, skillName).map((chip) => <span key={chip} className="phase-badge">{chip}</span>) : <span>没有识别到可用条件，请换一种说法。</span>}
          </div>
        ) : null}
        {!answer ? null
          : answer.status === "mock" ? <p className="workspace-empty">隔离预览模式没有可查询的数据。</p>
            : answer.status === "privacy_locked" ? <p className="workspace-empty">隐私锁已开启，查询已被服务器拒绝。</p>
              : answer.status === "error" ? <p className="workspace-empty">查询失败，请稍后重试。</p>
                : answer.results.length === 0 ? <p className="workspace-empty">没有符合全部条件的岗位。</p>
                  : (
                    <ol className="search-results">
                      {answer.results.map((item) => (
                        <li key={item.opportunity_id}>
                          <div className="search-result-meta">
                            <span className="phase-badge">{item.track === "graduate" ? "秋招" : "实习"}</span>
                            <span>{item.main_stage}</span>
                            {item.deadline ? <span>截止 {item.deadline}</span> : null}
                            <span>{item.replied ? "已有回复" : "未见回复"}</span>
                          </div>
                          <Link href={`${item.track === "graduate" ? "/graduate" : "/internships"}/${item.opportunity_id}`}><strong>{item.company} · {item.role_title}</strong></Link>
                          <small>技能：{item.skills.length ? item.skills.map(skillName).join("、") : "—"}{item.missing_skills.length ? ` · 简历未体现：${item.missing_skills.map(skillName).join("、")}` : ""}</small>
                        </li>
                      ))}
                    </ol>
                  )}
      </section>

      <section className="workspace-section">
        <form action={rebuildSearchIndex} className="search-rebuild">
          <p className="section-note">索引由数据库触发器自动维护，可随时从业务数据完整重建；完整邮件正文从不进入索引。</p>
          <SubmitButton className="quiet-button" pendingLabel="正在重建…">重建搜索索引</SubmitButton>
        </form>
      </section>
    </div>
  );
}

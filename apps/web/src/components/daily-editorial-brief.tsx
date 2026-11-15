import type { editorialDaily } from "@/lib/jobs/editorial-daily";

export function DailyEditorialBrief({ brief }: { brief: typeof editorialDaily }) {
  return <section className="daily-editorial" aria-label="今日补充核验简报">
    <div className="daily-editorial-intro"><h3>{brief.headline}</h3><p>{brief.summary}</p></div>
    <ul className="daily-editorial-list">{brief.items.map(item => <li key={item.url}>
      <div className="daily-opportunity-heading"><h4>{item.company}</h4><span className="daily-verdict">{item.status}</span></div>
      <a className="daily-role-link" href={item.url} target="_blank" rel="noreferrer">{item.title}<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 19 19 5M5 5h14v14"/></svg></a>
      <p className="daily-role-meta">{item.direction} <span aria-hidden="true">/</span> {item.timing}</p>
      <p>{item.reason}</p>
      <dl className="daily-reading-notes"><div><dt>先核对</dt><dd>{item.requirement}</dd></div><div><dt>怎么准备</dt><dd>{item.preparation}</dd></div></dl>
      <details className="daily-evidence"><summary>来源与核验依据</summary><p>{item.evidence}</p><p>核验日期 {brief.day}；发布日期未知。页面可访问不保证名额仍有剩余。</p><a href={item.evidenceUrl} target="_blank" rel="noreferrer">查看原始依据</a></details>
    </li>)}</ul>
    <p className="daily-editorial-footnote">本版为公开来源补充核验，不设匹配分，不自动加入候选池。请在原文确认资格与开放状态。</p>
  </section>;
}

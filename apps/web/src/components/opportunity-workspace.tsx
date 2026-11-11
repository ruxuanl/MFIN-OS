import Link from "next/link";

import { createCandidate, promoteCandidate, saveWorkspaceView } from "@/app/(app)/workspace-actions";
import { JdImporter } from "@/components/jd-importer";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/operation-feedback";
import { WorkspaceNotice } from "@/components/workspace-notice";
import { WorkspaceSnapshotCache } from "@/components/workspace-snapshot-cache";
import { requireUser } from "@/lib/auth/session";
import { getOpportunityWorkspace, type OpportunityFilters, type SavedView } from "@/lib/workspaces/data";
import { opportunityStages, stageLabels, type OpportunityStage } from "@/lib/workspaces/model";

type Search = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`)) : "—";
}

function viewHref(basePath: string, view: SavedView) {
  const filters = view.filters && typeof view.filters === "object" && !Array.isArray(view.filters)
    ? view.filters as Record<string, unknown>
    : {};
  const params = new URLSearchParams();
  for (const key of ["query", "stage", "state"]) {
    if (typeof filters[key] === "string" && filters[key]) params.set(key, filters[key]);
  }
  if (Array.isArray(view.sort_spec) && typeof view.sort_spec[0] === "string") params.set("sort", view.sort_spec[0]);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export async function OpportunityWorkspace({
  track,
  searchParams
}: {
  track: "internship" | "graduate";
  searchParams: Promise<Search>;
}) {
  const user = await requireUser();
  const search = await searchParams;
  const basePath = track === "internship" ? "/internships" : "/graduate";
  const filters: OpportunityFilters = {
    query: first(search.query),
    stage: first(search.stage),
    state: first(search.state) === "archived" ? "archived" : "active",
    sort: ["deadline", "company"].includes(first(search.sort) ?? "")
      ? first(search.sort) as OpportunityFilters["sort"]
      : "updated"
  };
  const data = await getOpportunityWorkspace(user, track, filters);
  const title = track === "internship" ? "实习" : "秋招";
  const scope = track === "internship" ? "internships" : "graduate";
  const actionByOpportunity = new Map(
    data.actions.filter((action) => action.context_id).map((action) => [action.context_id!, action])
  );

  return (
    <div className="page-shell workspace-page">
      <PageHeader
        eyebrow={track === "internship" ? "Internship pipeline" : "Graduate pipeline"}
        title={title}
        description={track === "internship"
          ? "香港主攻、内地补充。候选只有经你选择追踪或申请，才进入实习长期表。"
          : "内地主攻、香港补充。秋招拥有独立候选池与长期表，不会与实习串线。"}
        action={<span className="phase-badge">M3 · Live workspace</span>}
      />
      <WorkspaceNotice notice={first(search.notice)} />
      <WorkspaceSnapshotCache snapshot={{
        scope,
        updatedAt: new Date().toISOString(),
        records: data.opportunities.map((item) => ({
          id: item.id,
          title: `${item.company} · ${item.role_title}`,
          subtitle: stageLabels[item.main_stage as OpportunityStage] ?? item.main_stage,
          href: `${basePath}/${item.id}`
        }))
      }} />

      <JdImporter track={track} />

      <section className="workspace-section candidate-section">
        <div className="workspace-section-heading">
          <div><p>Candidate pool</p><h2>候选池</h2></div>
          <span className="count-chip">{data.candidates.length}</span>
        </div>
        <details className="create-drawer">
          <summary>＋ 手动加入候选</summary>
          <form action={createCandidate} className="workspace-form compact-form">
            <input type="hidden" name="track" value={track} />
            <div className="field-grid">
              <label><span>公司 *</span><input name="company" required maxLength={240} /></label>
              <label><span>岗位 *</span><input name="roleTitle" required maxLength={240} /></label>
              <label><span>部门</span><input name="department" maxLength={240} /></label>
              <label><span>地点</span><input name="location" maxLength={240} /></label>
              <label><span>工作形式</span><select name="workMode" defaultValue="unspecified"><option value="unspecified">未说明</option><option value="onsite">线下</option><option value="hybrid">混合</option><option value="remote">远程</option></select></label>
              <label><span>截止日期</span><input name="deadline" type="date" /></label>
              <label className="field-wide"><span>来源摘要</span><textarea name="sourceSummary" rows={2} maxLength={1000} /></label>
              <label className="field-wide"><span>来源链接</span><input name="sourceUrl" type="url" maxLength={2048} /></label>
            </div>
            <SubmitButton className="primary-button" pendingLabel="正在创建…">加入候选池</SubmitButton>
          </form>
        </details>

        {data.candidates.length === 0 ? (
          <p className="workspace-empty">尚无候选。M3 不会用假岗位填充，也不会自动把岗位塞进长期表。</p>
        ) : (
          <div className="candidate-grid">
            {data.candidates.map((candidate) => (
              <article className="candidate-card" key={candidate.id}>
                <div><span>{candidate.location || "地点待确认"}</span><h3>{candidate.company}</h3><p>{candidate.role_title}</p></div>
                {candidate.source_summary ? <small>{candidate.source_summary}</small> : null}
                <div className="candidate-actions">
                  <form action={promoteCandidate}>
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <input type="hidden" name="track" value={track} />
                    <input type="hidden" name="intent" value="track" />
                    <SubmitButton className="quiet-button" pendingLabel="正在加入…">追踪</SubmitButton>
                  </form>
                  <form action={promoteCandidate}>
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <input type="hidden" name="track" value={track} />
                    <input type="hidden" name="intent" value="apply" />
                    <SubmitButton className="primary-button" pendingLabel="正在加入…">准备申请</SubmitButton>
                  </form>
                </div>
                <p className="boundary-caption">“准备申请”只进入准备阶段；系统不会投递或提交。</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="workspace-section">
        <div className="workspace-section-heading">
          <div><p>Long-term table</p><h2>{title}长期表</h2></div>
          <div className="heading-badges"><span className="count-chip">{data.opportunities.length}</span>{data.pendingConflicts ? <span className="conflict-chip">{data.pendingConflicts} 个冲突</span> : null}</div>
        </div>

        <form className="filter-bar" method="get">
          <input name="query" defaultValue={filters.query} placeholder="搜索公司、岗位或地点" />
          <select name="stage" defaultValue={filters.stage ?? ""}><option value="">全部阶段</option>{opportunityStages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select>
          <select name="state" defaultValue={filters.state}><option value="active">进行中</option><option value="archived">已归档</option></select>
          <select name="sort" defaultValue={filters.sort}><option value="updated">最近更新</option><option value="deadline">截止日期</option><option value="company">公司名称</option></select>
          <SubmitButton className="quiet-button" pendingLabel="正在筛选…">应用</SubmitButton>
        </form>

        <div className="saved-view-row">
          <span>保存视图</span>
          {data.views.map((view) => <Link key={view.id} href={viewHref(basePath, view)}>{view.name}</Link>)}
          <details>
            <summary>＋ 保存当前筛选</summary>
            <form action={saveWorkspaceView}>
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="returnTo" value={basePath} />
              <input type="hidden" name="filters" value={JSON.stringify({ query: filters.query ?? "", stage: filters.stage ?? "", state: filters.state })} />
              <input type="hidden" name="sortSpec" value={JSON.stringify([filters.sort])} />
              <input name="name" required maxLength={120} placeholder="视图名称" />
              <SubmitButton pendingLabel="正在保存…">保存</SubmitButton>
            </form>
          </details>
        </div>

        {data.opportunities.length === 0 ? (
          <p className="workspace-empty">当前视图没有正式记录。候选必须由你选择“追踪”或“准备申请”后才会出现。</p>
        ) : (
          <div className="table-scroll">
            <table className="workspace-table">
              <thead><tr><th>公司 / 岗位</th><th>部门 / 地点</th><th>阶段</th><th>截止</th><th>投递日期</th>{track === "internship" ? <th>简历版本</th> : null}<th>下一步</th><th>最近更新</th></tr></thead>
              <tbody>{data.opportunities.map((item) => {
                const action = actionByOpportunity.get(item.id);
                return <tr key={item.id}>
                  <td><Link href={`${basePath}/${item.id}`}><strong>{item.company}</strong><small>{item.role_title}</small></Link></td>
                  <td><strong>{item.department || "—"}</strong><small>{item.location || "地点待确认"}</small></td>
                  <td><span className={`stage-pill stage-${item.main_stage}`}>{stageLabels[item.main_stage as OpportunityStage] ?? item.main_stage}</span>{item.substage ? <small>{item.substage}</small> : null}</td>
                  <td>{formatDate(item.deadline)}</td>
                  <td>{item.applied_at ? new Date(item.applied_at).toLocaleDateString("zh-CN") : "—"}</td>
                  {track === "internship" ? <td>{data.resumeByOpportunity[item.id]
                    ? <a className="quiet-link" href={`/api/materials/resume/${data.resumeByOpportunity[item.id].id}`} target="_blank" rel="noreferrer">{data.resumeByOpportunity[item.id].label} · v{data.resumeByOpportunity[item.id].versionNumber} ↗</a>
                    : <Link className="quiet-link" href={`${basePath}/${item.id}`}>默认 Master</Link>}</td> : null}
                  <td>{action ? <><strong>{action.title}</strong><small>{action.due_at ? new Date(action.due_at).toLocaleDateString("zh-CN") : "未排期"}</small></> : "—"}</td>
                  <td>{new Date(item.updated_at).toLocaleDateString("zh-CN")}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

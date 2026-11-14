import Link from "next/link";

import { createCourse, saveWorkspaceView } from "@/app/(app)/workspace-actions";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/operation-feedback";
import { WorkspaceNotice } from "@/components/workspace-notice";
import { WorkspaceSnapshotCache } from "@/components/workspace-snapshot-cache";
import { requireUser } from "@/lib/auth/session";
import { getAcademicWorkspace } from "@/lib/workspaces/data";

const statusLabels: Record<string, string> = { on_track: "正常", attention: "需关注", behind: "落后", ended: "已结束" };

export async function AcademicWorkspace({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const search = await searchParams;
  const state = (Array.isArray(search.state) ? search.state[0] : search.state) === "archived" ? "archived" : "active";
  const notice = Array.isArray(search.notice) ? search.notice[0] : search.notice;
  const data = await getAcademicWorkspace(user, state);
  const nextAction = new Map(data.actions.filter((action) => action.context_id).map((action) => [action.context_id!, action]));

  return (
    <div className="page-shell workspace-page">
      <PageHeader
        eyebrow="HKU MFin"
        title="学业"
        description="按 Module 与课程组织长期状态和行动。M3 只建立课程表与行动；课纲解析、资料和笔记留在 M10。"
      />
      <WorkspaceNotice notice={notice} />
      <WorkspaceSnapshotCache snapshot={{
        scope: "academics",
        updatedAt: new Date().toISOString(),
        records: data.courses.map((course) => ({ id: course.id, title: `${course.course_code} · ${course.title}`, subtitle: statusLabels[course.course_status], href: `/academics/${course.id}` }))
      }} />

      <section className="workspace-section">
        <div className="workspace-section-heading"><div><p>Long-term table</p><h2>课程长期表</h2></div><div className="heading-badges"><span className="count-chip">{data.courses.length}</span>{data.pendingConflicts ? <span className="conflict-chip">{data.pendingConflicts} 个冲突</span> : null}</div></div>
        <details className="create-drawer">
          <summary>＋ 手动添加课程</summary>
          <form action={createCourse} className="workspace-form compact-form">
            <div className="field-grid">
              <label><span>Module</span><input name="module" type="number" min={1} max={12} /></label>
              <label><span>课程代码 *</span><input name="courseCode" required maxLength={40} /></label>
              <label className="field-wide"><span>课程名称 *</span><input name="title" required maxLength={240} /></label>
              <label><span>开始日期</span><input name="startsOn" type="date" /></label>
              <label><span>结束日期</span><input name="endsOn" type="date" /></label>
              <label className="field-wide"><span>固定课时</span><textarea name="fixedSchedule" rows={2} maxLength={1000} placeholder="例如：周二、周四 18:30–21:30" /></label>
            </div>
            <SubmitButton className="primary-button" pendingLabel="正在创建…">加入学业表</SubmitButton>
          </form>
        </details>
        <div className="filter-bar academic-filter"><Link className={state === "active" ? "is-selected" : ""} href="/academics?state=active">进行中</Link><Link className={state === "archived" ? "is-selected" : ""} href="/academics?state=archived">已归档</Link></div>
        <div className="saved-view-row"><span>保存视图</span>{data.views.map((view) => <Link key={view.id} href={`/academics?state=${state}`}>{view.name}</Link>)}<details><summary>＋ 保存当前视图</summary><form action={saveWorkspaceView}><input type="hidden" name="scope" value="academics" /><input type="hidden" name="returnTo" value="/academics" /><input type="hidden" name="filters" value={JSON.stringify({ state })} /><input type="hidden" name="sortSpec" value="[]" /><input name="name" required placeholder="视图名称" /><SubmitButton pendingLabel="正在保存…">保存</SubmitButton></form></details></div>
        {data.courses.length === 0 ? <p className="workspace-empty">尚无课程记录。首次从课纲识别课程仍须在 M10 由你确认；这里不会自动生成虚假课程。</p> : (
          <div className="table-scroll"><table className="workspace-table academic-table"><thead><tr><th>Module</th><th>课程</th><th>日期</th><th>固定课时</th><th>状态</th><th>下一截止</th><th>最近更新</th></tr></thead><tbody>
            {data.courses.map((course) => {
              const action = nextAction.get(course.id);
              return <tr key={course.id}><td><span className="module-mark">{course.module ? `M${course.module}` : "—"}</span></td><td><Link href={`/academics/${course.id}`}><strong>{course.title}</strong><small>{course.course_code}</small></Link></td><td>{course.starts_on || "—"}<small>{course.ends_on ? `至 ${course.ends_on}` : ""}</small></td><td>{course.fixed_schedule || "—"}</td><td><span className={`stage-pill course-${course.course_status}`}>{statusLabels[course.course_status] ?? course.course_status}</span></td><td>{action?.due_at ? new Date(action.due_at).toLocaleDateString("zh-CN") : course.next_deadline ? new Date(course.next_deadline).toLocaleDateString("zh-CN") : "—"}</td><td>{new Date(course.updated_at).toLocaleDateString("zh-CN")}</td></tr>;
            })}
          </tbody></table></div>
        )}
      </section>
    </div>
  );
}

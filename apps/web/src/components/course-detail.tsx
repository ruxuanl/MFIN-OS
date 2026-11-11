import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { WorkspaceMutationForm, type MutationField } from "@/components/workspace-mutation-form";
import { WorkspaceNotice } from "@/components/workspace-notice";
import { ActionPanel, ConflictPanel, CustomFieldsPanel, TimelinePanel } from "@/components/workspace-detail-panels";
import { requireUser } from "@/lib/auth/session";
import { getCourseDetail } from "@/lib/workspaces/data";

const statusLabels: Record<string, string> = { on_track: "正常", attention: "需关注", behind: "落后", ended: "已结束" };

export async function CourseDetail({ id, notice }: { id: string; notice?: string }) {
  const user = await requireUser();
  const data = await getCourseDetail(user, id);
  if (!data) notFound();
  const course = data.course;
  const returnTo = `/academics/${id}`;
  const locked = new Set(data.locks.map((lock) => lock.field_path));
  const lock = (field: MutationField) => ({ ...field, locked: locked.has(field.name) });
  const fields: MutationField[] = [
    lock({ name: "module", label: "Module", type: "number", nullable: true }),
    lock({ name: "course_code", label: "课程代码" }),
    lock({ name: "title", label: "课程名称" }),
    lock({ name: "starts_on", label: "开始日期", type: "date", nullable: true }),
    lock({ name: "ends_on", label: "结束日期", type: "date", nullable: true }),
    lock({ name: "fixed_schedule", label: "固定课时", type: "textarea", nullable: true }),
    lock({ name: "course_status", label: "手动状态", type: "select", options: [
      { value: "on_track", label: "正常" }, { value: "attention", label: "需关注" },
      { value: "behind", label: "落后" }, { value: "ended", label: "已结束" }
    ] }),
    lock({ name: "next_deadline", label: "下一个截止", type: "datetime-local", nullable: true }),
    lock({ name: "record_state", label: "记录状态", type: "select", options: [
      { value: "active", label: "进行中" }, { value: "archived", label: "已归档" }
    ] })
  ];
  return (
    <div className="page-shell detail-page">
      <Link className="back-link" href="/academics">← 返回学业表</Link>
      <PageHeader eyebrow={`Module ${course.module ?? "—"} · v${course.version}`} title={course.title} description={`${course.course_code}${course.fixed_schedule ? ` · ${course.fixed_schedule}` : ""}`} action={<span className={`stage-pill course-${course.course_status}`}>{statusLabels[course.course_status] ?? course.course_status}</span>} />
      <WorkspaceNotice notice={notice} />
      <ConflictPanel conflicts={data.conflicts} returnTo={returnTo} />
      <div className="detail-grid">
        <section className="detail-panel detail-main"><div className="panel-heading"><div><p>Current projection</p><h3>课程核心字段</h3></div><span className="lock-count">{locked.size} 个字段锁</span></div><WorkspaceMutationForm objectType="course" objectId={course.id} version={course.version} initialValues={course} fields={fields} /></section>
        <ActionPanel actions={data.actions} dependencies={data.dependencies} contextType="course" contextId={course.id} track="academic" returnTo={returnTo} />
        <CustomFieldsPanel definitions={data.customFields} values={data.customValues} scope="academic" entityType="course" entityId={course.id} returnTo={returnTo} />
        <TimelinePanel timeline={data.timeline} />
      </div>
    </div>
  );
}

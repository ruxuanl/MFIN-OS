import {
  addActionDependency,
  createAction,
  createCustomField,
  resolveConflict,
  setCustomFieldValue
} from "@/app/(app)/workspace-actions";
import { WorkspaceMutationForm } from "@/components/workspace-mutation-form";
import { SubmitButton } from "@/components/operation-feedback";
import type {
  Action,
  ActionDependency,
  CustomFieldDefinition,
  CustomFieldValue,
  SyncConflict,
  TimelineEntry
} from "@/lib/workspaces/data";

function displayJson(value: unknown) {
  if (value === null || value === undefined) return "空值";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function ActionPanel({
  actions,
  dependencies,
  contextType,
  contextId,
  track,
  returnTo
}: {
  actions: Action[];
  dependencies: ActionDependency[];
  contextType: "opportunity" | "course";
  contextId: string;
  track: "internship" | "graduate" | "academic";
  returnTo: string;
}) {
  return (
    <section className="detail-panel">
      <div className="panel-heading"><div><p>Actions</p><h3>行动与下一步</h3></div><span className="muted-count">{actions.length}</span></div>
      <details className="create-drawer">
        <summary>＋ 新建行动</summary>
        <form action={createAction} className="workspace-form compact-form">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="contextType" value={contextType} />
          <input type="hidden" name="contextId" value={contextId} />
          <input type="hidden" name="track" value={track} />
          <div className="field-grid">
            <label className="field-wide"><span>可执行描述 *</span><input name="title" required maxLength={300} /></label>
            <label><span>截止时间</span><input name="dueAt" type="datetime-local" /></label>
            <label><span>建议开始</span><input name="suggestedStartAt" type="datetime-local" /></label>
            <label><span>预计分钟</span><input name="estimatedMinutes" type="number" min={1} max={10080} /></label>
            <label><span>优先级</span><select name="priority" defaultValue="normal"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="critical">关键</option></select></label>
            <label className="field-wide"><span>完成标准</span><textarea name="completionCriteria" rows={2} maxLength={1000} /></label>
          </div>
          <SubmitButton className="primary-button" pendingLabel="正在创建…">创建行动</SubmitButton>
        </form>
      </details>
      {actions.length === 0 ? <p className="workspace-empty small-empty">尚无行动。每个活跃机会或课程应逐步形成明确下一步。</p> : (
        <div className="action-stack">
          {actions.map((action) => (
            <details className="action-card" key={action.id}>
              <summary><span className={`action-status status-${action.status}`} /> <strong>{action.title}</strong><small>{action.due_at ? new Date(action.due_at).toLocaleString("zh-CN") : "未排期"}</small></summary>
              <WorkspaceMutationForm
                objectType="action"
                objectId={action.id}
                version={action.version}
                initialValues={action}
                fields={[
                  { name: "title", label: "行动描述" },
                  { name: "status", label: "状态", type: "select", options: [
                    { value: "unscheduled", label: "未排期" }, { value: "scheduled", label: "已排期" },
                    { value: "waiting", label: "等待" }, { value: "completed", label: "完成" },
                    { value: "cancelled", label: "取消" }
                  ] },
                  { name: "due_at", label: "截止时间", type: "datetime-local", nullable: true },
                  { name: "priority", label: "优先级", type: "select", options: [
                    { value: "low", label: "低" }, { value: "normal", label: "普通" },
                    { value: "high", label: "高" }, { value: "critical", label: "关键" }
                  ] },
                  { name: "waiting_on", label: "等待方", type: "select", nullable: true, options: [
                    { value: "user", label: "等待用户" }, { value: "other_party", label: "等待对方" },
                    { value: "none", label: "无需等待" }, { value: "insufficient_information", label: "信息不足" }
                  ] },
                  { name: "completion_criteria", label: "完成标准", type: "textarea", nullable: true }
                ]}
              />
              {actions.length > 1 ? <form action={addActionDependency} className="dependency-form">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="actionId" value={action.id} />
                <label><span>前置依赖</span><select name="dependsOnActionId" required defaultValue=""><option value="" disabled>选择必须先完成的行动</option>{actions.filter((candidate) => candidate.id !== action.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label>
                <SubmitButton className="quiet-button" pendingLabel="正在添加…">添加依赖</SubmitButton>
              </form> : null}
              {dependencies.filter((dependency) => dependency.action_id === action.id).length ? <p className="dependency-note">需先完成：{dependencies.filter((dependency) => dependency.action_id === action.id).map((dependency) => actions.find((candidate) => candidate.id === dependency.depends_on_action_id)?.title ?? "其他行动").join("、")}</p> : null}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export function ConflictPanel({ conflicts, returnTo }: { conflicts: SyncConflict[]; returnTo: string }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="detail-panel conflict-panel">
      <div className="panel-heading"><div><p>Conflict queue</p><h3>需要你决定的同步冲突</h3></div><span className="conflict-chip">{conflicts.length}</span></div>
      <p className="section-note">两端修改了同一字段。系统没有使用“最后写入者获胜”，云端值也没有被静默覆盖。</p>
      <div className="conflict-stack">
        {conflicts.map((conflict) => (
          <article key={conflict.id}>
            <strong>{conflict.field_path}</strong>
            <div className="conflict-values"><span><small>本机修改</small>{displayJson(conflict.local_value)}</span><span><small>当前云端</small>{displayJson(conflict.server_value)}</span></div>
            <div className="conflict-actions">
              <form action={resolveConflict}><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="conflictId" value={conflict.id} /><input type="hidden" name="resolution" value="use_local" /><SubmitButton className="primary-button" pendingLabel="正在处理…">保留本机</SubmitButton></form>
              <form action={resolveConflict}><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="conflictId" value={conflict.id} /><input type="hidden" name="resolution" value="use_server" /><SubmitButton className="quiet-button" pendingLabel="正在处理…">保留云端</SubmitButton></form>
              <form action={resolveConflict} className="manual-resolution"><input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="conflictId" value={conflict.id} /><input type="hidden" name="resolution" value="manual" /><input name="manualValue" required placeholder="输入最终值" /><SubmitButton className="quiet-button" pendingLabel="正在处理…">使用手动值</SubmitButton></form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CustomFieldsPanel({
  definitions,
  values,
  scope,
  entityType,
  entityId,
  returnTo
}: {
  definitions: CustomFieldDefinition[];
  values: CustomFieldValue[];
  scope: "internship" | "graduate" | "academic";
  entityType: "opportunity" | "course";
  entityId: string;
  returnTo: string;
}) {
  const valueByDefinition = new Map(values.map((value) => [value.definition_id, value.value]));
  return (
    <section className="detail-panel">
      <div className="panel-heading"><div><p>Custom fields</p><h3>自定义字段</h3></div><span className="muted-count">{definitions.length}</span></div>
      <details className="create-drawer">
        <summary>＋ 新建字段</summary>
        <form action={createCustomField} className="inline-create-form">
          <input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="scope" value={scope} />
          <input name="label" required maxLength={120} placeholder="字段名称" />
          <select name="fieldType"><option value="text">文本</option><option value="date">日期</option><option value="option">选项</option><option value="rating">评分</option><option value="link">链接</option></select>
          <input name="options" maxLength={1000} placeholder="选项用逗号分隔" />
          <SubmitButton className="quiet-button" pendingLabel="正在创建…">创建</SubmitButton>
        </form>
      </details>
      {definitions.length === 0 ? <p className="workspace-empty small-empty">尚无自定义字段；核心阶段和领域归属不能被自定义字段替代。</p> : (
        <div className="custom-field-list">{definitions.map((definition) => (
          <form action={setCustomFieldValue} key={definition.id}>
            <input type="hidden" name="returnTo" value={returnTo} /><input type="hidden" name="definitionId" value={definition.id} />
            <input type="hidden" name="entityType" value={entityType} /><input type="hidden" name="entityId" value={entityId} />
            <label><span>{definition.label}<small className="lock-chip">手动</small></span><input name="value" defaultValue={displayJson(valueByDefinition.get(definition.id) ?? "")} /></label>
            <SubmitButton className="quiet-button" pendingLabel="正在保存…">保存</SubmitButton>
          </form>
        ))}</div>
      )}
    </section>
  );
}

export function TimelinePanel({ timeline }: { timeline: TimelineEntry[] }) {
  return (
    <section className="detail-panel timeline-panel">
      <div className="panel-heading"><div><p>Append-only history</p><h3>发展时间线</h3></div><span className="muted-count">{timeline.length}</span></div>
      {timeline.length === 0 ? <p className="workspace-empty small-empty">尚无历史。</p> : (
        <ol>{timeline.map((entry) => <li key={entry.id}><span /><div><strong>{entry.summary}</strong><small>{new Date(entry.occurred_at).toLocaleString("zh-CN")} · {entry.actor_type}</small></div></li>)}</ol>
      )}
    </section>
  );
}

import { extractResumeSkillsAction, setOpportunitySkillAction } from "@/app/(app)/skills-actions";
import { SubmitButton } from "@/components/operation-feedback";
import { skillsDictionary } from "@/lib/skills/dictionary";
import type { SkillsView } from "@/lib/skills/data";

export function OpportunitySkillsPanel({ view, opportunityId, returnTo }: { view: SkillsView; opportunityId: string; returnTo: string }) {
  const active = view.skills.filter((skill) => skill.status === "active");
  const removed = view.skills.filter((skill) => skill.status === "removed");
  const covered = active.filter((skill) => skill.in_resume).length;
  const present = new Set(active.map((skill) => skill.skill_key));
  const addable = skillsDictionary.filter((skill) => !present.has(skill.key));
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <section className="detail-panel">
      <div className="panel-heading">
        <div><p>Skills · skills_dict_v1</p><h3>技能与简历差距</h3></div>
        <span className="muted-count">{view.resume?.hasSkills ? `${covered} / ${active.length} 已覆盖` : `${active.length} 项`}</span>
      </div>
      <p className="section-note">
        规则词典从 JD 中识别（非 AI）。{view.resume
          ? <>对照简历：{view.resume.label} · v{view.resume.versionNumber}。</>
          : "尚无可对照的简历版本。"}
        手动增删会锁定，重新识别不会覆盖。
      </p>
      {view.resume && !view.resume.hasSkills ? (
        <form action={extractResumeSkillsAction} className="inline-form">
          {hidden("versionId", view.resume.id)}{hidden("returnTo", returnTo)}
          <SubmitButton className="quiet-button" pendingLabel="正在提取…">从简历文件提取技能</SubmitButton>
        </form>
      ) : null}
      {active.length === 0 ? <p className="workspace-empty small-empty">JD 中没有识别到词典内的技能。</p> : (
        <ul className="skill-list">
          {active.map((skill) => (
            <li key={skill.skill_key} className={view.resume?.hasSkills ? (skill.in_resume ? "is-covered" : "is-gap") : undefined}>
              <div>
                <strong>{skill.label}</strong>
                <small>{view.resume?.hasSkills ? (skill.in_resume ? "简历已覆盖" : "简历未体现") : "—"} · {skill.source === "user" ? "手动 · 已锁定" : "规则识别"}</small>
                {skill.evidence ? <small className="skill-evidence">“{skill.evidence}”</small> : null}
              </div>
              <form action={setOpportunitySkillAction}>
                {hidden("opportunityId", opportunityId)}{hidden("skillKey", skill.skill_key)}{hidden("present", "false")}{hidden("returnTo", returnTo)}
                <SubmitButton className="quiet-button" pendingLabel="正在移除…">不需要</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      {removed.length ? <p className="section-note">已手动移除：{removed.map((skill) => skill.label).join("、")}</p> : null}
      <form action={setOpportunitySkillAction} className="inline-form">
        {hidden("opportunityId", opportunityId)}{hidden("present", "true")}{hidden("returnTo", returnTo)}
        <select name="skillKey" defaultValue="" required aria-label="手动添加技能">
          <option value="" disabled>手动添加技能…</option>
          {addable.map((skill) => <option key={skill.key} value={skill.key}>{skill.label}</option>)}
        </select>
        <SubmitButton className="quiet-button" pendingLabel="正在添加…">添加</SubmitButton>
      </form>
    </section>
  );
}

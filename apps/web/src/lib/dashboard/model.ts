export const pipelineStages = ["applied", "read_confirmed", "assessment", "interview", "offer"] as const;
export type PipelineStage = typeof pipelineStages[number];
export const pipelineLabels = ["Applied", "Read Confirmed", "OA / Assessment", "Interview", "Offer"];
export const sectors = ["Buy-side", "Sell-side", "PE / VC"] as const;
export type Sector = typeof sectors[number];
export type Application = {
  id: string; company: string; role_title: string; department: string | null;
  main_stage: string; substage: string | null; applied_at: string | null;
  close_reason: string | null; record_state: string; parser_version: string | null;
};
export type StageEvent = {
  id: string; entity_id: string; occurred_at: string; summary: string;
  event_type: string; changes: unknown;
};
export type Mail = {
  id: string; received_at: string; subject: string; sender_summary: string | null;
  gmail_link: string; needs_action: boolean; action_due_at: string | null;
  classification: string; priority: string | null; summary: string | null; recruitmentChange?: boolean;
};
export type MailTask = {
  id: string; messageId: string; itemId: string; title: string; status: string;
  dueAt: string | null; priority: string; version: number; actionId: string | null;
};
export type DashboardInput = { applications: Application[]; events: StageEvent[]; mail: Mail[]; tasks: MailTask[] };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function stageOf(main: unknown, substage: unknown): PipelineStage | null {
  if (main === "submitted" && /read.confirmed|已读确认|HR.?已读/i.test(String(substage ?? ""))) return "read_confirmed";
  return ({ submitted: "applied", test: "assessment", interview: "interview", offer: "offer" } as const)[String(main) as "submitted"] ?? null;
}
export function eventStages(event: StageEvent): PipelineStage[] {
  const changes = object(event.changes);
  const before = object(changes.before);
  const patch = object(changes.patch);
  const stages = [
    stageOf(changes.from_stage ?? before.main_stage, before.substage),
    stageOf(changes.to_stage ?? patch.main_stage ?? before.main_stage, changes.to_substage ?? patch.substage)
  ];
  return stages.filter((stage): stage is PipelineStage => stage !== null);
}

// Only explicit sector evidence is classified. Non-target and ambiguous roles
// remain outside the three series, with their coverage gap displayed in the UI.
export function sectorOf(application: Pick<Application, "company" | "department" | "role_title">): Sector | null {
  const text = `${application.company} ${application.department ?? ""} ${application.role_title}`;
  const privateMarket = /\b(?:PE|VC|CVC|private equity|venture capital|growth equity)\b|私募股权|创业投资|风险投资|产业投资|成长投资/i.test(text);
  const buy = /\bbuy[- ]side\b|asset management|hedge fund|mutual fund|资产管理|公募|私募证券|对冲基金|二级买方/i.test(text);
  const sell = /\bsell[- ]side\b|equity research|securities research|证券研究|卖方研究|二级卖方/i.test(text);
  const matches: Sector[] = [...(privateMarket ? ["PE / VC" as const] : []), ...(buy ? ["Buy-side" as const] : []), ...(sell ? ["Sell-side" as const] : [])];
  return matches.length === 1 ? matches[0] : null;
}

const dayMs = 86_400_000;
// Reporting uses the product's Hong Kong / China timezone, never the server TZ.
export function dayKey(value: string | number) {
  const stamp = new Date(value).getTime();
  return Number.isFinite(stamp) ? new Date(stamp + 8 * 3_600_000).toISOString().slice(0, 10) : "";
}
function weekKey(value: string | number) {
  const day = dayKey(value);
  if (!day) return "";
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function taskStatus(status: string) {
  if (status === "completed") return "Completed";
  if (status === "cancelled" || status === "dismissed") return "Dismissed";
  if (status === "waiting" || status === "scheduled") return "In Progress";
  return "Pending";
}
export function mailCategory(mail: Mail, hasAction: boolean, recruitmentChange: boolean) {
  if (hasAction || mail.needs_action) return "Action Required";
  if (recruitmentChange) return "Recruitment Changes";
  if (mail.priority === "important" || mail.priority === "attention") return "Important Updates";
  return "Low Priority";
}

export function buildAnalytics(input: DashboardInput, now: number) {
  const applications = input.applications.filter((app) => app.parser_version !== "seed_v1");
  const appIds = new Set(applications.map((app) => app.id));
  const events = input.events.filter((event) => appIds.has(event.entity_id));
  const history = new Map(applications.map((app) => [app.id, new Set<PipelineStage>()]));
  for (const app of applications) {
    const current = stageOf(app.main_stage, app.substage);
    if (current) history.get(app.id)!.add(current);
    if (app.applied_at && Number.isFinite(Date.parse(app.applied_at)) && Date.parse(app.applied_at) <= now) history.get(app.id)!.add("applied");
  }
  for (const event of events) for (const stage of eventStages(event)) history.get(event.entity_id)!.add(stage);
  const pipeline = pipelineStages.map((stage, index) => ({ stage, label: pipelineLabels[index], count: [...history.values()].filter((set) => set.has(stage)).length }));
  const total = [...history.values()].filter((set) => set.size > 0).length;
  const active = applications.filter((app) => app.record_state === "active" && app.main_stage !== "ended" && history.get(app.id)!.size > 0).length;
  const weeks = Array.from({ length: 12 }, (_, index) => ({ week: weekKey(now - (11 - index) * 7 * dayMs), values: [0, 0, 0] }));
  let unclassified = 0;
  let undated = 0;
  for (const app of applications.filter((app) => history.get(app.id)!.size > 0)) {
    if (!app.applied_at || !dayKey(app.applied_at) || Date.parse(app.applied_at) > now) { undated++; continue; }
    const week = weeks.find((item) => item.week === weekKey(app.applied_at!));
    if (!week) continue;
    const sector = sectorOf(app);
    if (sector) week.values[sectors.indexOf(sector)]++;
    else unclassified++;
  }
  const distribution = ["submitted", "read_confirmed", "test", "interview", "waiting", "offer", "ended"].map((stage) => ({
    stage, label: ({ submitted: "Applied", read_confirmed: "Read Confirmed", test: "Assessment", interview: "Interview", waiting: "Waiting", offer: "Offer", ended: "Closed" } as Record<string, string>)[stage],
    count: applications.filter((app) => (stage === "read_confirmed" ? stageOf(app.main_stage, app.substage) === "read_confirmed" : stage === "submitted" ? app.main_stage === stage && stageOf(app.main_stage, app.substage) !== "read_confirmed" : app.main_stage === stage) && history.get(app.id)!.size > 0).length
  }));
  const mail24 = input.mail.filter((mail) => Date.parse(mail.received_at) > now - dayMs && Date.parse(mail.received_at) <= now);
  const pending = input.tasks.filter((task) => ["Pending", "In Progress"].includes(taskStatus(task.status)));
  const days = Array.from({ length: 14 }, (_, index) => ({ day: dayKey(now - (13 - index) * dayMs), total: 0, important: 0, action: 0 }));
  for (const mail of input.mail) {
    const day = days.find((item) => item.day === dayKey(mail.received_at));
    if (day) { day.total++; if (mail.priority === "important") day.important++; if (mail.needs_action) day.action++; }
  }
  return {
    pipeline, total, active, weeks, distribution, unclassified, undated,
    interviews: pipeline[3].count, read: pipeline[1].count,
    important24: mail24.filter((mail) => mail.priority === "important").length,
    mail24: mail24.length, action24: mail24.filter((mail) => mail.needs_action).length,
    pending: pending.length,
    deadlines: pending.filter((task) => task.dueAt && Date.parse(task.dueAt) >= now && Date.parse(task.dueAt) <= now + 7 * dayMs).length,
    days,
    actionDistribution: ["Pending", "In Progress", "Completed", "Dismissed"].map((label) => ({ label, count: input.tasks.filter((task) => taskStatus(task.status) === label).length })),
    activity: events.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 20).map((event) => ({ ...event, company: applications.find((app) => app.id === event.entity_id)!.company }))
  };
}
export type Analytics = ReturnType<typeof buildAnalytics>;

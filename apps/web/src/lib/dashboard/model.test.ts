import { describe, expect, it } from "vitest";
import { buildAnalytics, dayKey, eventStages, sectorOf, taskStatus, type Application, type DashboardInput } from "./model";

const now = Date.parse("2026-11-16T10:00:00Z");
const app = (patch: Partial<Application> = {}): Application => ({ id: "a", company: "Synthetic Asset Management", role_title: "Analyst", department: null, main_stage: "submitted", substage: null, applied_at: "2026-11-16T01:00:00Z", record_state: "active", close_reason: null, parser_version: "jd_rules_v2", ...patch });
const input = (applications: Application[]): DashboardInput => ({ applications, events: [], mail: [], tasks: [] });
describe("dashboard formal analytics", () => {
  it("counts historical distinct stages without filling skipped steps", () => {
    const data = input([app({ main_stage: "interview" })]);
    data.events = [1, 2].map((id) => ({ id: String(id), entity_id: "a", occurred_at: "2026-11-16T01:00:00Z", summary: "Synthetic stage update", event_type: "manual_update", changes: { before: { main_stage: "submitted" }, patch: { main_stage: "interview" } } }));
    expect(buildAnalytics(data, now).pipeline.map((stage) => stage.count)).toEqual([1, 0, 0, 1, 0]);
  });
  it("keeps terminated applications in historical counts, excludes seeds and unsubmitted prospects", () => {
    const data = input([app({ main_stage: "ended" }), app({ id: "seed", parser_version: "seed_v1" }), app({ id: "prospect", main_stage: "new", applied_at: null })]);
    const result = buildAnalytics(data, now);
    expect([result.active, result.total, result.distribution.at(-1)?.count]).toEqual([0, 1, 1]);
  });
  it("recognizes submitted Read Confirmed as a historical stage and preserves manual history", () => {
    const data = input([app({ main_stage: "offer", applied_at: null })]);
    data.events = [{ id: "e", entity_id: "a", occurred_at: "2026-11-16T01:00:00Z", summary: "Synthetic update", event_type: "manual_update", changes: { before: { main_stage: "submitted", substage: "Read Confirmed" }, patch: { main_stage: "offer" } } }];
    expect(buildAnalytics(data, now).pipeline.map((stage) => stage.count)).toEqual([0, 1, 0, 0, 1]);
    expect(eventStages({ ...data.events[0], changes: { to_stage: "submitted", to_substage: "Read Confirmed" } })).toEqual(["read_confirmed"]);
  });
  it("uses only three explicit sectors and reports unknown / ambiguous coverage", () => {
    expect(sectorOf(app())).toBe("Buy-side");
    expect(sectorOf(app({ company: "Synthetic", role_title: "Equity Research" }))).toBe("Sell-side");
    expect(sectorOf(app({ company: "Synthetic CVC", role_title: "Growth equity" }))).toBe("PE / VC");
    expect(sectorOf(app({ role_title: "Private Equity" }))).toBeNull();
    expect(sectorOf(app({ company: "Unknown", role_title: "Investment banking" }))).toBeNull();
    const data = input([app({ company: "Unknown" }), app({ id: "undated", applied_at: null })]);
    expect(buildAnalytics(data, now)).toMatchObject({ unclassified: 1, undated: 1 });
  });
  it("does not equate mail action flags with completion and uses rolling 24h / 7d boundaries", () => {
    const data = input([]);
    data.mail = [{ id: "m", received_at: "2026-11-15T10:00:01Z", subject: "Synthetic", sender_summary: null, gmail_link: "https://mail.google.com/", needs_action: true, action_due_at: null, classification: "job", priority: "important", summary: null }];
    data.tasks = ["completed", "waiting", "cancelled", "unscheduled"].map((status, index) => ({ id: String(index), itemId: String(index), messageId: "m", actionId: String(index), title: "Synthetic", status, dueAt: "2026-11-23T10:00:00Z", priority: "normal", version: 1 }));
    expect(buildAnalytics(data, now)).toMatchObject({ mail24: 1, important24: 1, action24: 1, pending: 2, deadlines: 2 });
    expect(taskStatus("scheduled")).toBe("In Progress");
    expect(dayKey("2026-11-15T16:00:00Z")).toBe("2026-11-16");
  });
  it("returns honest zero / empty states without demo statistics", () => {
    const result = buildAnalytics(input([]), now);
    expect(result.total).toBe(0);
    expect(result.pipeline.every((stage) => stage.count === 0)).toBe(true);
    expect(result.activity).toEqual([]);
  });
});

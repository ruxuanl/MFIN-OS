// Deterministic synthetic data for an isolated Test project (issue #8, D33).
// Everything here is invented: fictional companies (Contoso, Fabrikam, ... and
// Chinese names marked "（示例）"), no real e-mail addresses or phone numbers.
// IDs are derived from a fixed namespace, so seeding is idempotent and the
// cleanup script can delete exactly the rows the seed created.
import { createHash } from "node:crypto";

export const SEED_NAMESPACE = "mfin-os.synthetic-seed.v1";

export const defaultCounts = Object.freeze({
  opportunities: 200,
  candidates: 80,
  gmailMessages: 300,
  calendarEvents: 150
});

export function seedId(kind, index) {
  const hex = createHash("sha256").update(`${SEED_NAMESPACE}:${kind}:${index}`).digest("hex");
  // Format as an RFC 4122 version-4-shaped UUID so it passes uuid parsing everywhere.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const companies = [
  "Contoso Capital", "Fabrikam Securities", "Northwind Partners", "Woodgrove Advisory",
  "Tailspin Research", "Litware Bank", "Proseware Asset Management", "Wingtip Investments",
  "青岚资本（示例）", "澄海证券（示例）", "远帆投资（示例）", "云杉研究所（示例）"
];
const departments = ["Investment Banking", "Global Research", "Equity Research", "Asset Management",
  "Fixed Income", "研究所", "投资银行部", "资产管理部"];
const internshipRoles = ["Summer Analyst", "Off-cycle Intern", "Research Intern", "研究实习生", "投行实习生"];
const graduateRoles = ["Graduate Analyst", "Analyst Programme", "管培生", "行业研究员（应届）", "Investment Analyst"];
const locations = ["香港", "上海", "北京", "深圳", "Hong Kong · Hybrid", "Singapore"];
const skills = ["Python", "SQL", "Excel / VBA", "DCF 估值", "财务建模", "Bloomberg", "Wind", "CFA 一级", "普通话", "粤语", "英语"];
const stagePlan = [
  ["evaluation", 40], ["preparation", 30], ["submitted", 35], ["test", 20], ["interview", 25],
  ["waiting", 20], ["offer", 5], ["ended", 25]
];
const closeReasons = ["rejected", "withdrawn", "closed", "ineligible", "expired"];

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function pickSome(random, list, count) {
  const copy = [...list];
  const out = [];
  while (out.length < count && copy.length) out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
  return out;
}

function isoDate(base, offsetDays) {
  const date = new Date(base.getTime() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function isoTime(base, offsetHours) {
  return new Date(base.getTime() + offsetHours * 3_600_000).toISOString();
}

function jdText(company, role, department, location, required) {
  return [
    `${company} · ${role}`,
    `部门：${department}`,
    `地点：${location}`,
    "岗位职责：",
    "- 支持行业研究与公司分析，撰写研究摘要（合成示例文本）",
    "- 参与估值模型搭建与数据整理",
    "- 协助准备客户材料与内部会议纪要",
    "任职要求：",
    ...required.map((skill) => `- 熟悉 ${skill}`),
    "- 2027 年毕业，金融、经济或相关专业",
    "申请方式：通过公司官网投递（合成示例，链接无效）"
  ].join("\n");
}

export function buildSeedData({ counts = defaultCounts, now = new Date("2026-11-12T08:00:00+08:00") } = {}) {
  const random = rng(20261112);
  const opportunities = [];
  const stages = stagePlan.flatMap(([stage, weight]) => Array(weight).fill(stage));
  for (let i = 0; i < counts.opportunities; i += 1) {
    const track = i % 2 === 0 ? "internship" : "graduate";
    const company = pick(random, companies);
    const department = pick(random, departments);
    const role = pick(random, track === "internship" ? internshipRoles : graduateRoles);
    const location = pick(random, locations);
    const required = pickSome(random, skills, 3);
    const stage = stages[i % stages.length];
    const applied = ["submitted", "test", "interview", "waiting", "offer", "ended"].includes(stage);
    const archived = stage === "ended" && i % 3 === 0;
    const rawJd = jdText(company, role, department, location, required);
    opportunities.push({
      id: seedId("opportunity", i),
      track,
      intent: applied || stage === "preparation" ? "apply" : "track",
      company,
      department,
      role_title: role,
      location,
      work_mode: "unspecified",
      deadline: isoDate(now, Math.floor(random() * 60) - 10),
      posted_on: isoDate(now, -Math.floor(random() * 30) - 1),
      source_summary: rawJd.replace(/\s+/g, " ").slice(0, 300),
      source_url: `https://careers.${company.toLowerCase().replace(/[^a-z]+/g, "") || "sample"}.example/jobs/${i}`,
      main_stage: stage,
      close_reason: stage === "ended" ? closeReasons[i % closeReasons.length] : null,
      applied_at: applied ? isoTime(now, -24 * (5 + Math.floor(random() * 40))) : null,
      waiting_on: applied ? "other_party" : "user",
      record_state: archived ? "archived" : "active",
      archived_at: archived ? isoTime(now, -24) : null,
      raw_jd: rawJd,
      responsibilities: "支持行业研究与公司分析；参与估值模型搭建；协助准备客户材料。",
      requirements: required.map((skill) => `熟悉 ${skill}`).join("；"),
      application_method: "通过公司官网投递（合成示例）",
      parser_version: "seed_v1",
      extraction_confidence: 0.9,
      extraction_gaps: []
    });
  }

  const candidates = [];
  for (let i = 0; i < counts.candidates; i += 1) {
    const track = i % 2 === 0 ? "internship" : "graduate";
    const company = pick(random, companies);
    candidates.push({
      id: seedId("candidate", i),
      track,
      company,
      department: pick(random, departments),
      role_title: pick(random, track === "internship" ? internshipRoles : graduateRoles),
      location: pick(random, locations),
      work_mode: "unspecified",
      deadline: isoDate(now, Math.floor(random() * 45) + 1),
      source_summary: "合成候选岗位（示例数据）",
      source_url: `https://careers.sample.example/candidates/${i}`,
      decision_status: i % 5 === 0 ? "later" : "candidate"
    });
  }

  const gmailMessages = [];
  const mailKinds = [
    ["job", "job_forward", "面试邀请：{company} {role}", "邀请参加第一轮面试，请确认时间（合成示例）", true],
    ["job", "job_forward", "{company} 申请已收到", "确认已收到申请材料（合成示例）", false],
    ["job", "gmail", "{company} 在线测评通知", "请在一周内完成在线测评（合成示例）", true],
    ["academic", "academic_forward", "课程通知：Corporate Finance 作业", "第三次作业截止时间调整（合成示例）", true],
    ["personal", "personal_forward", "账单提醒（示例）", "本月账单已生成（合成示例）", false],
    ["irrelevant", "gmail", "Newsletter（示例）", "每周资讯（合成示例）", false]
  ];
  for (let i = 0; i < counts.gmailMessages; i += 1) {
    const [classification, identity, subjectTemplate, summary, needsAction] = mailKinds[i % mailKinds.length];
    const company = pick(random, companies);
    const role = pick(random, [...internshipRoles, ...graduateRoles]);
    const subject = subjectTemplate.replace("{company}", company).replace("{role}", role);
    gmailMessages.push({
      id: seedId("gmail_message", i),
      provider_message_id: `seed-msg-${i}`,
      provider_thread_id: `seed-thread-${Math.floor(i / 2)}`,
      history_id: String(900000 + i),
      received_at: isoTime(now, -(i * 5) - 1),
      source_identity: identity,
      classification,
      sender_summary: classification === "job" ? `${company} 招聘团队` : "示例发件人",
      subject,
      summary,
      gmail_link: `https://mail.google.com/mail/u/0/#inbox/seed-msg-${i}`,
      needs_action: needsAction,
      action_title: needsAction ? `处理：${subject}`.slice(0, 300) : null,
      action_due_at: needsAction ? isoTime(now, 24 * (1 + (i % 10))) : null,
      confidence: 0.9,
      processing_status: "processed"
    });
  }

  const calendarEvents = [];
  const eventKinds = ["面试", "宣讲会", "课程", "测评截止", "复习"];
  for (let i = 0; i < counts.calendarEvents; i += 1) {
    const allDay = i % 6 === 0;
    const startHour = 24 * (Math.floor(i / 3) - 20) + 9 + (i % 3) * 3;
    const kind = eventKinds[i % eventKinds.length];
    calendarEvents.push({
      id: seedId("calendar_event", i),
      provider_event_id: `seed-event-${i}`,
      status: "confirmed",
      summary: `${kind}｜${pick(random, companies)}（合成示例）`,
      all_day: allDay,
      starts_at: allDay ? null : isoTime(now, startHour),
      ends_at: allDay ? null : isoTime(now, startHour + 1),
      starts_on: allDay ? isoDate(now, Math.floor(i / 3) - 20) : null,
      ends_on: allDay ? isoDate(now, Math.floor(i / 3) - 19) : null
    });
  }

  return {
    connection: { id: seedId("connection", 0), provider: "calendar" },
    calendarSource: { id: seedId("calendar_source", 0), provider_calendar_id: "seed-synthetic-calendar" },
    opportunities,
    candidates,
    gmailMessages,
    calendarEvents
  };
}

export function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (Array.isArray(value)) return value.length ? `array[${value.map(sqlLiteral).join(", ")}]::text[]` : "'{}'::text[]";
  return `'${String(value).replaceAll("'", "''")}'`;
}

// `lead` columns take PL/pgSQL variables (the seed user, the seed calendar source).
function insert(table, rows, columns, lead = [["user_id", "seed_user"]]) {
  if (!rows.length) return "";
  const leadNames = lead.map(([name]) => name);
  const leadValues = lead.map(([, value]) => value);
  const values = rows.map((row) => `    (${[...leadValues, ...columns.map((column) => sqlLiteral(row[column]))].join(", ")})`);
  return [
    `  insert into ${table} (${[...leadNames, ...columns].join(", ")}) values`,
    `${values.join(",\n")}`,
    "  on conflict (id) do nothing;"
  ].join("\n");
}

const opportunityColumns = ["id", "track", "intent", "company", "department", "role_title", "location", "work_mode",
  "deadline", "posted_on", "source_summary", "source_url", "main_stage", "close_reason", "applied_at", "waiting_on",
  "record_state", "archived_at", "raw_jd", "responsibilities", "requirements", "application_method", "parser_version",
  "extraction_confidence", "extraction_gaps"];
const candidateColumns = ["id", "track", "company", "department", "role_title", "location", "work_mode", "deadline",
  "source_summary", "source_url", "decision_status"];
const gmailColumns = ["id", "provider_message_id", "provider_thread_id", "history_id", "received_at", "source_identity",
  "classification", "sender_summary", "subject", "summary", "gmail_link", "needs_action", "action_title",
  "action_due_at", "confidence", "processing_status"];
const eventColumns = ["id", "provider_event_id", "status", "summary", "all_day", "starts_at", "ends_at", "starts_on", "ends_on"];

const userLookup = [
  "  seed_user := (select id from auth.users order by created_at limit 1);",
  "  if seed_user is null then",
  "    raise exception 'No auth user yet: sign in to the Test app once before seeding.';",
  "  end if;"
].join("\n");

export function buildSeedSql(data = buildSeedData()) {
  const eventInsert = insert("public.calendar_events", data.calendarEvents, eventColumns,
    [["user_id", "seed_user"], ["calendar_source_id", "seed_source"]]);
  return [
    "-- MFIN-OS synthetic seed (issue #8). Generated file: do not commit.",
    "-- Apply ONLY to an isolated Test project (D33). All data is fictional.",
    "-- Idempotent: re-running inserts nothing new. Remove with unseed.sql.",
    "do $seed$",
    "declare",
    "  seed_user uuid;",
    `  seed_connection uuid := ${sqlLiteral(data.connection.id)};`,
    `  seed_source uuid := ${sqlLiteral(data.calendarSource.id)};`,
    "begin",
    userLookup,
    "  -- Reuse an existing Calendar connection row if there is one; otherwise create a",
    "  -- disconnected placeholder that the cleanup script removes again.",
    "  select id into seed_connection from public.external_connections",
    "    where user_id = seed_user and provider = 'calendar';",
    "  if seed_connection is null then",
    `    seed_connection := ${sqlLiteral(data.connection.id)};`,
    "    insert into public.external_connections (id, user_id, provider, status)",
    "      values (seed_connection, seed_user, 'calendar', 'disconnected') on conflict (id) do nothing;",
    "  end if;",
    "  insert into public.calendar_sources (id, user_id, connection_id, provider_calendar_id, summary, time_zone,",
    "    access_role, selected_for_conflicts, sync_state)",
    `    values (seed_source, seed_user, seed_connection, ${sqlLiteral(data.calendarSource.provider_calendar_id)},`,
    "      '合成示例日历（seed）', 'Asia/Hong_Kong', 'reader', true, 'paused')",
    "    on conflict (id) do nothing;",
    insert("public.opportunities", data.opportunities, opportunityColumns),
    insert("public.opportunity_candidates", data.candidates, candidateColumns),
    insert("public.gmail_messages", data.gmailMessages, gmailColumns),
    eventInsert,
    "  raise notice 'MFIN-OS seed applied for user %', seed_user;",
    "end",
    "$seed$;",
    ""
  ].join("\n");
}

function idList(rows) {
  return rows.map((row) => sqlLiteral(row.id)).join(", ");
}

export function buildUnseedSql(data = buildSeedData()) {
  const opportunityIds = idList(data.opportunities);
  const candidateIds = idList(data.candidates);
  return [
    "-- MFIN-OS synthetic seed cleanup (issue #8). Deletes only rows the seed created.",
    "begin;",
    `delete from public.timeline_entries where entity_id in (${opportunityIds}, ${candidateIds});`,
    `delete from public.opportunities where id in (${opportunityIds});`,
    `delete from public.opportunity_candidates where id in (${candidateIds});`,
    `delete from public.gmail_messages where id in (${idList(data.gmailMessages)});`,
    `delete from public.calendar_events where id in (${idList(data.calendarEvents)});`,
    `delete from public.calendar_sources where id = ${sqlLiteral(data.calendarSource.id)};`,
    `delete from public.external_connections where id = ${sqlLiteral(data.connection.id)};`,
    "commit;",
    ""
  ].join("\n");
}

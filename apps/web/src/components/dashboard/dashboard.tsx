"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard/data";
import { mailCategory, sectors, taskStatus, type Analytics, type MailTask } from "@/lib/dashboard/model";
import { changeMailTask } from "@/app/(app)/dashboard/actions";

const colors = ["#638cff", "#4bc7b1", "#b097f6", "#e9b76b", "#ee859e", "#70b4d5", "#8995aa"];
const statusColors = [colors[0], colors[1], colors[2], colors[3], colors[5], colors[4], colors[6]];
const stageQuery = ["submitted", "submitted", "test", "interview", "offer"];
const applicationStatusHref = (stage: string) => stage === "read_confirmed" ? "/internships?tab=tracked&stage=submitted&substage=Read%20Confirmed" : `/internships?tab=tracked&stage=${stage}`;
const date = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Hong_Kong", month: "short", day: "numeric" }).format(new Date(value));
function Empty({ children }: { children: ReactNode }) { return <div className="dash-empty"><span aria-hidden="true">⌁</span><p>{children}</p></div>; }
function Panel({ title, caption, children, className = "", control }: { title: string; caption: string; children: ReactNode; className?: string; control?: ReactNode }) {
  return <section className={`dash-panel ${className}`}><header><div><h2>{title}</h2><p>{caption}</p></div>{control}</header>{children}</section>;
}
function Kpis({ values }: { values: { label: string; value: number; note: string; href: string }[] }) {
  return <div className="dash-kpis">{values.map((item, index) => <Link href={item.href} key={item.label} className="dash-kpi"><span><i style={{ background: colors[index % colors.length] }} />{item.label}<b aria-hidden="true">↗</b></span><strong>{item.value.toLocaleString()}</strong><small>{item.note}</small></Link>)}</div>;
}
function Pipeline({ analytics }: { analytics: Analytics }) {
  const max = Math.max(1, ...analytics.pipeline.map((item) => item.count));
  return <Panel title="Application Pipeline" caption="历史触达 · 按申请去重，跳级不会补算中间阶段" className="dash-pipeline" control={<Link href="/internships?tab=tracked">管理申请 ↗</Link>}>
    {analytics.total === 0 ? <Empty>尚无已投递申请。前往实习页面记录投递，图表将使用真实阶段历史。</Empty> : <div className="dash-funnel">{analytics.pipeline.map((item, index) => <Link key={item.stage} href={`/internships?tab=tracked&stage=${stageQuery[index]}${index === 1 ? "&substage=Read%20Confirmed" : ""}`} className="dash-funnel-step" title={`${item.label}: ${item.count} 个申请曾进入；点击查看当前对应阶段`}><span className="dash-step-number">0{index + 1}</span><div className="dash-funnel-value">{item.count}<small>applications</small></div><div className="dash-funnel-shape" style={{ height: `${42 + 90 * item.count / max}px`, background: `linear-gradient(140deg, ${colors[index]}, ${colors[index]}55)` }} /><strong>{item.label}</strong><span className="dash-tooltip">{item.label} · {item.count} 次独立申请触达</span></Link>)}</div>}
    <footer>已读仅依据明确提醒 · 未收到提醒不代表 HR 未读 · 终止状态单独计入分布</footer>
  </Panel>;
}
function ApplicationTrends({ analytics }: { analytics: Analytics }) {
  const [range, setRange] = useState(12);
  const weeks = analytics.weeks.slice(-range);
  const max = Math.max(1, ...weeks.map((week) => week.values.reduce((a, b) => a + b, 0)));
  return <Panel title="Application Trends" caption="每周投递 · Asia/Hong_Kong · 周一开始" control={<select aria-label="投递趋势范围" value={range} onChange={(event) => setRange(Number(event.target.value))}><option value={4}>4 weeks</option><option value={8}>8 weeks</option><option value={12}>12 weeks</option></select>}>
    <div className="dash-legend">{sectors.map((sector, index) => <span key={sector}><i style={{ background: colors[index] }} />{sector}</span>)}</div>
    {weeks.every((week) => week.values.every((count) => count === 0)) ? <Empty>此期间没有可明确归入三类的投递记录。</Empty> : <div className="dash-bars" role="list" aria-label="每周按行业投递量">{weeks.map((week) => <div className="dash-bar-column" key={week.week} role="listitem"><Link href="/internships?tab=tracked" className="dash-bar-stack" aria-label={`${week.week}: ${week.values.map((value, index) => `${sectors[index]} ${value}`).join("，")}`}><span className="dash-bar-total">{week.values.reduce((a, b) => a + b, 0)}</span>{week.values.map((count, index) => count > 0 && <span className="dash-bar-segment" key={index} style={{ height: `${count / max * 180}px`, background: `linear-gradient(0deg, ${colors[index]}99, ${colors[index]})` }}><span className="dash-tooltip">{date(week.week)} · {sectors[index]} · {count}</span></span>)}</Link><small>{week.week.slice(5)}</small></div>)}</div>}
    <footer>12 周内未分类 {analytics.unclassified} 条 · 投递日期缺失 {analytics.undated} 条。模糊或非目标岗位不强行归类。</footer>
  </Panel>;
}
function StatusDonut({ analytics }: { analytics: Analytics }) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = analytics.distribution.reduce((sum, item) => sum + item.count, 0);
  return <Panel title="Status Distribution" caption="申请当前状态 · 包含 Rejected / Withdrawn / Closed">
    {!total ? <Empty>暂无申请状态分布。</Empty> : <div className="dash-donut-layout"><div className="dash-donut"><svg viewBox="0 0 220 220" aria-label="当前申请状态环图"><circle cx="110" cy="110" r="82" fill="none" stroke="var(--line)" strokeWidth="22" />{analytics.distribution.map((item, index) => { const start = analytics.distribution.slice(0, index).reduce((sum, entry) => sum + entry.count, 0) / total * 100; const length = item.count / total * 100; return item.count > 0 && <a href={applicationStatusHref(item.stage)} key={item.stage} onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(index)} onBlur={() => setSelected(null)} aria-label={`${item.label} ${item.count}，${Math.round(length)}%`}><circle cx="110" cy="110" r="82" pathLength="100" fill="none" stroke={statusColors[index]} strokeWidth={selected === index ? 27 : 22} strokeDasharray={`${Math.max(0, length - 0.8)} ${100 - Math.max(0, length - 0.8)}`} strokeDashoffset={-start} transform="rotate(-90 110 110)"><title>{item.label}: {item.count} ({Math.round(length)}%)</title></circle></a>; })}</svg><div><strong>{selected === null ? total : analytics.distribution[selected].count}</strong><small>{selected === null ? "applications" : analytics.distribution[selected].label}</small></div></div><div className="dash-status-legend">{analytics.distribution.map((item, index) => <Link key={item.stage} href={applicationStatusHref(item.stage)} onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)}><i style={{ background: statusColors[index] }} /><span>{item.label}</span><strong>{item.count}</strong><small>{Math.round(item.count / total * 100)}%</small></Link>)}</div></div>}
  </Panel>;
}
function Timeline({ analytics }: { analytics: Analytics }) {
  return <Panel title="Recruitment Activity" caption="追加式时间线 · 保留原有历史及证据入口" control={<Link href="/internships?tab=tracked">全部申请 ↗</Link>}>
    {!analytics.activity.length ? <Empty>暂无招聘活动历史。旧记录没有历史时不会生成虚构事件。</Empty> : <ol className="dash-timeline">{analytics.activity.slice(0, 12).map((event, index) => <li key={event.id}><i style={{ background: colors[index % colors.length] }} /><time dateTime={event.occurred_at}>{date(event.occurred_at)}</time><Link href={`/internships/${event.entity_id}`}><strong>{event.company}</strong><span>{event.summary}</span></Link></li>)}</ol>}
  </Panel>;
}
function MailActivity({ analytics }: { analytics: Analytics }) {
  const [hover, setHover] = useState<number | null>(null);
  const [visible, setVisible] = useState([true, true, true]);
  const max = Math.max(1, ...analytics.days.map((day) => day.total));
  const labels = ["Total Emails", "Important", "Action Required"];
  const keys = ["total", "important", "action"] as const;
  const x = (index: number) => 34 + index * 47;
  const y = (value: number) => 205 - value / max * 168;
  return <Panel title="Mail Activity Trends" caption="最近 14 天 · 每日收到的邮件，非当前未完成待办数">
    <div className="dash-legend">{labels.map((label, index) => <button type="button" key={label} aria-pressed={visible[index]} onClick={() => setVisible(visible.map((value, i) => i === index ? !value : value))} style={{ opacity: visible[index] ? 1 : 0.4 }}><i style={{ background: colors[index] }} />{label}</button>)}</div>
    {analytics.days.every((day) => day.total === 0) ? <Empty>最近 14 天没有已同步邮件。连接 Gmail 后将显示真实活动趋势。</Empty> : <div className="dash-area"><svg viewBox="0 0 680 248" role="img" aria-label="最近十四天邮件量趋势"><defs>{keys.map((key, index) => <linearGradient key={key} id={`mail-area-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colors[index]} stopOpacity="0.3" /><stop offset="100%" stopColor={colors[index]} stopOpacity="0" /></linearGradient>)}</defs>{[0, 0.5, 1].map((ratio) => <g key={ratio}><line x1="34" x2="650" y1={y(max * ratio)} y2={y(max * ratio)} stroke="var(--line)" strokeDasharray="3 5" /><text x="6" y={y(max * ratio) + 4} fill="var(--ink-faint)" fontSize="10">{Math.round(max * ratio)}</text></g>)}{keys.map((key, index) => visible[index] && <g key={key}><path d={`M34,205 ${analytics.days.map((day, i) => `L${x(i)},${y(day[key])}`).join(" ")} L645,205 Z`} fill={`url(#mail-area-${key})`} /><polyline points={analytics.days.map((day, i) => `${x(i)},${y(day[key])}`).join(" ")} fill="none" stroke={colors[index]} strokeWidth="2.5" strokeLinejoin="round" /></g>)}{analytics.days.map((day, index) => <g key={day.day}><rect x={x(index) - 20} y="15" width="43" height="195" fill="transparent" tabIndex={0} onFocus={() => setHover(index)} onBlur={() => setHover(null)} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} aria-label={`${day.day}: 总邮件 ${day.total}，重要 ${day.important}，需行动 ${day.action}`}><title>{`${day.day}: ${day.total} / ${day.important} / ${day.action}`}</title></rect>{index % 3 === 0 && <text x={x(index)} y="234" textAnchor="middle" fontSize="10" fill="var(--ink-faint)">{day.day.slice(5)}</text>}</g>)}{hover !== null && <line x1={x(hover)} x2={x(hover)} y1="25" y2="205" stroke="var(--ink-faint)" strokeDasharray="3 3" pointerEvents="none" />}</svg>{hover !== null && <div className="dash-area-tooltip" role="status"><strong>{analytics.days[hover].day}</strong>{keys.map((key, index) => <span key={key}>{labels[index]} <b>{analytics.days[hover][key]}</b></span>)}</div>}</div>}
  </Panel>;
}
function ActionRadial({ analytics, selected, select }: { analytics: Analytics; selected: string; select: (value: string) => void }) {
  const total = analytics.actionDistribution.reduce((sum, item) => sum + item.count, 0);
  return <Panel title="Action Distribution" caption="独立行动状态 · 点击筛选待办卡片">
    {!total ? <Empty>暂无从邮件识别或确认的待办。</Empty> : <div className="dash-radial-layout"><svg viewBox="0 0 220 220" aria-label="邮件行动状态径向图">{analytics.actionDistribution.map((item, index) => <g key={item.label} role="button" tabIndex={0} aria-label={`${item.label} ${item.count}`} onClick={() => select(selected === item.label ? "All" : item.label)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(selected === item.label ? "All" : item.label); } }}><circle cx="110" cy="110" r={90 - index * 19} fill="none" stroke="var(--line)" strokeWidth="12" /><circle cx="110" cy="110" r={90 - index * 19} fill="none" stroke={colors[index]} strokeWidth="12" pathLength="100" strokeDasharray={`${item.count / total * 100} 100`} transform="rotate(-90 110 110)" strokeLinecap={item.count ? "round" : "butt"}><title>{item.label}: {item.count} / {total}</title></circle></g>)}<text x="110" y="108" textAnchor="middle" fill="var(--ink)" fontSize="23" fontWeight="600">{total}</text><text x="110" y="127" textAnchor="middle" fill="var(--ink-faint)" fontSize="10">ACTIONS</text></svg><div className="dash-status-legend">{analytics.actionDistribution.map((item, index) => <button type="button" aria-pressed={selected === item.label} key={item.label} onClick={() => select(selected === item.label ? "All" : item.label)}><i style={{ background: colors[index] }} /><span>{item.label}</span><strong>{item.count}</strong></button>)}</div></div>}
  </Panel>;
}
function TaskCard({ task, data }: { task: MailTask; data: DashboardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mail = data.mail.find((item) => item.id === task.messageId)!;
  const overdue = task.dueAt && Date.parse(task.dueAt) < Date.parse(data.asOf) && !["Completed", "Dismissed"].includes(taskStatus(task.status));
  function save(status: string) {
    setError(null);
    startTransition(async () => {
      try { const result = await changeMailTask({ itemId: task.itemId, actionId: task.actionId, version: task.version, status }); setError(result.error); if (!result.error) router.refresh(); }
      catch { setError("网络暂不可用，未保存。请重试。"); }
    });
  }
  return <article className={`dash-task ${overdue ? "dash-task-overdue" : ""}`}><div className="dash-task-meta"><span className={`dash-priority dash-priority-${task.priority}`}>{task.priority === "critical" ? "Critical" : task.priority === "high" ? "High Priority" : task.priority === "low" ? "Low Priority" : "Normal"}</span><span>{taskStatus(task.status)}</span></div><h3>{task.title}</h3><p>{mail.summary ?? "暂无分析摘要，请查看邮件证据。"}</p><div className="dash-task-date">{task.dueAt ? `${overdue ? "已逾期 · " : "截止 · "}${date(task.dueAt)}` : "未提取到明确截止时间"}</div><footer><Link href={`/inbox?message=${mail.id}`}>邮件证据 ↗</Link><a href={/^https:\/\/mail\.google\.com\//.test(mail.gmail_link) ? mail.gmail_link : "https://mail.google.com/"} target="_blank" rel="noreferrer">Gmail ↗</a>{task.actionId ? <select aria-label={`修改 ${task.title} 的状态`} disabled={pending} value={task.status === "scheduled" ? "waiting" : task.status} onChange={(event) => save(event.target.value)}><option value="unscheduled">Pending</option><option value="waiting">In Progress</option><option value="completed">Completed</option><option value="cancelled">Dismissed</option></select> : task.status === "dismissed" ? null : <><button type="button" disabled={pending} onClick={() => save("unscheduled")}>{pending ? "保存中…" : "确认提取"}</button><button type="button" disabled={pending} onClick={() => save("cancelled")}>忽略</button></>}</footer>{error && <p role="alert" className="dash-save-error">{error}</p>}</article>;
}
function Actions({ data, selected, setSelected, compact = false }: { data: DashboardData; selected: string; setSelected: (value: string) => void; compact?: boolean }) {
  const [limit, setLimit] = useState(12);
  const tasks = data.tasks.filter((task) => compact ? ["Pending", "In Progress"].includes(taskStatus(task.status)) : selected === "All" || taskStatus(task.status) === selected).sort((a, b) => {
    const finished = (task: MailTask) => Number(["Completed", "Dismissed"].includes(taskStatus(task.status)));
    return finished(a) - finished(b) || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
  });
  return <Panel title={compact ? "Priority Actions" : "Action Center"} caption="确认提取后保存到原有行动系统 · 邮件已读 ≠ 待办完成" className="dash-action-panel" control={compact ? <Link href="/dashboard/mail">全部待办 ↗</Link> : <select aria-label="筛选行动状态" value={selected} onChange={(event) => { setSelected(event.target.value); setLimit(12); }}>{["All", "Pending", "In Progress", "Completed", "Dismissed"].map((label) => <option key={label}>{label}</option>)}</select>}>
    {!tasks.length ? <Empty>此状态下暂无邮件待办。</Empty> : <><div className={`dash-action-cards ${compact ? "dash-action-compact" : ""}`}>{tasks.slice(0, compact ? 3 : limit).map((task) => <TaskCard key={`${task.id}:${task.version}`} task={task} data={data} />)}</div>{!compact && tasks.length > limit && <button className="dash-load" type="button" onClick={() => setLimit(limit + 12)}>显示更多 · {tasks.length - limit} 项</button>}</>}
  </Panel>;
}
function MailSummary({ data }: { data: DashboardData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const categories = ["Action Required", "Important Updates", "Recruitment Changes", "Low Priority"];
  const categorized = data.mail.map((mail) => ({ mail, category: mailCategory(mail, data.tasks.some((task) => task.messageId === mail.id), mail.recruitmentChange ?? false) }));
  return <Panel title="Mail Summary" caption="全部已同步邮件 · 四类互斥视图" control={<Link href="/dashboard/mail">Action Center ↗</Link>}><div className="dash-mail-summary">{categories.map((category, index) => <button type="button" key={category} aria-pressed={selected === category} onClick={() => setSelected(selected === category ? null : category)}><span><i style={{ background: colors[index] }} />{category}</span><strong>{categorized.filter((item) => item.category === category).length}</strong><span aria-hidden="true">↗</span></button>)}</div>{selected && <div className="dash-mail-preview"><strong>{selected}</strong>{categorized.filter((item) => item.category === selected).slice(0, 5).map(({ mail }) => <Link key={mail.id} href={`/inbox?message=${mail.id}`}>{mail.summary ?? mail.subject}<small>{date(mail.received_at)}</small></Link>)}{!categorized.some((item) => item.category === selected) && <p>此类别暂无邮件。</p>}</div>}<footer>重要等级沿用收件箱；未完成 AI 分析时使用规则评级，保留人工更正。</footer></Panel>;
}
export function Dashboard({ data, section }: { data: DashboardData; section: "overview" | "internships" | "mail" }) {
  const [selected, setSelected] = useState("All");
  const a = data.analytics;
  const values = section === "mail" ? [
    { label: "Total Emails (24h)", value: a.mail24, note: "最近 24 小时收到", href: "/inbox" },
    { label: "Important Emails", value: a.important24, note: "最近 24 小时 · 分析评级", href: "/inbox?priority=important" },
    { label: "Action Required", value: a.action24, note: "最近 24 小时需行动邮件", href: "/inbox" },
    { label: "Pending Actions", value: a.pending, note: "全部未完成邮件待办", href: "#action-center" },
    { label: "Upcoming Deadlines", value: a.deadlines, note: "未来 7 天 · 未完成", href: "#action-center" }
  ] : [
    { label: "Active Applications", value: a.active, note: "已投递 · 尚未终止", href: "/internships?tab=tracked" },
    { label: "Total Applications", value: a.total, note: "全部有投递或阶段依据", href: "/internships?tab=tracked" },
    { label: "Read Confirmed", value: a.read, note: "曾收到明确已读提醒", href: "/internships?tab=tracked&stage=submitted&substage=Read%20Confirmed" },
    { label: "Interviews", value: a.interviews, note: "曾进入面试阶段", href: "/internships?tab=tracked&stage=interview" },
    { label: "Important Emails (24h)", value: a.important24, note: "收件箱重要等级", href: "/inbox?priority=important" },
    { label: "Pending Actions", value: a.pending, note: "独立于邮件已读状态", href: "/dashboard/mail#action-center" }
  ];
  return <div className="dash-root"><div className="dash-desktop-notice"><h1>Dashboard 为桌面工作区</h1><p>请使用宽度至少 1440px 的电脑窗口查看图表。</p><Link href="/internships?tab=tracked">前往申请管理 →</Link></div><div className="dash-desktop"><header className="dash-heading"><div><p className="dash-eyebrow">MFIN OS <span>/</span> INTELLIGENCE WORKSPACE</p><h1>{section === "overview" ? "Your next move, in focus." : section === "internships" ? "Internship Analytics" : "Mail Action Center"}</h1><p>{section === "overview" ? "申请进展、招聘动态与重要行动，在一处看清。" : section === "internships" ? "从投递到 Offer，让每一步都有据可循。" : "把重要邮件转为明确行动，保留进度与原始证据。"}</p></div><div className="dash-heading-aside"><span className="dash-live"><i />真实数据 · {data.connection?.status === "connected" ? "Gmail connected" : `Gmail ${data.connection?.status ?? "未连接"}`}</span><small>统计截至 {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Hong_Kong", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(data.asOf))} HKT</small><Link href="/inbox">打开收件箱 ↗</Link></div></header><nav className="dash-tabs" aria-label="Dashboard 模块">{[["overview", "/dashboard", "Overview"], ["internships", "/dashboard/internships", "Internship Analytics"], ["mail", "/dashboard/mail", "Mail Action Center"]].map(([key, href, label]) => <Link href={href} key={key} aria-current={section === key ? "page" : undefined}>{label}</Link>)}<span>PC WORKSPACE</span></nav><Kpis values={values} />{section !== "mail" && <><div className="dash-grid dash-grid-wide"><Pipeline analytics={a} />{section === "overview" ? <MailSummary data={data} /> : <StatusDonut analytics={a} />}</div><div className="dash-grid dash-grid-wide"><ApplicationTrends analytics={a} />{section === "overview" ? <StatusDonut analytics={a} /> : <Timeline analytics={a} />}</div></>}{section === "mail" && <><div className="dash-grid dash-grid-wide"><MailActivity analytics={a} /><ActionRadial analytics={a} selected={selected} select={setSelected} /></div><MailSummary data={data} /></>}{section === "overview" ? <div className="dash-grid dash-grid-bottom"><Timeline analytics={a} /><Actions data={data} selected="Pending" setSelected={setSelected} compact /></div> : section === "mail" ? <div id="action-center"><Actions data={data} selected={selected} setSelected={setSelected} /></div> : null}<p className="dash-source-note">仅统计正式申请与已同步 Gmail · 已排除 seed_v1 / seed-msg 合成样本 · 图表不代替原有申请管理 · <Link href="/status">连接与权限状态 ↗</Link>{data.connection?.last_success_at && ` · 最近同步 ${date(data.connection.last_success_at)}`}</p></div></div>;
}

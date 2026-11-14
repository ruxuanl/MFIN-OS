"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { discoverInternships, decideDiscovery } from "@/app/(app)/internships/discover/actions";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/operation-feedback";
import { radarDefaults, visibleRadarItems, radarDirections, radarRegions, radarTypes, radarPeriods, radarCategory, chineseRadarLocation, radarApplicationEmail, type RadarSnapshot, type RadarItem } from "@/lib/jobs/radar-model";

const initial = { ok: false, message: "" };
function ChoiceGroup({ title, name, options, selected, onChange, tone, expanded, pinned, onOpen, onClose }: {
  title: string; name: string; options: string[]; selected: string[]; onChange: (values: string[]) => void; tone: string;
  expanded: boolean; pinned: boolean; onOpen: (pin: boolean) => void; onClose: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const single = name === "publishedWithin";
  const summary = single ? `最近 ${selected[0]} 天` : selected.length === options.length ? "全部" : selected.join("、") || "请选择";
  return <fieldset className={`radar-filter radar-filter-${tone}${expanded ? " is-open" : ""}`}
    onPointerEnter={event => { if (event.pointerType === "mouse" && window.matchMedia("(min-width: 681px) and (hover: hover)").matches) onOpen(false); }}
    onPointerLeave={() => { if (!pinned && !document.activeElement?.closest(`[data-radar-group="${name}"]`)) onClose(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); trigger.current?.focus(); } }}
    data-radar-group={name}>
    <legend>{title}</legend>
    <button ref={trigger} className="radar-filter-trigger" type="button" aria-expanded={expanded} aria-controls={id}
      onClick={() => { if (expanded && pinned) onClose(); else onOpen(true); }}>
      <span><span className="radar-filter-title">{title}</span><strong>{summary}</strong></span><Icon name="arrow" size={16} />
    </button>
    <div className="radar-filter-popover" id={id}>
      <div className="radar-filter-options">
        <p>{single ? "选择一个时间范围" : "可选择多个条件"}</p>
        <div className="radar-choices">{options.map(value => <label key={value} className={selected.includes(value) ? "is-selected" : ""}>
          <input type={single ? "radio" : "checkbox"} name={name} value={value} checked={selected.includes(value)} onChange={event => {
            onChange(single ? [value] : event.target.checked ? [...selected, value] : selected.filter(item => item !== value));
          }} />
          {single ? `${value}天内` : value}
        </label>)}</div>
      </div>
    </div>
  </fieldset>;
}
function savedChoices(value: string, options: string[], fallback: string[]) {
  const values = value.split(",").filter(x => options.includes(x));
  return values.length ? values : fallback;
}
function DiscoveryCard({ item }: { item: RadarItem & { id: string; discoveredAt: string } }) {
  const [state, action, pending] = useActionState(decideDiscovery, initial);
  const inactive = item.status === "added" || item.status === "ignored";
  const email = radarApplicationEmail(item);
  return <article className="radar-job" id={`radar-${item.id}`}>
    <div className="radar-job-heading"><h3>{item.summary || "岗位中文摘要尚未生成，请查看原岗位说明核实。"}</h3>
      {inactive || item.kind === "closed" ? <span className="phase-badge">{item.status === "added" ? "已加入候选" : item.status === "ignored" ? "已忽略" : "已关闭／过期"}</span> : null}
    </div>
    <dl className="radar-job-facts">
      <div><dt>发布时间</dt><dd>{item.publishedAt ?? "待核实"}</dd></div>
      <div><dt>实习地点</dt><dd>{chineseRadarLocation(item)}</dd></div>
      <div><dt>投递方式</dt><dd>{email ? <><span className="radar-email">{email}</span><a className="radar-source" href={item.url} target="_blank" rel="noopener noreferrer">核对原岗位 ↗</a></> : <a href={item.url} target="_blank" rel="noopener noreferrer">原岗位链接 ↗</a>}</dd></div>
    </dl>
    {item.isRecruiting === false ? <p className="radar-note">待核实线索 · {item.warning}</p> : null}
    <p className="radar-jd"><span>岗位职责</span>{item.jdSummary || "暂未生成中文职责概述，请打开原岗位链接查看。"}</p>
    <form action={action} className="radar-job-form">
      <input name="id" type="hidden" value={item.id} />
      <details className="radar-evidence"><summary>来源与确认详情</summary>
        <p>发现于 {new Date(item.discoveredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}；{item.evidenceKind === "page_text" ? "已取得页面文本" : "仅取得搜索摘要"}。{item.kind === "unconfirmed" ? "页面可能是列表或文章，需核实具体岗位。" : "招聘状态待本人核实。"}</p>
        <p>{item.warning}</p>
        <div className="field-grid"><label>确认公司<input name="company" defaultValue={item.company} maxLength={240} disabled={inactive} /></label><label>确认岗位<input name="title" defaultValue={item.title} maxLength={240} disabled={inactive} /></label></div>
        <details><summary>原始岗位证据（保留原文）</summary><p className="radar-raw">{item.evidence || "未取得正文或摘要。"}</p></details>
      </details>
      {!inactive ? <div className="button-row"><SubmitButton name="decision" value="add" className="secondary-button" disabled={pending || item.kind === "closed"} pendingLabel="正在保存…">加入候选</SubmitButton><SubmitButton name="decision" value="ignore" className="quiet-button" disabled={pending} pendingLabel="正在忽略…">忽略</SubmitButton></div> : null}
    </form>
    {state.message ? <p role="status">{state.message}</p> : null}
  </article>;
}
export function InternshipRadar({ snapshot }: { snapshot: RadarSnapshot }) {
  const [state, action] = useActionState(discoverInternships, initial);
  const p = snapshot.preferences ?? radarDefaults;
  const [directions, setDirections] = useState(() => savedChoices(p.direction, radarDirections, ["二级买方", "二级卖方", "投行"]));
  const [regions, setRegions] = useState(() => savedChoices(p.region, radarRegions, ["香港"]));
  const [types, setTypes] = useState(() => savedChoices(p.internshipType, radarTypes, radarTypes));
  const [periods, setPeriods] = useState(() => [String(Math.max(...savedChoices(p.publishedWithin ?? "7", radarPeriods, ["7"]).map(Number)))]);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [pinnedFilter, setPinnedFilter] = useState<string | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!filtersRef.current?.contains(event.target as Node)) { setOpenFilter(null); setPinnedFilter(null); }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  function filterInteraction(name: string) {
    return {
      expanded: openFilter === name,
      pinned: pinnedFilter === name,
      onOpen: (pin: boolean) => { setOpenFilter(name); setPinnedFilter(current => pin ? name : current === name ? current : null); },
      onClose: () => { setOpenFilter(current => current === name ? null : current); setPinnedFilter(current => current === name ? null : current); }
    };
  }
  const [active, setActive] = useState("全部");
  const items = visibleRadarItems(snapshot.items);
  const categories = ["全部", ...radarDirections.filter(x => directions.includes(x) || items.some(item => radarCategory(item) === x))];
  const selectedTab = categories.includes(active) ? active : "全部";
  const shown = selectedTab === "全部" ? items : items.filter(item => radarCategory(item) === selectedTab);
  const valid = directions.length > 0 && regions.length > 0 && types.length > 0 && periods.length > 0;
  return <>
    <section className="panel radar-search-panel">
      <form action={action} className="workspace-form">
        <div className="radar-filter-grid" ref={filtersRef}>
          <ChoiceGroup title="目标方向" name="direction" options={radarDirections} selected={directions} onChange={setDirections} tone="blue" {...filterInteraction("direction")} />
          <ChoiceGroup title="实习类型" name="internshipType" options={radarTypes} selected={types} onChange={setTypes} tone="green" {...filterInteraction("internshipType")} />
          <ChoiceGroup title="地区" name="region" options={radarRegions} selected={regions} onChange={setRegions} tone="sand" {...filterInteraction("region")} />
          <ChoiceGroup title="发布时间" name="publishedWithin" options={radarPeriods} selected={periods} onChange={setPeriods} tone="purple" {...filterInteraction("publishedWithin")} />
        </div>
        <div className="radar-search-footer"><label className="radar-keywords">补充关键词（选填）<input name="keywords" defaultValue={p.keywords} maxLength={120} placeholder="例如：行业研究、并购" /></label><SubmitButton className="primary-button" disabled={!valid} pendingLabel="正在搜索并整理…">发现实习</SubmitButton></div>
        <p className="radar-note">{valid ? `已选 ${directions.length} 个方向、${regions.length} 个地区；检索最近 ${Math.max(...periods.map(Number))} 天。` : "每组请至少勾选一项。"} 发布时间为单选，日期缺失仍需核实。</p>
      </form>
      <details className="radar-note"><summary>搜索说明与权限</summary><p>每轮最多 8 条，间隔 60 秒，每日最多 20 轮。请在设置中开启岗位发现；中文 AI 摘要另需雷达评分、AI 总开关与岗位分析权限，费用沿用月预算。仅使用公开岗位条件，不读取简历画像。</p></details>
      {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </section>
    <section className="workspace-section radar-results"><div className="radar-results-heading"><h2>发现结果</h2><span>{items.length} 个岗位线索 · 加入前请核实原岗位</span></div>
      <div className="radar-bookmarks" aria-label="按目标方向查看">{categories.map(category => <button type="button" key={category} aria-pressed={selectedTab === category} className={selectedTab === category ? "is-active" : ""} onClick={() => setActive(category)}>{category}<span>{category === "全部" ? items.length : items.filter(item => radarCategory(item) === category).length}</span></button>)}</div>
      <div className="radar-result-list">{!shown.length ? <p className="empty-focus">{items.length ? "这个方向暂时没有结果。" : "勾选条件后开始发现实习，结果会按方向整理在这里。"}</p> : shown.map(item => <DiscoveryCard key={(item as RadarItem & { id: string }).id} item={item as RadarItem & { id: string; discoveredAt: string }} />)}</div>
    </section>
    <details className="radar-note"><summary>最近搜索记录</summary>{snapshot.runs.map(run => <p key={run.id}>{new Date(run.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · {({ completed: "已完成", running: "搜索中", failed: "未完成", cancelled: "已取消" } as Record<string, string>)[run.status] ?? "待核实"}{run.error ? " · 本轮未完整完成" : ""}</p>)}</details>
  </>;
}

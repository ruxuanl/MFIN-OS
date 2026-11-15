"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { discoverInternships, decideDiscovery, type RadarActionState } from "@/app/(app)/internships/discover/actions";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/operation-feedback";
import { radarDefaults, radarDirections, radarRegions, radarTypes, radarPeriods, radarCategory, chineseRadarLocation, radarApplicationEmail, type RadarSnapshot, type RadarItem } from "@/lib/jobs/radar-model";
import { filteredRadarItems, radarHeadline, radarItemType } from "@/lib/jobs/radar-results";
import { radarSourceTime, radarTimeLabel } from "@/lib/jobs/radar-source-time";
import { radarSourceLabel, radarSourceOptions, type RadarSource } from "@/lib/jobs/radar-sources";

const initial: RadarActionState = { ok: false, message: "" };
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
  const effectiveStatus=state.decision??item.status;
  const inactive = effectiveStatus === "added" || effectiveStatus === "ignored";
  const email = radarApplicationEmail(item);
  const source = item.localSource?{name:"LEADERSHIP本地",type:"本地Excel"}:radarSourceLabel(item.url);
  const sourceHref=item.localSource?`/api/internships/local-source/${item.localSource.key}`:item.url;
  const time = radarTimeLabel(radarSourceTime(item));
  const [copied, setCopied] = useState("");
  return <article className="radar-job" id={`radar-${item.id}`}>
    <div className="radar-job-heading"><h3>{radarHeadline(item)}</h3>
      {inactive || item.kind === "closed" ? <span className="phase-badge">{effectiveStatus === "added" ? "已加入候选" : effectiveStatus === "ignored" ? "已忽略" : "已关闭／过期"}</span> : null}
    </div>
    <div className="radar-job-tags"><span className="radar-tag-sector">{radarCategory(item)}</span><span>{radarItemType(item) ?? "类型未注明"}</span><a href={sourceHref} target="_blank" rel="noopener noreferrer">{source.name}<Icon name="arrow" size={12} /></a></div>
    <dl className="radar-job-facts">
      <div className="radar-fact-time"><dt>{time.title}</dt><dd>{time.value}</dd><small>{time.detail}</small></div>
      <div><dt>工作地点</dt><dd>{chineseRadarLocation(item)}</dd><small>以来源岗位说明为准</small></div>
      <div className="radar-fact-apply"><dt>投递方式</dt><dd>{email ? <span className="radar-email">{email}</span> : <a href={item.localSource?.publicUrl??sourceHref} target="_blank" rel="noopener noreferrer">{item.localSource&&!item.localSource.publicUrl?"查看原表投递说明":"查看原岗位"}<Icon name="arrow" size={14} /></a>}</dd><small>{email ? <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(email); setCopied("邮箱已复制"); } catch { setCopied("请选中邮箱复制"); } }}>{copied || "复制投递邮箱"}</button> : `${source.type} · 手动投递`}</small></div>
    </dl>
    {item.jdSummary && item.jdSummary !== "待核实" ? <p className="radar-jd"><span>岗位职责</span>{item.jdSummary}</p> : null}
    <form action={action} className="radar-job-form">
      <input name="id" type="hidden" value={item.id} />
      <details className="radar-evidence"><summary>核对来源与字段</summary>
        {item.localSource?<p>原表：{item.localSource.fileName} · {item.localSource.sheet} 第 {item.localSource.row} 行。<a href={sourceHref}>下载原表核对</a></p>:null}
        <p>{item.localSource?"本地读取于":"发现于"} {new Date(item.discoveredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}；{item.localSource?"已读取原表对应行":item.evidenceKind === "page_text" ? "已取得页面文本" : "仅取得搜索摘要"}。{item.kind === "unconfirmed" ? "页面可能是列表或文章，需核实具体岗位。" : "招聘状态待本人核实。"}</p>
        <p>{item.warning}</p>
        <div className="field-grid"><label>确认公司<input name="company" defaultValue={item.company} maxLength={240} disabled={inactive} /></label><label>确认岗位<input name="title" defaultValue={item.title} maxLength={240} disabled={inactive} /></label></div>
        <details><summary>原始岗位证据（保留原文）</summary><p className="radar-raw">{item.evidence || "未取得正文或摘要。"}</p></details>
      </details>
      {!inactive ? <div className="button-row"><SubmitButton name="decision" value="ignore" className="quiet-button" disabled={pending} pendingLabel="正在忽略…">忽略</SubmitButton><SubmitButton name="decision" value="add" className="primary-button" disabled={pending || item.kind === "closed"} pendingLabel="正在保存…">加入候选</SubmitButton></div> : null}
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
  const [source, setSource] = useState<RadarSource>(p.source ?? "all");
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
  const localStats=state.localStats??snapshot.localStats;
  const pool=filteredRadarItems([...snapshot.items,...(state.localItems??snapshot.localItems??[])], { ...p, source, direction: directions.join(","), region: regions.join(","), internshipType: types.join(","), publishedWithin: periods.join(",") });
  const unique=new Map<string,RadarItem>();
  for(const item of pool){const key=item.localSource?`leadership:${item.localSource.key}`:item.url;const prior=unique.get(key);if(!prior||!radarSourceTime(prior)&&radarSourceTime(item))unique.set(key,item);}
  const items=[...unique.values()].filter(item=>radarSourceTime(item));
  const missingDates=pool.filter(item=>!radarSourceTime(item)).length;
  const categories = ["全部", ...radarDirections.filter(x => directions.includes(x) || items.some(item => radarCategory(item) === x))];
  const selectedTab = categories.includes(active) ? active : "全部";
  const shown = selectedTab === "全部" ? items : items.filter(item => radarCategory(item) === selectedTab);
  const dated = shown.filter(item => radarSourceTime(item));
  const valid = directions.length > 0 && regions.length > 0 && types.length > 0 && periods.length > 0;
  return <>
    <section className="panel radar-search-panel">
      <form action={action} className="workspace-form">
        <div className="radar-filter-grid" ref={filtersRef}>
          <ChoiceGroup title="目标方向" name="direction" options={radarDirections} selected={directions} onChange={setDirections} tone="blue" {...filterInteraction("direction")} />
          <ChoiceGroup title="实习类型" name="internshipType" options={radarTypes} selected={types} onChange={setTypes} tone="green" {...filterInteraction("internshipType")} />
          <ChoiceGroup title="地区" name="region" options={radarRegions} selected={regions} onChange={setRegions} tone="sand" {...filterInteraction("region")} />
          <ChoiceGroup title="来源时间" name="publishedWithin" options={radarPeriods} selected={periods} onChange={setPeriods} tone="purple" {...filterInteraction("publishedWithin")} />
        </div>
        <div className="radar-search-footer"><fieldset className="radar-source-picker"><legend>搜索渠道</legend><div>{Object.entries(radarSourceOptions).map(([value,label]) => <label key={value} className={source === value ? "is-selected" : ""}><input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value as RadarSource)} />{label}</label>)}</div></fieldset><label className="radar-keywords">补充关键词（选填）<input name="keywords" defaultValue={p.keywords} maxLength={120} placeholder="例如：行业研究、并购" /></label><SubmitButton className="primary-button" disabled={!valid} pendingLabel="正在搜索并整理…">发现实习</SubmitButton></div>
        <p className="radar-note">{valid ? `按来源网站、推文或本地文件最近 ${Math.max(...periods.map(Number))} 天的发布、更新时间筛选。` : "每组请至少勾选一项。"} 本地表以文件标题日期为准；网页优先使用页面日期或链接页更新时间。其他方向仅含金融相关岗位。</p>
      </form>
      {localStats?.available?<p className="radar-note">LEADERSHIP本地已连接 · {localStats.files} 份汇总表 · {localStats.records} 条去重金融实习记录。选择本地渠道可直接检索，不调用联网搜索或AI。</p>:localStats?.message?<p role="status">{localStats.message}</p>:null}
      <details className="radar-note"><summary>覆盖哪些来源</summary><p>全部渠道包含本地LEADERSHIP表和公开网页。Tavily单轮最多取得20条公开来源，优先整理至多10条岗位；招聘网站、公众号可单独检索。公众号限公开索引文章。本地渠道直接读取原Excel，文件按标题日期筛选，不上传整表；只有点击“加入候选”才保存选中的岗位。联网搜索仍每轮一次、间隔60秒、每日20轮；DeepSeek沿用已有权限与月预算。</p></details>
      {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </section>
    <section className="workspace-section radar-results"><div className="radar-results-heading"><h2>发现结果</h2><span>{items.length} 条符合来源时间</span></div>
      <div className="radar-bookmarks" aria-label="按目标方向查看">{categories.map(category => <button type="button" key={category} aria-pressed={selectedTab === category} className={selectedTab === category ? "is-active" : ""} onClick={() => setActive(category)}>{category}<span>{category === "全部" ? items.length : items.filter(item => radarCategory(item) === category).length}</span></button>)}</div>
      <div className="radar-result-list">{!dated.length ? <p className="empty-focus">当前条件下暂无有来源日期的具体岗位，请调整筛选或检索LEADERSHIP本地表。</p> : dated.map(item => <DiscoveryCard key={(item as RadarItem & { id: string }).id} item={item as RadarItem & { id: string; discoveredAt: string }} />)}</div>
      {missingDates?<p className="radar-note">另有 {missingDates} 条来源未公开可核验日期，未列入当前时间筛选结果。</p>:null}
    </section>
    <details className="radar-note"><summary>最近搜索记录</summary>{snapshot.runs.map(run => <p key={run.id}>{new Date(run.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · {({ completed: "已完成", running: "搜索中", failed: "未完成", cancelled: "已取消" } as Record<string, string>)[run.status] ?? "待核实"}{run.error ? " · 本轮未完整完成" : ""}</p>)}</details>
  </>;
}

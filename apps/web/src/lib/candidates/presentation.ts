type CandidateSource = { company: string; role_title: string; location: string | null; source_summary: string | null; source_url?: string | null };
const labels = /(?:来源文件|来源发布日期|发布日期|发布时间|公司|岗位|地点|招聘详情|岗位职责|投递方式|申请方式)\s*[：:]/g;

export function candidatePresentation(candidate: CandidateSource) {
  const clean = (value: string) => value.replace(/\[LEADERSHIP:[^\]\r\n]*\]/gi, "").trim();
  const text = clean(candidate.source_summary ?? "");
  const matches = [...text.matchAll(labels)];
  const fields = new Map(matches.map((match, index) => [match[0].replace(/\s*[：:]$/, ""), text.slice(match.index! + match[0].length, matches[index + 1]?.index ?? text.length).trim()]));
  const applicationMarker = /(?:投递方式|申请方式)\s*[：:]/.exec(text);
  const application = applicationMarker ? text.slice(applicationMarker.index + applicationMarker[0].length).trim() : "";
  const safeUrl = (value: string) => {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; }
  };
  // Only application text (or an explicitly stored source URL) supplies links.
  const emails = [...new Set((application || (!matches.length ? text : "")).match(/[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d.-]+\.[a-z]{2,}/gi) ?? [])];
  const urls = [...new Set((application.match(/https?:\/\/[^\s<>"，。；）]+/gi) ?? []).map(safeUrl).filter((url): url is string => Boolean(url)))];
  const source = candidate.source_url ? safeUrl(candidate.source_url) : null;
  if (!emails.length && !urls.length && source) urls.push(source);
  const company = clean(candidate.company) || "公司待确认";
  let role = clean(candidate.role_title);
  if (role.startsWith(company) && /^[\s·:：—–-]/.test(role.slice(company.length))) role = role.slice(company.length).replace(/^[\s·:：—–-]+/, "");
  const jdMarker = /(?:招聘详情|岗位职责)\s*[：:]/.exec(text);
  // Nested headings inside the JD are content, not import metadata boundaries.
  const explicitJd = jdMarker ? text.slice(jdMarker.index + jdMarker[0].length,
    applicationMarker && applicationMarker.index > jdMarker.index ? applicationMarker.index : text.length).trim() : undefined;
  const jd = explicitJd ?? (matches.length ? text.slice(0, matches[0].index).trim() : text);
  const sourceDate = fields.get("来源发布日期") ?? fields.get("发布日期") ?? fields.get("发布时间");
  return { company, role: role || "岗位待确认", location: clean(candidate.location || fields.get("地点") || "地点待确认"),
    date: sourceDate?.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0] ?? null,
    jd: jd || "暂无 JD，请先核对岗位原文。", emails, urls,
    applicationNote: !emails.length && !urls.length ? application || "投递方式待确认" : null };
}

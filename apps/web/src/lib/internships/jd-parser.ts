export const internshipJdParserVersion = "jd_rules_v2";
export const maxInternshipJdLength = 50_000;

export type InternshipJdExtraction = {
  company: string | null;
  roleTitle: string | null;
  department: string | null;
  location: string | null;
  postedOn: string | null;
  deadline: string | null;
  sourceUrl: string | null;
  responsibilities: string | null;
  requirements: string | null;
  applicationMethod: string | null;
  confidence: number;
  gaps: string[];
  parserVersion: typeof internshipJdParserVersion;
};

const sectionHeadings = {
  responsibilities: /^(?:岗位职责|职位描述|工作职责|工作内容|主要职责|职责|job\s+description|key\s+responsibilit(?:y|ies)|responsibilit(?:y|ies)|what\s+you(?:'|’)ll\s+do|the\s+role)\s*[:：]?\s*(.*)$/iu,
  requirements: /^(?:任职要求|岗位要求|职位要求|招聘要求|申请要求|资格要求|要求|qualifications?\s+required|qualifications?|requirements?|what\s+we(?:'|’)re\s+looking\s+for|who\s+you\s+are)\s*[:：]?\s*(.*)$/iu,
  applicationMethod: /^(?:投递方式|申请方式|如何申请|报名方式|联系方式|application\s+(?:method|process)|how\s+to\s+apply)\s*[:：]?\s*(.*)$/iu
};

const allSectionHeadings = new RegExp(
  [sectionHeadings.responsibilities, sectionHeadings.requirements, sectionHeadings.applicationMethod]
    .map((pattern) => pattern.source.replace(/^\^|\$$/g, ""))
    .join("|"),
  "iu"
);

const pageBoundaryHeading = /^(?:unlock\s+job\s+insights|hirer\s+responsiveness|salary\s+match|number\s+of\s+applicants|employer\s+questions|company\s+profile|about\s+(?:the\s+)?company|similar\s+jobs|report\s+this\s+job)\s*[:：]?$/iu;
const pageNoiseLine = /^(?:view\s+all\s+jobs|sign\s+in\b.*|unlock\s+job\s+insights|hirer\s+responsiveness|salary\s+match|number\s+of\s+applicants)$/iu;

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/giu, (entity, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hex ?? decimal ?? "", hex ? 16 : 10);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/&(amp|apos|gt|lt|nbsp|quot);/giu, (_entity, name: string) => named[name.toLocaleLowerCase("en-US")] ?? _entity);
}

function normalizeText(raw: string) {
  return decodeHtmlEntities(raw)
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function cleanValue(value: string, maxLength = 240) {
  const cleaned = value
    .replace(/\s+logo\s*$/iu, "")
    .replace(/^[\s|·•*#>\-–—]+|[\s|·•*#>]+$/g, "")
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelledValue(lines: string[], labels: string[], maxLength = 240) {
  const pattern = new RegExp(`^(?:${labels.map(escapeRegExp).join("|")})\\s*(?:[:：]|[-–—])\\s*(.+)$`, "iu");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(pattern);
    if (match?.[1]) return cleanValue(match[1], maxLength);
    if (new RegExp(`^(?:${labels.map(escapeRegExp).join("|")})\\s*[:：]?$`, "iu").test(lines[index] ?? "")) {
      const next = lines[index + 1];
      if (next && !allSectionHeadings.test(next)) return cleanValue(next, maxLength);
    }
  }
  return null;
}

function extractSection(lines: string[], heading: RegExp, maxLength: number) {
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return null;
  const inline = lines[start]?.match(heading)?.[1]?.trim();
  const collected = inline ? [inline] : [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (allSectionHeadings.test(line) || pageBoundaryHeading.test(line)) break;
    collected.push(line);
  }
  return cleanValue(collected.join("\n"), maxLength);
}

function inferRole(lines: string[]) {
  const roleSignal = /(?:\bintern(?:ship)?\b|analyst|associate|trainee|off[- ]?cycle|实习生|实习岗位|实习分析|分析师|研究员|管培生|助理)/iu;
  return lines.slice(0, 16)
    .filter((line) => line.length <= 160 && roleSignal.test(line) && !allSectionHeadings.test(line) && !pageNoiseLine.test(line))
    .map((line) => cleanValue(line, 240))
    .find((line): line is string => Boolean(line)) ?? null;
}

function inferCompany(lines: string[], roleTitle: string | null) {
  const suffix = /(?:有限公司|有限责任公司|集团|银行|证券|基金|资本|投资|咨询|科技|事务所|\b(?:limited|ltd\.?|inc\.?|llp|bank|capital|securities|partners|group)\b)/iu;
  const labelled = labelledValue(lines, ["公司", "公司名称", "企业", "机构", "company", "employer", "organization"]);
  if (labelled) return labelled;
  const obvious = lines.slice(0, 12).find((line) => line.length <= 160 && suffix.test(line) && line !== roleTitle && !allSectionHeadings.test(line) && !pageNoiseLine.test(line));
  if (obvious) return cleanValue(obvious, 240);
  const first = cleanValue(lines[0] ?? "", 240);
  const secondHasRole = Boolean(lines[1] && /(?:intern|analyst|实习|分析师|研究员|管培)/iu.test(lines[1]));
  return first && secondHasRole && !/(?:intern|analyst|实习|分析师|研究员|管培)/iu.test(first) ? first : null;
}

function inferDepartment(lines: string[], roleTitle: string | null) {
  const labelled = labelledValue(lines, ["部门", "团队", "业务线", "department", "division", "team"]);
  if (labelled) return labelled;

  if (roleTitle) {
    const fromRole = cleanValue(roleTitle
      .replace(/\b(?:summer|winter|off[- ]?cycle|part[- ]?time|full[- ]?time)\b/giu, " ")
      .replace(/\b(?:internship|intern|analyst|associate|trainee|programme|program|position|role)\b/giu, " ")
      .replace(/(?:实习生?|分析师|助理|管培生)/gu, " ")
      .replace(/\s{2,}/g, " "));
    if (fromRole && /(?:research|banking|markets?|investment|finance|accounting|risk|compliance|operations?|technology|engineering|data|quant|trading|sales|研究|投行|投资|金融|风控|合规|运营|技术|数据|量化|交易)/iu.test(fromRole)) {
      return fromRole;
    }
  }

  const category = lines.slice(0, 20).find((line) => line.length <= 160
    && /(?:analysis|research|banking|financial services|capital markets|investment|finance|risk|compliance|operations|technology|data|quant|trading)/iu.test(line)
    && /\([^\n]{2,100}\)$/u.test(line)
    && !pageNoiseLine.test(line));
  return category ? cleanValue(category) : null;
}

function inferLocation(lines: string[], company: string | null, roleTitle: string | null) {
  const labelled = labelledValue(lines, ["地点", "工作地点", "办公地点", "城市", "location", "office location", "work location"]);
  if (labelled) return labelled;

  const locationShape = /(?:\bdistrict\b|\bkowloon\b|\bnew territories\b|\bhong kong island\b|\bcentral\b|\badmiralty\b|\bwan chai\b|\bcauseway bay\b|\bcyberport\b|\bscience park\b|[省市区县]|香港岛|九龙|新界)/iu;
  const detailed = lines.slice(0, 20).find((line) => line.length <= 160
    && line !== company && line !== roleTitle
    && !/(?:有限公司|有限责任公司|\b(?:limited|ltd\.?|inc\.?)\b)/iu.test(line)
    && !pageNoiseLine.test(line)
    && locationShape.test(line));
  if (detailed) return cleanValue(detailed);

  const cities = ["Hong Kong", "香港", "Singapore", "新加坡", "Shanghai", "上海", "Shenzhen", "深圳", "Beijing", "北京", "Guangzhou", "广州", "New York", "London"];
  for (const line of lines.slice(0, 20)) {
    if (line.length > 120 || line === company || line === roleTitle || pageNoiseLine.test(line)) continue;
    if (/(?:有限公司|有限责任公司|\b(?:limited|ltd\.?|inc\.?)\b)/iu.test(line)) continue;
    const city = cities.find((candidate) => line.toLocaleLowerCase("en-US").includes(candidate.toLocaleLowerCase("en-US")));
    if (city) return cleanValue(line) ?? city;
  }
  return null;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string) {
  let match = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/u)
    ?? value.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/u);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));

  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };
  match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/iu);
  if (match) return validDate(Number(match[3]), months[match[1].toLocaleLowerCase("en-US")] ?? 0, Number(match[2]));
  match = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)[,]?\s+(20\d{2})\b/iu);
  if (match) return validDate(Number(match[3]), months[match[2].toLocaleLowerCase("en-US")] ?? 0, Number(match[1]));
  return null;
}

function formatUtcDate(date: Date) {
  return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function referenceCalendarDate(referenceDate?: string | Date) {
  if (typeof referenceDate === "string") {
    const parsed = parseDate(referenceDate);
    if (parsed) return new Date(`${parsed}T00:00:00.000Z`);
  }
  const date = referenceDate instanceof Date ? referenceDate : new Date();
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function parsePostingDate(value: string, referenceDate?: string | Date) {
  const absolute = parseDate(value);
  if (absolute) return absolute;

  const reference = referenceCalendarDate(referenceDate);
  let daysAgo: number | null = null;
  const dayMatch = value.match(/\b(\d{1,3})\s*d(?:ays?)?\s+ago\b/iu)
    ?? value.match(/(?:发布于?|posted)\s*(\d{1,3})\s*天前/iu);
  const weekMatch = value.match(/\b(\d{1,2})\s*w(?:eeks?)?\s+ago\b/iu);
  if (dayMatch) daysAgo = Number(dayMatch[1]);
  else if (weekMatch) daysAgo = Number(weekMatch[1]) * 7;
  else if (/(?:\byesterday\b|昨天)/iu.test(value)) daysAgo = 1;
  else if (/(?:\btoday\b|just\s+posted|今天|刚刚发布)/iu.test(value)) daysAgo = 0;
  else if (/\b\d{1,2}\s*h(?:ours?)?\s+ago\b/iu.test(value)) daysAgo = 0;

  if (daysAgo === null || daysAgo > 3660) return null;
  reference.setUTCDate(reference.getUTCDate() - daysAgo);
  return formatUtcDate(reference);
}

function inferDeadline(lines: string[]) {
  const labelled = labelledValue(lines, ["截止日期", "申请截止", "投递截止", "报名截止", "deadline", "application deadline"], 120);
  if (labelled) return parseDate(labelled);
  const line = lines.find((candidate) => /(?:截止|deadline|apply by)/iu.test(candidate));
  return line ? parseDate(line) : null;
}

function inferPostingDate(lines: string[], referenceDate?: string | Date) {
  const labelled = labelledValue(lines, ["JD 发布时间", "发布时间", "发布日期", "发布于", "date posted", "posted on"], 120);
  if (labelled) return parsePostingDate(labelled, referenceDate);
  const line = lines.find((candidate) => /^(?:posted|date\s+posted|发布时间|发布日期|发布于)\b/iu.test(candidate));
  return line ? parsePostingDate(line, referenceDate) : null;
}

type InferredWorkMode = "onsite" | "hybrid" | "remote" | "unspecified";

function inferWorkMode(text: string): InferredWorkMode {
  if (/(?:hybrid|混合办公|混合工作)/iu.test(text)) return "hybrid";
  if (/(?:fully\s+remote|remote\s+(?:role|work)|远程办公|远程工作)/iu.test(text)) return "remote";
  if (/(?:on[- ]?site|onsite|线下办公|现场办公|驻场)/iu.test(text)) return "onsite";
  return "unspecified";
}

function includeWorkModeInLocation(location: string | null, mode: InferredWorkMode) {
  if (mode !== "remote" && mode !== "hybrid") return location;
  if (location && /(?:remote|hybrid|远程|混合办公|混合工作)/iu.test(location)) return location;
  const marker = mode === "remote" ? "远程" : "混合办公";
  return location ? `${location} · ${marker}`.slice(0, 240) : marker;
}

function firstHttpsUrl(text: string) {
  const match = text.match(/https:\/\/[^\s<>{}\[\]"']+/iu)?.[0];
  return match ? match.replace(/[),.;，。；）]+$/u, "").slice(0, 2048) : null;
}

export function parseInternshipJd(raw: string, referenceDate?: string | Date): InternshipJdExtraction {
  const text = normalizeText(raw).slice(0, maxInternshipJdLength);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const roleTitle = labelledValue(lines, ["岗位", "岗位名称", "职位", "职位名称", "职务", "role", "position", "job title"]) ?? inferRole(lines);
  const company = inferCompany(lines, roleTitle);
  const department = inferDepartment(lines, roleTitle);
  const location = includeWorkModeInLocation(inferLocation(lines, company, roleTitle), inferWorkMode(text));
  const postedOn = inferPostingDate(lines, referenceDate);
  const deadline = inferDeadline(lines);
  const responsibilities = extractSection(lines, sectionHeadings.responsibilities, 20_000);
  const requirements = extractSection(lines, sectionHeadings.requirements, 20_000);
  const applicationMethod = extractSection(lines, sectionHeadings.applicationMethod, 4_000);
  const sourceUrl = firstHttpsUrl(text);

  const gaps: string[] = [];
  if (!company) gaps.push("公司");
  if (!roleTitle) gaps.push("岗位");
  if (!department) gaps.push("部门");
  if (!location) gaps.push("地点");
  if (!postedOn) gaps.push("发布时间");
  if (!deadline) gaps.push("截止日期");
  if (!requirements) gaps.push("岗位要求");

  const confidence = Math.min(1, Number((
    (company ? 0.22 : 0) + (roleTitle ? 0.22 : 0) + (department ? 0.08 : 0)
    + (location ? 0.1 : 0) + (postedOn ? 0.06 : 0) + (deadline ? 0.08 : 0) + (responsibilities ? 0.1 : 0)
    + (requirements ? 0.1 : 0) + (sourceUrl ? 0.04 : 0)
  ).toFixed(2)));

  return {
    company,
    roleTitle,
    department,
    location,
    postedOn,
    deadline,
    sourceUrl,
    responsibilities,
    requirements,
    applicationMethod,
    confidence,
    gaps,
    parserVersion: internshipJdParserVersion
  };
}

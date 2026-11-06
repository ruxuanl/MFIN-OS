import { createHash } from "node:crypto";

export const GOLDMAN_SACHS_ADAPTER_VERSION = "goldman_sachs_public_programs_v1";
export const GOLDMAN_SACHS_SOURCE_KEY = "goldman-sachs.apac-early-careers";
export const GOLDMAN_SACHS_SOURCE_DOMAIN = "www.goldmansachs.com";

const pageUrls = [
  "https://www.goldmansachs.com/careers/students/programs-and-internships/asia-pacific/off-cycle-internship-program",
  "https://www.goldmansachs.com/careers/students/programs-and-internships/asia-pacific/summer-analyst",
  "https://www.goldmansachs.com/careers/students/programs-and-internships/asia-pacific/new-analyst"
] as const;
const offCycleUrl = pageUrls[0];
const targetDivisions = ["Global Investment Research", "Investment Banking"] as const;
const maxPageBytes = 750_000;

export const GOLDMAN_SACHS_QUERY_FINGERPRINT = createHash("sha256")
  .update(`${GOLDMAN_SACHS_ADAPTER_VERSION}\n${pageUrls.join("\n")}`)
  .digest("hex");

export type GoldmanSachsCandidateItem = {
  itemKey: string;
  track: "internship" | "graduate";
  company: "Goldman Sachs";
  department: string | null;
  roleTitle: string;
  location: string | null;
  deadline: string | null;
  sourceSummary: string;
  sourceUrl: string;
  contentHash: string;
};

export type GoldmanSachsDiscoveryResult = {
  status: "partial";
  items: GoldmanSachsCandidateItem[];
  coverageGap: string;
  cursorValue: string;
  queryFingerprint: string;
  pagesVerified: number;
};

export class GoldmanSachsAdapterError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "GoldmanSachsAdapterError";
    this.code = code;
  }
}

function normalizeText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&rsquo;|&#8217;/gi, "’")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function itemKey(division: string) {
  return `off-cycle-internship-program:${division.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function candidateItem(division: (typeof targetDivisions)[number]) {
  const item = {
    itemKey: itemKey(division),
    track: "internship" as const,
    company: "Goldman Sachs" as const,
    department: division,
    roleTitle: "Off-Cycle Internship Program",
    location: null,
    deadline: null,
    sourceSummary: `Goldman Sachs 亚太官方页面显示 ${division} 的 Off-Cycle Internship 正在开放并滚动审理；项目周期 3–12 个月。具体地点仅在申请入口披露，工作资格与地点需用户确认。非 AI 确定性规则。`,
    sourceUrl: offCycleUrl
  };
  return {
    ...item,
    contentHash: createHash("sha256").update(JSON.stringify(item)).digest("hex")
  };
}

function openTargetDivisions(html: string) {
  const text = normalizeText(html);
  const openPrograms = text.match(
    /Applications for our programs are currently open for (.{1,240}?)\. We review applications/i
  )?.[1] ?? "";
  return targetDivisions.filter((division) => openPrograms.includes(division));
}

export function parseGoldmanSachsPages(pages: ReadonlyMap<string, string>, failedPages: readonly string[] = []) {
  const items = openTargetDivisions(pages.get(offCycleUrl) ?? "").map(candidateItem);
  const pageSnapshots = pageUrls.map((url) => ({
    url,
    contentHash: pages.has(url)
      ? createHash("sha256").update(pages.get(url)!).digest("hex")
      : "unavailable"
  }));
  const gaps = [
    "official_application_portal_robots_disallowed",
    "generic_program_divisions_and_locations_unverified"
  ];
  if (items.length === 0) gaps.push("off_cycle_target_divisions_not_confirmed_open");
  if (failedPages.length > 0) gaps.push(`official_pages_unavailable:${[...failedPages].sort().join(",")}`);

  return {
    status: "partial" as const,
    items,
    coverageGap: gaps.join(";"),
    cursorValue: createHash("sha256").update(JSON.stringify(pageSnapshots)).digest("hex"),
    queryFingerprint: GOLDMAN_SACHS_QUERY_FINGERPRINT,
    pagesVerified: pages.size
  } satisfies GoldmanSachsDiscoveryResult;
}

async function fetchOfficialPage(url: string, fetcher: typeof fetch) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.hostname !== GOLDMAN_SACHS_SOURCE_DOMAIN) {
    throw new GoldmanSachsAdapterError("source_url_not_allowed");
  }
  const response = await fetcher(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "text/html",
      "User-Agent": "HKU-MFin-Personal-System/0.1 (+read-only public careers monitor)"
    }
  });
  if (response.status !== 200) throw new GoldmanSachsAdapterError(`source_http_${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    throw new GoldmanSachsAdapterError("source_content_type_invalid");
  }
  const declaredBytes = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredBytes) && declaredBytes > maxPageBytes) {
    throw new GoldmanSachsAdapterError("source_response_too_large");
  }
  if (!response.body) throw new GoldmanSachsAdapterError("source_body_missing");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxPageBytes) {
      await reader.cancel();
      throw new GoldmanSachsAdapterError("source_response_too_large");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

export async function runGoldmanSachsDiscovery(fetcher: typeof fetch = fetch) {
  const settled = await Promise.allSettled(pageUrls.map((url) => fetchOfficialPage(url, fetcher)));
  const pages = new Map<string, string>();
  const failedPages: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") pages.set(pageUrls[index], result.value);
    else failedPages.push(new URL(pageUrls[index]).pathname.split("/").at(-1) ?? "unknown");
  });
  if (pages.size === 0) throw new GoldmanSachsAdapterError("all_official_pages_unavailable");
  return parseGoldmanSachsPages(pages, failedPages);
}

export function safeGoldmanSachsErrorCode(error: unknown) {
  if (error instanceof GoldmanSachsAdapterError) return error.code;
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("job_discovery_permission_denied")) return "job_discovery_permission_denied";
  if (message.includes("job_source_not_enabled")) return "job_source_not_enabled";
  if (message.includes("goldman_sachs_source_contract_mismatch")) return "source_contract_mismatch";
  return "goldman_sachs_discovery_failed";
}
